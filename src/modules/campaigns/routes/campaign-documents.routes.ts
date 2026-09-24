import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { jwtAuthHook } from '../../../shared/auth/jwt-auth.hook'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import {
  loadPermissionsHook,
  requirePermission,
} from '../../../shared/rbac/rbac.hooks'
import { CampaignDocumentsController } from '../controllers/campaign-documents.controller'
import { CampaignDocumentRepository } from '../repositories/campaign-document.repository'
import { CampaignRepository } from '../repositories/campaign.repository'
import { CampaignDocumentService } from '../services/campaign-document.service'
import {
  CampaignDocumentErrorResponseSchema,
  CampaignDocumentListResponseSchema,
  CampaignDocumentResponseSchema,
} from '../schemas/campaign-document.schemas'

export const campaignDocumentsPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const campaignRepo = new CampaignRepository()
  const docRepo = new CampaignDocumentRepository()
  const docService = new CampaignDocumentService(docRepo, campaignRepo)
  const controller = new CampaignDocumentsController(docService)

  app.addHook('preHandler', jwtAuthHook)
  app.addHook('preHandler', loadPermissionsHook)

  app.get(
    '/:campaignId/documents',
    {
      preHandler: requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE),
      schema: {
        response: { 200: CampaignDocumentListResponseSchema },
      },
    },
    controller.list
  )

  app.post(
    '/:campaignId/documents',
    {
      preHandler: requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE),
      schema: {
        response: {
          201: CampaignDocumentResponseSchema,
          400: CampaignDocumentErrorResponseSchema,
        },
      },
    },
    controller.upload
  )

  app.delete(
    '/:campaignId/documents/:id',
    {
      preHandler: requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE),
      schema: {
        response: {
          204: { type: 'null' },
          404: CampaignDocumentErrorResponseSchema,
        },
      },
    },
    controller.delete
  )
}