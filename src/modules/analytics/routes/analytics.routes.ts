import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { jwtAuthHook } from '../../../shared/auth/jwt-auth.hook'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import {
  loadPermissionsHook,
  requirePermission,
} from '../../../shared/rbac/rbac.hooks'
import { AnalyticsController } from '../controllers/analytics.controller'
import {
  CampaignChartsQuerySchema,
  CampaignChartsSchema,
  CampaignsTableQuerySchema,
  CampaignsTableSchema,
  ErrorResponseSchema,
  IdParamsSchema,
  OverviewChartsQuerySchema,
  OverviewChartsSchema,
  OverviewKpisSchema,
} from '../schemas/analytics.schemas'

export const analyticsPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const controller = new AnalyticsController()

  app.addHook('preHandler', jwtAuthHook)
  app.addHook('preHandler', loadPermissionsHook)

  app.get(
    '/overview/kpis',
    {
      preHandler: requirePermission(PERMISSIONS.ANALYTICS_READ),
      schema: { response: { 200: OverviewKpisSchema, 400: ErrorResponseSchema } },
    },
    controller.overviewKpis
  )

  app.get(
    '/overview/charts',
    {
      preHandler: requirePermission(PERMISSIONS.ANALYTICS_READ),
      schema: {
        querystring: OverviewChartsQuerySchema,
        response: { 200: OverviewChartsSchema, 400: ErrorResponseSchema },
      },
    },
    controller.overviewCharts
  )

  app.get(
    '/overview/campaigns',
    {
      preHandler: requirePermission(PERMISSIONS.ANALYTICS_READ),
      schema: {
        querystring: CampaignsTableQuerySchema,
        response: { 200: CampaignsTableSchema, 400: ErrorResponseSchema },
      },
    },
    controller.overviewCampaignsTable
  )

  app.get(
    '/campaigns/:id/kpis',
    {
      preHandler: requirePermission(PERMISSIONS.ANALYTICS_READ),
      schema: {
        params: IdParamsSchema,
        response: { 200: OverviewKpisSchema, 400: ErrorResponseSchema },
      },
    },
    controller.campaignKpis
  )

  app.get(
    '/campaigns/:id/charts',
    {
      preHandler: requirePermission(PERMISSIONS.ANALYTICS_READ),
      schema: {
        params: IdParamsSchema,
        querystring: CampaignChartsQuerySchema,
        response: { 200: CampaignChartsSchema, 400: ErrorResponseSchema },
      },
    },
    controller.campaignCharts
  )
}