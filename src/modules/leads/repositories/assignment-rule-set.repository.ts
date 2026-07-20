import { AppDataSource } from '../../../database/data-source'
import { AssignmentRuleSet } from '../../../entities/leads/assignment-rule-set.entity'

export class AssignmentRuleSetRepository {
  private get repo() {
    return AppDataSource.getRepository(AssignmentRuleSet)
  }

  findLatestActive(campaignId: string, key: string, at = new Date()) {
    return this.repo
      .createQueryBuilder('ars')
      .where('ars.campaign_id = :campaignId', { campaignId })
      .andWhere('ars.key = :key', { key })
      .andWhere('ars.is_active = true')
      .andWhere('ars.effective_from <= :at', { at })
      .orderBy('ars.version', 'DESC')
      .getOne()
  }

  listByCampaign(campaignId: string) {
    return this.repo.find({
      where: { campaignId },
      order: { key: 'ASC', version: 'DESC' },
    })
  }

  async getNextVersion(campaignId: string, key: string) {
    const row = await this.repo
      .createQueryBuilder('ars')
      .select('MAX(ars.version)', 'max')
      .where('ars.campaign_id = :campaignId', { campaignId })
      .andWhere('ars.key = :key', { key })
      .getRawOne<{ max: string | null }>()

    return Number(row?.max ?? 0) + 1
  }

  create(data: Partial<AssignmentRuleSet>) {
    const entity = this.repo.create(data)
    return this.repo.save(entity)
  }
}
