import { describe, it, expect, vi } from 'vitest'
import { ConversationService } from './conversation.service'
import { HttpError } from '../../auth/http-error'
import type { WhatsAppProvider } from '../../../shared/whatsapp/whatsapp-provider.interface'
import type { WhatsAppSender } from '../../../shared/whatsapp/whatsapp-sender.interface'
import type { NormalizedInboundEvent, NormalizedMessage, NormalizedMessageStatus } from '../../../shared/whatsapp/types/inbound.types'
import type {
  CampaignLeadRepositoryPort,
  ContactData,
  ConversationData,
  LeadEventsRepositoryPort,
  LeadFlowStateData,
  LeadFlowStateRepositoryPort,
  MessageData,
  WhatsAppContactRepositoryPort,
  WhatsAppConversationRepositoryWidePort,
  WhatsAppMessageRepositoryWidePort,
} from '../../leads/types/leads.types'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import type { RealtimeBus } from '../realtime/realtime-bus'
import type { WhatsAppRealtimeEvent } from '../realtime/types'

function msg(over: Partial<NormalizedMessage>): NormalizedMessage {
  return { providerMessageId: 'in-1', waId: '12345', timestamp: new Date('2026-01-01T00:00:00Z'), type: 'text', text: 'hola', ...over }
}

function status(over: Partial<NormalizedMessageStatus>): NormalizedMessageStatus {
  return { providerMessageId: 'out-1', status: 'delivered', timestamp: new Date(), ...over }
}

function makeRealtimeBus(): RealtimeBus & { published: WhatsAppRealtimeEvent[] } {
  const published: WhatsAppRealtimeEvent[] = []
  return {
    published,
    publish: vi.fn((e: WhatsAppRealtimeEvent) => { published.push(e) }),
    subscribe: vi.fn(() => () => {}),
    close: vi.fn(async () => {}),
  } as unknown as RealtimeBus & { published: WhatsAppRealtimeEvent[] }
}

function makeDeps(over: Partial<{
  contacts: WhatsAppContactRepositoryPort
  conversations: WhatsAppConversationRepositoryWidePort
  messages: WhatsAppMessageRepositoryWidePort
  campaignLeads: CampaignLeadRepositoryPort
  flowStates: LeadFlowStateRepositoryPort
  leadEvents: LeadEventsRepositoryPort
  flowEngine: { handleInbound: (s: WhatsAppSender, c: unknown) => Promise<void> }
  realtimeBus: RealtimeBus
}> = {}) {
  const contact: ContactData = { id: 'ct1', waId: '12345', profileName: 'Ana' }
  const conv: ConversationData = { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: null, lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
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
      create: vi.fn(async () => ({ id: 'in-m', conversationId: 'conv1', direction: 'inbound', providerMessageId: 'in-1', type: 'text', bodyText: 'hola', status: 'delivered', metadata: {}, sentAt: new Date('2026-01-01T00:00:00Z') } as MessageData)),
      findByProviderMessageId: vi.fn(async () => null),
      updateStatus: vi.fn(async () => {}),
      updateStatusAndMetadata: vi.fn(async () => {}),
      listByConversation: vi.fn(async () => [] as MessageData[]),
      countInboundByConversation: vi.fn(async () => 0),
    } as WhatsAppMessageRepositoryWidePort,
    campaignLeads: { findById: vi.fn(async () => null), existsByContactIdAndAssignee: vi.fn(async () => false) } as CampaignLeadRepositoryPort,
    flowStates: { findByCampaignLeadId: vi.fn(async () => null), save: vi.fn(async (s: LeadFlowStateData) => s) } as LeadFlowStateRepositoryPort,
    leadEvents: { record: vi.fn(async (d: unknown) => d) } as LeadEventsRepositoryPort,
    flowEngine: { handleInbound: vi.fn(async () => {}) },
    realtimeBus: makeRealtimeBus(),
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
    const deps = makeDeps({ conversations: { findById: vi.fn(async () => null), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => ({ id: 'conv-new', contactId: 'ct1', contactWaId: '', status: 'open', leadId: null, lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null })), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort })
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

  it('publica message.status_updated con {conversationId, providerMessageId, status} tras actualizar el status', async () => {
    const existing: MessageData = { id: 'm', conversationId: 'conv-9', direction: 'outbound', providerMessageId: 'out-1', type: 'text', bodyText: 'x', status: 'sent', metadata: {}, sentAt: new Date() }
    const deps = makeDeps({ messages: { create: vi.fn(async () => ({})), findByProviderMessageId: vi.fn(async () => existing), updateStatus: vi.fn(async () => {}), updateStatusAndMetadata: vi.fn(async () => {}) } as unknown as WhatsAppMessageRepositoryWidePort })
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'status', status: status({ providerMessageId: 'out-1', status: 'delivered' }) }], {} as WhatsAppSender)
    expect(deps.messages.updateStatus).toHaveBeenCalledWith('out-1', 'delivered')
    const bus = deps.realtimeBus as unknown as { published: WhatsAppRealtimeEvent[] }
    expect(bus.published).toContainEqual({ type: 'message.status_updated', payload: { conversationId: 'conv-9', providerMessageId: 'out-1', status: 'delivered' } })
  })

  it('failed con errorMessage: publica status_updated con status failed tras updateStatusAndMetadata', async () => {
    const existing: MessageData = { id: 'm', conversationId: 'conv-9', direction: 'outbound', providerMessageId: 'out-1', type: 'text', bodyText: 'x', status: 'sent', metadata: {}, sentAt: new Date() }
    const deps = makeDeps({ messages: { create: vi.fn(async () => ({})), findByProviderMessageId: vi.fn(async () => existing), updateStatus: vi.fn(async () => {}), updateStatusAndMetadata: vi.fn(async () => {}) } as unknown as WhatsAppMessageRepositoryWidePort })
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'status', status: status({ providerMessageId: 'out-1', status: 'failed', errorMessage: 'blocked' }) }], {} as WhatsAppSender)
    expect(deps.messages.updateStatusAndMetadata).toHaveBeenCalledWith('out-1', 'failed', { error: 'blocked' })
    const bus = deps.realtimeBus as unknown as { published: WhatsAppRealtimeEvent[] }
    expect(bus.published).toContainEqual({ type: 'message.status_updated', payload: { conversationId: 'conv-9', providerMessageId: 'out-1', status: 'failed' } })
  })

  it('status para mensaje inexistente: no publica realtime', async () => {
    const deps = makeDeps({ messages: { create: vi.fn(async () => ({})), findByProviderMessageId: vi.fn(async () => null), updateStatus: vi.fn(async () => {}), updateStatusAndMetadata: vi.fn(async () => {}) } as unknown as WhatsAppMessageRepositoryWidePort })
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'status', status: status({ providerMessageId: 'unknown', status: 'delivered' }) }], {} as WhatsAppSender)
    const bus = deps.realtimeBus as unknown as { published: WhatsAppRealtimeEvent[] }
    expect(bus.published.filter((e) => e.type === 'message.status_updated')).toEqual([])
  })
})

describe('ConversationService.sendTextMessage', () => {
  function makeProvider(providerMessageId = 'wa-out-1'): WhatsAppProvider {
    return {
      sendTextMessage: vi.fn(async () => ({ providerMessageId })),
      sendInteractiveButtons: vi.fn(async () => ({ providerMessageId })),
    } as unknown as WhatsAppProvider
  }

  it('con conversationId existente: envía, persiste outbound pending, toca lastMessage y publica realtime', async () => {
    const conv: ConversationData = { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: null, lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const saved: MessageData = { id: 'm1', conversationId: 'conv1', direction: 'outbound', providerMessageId: 'wa-out-1', type: 'text', bodyText: 'hola', status: 'pending', metadata: {}, sentAt: new Date('2026-01-01T00:00:00Z') }
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => conv), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => conv), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort,
      messages: { create: vi.fn(async () => saved), findByProviderMessageId: vi.fn(async () => null), updateStatus: vi.fn(async () => {}), updateStatusAndMetadata: vi.fn(async () => {}), listByConversation: vi.fn(async () => []), countInboundByConversation: vi.fn(async () => 0) } as unknown as WhatsAppMessageRepositoryWidePort,
    })
    const svc = new ConversationService(deps)
    const provider = makeProvider()
    const res = await svc.sendTextMessage(provider, { conversationId: 'conv1', text: 'hola' })

    expect(res).toEqual({ providerMessageId: 'wa-out-1', conversationId: 'conv1' })
    expect('message' in res).toBe(false)
    expect(provider.sendTextMessage).toHaveBeenCalledWith({ toWaId: '12345', text: 'hola' })
    expect(deps.messages.create).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv1', direction: 'outbound', providerMessageId: 'wa-out-1', type: 'text', bodyText: 'hola', status: 'pending', metadata: {} }))
    expect(deps.conversations.touchLastMessage).toHaveBeenCalledWith('conv1', expect.any(Date), 'outbound')
    const bus = deps.realtimeBus as unknown as { published: WhatsAppRealtimeEvent[] }
    expect(bus.published).toContainEqual({ type: 'message.created', payload: { conversationId: 'conv1', message: expect.objectContaining({ id: 'm1', direction: 'outbound', sentAt: saved.sentAt.toISOString() }) } })
    expect(bus.published).toContainEqual({ type: 'conversation.updated', payload: { conversationId: 'conv1', lastMessageAt: expect.any(String), lastMessageDirection: 'outbound', needsReply: false } })
  })

  it('con conversationId inexistente → HttpError 404 CONVERSATION_NOT_FOUND', async () => {
    const deps = makeDeps()
    const svc = new ConversationService(deps)
    await expect(svc.sendTextMessage(makeProvider(), { conversationId: 'missing', text: 'x' })).rejects.toMatchObject({ statusCode: 404, code: 'CONVERSATION_NOT_FOUND' })
  })

  it('sin conversationId ni toWaId → HttpError 400 INVALID_RECIPIENT', async () => {
    const deps = makeDeps()
    const svc = new ConversationService(deps)
    await expect(svc.sendTextMessage(makeProvider(), { text: 'x' })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_RECIPIENT' })
  })

  it('solo toWaId (con conversación abierta existente): upsert contacto con waId sin dígitos, reutiliza conversación, refetch por findById, envía con contactWaId refetched, publica realtime', async () => {
    const existingConv: ConversationData = { id: 'conv-by-contact', contactId: 'ct-toWaId', contactWaId: '5215512345678', status: 'open', leadId: null, lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const refetchedConv: ConversationData = { id: 'conv-by-contact', contactId: 'ct-toWaId', contactWaId: '5215512345678', status: 'open', leadId: null, lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const saved: MessageData = { id: 'm-out', conversationId: 'conv-by-contact', direction: 'outbound', providerMessageId: 'wa-out-1', type: 'text', bodyText: 'hola', status: 'pending', metadata: {}, sentAt: new Date('2026-01-01T00:00:00Z') }
    const contacts = { upsert: vi.fn(async () => ({ id: 'ct-toWaId', waId: '5215512345678', profileName: null }) as ContactData) }
    const conversations = {
      findById: vi.fn(async () => refetchedConv),
      setLead: vi.fn(async () => {}),
      findOpenByContactId: vi.fn(async () => existingConv),
      createOpen: vi.fn(async () => { throw new Error('should not createOpen') }),
      touchLastMessage: vi.fn(async () => {}),
      clearNeedsReplyByLeadId: vi.fn(async () => true),
    } as unknown as WhatsAppConversationRepositoryWidePort
    const deps = makeDeps({ contacts, conversations, messages: { create: vi.fn(async () => saved), findByProviderMessageId: vi.fn(async () => null), updateStatus: vi.fn(async () => {}), updateStatusAndMetadata: vi.fn(async () => {}), listByConversation: vi.fn(async () => []), countInboundByConversation: vi.fn(async () => 0) } as unknown as WhatsAppMessageRepositoryWidePort })
    const svc = new ConversationService(deps)
    const provider = makeProvider('wa-out-1')
    const res = await svc.sendTextMessage(provider, { toWaId: '+52 1 55 1234 5678', text: 'hola' })

    expect(contacts.upsert).toHaveBeenCalledWith('5215512345678')
    expect(conversations.findOpenByContactId).toHaveBeenCalledWith('ct-toWaId')
    expect(conversations.createOpen).not.toHaveBeenCalled()
    expect(conversations.findById).toHaveBeenCalledWith('conv-by-contact')
    expect(provider.sendTextMessage).toHaveBeenCalledWith({ toWaId: '5215512345678', text: 'hola' })
    expect(res).toEqual({ providerMessageId: 'wa-out-1', conversationId: 'conv-by-contact' })
    expect(deps.messages.create).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv-by-contact', direction: 'outbound', providerMessageId: 'wa-out-1', type: 'text', bodyText: 'hola', status: 'pending' }))
    expect(deps.conversations.touchLastMessage).toHaveBeenCalledWith('conv-by-contact', expect.any(Date), 'outbound')
    const bus = deps.realtimeBus as unknown as { published: WhatsAppRealtimeEvent[] }
    expect(bus.published).toContainEqual({ type: 'message.created', payload: { conversationId: 'conv-by-contact', message: expect.objectContaining({ id: 'm-out', direction: 'outbound' }) } })
    expect(bus.published).toContainEqual({ type: 'conversation.updated', payload: { conversationId: 'conv-by-contact', lastMessageAt: expect.any(String), lastMessageDirection: 'outbound', needsReply: false } })
  })

  it('solo toWaId (sin conversación abierta): upsert contacto y llama createOpen, luego refetch', async () => {
    const createdConv: ConversationData = { id: 'conv-new-toWaId', contactId: 'ct-toWaId', contactWaId: '', status: 'open', leadId: null, lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const refetchedConv: ConversationData = { id: 'conv-new-toWaId', contactId: 'ct-toWaId', contactWaId: '5215512345678', status: 'open', leadId: null, lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const saved: MessageData = { id: 'm-out', conversationId: 'conv-new-toWaId', direction: 'outbound', providerMessageId: 'wa-out-1', type: 'text', bodyText: 'hola', status: 'pending', metadata: {}, sentAt: new Date('2026-01-01T00:00:00Z') }
    const contacts = { upsert: vi.fn(async () => ({ id: 'ct-toWaId', waId: '5215512345678', profileName: null }) as ContactData) }
    const conversations = {
      findById: vi.fn(async () => refetchedConv),
      setLead: vi.fn(async () => {}),
      findOpenByContactId: vi.fn(async () => null),
      createOpen: vi.fn(async () => createdConv),
      touchLastMessage: vi.fn(async () => {}),
      clearNeedsReplyByLeadId: vi.fn(async () => true),
    } as unknown as WhatsAppConversationRepositoryWidePort
    const deps = makeDeps({ contacts, conversations, messages: { create: vi.fn(async () => saved), findByProviderMessageId: vi.fn(async () => null), updateStatus: vi.fn(async () => {}), updateStatusAndMetadata: vi.fn(async () => {}), listByConversation: vi.fn(async () => []), countInboundByConversation: vi.fn(async () => 0) } as unknown as WhatsAppMessageRepositoryWidePort })
    const svc = new ConversationService(deps)
    const provider = makeProvider('wa-out-1')
    const res = await svc.sendTextMessage(provider, { toWaId: '+52 1 55 1234 5678', text: 'hola' })

    expect(contacts.upsert).toHaveBeenCalledWith('5215512345678')
    expect(conversations.findOpenByContactId).toHaveBeenCalledWith('ct-toWaId')
    expect(conversations.createOpen).toHaveBeenCalledWith('ct-toWaId')
    expect(conversations.findById).toHaveBeenCalledWith('conv-new-toWaId')
    expect(provider.sendTextMessage).toHaveBeenCalledWith({ toWaId: '5215512345678', text: 'hola' })
    expect(res).toEqual({ providerMessageId: 'wa-out-1', conversationId: 'conv-new-toWaId' })
  })
})

describe('ConversationService.listMessages', () => {
  it('con conversación existente → mapea filas con sentAt iso y llama listByConversation', async () => {
    const conv: ConversationData = { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: null, lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const rows: MessageData[] = [
      { id: 'm1', conversationId: 'conv1', direction: 'inbound', providerMessageId: 'in-1', type: 'text', bodyText: 'hola', status: 'delivered', metadata: {}, sentAt: new Date('2026-01-01T00:00:00Z') },
      { id: 'm2', conversationId: 'conv1', direction: 'outbound', providerMessageId: 'out-1', type: 'text', bodyText: 'hey', status: 'pending', metadata: {}, sentAt: new Date('2026-01-02T00:00:00Z') },
    ]
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => conv), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => conv), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort,
      messages: { create: vi.fn(async () => ({})), findByProviderMessageId: vi.fn(async () => null), updateStatus: vi.fn(async () => {}), updateStatusAndMetadata: vi.fn(async () => {}), listByConversation: vi.fn(async () => rows) } as unknown as WhatsAppMessageRepositoryWidePort,
    })
    const svc = new ConversationService(deps)
    const out = await svc.listMessages('conv1', 50, 'cursor-x')
    expect(deps.messages.listByConversation).toHaveBeenCalledWith('conv1', 50, 'cursor-x')
    expect(out).toEqual([
      { id: 'm1', conversationId: 'conv1', direction: 'inbound', providerMessageId: 'in-1', type: 'text', bodyText: 'hola', status: 'delivered', sentAt: '2026-01-01T00:00:00.000Z' },
      { id: 'm2', conversationId: 'conv1', direction: 'outbound', providerMessageId: 'out-1', type: 'text', bodyText: 'hey', status: 'pending', sentAt: '2026-01-02T00:00:00.000Z' },
    ])
  })

  it('con conversación inexistente → HttpError 404', async () => {
    const deps = makeDeps()
    const svc = new ConversationService(deps)
    await expect(svc.listMessages('missing', 50)).rejects.toMatchObject({ statusCode: 404, code: 'CONVERSATION_NOT_FOUND' })
  })
})

describe('ConversationService.processInboundEvents — realtime publish', () => {
  it('publica message.created y conversation.updated para inbound', async () => {
    const saved: MessageData = { id: 'in-m', conversationId: 'conv1', direction: 'inbound', providerMessageId: 'in-1', type: 'text', bodyText: 'hola', status: 'delivered', metadata: {}, sentAt: new Date('2026-01-01T00:00:00Z') }
    const deps = makeDeps({
      messages: { create: vi.fn(async () => saved), findByProviderMessageId: vi.fn(async () => null), updateStatus: vi.fn(async () => {}), updateStatusAndMetadata: vi.fn(async () => {}), listByConversation: vi.fn(async () => []), countInboundByConversation: vi.fn(async () => 0) } as unknown as WhatsAppMessageRepositoryWidePort,
    })
    const svc = new ConversationService(deps)
    const ts = new Date('2026-01-01T00:00:00Z')
    await svc.processInboundEvents([{ kind: 'message', message: msg({ providerMessageId: 'in-1', timestamp: ts }) }], {} as WhatsAppSender)
    const bus = deps.realtimeBus as unknown as { published: WhatsAppRealtimeEvent[] }
    expect(bus.published).toContainEqual({ type: 'message.created', payload: { conversationId: 'conv1', message: expect.objectContaining({ id: 'in-m', direction: 'inbound', sentAt: '2026-01-01T00:00:00.000Z' }) } })
    expect(bus.published).toContainEqual({ type: 'conversation.updated', payload: { conversationId: 'conv1', lastMessageAt: ts.toISOString(), lastMessageDirection: 'inbound', needsReply: true } })
  })
})

describe('ConversationService.assertConversationInScope', () => {
  it('conversación inexistente → HttpError 404 CONVERSATION_NOT_FOUND', async () => {
    const deps = makeDeps()
    const svc = new ConversationService(deps)
    await expect(
      svc.assertConversationInScope('missing', new Set<string>(), 'user-1')
    ).rejects.toMatchObject({ statusCode: 404, code: 'CONVERSATION_NOT_FOUND' })
  })

  it('con leads.read.all → resuelve sin llamar existsByContactIdAndAssignee', async () => {
    const conv: ConversationData = { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: 'lead-1', lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const campaignLeads = { findById: vi.fn(async () => { throw new Error('should not be called') }), existsByContactIdAndAssignee: vi.fn(async () => { throw new Error('should not be called') }) } as unknown as CampaignLeadRepositoryPort
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => conv), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => conv), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort,
      campaignLeads,
    })
    const svc = new ConversationService(deps)
    await expect(
      svc.assertConversationInScope('conv1', new Set([PERMISSIONS.LEADS_READ_ALL]), 'user-1')
    ).resolves.toBeUndefined()
    expect(campaignLeads.existsByContactIdAndAssignee).not.toHaveBeenCalled()
  })

  it('sin read.all, existe un lead del contacto asignado al usuario (existsByContactIdAndAssignee true) → resuelve', async () => {
    const conv: ConversationData = { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: 'lead-1', lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const campaignLeads = { findById: vi.fn(async () => { throw new Error('should not be called') }), existsByContactIdAndAssignee: vi.fn(async () => true) } as unknown as CampaignLeadRepositoryPort
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => conv), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => conv), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort,
      campaignLeads,
    })
    const svc = new ConversationService(deps)
    await expect(
      svc.assertConversationInScope('conv1', new Set<string>(), 'user-1')
    ).resolves.toBeUndefined()
    expect(campaignLeads.existsByContactIdAndAssignee).toHaveBeenCalledWith('ct1', 'user-1')
  })

  it('sin read.all, ningún lead del contacto asignado al usuario (existsByContactIdAndAssignee false) → HttpError 404 (no 403, para no leakar existencia)', async () => {
    const conv: ConversationData = { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: 'lead-1', lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const campaignLeads = { findById: vi.fn(async () => { throw new Error('should not be called') }), existsByContactIdAndAssignee: vi.fn(async () => false) } as unknown as CampaignLeadRepositoryPort
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => conv), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => conv), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort,
      campaignLeads,
    })
    const svc = new ConversationService(deps)
    await expect(
      svc.assertConversationInScope('conv1', new Set<string>(), 'user-1')
    ).rejects.toMatchObject({ statusCode: 404, code: 'CONVERSATION_NOT_FOUND' })
  })
})
describe('ConversationService.sendTextMessage — flow pause + last_outbound milestone', () => {
  function makeProvider(providerMessageId = 'wa-out-1'): WhatsAppProvider {
    return {
      sendTextMessage: vi.fn(async () => ({ providerMessageId })),
      sendInteractiveButtons: vi.fn(async () => ({ providerMessageId })),
    } as unknown as WhatsAppProvider
  }

  function flowState(over: Partial<LeadFlowStateData> = {}): LeadFlowStateData {
    return {
      id: 'fs-1',
      campaignLeadId: 'lead-1',
      currentNodeId: 'welcome',
      context: {},
      status: 'active',
      lastInteractionAt: new Date('2026-01-01T00:00:00Z'),
      completedAt: null,
      ...over,
    }
  }

  it('con lead y flowState active: pausa el flujo y registra milestone last_outbound con actor', async () => {
    const conv: ConversationData = { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: 'lead-1', lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => conv), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => conv), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort,
      flowStates: { findByCampaignLeadId: vi.fn(async () => flowState({ status: 'active' })), save: vi.fn(async (s) => s) } as unknown as LeadFlowStateRepositoryPort,
      leadEvents: { record: vi.fn(async (d) => d) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    await svc.sendTextMessage(makeProvider(), { conversationId: 'conv1', text: 'hola', actorUserId: 'user-9' })

    expect(deps.leadEvents.record).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'lead-1', type: 'message_milestone', milestoneKind: 'last_outbound', actorUserId: 'user-9', fromValue: null, toValue: null, reason: null }))
    expect(deps.flowStates.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'fs-1', status: 'paused' }))
  })

  it('con lead y flowState paused: NO pausa pero registra el milestone', async () => {
    const conv: ConversationData = { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: 'lead-1', lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => conv), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => conv), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort,
      flowStates: { findByCampaignLeadId: vi.fn(async () => flowState({ status: 'paused' })), save: vi.fn(async (s) => s) } as unknown as LeadFlowStateRepositoryPort,
      leadEvents: { record: vi.fn(async (d) => d) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    await svc.sendTextMessage(makeProvider(), { conversationId: 'conv1', text: 'hola', actorUserId: 'user-9' })

    expect(deps.flowStates.save).not.toHaveBeenCalled()
    expect(deps.leadEvents.record).toHaveBeenCalledWith(expect.objectContaining({ milestoneKind: 'last_outbound' }))
  })

  it('con lead y flowState completed: NO pausa pero registra el milestone', async () => {
    const conv: ConversationData = { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: 'lead-1', lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => conv), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => conv), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort,
      flowStates: { findByCampaignLeadId: vi.fn(async () => flowState({ status: 'completed' })), save: vi.fn(async (s) => s) } as unknown as LeadFlowStateRepositoryPort,
      leadEvents: { record: vi.fn(async (d) => d) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    await svc.sendTextMessage(makeProvider(), { conversationId: 'conv1', text: 'hola', actorUserId: 'user-9' })

    expect(deps.flowStates.save).not.toHaveBeenCalled()
    expect(deps.leadEvents.record).toHaveBeenCalledWith(expect.objectContaining({ milestoneKind: 'last_outbound' }))
  })

  it('con lead y sin flowState (null): NO pausa, registra el milestone', async () => {
    const conv: ConversationData = { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: 'lead-1', lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => conv), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => conv), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort,
      flowStates: { findByCampaignLeadId: vi.fn(async () => null), save: vi.fn(async (s) => s) } as unknown as LeadFlowStateRepositoryPort,
      leadEvents: { record: vi.fn(async (d) => d) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    await svc.sendTextMessage(makeProvider(), { conversationId: 'conv1', text: 'hola', actorUserId: 'user-9' })

    expect(deps.flowStates.save).not.toHaveBeenCalled()
    expect(deps.leadEvents.record).toHaveBeenCalledWith(expect.objectContaining({ milestoneKind: 'last_outbound' }))
  })

  it('sin actorUserId: milestone con actorUserId null', async () => {
    const conv: ConversationData = { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: 'lead-1', lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => conv), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => conv), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort,
      flowStates: { findByCampaignLeadId: vi.fn(async () => flowState({ status: 'active' })), save: vi.fn(async (s) => s) } as unknown as LeadFlowStateRepositoryPort,
      leadEvents: { record: vi.fn(async (d) => d) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    await svc.sendTextMessage(makeProvider(), { conversationId: 'conv1', text: 'hola' })

    expect(deps.leadEvents.record).toHaveBeenCalledWith(expect.objectContaining({ milestoneKind: 'last_outbound', actorUserId: null }))
  })

  it('best-effort: si leadEvents.record lanza, sendTextMessage NO falla y devuelve {providerMessageId, conversationId} (evita retry que duplicaría el outbound)', async () => {
    const conv: ConversationData = { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: 'lead-1', lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => conv), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => conv), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort,
      flowStates: { findByCampaignLeadId: vi.fn(async () => flowState({ status: 'active' })), save: vi.fn(async (s) => s) } as unknown as LeadFlowStateRepositoryPort,
      leadEvents: { record: vi.fn(async () => { throw new Error('db down') }) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await svc.sendTextMessage(makeProvider('wa-out-9'), { conversationId: 'conv1', text: 'hola', actorUserId: 'user-9' })
    errSpy.mockRestore()

    expect(res).toEqual({ providerMessageId: 'wa-out-9', conversationId: 'conv1' })
    // flow-pause no se alcanzó porque el throw cortó el bloque best-effort
    expect(deps.flowStates.save).not.toHaveBeenCalled()
  })

  it('sin leadId: no registra milestone ni pausa', async () => {
    const conv: ConversationData = { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: null, lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null }
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => conv), setLead: vi.fn(async () => {}), findOpenByContactId: vi.fn(async () => null), createOpen: vi.fn(async () => conv), touchLastMessage: vi.fn(async () => {}), clearNeedsReplyByLeadId: vi.fn(async () => true) } as WhatsAppConversationRepositoryWidePort,
      flowStates: { findByCampaignLeadId: vi.fn(async () => flowState()), save: vi.fn(async (s) => s) } as unknown as LeadFlowStateRepositoryPort,
      leadEvents: { record: vi.fn(async (d) => d) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    await svc.sendTextMessage(makeProvider(), { conversationId: 'conv1', text: 'hola', actorUserId: 'user-9' })

    expect(deps.leadEvents.record).not.toHaveBeenCalled()
    expect(deps.flowStates.save).not.toHaveBeenCalled()
  })
})

describe('ConversationService.processInboundMessage — first_inbound + re_engagement milestones', () => {
  function inboundConv(over: Partial<ConversationData> = {}): ConversationData {
    return { id: 'conv1', contactId: 'ct1', contactWaId: '12345', status: 'open', leadId: 'lead-1', lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null, ...over }
  }

  it('priorInbound=0 y leadId presente: registra first_inbound', async () => {
    const deps = makeDeps({
      conversations: {
        findById: vi.fn(async () => null),
        setLead: vi.fn(async () => {}),
        findOpenByContactId: vi.fn(async () => inboundConv()),
        createOpen: vi.fn(async () => inboundConv()),
        touchLastMessage: vi.fn(async () => {}),
        clearNeedsReplyByLeadId: vi.fn(async () => true),
      } as WhatsAppConversationRepositoryWidePort,
      messages: {
        create: vi.fn(async () => ({ id: 'in-m', conversationId: 'conv1', direction: 'inbound', providerMessageId: 'in-x', type: 'text', bodyText: 'hola', status: 'delivered', metadata: {}, sentAt: new Date('2026-01-01T00:00:00Z') } as MessageData)),
        findByProviderMessageId: vi.fn(async () => null),
        updateStatus: vi.fn(async () => {}),
        updateStatusAndMetadata: vi.fn(async () => {}),
        listByConversation: vi.fn(async () => []),
        countInboundByConversation: vi.fn(async () => 0),
      } as unknown as WhatsAppMessageRepositoryWidePort,
      leadEvents: { record: vi.fn(async (d) => d) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'message', message: msg({ providerMessageId: 'm-x' }) }], {} as WhatsAppSender)

    expect(deps.messages.countInboundByConversation).toHaveBeenCalledWith('conv1')
    expect(deps.leadEvents.record).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'lead-1', type: 'message_milestone', milestoneKind: 'first_inbound', actorUserId: null, fromValue: null, toValue: null, reason: null }))
  })

  it('priorInbound>0: no registra first_inbound', async () => {
    const deps = makeDeps({
      messages: {
        create: vi.fn(async () => ({ id: 'in-m', conversationId: 'conv1', direction: 'inbound', providerMessageId: 'in-x', type: 'text', bodyText: 'hola', status: 'delivered', metadata: {}, sentAt: new Date('2026-01-01T00:00:00Z') } as MessageData)),
        findByProviderMessageId: vi.fn(async () => null),
        updateStatus: vi.fn(async () => {}),
        updateStatusAndMetadata: vi.fn(async () => {}),
        listByConversation: vi.fn(async () => []),
        countInboundByConversation: vi.fn(async () => 5),
      } as unknown as WhatsAppMessageRepositoryWidePort,
      leadEvents: { record: vi.fn(async (d) => d) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'message', message: msg({ providerMessageId: 'm-x' }) }], {} as WhatsAppSender)

    expect(deps.leadEvents.record).not.toHaveBeenCalledWith(expect.objectContaining({ milestoneKind: 'first_inbound' }))
  })

  it('guard: needsReplyClearedAt set y lastMessageAt null y priorInbound=0: registra first_inbound pero NO re_engagement', async () => {
    const deps = makeDeps({
      conversations: {
        findById: vi.fn(async () => null),
        setLead: vi.fn(async () => {}),
        findOpenByContactId: vi.fn(async () => inboundConv({ needsReplyClearedAt: new Date('2026-01-01T00:00:00Z'), lastMessageAt: null })),
        createOpen: vi.fn(async () => inboundConv()),
        touchLastMessage: vi.fn(async () => {}),
        clearNeedsReplyByLeadId: vi.fn(async () => true),
      } as WhatsAppConversationRepositoryWidePort,
      messages: {
        create: vi.fn(async () => ({ id: 'in-m', conversationId: 'conv1', direction: 'inbound', providerMessageId: 'in-x', type: 'text', bodyText: 'hola', status: 'delivered', metadata: {}, sentAt: new Date('2026-01-01T00:00:00Z') } as MessageData)),
        findByProviderMessageId: vi.fn(async () => null),
        updateStatus: vi.fn(async () => {}),
        updateStatusAndMetadata: vi.fn(async () => {}),
        listByConversation: vi.fn(async () => []),
        countInboundByConversation: vi.fn(async () => 0),
      } as unknown as WhatsAppMessageRepositoryWidePort,
      leadEvents: { record: vi.fn(async (d) => d) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'message', message: msg({ providerMessageId: 'm-x' }) }], {} as WhatsAppSender)

    expect(deps.leadEvents.record).toHaveBeenCalledWith(expect.objectContaining({ milestoneKind: 'first_inbound' }))
    expect(deps.leadEvents.record).not.toHaveBeenCalledWith(expect.objectContaining({ milestoneKind: 're_engagement' }))
  })

  it('needsReplyClearedAt set y lastMessageAt <= clearedAt: registra re_engagement', async () => {
    const cleared = new Date('2026-01-05T00:00:00Z')
    const deps = makeDeps({
      conversations: {
        findById: vi.fn(async () => null),
        setLead: vi.fn(async () => {}),
        findOpenByContactId: vi.fn(async () => inboundConv({ needsReplyClearedAt: cleared, lastMessageAt: new Date('2026-01-03T00:00:00Z') })),
        createOpen: vi.fn(async () => inboundConv()),
        touchLastMessage: vi.fn(async () => {}),
        clearNeedsReplyByLeadId: vi.fn(async () => true),
      } as WhatsAppConversationRepositoryWidePort,
      messages: {
        create: vi.fn(async () => ({ id: 'in-m', conversationId: 'conv1', direction: 'inbound', providerMessageId: 'in-x', type: 'text', bodyText: 'hola', status: 'delivered', metadata: {}, sentAt: new Date('2026-01-06T00:00:00Z') } as MessageData)),
        findByProviderMessageId: vi.fn(async () => null),
        updateStatus: vi.fn(async () => {}),
        updateStatusAndMetadata: vi.fn(async () => {}),
        listByConversation: vi.fn(async () => []),
        countInboundByConversation: vi.fn(async () => 2),
      } as unknown as WhatsAppMessageRepositoryWidePort,
      leadEvents: { record: vi.fn(async (d) => d) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'message', message: msg({ providerMessageId: 'm-x' }) }], {} as WhatsAppSender)

    expect(deps.leadEvents.record).toHaveBeenCalledWith(expect.objectContaining({ milestoneKind: 're_engagement' }))
  })

  it('needsReplyClearedAt null: no registra re_engagement', async () => {
    const deps = makeDeps({
      conversations: {
        findById: vi.fn(async () => null),
        setLead: vi.fn(async () => {}),
        findOpenByContactId: vi.fn(async () => inboundConv({ needsReplyClearedAt: null })),
        createOpen: vi.fn(async () => inboundConv()),
        touchLastMessage: vi.fn(async () => {}),
        clearNeedsReplyByLeadId: vi.fn(async () => true),
      } as WhatsAppConversationRepositoryWidePort,
      messages: {
        create: vi.fn(async () => ({ id: 'in-m', conversationId: 'conv1', direction: 'inbound', providerMessageId: 'in-x', type: 'text', bodyText: 'hola', status: 'delivered', metadata: {}, sentAt: new Date('2026-01-01T00:00:00Z') } as MessageData)),
        findByProviderMessageId: vi.fn(async () => null),
        updateStatus: vi.fn(async () => {}),
        updateStatusAndMetadata: vi.fn(async () => {}),
        listByConversation: vi.fn(async () => []),
        countInboundByConversation: vi.fn(async () => 3),
      } as unknown as WhatsAppMessageRepositoryWidePort,
      leadEvents: { record: vi.fn(async (d) => d) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'message', message: msg({ providerMessageId: 'm-x' }) }], {} as WhatsAppSender)

    expect(deps.leadEvents.record).not.toHaveBeenCalledWith(expect.objectContaining({ milestoneKind: 're_engagement' }))
  })

  it('sin leadId: no registra milestones inbound', async () => {
    const deps = makeDeps({
      conversations: {
        findById: vi.fn(async () => null),
        setLead: vi.fn(async () => {}),
        findOpenByContactId: vi.fn(async () => inboundConv({ leadId: null })),
        createOpen: vi.fn(async () => inboundConv({ leadId: null })),
        touchLastMessage: vi.fn(async () => {}),
        clearNeedsReplyByLeadId: vi.fn(async () => true),
      } as WhatsAppConversationRepositoryWidePort,
      messages: {
        create: vi.fn(async () => ({ id: 'in-m', conversationId: 'conv1', direction: 'inbound', providerMessageId: 'in-x', type: 'text', bodyText: 'hola', status: 'delivered', metadata: {}, sentAt: new Date('2026-01-01T00:00:00Z') } as MessageData)),
        findByProviderMessageId: vi.fn(async () => null),
        updateStatus: vi.fn(async () => {}),
        updateStatusAndMetadata: vi.fn(async () => {}),
        listByConversation: vi.fn(async () => []),
        countInboundByConversation: vi.fn(async () => 0),
      } as unknown as WhatsAppMessageRepositoryWidePort,
      leadEvents: { record: vi.fn(async (d) => d) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    await svc.processInboundEvents([{ kind: 'message', message: msg({ providerMessageId: 'm-x' }) }], {} as WhatsAppSender)

    expect(deps.leadEvents.record).not.toHaveBeenCalled()
  })

  it('best-effort: si leadEvents.record lanza en inbound, processInboundEvents NO falla y aún despacha al engine (el dedup protege contra duplicados)', async () => {
    const deps = makeDeps({
      conversations: {
        findById: vi.fn(async () => null),
        setLead: vi.fn(async () => {}),
        findOpenByContactId: vi.fn(async () => inboundConv()),
        createOpen: vi.fn(async () => inboundConv()),
        touchLastMessage: vi.fn(async () => {}),
        clearNeedsReplyByLeadId: vi.fn(async () => true),
      } as WhatsAppConversationRepositoryWidePort,
      messages: {
        create: vi.fn(async () => ({ id: 'in-m', conversationId: 'conv1', direction: 'inbound', providerMessageId: 'in-x', type: 'text', bodyText: 'hola', status: 'delivered', metadata: {}, sentAt: new Date('2026-01-01T00:00:00Z') } as MessageData)),
        findByProviderMessageId: vi.fn(async () => null),
        updateStatus: vi.fn(async () => {}),
        updateStatusAndMetadata: vi.fn(async () => {}),
        listByConversation: vi.fn(async () => []),
        countInboundByConversation: vi.fn(async () => 0),
      } as unknown as WhatsAppMessageRepositoryWidePort,
      leadEvents: { record: vi.fn(async () => { throw new Error('db down') }) } as unknown as LeadEventsRepositoryPort,
    })
    const svc = new ConversationService(deps)
    const sender = {} as WhatsAppSender
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(svc.processInboundEvents([{ kind: 'message', message: msg({ providerMessageId: 'm-x' }) }], sender)).resolves.toBeUndefined()
    errSpy.mockRestore()

    expect(deps.messages.create).toHaveBeenCalled()
    expect(deps.conversations.touchLastMessage).toHaveBeenCalled()
    expect(deps.flowEngine!.handleInbound).toHaveBeenCalledWith(sender, expect.objectContaining({ conversationId: 'conv1' }))
  })
})
