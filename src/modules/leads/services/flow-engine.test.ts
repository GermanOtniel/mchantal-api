import { describe, it, expect, vi } from 'vitest'
import { FlowEngine } from './flow-engine'
import type { WhatsAppSender } from '../../../shared/whatsapp/whatsapp-sender.interface'
import type { NormalizedMessage } from '../../../shared/whatsapp/types/inbound.types'
import type { FlowDefinition } from '../../campaigns/types/flow.types'
import type {
  ConversationData,
  CampaignLeadData,
  LeadCaptureData,
  LeadFlowStateData,
  FlowEngineDeps,
  InboundFlowContext,
} from '../types/leads.types'

const FOLIO = 'MC-ABCDE'

/** Flujo demo (slice): welcome -> ask_producto -> cierres; promo -> cierre. */
function demoFlow(): FlowDefinition {
  return {
    nodes: {
      welcome: {
        id: 'welcome',
        type: 'interactive_buttons',
        body: 'Hola {{folio}}, ¿qué te trae aquí?',
        buttons: [
          { id: 'comprar', title: 'Quiero comprar' },
          { id: 'promo', title: 'Vi una promoción' },
        ],
        transitions: { comprar: 'ask_producto', promo: 'closing_promo' },
        onFreeText: 'reprompt',
      },
      ask_producto: {
        id: 'ask_producto',
        type: 'interactive_buttons',
        body: '¿Qué producto?',
        buttons: [
          { id: 'piel', title: 'Cuidado de la piel 🌸' },
          { id: 'hogar', title: 'Hogar 🏠' },
        ],
        transitions: { piel: 'closing_piel', hogar: 'closing_hogar' },
        onFreeText: 'reprompt',
      },
      closing_piel: { id: 'closing_piel', type: 'text_message', body: '¡Gracias {{folio}}! Te contactaremos sobre piel 🌸' },
      closing_hogar: { id: 'closing_hogar', type: 'text_message', body: '¡Gracias {{folio}}! Te contactaremos sobre hogar 🏠' },
      closing_promo: { id: 'closing_promo', type: 'text_message', body: '¡Gracias {{folio}}! Te informaremos de la promo 🎉' },
    },
  }
}

function msg(over: Partial<NormalizedMessage>): NormalizedMessage {
  return {
    providerMessageId: 'in-1',
    waId: '12345',
    timestamp: new Date('2026-01-01T00:00:00Z'),
    type: 'text',
    ...over,
  }
}

function makeSender(): { sender: WhatsAppSender; sent: { kind: 'text' | 'buttons'; toWaId: string; body: string; buttons?: { id: string; title: string }[] }[] } {
  const sent: { kind: 'text' | 'buttons'; toWaId: string; body: string; buttons?: { id: string; title: string }[] }[] = []
  let n = 0
  const sender: WhatsAppSender = {
    sendTextMessage: vi.fn(async (input) => {
      sent.push({ kind: 'text', toWaId: input.toWaId, body: input.text })
      return { providerMessageId: `out-${++n}` }
    }),
    sendInteractiveButtons: vi.fn(async (input) => {
      sent.push({ kind: 'buttons', toWaId: input.toWaId, body: input.body, buttons: input.buttons })
      return { providerMessageId: `out-${++n}` }
    }),
  }
  return { sender, sent }
}

function makeDeps(over: Partial<FlowEngineDeps> = {}): FlowEngineDeps {
  return {
    captures: { findPendingByFolio: vi.fn(async () => null), markMatched: vi.fn(async () => {}) },
    campaignLeads: {
      findByContactAndCampaign: vi.fn(async () => null),
      create: vi.fn(async (d) => ({
        id: 'lead1',
        contactId: d.contactId,
        campaignId: d.campaignId,
        campaign: { id: d.campaignId, flowDefinition: demoFlow() },
        context: d.context,
      })),
      findById: vi.fn(async () => null),
      save: vi.fn(async (l) => l),
    },
    flowStates: {
      findActiveByCampaignLeadId: vi.fn(async () => null),
      findByCampaignLeadId: vi.fn(async () => null),
      create: vi.fn(async (d) => ({ id: 'fs1', completedAt: null, ...d })),
      save: vi.fn(async (s) => s),
    },
    conversations: { findById: vi.fn(async () => null), setLead: vi.fn(async () => {}) },
    messages: { create: vi.fn(async () => ({})) },
    ...over,
  }
}

function ctx(over: Partial<InboundFlowContext> = {}): InboundFlowContext {
  return { conversationId: 'conv1', contactId: 'ct1', waId: '12345', message: msg({}), ...over }
}

describe('FlowEngine — inscripción', () => {
  it('con folio + captura pendiente: crea lead, flowState en welcome, envía bienvenida interpolada, marca captura y enlaza conversación', async () => {
    const flow = demoFlow()
    const capture: LeadCaptureData = {
      id: 'cap1',
      folio: FOLIO,
      campaignId: 'camp1',
      campaign: { id: 'camp1', flowDefinition: flow },
      status: 'pending',
      campaignLeadId: null,
    }
    const deps = makeDeps({
      captures: { findPendingByFolio: vi.fn(async () => capture), markMatched: vi.fn(async () => {}) },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: `Hola, mi folio es ${FOLIO}` }) }))

    expect(deps.captures.findPendingByFolio).toHaveBeenCalledWith(FOLIO)
    expect(deps.campaignLeads.create).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'ct1', campaignId: 'camp1', context: { folio: FOLIO, answers: {} } })
    )
    expect(deps.captures.markMatched).toHaveBeenCalledWith('cap1', 'lead1')
    expect(deps.conversations.setLead).toHaveBeenCalledWith('conv1', 'lead1')
    expect(deps.flowStates.create).toHaveBeenCalledWith(
      expect.objectContaining({ campaignLeadId: 'lead1', currentNodeId: 'welcome', status: 'active' })
    )
    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(
      expect.objectContaining({ toWaId: '12345', body: 'Hola MC-ABCDE, ¿qué te trae aquí?', buttons: flow.nodes.welcome.buttons })
    )
    expect(deps.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv1', direction: 'outbound', type: 'interactive_buttons' })
    )
    expect(sent).toHaveLength(1)
  })

  it('con folio pero sin captura pendiente: no inscribe ni envía nada', async () => {
    const deps = makeDeps()
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: `mi folio es ${FOLIO}` }) }))
    expect(deps.campaignLeads.create).not.toHaveBeenCalled()
    expect(sender.sendInteractiveButtons).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })
})

describe('FlowEngine — transición por botón', () => {
  it('reply coincide con transition: graba answer, avanza al nodo destino y lo envía', async () => {
    const flow = demoFlow()
    const lead: CampaignLeadData = {
      id: 'lead1', contactId: 'ct1', campaignId: 'camp1',
      campaign: { id: 'camp1', flowDefinition: flow },
      context: { folio: FOLIO, answers: {} },
    }
    const state: LeadFlowStateData = {
      id: 'fs1', campaignLeadId: 'lead1', currentNodeId: 'welcome',
      context: { folio: FOLIO, answers: {} }, status: 'active',
      lastInteractionAt: new Date(), completedAt: null,
    }
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async () => lead),
        findById: vi.fn(async () => lead),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => state),
        findByCampaignLeadId: vi.fn(async () => state),
        create: vi.fn(async () => state),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({
      message: msg({ type: 'interactive', interactiveReplyId: 'comprar', interactiveReplyTitle: 'Quiero comprar', interactiveType: 'button_reply' }),
    }))

    expect((state.context.answers as Record<string, string>).welcome).toBe('comprar')
    expect(state.currentNodeId).toBe('ask_producto')
    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(
      expect.objectContaining({ body: flow.nodes.ask_producto.body, buttons: flow.nodes.ask_producto.buttons })
    )
  })
})

describe('FlowEngine — cierre de rama', () => {
  it('transición a text_message sin nextNodeId: envía texto interpolado y marca completed', async () => {
    const flow = demoFlow()
    const lead: CampaignLeadData = {
      id: 'lead1', contactId: 'ct1', campaignId: 'camp1',
      campaign: { id: 'camp1', flowDefinition: flow },
      context: { folio: FOLIO, answers: { welcome: 'comprar' } },
    }
    const state: LeadFlowStateData = {
      id: 'fs1', campaignLeadId: 'lead1', currentNodeId: 'ask_producto',
      context: { folio: FOLIO, answers: { welcome: 'comprar' } }, status: 'active',
      lastInteractionAt: new Date(), completedAt: null,
    }
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async () => lead),
        findById: vi.fn(async () => lead),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => state),
        findByCampaignLeadId: vi.fn(async () => state),
        create: vi.fn(async () => state),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({
      message: msg({ type: 'interactive', interactiveReplyId: 'piel', interactiveReplyTitle: 'Cuidado de la piel 🌸', interactiveType: 'button_reply' }),
    }))

    expect((state.context.answers as Record<string, string>).ask_producto).toBe('piel')
    expect(sender.sendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({ toWaId: '12345', text: '¡Gracias MC-ABCDE! Te contactaremos sobre piel 🌸' })
    )
    expect(state.status).toBe('completed')
    expect(state.completedAt).toBeInstanceOf(Date)
  })
})

describe('FlowEngine — reprompt (texto libre en nodo interactive)', () => {
  it('texto sin botón con onFreeText reprompt: reenvía la misma pregunta, no avanza ni graba answer', async () => {
    const flow = demoFlow()
    const lead: CampaignLeadData = {
      id: 'lead1', contactId: 'ct1', campaignId: 'camp1',
      campaign: { id: 'camp1', flowDefinition: flow },
      context: { folio: FOLIO, answers: {} },
    }
    const state: LeadFlowStateData = {
      id: 'fs1', campaignLeadId: 'lead1', currentNodeId: 'welcome',
      context: { folio: FOLIO, answers: {} }, status: 'active',
      lastInteractionAt: new Date(), completedAt: null,
    }
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async () => lead),
        findById: vi.fn(async () => lead),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => state),
        findByCampaignLeadId: vi.fn(async () => state),
        create: vi.fn(async () => state),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Hola MC-ABCDE, ¿qué te trae aquí?' })
    )
    expect(state.currentNodeId).toBe('welcome')
    expect((state.context.answers as Record<string, string>)).toEqual({})
  })
})

describe('FlowEngine — ignorado', () => {
  it('texto sin folio en conversación sin lead: no envía ni crea nada', async () => {
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', status: 'open', leadId: null }) as ConversationData), setLead: vi.fn(async () => {}) },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))
    expect(sender.sendInteractiveButtons).not.toHaveBeenCalled()
    expect(sender.sendTextMessage).not.toHaveBeenCalled()
    expect(deps.campaignLeads.create).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })
})