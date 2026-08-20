import { Type } from '@sinclair/typebox'

export const KpiCardSchema = Type.Object({
  value: Type.Number(),
  previousValue: Type.Number(),
  changePercent: Type.Union([Type.Number(), Type.Null()]),
})

export const OverviewKpisSchema = Type.Object({
  leadsToday: KpiCardSchema,
  leadsThisWeek: KpiCardSchema,
  leadsThisMonth: KpiCardSchema,
  conversionRate: KpiCardSchema,
})

export const OriginSliceSchema = Type.Object({
  origin: Type.String(),
  count: Type.Number(),
})

export const CampaignPerformanceSchema = Type.Object({
  campaignId: Type.String(),
  campaignName: Type.String(),
  campaignSlug: Type.String(),
  enrollments: Type.Number(),
  conversions: Type.Number(),
  conversionRate: Type.Number(),
})

export const DailyPointSchema = Type.Object({
  date: Type.String(),
  enrollments: Type.Number(),
  conversions: Type.Number(),
  conversionRate: Type.Number(),
})

export const OverviewChartsSchema = Type.Object({
  origins: Type.Array(OriginSliceSchema),
  campaigns: Type.Array(CampaignPerformanceSchema),
})

export const CampaignsTableSchema = Type.Object({
  items: Type.Array(CampaignPerformanceSchema),
  page: Type.Number(),
  limit: Type.Number(),
})

export const CampaignChartsSchema = Type.Object({
  origins: Type.Array(OriginSliceSchema),
  daily: Type.Array(DailyPointSchema),
})

export const ErrorResponseSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
  details: Type.Optional(Type.Any()),
})

export const IdParamsSchema = Type.Object({
  id: Type.String(),
})

export const OverviewChartsQuerySchema = Type.Object({
  from: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
  topN: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
})

export const CampaignsTableQuerySchema = Type.Object({
  from: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
})

export const CampaignChartsQuerySchema = Type.Object({
  from: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
})