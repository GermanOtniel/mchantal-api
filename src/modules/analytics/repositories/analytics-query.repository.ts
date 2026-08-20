import { AppDataSource } from '../../../database/data-source'
import { CampaignLead } from '../../../entities/leads/campaign-lead.entity'
import { LeadEvent } from '../../../entities/leads/lead-event.entity'
import { Campaign } from '../../../entities/campaigns/campaign.entity'
import {
  BUSINESS_TZ,
  daysBetweenInclusive,
  formatDateInTz,
} from '../utils/analytics-dates'
import type { AnalyticsQueryDeps, DailyPoint, DateRange, OriginSlice } from '../types/analytics.types'

const QUALIFIED_EVENT = { type: 'status_change', toValue: 'qualified' }

/** expresión SQL para el día calendario (YYYY-MM-DD) en la TZ del negocio. */
function dayExpr(column: string): string {
  return `to_char(date_trunc('day', ${column} AT TIME ZONE '${BUSINESS_TZ}'), 'YYYY-MM-DD')`
}

export class AnalyticsQueryRepository implements AnalyticsQueryDeps {
  async countEnrollments(range: DateRange, campaignId?: string): Promise<number> {
    const qb = AppDataSource.getRepository(CampaignLead)
      .createQueryBuilder('cl')
      .where('cl.enrolled_at >= :start AND cl.enrolled_at < :end', range)
    if (campaignId) qb.andWhere('cl.campaign_id = :campaignId', { campaignId })
    return qb.getCount()
  }

  async countConversions(range: DateRange, campaignId?: string): Promise<number> {
    const qb = AppDataSource.getRepository(LeadEvent)
      .createQueryBuilder('e')
      .innerJoin('e.lead', 'cl')
      .where('e.type = :type', { type: QUALIFIED_EVENT.type })
      .andWhere('e.to_value = :toValue', { toValue: QUALIFIED_EVENT.toValue })
      .andWhere('e.created_at >= :start AND e.created_at < :end', range)
    if (campaignId) qb.andWhere('cl.campaign_id = :campaignId', { campaignId })
    return qb.getCount()
  }

  async groupOrigins(range: DateRange, campaignId?: string): Promise<OriginSlice[]> {
    const qb = AppDataSource.getRepository(CampaignLead)
      .createQueryBuilder('cl')
      .select('cl.origin', 'origin')
      .addSelect('COUNT(*)', 'count')
      .where('cl.enrolled_at >= :start AND cl.enrolled_at < :end', range)
    if (campaignId) qb.andWhere('cl.campaign_id = :campaignId', { campaignId })
    const rows = await qb.groupBy('cl.origin').orderBy('count', 'DESC').getRawMany<{
      origin: string
      count: string
    }>()
    return rows.map((r) => ({ origin: r.origin, count: Number(r.count) }))
  }

  async topCampaigns(
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
  > {
    const enrollRows = await AppDataSource.getRepository(CampaignLead)
      .createQueryBuilder('cl')
      .select('cl.campaign_id', 'campaignId')
      .addSelect('c.name', 'campaignName')
      .addSelect('c.slug', 'campaignSlug')
      .addSelect('COUNT(*)', 'enrollments')
      .leftJoin(Campaign, 'c', 'c.id = cl.campaign_id')
      .where('cl.enrolled_at >= :start AND cl.enrolled_at < :end', range)
      .groupBy('cl.campaign_id, c.name, c.slug')
      .orderBy('enrollments', 'DESC')
      .limit(topN)
      .getRawMany<{
        campaignId: string
        campaignName: string
        campaignSlug: string
        enrollments: string
      }>()

    if (enrollRows.length === 0) return []

    const convRows = await AppDataSource.getRepository(LeadEvent)
      .createQueryBuilder('e')
      .innerJoin('e.lead', 'cl')
      .select('cl.campaign_id', 'campaignId')
      .addSelect('COUNT(*)', 'conversions')
      .where('e.type = :type', { type: QUALIFIED_EVENT.type })
      .andWhere('e.to_value = :toValue', { toValue: QUALIFIED_EVENT.toValue })
      .andWhere('e.created_at >= :start AND e.created_at < :end', range)
      .andWhere('cl.campaign_id IN (:...ids)', { ids: enrollRows.map((r) => r.campaignId) })
      .groupBy('cl.campaign_id')
      .getRawMany<{ campaignId: string; conversions: string }>()

    const convByCampaign = new Map<string, number>(
      convRows.map((r) => [r.campaignId, Number(r.conversions)])
    )

    return enrollRows.map((r) => ({
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      campaignSlug: r.campaignSlug,
      enrollments: Number(r.enrollments),
      conversions: convByCampaign.get(r.campaignId) ?? 0,
    }))
  }

  async dailySeries(campaignId: string, range: DateRange): Promise<DailyPoint[]> {
    const enrollRows = await AppDataSource.getRepository(CampaignLead)
      .createQueryBuilder('cl')
      .select(`${dayExpr('cl.enrolled_at')}`, 'date')
      .addSelect('COUNT(*)', 'enrollments')
      .where('cl.campaign_id = :campaignId', { campaignId })
      .andWhere('cl.enrolled_at >= :start AND cl.enrolled_at < :end', range)
      .groupBy('date')
      .getRawMany<{ date: string; enrollments: string }>()

    const convRows = await AppDataSource.getRepository(LeadEvent)
      .createQueryBuilder('e')
      .innerJoin('e.lead', 'cl')
      .select(`${dayExpr('e.created_at')}`, 'date')
      .addSelect('COUNT(*)', 'conversions')
      .where('e.type = :type', { type: QUALIFIED_EVENT.type })
      .andWhere('e.to_value = :toValue', { toValue: QUALIFIED_EVENT.toValue })
      .andWhere('e.created_at >= :start AND e.created_at < :end', range)
      .andWhere('cl.campaign_id = :campaignId', { campaignId })
      .groupBy('date')
      .getRawMany<{ date: string; conversions: string }>()

    const enrollByDay = new Map<string, number>(
      enrollRows.map((r) => [r.date, Number(r.enrollments)])
    )
    const convByDay = new Map<string, number>(
      convRows.map((r) => [r.date, Number(r.conversions)])
    )

    // end es exclusivo → el último día calendario es end - 1ms.
    const from = formatDateInTz(range.start)
    const to = formatDateInTz(new Date(range.end.getTime() - 1))
    return daysBetweenInclusive(from, to).map((date) => ({
      date,
      enrollments: enrollByDay.get(date) ?? 0,
      conversions: convByDay.get(date) ?? 0,
      conversionRate: 0,
    }))
  }
}