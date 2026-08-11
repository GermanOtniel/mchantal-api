import type { WhatsAppSender } from '../../../shared/whatsapp/whatsapp-sender.interface'
import type { NormalizedMessage } from '../../../shared/whatsapp/types/inbound.types'
import type {
  FlowDefinition,
  InteractiveButtonsNode,
} from '../../campaigns/types/flow.types'
import type {
  CampaignLeadData,
  FlowEngineDeps,
  InboundFlowContext,
  LeadFlowStateData,
} from '../types/leads.types'

/** Folio generado por folio.service (traído en step 4): MC- + 5 chars del charset. */
export const FOLIO_REGEX = /\bMC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}\b/

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
      await this.sendInteractive(sender, ctx, lead, node)
    } else {
      await this.sendText(sender, ctx, lead, node.body, { nodeId: node.id })
      if (node.nextNodeId) {
        await this.executeNode(sender, ctx, lead, flowState, node.nextNodeId)
      } else {
        flowState.status = 'completed'
        flowState.completedAt = new Date()
        await this.deps.flowStates.save(flowState)
      }
    }
  }

  private async sendInteractive(
    sender: WhatsAppSender,
    ctx: InboundFlowContext,
    lead: CampaignLeadData,
    node: InteractiveButtonsNode
  ): Promise<void> {
    const body = interpolate(node.body, lead.context.folio ?? '', lead.context)
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
    lead: CampaignLeadData,
    body: string,
    opts: { nodeId?: string } = {}
  ): Promise<void> {
    const text = interpolate(body, lead.context.folio ?? '', lead.context)
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
    await this.deps.messages.create({
      conversationId: ctx.conversationId,
      direction: 'outbound',
      providerMessageId: data.providerMessageId,
      type: data.type,
      bodyText: data.bodyText,
      status: 'pending',
      sentAt: new Date(),
      metadata: data.metadata,
    })
  }
}

function extractFolio(message: NormalizedMessage): string | null {
  const haystack = [message.text, message.interactiveReplyTitle].filter(Boolean).join(' ')
  const match = haystack.match(FOLIO_REGEX)
  return match?.[0] ?? null
}

function findFirstInteractiveNode(flow: FlowDefinition): string | null {
  const node = Object.values(flow.nodes ?? {}).find((n) => n.type === 'interactive_buttons')
  return node?.id ?? null
}

function interpolate(
  template: string,
  folio: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key === 'folio') return folio
    return String(context[key] ?? '')
  })
}