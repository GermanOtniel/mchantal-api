import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { jwtAuthHook } from '../../../shared/auth/jwt-auth.hook'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import {
  loadPermissionsHook,
  requireAnyPermission,
  requirePermission,
} from '../../../shared/rbac/rbac.hooks'
import { HttpError } from '../../auth/http-error'
import { AnalyticsController } from '../controllers/analytics.controller'
import {
  AnalyticsCampaignsTableQuerySchema,
  AnalyticsDateRangeQuerySchema,
  CampaignChartsResponseSchema,
  CampaignIdParamsSchema,
  CampaignsTableResponseSchema,
  ErrorResponseSchema,
  OverviewChartsResponseSchema,
  OverviewKpisResponseSchema,
} from '../schemas/analytics.schemas'

export const analyticsPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const controller = new AnalyticsController()

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
    '/overview/kpis',
    {
      preHandler: requirePermission(PERMISSIONS.ANALYTICS_READ),
      schema: {
        response: {
          200: OverviewKpisResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.overviewKpis
  )

  app.get(
    '/overview/charts',
    {
      preHandler: requirePermission(PERMISSIONS.ANALYTICS_READ),
      schema: {
        querystring: AnalyticsDateRangeQuerySchema,
        response: {
          200: OverviewChartsResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.overviewCharts
  )

  app.get(
    '/overview/campaigns',
    {
      preHandler: requirePermission(PERMISSIONS.ANALYTICS_READ),
      schema: {
        querystring: AnalyticsCampaignsTableQuerySchema,
        response: {
          200: CampaignsTableResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.overviewCampaignsTable
  )

  app.get(
    '/campaigns/:id/kpis',
    {
      preHandler: requireAnyPermission(
        PERMISSIONS.ANALYTICS_READ,
        PERMISSIONS.CAMPAIGNS_MANAGE
      ),
      schema: {
        params: CampaignIdParamsSchema,
        response: {
          200: OverviewKpisResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.campaignKpis
  )

  app.get(
    '/campaigns/:id/charts',
    {
      preHandler: requireAnyPermission(
        PERMISSIONS.ANALYTICS_READ,
        PERMISSIONS.CAMPAIGNS_MANAGE
      ),
      schema: {
        params: CampaignIdParamsSchema,
        querystring: AnalyticsDateRangeQuerySchema,
        response: {
          200: CampaignChartsResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.campaignCharts
  )
}
