import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { jwtAuthHook } from '../../../shared/auth/jwt-auth.hook'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import {
  loadPermissionsHook,
  requirePermission,
} from '../../../shared/rbac/rbac.hooks'
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

export const campaignsPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const repo = new CampaignRepository()
  const service = new CampaignService(repo)
  const controller = new CampaignsController(service)

  app.addHook('preHandler', jwtAuthHook)
  app.addHook('preHandler', loadPermissionsHook)

  app.get(
    '/',
    {
      preHandler: requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE),
      schema: { response: { 200: CampaignListResponseSchema } },
    },
    controller.list
  )

  app.post(
    '/',
    {
      preHandler: requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE),
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
      preHandler: requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE),
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
      preHandler: requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE),
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