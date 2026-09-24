export type CampaignDocumentData = {
  id: string
  campaignId: string
  displayName: string
  fileName: string
  mimeType: string
  fileSize: number
  cloudinaryPublicId: string
  cloudinaryUrl: string
  metaMediaId: string | null
  deletedAt: Date | null
  uploadedBy: string | null
  createdAt: Date
  updatedAt: Date
}

export type CreateCampaignDocumentData = Omit<
  CampaignDocumentData,
  'id' | 'createdAt' | 'updatedAt'
>

export interface CampaignDocumentRepositoryPort {
  create(data: CreateCampaignDocumentData): Promise<CampaignDocumentData>
  findById(id: string): Promise<CampaignDocumentData | null>
  listActiveByCampaign(campaignId: string): Promise<CampaignDocumentData[]>
  updateMetaMediaId(id: string, metaMediaId: string): Promise<void>
  softDelete(id: string): Promise<void>
}