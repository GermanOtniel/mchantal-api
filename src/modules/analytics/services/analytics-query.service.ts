import { AppDataSource } from '../../../database/data-source'
import { CampaignLead } from '../../../entities/leads/campaign-lead.entity'
import { HttpError } from '../../auth/http-error'
import {
  AnalyticsDailyCampaignRepository,
  AnalyticsDailyGlobalRepository,
} from '../repositories/analytics-daily.repository'
import {
  addDays,
  dayBoundsUtc,
  diffDays,
  startOfMonth,
  startOfWeekMonday,
  todayInTz,
  yesterdayInTz,
} from '../utils/analytics-dates'
import {
  extractOriginFromEnrollment,
} from '../utils/analytics-origin.utils'

const MAX_RANGE_DAYS = Number(process.env.MAX_ANALYTICS_RANGE_DAYS ?? 90)

type KpiCard = {
  value: number
  previousValue: number
  changePercent: number | null
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}

function conversionRate(successful: number, total: number): number {
  if (total === 0) return 0
  return (successful / total) * 100
}

async function listOriginsFromEnrollments(
  from: string,
  to: string,
  campaignId?: string
): Promise<Array<{ origin: string; count: number }>> {
  const { start } = dayBoundsUtc(from)
  const { end } = dayBoundsUtc(to)

  const qb = AppDataSource.getRepository(CampaignLead)
    .createQueryBuilder('cl')
    .leftJoinAndSelect('cl.leadCapture', 'lc')
    .where('cl.enrolledAt >= :start AND cl.enrolledAt < :end', { start, end })

  if (campaignId) {
    qb.andWhere('cl.campaignId = :campaignId', { campaignId })
  }

  const leads = await qb.getMany()
  const merged: Record<string, number> = {}

  for (const lead of leads) {
    const origin = extractOriginFromEnrollment(lead)
    merged[origin] = (merged[origin] ?? 0) + 1
  }

  return Object.entries(merged)
    .map(([origin, count]) => ({ origin, count }))
    .sort((a, b) => b.count - a.count)
}

export class AnalyticsQueryService {
  constructor(
    private readonly globalRepo = new AnalyticsDailyGlobalRepository(),
    private readonly campaignRepo = new AnalyticsDailyCampaignRepository()
  ) {}

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
    const from = addDays(to, -30)
    return { from, to }
  }

  private async countEnrollmentsLive(from: Date, to: Date) {
    return AppDataSource.getRepository(CampaignLead)
      .createQueryBuilder('cl')
      .where('cl.enrolledAt >= :from AND cl.enrolledAt < :to', { from, to })
      .getCount()
  }

  private async conversionInRange(from: string, to: string) {
    const { start } = dayBoundsUtc(from)
    const { end } = dayBoundsUtc(to)

    const total = await AppDataSource.getRepository(CampaignLead)
      .createQueryBuilder('cl')
      .where('cl.enrolledAt >= :start AND cl.enrolledAt < :end', { start, end })
      .getCount()

    const successful = await AppDataSource.getRepository(CampaignLead)
      .createQueryBuilder('cl')
      .where('cl.enrolledAt >= :start AND cl.enrolledAt < :end', { start, end })
      .andWhere('cl.isSuccessful = true')
      .getCount()

    return conversionRate(successful, total)
  }

  async getOverviewKpis() {
    const today = todayInTz()
    const yesterday = yesterdayInTz()
    const weekStart = startOfWeekMonday(today)
    const prevWeekStart = addDays(weekStart, -7)
    const prevWeekEnd = addDays(weekStart, -1)
    const monthStart = startOfMonth(today)
    const prevMonthStart = startOfMonth(addDays(monthStart, -1))
    const prevMonthEnd = addDays(monthStart, -1)

    const { start: todayStart, end: tomorrowStart } = dayBoundsUtc(today)

    const leadsToday = await this.countEnrollmentsLive(todayStart, tomorrowStart)

    const yesterdaySum = await this.globalRepo.sumBetween(yesterday, yesterday)
    const leadsYesterday = Number(yesterdaySum?.enrollments ?? 0)

    const weekRows = await this.globalRepo.findBetween(weekStart, yesterday)
    const weekEnrollments = weekRows.reduce((sum, r) => sum + r.enrollmentsCount, 0)
    const leadsThisWeek = weekEnrollments + leadsToday

    const prevWeekRows = await this.globalRepo.findBetween(prevWeekStart, prevWeekEnd)
    const leadsPrevWeek = prevWeekRows.reduce((sum, r) => sum + r.enrollmentsCount, 0)

    const monthRows = await this.globalRepo.findBetween(monthStart, yesterday)
    const monthEnrollments = monthRows.reduce((sum, r) => sum + r.enrollmentsCount, 0)
    const leadsThisMonth = monthEnrollments + leadsToday

    const prevMonthRows = await this.globalRepo.findBetween(prevMonthStart, prevMonthEnd)
    const leadsPrevMonth = prevMonthRows.reduce((sum, r) => sum + r.enrollmentsCount, 0)

    const convFrom = addDays(today, -30)
    const convPrevFrom = addDays(convFrom, -30)
    const convPrevTo = addDays(today, -31)

    const conversionCurrent = await this.conversionInRange(convFrom, today)
    const conversionPrevious = await this.conversionInRange(convPrevFrom, convPrevTo)

    const build = (value: number, previousValue: number): KpiCard => ({
      value,
      previousValue,
      changePercent: pctChange(value, previousValue),
    })

    return {
      leadsToday: build(leadsToday, leadsYesterday),
      leadsThisWeek: build(leadsThisWeek, leadsPrevWeek),
      leadsThisMonth: build(leadsThisMonth, leadsPrevMonth),
      conversionRate: {
        value: conversionCurrent,
        previousValue: conversionPrevious,
        changePercent:
          conversionPrevious === 0
            ? null
            : conversionCurrent - conversionPrevious,
      },
    }
  }

  async getOverviewCharts(from: string, to: string, topN = 10) {
    this.validateRange(from, to)

    const origins = await listOriginsFromEnrollments(from, to)

    const campaigns = await this.campaignRepo.topCampaignsBetween(from, to, topN)

    return {
      origins,
      campaigns: campaigns.map((row) => {
        const enrollments = Number(row.enrollments ?? 0)
        const conversions = Number(row.conversions ?? 0)
        return {
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          campaignSlug: row.campaignSlug,
          enrollments,
          conversions,
          conversionRate: conversionRate(conversions, enrollments),
        }
      }),
    }
  }

  async listCampaignsTable(from: string, to: string, page: number, limit: number) {
    this.validateRange(from, to)
    const rows = await this.campaignRepo.listCampaignsBetween(from, to, page, limit)
    return {
      items: rows.map((row) => {
        const enrollments = Number(row.enrollments ?? 0)
        const conversions = Number(row.conversions ?? 0)
        return {
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          campaignSlug: row.campaignSlug,
          enrollments,
          conversions,
          conversionRate: conversionRate(conversions, enrollments),
        }
      }),
      page,
      limit,
    }
  }

  async getCampaignKpis(campaignId: string) {
    const today = todayInTz()
    const yesterday = yesterdayInTz()
    const weekStart = startOfWeekMonday(today)
    const prevWeekStart = addDays(weekStart, -7)
    const prevWeekEnd = addDays(weekStart, -1)
    const monthStart = startOfMonth(today)
    const prevMonthStart = startOfMonth(addDays(monthStart, -1))
    const prevMonthEnd = addDays(monthStart, -1)

    const { start: todayStart, end: tomorrow } = dayBoundsUtc(today)

    const leadsToday = await AppDataSource.getRepository(CampaignLead)
      .createQueryBuilder('cl')
      .where('cl.campaignId = :campaignId', { campaignId })
      .andWhere('cl.enrolledAt >= :todayStart AND cl.enrolledAt < :tomorrow', {
        todayStart,
        tomorrow,
      })
      .getCount()

    const yesterdayRow = await this.campaignRepo.findBetween(yesterday, yesterday, campaignId)
    const leadsYesterday = yesterdayRow[0]?.enrollmentsCount ?? 0

    const weekRows = await this.campaignRepo.findBetween(weekStart, yesterday, campaignId)
    const leadsThisWeek =
      weekRows.reduce((sum, r) => sum + r.enrollmentsCount, 0) + leadsToday
    const prevWeekRows = await this.campaignRepo.findBetween(
      prevWeekStart,
      prevWeekEnd,
      campaignId
    )
    const leadsPrevWeek = prevWeekRows.reduce((sum, r) => sum + r.enrollmentsCount, 0)

    const monthRows = await this.campaignRepo.findBetween(monthStart, yesterday, campaignId)
    const leadsThisMonth =
      monthRows.reduce((sum, r) => sum + r.enrollmentsCount, 0) + leadsToday
    const prevMonthRows = await this.campaignRepo.findBetween(
      prevMonthStart,
      prevMonthEnd,
      campaignId
    )
    const leadsPrevMonth = prevMonthRows.reduce((sum, r) => sum + r.enrollmentsCount, 0)

    const convFrom = addDays(today, -30)
    const convPrevFrom = addDays(convFrom, -30)
    const convPrevTo = addDays(today, -31)

    const { start } = dayBoundsUtc(convFrom)
    const { end } = dayBoundsUtc(today)
    const { start: prevStart } = dayBoundsUtc(convPrevFrom)
    const { end: prevEnd } = dayBoundsUtc(convPrevTo)

    const total = await AppDataSource.getRepository(CampaignLead)
      .createQueryBuilder('cl')
      .where('cl.campaignId = :campaignId', { campaignId })
      .andWhere('cl.enrolledAt >= :start AND cl.enrolledAt < :end', { start, end })
      .getCount()
    const successful = await AppDataSource.getRepository(CampaignLead)
      .createQueryBuilder('cl')
      .where('cl.campaignId = :campaignId', { campaignId })
      .andWhere('cl.enrolledAt >= :start AND cl.enrolledAt < :end', { start, end })
      .andWhere('cl.isSuccessful = true')
      .getCount()

    const prevTotal = await AppDataSource.getRepository(CampaignLead)
      .createQueryBuilder('cl')
      .where('cl.campaignId = :campaignId', { campaignId })
      .andWhere('cl.enrolledAt >= :prevStart AND cl.enrolledAt < :prevEnd', {
        prevStart,
        prevEnd,
      })
      .getCount()
    const prevSuccessful = await AppDataSource.getRepository(CampaignLead)
      .createQueryBuilder('cl')
      .where('cl.campaignId = :campaignId', { campaignId })
      .andWhere('cl.enrolledAt >= :prevStart AND cl.enrolledAt < :prevEnd', {
        prevStart,
        prevEnd,
      })
      .andWhere('cl.isSuccessful = true')
      .getCount()

    const build = (value: number, previousValue: number): KpiCard => ({
      value,
      previousValue,
      changePercent: pctChange(value, previousValue),
    })

    return {
      leadsToday: build(leadsToday, leadsYesterday),
      leadsThisWeek: build(leadsThisWeek, leadsPrevWeek),
      leadsThisMonth: build(leadsThisMonth, leadsPrevMonth),
      conversionRate: {
        value: conversionRate(successful, total),
        previousValue: conversionRate(prevSuccessful, prevTotal),
        changePercent:
          prevTotal === 0
            ? null
            : conversionRate(successful, total) -
              conversionRate(prevSuccessful, prevTotal),
      },
    }
  }

  async getCampaignCharts(campaignId: string, from: string, to: string) {
    this.validateRange(from, to)
    const rows = await this.campaignRepo.findBetween(from, to, campaignId)
    const origins = await listOriginsFromEnrollments(from, to, campaignId)

    const daily = rows.map((row) => ({
      date: row.date,
      enrollments: row.enrollmentsCount,
      conversions: row.conversionsCount,
      conversionRate: conversionRate(row.conversionsCount, row.enrollmentsCount),
    }))

    return { origins, daily }
  }
}
