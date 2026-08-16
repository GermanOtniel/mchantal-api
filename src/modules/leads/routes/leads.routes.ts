import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { LeadsController } from '../controllers/leads.controller'
import { CampaignLeadRepository } from '../repositories/campaign-lead.repository'
import { LeadListResponseSchema } from '../schemas/leads.schemas'

// NOTE: endpoints sin auth en esta iteración; protección JWT entra después.
export const leadsPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const repo = new CampaignLeadRepository()
  const controller = new LeadsController(repo)

  app.get('/', { schema: { response: { 200: LeadListResponseSchema } } }, controller.list)
}