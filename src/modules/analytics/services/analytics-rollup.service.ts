import { AppDataSource } from '../../../database/data-source'
import { LeadCapture } from '../../../entities/leads/lead-capture.entity'
import { CampaignLead } from '../../../entities/leads/campaign-lead.entity'
import {
  AnalyticsDailyCampaignRepository,
  AnalyticsDailyGlobalRepository,
} from '../repositories/analytics-daily.repository'
import { addDays, dayBoundsUtc, formatDateInTz } from '../utils/analytics-dates'
import {
  extractOrigin,
  extractOriginFromEnrollment,
} from '../utils/analytics-origin.utils'

export class AnalyticsRollupService {
  constructor(
    private readonly globalRepo = new AnalyticsDailyGlobalRepository(),
    private readonly campaignRepo = new AnalyticsDailyCampaignRepository()
  ) {}

  async rollupDay(dateStr: string): Promise<void> {
    const { start, end } = dayBoundsUtc(dateStr)

    const captureRepo = AppDataSource.getRepository(LeadCapture)
    const leadRepo = AppDataSource.getRepository(CampaignLead)

    const captures = await captureRepo
      .createQueryBuilder('lc')
      .where('lc.created_at >= :start AND lc.created_at < :end', { start, end })
      .getMany()

    const enrollments = await leadRepo
      .createQueryBuilder('cl')
      .leftJoinAndSelect('cl.leadCapture', 'lc')
      .where('cl.enrolled_at >= :start AND cl.enrolled_at < :end', { start, end })
      .getMany()

    const conversions = await leadRepo
      .createQueryBuilder('cl')
      .where('cl.success_at >= :start AND cl.success_at < :end', { start, end })
      .getMany()

    let globalByOrigin: Record<string, number> = {}
    const campaignBuckets = new Map<
      string,
      {
        captures: number
        enrollments: number
        conversions: number
        byOrigin: Record<string, number>
      }
    >()

    for (const capture of captures) {
      const bucket = campaignBuckets.get(capture.campaignId) ?? {
        captures: 0,
        enrollments: 0,
        conversions: 0,
        byOrigin: {},
      }
      bucket.captures += 1
      campaignBuckets.set(capture.campaignId, bucket)
    }

    for (const lead of enrollments) {
      const origin = extractOriginFromEnrollment(lead)
      globalByOrigin[origin] = (globalByOrigin[origin] ?? 0) + 1
      const bucket = campaignBuckets.get(lead.campaignId) ?? {
        captures: 0,
        enrollments: 0,
        conversions: 0,
        byOrigin: {},
      }
      bucket.enrollments += 1
      bucket.byOrigin[origin] = (bucket.byOrigin[origin] ?? 0) + 1
      campaignBuckets.set(lead.campaignId, bucket)
    }

    for (const lead of conversions) {
      const bucket = campaignBuckets.get(lead.campaignId) ?? {
        captures: 0,
        enrollments: 0,
        conversions: 0,
        byOrigin: {},
      }
      bucket.conversions += 1
      campaignBuckets.set(lead.campaignId, bucket)
    }

    await this.globalRepo.upsert({
      date: dateStr,
      capturesCount: captures.length,
      enrollmentsCount: enrollments.length,
      conversionsCount: conversions.length,
      byOrigin: globalByOrigin,
    })

    for (const [campaignId, bucket] of campaignBuckets.entries()) {
      await this.campaignRepo.upsert({
        date: dateStr,
        campaignId,
        capturesCount: bucket.captures,
        enrollmentsCount: bucket.enrollments,
        conversionsCount: bucket.conversions,
        byOrigin: bucket.byOrigin,
      })
    }
  }

  async rollupRange(from: string, to: string): Promise<void> {
    let current = from
    while (current <= to) {
      await this.rollupDay(current)
      current = addDays(current, 1)
    }
  }

  async rollupYesterday(): Promise<void> {
    const yesterday = addDays(formatDateInTz(new Date()), -1)
    await this.rollupDay(yesterday)
  }
}
