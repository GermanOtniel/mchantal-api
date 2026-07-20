import { HttpError } from '../../auth/http-error'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import { WhatsAppConversationRepository } from '../../whatsapp/repositories/whatsapp-conversation.repository'
import { AssignmentRuleSetRepository } from '../repositories/assignment-rule-set.repository'
import { CampaignExecutiveRepository } from '../repositories/campaign-executive.repository'
import { CampaignLeadRepository } from '../repositories/campaign-lead.repository'
import { UserLeadProfileRepository } from '../repositories/user-lead-profile.repository'
import type { AssignmentRule } from '../types/flow-definition.types'

export class AssignmentRuleService {
  constructor(
    private readonly ruleSets = new AssignmentRuleSetRepository(),
    private readonly campaignLeads = new CampaignLeadRepository()
  ) {}

  listByCampaign(campaignId: string) {
    return this.ruleSets.listByCampaign(campaignId)
  }

  async publishRuleSet(input: {
    campaignId: string
    key: string
    rules: AssignmentRule[]
  }) {
    if (!input.rules.length) {
      throw new HttpError('Rules cannot be empty', 400, 'EMPTY_ASSIGNMENT_RULES')
    }

    const version = await this.ruleSets.getNextVersion(input.campaignId, input.key)

    return this.ruleSets.create({
      campaignId: input.campaignId,
      key: input.key,
      version,
      effectiveFrom: new Date(),
      isActive: true,
      rules: input.rules,
    })
  }
}

export class CampaignLeadService {
  constructor(
    private readonly campaignLeads = new CampaignLeadRepository(),
    private readonly conversations = new WhatsAppConversationRepository(),
    private readonly profiles = new UserLeadProfileRepository(),
    private readonly campaignExecutives = new CampaignExecutiveRepository()
  ) {}

  list(params: {
    campaignId?: string
    statusKey?: string
    assigneeUserId?: string
    limit?: number
  }) {
    return this.campaignLeads.list(params)
  }

  async getById(id: string, viewerUserId: string, permissions: Set<string>) {
    const lead = await this.campaignLeads.findById(id)
    if (!lead) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }

    const onlyAssigned =
      permissions.has(PERMISSIONS.LEADS_INBOX_ASSIGNED) &&
      !permissions.has(PERMISSIONS.LEADS_READ)

    if (onlyAssigned && lead.assigneeUserId !== viewerUserId) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN')
    }

    return lead
  }

  async reassignAssignee(
    leadId: string,
    assigneeUserId: string | null,
    permissions: Set<string>
  ) {
    const canReassign =
      permissions.has(PERMISSIONS.LEADS_REASSIGN) ||
      permissions.has(PERMISSIONS.LEADS_READ)

    if (!canReassign) {
      throw new HttpError('Forbidden', 403, 'FORBIDDEN')
    }

    const lead = await this.campaignLeads.findById(leadId)
    if (!lead) {
      throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
    }

    if (assigneeUserId) {
      const profile = await this.profiles.findByUserId(assigneeUserId)
      if (!profile?.isAcceptingLeads) {
        throw new HttpError('Executive is not accepting leads', 400, 'EXECUTIVE_UNAVAILABLE')
      }

      const eligible = await this.campaignExecutives.isEligibleForCampaign(
        assigneeUserId,
        lead.campaignId
      )
      if (!eligible) {
        throw new HttpError('Executive is not enabled for this campaign', 400, 'EXECUTIVE_NOT_ENABLED')
      }

      if (profile.maxActiveLeads != null) {
        const load = await this.campaignLeads.countActiveByAssignee(assigneeUserId)
        if (load >= profile.maxActiveLeads) {
          throw new HttpError('Executive has reached max active leads', 400, 'EXECUTIVE_AT_CAPACITY')
        }
      }
    }

    lead.assigneeUserId = assigneeUserId
    lead.assignedAt = assigneeUserId ? new Date() : null
    if (assigneeUserId && lead.statusKey === 'nuevo') {
      lead.statusKey = 'asignado'
    }

    const saved = await this.campaignLeads.save(lead)

    const conversation = await this.conversations.findOpenByContactId(lead.contactId)
    if (conversation) {
      await this.conversations.setLeadAndAssignee(
        conversation.id,
        saved.id,
        assigneeUserId
      )
    }

    return this.campaignLeads.findById(saved.id)
  }
}
