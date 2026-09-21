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
    campaigns: { findActiveBase: vi.fn(async () => null) },
    reengageWindowHours: 24,
    campaignLeads: {
      findByContactAndCampaign: vi.fn(async () => null),
      create: vi.fn(async (d) => ({
        id: 'lead1',
        contactId: d.contactId,
        campaignId: d.campaignId,
        campaign: { id: d.campaignId, flowDefinition: demoFlow() },
        context: d.context,
        origin: d.origin ?? 'unknown',
      })),
      findById: vi.fn(async () => null),
      findTerminalByContactId: vi.fn(async () => []),
      save: vi.fn(async (l) => l),
    },
    flowStates: {
      findActiveByCampaignLeadId: vi.fn(async () => null),
      findByCampaignLeadId: vi.fn(async () => null),
      create: vi.fn(async (d) => ({ id: 'fs1', completedAt: null, ...d })),
      save: vi.fn(async (s) => s),
    },
    conversations: { findById: vi.fn(async () => null), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
    messages: { create: vi.fn(async () => ({})) },
    dictionaries: { findById: vi.fn(async () => null) },
    assignment: { resolve: vi.fn(async () => ({ mode: 'manual', executiveId: null })) },
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
      origin: 'unknown',
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

  it('propaga el origen del capture al campaign lead al enrolar', async () => {
    const flow = demoFlow()
    const capture: LeadCaptureData = {
      id: 'cap1',
      folio: FOLIO,
      campaignId: 'camp1',
      campaign: { id: 'camp1', flowDefinition: flow },
      status: 'pending',
      campaignLeadId: null,
      origin: 'Facebook',
    }
    const deps = makeDeps({
      captures: { findPendingByFolio: vi.fn(async () => capture), markMatched: vi.fn(async () => {}) },
    })
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: `Hola, mi folio es ${FOLIO}` }) }))

    expect(deps.campaignLeads.create).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'ct1', campaignId: 'camp1', origin: 'Facebook' })
    )
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
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
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
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
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

  it('al enviar mensaje outbound llama touchLastMessage con dirección outbound', async () => {
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
    const conversations = { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) }
    const deps = makeDeps({
      conversations,
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
      message: msg({ type: 'interactive', interactiveReplyId: 'piel', interactiveReplyTitle: 'Cuidado de la piel', interactiveType: 'button_reply' }),
    }))
    expect(conversations.touchLastMessage).toHaveBeenCalledWith('conv1', expect.any(Date), 'outbound')
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
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
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
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open', leadId: null }) as ConversationData), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
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
describe('FlowEngine — resolución de entrada (jsonb reordena claves)', () => {
  // Flujo donde 'q' aparece ANTES que 'welcome' en orden de iteración (como hace jsonb).
  function reorderedFlow(entryNodeId?: string) {
    return {
      entryNodeId,
      nodes: {
        q: { id: 'q', type: 'interactive_buttons', body: 'Q BODY', buttons: [{ id: 'b1', title: 'x' }], transitions: { b1: 'closing' }, onFreeText: 'reprompt' },
        welcome: { id: 'welcome', type: 'interactive_buttons', body: 'WELCOME BODY', buttons: [{ id: 'b1', title: 'go' }], transitions: { b1: 'q' }, onFreeText: 'reprompt' },
        closing: { id: 'closing', type: 'text_message', body: 'bye' },
      },
    } as unknown as FlowDefinition
  }

  async function enroll(flow: unknown) {
    const capture = { id: 'cap1', folio: FOLIO, campaignId: 'camp1', campaign: { id: 'camp1', flowDefinition: flow as never }, status: 'pending' as const, campaignLeadId: null }
    const deps = makeDeps({
      captures: { findPendingByFolio: vi.fn(async () => capture), markMatched: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({ id: 'lead1', contactId: d.contactId, campaignId: d.campaignId, campaign: capture.campaign, context: d.context })),
        findById: vi.fn(async () => null),
        save: vi.fn(async (l) => l),
      },
    })
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: `mi folio es ${FOLIO}` }) }))
    return sender
  }

  it('con entryNodeId=welcome arranca en welcome (no en q, aunque q itere primero)', async () => {
    const sender = await enroll(reorderedFlow('welcome'))
    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(expect.objectContaining({ body: 'WELCOME BODY' }))
    expect(sender.sendInteractiveButtons).not.toHaveBeenCalledWith(expect.objectContaining({ body: 'Q BODY' }))
  })

  it('sin entryNodeId, cae al fallback welcome (id) y arranca en welcome', async () => {
    const sender = await enroll(reorderedFlow(undefined))
    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(expect.objectContaining({ body: 'WELCOME BODY' }))
  })
})

// ── Flujo con nodo text_input ──
function textInputFlow(): FlowDefinition {
  return {
    nodes: {
      welcome: {
        id: 'welcome',
        type: 'interactive_buttons',
        body: 'Hola {{folio}}, ¿qué te trae aquí?',
        buttons: [{ id: 'cotizar', title: 'Cotizar' }],
        transitions: { cotizar: 'ask_estado' },
        onFreeText: 'reprompt',
      },
      ask_estado: {
        id: 'ask_estado',
        type: 'text_input',
        body: '¿De qué estado nos escribes?',
        storeAs: 'estado',
        matcher: { dictionaryId: 'dic1' },
        transitions: { jalisco: 'closing', nuevo_leon: 'closing' },
        assignment: { mode: 'pool', selector: { kind: 'coverage', attribute: 'states', value: '{{answers.estado}}' }, strategy: 'round_robin' },
      },
      closing: { id: 'closing', type: 'text_message', body: '¡Gracias {{folio}}! Te contactaremos.' },
    },
  }
}

function leadAndState(flow: FlowDefinition, currentNodeId: string) {
  const lead: CampaignLeadData = {
    id: 'lead1', contactId: 'ct1', campaignId: 'camp1',
    campaign: { id: 'camp1', flowDefinition: flow },
    context: { folio: FOLIO, answers: {} },
  }
  const state: LeadFlowStateData = {
    id: 'fs1', campaignLeadId: 'lead1', currentNodeId,
    context: { folio: FOLIO, answers: {} }, status: 'active',
    lastInteractionAt: new Date(), completedAt: null,
  }
  return { lead, state }
}

function wireLead(lead: CampaignLeadData, state: LeadFlowStateData) {
  return makeDeps({
    conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
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
}

describe('FlowEngine — text_input', () => {
  it('clasifica texto libre, guarda answers.estado, avanza al cierre y dispara asignación', async () => {
    const flow = textInputFlow()
    const { lead, state } = leadAndState(flow, 'ask_estado')
    const deps = wireLead(lead, state)
    deps.dictionaries = { findById: vi.fn(async () => ({ id: 'dic1', slug: 'estados-de-mexico', name: 'Estados', categories: [{ id: 'jalisco', label: 'Jalisco', aliases: ['jalisco', 'guadalajara'] }, { id: 'nuevo_leon', label: 'Nuevo León', aliases: ['nuevo leon', 'monterrey'] }], isSystem: true })) }
    deps.assignment = { resolve: vi.fn(async () => ({ mode: 'pool', executiveId: 'pepe' })) }
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'Soy de Guadalajara' }) }))

    expect((state.context.answers as Record<string, string>).estado).toBe('jalisco')
    expect(deps.assignment.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'pool', selector: { kind: 'coverage', attribute: 'states', value: '{{answers.estado}}' } }),
      expect.objectContaining({ answers: { estado: 'jalisco' } })
    )
    expect(lead.assignmentMode).toBe('pool')
    expect(lead.assignedExecutiveId).toBe('pepe')
    expect(lead.assignedAt).toBeInstanceOf(Date)
    expect(deps.campaignLeads.save).toHaveBeenCalled()
    // avanza al cierre
    expect(state.currentNodeId).toBe('closing')
    expect(sender.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ text: '¡Gracias MC-ABCDE! Te contactaremos.' }))
  })

  it('sin coincidencia + fallback reprompt: reenvía el prompt, no avanza ni asigna', async () => {
    const flow = textInputFlow()
    const { lead, state } = leadAndState(flow, 'ask_estado')
    const deps = wireLead(lead, state)
    deps.dictionaries = { findById: vi.fn(async () => ({ id: 'dic1', slug: 'x', name: 'x', categories: [{ id: 'jalisco', label: 'Jalisco', aliases: ['jalisco'] }], isSystem: false })) }
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'xyz qwerty' }) }))

    expect((state.context.answers as Record<string, string>)).toEqual({})
    expect(deps.assignment.resolve).not.toHaveBeenCalled()
    expect(lead.assignedExecutiveId).toBeUndefined()
    expect(state.currentNodeId).toBe('ask_estado')
    // reenvía el prompt (1 mensaje de texto saliente = el prompt)
    expect(sender.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ text: '¿De qué estado nos escribes?' }))
  })

  it('assignmentOverrides gana al default para esa categoría', async () => {
    const flow = textInputFlow()
    ;(flow.nodes.ask_estado as { assignmentOverrides?: unknown }).assignmentOverrides = {
      jalisco: { mode: 'executive', executiveId: 'pepe-fijo' },
    }
    const { lead, state } = leadAndState(flow, 'ask_estado')
    const deps = wireLead(lead, state)
    deps.dictionaries = { findById: vi.fn(async () => ({ id: 'dic1', slug: 'x', name: 'x', categories: [{ id: 'jalisco', label: 'Jalisco', aliases: ['guadalajara'] }], isSystem: false })) }
    deps.assignment = { resolve: vi.fn(async () => ({ mode: 'executive', executiveId: 'pepe-fijo' })) }
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'Guadalajara' }) }))

    expect(deps.assignment.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'executive', executiveId: 'pepe-fijo' }),
      expect.anything()
    )
    expect(lead.assignmentMode).toBe('executive')
  })

  it('nodo sin assignment: no asigna (lead sin assignment) pero sí avanza', async () => {
    const flow = textInputFlow()
    delete (flow.nodes.ask_estado as { assignment?: unknown }).assignment
    const { lead, state } = leadAndState(flow, 'ask_estado')
    const deps = wireLead(lead, state)
    deps.dictionaries = { findById: vi.fn(async () => ({ id: 'dic1', slug: 'x', name: 'x', categories: [{ id: 'jalisco', label: 'Jalisco', aliases: ['jalisco'] }], isSystem: false })) }
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'jalisco' }) }))

    expect(deps.assignment.resolve).not.toHaveBeenCalled()
    expect(lead.assignedExecutiveId).toBeUndefined()
    expect(state.currentNodeId).toBe('closing')
  })
})

describe('FlowEngine — text_input defaultTransition', () => {
  it('usa defaultTransition cuando la categoría no tiene transition propia', async () => {
    const flow = textInputFlow()
    // borra transitions por categoría y pone un defaultTransition al cierre
    ;(flow.nodes.ask_estado as { transitions: Record<string, string>; defaultTransition?: string }).transitions = {}
    ;(flow.nodes.ask_estado as { defaultTransition?: string }).defaultTransition = 'closing'
    const { lead, state } = leadAndState(flow, 'ask_estado')
    const deps = wireLead(lead, state)
    deps.dictionaries = { findById: vi.fn(async () => ({ id: 'dic1', slug: 'x', name: 'x', categories: [{ id: 'jalisco', label: 'Jalisco', aliases: ['jalisco', 'guadalajara'] }], isSystem: false })) }
    deps.assignment = { resolve: vi.fn(async () => ({ mode: 'manual', executiveId: null })) }
    delete (flow.nodes.ask_estado as { assignment?: unknown }).assignment
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'Guadalajara' }) }))

    expect((state.context.answers as Record<string, string>).estado).toBe('jalisco')
    expect(state.currentNodeId).toBe('closing')
  })
})

describe('FlowEngine — free_text (captura libre sin match)', () => {
  function freeTextFlow(): FlowDefinition {
    return {
      nodes: {
        welcome: {
          id: 'welcome', type: 'interactive_buttons', body: 'Hola {{folio}}, ¿?',
          buttons: [{ id: 'cotizar', title: 'Cotizar' }],
          transitions: { cotizar: 'capture' },
          onFreeText: 'reprompt',
        },
        capture: {
          id: 'capture', type: 'free_text',
          body: '¿Cómo te llamas?',
          storeAs: 'nombre',
          nextNodeId: 'closing',
        },
        closing: { id: 'closing', type: 'text_message', body: 'Gracias {{answers.nombre}}, te contactaremos.' },
      },
    }
  }

  it('captura el texto crudo, lo guarda en answers[storeAs] y avanza; el cierre interpola {{answers.X}}', async () => {
    const flow = freeTextFlow()
    const { lead, state } = leadAndState(flow, 'capture')
    const deps = wireLead(lead, state)
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'Juan Pérez' }) }))

    expect((state.context.answers as Record<string, string>).nombre).toBe('Juan Pérez')
    expect(state.currentNodeId).toBe('closing')
    expect(sender.sendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({ toWaId: '12345', text: 'Gracias Juan Pérez, te contactaremos.' })
    )
  })

  it('sin nextNodeId: captura y completa el flujo', async () => {
    const flow = freeTextFlow()
    ;(flow.nodes.capture as { nextNodeId?: string }).nextNodeId = undefined
    const { lead, state } = leadAndState(flow, 'capture')
    const deps = wireLead(lead, state)
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'Juan' }) }))

    expect((state.context.answers as Record<string, string>).nombre).toBe('Juan')
    expect(state.status).toBe('completed')
    expect(state.completedAt).toBeInstanceOf(Date)
    // no se envía cierre (no hay nextNodeId)
    expect(sender.sendTextMessage).not.toHaveBeenCalled()
  })
})

// ── Task 2.4: enrolled event + last_outbound milestone + realtime publish + paused no-op ──

function makeRealtimeAndEvents() {
  return {
    leadEvents: { record: vi.fn(async (d: unknown) => d) },
    realtimeBus: { publish: vi.fn() },
  }
}

describe('FlowEngine — evento enrolled', () => {
  it('lead NUEVO por folio: registra evento enrolled con leadId del nuevo lead', async () => {
    const capture: LeadCaptureData = {
      id: 'cap1', folio: FOLIO, campaignId: 'camp1',
      campaign: { id: 'camp1', flowDefinition: demoFlow() },
      status: 'pending', campaignLeadId: null,
    }
    const extra = makeRealtimeAndEvents()
    const deps = makeDeps({
      captures: { findPendingByFolio: vi.fn(async () => capture), markMatched: vi.fn(async () => {}) },
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
      messages: { create: vi.fn(async (d) => ({ id: 'msg-1', ...d, sentAt: d.sentAt })) },
      ...extra,
    })
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: `mi folio es ${FOLIO}` }) }))

    expect(extra.leadEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'enrolled', leadId: 'lead1', actorUserId: null, fromValue: null, toValue: null, reason: null, milestoneKind: null })
    )
  })

  it('lead EXISTENTE por folio: NO registra evento enrolled', async () => {
    const flow = demoFlow()
    const existingLead: CampaignLeadData = {
      id: 'lead1', contactId: 'ct1', campaignId: 'camp1',
      campaign: { id: 'camp1', flowDefinition: flow },
      context: { folio: FOLIO, answers: {} },
    }
    const capture: LeadCaptureData = {
      id: 'cap1', folio: FOLIO, campaignId: 'camp1',
      campaign: { id: 'camp1', flowDefinition: flow },
      status: 'pending', campaignLeadId: null,
    }
    const extra = makeRealtimeAndEvents()
    const deps = makeDeps({
      captures: { findPendingByFolio: vi.fn(async () => capture), markMatched: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => existingLead),
        create: vi.fn(async () => existingLead),
        findById: vi.fn(async () => existingLead),
        save: vi.fn(async (l) => l),
      },
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
      messages: { create: vi.fn(async (d) => ({ id: 'msg-1', ...d, sentAt: d.sentAt })) },
      ...extra,
    })
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: `mi folio es ${FOLIO}` }) }))

    expect(deps.campaignLeads.create).not.toHaveBeenCalled()
    expect(extra.leadEvents.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'enrolled' })
    )
  })
})

describe('FlowEngine — milestone last_outbound + realtime publish', () => {
  it('al enviar welcome outbound: registra milestone last_outbound y publica message.created + conversation.updated', async () => {
    const flow = demoFlow()
    const capture: LeadCaptureData = {
      id: 'cap1', folio: FOLIO, campaignId: 'camp1',
      campaign: { id: 'camp1', flowDefinition: flow },
      status: 'pending', campaignLeadId: null,
    }
    const savedMessage = {
      id: 'msg-1', conversationId: 'conv1', direction: 'outbound',
      providerMessageId: 'out-1', type: 'interactive_buttons',
      bodyText: 'Hola MC-ABCDE, ¿qué te trae aquí?', status: 'pending',
      metadata: {}, sentAt: new Date('2026-01-01T00:00:00Z'),
    }
    const extra = makeRealtimeAndEvents()
    const deps = makeDeps({
      captures: { findPendingByFolio: vi.fn(async () => capture), markMatched: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({
          id: 'lead1', contactId: d.contactId, campaignId: d.campaignId,
          campaign: capture.campaign, context: d.context,
        })),
        findById: vi.fn(async () => null),
        save: vi.fn(async (l) => l),
      },
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
      messages: { create: vi.fn(async () => savedMessage) },
      ...extra,
    })
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: `mi folio es ${FOLIO}` }) }))

    // milestone last_outbound
    expect(extra.leadEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message_milestone', milestoneKind: 'last_outbound', leadId: 'lead1', actorUserId: null })
    )
    // realtime: message.created
    expect(extra.realtimeBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message.created',
        payload: expect.objectContaining({
          conversationId: 'conv1',
          message: expect.objectContaining({ id: 'msg-1', conversationId: 'conv1', direction: 'outbound' }),
        }),
      })
    )
    // realtime: conversation.updated con needsReply false
    expect(extra.realtimeBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'conversation.updated',
        payload: expect.objectContaining({ conversationId: 'conv1', lastMessageDirection: 'outbound', needsReply: false }),
      })
    )
  })
})

describe('FlowEngine — paused no-op', () => {
  it('flowState paused (findActiveByCampaignLeadId → null): no envía, no milestone, no publish', async () => {
    const flow = demoFlow()
    const lead: CampaignLeadData = {
      id: 'lead1', contactId: 'ct1', campaignId: 'camp1',
      campaign: { id: 'camp1', flowDefinition: flow },
      context: { folio: FOLIO, answers: {} },
    }
    const extra = makeRealtimeAndEvents()
    const deps = makeDeps({
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async () => lead),
        findById: vi.fn(async () => lead),
        findTerminalByContactId: vi.fn(async () => []),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async () => null),
        create: vi.fn(async () => null),
        save: vi.fn(async (s) => s),
      },
      ...extra,
    })
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(sender.sendTextMessage).not.toHaveBeenCalled()
    expect(sender.sendInteractiveButtons).not.toHaveBeenCalled()
    expect(extra.leadEvents.record).not.toHaveBeenCalled()
    expect(extra.realtimeBus.publish).not.toHaveBeenCalled()
  })
})

describe('FlowEngine — assignment en text_message', () => {
  it('cierre con assignment manual → asigna al llegar y marca flag', async () => {
    const flow = demoFlow()
    ;(flow.nodes.closing_piel as { assignment?: unknown }).assignment = { mode: 'manual' }
    const { lead, state } = leadAndState(flow, 'ask_producto')
    const deps = wireLead(lead, state)
    deps.assignment = { resolve: vi.fn(async () => ({ mode: 'manual', executiveId: null })) }
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', interactiveReplyId: 'piel' }) }))
    expect(deps.assignment.resolve).toHaveBeenCalledWith({ mode: 'manual' }, expect.anything())
    expect(lead.assignmentMode).toBe('manual')
    expect((state.context as { assigned?: boolean }).assigned).toBe(true)
  })
  it('cierre sin assignment → no asigna, flag ausente', async () => {
    const flow = demoFlow()
    const { lead, state } = leadAndState(flow, 'ask_producto')
    const deps = wireLead(lead, state)
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', interactiveReplyId: 'piel' }) }))
    expect(deps.assignment.resolve).not.toHaveBeenCalled()
    expect((state.context as { assigned?: boolean }).assigned).toBeUndefined()
  })
})

describe('FlowEngine — assignment en free_text', () => {
  it('free_text con assignment → asigna al capturar', async () => {
    const flow: FlowDefinition = { nodes: {
      capture: { id: 'capture', type: 'free_text', body: '¿Comentario?', storeAs: 'com', assignment: { mode: 'executive', executiveId: 'e1' } },
    } }
    const { lead, state } = leadAndState(flow, 'capture')
    const deps = wireLead(lead, state)
    deps.assignment = { resolve: vi.fn(async () => ({ mode: 'executive', executiveId: 'e1' })) }
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'Hola' }) }))
    expect(deps.assignment.resolve).toHaveBeenCalledWith({ mode: 'executive', executiveId: 'e1' }, expect.anything())
    expect(lead.assignedExecutiveId).toBe('e1')
    expect((state.context as { assigned?: boolean }).assigned).toBe(true)
  })
})

describe('FlowEngine — text_input respeta flag assigned', () => {
  it('text_input con assignment no pisa si un ancestro ya asignó (flag assigned)', async () => {
    const flow: FlowDefinition = { nodes: {
      welcome: { id:'welcome', type:'interactive_buttons', body:'¿?', buttons:[{id:'b1',title:'Sí'}], transitions:{ b1:'closing_intermedio' } },
      closing_intermedio: { id:'closing_intermedio', type:'text_message', body:'Ok', nextNodeId:'ask', assignment:{ mode:'manual' } },
      ask: { id:'ask', type:'text_input', body:'¿Estado?', storeAs:'estado', matcher:{ dictionaryId:'d1' }, transitions:{ jalisco:'closing' }, assignment:{ mode:'pool', selector:{ kind:'coverage', attribute:'states', value:'{{answers.estado}}' }, strategy:'round_robin' } },
      closing: { id:'closing', type:'text_message', body:'Listo' },
    } }
    const { lead, state } = leadAndState(flow, 'welcome')
    const deps = wireLead(lead, state)
    deps.dictionaries = { findById: vi.fn(async () => ({ id:'d1', slug:'x', name:'x', categories:[{id:'jalisco',label:'Jalisco',aliases:['jalisco']}], isSystem:false })) }
    let resolveCall = 0
    deps.assignment = { resolve: vi.fn(async () => { resolveCall++; return resolveCall === 1 ? { mode:'manual', executiveId: null } : { mode:'pool', executiveId: 'e2' } }) }
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type:'text', interactiveReplyId:'b1' }) }))
    expect(lead.assignmentMode).toBe('manual')
    await engine.handleInbound(sender, ctx({ message: msg({ type:'text', text:'jalisco' }) }))
    expect(lead.assignmentMode).toBe('manual') // no pisado por ask
    expect(resolveCall).toBe(1) // ask no llamó a resolve (flag assigned)
  })
})

function baseFlow(): FlowDefinition {
  return {
    nodes: {
      welcome: {
        id: 'welcome',
        type: 'interactive_buttons',
        body: 'Hola, no detectamos tu folio. ¿Te ayudo?',
        buttons: [{ id: 'si', title: 'Sí' }, { id: 'no', title: 'No' }],
        transitions: { si: 'closing', no: 'closing' },
        onFreeText: 'reprompt',
      },
      closing: { id: 'closing', type: 'text_message', body: '¡Gracias!' },
    },
  }
}

describe('FlowEngine — campaña base (orphans)', () => {
  it('sin folio + base configurada: enrola en base, envía nodo de entrada', async () => {
    const deps = makeDeps({
      campaigns: { findActiveBase: vi.fn(async () => ({ id: 'base1', flowDefinition: baseFlow() })) },
      conversations: { findById: vi.fn(async () => null), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({
          id: 'leadB', contactId: d.contactId, campaignId: d.campaignId,
          campaign: { id: d.campaignId, flowDefinition: baseFlow() },
          context: d.context, origin: d.origin ?? 'unknown',
        })),
        findById: vi.fn(async () => null),
        save: vi.fn(async (l) => l),
      },
      leadEvents: { record: vi.fn(async (d: unknown) => d) },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaigns.findActiveBase).toHaveBeenCalled()
    expect(deps.campaignLeads.create).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'ct1', campaignId: 'base1', context: expect.objectContaining({ answers: {} }) })
    )
    const createdArg = (deps.campaignLeads.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(createdArg.context.folio).toMatch(/^B-/)
    expect(deps.conversations.setLead).toHaveBeenCalledWith('conv1', 'leadB')
    expect(deps.flowStates.create).toHaveBeenCalledWith(
      expect.objectContaining({ campaignLeadId: 'leadB', currentNodeId: 'welcome', status: 'active' })
    )
    expect(sender.sendInteractiveButtons).toHaveBeenCalledWith(
      expect.objectContaining({ toWaId: '12345', body: 'Hola, no detectamos tu folio. ¿Te ayudo?' })
    )
    expect(deps.leadEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'enrolled', reason: 'base_campaign' })
    )
    expect(sent).toHaveLength(1)
  })

  it('folio presente pero sin captura + base: enrola en base', async () => {
    const deps = makeDeps({
      campaigns: { findActiveBase: vi.fn(async () => ({ id: 'base1', flowDefinition: baseFlow() })) },
      conversations: { findById: vi.fn(async () => null), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({ id: 'leadB', contactId: d.contactId, campaignId: d.campaignId, campaign: { id: d.campaignId, flowDefinition: baseFlow() }, context: d.context, origin: 'unknown' })),
        findById: vi.fn(async () => null),
        save: vi.fn(async (l) => l),
      },
      leadEvents: { record: vi.fn(async (d: unknown) => d) },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: `mi folio es ${FOLIO}` }) }))

    expect(deps.captures.findPendingByFolio).toHaveBeenCalledWith(FOLIO)
    expect(deps.campaignLeads.create).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 'base1' }))
    expect(deps.leadEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'enrolled', reason: 'base_campaign' })
    )
    expect(sent).toHaveLength(1)
  })

  it('sin base configurada: silencioso (no crea lead, no envía)', async () => {
    const deps = makeDeps({
      campaigns: { findActiveBase: vi.fn(async () => null) },
      conversations: { findById: vi.fn(async () => null), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaignLeads.create).not.toHaveBeenCalled()
    expect(deps.conversations.setLead).not.toHaveBeenCalled()
    expect(sender.sendInteractiveButtons).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })

  it('contacto con lead existente (conversation.leadId seteado): no invoca findActiveBase', async () => {
    const flow = demoFlow()
    const lead: CampaignLeadData = {
      id: 'lead1', contactId: 'ct1', campaignId: 'camp1',
      campaign: { id: 'camp1', flowDefinition: flow },
      context: { folio: FOLIO, answers: {} },
    }
    const deps = makeDeps({
      campaigns: { findActiveBase: vi.fn(async () => ({ id: 'base1', flowDefinition: baseFlow() })) },
      conversations: { findById: vi.fn(async () => ({ id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open', leadId: 'lead1' }) as ConversationData), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async () => lead),
        findById: vi.fn(async () => lead),
        findTerminalByContactId: vi.fn(async () => []),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async () => null),
        create: vi.fn(async (d) => ({ id: 'fs1', completedAt: null, ...d })),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaigns.findActiveBase).not.toHaveBeenCalled()
    expect(deps.campaignLeads.create).not.toHaveBeenCalled()
  })

  it('re-engagement: contacto ya enrolado en base reusa campaign_lead (no crea folio nuevo)', async () => {
    const existingLead: CampaignLeadData = {
      id: 'leadB', contactId: 'ct1', campaignId: 'base1',
      campaign: { id: 'base1', flowDefinition: baseFlow() },
      context: { folio: 'B-OLD01', answers: {} },
    }
    const deps = makeDeps({
      campaigns: { findActiveBase: vi.fn(async () => ({ id: 'base1', flowDefinition: baseFlow() })) },
      conversations: { findById: vi.fn(async () => null), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => existingLead),
        create: vi.fn(async () => { throw new Error('no debe crear') }),
        findById: vi.fn(async () => null),
        save: vi.fn(async (l) => l),
      },
      leadEvents: { record: vi.fn(async (d: unknown) => d) },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaignLeads.create).not.toHaveBeenCalled()
    expect(deps.leadEvents.record).not.toHaveBeenCalled()
    expect(deps.conversations.setLead).toHaveBeenCalledWith('conv1', 'leadB')
    expect(sent).toHaveLength(1)
  })
})

// ── Task C2: re-engagement trigger 3 (lead frío sin folio → base) ──

function existingLead(over: Partial<CampaignLeadData> = {}): CampaignLeadData {
  return {
    id: 'leadX', contactId: 'ct1', campaignId: 'campX',
    campaign: { id: 'campX', flowDefinition: demoFlow() },
    context: { folio: FOLIO, answers: {} },
    assignmentMode: null, assignedExecutiveId: null, assignedAt: null,
    status: 'qualified',
    enrolledAt: new Date(Date.now() - 48 * 3600 * 1000),
    origin: 'unknown',
    ...over,
  }
}

function completedState(over: Partial<LeadFlowStateData> = {}): LeadFlowStateData {
  return {
    id: 'fsX', campaignLeadId: 'leadX', currentNodeId: 'welcome',
    context: { folio: FOLIO, answers: {} }, status: 'completed',
    lastInteractionAt: new Date(Date.now() - 25 * 3600 * 1000),
    completedAt: new Date(Date.now() - 25 * 3600 * 1000),
    ...over,
  }
}

function convWithLead(leadId = 'leadX'): ConversationData {
  return {
    id: 'conv1', contactId: 'ct1', contactWaId: '', status: 'open',
    leadId, lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null,
  }
}

function coldReengageDeps(over: Partial<FlowEngineDeps> = {}): FlowEngineDeps {
  return makeDeps({
    campaigns: { findActiveBase: vi.fn(async () => ({ id: 'base1', flowDefinition: baseFlow() })) },
    conversations: {
      findById: vi.fn(async () => convWithLead()),
      setLead: vi.fn(async () => {}),
      touchLastMessage: vi.fn(async () => {}),
    },
    campaignLeads: {
      findByContactAndCampaign: vi.fn(async () => null),
      create: vi.fn(async (d) => ({
        id: 'leadB', contactId: d.contactId, campaignId: d.campaignId,
        campaign: { id: d.campaignId, flowDefinition: baseFlow() },
        context: d.context, origin: 'unknown', status: 'new', enrolledAt: new Date(),
        assignmentMode: null, assignedExecutiveId: null, assignedAt: null,
      })),
      findById: vi.fn(async () => existingLead({ status: 'qualified' })),
      findTerminalByContactId: vi.fn(async () => []),
      save: vi.fn(async (l) => l),
    },
    flowStates: {
      findActiveByCampaignLeadId: vi.fn(async () => null),
      findByCampaignLeadId: vi.fn(async () => completedState()),
      create: vi.fn(async (d) => ({ id: 'fsB', completedAt: null, ...d })),
      save: vi.fn(async (s) => s),
    },
    leadEvents: { record: vi.fn(async (d: unknown) => d), findLatestStatusChangeLeadId: vi.fn(async () => null) } as never,
    ...over,
  })
}

function siblingLead(over: Partial<CampaignLeadData> = {}): CampaignLeadData {
  return {
    id: 'leadS', contactId: 'ct1', campaignId: 'campS',
    campaign: { id: 'campS', flowDefinition: demoFlow() },
    context: { folio: 'MC-SIB', answers: {} },
    assignmentMode: null, assignedExecutiveId: null, assignedAt: null,
    status: 'disqualified',
    enrolledAt: new Date(Date.now() - 48 * 3600 * 1000),
    origin: 'unknown',
    ...over,
  }
}

function siblingColdCompleted(): LeadFlowStateData {
  return {
    id: 'fsS', campaignLeadId: 'leadS', currentNodeId: 'welcome',
    context: { folio: 'MC-SIB', answers: {} }, status: 'completed',
    lastInteractionAt: new Date(Date.now() - 25 * 3600 * 1000),
    completedAt: new Date(Date.now() - 25 * 3600 * 1000),
  }
}

describe('FlowEngine — re-engagement (trigger 3)', () => {
  it('lead qualified + frio (>24h) + sin folio: enrola en base', async () => {
    const deps = coldReengageDeps()
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaigns.findActiveBase).toHaveBeenCalled()
    expect(deps.campaignLeads.create).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 'base1' }))
    expect(deps.conversations.setLead).toHaveBeenCalledWith('conv1', 'leadB')
    expect(sent).toHaveLength(1)
  })

  it('lead disqualified + frio: tambien enrola en base', async () => {
    const deps = coldReengageDeps({
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({
          id: 'leadB', contactId: d.contactId, campaignId: d.campaignId,
          campaign: { id: d.campaignId, flowDefinition: baseFlow() },
          context: d.context, origin: 'unknown', status: 'new', enrolledAt: new Date(),
          assignmentMode: null, assignedExecutiveId: null, assignedAt: null,
        })),
        findById: vi.fn(async () => existingLead({ status: 'disqualified' })),
        save: vi.fn(async (l) => l),
      },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaigns.findActiveBase).toHaveBeenCalled()
    expect(deps.campaignLeads.create).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 'base1' }))
    expect(sent).toHaveLength(1)
  })

  it('lead in_progress + frio: NO enrola en base (silencioso si flow completed)', async () => {
    const deps = coldReengageDeps({
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async () => { throw new Error('no debe crear base') }),
        findById: vi.fn(async () => existingLead({ status: 'in_progress' })),
        findTerminalByContactId: vi.fn(async () => []),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async () => completedState()),
        create: vi.fn(async () => { throw new Error('no debe crear flowState') }),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))
    expect(deps.campaigns.findActiveBase).not.toHaveBeenCalled()
    expect(deps.campaignLeads.create).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })

  it('lead qualified pero DENTRO de ventana (<24h): NO re-engageda (silencioso si flow completed)', async () => {
    const deps = coldReengageDeps({
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async () => { throw new Error('no debe crear') }),
        findById: vi.fn(async () => existingLead({ status: 'qualified' })),
        findTerminalByContactId: vi.fn(async () => []),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async () => completedState({ lastInteractionAt: new Date(Date.now() - 3600 * 1000) })),
        create: vi.fn(async () => { throw new Error('no debe crear') }),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))
    expect(deps.campaigns.findActiveBase).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })

  it('lead qualified + frio pero flow paused: NO re-engageda (agente manual)', async () => {
    const deps = coldReengageDeps({
      campaignLeads: {
        findById: vi.fn(async () => existingLead({ status: 'qualified' })),
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async () => { throw new Error('no debe crear') }),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async () => completedState({ status: 'paused' })),
        create: vi.fn(async () => { throw new Error('no debe crear') }),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))
    expect(deps.campaigns.findActiveBase).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })

  it('lead qualified + frio pero sin base configurada: silencioso', async () => {
    const deps = coldReengageDeps({
      campaigns: { findActiveBase: vi.fn(async () => null) },
      campaignLeads: {
        findById: vi.fn(async () => existingLead({ status: 'qualified' })),
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async () => { throw new Error('no debe crear') }),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async () => completedState()),
        create: vi.fn(async () => { throw new Error('no debe crear') }),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))
    expect(deps.campaignLeads.create).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })
})

describe('FlowEngine — re-engagement por folio (startOrRestartFlow)', () => {
  it('re-engagement por folio de la misma campaña: resetea flowState completed -> active y reenvía welcome', async () => {
    const flow = demoFlow()
    const capture: LeadCaptureData = {
      id: 'cap1', folio: FOLIO, campaignId: 'campX',
      campaign: { id: 'campX', flowDefinition: flow },
      status: 'pending', campaignLeadId: null, origin: 'unknown',
    }
    const leadX = existingLead({ campaign: { id: 'campX', flowDefinition: flow } })
    const completedFs: LeadFlowStateData = {
      id: 'fsX', campaignLeadId: 'leadX', currentNodeId: 'closing_piel',
      context: { folio: FOLIO, answers: {} }, status: 'completed',
      lastInteractionAt: new Date(Date.now() - 25 * 3600 * 1000),
      completedAt: new Date(Date.now() - 25 * 3600 * 1000),
    }
    const deps = makeDeps({
      captures: { findPendingByFolio: vi.fn(async () => capture), markMatched: vi.fn(async () => {}) },
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => leadX),
        create: vi.fn(async () => { throw new Error('no debe crear') }),
        findById: vi.fn(async () => leadX),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async () => completedFs),
        create: vi.fn(async () => { throw new Error('no debe crear') }),
        save: vi.fn(async (s) => s),
      },
      conversations: { findById: vi.fn(async () => null), setLead: vi.fn(async () => {}), touchLastMessage: vi.fn(async () => {}) },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)
    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: `mi folio es ${FOLIO}` }) }))
    // flowState reset a active + completedAt null
    expect(deps.flowStates.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', completedAt: null }))
    expect(deps.flowStates.create).not.toHaveBeenCalled()
    expect(sent).toHaveLength(1)
  })
})

describe('FlowEngine — re-engagement via lead hermano (multi-lead)', () => {
  it('lead conversación new+completed + hermano disqualified frío → enrola en base', async () => {
    const deps = coldReengageDeps({
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({
          id: 'leadB', contactId: d.contactId, campaignId: d.campaignId,
          campaign: { id: d.campaignId, flowDefinition: baseFlow() },
          context: d.context, origin: 'unknown', status: 'new', enrolledAt: new Date(),
          assignmentMode: null, assignedExecutiveId: null, assignedAt: null,
        })),
        findById: vi.fn(async () => existingLead({ status: 'new' })),
        findTerminalByContactId: vi.fn(async () => [siblingLead({ status: 'disqualified' })]),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async (id: string) =>
          id === 'leadX' ? completedState() : siblingColdCompleted()
        ),
        create: vi.fn(async (d) => ({ id: 'fsB', completedAt: null, ...d })),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaignLeads.findTerminalByContactId).toHaveBeenCalledWith('ct1', 'leadX')
    expect(deps.campaigns.findActiveBase).toHaveBeenCalled()
    expect(deps.campaignLeads.create).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 'base1' }))
    expect(deps.conversations.setLead).toHaveBeenCalledWith('conv1', 'leadB')
    expect(sent).toHaveLength(1)
  })

  it('lead conversación new+completed + hermano qualified frío → enrola en base', async () => {
    const deps = coldReengageDeps({
      campaignLeads: {
        findByContactAndCampaign: vi.fn(async () => null),
        create: vi.fn(async (d) => ({
          id: 'leadB', contactId: d.contactId, campaignId: d.campaignId,
          campaign: { id: d.campaignId, flowDefinition: baseFlow() },
          context: d.context, origin: 'unknown', status: 'new', enrolledAt: new Date(),
          assignmentMode: null, assignedExecutiveId: null, assignedAt: null,
        })),
        findById: vi.fn(async () => existingLead({ status: 'new' })),
        findTerminalByContactId: vi.fn(async () => [siblingLead({ status: 'qualified' })]),
        save: vi.fn(async (l) => l),
      },
      flowStates: {
        findActiveByCampaignLeadId: vi.fn(async () => null),
        findByCampaignLeadId: vi.fn(async (id: string) =>
          id === 'leadX' ? completedState() : siblingColdCompleted()
        ),
        create: vi.fn(async (d) => ({ id: 'fsB', completedAt: null, ...d })),
        save: vi.fn(async (s) => s),
      },
    })
    const { sender, sent } = makeSender()
    const engine = new FlowEngine(deps)

    await engine.handleInbound(sender, ctx({ message: msg({ type: 'text', text: 'hola' }) }))

    expect(deps.campaigns.findActiveBase).toHaveBeenCalled()
    expect(sent).toHaveLength(1)
  })
})
