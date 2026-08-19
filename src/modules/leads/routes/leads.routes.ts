import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { jwtAuthHook } from '../../../shared/auth/jwt-auth.hook'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import {
  loadPermissionsHook,
  requirePermission,
} from '../../../shared/rbac/rbac.hooks'
import { LeadsController } from '../controllers/leads.controller'
import { LeadsService } from '../services/leads.service'
import { CampaignLeadRepository } from '../repositories/campaign-lead.repository'
import { WhatsAppConversationRepository } from '../../whatsapp/repositories/whatsapp-conversation.repository'
import { WhatsAppContactRepository } from '../../whatsapp/repositories/whatsapp-contact.repository'
import { CampaignRepository } from '../../campaigns/repositories/campaign.repository'
import { ExecutiveRepository } from '../../executives/repositories/executive.repository'
import { LeadFlowStateRepository } from '../repositories/lead-flow-state.repository'
import { LeadEventsRepository } from '../repositories/lead-event.repository'
import { MatcherDictionaryRepository } from '../../matcher-dictionaries/repositories/matcher-dictionary.repository'
import {
  LeadsPageResponseSchema,
  ListLeadsQuerySchema,
  FilterOptionsResponseSchema,
  LeadIdParamsSchema,
  LeadDetailResponseSchema,
  LeadTimelineResponseSchema,
  ReassignBodySchema,
  ChangeStatusBodySchema,
  ExecutivesResponseSchema,
} from '../schemas/leads.schemas'

const PAGE_SIZE = 50

export const leadsPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const service = new LeadsService(
    new CampaignLeadRepository(),
    new WhatsAppConversationRepository(),
    new CampaignRepository(),
    new ExecutiveRepository(),
    new LeadFlowStateRepository(),
    new MatcherDictionaryRepository(),
    new WhatsAppContactRepository(),
    new LeadEventsRepository(),
    PAGE_SIZE
  )
  const controller = new LeadsController(service)

  app.addHook('preHandler', jwtAuthHook)
  app.addHook('preHandler', loadPermissionsHook)

  app.get(
    '/',
    {
      preHandler: requirePermission(PERMISSIONS.LEADS_READ),
      schema: { querystring: ListLeadsQuerySchema, response: { 200: LeadsPageResponseSchema } },
    },
    controller.list
  )

  app.get(
    '/filter-options',
    {
      preHandler: requirePermission(PERMISSIONS.LEADS_READ),
      schema: { response: { 200: FilterOptionsResponseSchema } },
    },
    controller.filterOptions
  )

  app.post(
    '/:id/clear-needs-reply',
    {
      preHandler: requirePermission(PERMISSIONS.LEADS_CLEAR_NEEDS_REPLY),
      schema: { params: LeadIdParamsSchema, response: { 204: { type: 'null' } } },
    },
    controller.clearNeedsReply
  )

  app.get(
    '/:id',
    {
      preHandler: requirePermission(PERMISSIONS.LEADS_ATTEND),
      schema: { params: LeadIdParamsSchema, response: { 200: LeadDetailResponseSchema } },
    },
    controller.getLead
  )

  app.get(
    '/:id/timeline',
    {
      preHandler: requirePermission(PERMISSIONS.LEADS_ATTEND),
      schema: { params: LeadIdParamsSchema, response: { 200: LeadTimelineResponseSchema } },
    },
    controller.getTimeline
  )

  app.post(
    '/:id/reassign',
    {
      preHandler: requirePermission(PERMISSIONS.LEADS_REASSIGN),
      schema: {
        params: LeadIdParamsSchema,
        body: ReassignBodySchema,
        response: { 204: { type: 'null' } },
      },
    },
    controller.reassign
  )

  app.post(
    '/:id/status',
    {
      preHandler: requirePermission(PERMISSIONS.LEADS_CHANGE_STATUS),
      schema: {
        params: LeadIdParamsSchema,
        body: ChangeStatusBodySchema,
        response: { 204: { type: 'null' } },
      },
    },
    controller.changeStatus
  )

  app.post(
    '/:id/resume-flow',
    {
      preHandler: requirePermission(PERMISSIONS.LEADS_ATTEND),
      schema: { params: LeadIdParamsSchema, response: { 204: { type: 'null' } } },
    },
    controller.resumeFlow
  )

  app.get(
    '/:id/executives',
    {
      preHandler: requirePermission(PERMISSIONS.LEADS_REASSIGN),
      schema: { params: LeadIdParamsSchema, response: { 200: ExecutivesResponseSchema } },
    },
    controller.listExecutives
  )
}