import { IsNull } from 'typeorm'
import { AppDataSource } from '../../../database/data-source'
import { CampaignDocument } from '../../../entities/campaigns/campaign-document.entity'
import type {
  CampaignDocumentData,
  CampaignDocumentRepositoryPort,
  CreateCampaignDocumentData,
} from '../types/campaign-document.types'

function toData(entity: CampaignDocument): CampaignDocumentData {
  return {
    id: entity.id,
    campaignId: entity.campaignId,
    displayName: entity.displayName,
    fileName: entity.fileName,
    mimeType: entity.mimeType,
    fileSize: entity.fileSize,
    cloudinaryPublicId: entity.cloudinaryPublicId,
    cloudinaryUrl: entity.cloudinaryUrl,
    metaMediaId: entity.metaMediaId,
    deletedAt: entity.deletedAt,
    uploadedBy: entity.uploadedBy,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  }
}

export class CampaignDocumentRepository implements CampaignDocumentRepositoryPort {
  private get repo() {
    return AppDataSource.getRepository(CampaignDocument)
  }

  async create(data: CreateCampaignDocumentData): Promise<CampaignDocumentData> {
    const entity = this.repo.create(data)
    const saved = await this.repo.save(entity)
    return toData(saved)
  }

  async findById(id: string): Promise<CampaignDocumentData | null> {
    const entity = await this.repo.findOne({ where: { id } })
    return entity ? toData(entity) : null
  }

  async listActiveByCampaign(campaignId: string): Promise<CampaignDocumentData[]> {
    const entities = await this.repo.find({
      where: { campaignId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    })
    return entities.map(toData)
  }

  async updateMetaMediaId(id: string, metaMediaId: string): Promise<void> {
    await this.repo.update(id, { metaMediaId })
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.update(id, { deletedAt: new Date() })
  }
}