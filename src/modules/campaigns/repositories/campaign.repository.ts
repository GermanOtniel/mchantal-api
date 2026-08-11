import { AppDataSource } from '../../../database/data-source'
import { Campaign } from '../../../entities/campaigns/campaign.entity'
import { HttpError } from '../../auth/http-error'
import type {
  CampaignRepositoryPort,
  CreateCampaignData,
  UpdateCampaignData,
} from '../types/campaign.types'

export class CampaignRepository implements CampaignRepositoryPort {
  private get repo() {
    return AppDataSource.getRepository(Campaign)
  }

  async create(data: CreateCampaignData): Promise<Campaign> {
    return this.repo.save(this.repo.create(data))
  }

  async update(id: string, patch: UpdateCampaignData): Promise<Campaign> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) {
      throw new HttpError('Campaña no encontrada', 404, 'CAMPAIGN_NOT_FOUND')
    }
    Object.assign(existing, patch)
    return this.repo.save(existing)
  }

  async findById(id: string): Promise<Campaign | null> {
    return this.repo.findOne({ where: { id } })
  }

  async listAll(): Promise<Campaign[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } })
  }

  async slugExists(slug: string, exceptId?: string): Promise<boolean> {
    const found = await this.repo.findOne({ where: { slug } })
    if (!found) return false
    return found.id !== exceptId
  }
}