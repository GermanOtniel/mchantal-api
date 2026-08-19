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
import { MatcherDictionaryRepository } from '../../matcher-dictionaries/repositories/matcher-dictionary.repository'
import {
  LeadsPageResponseSchema,
  ListLeadsQuerySchema,
  FilterOptionsResponseSchema,
  LeadIdParamsSchema,
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
}