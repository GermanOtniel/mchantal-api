import { HttpError } from '../../auth/http-error'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import { LEAD_STATUSES } from '../types/leads.types'
import type {
  CampaignLeadRepositoryPort,
  LeadFilterOptions,
  LeadItemResponse,
  LeadListItem,
  LeadsPageResponse,
  ListLeadsQuery,
  WhatsAppConversationRepositoryWidePort,
} from '../types/leads.types'
import type { CampaignRepositoryPort } from '../../campaigns/types/campaign.types'
import type { ExecutiveRepositoryPort } from '../../executives/types/executives.types'

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
}