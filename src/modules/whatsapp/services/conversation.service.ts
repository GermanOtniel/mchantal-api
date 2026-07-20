import type { WhatsAppProvider } from '../../../shared/whatsapp/whatsapp-provider.interface'
import type {
  NormalizedInboundEvent,
  NormalizedMessage,
  NormalizedMessageStatus,
} from '../../../shared/whatsapp/types/inbound.types'
import type { LeadFlowEngine } from '../../leads/services/lead-flow.engine'
import type { WhatsAppMessage } from '../../../entities/whatsapp/whatsapp-message.entity'
import { HttpError } from '../../auth/http-error'
import type { RealtimeBus } from '../realtime/realtime-bus'
import type { MessageRealtimePayload } from '../realtime/types'
import { WhatsAppContactRepository } from '../repositories/whatsapp-contact.repository'
import { WhatsAppConversationReadStateRepository } from '../repositories/whatsapp-conversation-read-state.repository'
import { WhatsAppConversationRepository } from '../repositories/whatsapp-conversation.repository'
import { WhatsAppMessageRepository } from '../repositories/whatsapp-message.repository'

function toMessagePayload(message: WhatsAppMessage): MessageRealtimePayload {
  return {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    providerMessageId: message.providerMessageId,
    type: message.type,
    bodyText: message.bodyText,
    status: message.status,
    sentAt: message.sentAt.toISOString(),
  }
}

export class ConversationService {
  private readonly contacts = new WhatsAppContactRepository()
  private readonly conversations = new WhatsAppConversationRepository()
  private readonly messages = new WhatsAppMessageRepository()
  private readonly readStates = new WhatsAppConversationReadStateRepository()

  constructor(
    private readonly realtimeBus?: RealtimeBus,
    private readonly leadFlowEngine?: LeadFlowEngine
  ) {}

  async processInboundEvents(
    events: NormalizedInboundEvent[],
    provider?: WhatsAppProvider
  ): Promise<void> {
    for (const event of events) {
      if (event.kind === 'message') {
        const ctx = await this.handleInboundMessage(event.message)
        if (ctx && provider && this.leadFlowEngine) {
          await this.leadFlowEngine.handleInbound(provider, {
            conversationId: ctx.conversationId,
            contactId: ctx.contactId,
            waId: ctx.waId,
            message: event.message,
          })
        }
      } else {
        await this.handleOutboundStatus(event.status)
      }
    }
  }

  private publishConversationUpdated(
    conversationId: string,
    lastMessageAt: Date,
    lastMessageDirection: 'inbound' | 'outbound'
  ): void {
    this.realtimeBus?.publish({
      type: 'conversation.updated',
      payload: {
        conversationId,
        lastMessageAt: lastMessageAt.toISOString(),
        lastMessageDirection,
        needsReply: lastMessageDirection === 'inbound',
      },
    })
  }

  private async handleInboundMessage(message: NormalizedMessage): Promise<{
    conversationId: string
    contactId: string
    waId: string
  } | null> {
    const existing = await this.messages.findByProviderMessageId(
      message.providerMessageId
    )
    if (existing) return null

    const contact = await this.contacts.upsert(
      message.waId,
      message.contactName
    )

    let conversation = await this.conversations.findOpenByContactId(contact.id)
    if (!conversation) {
      conversation = await this.conversations.createOpen(contact.id)
    }

    const messageType =
      message.type === 'interactive' ? 'interactive' : message.type

    const savedMessage = await this.messages.create({
      conversationId: conversation.id,
      direction: 'inbound',
      providerMessageId: message.providerMessageId,
      type: messageType,
      bodyText: message.text ?? null,
      metadata: {
        interactiveReplyId: message.interactiveReplyId,
        interactiveReplyTitle: message.interactiveReplyTitle,
        interactiveType: message.interactiveType,
      },
      status: 'delivered',
      sentAt: message.timestamp,
    })

    await this.conversations.touchLastMessage(
      conversation.id,
      message.timestamp,
      'inbound'
    )

    this.realtimeBus?.publish({
      type: 'message.created',
      payload: {
        conversationId: conversation.id,
        message: toMessagePayload(savedMessage),
      },
    })
    this.publishConversationUpdated(
      conversation.id,
      message.timestamp,
      'inbound'
    )

    return {
      conversationId: conversation.id,
      contactId: contact.id,
      waId: contact.waId,
    }
  }

  private async handleOutboundStatus(
    status: NormalizedMessageStatus
  ): Promise<void> {
    const existing = await this.messages.findByProviderMessageId(
      status.providerMessageId
    )

    if (!existing) return

    await this.messages.updateStatus(
      status.providerMessageId,
      status.status
    )

    this.realtimeBus?.publish({
      type: 'message.status_updated',
      payload: {
        conversationId: existing.conversationId,
        providerMessageId: status.providerMessageId,
        status: status.status,
      },
    })
  }

  async listConversations(
    limit: number,
    cursor: string | undefined,
    viewerUserId: string,
    assigneeUserId?: string
  ) {
    const rows = await this.conversations.listPaginatedForViewer(
      limit,
      viewerUserId,
      cursor,
      assigneeUserId
    )

    return rows.map((c) => ({
      id: c.id,
      status: c.status,
      leadId: c.leadId,
      assigneeUserId: c.assigneeUserId,
      assigneeName: c.assignee?.fullName ?? null,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      lastMessageDirection: c.lastMessageDirection,
      needsReply: c.lastMessageDirection === 'inbound',
      unreadCount: c.unreadCount,
      contact: {
        waId: c.contact.waId,
        profileName: c.contact.profileName,
      },
      createdAt: c.createdAt.toISOString(),
    }))
  }

  async markConversationRead(conversationId: string, viewerUserId: string) {
    const conversation = await this.conversations.findById(conversationId)
    if (!conversation) {
      throw new HttpError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
    }

    await this.readStates.upsertLastReadAt(
      conversationId,
      viewerUserId,
      new Date()
    )

    this.realtimeBus?.publish({
      type: 'conversation.read',
      payload: { conversationId, userId: viewerUserId },
    })

    return { unreadCount: 0 }
  }

  async listMessages(conversationId: string, limit: number, cursor?: string) {
    const conversation = await this.conversations.findById(conversationId)
    if (!conversation) {
      throw new HttpError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
    }

    const rows = await this.messages.listByConversation(
      conversationId,
      limit,
      cursor
    )

    return rows.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      providerMessageId: m.providerMessageId,
      type: m.type,
      bodyText: m.bodyText,
      status: m.status,
      sentAt: m.sentAt.toISOString(),
    }))
  }

  async sendTextMessage(
    provider: WhatsAppProvider,
    input: {
      conversationId?: string
      toWaId?: string
      text: string
    }
  ) {
    let conversation =
      input.conversationId != null
        ? await this.conversations.findById(input.conversationId)
        : null

    if (input.conversationId && !conversation) {
      throw new HttpError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
    }

    const toWaId =
      conversation?.contact.waId ?? input.toWaId?.replace(/\D/g, '')

    if (!toWaId) {
      throw new HttpError(
        'Provide conversationId or toWaId',
        400,
        'INVALID_RECIPIENT'
      )
    }

    if (!conversation) {
      const contact = await this.contacts.upsert(toWaId)
      conversation =
        (await this.conversations.findOpenByContactId(contact.id)) ??
        (await this.conversations.createOpen(contact.id))
      conversation = (await this.conversations.findById(conversation.id))!
    }

    const result = await provider.sendTextMessage({
      toWaId: conversation.contact.waId,
      text: input.text,
    })

    const sentAt = new Date()

    const savedMessage = await this.messages.create({
      conversationId: conversation.id,
      direction: 'outbound',
      providerMessageId: result.providerMessageId,
      type: 'text',
      bodyText: input.text,
      status: 'pending',
      sentAt,
    })

    await this.conversations.touchLastMessage(
      conversation.id,
      sentAt,
      'outbound'
    )

    this.realtimeBus?.publish({
      type: 'message.created',
      payload: {
        conversationId: conversation.id,
        message: toMessagePayload(savedMessage),
      },
    })
    this.publishConversationUpdated(conversation.id, sentAt, 'outbound')

    return {
      providerMessageId: result.providerMessageId,
      conversationId: conversation.id,
      message: toMessagePayload(savedMessage),
    }
  }
}
