import { describe, it, expect, vi } from 'vitest'
import { InboundWebhookService } from './inbound-webhook.service'
import type { WhatsAppProvider } from '../../../shared/whatsapp/whatsapp-provider.interface'
import type { NormalizedInboundEvent } from '../../../shared/whatsapp/types/inbound.types'
import type { ConversationService } from './conversation.service'

function makeProvider(over: Partial<WhatsAppProvider> = {}): WhatsAppProvider {
  return {
    kind: 'meta',
    sendTextMessage: vi.fn(async () => ({ providerMessageId: 'out-1' })),
    sendInteractiveButtons: vi.fn(async () => ({ providerMessageId: 'out-1' })),
    verifySubscription: vi.fn(() => 'CHALLENGE'),
    validateWebhookSignature: vi.fn(() => true),
    parseInboundPayload: vi.fn((): NormalizedInboundEvent[] => [{ kind: 'message', message: {} as never }]),
    ...over,
  } as WhatsAppProvider
}

function makeConversations(): { svc: ConversationService; processInboundEvents: ReturnType<typeof vi.fn> } {
  const processInboundEvents = vi.fn(async () => {})
  return { svc: { processInboundEvents } as unknown as ConversationService, processInboundEvents }
}

describe('InboundWebhookService.verifySubscription', () => {
  it('delega al provider y devuelve el challenge', () => {
    const provider = makeProvider({ verifySubscription: vi.fn(() => 'abc') })
    const { svc } = makeConversations()
    const wh = new InboundWebhookService(provider, svc)
    expect(wh.verifySubscription({ mode: 'subscribe', verifyToken: 't', challenge: 'abc' })).toBe('abc')
    expect(provider.verifySubscription).toHaveBeenCalledWith({ mode: 'subscribe', verifyToken: 't', challenge: 'abc' })
  })
})

describe('InboundWebhookService.handleWebhook', () => {
  it('firma inválida: lanza y no despacha', async () => {
    const provider = makeProvider({ validateWebhookSignature: vi.fn(() => false) })
    const { svc, processInboundEvents } = makeConversations()
    const wh = new InboundWebhookService(provider, svc)
    await expect(wh.handleWebhook(Buffer.from('x'), {}, {})).rejects.toThrow(/firma/i)
    expect(processInboundEvents).not.toHaveBeenCalled()
  })

  it('firma válida + eventos: parsea y despacha processInboundEvents con (events, provider)', async () => {
    const events: NormalizedInboundEvent[] = [{ kind: 'message', message: {} as never }]
    const provider = makeProvider({ parseInboundPayload: vi.fn(() => events) })
    const { svc, processInboundEvents } = makeConversations()
    const wh = new InboundWebhookService(provider, svc)
    await wh.handleWebhook(Buffer.from('body'), { 'x-hub-signature-256': 'sha256=abc' }, { raw: 'body' })
    expect(provider.validateWebhookSignature).toHaveBeenCalled()
    expect(provider.parseInboundPayload).toHaveBeenCalledWith({ raw: 'body' })
    expect(processInboundEvents).toHaveBeenCalledWith(events, provider)
  })

  it('firma válida sin eventos: no despacha', async () => {
    const provider = makeProvider({ parseInboundPayload: vi.fn(() => []) })
    const { svc, processInboundEvents } = makeConversations()
    const wh = new InboundWebhookService(provider, svc)
    await wh.handleWebhook(Buffer.from('body'), {}, {})
    expect(processInboundEvents).not.toHaveBeenCalled()
  })
})