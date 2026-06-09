import type { NormalizedInboundEvent } from './types/inbound.types'
import type {
  SendTextMessageInput,
  SendTextMessageResult,
  WebhookSubscriptionQuery,
} from './types/outbound.types'

export type WhatsAppProviderKind = 'meta' | 'dialog360'

export type WebhookHeaders = Record<string, string | string[] | undefined>

export interface WhatsAppProvider {
  readonly kind: WhatsAppProviderKind

  verifySubscription(query: WebhookSubscriptionQuery): string | null

  validateWebhookSignature(rawBody: Buffer, headers: WebhookHeaders): boolean

  parseInboundPayload(body: unknown): NormalizedInboundEvent[]

  sendTextMessage(input: SendTextMessageInput): Promise<SendTextMessageResult>
}
