import type { WhatsAppProvider } from '../../../shared/whatsapp/whatsapp-provider.interface'
import type { WebhookSubscriptionQuery } from '../../../shared/whatsapp/types/outbound.types'
import type { ConversationService } from './conversation.service'

export class InboundWebhookService {
  constructor(
    private readonly provider: WhatsAppProvider,
    private readonly conversations: ConversationService
  ) {}

  verifySubscription(query: WebhookSubscriptionQuery): string | null {
    return this.provider.verifySubscription({
      mode: query.mode,
      verifyToken: query.verifyToken,
      challenge: query.challenge,
    })
  }

  async handleWebhook(
    rawBody: Buffer,
    headers: Record<string, unknown>,
    body: unknown
  ): Promise<void> {
    const webhookHeaders = headers as Record<string, string | string[] | undefined>

    if (!this.provider.validateWebhookSignature(rawBody, webhookHeaders)) {
      throw new Error('Firma de webhook inválida')
    }

    const events = this.provider.parseInboundPayload(body)
    if (events.length === 0) return

    await this.conversations.processInboundEvents(events, this.provider)
  }
}