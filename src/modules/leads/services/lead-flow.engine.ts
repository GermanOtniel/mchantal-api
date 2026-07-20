import type { WhatsAppProvider } from '../../../shared/whatsapp/whatsapp-provider.interface'
import type { NormalizedMessage } from '../../../shared/whatsapp/types/inbound.types'
import type { Campaign } from '../../../entities/leads/campaign.entity'
import type { CampaignLead } from '../../../entities/leads/campaign-lead.entity'
import type { LeadFlowState } from '../../../entities/leads/lead-flow-state.entity'
import { FOLIO_REGEX } from './folio.service'
import { interpolateTemplate } from './entry-rules.evaluator'
import { AssignmentEngine } from './assignment.engine'
import { CampaignLeadRepository } from '../repositories/campaign-lead.repository'
import { LeadCaptureRepository } from '../repositories/lead-capture.repository'
import { LeadFlowStateRepository } from '../repositories/lead-flow-state.repository'
import { WhatsAppConversationRepository } from '../../whatsapp/repositories/whatsapp-conversation.repository'
import { WhatsAppMessageRepository } from '../../whatsapp/repositories/whatsapp-message.repository'
import type {
  CampaignStatusDefinition,
  FlowDefinition,
  FlowNode,
} from '../types/flow-definition.types'

export type InboundFlowContext = {
  conversationId: string
  contactId: string
  waId: string
  message: NormalizedMessage
}

export class LeadFlowEngine {
  constructor(
    private readonly captures = new LeadCaptureRepository(),
    private readonly campaignLeads = new CampaignLeadRepository(),
    private readonly flowStates = new LeadFlowStateRepository(),
    private readonly conversations = new WhatsAppConversationRepository(),
    private readonly messages = new WhatsAppMessageRepository(),
    private readonly assignment = new AssignmentEngine()
  ) {}

  async handleInbound(
    provider: WhatsAppProvider,
    ctx: InboundFlowContext
  ): Promise<void> {
    const folio = this.extractFolio(ctx.message)
    if (folio) {
      const enrolled = await this.enrollFromFolio(provider, ctx, folio)
      if (enrolled) return
    }

    const conversation = await this.conversations.findById(ctx.conversationId)
    if (!conversation?.leadId) {
      const activeLead = await this.campaignLeads.findActiveByContactId(ctx.contactId)
      if (!activeLead) return
      await this.conversations.setLeadAndAssignee(
        ctx.conversationId,
        activeLead.id,
        activeLead.assigneeUserId
      )
      conversation!.leadId = activeLead.id
    }

    if (!conversation?.leadId) return

    const campaignLead = await this.campaignLeads.findById(conversation.leadId)
    if (!campaignLead) return

    const flowState = await this.flowStates.findActiveByCampaignLeadId(campaignLead.id)
    if (!flowState) return

    await this.processFlowInput(provider, ctx, campaignLead, flowState)
  }

  private extractFolio(message: NormalizedMessage): string | null {
    const haystack = [message.text, message.interactiveReplyTitle]
      .filter(Boolean)
      .join(' ')
    const match = haystack.match(FOLIO_REGEX)
    return match?.[0] ?? null
  }

  private async enrollFromFolio(
    provider: WhatsAppProvider,
    ctx: InboundFlowContext,
    folio: string
  ): Promise<boolean> {
    const capture = await this.captures.findPendingByFolio(folio)
    if (!capture?.campaign) return false

    let campaignLead = await this.campaignLeads.findByContactAndCampaign(
      ctx.contactId,
      capture.campaignId
    )

    if (!campaignLead) {
      const initialContext = capture.initialContext ?? {}
      const statusDefinitions = (capture.campaign.statusDefinitions ??
        []) as CampaignStatusDefinition[]
      const initialStatus =
        statusDefinitions.find((s) => s.isInitial)?.key ?? 'nuevo'

      campaignLead = await this.campaignLeads.create({
        contactId: ctx.contactId,
        campaignId: capture.campaignId,
        leadCaptureId: capture.id,
        statusKey: initialStatus,
        resolvedIntent: capture.resolvedIntent,
        context: {
          ...initialContext,
          folio: capture.folio,
          answers: {},
          tags: [],
        },
      })
    }

    await this.captures.markMatched(capture.id, campaignLead.id)
    await this.conversations.setLeadAndAssignee(
      ctx.conversationId,
      campaignLead.id,
      campaignLead.assigneeUserId
    )

    const entryNodeId =
      capture.entryNodeId ?? this.findFirstInteractiveNode(capture.campaign)

    if (!entryNodeId) return true

    let flowState = await this.flowStates.findByCampaignLeadId(campaignLead.id)
    if (!flowState) {
      flowState = await this.flowStates.create({
        campaignLeadId: campaignLead.id,
        currentNodeId: entryNodeId,
        context: campaignLead.context,
        status: 'active',
        lastInteractionAt: new Date(),
      })
    }

    const freshLead = await this.campaignLeads.findById(campaignLead.id)
    if (!freshLead) return true

    await this.executeNode(provider, ctx, freshLead, flowState, entryNodeId)
    return true
  }

  private findFirstInteractiveNode(campaign: Campaign): string | null {
    const flow = campaign.flowDefinition as FlowDefinition
    const nodes = flow?.nodes ?? {}
    const interactive = Object.values(nodes).find(
      (node) => node.type === 'interactive_buttons'
    )
    return interactive?.id ?? null
  }

  private async processFlowInput(
    provider: WhatsAppProvider,
    ctx: InboundFlowContext,
    campaignLead: CampaignLead,
    flowState: LeadFlowState
  ): Promise<void> {
    const flow = campaignLead.campaign.flowDefinition as FlowDefinition
    const currentNode = flow?.nodes?.[flowState.currentNodeId]
    if (!currentNode) return

    if (currentNode.type === 'interactive_buttons') {
      const replyId = ctx.message.interactiveReplyId
      if (replyId && currentNode.transitions[replyId]) {
        const answers = {
          ...((flowState.context.answers as Record<string, string>) ?? {}),
          [currentNode.id]: replyId,
        }
        flowState.context = { ...flowState.context, answers }
        await this.flowStates.save(flowState)
        await this.executeNode(
          provider,
          ctx,
          campaignLead,
          flowState,
          currentNode.transitions[replyId]
        )
        return
      }

      if (ctx.message.type === 'text' && currentNode.onFreeText === 'fallback_node') {
        if (currentNode.fallbackNodeId) {
          await this.executeNode(
            provider,
            ctx,
            campaignLead,
            flowState,
            currentNode.fallbackNodeId
          )
        }
        return
      }

      if (
        ctx.message.type === 'text' &&
        (currentNode.onFreeText === 'reprompt' || !currentNode.onFreeText)
      ) {
        await this.executeNode(
          provider,
          ctx,
          campaignLead,
          flowState,
          currentNode.id
        )
      }
    }
  }

  private async executeNode(
    provider: WhatsAppProvider,
    ctx: InboundFlowContext,
    campaignLead: CampaignLead,
    flowState: LeadFlowState,
    nodeId: string
  ): Promise<void> {
    const flow = campaignLead.campaign.flowDefinition as FlowDefinition
    const node = flow?.nodes?.[nodeId]
    if (!node) return

    flowState.currentNodeId = nodeId
    flowState.lastInteractionAt = new Date()
    await this.flowStates.save(flowState)

    switch (node.type) {
      case 'interactive_buttons':
        await this.sendInteractive(provider, ctx, campaignLead, node)
        break
      case 'text_message':
        await this.sendText(provider, ctx, campaignLead, node.body)
        if (node.nextNodeId) {
          await this.executeNode(provider, ctx, campaignLead, flowState, node.nextNodeId)
        }
        break
      case 'set_context':
        flowState.context = {
          ...flowState.context,
          ...node.values,
          answers: {
            ...((flowState.context.answers as Record<string, string>) ?? {}),
            ...node.values,
          },
        }
        campaignLead.context = flowState.context
        await this.flowStates.save(flowState)
        await this.campaignLeads.save(campaignLead)
        await this.executeNode(provider, ctx, campaignLead, flowState, node.nextNodeId)
        break
      case 'set_intent':
        campaignLead.resolvedIntent = node.value
        flowState.context = { ...flowState.context, intent: node.value }
        await this.campaignLeads.save(campaignLead)
        await this.flowStates.save(flowState)
        await this.executeNode(provider, ctx, campaignLead, flowState, node.nextNodeId)
        break
      case 'set_status':
        await this.applyStatus(campaignLead, node.statusKey)
        if (node.nextNodeId) {
          await this.executeNode(provider, ctx, campaignLead, flowState, node.nextNodeId)
        }
        break
      case 'assign_executive':
        await this.assignExecutive(provider, ctx, campaignLead, flowState, node)
        break
      case 'handoff':
        if (node.message) {
          await this.sendText(provider, ctx, campaignLead, node.message)
        }
        flowState.status = 'handed_off'
        flowState.completedAt = new Date()
        await this.flowStates.save(flowState)
        break
      default:
        break
    }
  }

  private async assignExecutive(
    provider: WhatsAppProvider,
    ctx: InboundFlowContext,
    campaignLead: CampaignLead,
    flowState: LeadFlowState,
    node: Extract<FlowNode, { type: 'assign_executive' }>
  ): Promise<void> {
    const assigneeUserId = await this.assignment.resolveAssignee(
      campaignLead,
      node.ruleSetKey
    )

    if (assigneeUserId) {
      campaignLead.assigneeUserId = assigneeUserId
      campaignLead.assignedAt = new Date()
      campaignLead.statusKey = 'asignado'
      await this.campaignLeads.save(campaignLead)
      await this.conversations.setLeadAndAssignee(
        ctx.conversationId,
        campaignLead.id,
        assigneeUserId
      )
    }

    if (node.messageAfterAssign) {
      const body = interpolateTemplate(node.messageAfterAssign, '', {
        ...(campaignLead.context as Record<string, string>),
        folio: String((campaignLead.context as Record<string, unknown>).folio ?? ''),
      })
      await this.sendText(provider, ctx, campaignLead, body)
    }

    flowState.status = 'handed_off'
    flowState.completedAt = new Date()
    await this.flowStates.save(flowState)
  }

  private async applyStatus(campaignLead: CampaignLead, statusKey: string) {
    campaignLead.statusKey = statusKey
    const statusDefinitions = (campaignLead.campaign.statusDefinitions ??
      []) as CampaignStatusDefinition[]
    const definition = statusDefinitions.find((s) => s.key === statusKey)
    if (definition?.isSuccess && !campaignLead.isSuccessful) {
      campaignLead.isSuccessful = true
      campaignLead.successAt = new Date()
    }
    if (definition?.isTerminal) {
      campaignLead.closedAt = new Date()
    }
    await this.campaignLeads.save(campaignLead)
  }

  private async sendInteractive(
    provider: WhatsAppProvider,
    ctx: InboundFlowContext,
    campaignLead: CampaignLead,
    node: Extract<FlowNode, { type: 'interactive_buttons' }>
  ) {
    const body = interpolateTemplate(node.body, '', {
      ...(campaignLead.context as Record<string, string>),
      folio: String((campaignLead.context as Record<string, unknown>).folio ?? ''),
      intent: campaignLead.resolvedIntent ?? '',
    })

    const result = await provider.sendInteractiveButtons({
      toWaId: ctx.waId,
      body,
      buttons: node.buttons,
    })

    await this.persistOutbound(ctx.conversationId, {
      providerMessageId: result.providerMessageId,
      type: 'interactive_buttons',
      bodyText: body,
      metadata: { buttons: node.buttons, nodeId: node.id },
    })
  }

  private async sendText(
    provider: WhatsAppProvider,
    ctx: InboundFlowContext,
    campaignLead: CampaignLead,
    body: string
  ) {
    const text = interpolateTemplate(body, '', {
      ...(campaignLead.context as Record<string, string>),
      folio: String((campaignLead.context as Record<string, unknown>).folio ?? ''),
      intent: campaignLead.resolvedIntent ?? '',
    })

    const result = await provider.sendTextMessage({
      toWaId: ctx.waId,
      text,
    })

    await this.persistOutbound(ctx.conversationId, {
      providerMessageId: result.providerMessageId,
      type: 'text',
      bodyText: text,
      metadata: { automated: true },
    })
  }

  private async persistOutbound(
    conversationId: string,
    data: {
      providerMessageId: string
      type: string
      bodyText: string
      metadata: Record<string, unknown>
    }
  ) {
    const sentAt = new Date()
    await this.messages.create({
      conversationId,
      direction: 'outbound',
      providerMessageId: data.providerMessageId,
      type: data.type,
      bodyText: data.bodyText,
      status: 'pending',
      sentAt,
      metadata: data.metadata,
    })
    await this.conversations.touchLastMessage(conversationId, sentAt, 'outbound')
  }
}
