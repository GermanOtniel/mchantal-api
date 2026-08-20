import { describe, it, expect, vi } from 'vitest'
import { LeadCaptureService } from './lead-capture.service'
import { HttpError } from '../../auth/http-error'

const PHONE = '+52 1234 567 890' // se normaliza a digitos en wa.me

function makeDeps(over: Partial<{
  campaigns: { findBySlug: (s: string) => Promise<{ id: string; entryMessage: string; origins: string[] } | null> }
  captures: { create: (d: unknown) => Promise<unknown> }
}> = {}) {
  return {
    campaigns: {
      findBySlug: vi.fn(async () => ({ id: 'camp1', entryMessage: 'Hola, mi folio es {{folio}}, quiero info.', origins: [] })),
    },
    captures: { create: vi.fn(async () => ({})) },
    businessPhoneNumberE164: PHONE,
    generateFolio: () => 'MC-ABCDE',
    ...over,
  }
}

describe('LeadCaptureService.createCapture', () => {
  it('si la campaña no existe lanza 404 CAMPAIGN_NOT_FOUND', async () => {
    const svc = new LeadCaptureService(makeDeps({ campaigns: { findBySlug: vi.fn(async () => null) } }))
    await expect(svc.createCapture('no-existe')).rejects.toMatchObject({
      statusCode: 404, code: 'CAMPAIGN_NOT_FOUND',
    })
  })

  it('genera folio, crea captura pendiente y devuelve redirectUrl con entryMessage interpolado', async () => {
    const deps = makeDeps()
    const svc = new LeadCaptureService(deps)
    const result = await svc.createCapture('demo')
    expect(deps.captures.create).toHaveBeenCalledWith({ folio: 'MC-ABCDE', campaignId: 'camp1', status: 'pending', origin: 'unknown' })
    expect(result.folio).toBe('MC-ABCDE')
    expect(result.redirectUrl).toBe(
      `https://wa.me/521234567890?text=${encodeURIComponent('Hola, mi folio es MC-ABCDE, quiero info.')}`
    )
  })

  it('normaliza el teléfono a dígitos en wa.me', async () => {
    const deps = makeDeps({ businessPhoneNumberE164: '+52 (55) 1234-5678' })
    const svc = new LeadCaptureService(deps)
    const result = await svc.createCapture('demo')
    expect(result.redirectUrl.startsWith('https://wa.me/525512345678?text=')).toBe(true)
  })

  it('normaliza A1: origin en la lista de la campaña → se guarda', async () => {
    const deps = makeDeps({
      campaigns: { findBySlug: vi.fn(async () => ({ id: 'camp1', entryMessage: 'Hola {{folio}}', origins: ['Facebook'] })) },
    })
    const svc = new LeadCaptureService(deps)
    await svc.createCapture('demo', 'Facebook')
    expect(deps.captures.create).toHaveBeenCalledWith({ folio: 'MC-ABCDE', campaignId: 'camp1', status: 'pending', origin: 'Facebook' })
  })

  it('normaliza A1: origin ausente → unknown', async () => {
    const deps = makeDeps({
      campaigns: { findBySlug: vi.fn(async () => ({ id: 'camp1', entryMessage: 'Hola {{folio}}', origins: ['Facebook'] })) },
    })
    const svc = new LeadCaptureService(deps)
    await svc.createCapture('demo')
    expect(deps.captures.create).toHaveBeenCalledWith(expect.objectContaining({ origin: 'unknown' }))
  })

  it('normaliza A1: origin fuera de la lista → unknown (no rechaza)', async () => {
    const deps = makeDeps({
      campaigns: { findBySlug: vi.fn(async () => ({ id: 'camp1', entryMessage: 'Hola {{folio}}', origins: ['Facebook'] })) },
    })
    const svc = new LeadCaptureService(deps)
    await svc.createCapture('demo', 'Spam')
    expect(deps.captures.create).toHaveBeenCalledWith(expect.objectContaining({ origin: 'unknown' }))
  })

  it('normaliza A1: campaña sin origins definidos → unknown', async () => {
    const deps = makeDeps()
    const svc = new LeadCaptureService(deps)
    await svc.createCapture('demo', 'Facebook')
    expect(deps.captures.create).toHaveBeenCalledWith(expect.objectContaining({ origin: 'unknown' }))
  })

  it('normaliza A1: comparación case-insensitive (facebook vs Facebook) → guarda el valor de la lista', async () => {
    const deps = makeDeps({
      campaigns: { findBySlug: vi.fn(async () => ({ id: 'camp1', entryMessage: 'Hola {{folio}}', origins: ['Facebook'] })) },
    })
    const svc = new LeadCaptureService(deps)
    await svc.createCapture('demo', 'facebook')
    expect(deps.captures.create).toHaveBeenCalledWith(expect.objectContaining({ origin: 'facebook' }))
  })
})