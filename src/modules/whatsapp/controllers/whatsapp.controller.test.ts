import { describe, it, expect, vi } from 'vitest'
import { WhatsAppController } from './whatsapp.controller'
import { HttpError } from '../../auth/http-error'
import type { ConversationService } from '../services/conversation.service'
import type { WhatsAppProvider } from '../../../shared/whatsapp/whatsapp-provider.interface'
import type { NormalizedInboundEvent } from '../../../shared/whatsapp/types/inbound.types'

// NOTE: RealtimeController no se unit-testea aquí: hijackea el reply (SSE) y se
// valida por integration tests (Fase 2 / future SSE tests).

function makeProvider(over: Partial<WhatsAppProvider> = {}): WhatsAppProvider {
  return {
    kind: 'meta',
    sendTextMessage: vi.fn(async () => ({ providerMessageId: 'out-1' })),
    sendInteractiveButtons: vi.fn(async () => ({ providerMessageId: 'out-1' })),
    verifySubscription: vi.fn(() => 'CHALLENGE'),
    validateWebhookSignature: vi.fn(() => true),
    parseInboundPayload: vi.fn((): NormalizedInboundEvent[] => []),
    ...over,
  } as WhatsAppProvider
}

function makeConversations(over: Partial<ConversationService> = {}): ConversationService {
  return {
    assertConversationInScope: vi.fn(async () => {}),
    listMessages: vi.fn(async () => []),
    sendTextMessage: vi.fn(async () => ({ providerMessageId: 'out-1', conversationId: 'conv1' })),
    ...over,
  } as unknown as ConversationService
}

type Sent = { status?: number; body?: unknown }

function makeReply(): { reply: unknown; sent: Sent[] } {
  const sent: Sent[] = []
  const reply = {
    status(code: number) {
      const cur = { status: code }
      sent.push(cur)
      return {
        send: (body: unknown) => {
          cur.body = body
          return reply
        },
      }
    },
    send(body: unknown) {
      const cur: Sent = {}
      sent.push(cur)
      cur.body = body
      return reply
    },
    code(c: number) {
      return reply.status(c)
    },
  }
  return { reply, sent }
}

function makeRequest(over: Partial<{
  params: Record<string, string>
  query: Record<string, unknown>
  body: Record<string, unknown>
  permissions: Set<string>
  user: { sub: string }
  log: { error: ReturnType<typeof vi.fn> }
}> = {}): { request: unknown; logError: ReturnType<typeof vi.fn> } {
  const logError = vi.fn()
  const request = {
    params: over.params ?? {},
    query: over.query ?? {},
    body: over.body ?? {},
    permissions: over.permissions ?? new Set<string>(),
    user: over.user ?? { sub: 'user-1' },
    log: { error: logError },
  }
  return { request, logError }
}

describe('WhatsAppController.listMessages', () => {
  it('scope ok, N < limit → 200 con nextCursor null', async () => {
    const items = [
      { id: 'm1', conversationId: 'conv1', direction: 'inbound' as const, providerMessageId: 'p1', type: 'text', bodyText: 'hola', status: 'delivered', sentAt: '2026-01-01T00:00:00.000Z' },
    ]
    const conv = makeConversations({ listMessages: vi.fn(async () => items) })
    const controller = new WhatsAppController(conv, makeProvider())
    const { request } = makeRequest({ params: { id: 'conv1' }, query: { limit: 50 } })
    const { reply, sent } = makeReply()

    await controller.listMessages(request as never, reply as never)

    expect(conv.assertConversationInScope).toHaveBeenCalledWith('conv1', expect.any(Set), 'user-1')
    expect(sent[0].status).toBeUndefined() // reply.send sin status → 200 default
    expect(sent[0].body).toEqual({ items, nextCursor: null })
  })

  it('scope ok, N === limit → 200 con nextCursor = encodeMessageCursor(last.sentAt, last.id)', async () => {
    const items = Array.from({ length: 2 }, (_, i) => ({
      id: `m${i}`,
      conversationId: 'conv1',
      direction: 'inbound' as const,
      providerMessageId: `p${i}`,
      type: 'text',
      bodyText: `msg${i}`,
      status: 'delivered',
      sentAt: '2026-01-01T00:00:00.000Z',
    }))
    const conv = makeConversations({ listMessages: vi.fn(async () => items) })
    const controller = new WhatsAppController(conv, makeProvider())
    const { request } = makeRequest({ params: { id: 'conv1' }, query: { limit: 2 } })
    const { reply, sent } = makeReply()

    await controller.listMessages(request as never, reply as never)

    // nextCursor = encodeMessageCursor(último item sentAt, id)
    const last = items[items.length - 1]
    expect(sent[0].body).toEqual({ items, nextCursor: `${last.sentAt}|${last.id}` })
  })

  it('assertConversationInScope lanza HttpError 404 → reply 404 {error, code}', async () => {
    const conv = makeConversations({
      assertConversationInScope: vi.fn(async () => {
        throw new HttpError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
      }),
    })
    const controller = new WhatsAppController(conv, makeProvider())
    const { request } = makeRequest({ params: { id: 'conv-x' }, query: { limit: 50 } })
    const { reply, sent } = makeReply()

    await controller.listMessages(request as never, reply as never)

    expect(sent[0].status).toBe(404)
    expect(sent[0].body).toEqual({ error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' })
  })
})

describe('WhatsAppController.sendMessage', () => {
  it('falta conversationId → 400 INVALID_RECIPIENT', async () => {
    const conv = makeConversations()
    const controller = new WhatsAppController(conv, makeProvider())
    const { request } = makeRequest({ body: { toWaId: '12345', text: 'hola' } })
    const { reply, sent } = makeReply()

    await controller.sendMessage(request as never, reply as never)

    expect(sent[0].status).toBe(400)
    expect(sent[0].body).toEqual({ error: 'conversationId is required', code: 'INVALID_RECIPIENT' })
    expect(conv.sendTextMessage).not.toHaveBeenCalled()
  })

  it('scope ok → 201 con {providerMessageId, conversationId}; assertConversationInScope llamado con conversationId', async () => {
    const sendTextMessage = vi.fn(async () => ({ providerMessageId: 'wa-msg-9', conversationId: 'conv1' }))
    const conv = makeConversations({ sendTextMessage })
    const controller = new WhatsAppController(conv, makeProvider())
    const { request } = makeRequest({ body: { conversationId: 'conv1', text: 'hola' } })
    const { reply, sent } = makeReply()

    await controller.sendMessage(request as never, reply as never)

    expect(conv.assertConversationInScope).toHaveBeenCalledWith('conv1', expect.any(Set), 'user-1')
    expect(sendTextMessage).toHaveBeenCalledWith(expect.anything(), { conversationId: 'conv1', toWaId: undefined, text: 'hola', actorUserId: 'user-1' })
    expect(sent[0].status).toBe(201)
    expect(sent[0].body).toEqual({ providerMessageId: 'wa-msg-9', conversationId: 'conv1' })
  })

  it('sendTextMessage lanza HttpError 404 → reply 404', async () => {
    const conv = makeConversations({
      sendTextMessage: vi.fn(async () => {
        throw new HttpError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
      }),
    })
    const controller = new WhatsAppController(conv, makeProvider())
    const { request } = makeRequest({ body: { conversationId: 'conv-x', text: 'hola' } })
    const { reply, sent } = makeReply()

    await controller.sendMessage(request as never, reply as never)

    expect(sent[0].status).toBe(404)
    expect(sent[0].body).toEqual({ error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' })
  })

  it('sendTextMessage lanza Error genérico → reply 502 WHATSAPP_SEND_FAILED y log.error llamado', async () => {
    const conv = makeConversations({
      sendTextMessage: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    const controller = new WhatsAppController(conv, makeProvider())
    const { request, logError } = makeRequest({ body: { conversationId: 'conv1', text: 'hola' } })
    const { reply, sent } = makeReply()

    await controller.sendMessage(request as never, reply as never)

    expect(sent[0].status).toBe(502)
    expect(sent[0].body).toEqual({ error: 'Failed to send WhatsApp message', code: 'WHATSAPP_SEND_FAILED' })
    expect(logError).toHaveBeenCalled()
  })
})