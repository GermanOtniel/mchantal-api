import { Type } from '@sinclair/typebox'

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
  code: Type.Optional(Type.String()),
})

export const AnalyticsDateRangeQuerySchema = Type.Object({
  from: Type.Optional(Type.String({ format: 'date' })),
  to: Type.Optional(Type.String({ format: 'date' })),
  topN: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
})

export const AnalyticsCampaignsTableQuerySchema = Type.Object({
  from: Type.Optional(Type.String({ format: 'date' })),
  to: Type.Optional(Type.String({ format: 'date' })),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
})

export const CampaignIdParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export const KpiCardSchema = Type.Object({
  value: Type.Number(),
  previousValue: Type.Number(),
  changePercent: Type.Union([Type.Number(), Type.Null()]),
})

export const OverviewKpisResponseSchema = Type.Object({
  leadsToday: KpiCardSchema,
  leadsThisWeek: KpiCardSchema,
  leadsThisMonth: KpiCardSchema,
  conversionRate: KpiCardSchema,
})

export const OverviewChartsResponseSchema = Type.Object({
  origins: Type.Array(
    Type.Object({
      origin: Type.String(),
      count: Type.Number(),
    })
  ),
  campaigns: Type.Array(
    Type.Object({
      campaignId: Type.String({ format: 'uuid' }),
      campaignName: Type.String(),
      campaignSlug: Type.String(),
      enrollments: Type.Number(),
      conversions: Type.Number(),
      conversionRate: Type.Number(),
    })
  ),
})

export const CampaignsTableResponseSchema = Type.Object({
  items: Type.Array(
    Type.Object({
      campaignId: Type.String({ format: 'uuid' }),
      campaignName: Type.String(),
      campaignSlug: Type.String(),
      enrollments: Type.Number(),
      conversions: Type.Number(),
      conversionRate: Type.Number(),
    })
  ),
  page: Type.Number(),
  limit: Type.Number(),
})

export const CampaignChartsResponseSchema = Type.Object({
  origins: Type.Array(
    Type.Object({
      origin: Type.String(),
      count: Type.Number(),
    })
  ),
  daily: Type.Array(
    Type.Object({
      date: Type.String(),
      enrollments: Type.Number(),
      conversions: Type.Number(),
      conversionRate: Type.Number(),
    })
  ),
})
