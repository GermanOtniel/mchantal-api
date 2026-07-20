import type { FastifyReply, FastifyRequest } from 'fastify'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import type { Campaign } from '../../../entities/leads/campaign.entity'
import type { LeadCapture } from '../../../entities/leads/lead-capture.entity'
import type { CampaignLead } from '../../../entities/leads/campaign-lead.entity'
import { CampaignService } from '../services/campaign.service'
import { LeadCaptureService } from '../services/lead-capture.service'
import {
  AssignmentRuleService,
  CampaignLeadService,
} from '../services/campaign-lead.service'
import { UserLeadProfileService } from '../services/user-lead-profile.service'
import type {
  CampaignEntryRule,
  CampaignParamDefinition,
} from '../types/campaign-config.types'

function mapCampaign(campaign: Campaign) {
  return {
    id: campaign.id,
    slug: campaign.slug,
    name: campaign.name,
    status: campaign.status,
    paramDefinitions: (campaign.paramDefinitions ?? []) as CampaignParamDefinition[],
    entryRules: (campaign.entryRules ?? []) as CampaignEntryRule[],
    flowDefinition: campaign.flowDefinition ?? {},
    statusDefinitions: campaign.statusDefinitions ?? [],
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  }
}

function mapCapture(capture: LeadCapture) {
  return {
    id: capture.id,
    folio: capture.folio,
    campaignId: capture.campaignId,
    campaignSlug: capture.campaign?.slug,
    campaignName: capture.campaign?.name,
    capturedParams: capture.capturedParams ?? {},
    resolvedIntent: capture.resolvedIntent,
    resolvedMessage: capture.resolvedMessage,
    entryNodeId: capture.entryNodeId,
    status: capture.status,
    createdAt: capture.createdAt.toISOString(),
  }
}

function mapCampaignLead(lead: CampaignLead) {
  return {
    id: lead.id,
    contactId: lead.contactId,
    campaignId: lead.campaignId,
    campaignName: lead.campaign?.name,
    campaignSlug: lead.campaign?.slug,
    leadCaptureId: lead.leadCaptureId,
    folio: lead.leadCapture?.folio ?? null,
    statusKey: lead.statusKey,
    resolvedIntent: lead.resolvedIntent,
    context: lead.context ?? {},
    assigneeUserId: lead.assigneeUserId,
    assigneeName: lead.assignee?.fullName ?? null,
    isSuccessful: lead.isSuccessful,
    successAt: lead.successAt?.toISOString() ?? null,
    assignedAt: lead.assignedAt?.toISOString() ?? null,
    enrolledAt: lead.enrolledAt.toISOString(),
    contactWaId: lead.contact?.waId ?? null,
    contactName: lead.contact?.profileName ?? null,
  }
}

export class LeadsController {
  constructor(
    private readonly campaignService: CampaignService,
    private readonly leadCaptureService: LeadCaptureService,
    private readonly campaignLeadService = new CampaignLeadService(),
    private readonly assignmentRuleService = new AssignmentRuleService(),
    private readonly leadProfileService = new UserLeadProfileService()
  ) {}

  listCampaigns = async (_request: FastifyRequest, reply: FastifyReply) => {
    const campaigns = await this.campaignService.listCampaigns()
    return reply.send({ campaigns: campaigns.map(mapCampaign) })
  }

  getCampaign = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const campaign = await this.campaignService.getCampaign(request.params.id)
    return reply.send(mapCampaign(campaign))
  }

  createCampaign = async (
    request: FastifyRequest<{ Body: Parameters<CampaignService['createCampaign']>[0] }>,
    reply: FastifyReply
  ) => {
    const campaign = await this.campaignService.createCampaign(request.body)
    return reply.status(201).send(mapCampaign(campaign))
  }

  updateCampaign = async (
    request: FastifyRequest<{
      Params: { id: string }
      Body: Parameters<CampaignService['updateCampaign']>[1]
    }>,
    reply: FastifyReply
  ) => {
    const campaign = await this.campaignService.updateCampaign(
      request.params.id,
      request.body
    )
    return reply.send(mapCampaign(campaign))
  }

  createPublicCapture = async (
    request: FastifyRequest<{
      Body: { campaignSlug: string; params: Record<string, string> }
    }>,
    reply: FastifyReply
  ) => {
    const result = await this.leadCaptureService.createPublicCapture(request.body)
    return reply.status(201).send(result)
  }

  listCaptures = async (
    request: FastifyRequest<{
      Querystring: { campaignId?: string; status?: string; limit?: number }
    }>,
    reply: FastifyReply
  ) => {
    const captures = await this.leadCaptureService.listCaptures(request.query)
    return reply.send({ captures: captures.map(mapCapture) })
  }

  listCampaignLeads = async (
    request: FastifyRequest<{
      Querystring: {
        campaignId?: string
        statusKey?: string
        assigneeUserId?: string
        limit?: number
      }
    }>,
    reply: FastifyReply
  ) => {
    const permissions = request.permissions ?? new Set<string>()
    const onlyAssigned =
      permissions.has(PERMISSIONS.LEADS_INBOX_ASSIGNED) &&
      !permissions.has(PERMISSIONS.LEADS_READ)

    const leads = await this.campaignLeadService.list({
      ...request.query,
      assigneeUserId: onlyAssigned ? request.user!.sub : request.query.assigneeUserId,
    })
    return reply.send({ leads: leads.map(mapCampaignLead) })
  }

  getCampaignLead = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const lead = await this.campaignLeadService.getById(
      request.params.id,
      request.user!.sub,
      request.permissions ?? new Set()
    )
    return reply.send(mapCampaignLead(lead))
  }

  reassignCampaignLead = async (
    request: FastifyRequest<{
      Params: { id: string }
      Body: { assigneeUserId: string | null }
    }>,
    reply: FastifyReply
  ) => {
    const lead = await this.campaignLeadService.reassignAssignee(
      request.params.id,
      request.body.assigneeUserId,
      request.permissions ?? new Set()
    )
    return reply.send(mapCampaignLead(lead!))
  }

  listAvailableExecutives = async (
    request: FastifyRequest<{
      Querystring: { campaignId?: string; segments?: string }
    }>,
    reply: FastifyReply
  ) => {
    const segments = request.query.segments
      ? request.query.segments.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined

    const executives = await this.leadProfileService.listAvailableExecutives({
      campaignId: request.query.campaignId,
      segments,
    })
    return reply.send({ executives })
  }

  listAssignmentRules = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const rules = await this.assignmentRuleService.listByCampaign(request.params.id)
    return reply.send({
      ruleSets: rules.map((ruleSet) => ({
        id: ruleSet.id,
        campaignId: ruleSet.campaignId,
        key: ruleSet.key,
        version: ruleSet.version,
        effectiveFrom: ruleSet.effectiveFrom.toISOString(),
        isActive: ruleSet.isActive,
        rules: ruleSet.rules,
        createdAt: ruleSet.createdAt.toISOString(),
      })),
    })
  }

  publishAssignmentRules = async (
    request: FastifyRequest<{
      Params: { id: string }
      Body: { key: string; rules: unknown[] }
    }>,
    reply: FastifyReply
  ) => {
    const ruleSet = await this.assignmentRuleService.publishRuleSet({
      campaignId: request.params.id,
      key: request.body.key,
      rules: request.body.rules as never[],
    })
    return reply.status(201).send({
      id: ruleSet.id,
      campaignId: ruleSet.campaignId,
      key: ruleSet.key,
      version: ruleSet.version,
      effectiveFrom: ruleSet.effectiveFrom.toISOString(),
      isActive: ruleSet.isActive,
      rules: ruleSet.rules,
      createdAt: ruleSet.createdAt.toISOString(),
    })
  }
}
