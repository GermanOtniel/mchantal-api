import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { CampaignsController } from '../controllers/campaigns.controller'
import { CampaignRepository } from '../repositories/campaign.repository'
import { CampaignService } from '../services/campaign.service'
import {
  CampaignListResponseSchema,
  CampaignResponseSchema,
  CreateCampaignBodySchema,
  ErrorResponseSchema,
  IdParamsSchema,
  UpdateCampaignBodySchema,
} from '../schemas/campaigns.schemas'

// NOTE: endpoints abiertos (sin auth) en esta iteracion; proteccion JWT entra despues.
export const campaignsPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const repo = new CampaignRepository()
  const service = new CampaignService(repo)
  const controller = new CampaignsController(service)

  app.get(
    '/',
    { schema: { response: { 200: CampaignListResponseSchema } } },
    controller.list
  )

  app.post(
    '/',
    {
      schema: {
        body: CreateCampaignBodySchema,
        response: { 201: CampaignResponseSchema, 400: ErrorResponseSchema },
      },
    },
    controller.create
  )

  app.get(
    '/:id',
    {
      schema: {
        params: IdParamsSchema,
        response: { 200: CampaignResponseSchema, 404: ErrorResponseSchema },
      },
    },
    controller.getById
  )

  app.patch(
    '/:id',
    {
      schema: {
        params: IdParamsSchema,
        body: UpdateCampaignBodySchema,
        response: {
          200: CampaignResponseSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    controller.update
  )
}