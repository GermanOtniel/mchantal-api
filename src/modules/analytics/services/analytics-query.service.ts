import { HttpError } from '../../auth/http-error'
import {
  addDays,
  dayBoundsUtc,
  diffDays,
  startOfMonth,
  startOfWeekMonday,
  todayInTz,
  yesterdayInTz,
} from '../utils/analytics-dates'
import type {
  AnalyticsQueryDeps,
  CampaignPerformance,
  DailyPoint,
  DateRange,
  KpiCard,
  OriginSlice,
  OverviewKpis,
} from '../types/analytics.types'

const MAX_RANGE_DAYS = Number(process.env.MAX_ANALYTICS_RANGE_DAYS ?? 90)

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}

function conversionRate(conversions: number, total: number): number {
  return total === 0 ? 0 : (conversions / total) * 100
}

function buildKpi(value: number, previous: number): KpiCard {
  return { value, previousValue: previous, changePercent: pctChange(value, previous) }
}

function rangeOf(from: string, to: string): DateRange {
  const { start } = dayBoundsUtc(from)
  const { end } = dayBoundsUtc(to)
  return { start, end }
}

export class AnalyticsQueryService {
  constructor(private readonly deps: AnalyticsQueryDeps) {}

  validateRange(from: string, to: string) {
    if (from > to) {
      throw new HttpError('Invalid date range', 400, 'INVALID_DATE_RANGE')
    }
    if (diffDays(from, to) > MAX_RANGE_DAYS) {
      throw new HttpError(
        `Date range cannot exceed ${MAX_RANGE_DAYS} days`,
        400,
        'DATE_RANGE_TOO_LARGE'
      )
    }
  }

  defaultRange() {
    const to = todayInTz()
    return { from: addDays(to, -30), to }
  }

  private async getKpis(campaignId?: string): Promise<OverviewKpis> {
    const today = todayInTz()
    const yesterday = yesterdayInTz()
    const weekStart = startOfWeekMonday(today)
    const prevWeekStart = addDays(weekStart, -7)
    const prevWeekEnd = addDays(weekStart, -1)
    const monthStart = startOfMonth(today)
    const prevMonthStart = startOfMonth(addDays(monthStart, -1))
    const prevMonthEnd = addDays(monthStart, -1)

    const { start: todayStart, end: tomorrow } = dayBoundsUtc(today)
    const { start: yStart, end: yEnd } = dayBoundsUtc(yesterday)

    const leadsToday = await this.deps.countEnrollments(
      { start: todayStart, end: tomorrow },
      campaignId
    )
    const leadsYesterday = await this.deps.countEnrollments(
      { start: yStart, end: yEnd },
      campaignId
    )

    const weekPast = await this.deps.countEnrollments(rangeOf(weekStart, yesterday), campaignId)
    const leadsThisWeek = weekPast + leadsToday
    const leadsPrevWeek = await this.deps.countEnrollments(
      rangeOf(prevWeekStart, prevWeekEnd),
      campaignId
    )

    const monthPast = await this.deps.countEnrollments(rangeOf(monthStart, yesterday), campaignId)
    const leadsThisMonth = monthPast + leadsToday
    const leadsPrevMonth = await this.deps.countEnrollments(
      rangeOf(prevMonthStart, prevMonthEnd),
      campaignId
    )

    const convFrom = addDays(today, -30)
    const convPrevFrom = addDays(convFrom, -30)
    const convPrevTo = addDays(today, -31)
    const convCurrent = await this.conversionRateFor(convFrom, today, campaignId)
    const convPrevious = await this.conversionRateFor(convPrevFrom, convPrevTo, campaignId)

    return {
      leadsToday: buildKpi(leadsToday, leadsYesterday),
      leadsThisWeek: buildKpi(leadsThisWeek, leadsPrevWeek),
      leadsThisMonth: buildKpi(leadsThisMonth, leadsPrevMonth),
      conversionRate: {
        value: convCurrent,
        previousValue: convPrevious,
        changePercent: convPrevious === 0 ? null : convCurrent - convPrevious,
      },
    }
  }

  private async conversionRateFor(from: string, to: string, campaignId?: string): Promise<number> {
    const range = rangeOf(from, to)
    const total = await this.deps.countEnrollments(range, campaignId)
    const conversions = await this.deps.countConversions(range, campaignId)
    return conversionRate(conversions, total)
  }

  async getOverviewKpis(): Promise<OverviewKpis> {
    return this.getKpis()
  }

  async getCampaignKpis(campaignId: string): Promise<OverviewKpis> {
    return this.getKpis(campaignId)
  }

  async getOverviewCharts(
    from: string,
    to: string,
    topN = 10
  ): Promise<{ origins: OriginSlice[]; campaigns: CampaignPerformance[] }> {
    this.validateRange(from, to)
    const range = rangeOf(from, to)
    const origins = await this.deps.groupOrigins(range)
    const campaigns = await this.deps.topCampaigns(range, topN)
    return {
      origins,
      campaigns: campaigns.map((c) => ({
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        campaignSlug: c.campaignSlug,
        enrollments: c.enrollments,
        conversions: c.conversions,
        conversionRate: conversionRate(c.conversions, c.enrollments),
      })),
    }
  }

  async listCampaignsTable(
    from: string,
    to: string,
    page: number,
    limit: number
  ): Promise<{ items: CampaignPerformance[]; page: number; limit: number }> {
    this.validateRange(from, to)
    const range = rangeOf(from, to)
    // Paginación simple sobre top (limit*page) para mantener orden por enrolamientos.
    const topN = Math.max(limit * page, limit)
    const rows = await this.deps.topCampaigns(range, topN)
    const start = (page - 1) * limit
    const slice = rows.slice(start, start + limit)
    return {
      items: slice.map((c) => ({
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        campaignSlug: c.campaignSlug,
        enrollments: c.enrollments,
        conversions: c.conversions,
        conversionRate: conversionRate(c.conversions, c.enrollments),
      })),
      page,
      limit,
    }
  }

  async getCampaignCharts(
    campaignId: string,
    from: string,
    to: string
  ): Promise<{ origins: OriginSlice[]; daily: DailyPoint[] }> {
    this.validateRange(from, to)
    const range = rangeOf(from, to)
    const origins = await this.deps.groupOrigins(range, campaignId)
    const daily = await this.deps.dailySeries(campaignId, range)
    return {
      origins,
      daily: daily.map((d) => ({
        date: d.date,
        enrollments: d.enrollments,
        conversions: d.conversions,
        conversionRate: conversionRate(d.conversions, d.enrollments),
      })),
    }
  }
}