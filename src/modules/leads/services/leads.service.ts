import { HttpError } from '../../auth/http-error'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import { LEAD_STATUSES } from '../types/leads.types'
import type {
  CampaignLeadRepositoryPort,
  LeadDetailResponse,
  LeadEventResponse,
  LeadFilterOptions,
  LeadItemResponse,
  LeadListItem,
  LeadQAItem,
  LeadEventsRepositoryPort,
  LeadsPageResponse,
  ListLeadsQuery,
  MatcherDictionaryResolverPort,
  WhatsAppConversationRepositoryWidePort,
  WhatsAppContactRepositoryPort,
} from '../types/leads.types'
import type { MatcherDictionaryData } from '../../matcher-dictionaries/types/dictionary.types'
import type { CampaignRepositoryPort } from '../../campaigns/types/campaign.types'
import type {
  ExecutiveRepositoryPort,
  AvailableExecutive,
} from '../../executives/types/executives.types'
import type { LeadFlowStateRepositoryPort } from '../types/leads.types'

function toResponse(l: LeadListItem): LeadItemResponse {
  return {
    id: l.id,
    folio: l.folio,
    campaignId: l.campaignId,
    campaignName: l.campaignName,
    contactWaId: l.contactWaId,
    contactName: l.contactName,
    answers: l.answers,
    assignmentMode: l.assignmentMode,
    assignedExecutiveId: l.assignedExecutiveId,
    assignedExecutiveName: l.assignedExecutiveName,
    assignedAt: l.assignedAt ? l.assignedAt.toISOString() : null,
    enrolledAt: l.enrolledAt.toISOString(),
    status: l.status,
    needsReply: l.needsReply,
  }
}

export class LeadsService {
  constructor(
    private readonly campaignLeads: CampaignLeadRepositoryPort,
    private readonly conversations: WhatsAppConversationRepositoryWidePort,
    private readonly campaigns: CampaignRepositoryPort,
    private readonly executives: ExecutiveRepositoryPort,
    private readonly flowStates: LeadFlowStateRepositoryPort,
    private readonly dictionaries: MatcherDictionaryResolverPort,
    private readonly contacts: WhatsAppContactRepositoryPort,
    private readonly leadEvents: LeadEventsRepositoryPort,
    private readonly pageSize: number,
  ) {}

  async listLeads(input: {
    permissions: Set<string>
    userId: string
    query: ListLeadsQuery
  }): Promise<LeadsPageResponse> {
    const { permissions, userId, query } = input
    if (!permissions.has(PERMISSIONS.LEADS_READ)) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN')
    }

    const scopeAll = permissions.has(PERMISSIONS.LEADS_READ_ALL)
    const scopeUserId = scopeAll ? null : userId

    const page = query.page ?? 1
    if (page < 1) {
      throw new HttpError('Invalid page', 400, 'INVALID_PAGE')
    }

    let status = query.status
    if (status !== undefined) {
      if (permissions.has(PERMISSIONS.LEADS_FILTER_STATUS)) {
        if (!LEAD_STATUSES.includes(status as never)) {
          throw new HttpError('Invalid status', 400, 'INVALID_STATUS')
        }
      } else {
        status = undefined
      }
    }

    const campaignId = permissions.has(PERMISSIONS.LEADS_FILTER_CAMPAIGN) ? query.campaignId : undefined
    const assignment = permissions.has(PERMISSIONS.LEADS_FILTER_ASSIGNMENT) ? query.assignment : undefined
    const q = query.q

    const { items, total } = await this.campaignLeads.listLeads({
      scopeUserId,
      campaignId,
      status,
      assignment,
      q,
      page,
      pageSize: this.pageSize,
    })

    const totalPages = total === 0 ? 0 : Math.ceil(total / this.pageSize)
    return {
      items: items.map(toResponse),
      page,
      pageSize: this.pageSize,
      total,
      totalPages,
    }
  }

  async filterOptions(input: {
    permissions: Set<string>
    userId: string
  }): Promise<LeadFilterOptions> {
    if (!input.permissions.has(PERMISSIONS.LEADS_READ)) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN')
    }

    let campaigns: { id: string; name: string }[] = []
    if (input.permissions.has(PERMISSIONS.LEADS_FILTER_CAMPAIGN)) {
      const all = await this.campaigns.listAll()
      campaigns = all.map((c) => ({ id: c.id, name: c.name }))
    }

    let executives: { id: string; fullName: string }[] = []
    if (input.permissions.has(PERMISSIONS.LEADS_FILTER_ASSIGNMENT)) {
      const active = await this.executives.findAllActive()
      executives = active.map((e) => ({ id: e.id, fullName: e.fullName }))
    }

    return { campaigns, executives }
  }

  async clearNeedsReply(input: {
    permissions: Set<string>
    userId: string
    leadId: string
  }): Promise<void> {
    const { permissions, userId, leadId } = input
    if (!permissions.has(PERMISSIONS.LEADS_CLEAR_NEEDS_REPLY)) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN')
    }
    const lead = await this.campaignLeads.findById(leadId)
    if (!lead) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }
    const scopeAll = permissions.has(PERMISSIONS.LEADS_READ_ALL)
    if (!scopeAll && lead.assignedExecutiveId !== userId) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }
    const updated = await this.conversations.clearNeedsReplyByLeadId(leadId)
    if (!updated) {
      throw new HttpError('No open conversation for lead', 404, 'NO_OPEN_CONVERSATION')
    }
  }

  async getLead(input: {
    permissions: Set<string>
    userId: string
    leadId: string
  }): Promise<LeadDetailResponse> {
    const { permissions, userId, leadId } = input
    if (!permissions.has(PERMISSIONS.LEADS_ATTEND)) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN')
    }
    const lead = await this.campaignLeads.findById(leadId)
    if (!lead) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }
    const scopeAll = permissions.has(PERMISSIONS.LEADS_READ_ALL)
    if (!scopeAll && lead.assignedExecutiveId !== userId) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }

    const contact = lead.contactId ? await this.contacts.findById(lead.contactId) : null
    const conversation = await this.conversations.findOpenByLeadId(leadId)
    const flowState = await this.flowStates.findByCampaignLeadId(leadId)

    // Q&A
    const answers = (flowState?.context.answers as Record<string, string> | undefined) ?? {}
    const flow = lead.campaign.flowDefinition
    const dictCache = new Map<string, MatcherDictionaryData | null>()
    const qa: LeadQAItem[] = []
    for (const node of Object.values(flow?.nodes ?? {})) {
      if (node.type === 'interactive_buttons') {
        const replyId = answers[node.id]
        if (replyId === undefined) continue
        const button = node.buttons.find((b) => b.id === replyId)
        qa.push({ storeAs: node.id, prompt: node.body, value: button?.title ?? replyId })
        continue
      }
      if (node.type !== 'text_input' && node.type !== 'free_text') continue
      const raw = answers[node.storeAs]
      if (raw === undefined) continue
      let value = raw
      if (node.type === 'text_input') {
        let dict = dictCache.get(node.matcher.dictionaryId)
        if (!dictCache.has(node.matcher.dictionaryId)) {
          dict = await this.dictionaries.findById(node.matcher.dictionaryId)
          dictCache.set(node.matcher.dictionaryId, dict)
        }
        value = dict?.categories.find((c) => c.id === raw)?.label ?? raw
      }
      qa.push({ storeAs: node.storeAs, prompt: node.body, value })
    }

    const needsReply =
      conversation != null &&
      conversation.lastMessageDirection === 'inbound' &&
      conversation.lastMessageAt != null &&
      (conversation.needsReplyClearedAt == null ||
        conversation.lastMessageAt > conversation.needsReplyClearedAt)

    let assignedExecutive: { id: string; fullName: string } | null = null
    if (lead.assignedExecutiveId) {
      const exec = await this.executives.findById(lead.assignedExecutiveId)
      if (exec) assignedExecutive = { id: exec.id, fullName: exec.fullName }
    }

    return {
      id: lead.id,
      folio: lead.context.folio ?? null,
      campaignId: lead.campaignId,
      campaignName: lead.campaign.name,
      contact: { name: contact?.profileName ?? null, waId: contact?.waId ?? '' },
      status: lead.status,
      assignedExecutive,
      needsReply,
      enrolledAt: lead.enrolledAt.toISOString(),
      flowState: flowState?.status ?? null,
      conversationId: conversation?.id ?? null,
      answers: qa,
    }
  }

  async getTimeline(input: {
    permissions: Set<string>
    userId: string
    leadId: string
  }): Promise<LeadEventResponse[]> {
    const { permissions, userId, leadId } = input
    if (!permissions.has(PERMISSIONS.LEADS_ATTEND)) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN')
    }
    const lead = await this.campaignLeads.findById(leadId)
    if (!lead) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }
    const scopeAll = permissions.has(PERMISSIONS.LEADS_READ_ALL)
    if (!scopeAll && lead.assignedExecutiveId !== userId) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }
    const events = await this.leadEvents.listByLead(leadId)
    return events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))
  }

  async reassign(input: {
    permissions: Set<string>
    userId: string
    leadId: string
    assigneeUserId: string | null
    reason: string
  }): Promise<void> {
    const { permissions, userId, leadId, assigneeUserId, reason } = input
    if (!permissions.has(PERMISSIONS.LEADS_REASSIGN)) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN')
    }
    const lead = await this.campaignLeads.findById(leadId)
    if (!lead) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }
    const scopeAll = permissions.has(PERMISSIONS.LEADS_READ_ALL)
    if (!scopeAll && lead.assignedExecutiveId !== userId) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }
    if (!reason.trim()) {
      throw new HttpError('Reason required', 400, 'REASON_REQUIRED')
    }
    const prev = lead.assignedExecutiveId ?? null
    lead.assignedExecutiveId = assigneeUserId
    lead.assignedAt = assigneeUserId ? new Date() : null
    await this.campaignLeads.save(lead)
    await this.leadEvents.record({
      leadId,
      type: 'reassignment',
      fromValue: prev,
      toValue: assigneeUserId,
      reason,
      milestoneKind: null,
      actorUserId: userId,
    })
  }

  async changeStatus(input: {
    permissions: Set<string>
    userId: string
    leadId: string
    status: string
    reason: string
  }): Promise<void> {
    const { permissions, userId, leadId, status, reason } = input
    if (!permissions.has(PERMISSIONS.LEADS_CHANGE_STATUS)) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN')
    }
    const lead = await this.campaignLeads.findById(leadId)
    if (!lead) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }
    const scopeAll = permissions.has(PERMISSIONS.LEADS_READ_ALL)
    if (!scopeAll && lead.assignedExecutiveId !== userId) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }
    if (!LEAD_STATUSES.includes(status as never)) {
      throw new HttpError('Invalid status', 400, 'INVALID_STATUS')
    }
    if (status === lead.status) {
      throw new HttpError('Same status', 400, 'SAME_STATUS')
    }
    if (!reason.trim()) {
      throw new HttpError('Reason required', 400, 'REASON_REQUIRED')
    }
    const prev = lead.status
    lead.status = status
    await this.campaignLeads.save(lead)
    await this.leadEvents.record({
      leadId,
      type: 'status_change',
      fromValue: prev,
      toValue: status,
      reason,
      milestoneKind: null,
      actorUserId: userId,
    })
  }

  async resumeFlow(input: {
    permissions: Set<string>
    userId: string
    leadId: string
  }): Promise<void> {
    const { permissions, userId, leadId } = input
    if (!permissions.has(PERMISSIONS.LEADS_ATTEND)) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN')
    }
    const lead = await this.campaignLeads.findById(leadId)
    if (!lead) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }
    const scopeAll = permissions.has(PERMISSIONS.LEADS_READ_ALL)
    if (!scopeAll && lead.assignedExecutiveId !== userId) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }
    const flowState = await this.flowStates.findByCampaignLeadId(leadId)
    if (!flowState || flowState.status !== 'paused') {
      throw new HttpError('Flow not paused', 400, 'FLOW_NOT_PAUSED')
    }
    await this.flowStates.save({ ...flowState, status: 'active' })
  }

  async listExecutives(input: {
    permissions: Set<string>
    userId: string
    leadId: string
  }): Promise<AvailableExecutive[]> {
    const { permissions, userId, leadId } = input
    if (!permissions.has(PERMISSIONS.LEADS_REASSIGN)) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN')
    }
    const lead = await this.campaignLeads.findById(leadId)
    if (!lead) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }
    const scopeAll = permissions.has(PERMISSIONS.LEADS_READ_ALL)
    if (!scopeAll && lead.assignedExecutiveId !== userId) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }
    return this.executives.listAvailableForCampaign(lead.campaignId)
  }
}