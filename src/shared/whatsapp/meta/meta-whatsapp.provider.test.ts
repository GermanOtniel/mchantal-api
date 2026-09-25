import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MetaWhatsAppProvider } from './meta-whatsapp.provider'

const mockEnv = {
  meta: {
    accessToken: 'test-token',
    phoneNumberId: '123456789',
    appSecret: 'test-secret',
  },
  verifyToken: 'verify',
  businessPhoneE164: '1234567890',
} as const

function mockFetch(responses: Array<{ status: number; json?: unknown; text?: string; arrayBuffer?: ArrayBuffer }>) {
  let call = 0
  const original = globalThis.fetch
  globalThis.fetch = vi.fn(async () => {
    const r = responses[Math.min(call, responses.length - 1)]
    call++
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.json ?? {},
      text: async () => r.text ?? '',
      arrayBuffer: async () => r.arrayBuffer ?? new ArrayBuffer(0),
    } as Response
  }) as unknown as typeof fetch
  return () => { globalThis.fetch = original }
}

describe('MetaWhatsAppProvider — media', () => {
  let restore: () => void

  beforeEach(() => {
    restore = () => {}
  })

  afterEach(() => {
    restore()
  })

  it('uploadMedia: POST a /media con FormData, devuelve mediaId', async () => {
    restore = mockFetch([{ status: 200, json: { id: 'media-123' } }])
    const provider = new MetaWhatsAppProvider(mockEnv as never)
    const result = await provider.uploadMedia({
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake-pdf'),
      fileName: 'doc.pdf',
    })
    expect(result.mediaId).toBe('media-123')
    expect(fetch).toHaveBeenCalledTimes(1)
    const callArgs = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(callArgs[1].method).toBe('POST')
  })

  it('uploadMedia: error de Meta → lanza', async () => {
    restore = mockFetch([{ status: 500, text: 'server error' }])
    const provider = new MetaWhatsAppProvider(mockEnv as never)
    await expect(
      provider.uploadMedia({ mimeType: 'image/jpeg', buffer: Buffer.from('x') })
    ).rejects.toThrow('uploadMedia error')
  })

  it('sendMediaMessage image: payload con type=image e id', async () => {
    restore = mockFetch([{ status: 200, json: { messages: [{ id: 'msg-1' }] } }])
    const provider = new MetaWhatsAppProvider(mockEnv as never)
    const result = await provider.sendMediaMessage({
      toWaId: '123',
      mediaType: 'image',
      mediaId: 'media-123',
      caption: 'Mira esto',
    })
    expect(result.providerMessageId).toBe('msg-1')
  })

  it('sendMediaMessage document: payload con type=document, id y filename', async () => {
    restore = mockFetch([{ status: 200, json: { messages: [{ id: 'msg-2' }] } }])
    const provider = new MetaWhatsAppProvider(mockEnv as never)
    const result = await provider.sendMediaMessage({
      toWaId: '123',
      mediaType: 'document',
      mediaId: 'media-456',
      fileName: 'contract.pdf',
    })
    expect(result.providerMessageId).toBe('msg-2')
  })

  it('downloadMedia: GET /{mediaId} → URL, luego GET URL → buffer', async () => {
    const fakeBuffer = Buffer.from('fake-image-data')
    restore = mockFetch([
      { status: 200, json: { url: 'https://lookaside.fbsbx.com/media/123', mime_type: 'image/jpeg', filename: 'photo.jpg' } },
      { status: 200, arrayBuffer: fakeBuffer.buffer.slice(fakeBuffer.byteOffset, fakeBuffer.byteOffset + fakeBuffer.byteLength) },
    ])
    const provider = new MetaWhatsAppProvider(mockEnv as never)
    const result = await provider.downloadMedia('media-123')
    expect(result.buffer).toEqual(fakeBuffer)
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.fileName).toBe('photo.jpg')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('downloadMedia: error en primer fetch → lanza', async () => {
    restore = mockFetch([{ status: 404, text: 'not found' }])
    const provider = new MetaWhatsAppProvider(mockEnv as never)
    await expect(provider.downloadMedia('bad-id')).rejects.toThrow('downloadMedia error')
  })
})