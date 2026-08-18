import { describe, it, expect, vi } from 'vitest'
import { ConversationService } from './conversation.service'
import type { WhatsAppSender } from '../../../shared/whatsapp/whatsapp-sender.interface'
import type { NormalizedInboundEvent, NormalizedMessage, NormalizedMessageStatus } from '../../../shared/whatsapp/types/inbound.types'
import type {
  ContactData,
  ConversationData,
  MessageData,
  WhatsAppContactRepositoryPort,
  WhatsAppConversationRepositoryWidePort,
  WhatsAppMessageRepositoryWidePort,
} from '../../leads/types/leads.types'

function msg(over: Partial<NormalizedMessage>): NormalizedMessage {
  return { providerMessageId: 'in-1', waId: '12345', timestamp: new Date('2026-01-01T00:00:00Z'), type: 'text', text: 'hola', ...over }
}

function status(over: Partial<NormalizedMessageStatus>): NormalizedMessageStatus {
  return { providerMessageId: 'out-1', status: 'delivered', timestamp: new Date(), ...over }
}

function makeDeps(over: Partial<{
  contacts: WhatsAppContactRepositoryPort
  conversations: WhatsAppConversationRepositoryWidePort
  messages: WhatsAppMessageRepositoryWidePort
  flowEngine: { handleInbound: (s: WhatsAppSender, c: unknown) => Promise<void> }
}> = {}) {
  const contact: ContactData = { id: 'ct1', waId: '12345', profileName: 'Ana' }
  const conv: ConversationData = { id: 'conv1', contactId: 'ct1', status: 'open', leadId: null }
  return {
    contacts: { upsert: vi.fn(async () => contact) },
    conversations: {
      findById: vi.fn(async () => null),
      setLead: vi.fn(async () => {}),
      findOpenByContactId: vi.fn(async () => conv),
      createOpen: vi.fn(async () => conv),
      touchLastMessage: vi.fn(async () => {}),
      clearNeedsReplyByLeadId: vi.fn(async () => true),
    } as WhatsAppConversationRepositoryWidePort,
    messages: {
      create: vi.fn(async () => ({})),
      findByProviderMessageId: vi.fn(async () => null),
      updateStatus: vi.fn(async () => {}),
      updateStatusAndMetadata: vi.fn(async () => {}),
    } as WhatsAppMessageRepositoryWidePort,
    flowEngine: { handleInbound: vi.fn(async () => {}) },
    ...over,
  }
}

describe('ConversationService.processInboundEvents — mensaje', () => {
  it('dedupe: si el mensaje ya existe no persiste ni llama al engine', async () => {
    const deps = makeDeps({ messages: { create: vi.fn(async () => ({})), findByProviderMessageId: vi.fn(async () => ({ id: 'existing', conversationId: 'conv1', direction: 'inbound', providerMessageId: 'in-1', type: 'text', bodyText: 'hola', status: 'delivered', metadata: {}, sentAt: new Date() } as MessageData)), updateStatus: vi.fn(), updateStatusAndMetadata: vi.fn() } as unknown as WhatsAppMessageRepositoryWidePort })
    const svc = new ConversationService(deps)
    const sender = {} as WhatsAppSender
    await svc.processInboundEvents([{ kind: 'message', message: msg({}) }], sender)
    expect(deps.messages.create).not.toHaveBeenCalled()
    expect(deps.flowEngine.handleInbound).not.toHaveBeenCalled()
  })

  it('upsert contacto, encuentra conversación abierta, persiste inbound y despacha al engine con ctx correcto', async () => {
    const deps = makeDeps()
    const svc = new ConversationService(deps)
    const sender = {} as WhatsAppSender
    const message = msg({ providerMessageId: 'm-x', type: 'text', text: 'Hola mi folio es MC-ABCDE', contactName: 'Ana' })
    await svc.processInboundEvents([{ kind: 'message', message }], sender)

    expect(deps.contacts.upsert).toHaveBeenCalledWith('12345', 'Ana')
    expect(deps.conversations.findOpenByContactId).toHaveBeenCalledWith('ct1')
    expect(deps.messages.create).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv1', direction: 'inbound', providerMessageId: 'm-x', type: 'text', bodyText: 'Hola mi folio es MC-ABCDE', status: 'delivered',
    }))
    expect(deps.flowEngine.handleInbound).toHaveBeenCalledWith(sender, expect.objectContaining({ conversationId: 'conv1', contactId: 'ct1', waId: '12345' }))
  })

  it('si no hay conversación abierta, crea una nueva', async () => {
    const deps = makeDeps({ conversations: { findById: vi.fn(async () => null), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => ({ id: 'conv-new', contactId: 'ct1', status: 'open', leadId: null })), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort })
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'message', message: msg({}) }], {} as WhatsAppSender)
    expect(deps.conversations.createOpen).toHaveBeenCalledWith('ct1')
    expect(deps.flowEngine.handleInbound).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ conversationId: 'conv-new' }))
  })

  it('tras persistir inbound, llama touchLastMessage con dirección inbound', async () => {
    const deps = makeDeps()
    const svc = new ConversationService(deps)
    const ts = new Date('2026-01-01T00:00:00Z')
    await svc.processInboundEvents([{ kind: 'message', message: msg({ providerMessageId: 'm-t', timestamp: ts }) }], {} as WhatsAppSender)
    expect(deps.conversations.touchLastMessage).toHaveBeenCalledWith('conv1', ts, 'inbound')
  })

  it('interactive: type se persiste como interactive y guarda replyId/Title en metadata', async () => {
    const deps = makeDeps()
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'message', message: msg({ type: 'interactive', interactiveReplyId: 'comprar', interactiveReplyTitle: 'Quiero comprar', interactiveType: 'button_reply', text: undefined }) }], {} as WhatsAppSender)
    expect(deps.messages.create).toHaveBeenCalledWith(expect.objectContaining({
      type: 'interactive',
      metadata: { interactiveReplyId: 'comprar', interactiveReplyTitle: 'Quiero comprar', interactiveType: 'button_reply' },
    }))
  })

  it('sin provider o sin engine: persiste pero no despacha', async () => {
    const deps = makeDeps()
    deps.flowEngine = undefined
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'message', message: msg({}) }])
    expect(deps.messages.create).toHaveBeenCalled()
  })
})

describe('ConversationService.processInboundEvents — status', () => {
  it('delivered: actualiza status', async () => {
    const deps = makeDeps({ messages: { create: vi.fn(async () => ({})), findByProviderMessageId: vi.fn(async () => ({ id: 'm', conversationId: 'c', direction: 'outbound', providerMessageId: 'out-1', type: 'text', bodyText: 'x', status: 'pending', metadata: {}, sentAt: new Date() } as MessageData)), updateStatus: vi.fn(async () => {}), updateStatusAndMetadata: vi.fn(async () => {}) } as unknown as WhatsAppMessageRepositoryWidePort })
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'status', status: status({ status: 'delivered' }) }], {} as WhatsAppSender)
    expect(deps.messages.updateStatus).toHaveBeenCalledWith('out-1', 'delivered')
    expect(deps.messages.updateStatusAndMetadata).not.toHaveBeenCalled()
  })

  it('failed con errorMessage: actualiza status y metadata con error', async () => {
    const existing: MessageData = { id: 'm', conversationId: 'c', direction: 'outbound', providerMessageId: 'out-1', type: 'text', bodyText: 'x', status: 'sent', metadata: { nodeId: 'welcome' }, sentAt: new Date() }
    const deps = makeDeps({ messages: { create: vi.fn(async () => ({})), findByProviderMessageId: vi.fn(async () => existing), updateStatus: vi.fn(async () => {}), updateStatusAndMetadata: vi.fn(async () => {}) } as unknown as WhatsAppMessageRepositoryWidePort })
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'status', status: status({ status: 'failed', errorMessage: 'user blocked' }) }], {} as WhatsAppSender)
    expect(deps.messages.updateStatusAndMetadata).toHaveBeenCalledWith('out-1', 'failed', { nodeId: 'welcome', error: 'user blocked' })
  })

  it('status para mensaje inexistente: no hace nada', async () => {
    const deps = makeDeps({ messages: { create: vi.fn(async () => ({})), findByProviderMessageId: vi.fn(async () => null), updateStatus: vi.fn(async () => {}), updateStatusAndMetadata: vi.fn(async () => {}) } as unknown as WhatsAppMessageRepositoryWidePort })
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'status', status: status({}) }], {} as WhatsAppSender)
    expect(deps.messages.updateStatus).not.toHaveBeenCalled()
  })
})