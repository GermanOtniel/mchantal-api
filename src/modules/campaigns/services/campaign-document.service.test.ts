import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../shared/storage/cloudinary-client', () => ({
  uploadBuffer: vi.fn(async () => ({
    publicId: 'test-slug/attachments/test-id',
    secureUrl: 'https://res.cloudinary.com/test/image/upload/test-id',
    bytes: 1024,
    mimeType: 'image/jpeg',
  })),
}))

import { CampaignDocumentService } from './campaign-document.service'
import type {
  CampaignDocumentRepositoryPort,
  CreateCampaignDocumentData,
  CampaignDocumentData,
} from '../types/campaign-document.types'
import type { CampaignRepositoryPort } from '../types/campaign.types'

function makeDocRepo(
  over: Partial<CampaignDocumentRepositoryPort> = {}
): CampaignDocumentRepositoryPort {
  return {
    create: vi.fn(async (d: CreateCampaignDocumentData): Promise<CampaignDocumentData> => ({
      id: 'doc1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...d,
    })),
    findById: vi.fn(async () => null),
    listActiveByCampaign: vi.fn(async () => []),
    updateMetaMediaId: vi.fn(async () => {}),
    softDelete: vi.fn(async () => {}),
    ...over,
  }
}

function makeCampaignRepo(
  over: Partial<CampaignRepositoryPort> = {}
): CampaignRepositoryPort {
  return {
    create: vi.fn(async () => ({}) as never),
    update: vi.fn(async () => ({}) as never),
    findById: vi.fn(async () => ({ id: 'c1', slug: 'verano' } as never)),
    listAll: vi.fn(async () => []),
    slugExists: vi.fn(async () => false),
    findActiveBase: vi.fn(async () => null),
    ...over,
  }
}

describe('CampaignDocumentService', () => {
  it('uploadDocument: tipo válido sube a Cloudinary + persiste con metaMediaId null', async () => {
    const docRepo = makeDocRepo()
    const campaignRepo = makeCampaignRepo()
    const svc = new CampaignDocumentService(docRepo, campaignRepo)
    const result = await svc.uploadDocument({
      campaignId: 'c1',
      displayName: 'Catálogo de casas',
      fileName: 'catalogo.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake-pdf'),
      fileSize: 50000,
      uploadedBy: 'u1',
    })
    expect(docRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'c1',
        displayName: 'Catálogo de casas',
        mimeType: 'application/pdf',
        metaMediaId: null,
      })
    )
    expect(result.cloudinaryUrl).toContain('res.cloudinary.com')
  })

  it('uploadDocument: tipo inválido → 400 INVALID_FILE_TYPE', async () => {
    const svc = new CampaignDocumentService(makeDocRepo(), makeCampaignRepo())
    await expect(
      svc.uploadDocument({
        campaignId: 'c1',
        displayName: 'Video',
        fileName: 'video.mp4',
        mimeType: 'video/mp4',
        buffer: Buffer.from('fake'),
        fileSize: 1000,
        uploadedBy: 'u1',
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_FILE_TYPE' })
  })

  it('uploadDocument: imagen > 5MB → 400 FILE_TOO_LARGE', async () => {
    const svc = new CampaignDocumentService(makeDocRepo(), makeCampaignRepo())
    await expect(
      svc.uploadDocument({
        campaignId: 'c1',
        displayName: 'Big',
        fileName: 'big.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.alloc(6 * 1024 * 1024),
        fileSize: 6 * 1024 * 1024,
        uploadedBy: 'u1',
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'FILE_TOO_LARGE' })
  })

  it('uploadDocument: PDF > 100MB → 400 FILE_TOO_LARGE', async () => {
    const svc = new CampaignDocumentService(makeDocRepo(), makeCampaignRepo())
    await expect(
      svc.uploadDocument({
        campaignId: 'c1',
        displayName: 'Big PDF',
        fileName: 'big.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.alloc(101 * 1024 * 1024),
        fileSize: 101 * 1024 * 1024,
        uploadedBy: 'u1',
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'FILE_TOO_LARGE' })
  })

  it('uploadDocument: displayName vacío → 400 DISPLAY_NAME_REQUIRED', async () => {
    const svc = new CampaignDocumentService(makeDocRepo(), makeCampaignRepo())
    await expect(
      svc.uploadDocument({
        campaignId: 'c1',
        displayName: '',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('fake'),
        fileSize: 1000,
        uploadedBy: 'u1',
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'DISPLAY_NAME_REQUIRED' })
  })

  it('uploadDocument: displayName de 1 char → 400', async () => {
    const svc = new CampaignDocumentService(makeDocRepo(), makeCampaignRepo())
    await expect(
      svc.uploadDocument({
        campaignId: 'c1',
        displayName: 'A',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('fake'),
        fileSize: 1000,
        uploadedBy: 'u1',
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'DISPLAY_NAME_REQUIRED' })
  })

  it('softDelete: set deletedAt', async () => {
    const docRepo = makeDocRepo({
      findById: vi.fn(async () => ({
        id: 'd1',
        campaignId: 'c1',
        displayName: 'X',
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
        cloudinaryPublicId: 'x',
        cloudinaryUrl: 'x',
        metaMediaId: null,
        deletedAt: null,
        uploadedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    })
    const svc = new CampaignDocumentService(docRepo, makeCampaignRepo())
    await svc.softDelete('d1')
    expect(docRepo.softDelete).toHaveBeenCalledWith('d1')
  })

  it('softDelete: doc inexistente → 404', async () => {
    const svc = new CampaignDocumentService(makeDocRepo(), makeCampaignRepo())
    await expect(svc.softDelete('nope')).rejects.toMatchObject({
      statusCode: 404,
      code: 'DOCUMENT_NOT_FOUND',
    })
  })

  it('softDelete: ya eliminado es idempotente', async () => {
    const docRepo = makeDocRepo({
      findById: vi.fn(async () => ({
        id: 'd1',
        campaignId: 'c1',
        displayName: 'X',
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
        cloudinaryPublicId: 'x',
        cloudinaryUrl: 'x',
        metaMediaId: null,
        deletedAt: new Date(),
        uploadedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    })
    const svc = new CampaignDocumentService(docRepo, makeCampaignRepo())
    await svc.softDelete('d1')
    expect(docRepo.softDelete).not.toHaveBeenCalled()
  })

  it('listDocuments: solo docs no eliminados', async () => {
    const docRepo = makeDocRepo({
      listActiveByCampaign: vi.fn(async () => [
        {
          id: 'd1',
          campaignId: 'c1',
          displayName: 'A',
          fileName: 'a.pdf',
          mimeType: 'application/pdf',
          fileSize: 100,
          cloudinaryPublicId: 'a',
          cloudinaryUrl: 'https://res.cloudinary.com/test/a',
          metaMediaId: null,
          deletedAt: null,
          uploadedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    })
    const svc = new CampaignDocumentService(docRepo, makeCampaignRepo())
    const docs = await svc.listDocuments('c1')
    expect(docs).toHaveLength(1)
    expect(docRepo.listActiveByCampaign).toHaveBeenCalledWith('c1')
  })

  it('uploadDocument: resuelve campaignSlug internamente', async () => {
    const campaignRepo = makeCampaignRepo({
      findById: vi.fn(async () => ({ id: 'c1', slug: 'my-slug' } as never)),
    })
    const svc = new CampaignDocumentService(makeDocRepo(), campaignRepo)
    await svc.uploadDocument({
      campaignId: 'c1',
      displayName: 'Test',
      fileName: 'test.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake'),
      fileSize: 1000,
      uploadedBy: 'u1',
    })
    expect(campaignRepo.findById).toHaveBeenCalledWith('c1')
  })
})