import type { WhatsAppSender } from '../../../shared/whatsapp/whatsapp-sender.interface'
import type {
  NormalizedInboundEvent,
  NormalizedMessage,
  NormalizedMessageStatus,
} from '../../../shared/whatsapp/types/inbound.types'
import type { InboundFlowContext } from '../../leads/types/leads.types'
import type {
  WhatsAppContactRepositoryPort,
  WhatsAppConversationRepositoryWidePort,
  WhatsAppMessageRepositoryWidePort,
} from '../../leads/types/leads.types'

export type ConversationServiceDeps = {
  contacts: WhatsAppContactRepositoryPort
  conversations: WhatsAppConversationRepositoryWidePort
  messages: WhatsAppMessageRepositoryWidePort
  flowEngine?: {
    handleInbound(sender: WhatsAppSender, ctx: InboundFlowContext): Promise<void>
  }
}

export class ConversationService {
  constructor(private readonly deps: ConversationServiceDeps) {}

  async processInboundEvents(
    events: NormalizedInboundEvent[],
    provider?: WhatsAppSender
  ): Promise<void> {
    for (const event of events) {
      if (event.kind === 'message') {
        const ctx = await this.handleInboundMessage(event.message)
        if (ctx && provider && this.deps.flowEngine) {
          await this.deps.flowEngine.handleInbound(provider, ctx)
        }
      } else {
        await this.handleStatus(event.status)
      }
    }
  }

  private async handleInboundMessage(
    message: NormalizedMessage
  ): Promise<InboundFlowContext | null> {
    const existing = await this.deps.messages.findByProviderMessageId(
      message.providerMessageId
    )
    if (existing) return null

    const contact = await this.deps.contacts.upsert(message.waId, message.contactName)

    let conversation = await this.deps.conversations.findOpenByContactId(contact.id)
    if (!conversation) {
      conversation = await this.deps.conversations.createOpen(contact.id)
    }

    const type = message.type === 'interactive' ? 'interactive' : message.type

    await this.deps.messages.create({
      conversationId: conversation.id,
      direction: 'inbound',
      providerMessageId: message.providerMessageId,
      type,
      bodyText: message.text ?? null,
      status: 'delivered',
      sentAt: message.timestamp,
      metadata: {
        interactiveReplyId: message.interactiveReplyId,
        interactiveReplyTitle: message.interactiveReplyTitle,
        interactiveType: message.interactiveType,
      },
    })

    await this.deps.conversations.touchLastMessage(conversation.id, message.timestamp, 'inbound')

    return {
      conversationId: conversation.id,
      contactId: contact.id,
      waId: contact.waId,
      message,
    }
  }

  private async handleStatus(status: NormalizedMessageStatus): Promise<void> {
    const existing = await this.deps.messages.findByProviderMessageId(
      status.providerMessageId
    )
    if (!existing) return

    if (status.status === 'failed' && status.errorMessage) {
      await this.deps.messages.updateStatusAndMetadata(
        status.providerMessageId,
        status.status,
        { ...existing.metadata, error: status.errorMessage }
      )
    } else {
      await this.deps.messages.updateStatus(status.providerMessageId, status.status)
    }
  }
}