export type KpiCard = {
  value: number
  previousValue: number
  changePercent: number | null
}

export type OverviewKpis = {
  leadsToday: KpiCard
  leadsThisWeek: KpiCard
  leadsThisMonth: KpiCard
  conversionRate: KpiCard
}

export type OriginSlice = {
  origin: string
  count: number
}

export type CampaignPerformance = {
  campaignId: string
  campaignName: string
  campaignSlug: string
  enrollments: number
  conversions: number
  conversionRate: number
}

export type DailyPoint = {
  date: string
  enrollments: number
  conversions: number
  conversionRate: number
}

export type DateRange = { start: Date; end: Date }

export type AnalyticsQueryDeps = {
  /** Cuenta enrolamientos (campaign_leads) en el rango, opcionalmente por campaña. */
  countEnrollments(range: DateRange, campaignId?: string): Promise<number>
  /** Cuenta conversiones (eventos status_change→qualified) en el rango, opcionalmente por campaña. */
  countConversions(range: DateRange, campaignId?: string): Promise<number>
  /** Agrupa enrolamientos por origen en el rango, opcionalmente por campaña. */
  groupOrigins(
    range: DateRange,
    campaignId?: string
  ): Promise<OriginSlice[]>
  /** Top campañas por enrolamientos en el rango (con conversiones). */
  topCampaigns(
    range: DateRange,
    topN: number
  ): Promise<
    Array<{
      campaignId: string
      campaignName: string
      campaignSlug: string
      enrollments: number
      conversions: number
    }>
  >
  /** Serie diaria (por día calendario en TZ negocio) de enrolamientos y conversiones para una campaña. */
  dailySeries(campaignId: string, range: DateRange): Promise<DailyPoint[]>
}