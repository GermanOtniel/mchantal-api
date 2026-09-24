import type { NormalizedInboundEvent, DownloadMediaResult } from './types/inbound.types'
import type {
  SendInteractiveButtonsInput,
  SendInteractiveButtonsResult,
  SendMediaMessageInput,
  SendMediaMessageResult,
  SendTextMessageInput,
  SendTextMessageResult,
  UploadMediaInput,
  UploadMediaResult,
  WebhookSubscriptionQuery,
} from './types/outbound.types'
import type { WhatsAppSender } from './whatsapp-sender.interface'

export type WhatsAppProviderKind = 'meta' | 'mock'

export type WebhookHeaders = Record<string, string | string[] | undefined>

/**
 * Provider completo: envío (WhatsAppSender) + webhook (verificar suscripción,
 * validar firma, parsear inbound) + gestión de media (upload/download).
 * Lo implementa MetaWhatsAppProvider.
 */
export interface WhatsAppProvider extends WhatsAppSender {
  readonly kind: WhatsAppProviderKind
  verifySubscription(query: WebhookSubscriptionQuery): string | null
  validateWebhookSignature(rawBody: Buffer, headers: WebhookHeaders): boolean
  parseInboundPayload(body: unknown): NormalizedInboundEvent[]
  uploadMedia(input: UploadMediaInput): Promise<UploadMediaResult>
  downloadMedia(mediaId: string): Promise<DownloadMediaResult>
}