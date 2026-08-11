import type { NormalizedInboundEvent } from './types/inbound.types'
import type {
  SendInteractiveButtonsInput,
  SendInteractiveButtonsResult,
  SendTextMessageInput,
  SendTextMessageResult,
  WebhookSubscriptionQuery,
} from './types/outbound.types'
import type { WhatsAppSender } from './whatsapp-sender.interface'

export type WhatsAppProviderKind = 'meta' | 'mock'

export type WebhookHeaders = Record<string, string | string[] | undefined>

/**
 * Provider completo: envío (WhatsAppSender) + webhook (verificar suscripción,
 * validar firma, parsear inbound). Lo implementa MetaWhatsAppProvider (step 3).
 */
export interface WhatsAppProvider extends WhatsAppSender {
  readonly kind: WhatsAppProviderKind
  verifySubscription(query: WebhookSubscriptionQuery): string | null
  validateWebhookSignature(rawBody: Buffer, headers: WebhookHeaders): boolean
  parseInboundPayload(body: unknown): NormalizedInboundEvent[]
}