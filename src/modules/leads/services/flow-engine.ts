import type { WhatsAppSender } from '../../../shared/whatsapp/whatsapp-sender.interface'
import type { NormalizedMessage } from '../../../shared/whatsapp/types/inbound.types'
import type {
  FlowDefinition,
  InteractiveButtonsNode,
  TextInputNode,
  FreeTextNode,
} from '../../campaigns/types/flow.types'
import type { AssignmentDirective } from '../../executives/types/assignment.types'
import type {
  CampaignLeadData,
  FlowEngineDeps,
  InboundFlowContext,
  LeadFlowStateData,
} from '../types/leads.types'
import { FOLIO_REGEX } from './folio.service'
import { classify } from '../../matcher-dictionaries/services/classifier'
import type { MessageRealtimePayload } from '../../whatsapp/realtime/types'

export class FlowEngine {
  constructor(private readonly deps: FlowEngineDeps) {}

  async handleInbound(sender: WhatsAppSender, ctx: InboundFlowContext): Promise<void> {
    const folio = extractFolio(ctx.message)
    if (folio) {
      const enrolled = await this.enrollFromFolio(sender, ctx, folio)
      if (enrolled) return
    }

    const conversation = await this.deps.conversations.findById(ctx.conversationId)
    if (!conversation?.leadId) return

    const lead = await this.deps.campaignLeads.findById(conversation.leadId)
    if (!lead) return

    const flowState = await this.deps.flowStates.findActiveByCampaignLeadId(lead.id)
    if (!flowState) return

    await this.processFlowInput(sender, ctx, lead, flowState)
  }

  private async enrollFromFolio(
    sender: WhatsAppSender,
    ctx: InboundFlowContext,
    folio: string
  ): Promise<boolean> {
    const capture = await this.deps.captures.findPendingByFolio(folio)
    if (!capture) return false

    let lead = await this.deps.campaignLeads.findByContactAndCampaign(
      ctx.contactId,
      capture.campaignId
    )
    if (!lead) {
      lead = await this.deps.campaignLeads.create({
        contactId: ctx.contactId,
        campaignId: capture.campaignId,
        context: { folio: capture.folio, answers: {} },
        origin: capture.origin,
      })
      await this.deps.leadEvents?.record({
        leadId: lead.id,
        type: 'enrolled',
        fromValue: null,
        toValue: null,
        reason: null,
        milestoneKind: null,
        actorUserId: null,
      })
    }

    await this.deps.captures.markMatched(capture.id, lead.id)
    await this.deps.conversations.setLead(ctx.conversationId, lead.id)

    const entryNodeId = findFirstInteractiveNode(capture.campaign.flowDefinition)
    if (!entryNodeId) return true

    let flowState = await this.deps.flowStates.findByCampaignLeadId(lead.id)
    if (!flowState) {
      flowState = await this.deps.flowStates.create({
        campaignLeadId: lead.id,
        currentNodeId: entryNodeId,
        context: lead.context,
        status: 'active',
        lastInteractionAt: new Date(),
      })
    }

    await this.executeNode(sender, ctx, lead, flowState, entryNodeId)
    return true
  }

  private async processFlowInput(
    sender: WhatsAppSender,
    ctx: InboundFlowContext,
    lead: CampaignLeadData,
    flowState: LeadFlowStateData
  ): Promise<void> {
    const flow = lead.campaign.flowDefinition
    const currentNode = flow.nodes[flowState.currentNodeId]
    if (!currentNode) return

    if (currentNode.type === 'interactive_buttons') {
      const replyId = ctx.message.interactiveReplyId
      if (replyId && currentNode.transitions[replyId]) {
        const prevAnswers = (flowState.context.answers as Record<string, string> | undefined) ?? {}
        const answers = { ...prevAnswers, [currentNode.id]: replyId }
        flowState.context = { ...flowState.context, answers }
        await this.deps.flowStates.save(flowState)
        await this.executeNode(sender, ctx, lead, flowState, currentNode.transitions[replyId])
        return
      }

      if (
        ctx.message.type === 'text' &&
        (currentNode.onFreeText === 'reprompt' || currentNode.onFreeText === undefined)
      ) {
        await this.executeNode(sender, ctx, lead, flowState, flowState.currentNodeId)
      }
      return
    }

    if (currentNode.type === 'text_input') {
      await this.processTextInput(sender, ctx, lead, flowState, currentNode)
    } else if (currentNode.type === 'free_text') {
      await this.processFreeText(sender, ctx, lead, flowState, currentNode)
    }
  }

  private async processTextInput(
    sender: WhatsAppSender,
    ctx: InboundFlowContext,
    lead: CampaignLeadData,
    flowState: LeadFlowStateData,
    node: TextInputNode
  ): Promise<void> {
    // Sólo texto libre dispara clasificación; cualquier otra cosa → reprompt
    if (ctx.message.type !== 'text' || !ctx.message.text) {
      await this.repromptOrFallback(sender, ctx, lead, flowState, node)
      return
    }

    const dictionary = await this.deps.dictionaries.findById(node.matcher.dictionaryId)
    if (!dictionary) return

    const result = classify(ctx.message.text, dictionary.categories)
    if (!result) {
      await this.repromptOrFallback(sender, ctx, lead, flowState, node)
      return
    }

    // Guarda la respuesta detectada en answers[storeAs]
    const prevAnswers = (flowState.context.answers as Record<string, string> | undefined) ?? {}
    const answers = { ...prevAnswers, [node.storeAs]: result.categoryId }
    flowState.context = { ...flowState.context, answers }
    await this.deps.flowStates.save(flowState)

    // Resuelve la directiva de asignación (override por categoría gana al default)
    const directive: AssignmentDirective | undefined =
      node.assignmentOverrides?.[result.categoryId] ?? node.assignment
    if (directive) {
      const assignmentResult = await this.deps.assignment.resolve(directive, flowState.context)
      lead.assignmentMode = assignmentResult.mode
      lead.assignedExecutiveId = assignmentResult.executiveId
      lead.assignedAt = new Date()
      await this.deps.campaignLeads.save(lead)
    }

    // Avanza a la transición de la categoría (override) o al defaultTransition
    const target = node.transitions[result.categoryId] ?? node.defaultTransition
    if (target) {
      await this.executeNode(sender, ctx, lead, flowState, target)
    } else {
      // Sin transición: el text_input es terminal → completa el flujo
      flowState.status = 'completed'
      flowState.completedAt = new Date()
      await this.deps.flowStates.save(flowState)
    }
  }

  private async repromptOrFallback(
    sender: WhatsAppSender,
    ctx: InboundFlowContext,
    lead: CampaignLeadData,
    flowState: LeadFlowStateData,
    node: TextInputNode
  ): Promise<void> {
    const fallback = node.fallback
    if (typeof fallback === 'object' && fallback !== null) {
      await this.executeNode(sender, ctx, lead, flowState, fallback.transition)
    } else {
      // 'reprompt' o undefined → reenvía el prompt
      await this.executeNode(sender, ctx, lead, flowState, flowState.currentNodeId)
    }
  }

  private async processFreeText(
    sender: WhatsAppSender,
    ctx: InboundFlowContext,
    lead: CampaignLeadData,
    flowState: LeadFlowStateData,
    node: FreeTextNode
  ): Promise<void> {
    // Sólo el texto libre se captura; otro tipo de mensaje se ignora (queda esperando)
    if (ctx.message.type !== 'text' || !ctx.message.text) return

    const prevAnswers = (flowState.context.answers as Record<string, string> | undefined) ?? {}
    const answers = { ...prevAnswers, [node.storeAs]: ctx.message.text }
    flowState.context = { ...flowState.context, answers }
    await this.deps.flowStates.save(flowState)

    if (node.nextNodeId) {
      await this.executeNode(sender, ctx, lead, flowState, node.nextNodeId)
    } else {
      flowState.status = 'completed'
      flowState.completedAt = new Date()
      await this.deps.flowStates.save(flowState)
    }
  }

  private async executeNode(
    sender: WhatsAppSender,
    ctx: InboundFlowContext,
    lead: CampaignLeadData,
    flowState: LeadFlowStateData,
    nodeId: string
  ): Promise<void> {
    const flow = lead.campaign.flowDefinition
    const node = flow.nodes[nodeId]
    if (!node) return

    flowState.currentNodeId = nodeId
    flowState.lastInteractionAt = new Date()
    await this.deps.flowStates.save(flowState)

    if (node.type === 'interactive_buttons') {
      await this.sendInteractive(sender, ctx, flowState, node)
    } else if (node.type === 'text_message') {
      await this.sendText(sender, ctx, flowState, node.body, { nodeId: node.id })
      if (node.nextNodeId) {
        await this.executeNode(sender, ctx, lead, flowState, node.nextNodeId)
      } else {
        flowState.status = 'completed'
        flowState.completedAt = new Date()
        await this.deps.flowStates.save(flowState)
      }
    } else {
      // text_input / free_text: envía el prompt y espera el siguiente mensaje del lead
      await this.sendText(sender, ctx, flowState, node.body, { nodeId: node.id })
    }
  }

  private async sendInteractive(
    sender: WhatsAppSender,
    ctx: InboundFlowContext,
    flowState: LeadFlowStateData,
    node: InteractiveButtonsNode
  ): Promise<void> {
    const body = interpolate(node.body, String(flowState.context.folio ?? ''), flowState.context)
    const result = await sender.sendInteractiveButtons({
      toWaId: ctx.waId,
      body,
      buttons: node.buttons,
    })
    await this.persistOutbound(ctx, {
      providerMessageId: result.providerMessageId,
      type: 'interactive_buttons',
      bodyText: body,
      metadata: { nodeId: node.id, buttons: node.buttons },
    })
  }

  private async sendText(
    sender: WhatsAppSender,
    ctx: InboundFlowContext,
    flowState: LeadFlowStateData,
    body: string,
    opts: { nodeId?: string } = {}
  ): Promise<void> {
    const text = interpolate(body, String(flowState.context.folio ?? ''), flowState.context)
    const result = await sender.sendTextMessage({ toWaId: ctx.waId, text })
    await this.persistOutbound(ctx, {
      providerMessageId: result.providerMessageId,
      type: 'text',
      bodyText: text,
      metadata: { nodeId: opts.nodeId },
    })
  }

  private async persistOutbound(
    ctx: InboundFlowContext,
    data: {
      providerMessageId: string
      type: string
      bodyText: string
      metadata: Record<string, unknown>
    }
  ): Promise<void> {
    const sentAt = new Date()
    const saved = await this.deps.messages.create({
      conversationId: ctx.conversationId,
      direction: 'outbound',
      providerMessageId: data.providerMessageId,
      type: data.type,
      bodyText: data.bodyText,
      status: 'pending',
      sentAt,
      metadata: data.metadata,
    })
    await this.deps.conversations.touchLastMessage(ctx.conversationId, sentAt, 'outbound')

    const conversation = await this.deps.conversations.findById(ctx.conversationId)
    const leadId = conversation?.leadId ?? null
    if (leadId) {
      await this.deps.leadEvents?.record({
        leadId,
        type: 'message_milestone',
        fromValue: null,
        toValue: null,
        reason: null,
        milestoneKind: 'last_outbound',
        actorUserId: null,
      })
    }
    this.deps.realtimeBus?.publish({
      type: 'message.created',
      payload: {
        conversationId: ctx.conversationId,
        message: {
          id: saved.id,
          conversationId: saved.conversationId,
          direction: saved.direction,
          providerMessageId: saved.providerMessageId,
          type: saved.type,
          bodyText: saved.bodyText,
          status: saved.status as MessageRealtimePayload['status'],
          sentAt: saved.sentAt.toISOString(),
        },
      },
    })
    this.deps.realtimeBus?.publish({
      type: 'conversation.updated',
      payload: {
        conversationId: ctx.conversationId,
        lastMessageAt: sentAt.toISOString(),
        lastMessageDirection: 'outbound',
        needsReply: false,
      },
    })
  }
}

function extractFolio(message: NormalizedMessage): string | null {
  const haystack = [message.text, message.interactiveReplyTitle].filter(Boolean).join(' ')
  const match = haystack.match(FOLIO_REGEX)
  return match?.[0] ?? null
}

function findFirstInteractiveNode(flow: FlowDefinition): string | null {
  const nodes = flow.nodes ?? {}
  if (flow.entryNodeId && nodes[flow.entryNodeId]?.type === 'interactive_buttons') {
    return flow.entryNodeId
  }
  const welcome = nodes['welcome']
  if (welcome && welcome.type === 'interactive_buttons') return 'welcome'
  const node = Object.values(nodes).find((n) => n.type === 'interactive_buttons')
  return node?.id ?? null
}

function interpolate(
  template: string,
  folio: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, expr: string) => {
    if (expr === 'folio') return folio
    const [root, ...rest] = expr.split('.')
    let cur: unknown = context[root]
    for (const k of rest) {
      cur = (cur as Record<string, unknown> | undefined)?.[k]
    }
    return cur === undefined || cur === null ? '' : String(cur)
  })
}