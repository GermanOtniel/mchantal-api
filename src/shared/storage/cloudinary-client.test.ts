import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock cloudinary before importing the module under test
vi.mock('cloudinary', () => {
  const uploadStream = vi.fn((opts: Record<string, unknown>, cb: (err: unknown, result: unknown) => void) => {
    cb(null, {
      public_id: `${opts.folder}/test-id`,
      secure_url: 'https://res.cloudinary.com/test/image/upload/test-id',
      bytes: 1024,
      format: 'jpg',
      resource_type: opts.resource_type || 'image',
    })
  })
  const destroy = vi.fn((_publicId: string, _opts: unknown, cb: (err: unknown, result: unknown) => void) => {
    cb(null, { result: 'ok' })
  })
  return {
    v2: {
      config: vi.fn(),
      uploader: { upload_stream: uploadStream, destroy },
    },
  }
})

import { uploadBuffer, deleteAsset } from './cloudinary-client'

describe('cloudinary-client', () => {
  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud'
    process.env.CLOUDINARY_API_KEY = 'test-key'
    process.env.CLOUDINARY_API_SECRET = 'test-secret'
  })

  it('uploadBuffer con imagen: sube con resource_type image', async () => {
    const buffer = Buffer.from('fake-image')
    const result = await uploadBuffer(buffer, 'photo.jpg', 'image/jpeg', {
      folder: 'test-campaign/attachments',
      resourceType: 'image',
    })
    expect(result.publicId).toContain('test-campaign/attachments')
    expect(result.secureUrl).toContain('res.cloudinary.com')
    expect(result.bytes).toBe(1024)
    expect(result.mimeType).toBe('image/jpeg')
  })

  it('uploadBuffer con PDF: sube con resource_type raw', async () => {
    const buffer = Buffer.from('fake-pdf')
    const result = await uploadBuffer(buffer, 'doc.pdf', 'application/pdf', {
      folder: 'test-campaign/attachments',
      resourceType: 'raw',
    })
    expect(result.mimeType).toBe('application/pdf')
  })

  it('deleteAsset no lanza error', async () => {
    await expect(deleteAsset('test-campaign/attachments/test-id')).resolves.toBeUndefined()
  })
})