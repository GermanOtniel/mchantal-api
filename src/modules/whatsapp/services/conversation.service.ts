import type {
  NormalizedInboundEvent,
  NormalizedMessage,
  NormalizedMessageStatus,
} from '../../../shared/whatsapp/types/inbound.types'
import type { WhatsAppProvider } from '../../../shared/whatsapp/whatsapp-provider.interface'
import { HttpError } from '../../auth/http-error'
import { WhatsAppContactRepository } from '../repositories/whatsapp-contact.repository'
import { WhatsAppConversationRepository } from '../repositories/whatsapp-conversation.repository'
import { WhatsAppMessageRepository } from '../repositories/whatsapp-message.repository'

export class ConversationService {
  private readonly contacts = new WhatsAppContactRepository()
  private readonly conversations = new WhatsAppConversationRepository()
  private readonly messages = new WhatsAppMessageRepository()

  async processInboundEvents(events: NormalizedInboundEvent[]): Promise<void> {
    for (const event of events) {
      if (event.kind === 'message') {
        await this.handleInboundMessage(event.message)
      } else {
        await this.handleOutboundStatus(event.status)
      }
    }
  }

  private async handleInboundMessage(message: NormalizedMessage): Promise<void> {
    const existing = await this.messages.findByProviderMessageId(
      message.providerMessageId
    )
    if (existing) return

    const contact = await this.contacts.upsert(
      message.waId,
      message.contactName
    )

    let conversation = await this.conversations.findOpenByContactId(contact.id)
    if (!conversation) {
      conversation = await this.conversations.createOpen(contact.id)
    }

    await this.messages.create({
      conversationId: conversation.id,
      direction: 'inbound',
      providerMessageId: message.providerMessageId,
      type: message.type,
      bodyText: message.text ?? null,
      status: 'delivered',
      sentAt: message.timestamp,
    })

    await this.conversations.touchLastMessageAt(
      conversation.id,
      message.timestamp
    )
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
  }

  async listConversations(limit: number, cursor?: string) {
    const rows = await this.conversations.listPaginated(limit, cursor)
    return rows.map((c) => ({
      id: c.id,
      status: c.status,
      leadId: c.leadId,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      contact: {
        waId: c.contact.waId,
        profileName: c.contact.profileName,
      },
      createdAt: c.createdAt.toISOString(),
    }))
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

    await this.messages.create({
      conversationId: conversation.id,
      direction: 'outbound',
      providerMessageId: result.providerMessageId,
      type: 'text',
      bodyText: input.text,
      status: 'pending',
      sentAt,
    })

    await this.conversations.touchLastMessageAt(conversation.id, sentAt)

    return {
      providerMessageId: result.providerMessageId,
      conversationId: conversation.id,
    }
  }
}
