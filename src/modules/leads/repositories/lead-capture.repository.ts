import { AppDataSource } from '../../../database/data-source'
import { LeadCapture } from '../../../entities/leads/lead-capture.entity'

export class LeadCaptureRepository {
  private get repo() {
    return AppDataSource.getRepository(LeadCapture)
  }

  findByFolio(folio: string) {
    return this.repo.findOne({ where: { folio } })
  }

  findById(id: string) {
    return this.repo.findOne({
      where: { id },
      relations: { campaign: true },
    })
  }

  list(params: { campaignId?: string; status?: string; limit?: number }) {
    const qb = this.repo
      .createQueryBuilder('lc')
      .leftJoinAndSelect('lc.campaign', 'campaign')
      .orderBy('lc.created_at', 'DESC')
      .take(params.limit ?? 50)

    if (params.campaignId) {
      qb.andWhere('lc.campaign_id = :campaignId', { campaignId: params.campaignId })
    }
    if (params.status) {
      qb.andWhere('lc.status = :status', { status: params.status })
    }

    return qb.getMany()
  }

  create(data: Partial<LeadCapture>) {
    const entity = this.repo.create(data)
    return this.repo.save(entity)
  }

  folioExists(folio: string) {
    return this.repo.exists({ where: { folio } })
  }

  async markMatched(id: string, campaignLeadId: string) {
    await this.repo.update(
      { id },
      { status: 'matched', campaignLeadId }
    )
  }

  findPendingByFolio(folio: string) {
    return this.repo.findOne({
      where: { folio, status: 'pending' },
      relations: { campaign: true },
    })
  }
}
