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

describe('MetaWhatsAppProvider — sendListMessage', () => {
  let restore: () => void

  beforeEach(() => {
    restore = () => {}
  })

  afterEach(() => {
    restore()
  })

  it('envía POST con payload correcto (interactive.type=list, action.button, sections[0].rows)', async () => {
    restore = mockFetch([{ status: 200, json: { messages: [{ id: 'msg-list-1' }] } }])
    const provider = new MetaWhatsAppProvider(mockEnv as never)
    const result = await provider.sendListMessage({
      toWaId: '5599999999',
      body: '¿Qué te interesa?',
      buttonText: 'Ver opciones',
      rows: [
        { id: 'r1', title: 'Maquillaje', description: 'Labiales, bases, sombras' },
        { id: 'r2', title: 'Skincare' },
      ],
    })
    expect(result.providerMessageId).toBe('msg-list-1')

    const callArgs = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(callArgs[0]).toBe('https://graph.facebook.com/v21.0/123456789/messages')
    expect(callArgs[1].method).toBe('POST')
    expect(callArgs[1].headers).toEqual({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(callArgs[1].body)
    expect(body.messaging_product).toBe('whatsapp')
    expect(body.recipient_type).toBe('individual')
    expect(body.to).toBe('5599999999')
    expect(body.type).toBe('interactive')
    expect(body.interactive.type).toBe('list')
    expect(body.interactive.body.text).toBe('¿Qué te interesa?')
    expect(body.interactive.action.button).toBe('Ver opciones')
    expect(body.interactive.action.sections).toHaveLength(1)
    expect(body.interactive.action.sections[0].rows).toHaveLength(2)
    expect(body.interactive.action.sections[0].rows[0]).toEqual({
      id: 'r1',
      title: 'Maquillaje',
      description: 'Labiales, bases, sombras',
    })
    expect(body.interactive.action.sections[0].rows[1]).toEqual({
      id: 'r2',
      title: 'Skincare',
    })
    // header y footer no incluidos cuando no vienen
    expect(body.interactive.header).toBeUndefined()
    expect(body.interactive.footer).toBeUndefined()
  })

  it('incluye header y footer cuando se proporcionan', async () => {
    restore = mockFetch([{ status: 200, json: { messages: [{ id: 'msg-list-2' }] } }])
    const provider = new MetaWhatsAppProvider(mockEnv as never)
    await provider.sendListMessage({
      toWaId: '123',
      body: 'Elige',
      buttonText: 'Abrir',
      header: 'Encuesta',
      footer: 'Gracias por participar',
      rows: [{ id: 'r1', title: 'Opción 1' }],
    })
    const body = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.interactive.header).toEqual({ type: 'text', text: 'Encuesta' })
    expect(body.interactive.footer).toEqual({ type: 'text', text: 'Gracias por participar' })
  })

  it('trunca title (24), description (72), buttonText (20), header (60), footer (60)', async () => {
    restore = mockFetch([{ status: 200, json: { messages: [{ id: 'msg-list-3' }] } }])
    const provider = new MetaWhatsAppProvider(mockEnv as never)
    const longTitle = 'A'.repeat(30)
    const longDesc = 'B'.repeat(80)
    const longButton = 'C'.repeat(25)
    const longHeader = 'D'.repeat(70)
    const longFooter = 'E'.repeat(70)
    await provider.sendListMessage({
      toWaId: '123',
      body: 'Elige',
      buttonText: longButton,
      header: longHeader,
      footer: longFooter,
      rows: [{ id: 'r1', title: longTitle, description: longDesc }],
    })
    const body = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.interactive.action.button).toBe('C'.repeat(20))
    expect(body.interactive.header.text).toBe('D'.repeat(60))
    expect(body.interactive.footer.text).toBe('E'.repeat(60))
    expect(body.interactive.action.sections[0].rows[0].title).toBe('A'.repeat(24))
    expect(body.interactive.action.sections[0].rows[0].description).toBe('B'.repeat(72))
  })

  it('limita rows a 10', async () => {
    restore = mockFetch([{ status: 200, json: { messages: [{ id: 'msg-list-4' }] } }])
    const provider = new MetaWhatsAppProvider(mockEnv as never)
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, title: `O${i}` }))
    await provider.sendListMessage({
      toWaId: '123',
      body: 'Elige',
      buttonText: 'Abrir',
      rows,
    })
    const body = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.interactive.action.sections[0].rows).toHaveLength(10)
  })

  it('error de Meta → lanza', async () => {
    restore = mockFetch([{ status: 400, text: 'bad request' }])
    const provider = new MetaWhatsAppProvider(mockEnv as never)
    await expect(
      provider.sendListMessage({
        toWaId: '123',
        body: 'Elige',
        buttonText: 'Abrir',
        rows: [{ id: 'r1', title: 'O1' }],
      })
    ).rejects.toThrow('Meta WhatsApp API error')
  })
})