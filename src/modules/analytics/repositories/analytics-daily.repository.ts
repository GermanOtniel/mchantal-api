import { AppDataSource } from '../../../database/data-source'
import { AnalyticsDailyCampaign } from '../../../entities/analytics/analytics-daily-campaign.entity'
import { AnalyticsDailyGlobal } from '../../../entities/analytics/analytics-daily-global.entity'

export class AnalyticsDailyGlobalRepository {
  private get repo() {
    return AppDataSource.getRepository(AnalyticsDailyGlobal)
  }

  upsert(row: Partial<AnalyticsDailyGlobal>) {
    return this.repo.save(this.repo.create(row))
  }

  findBetween(from: string, to: string) {
    return this.repo
      .createQueryBuilder('g')
      .where('g.date >= :from AND g.date <= :to', { from, to })
      .orderBy('g.date', 'ASC')
      .getMany()
  }

  sumBetween(from: string, to: string) {
    return this.repo
      .createQueryBuilder('g')
      .select('COALESCE(SUM(g.capturesCount), 0)', 'captures')
      .addSelect('COALESCE(SUM(g.enrollmentsCount), 0)', 'enrollments')
      .addSelect('COALESCE(SUM(g.conversionsCount), 0)', 'conversions')
      .where('g.date >= :from AND g.date <= :to', { from, to })
      .getRawOne<{ captures: string; enrollments: string; conversions: string }>()
  }
}

export class AnalyticsDailyCampaignRepository {
  private get repo() {
    return AppDataSource.getRepository(AnalyticsDailyCampaign)
  }

  upsert(row: Partial<AnalyticsDailyCampaign>) {
    return this.repo.save(this.repo.create(row))
  }

  findBetween(from: string, to: string, campaignId?: string) {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.campaign', 'campaign')
      .where('c.date >= :from AND c.date <= :to', { from, to })
      .orderBy('c.date', 'ASC')

    if (campaignId) {
      qb.andWhere('c.campaignId = :campaignId', { campaignId })
    }

    return qb.getMany()
  }

  topCampaignsBetween(from: string, to: string, limit: number) {
    return this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.campaign', 'campaign')
      .select('c.campaignId', 'campaignId')
      .addSelect('campaign.name', 'campaignName')
      .addSelect('campaign.slug', 'campaignSlug')
      .addSelect('SUM(c.enrollmentsCount)', 'enrollments')
      .addSelect('SUM(c.conversionsCount)', 'conversions')
      .where('c.date >= :from AND c.date <= :to', { from, to })
      .groupBy('c.campaignId')
      .addGroupBy('campaign.name')
      .addGroupBy('campaign.slug')
      .orderBy('enrollments', 'DESC')
      .limit(limit)
      .getRawMany<{
        campaignId: string
        campaignName: string
        campaignSlug: string
        enrollments: string
        conversions: string
      }>()
  }

  listCampaignsBetween(from: string, to: string, page: number, limit: number) {
    return this.repo
      .createQueryBuilder('c')
      .leftJoin('c.campaign', 'campaign')
      .select('c.campaignId', 'campaignId')
      .addSelect('campaign.name', 'campaignName')
      .addSelect('campaign.slug', 'campaignSlug')
      .addSelect('SUM(c.enrollmentsCount)', 'enrollments')
      .addSelect('SUM(c.conversionsCount)', 'conversions')
      .where('c.date >= :from AND c.date <= :to', { from, to })
      .groupBy('c.campaignId')
      .addGroupBy('campaign.name')
      .addGroupBy('campaign.slug')
      .orderBy('enrollments', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{
        campaignId: string
        campaignName: string
        campaignSlug: string
        enrollments: string
        conversions: string
      }>()
  }
}
