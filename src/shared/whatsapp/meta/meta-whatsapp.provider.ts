import { createHmac, timingSafeEqual } from 'crypto'
import type { AppEnv } from '../../../config/env'
import type { NormalizedInboundEvent } from '../types/inbound.types'
import type {
  SendInteractiveButtonsInput,
  SendInteractiveButtonsResult,
  SendTextMessageInput,
  SendTextMessageResult,
  WebhookSubscriptionQuery,
} from '../types/outbound.types'
import type { WebhookHeaders, WhatsAppProvider } from '../whatsapp-provider.interface'
import { parseMetaInboundPayload } from './meta-webhook.parser'

const GRAPH_API_VERSION = 'v21.0'

export type WhatsAppEnv = AppEnv['whatsapp']

export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly kind = 'meta' as const

  constructor(private readonly env: WhatsAppEnv) {}

  verifySubscription(query: WebhookSubscriptionQuery): string | null {
    if (query.mode !== 'subscribe') return null
    if (query.verifyToken !== this.env.verifyToken) return null
    return query.challenge ?? null
  }

  validateWebhookSignature(rawBody: Buffer, headers: WebhookHeaders): boolean {
    const signature = headers['x-hub-signature-256']
    if (typeof signature !== 'string' || !signature.startsWith('sha256=')) return false

    const expected = createHmac('sha256', this.env.meta.appSecret).update(rawBody).digest('hex')
    const received = signature.slice('sha256='.length)
    try {
      return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
    } catch {
      return false
    }
  }

  parseInboundPayload(body: unknown): NormalizedInboundEvent[] {
    return parseMetaInboundPayload(body)
  }

  async sendTextMessage(input: SendTextMessageInput): Promise<SendTextMessageResult> {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${this.env.meta.phoneNumberId}/messages`
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.toWaId,
      type: 'text',
      text: { body: input.text },
    }
    if (input.replyToProviderMessageId) {
      payload.context = { message_id: input.replyToProviderMessageId }
    }
    return this.sendMessage(url, payload)
  }

  async sendInteractiveButtons(
    input: SendInteractiveButtonsInput
  ): Promise<SendInteractiveButtonsResult> {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${this.env.meta.phoneNumberId}/messages`
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.toWaId,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: input.body },
        action: {
          buttons: input.buttons.slice(0, 3).map((button) => ({
            type: 'reply',
            reply: { id: button.id, title: button.title.slice(0, 20) },
          })),
        },
      },
    }
    return this.sendMessage(url, payload)
  }

  private async sendMessage(url: string, payload: Record<string, unknown>): Promise<{ providerMessageId: string }> {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.meta.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Meta WhatsApp API error (${res.status}): ${errText}`)
    }
    const data = (await res.json()) as { messages?: Array<{ id?: string }> }
    const providerMessageId = data.messages?.[0]?.id
    if (!providerMessageId) throw new Error('Meta WhatsApp API did not return a message id')
    return { providerMessageId }
  }
}