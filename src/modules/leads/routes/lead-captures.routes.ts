import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { getEnv } from '../../../config/env'
import { CampaignRepository } from '../../campaigns/repositories/campaign.repository'
import { LeadCapturesController } from '../controllers/lead-captures.controller'
import { LeadCaptureRepository } from '../repositories/lead-capture.repository'
import {
  CreateLeadCaptureBodySchema,
  ErrorResponseSchema,
  LeadCaptureResponseSchema,
} from '../schemas/lead-captures.schemas'
import { LeadCaptureService } from '../services/lead-capture.service'

// Endpoint público (sin auth): el lead abre /go/:slug y el frontend lo invoca.
export const publicLeadCapturePlugin: FastifyPluginAsyncTypebox = async (app) => {
  const env = getEnv()
  const campaigns = new CampaignRepository()
  const captures = new LeadCaptureRepository()
  const service = new LeadCaptureService({
    campaigns,
    captures,
    businessPhoneNumberE164: env.whatsapp.businessPhoneNumberE164,
  })
  const controller = new LeadCapturesController(service)

  app.post(
    '/lead-captures',
    {
      schema: {
        body: CreateLeadCaptureBodySchema,
        response: { 200: LeadCaptureResponseSchema, 404: ErrorResponseSchema },
      },
    },
    controller.create
  )
}