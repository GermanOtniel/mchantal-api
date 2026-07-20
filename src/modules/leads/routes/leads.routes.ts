import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { getEnv } from '../../../config/env'
import { jwtAuthHook } from '../../../shared/auth/jwt-auth.hook'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import {
  loadPermissionsHook,
  requireAnyPermission,
  requirePermission,
} from '../../../shared/rbac/rbac.hooks'
import { HttpError } from '../../auth/http-error'
import { LeadsController } from '../controllers/leads.controller'
import { createRateLimitHook } from '../middleware/rate-limit.hook'
import {
  CampaignIdParamsSchema,
  CampaignResponseSchema,
  CampaignsListResponseSchema,
  CreateCampaignBodySchema,
  ErrorResponseSchema,
  LeadCaptureResponseSchema,
  LeadCapturesListResponseSchema,
  LeadCapturesQuerySchema,
  CampaignLeadsListResponseSchema,
  CampaignLeadsQuerySchema,
  AssignmentRuleSetsResponseSchema,
  PublishAssignmentRulesBodySchema,
  AssignmentRuleSetResponseSchema,
  AvailableExecutivesQuerySchema,
  AvailableExecutivesResponseSchema,
  CampaignLeadIdParamsSchema,
  CampaignLeadResponseSchema,
  ReassignCampaignLeadBodySchema,
  PublicLeadCaptureBodySchema,
  PublicLeadCaptureResponseSchema,
  UpdateCampaignBodySchema,
} from '../schemas/leads.schemas'
import { CampaignService } from '../services/campaign.service'
import { LeadCaptureService } from '../services/lead-capture.service'

export const publicLeadsPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const env = getEnv()
  const leadCaptureService = new LeadCaptureService()
  const controller = new LeadsController(new CampaignService(), leadCaptureService)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
      })
    }
    const statusCode = (error as { statusCode?: number }).statusCode
    const code = (error as { code?: string }).code
    if (statusCode === 429) {
      return reply.status(429).send({
        error: 'Too many requests',
        code: code ?? 'RATE_LIMITED',
      })
    }
    throw error
  })

  app.post(
    '/lead-captures',
    {
      preHandler: createRateLimitHook(env.publicCaptureRateLimit),
      schema: {
        body: PublicLeadCaptureBodySchema,
        response: {
          201: PublicLeadCaptureResponseSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          429: ErrorResponseSchema,
          503: ErrorResponseSchema,
        },
      },
    },
    controller.createPublicCapture
  )
}

export const leadsPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const campaignService = new CampaignService()
  const leadCaptureService = new LeadCaptureService()
  const controller = new LeadsController(campaignService, leadCaptureService)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
      })
    }
    throw error
  })

  app.addHook('preHandler', jwtAuthHook)
  app.addHook('preHandler', loadPermissionsHook)

  app.get(
    '/campaigns',
    {
      preHandler: requireAnyPermission(
        PERMISSIONS.CAMPAIGNS_MANAGE,
        PERMISSIONS.LEADS_READ
      ),
      schema: {
        response: {
          200: CampaignsListResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.listCampaigns
  )

  app.get(
    '/campaigns/:id',
    {
      preHandler: requireAnyPermission(
        PERMISSIONS.CAMPAIGNS_MANAGE,
        PERMISSIONS.LEADS_READ
      ),
      schema: {
        params: CampaignIdParamsSchema,
        response: {
          200: CampaignResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    controller.getCampaign
  )

  app.post(
    '/campaigns',
    {
      preHandler: requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE),
      schema: {
        body: CreateCampaignBodySchema,
        response: {
          201: CampaignResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    controller.createCampaign
  )

  app.patch(
    '/campaigns/:id',
    {
      preHandler: requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE),
      schema: {
        params: CampaignIdParamsSchema,
        body: UpdateCampaignBodySchema,
        response: {
          200: CampaignResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    controller.updateCampaign
  )

  app.get(
    '/lead-captures',
    {
      preHandler: requirePermission(PERMISSIONS.LEADS_READ),
      schema: {
        querystring: LeadCapturesQuerySchema,
        response: {
          200: LeadCapturesListResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.listCaptures
  )

  app.get(
    '/campaign-leads',
    {
      preHandler: requireAnyPermission(
        PERMISSIONS.LEADS_READ,
        PERMISSIONS.LEADS_INBOX_ASSIGNED
      ),
      schema: {
        querystring: CampaignLeadsQuerySchema,
        response: {
          200: CampaignLeadsListResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.listCampaignLeads
  )

  app.get(
    '/campaign-leads/:id',
    {
      preHandler: requireAnyPermission(
        PERMISSIONS.LEADS_READ,
        PERMISSIONS.LEADS_INBOX_ASSIGNED
      ),
      schema: {
        params: CampaignLeadIdParamsSchema,
        response: {
          200: CampaignLeadResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    controller.getCampaignLead
  )

  app.patch(
    '/campaign-leads/:id/assignee',
    {
      preHandler: requireAnyPermission(
        PERMISSIONS.LEADS_REASSIGN,
        PERMISSIONS.LEADS_READ
      ),
      schema: {
        params: CampaignLeadIdParamsSchema,
        body: ReassignCampaignLeadBodySchema,
        response: {
          200: CampaignLeadResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    controller.reassignCampaignLead
  )

  app.get(
    '/executives/available',
    {
      preHandler: requireAnyPermission(
        PERMISSIONS.LEADS_READ,
        PERMISSIONS.LEADS_REASSIGN,
        PERMISSIONS.CAMPAIGNS_MANAGE
      ),
      schema: {
        querystring: AvailableExecutivesQuerySchema,
        response: {
          200: AvailableExecutivesResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.listAvailableExecutives
  )

  app.get(
    '/campaigns/:id/assignment-rules',
    {
      preHandler: requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE),
      schema: {
        params: CampaignIdParamsSchema,
        response: {
          200: AssignmentRuleSetsResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.listAssignmentRules
  )

  app.post(
    '/campaigns/:id/assignment-rules',
    {
      preHandler: requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE),
      schema: {
        params: CampaignIdParamsSchema,
        body: PublishAssignmentRulesBodySchema,
        response: {
          201: AssignmentRuleSetResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.publishAssignmentRules
  )
}
