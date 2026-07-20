import { AppDataSource } from '../../../database/data-source'
import { Campaign } from '../../../entities/leads/campaign.entity'

export class CampaignRepository {
  private get repo() {
    return AppDataSource.getRepository(Campaign)
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id } })
  }

  findBySlug(slug: string) {
    return this.repo.findOne({ where: { slug } })
  }

  findActiveBySlug(slug: string) {
    return this.repo.findOne({ where: { slug, status: 'active' } })
  }

  listAll() {
    return this.repo.find({ order: { createdAt: 'DESC' } })
  }

  create(data: Partial<Campaign>) {
    const entity = this.repo.create(data)
    return this.repo.save(entity)
  }

  async update(id: string, data: Partial<Campaign>) {
    const existing = await this.findById(id)
    if (!existing) return null
    Object.assign(existing, data)
    return this.repo.save(existing)
  }

  slugExists(slug: string, excludeId?: string) {
    const qb = this.repo.createQueryBuilder('c').where('c.slug = :slug', { slug })
    if (excludeId) qb.andWhere('c.id != :excludeId', { excludeId })
    return qb.getExists()
  }
}