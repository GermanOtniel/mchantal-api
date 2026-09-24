import { uploadBuffer } from '../../../shared/storage/cloudinary-client'
import { HttpError } from '../../auth/http-error'
import type { CampaignRepositoryPort } from '../types/campaign.types'
import type {
  CampaignDocumentData,
  CampaignDocumentRepositoryPort,
  CreateCampaignDocumentData,
} from '../types/campaign-document.types'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_DOCUMENT_SIZE = 100 * 1024 * 1024 // 100 MB

export type UploadDocumentInput = {
  campaignId: string
  displayName: string
  fileName: string
  mimeType: string
  buffer: Buffer
  fileSize: number
  uploadedBy: string
}

export class CampaignDocumentService {
  constructor(
    private readonly repo: CampaignDocumentRepositoryPort,
    private readonly campaignRepo: CampaignRepositoryPort
  ) {}

  async uploadDocument(input: UploadDocumentInput): Promise<CampaignDocumentData> {
    if (!input.displayName || input.displayName.trim().length < 2) {
      throw new HttpError(
        'El nombre descriptivo es obligatorio (mínimo 2 caracteres)',
        400,
        'DISPLAY_NAME_REQUIRED'
      )
    }
    if (!ALLOWED_MIME_TYPES.includes(input.mimeType)) {
      throw new HttpError(
        `Tipo de archivo no permitido: ${input.mimeType}. Solo se permiten imágenes (JPG, PNG, WEBP) y PDF.`,
        400,
        'INVALID_FILE_TYPE'
      )
    }
    const isImage = input.mimeType.startsWith('image/')
    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_DOCUMENT_SIZE
    if (input.fileSize > maxSize) {
      throw new HttpError(
        `El archivo excede el tamaño máximo (${isImage ? '5MB' : '100MB'}).`,
        400,
        'FILE_TOO_LARGE'
      )
    }

    // Resolver el slug de la campaña para el folder de Cloudinary
    const campaign = await this.campaignRepo.findById(input.campaignId)
    if (!campaign) {
      throw new HttpError('Campaña no encontrada', 404, 'CAMPAIGN_NOT_FOUND')
    }
    const campaignSlug = campaign.slug

    const resourceType = isImage ? 'image' : 'raw'
    const folder = `${campaignSlug}/attachments`
    const uploaded = await uploadBuffer(input.buffer, input.fileName, input.mimeType, {
      folder,
      resourceType,
    })

    const data: CreateCampaignDocumentData = {
      campaignId: input.campaignId,
      displayName: input.displayName.trim(),
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: uploaded.bytes,
      cloudinaryPublicId: uploaded.publicId,
      cloudinaryUrl: uploaded.secureUrl,
      metaMediaId: null,
      deletedAt: null,
      uploadedBy: input.uploadedBy,
    }

    return this.repo.create(data)
  }

  async listDocuments(campaignId: string): Promise<CampaignDocumentData[]> {
    return this.repo.listActiveByCampaign(campaignId)
  }

  async findById(id: string): Promise<CampaignDocumentData | null> {
    return this.repo.findById(id)
  }

  async softDelete(id: string): Promise<void> {
    const doc = await this.repo.findById(id)
    if (!doc) throw new HttpError('Documento no encontrado', 404, 'DOCUMENT_NOT_FOUND')
    if (doc.deletedAt) return // idempotente
    await this.repo.softDelete(id)
  }
}