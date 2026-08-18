import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { jwtAuthHook } from '../../../shared/auth/jwt-auth.hook'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import {
  loadPermissionsHook,
  requirePermission,
} from '../../../shared/rbac/rbac.hooks'
import { LeadsController } from '../controllers/leads.controller'
import { CampaignLeadRepository } from '../repositories/campaign-lead.repository'
import { LeadListResponseSchema } from '../schemas/leads.schemas'

export const leadsPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const repo = new CampaignLeadRepository()
  const controller = new LeadsController(repo)

  app.addHook('preHandler', jwtAuthHook)
  app.addHook('preHandler', loadPermissionsHook)

  app.get(
    '/',
    {
      preHandler: requirePermission(PERMISSIONS.LEADS_READ),
      schema: { response: { 200: LeadListResponseSchema } },
    },
    controller.list
  )
}