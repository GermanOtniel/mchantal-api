import { describe, it, expect, vi } from 'vitest'
import { CampaignService } from './campaign.service'
import { HttpError } from '../../auth/http-error'
import type { CampaignRepositoryPort, Campaign } from './campaign.types'

function validFlow() {
  return {
    nodes: {
      welcome: {
        id: 'welcome',
        type: 'interactive_buttons' as const,
        body: '¿Qué te trae aquí?',
        buttons: [{ id: 'comprar', title: 'Quiero comprar' }],
        transitions: { comprar: 'closing' },
        onFreeText: 'reprompt' as const,
      },
      closing: { id: 'closing', type: 'text_message' as const, body: '¡Gracias!' },
    },
  }
}

function makeCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: 'c1',
    slug: 'demo',
    name: 'Demo',
    entryMessage: 'Hola, mi folio es {{folio}}',
    flowDefinition: { nodes: {} },
    origins: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
}

function makeRepo(over: Partial<CampaignRepositoryPort> = {}): CampaignRepositoryPort {
  return {
    create: vi.fn().mockResolvedValue(makeCampaign()),
    update: vi.fn().mockResolvedValue(makeCampaign()),
    findById: vi.fn().mockResolvedValue(makeCampaign()),
    listAll: vi.fn().mockResolvedValue([]),
    slugExists: vi.fn().mockResolvedValue(false),
    ...over,
  }
}

describe('CampaignService.createCampaign', () => {
  it('genera slug del nombre y crea con flow valido', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    await svc.createCampaign({
      name: 'Demo Presentación',
      entryMessage: 'Hola, mi folio es {{folio}}',
      flowDefinition: validFlow(),
    })
    expect(repo.create).toHaveBeenCalledWith({
      slug: 'demo-presentación',
      name: 'Demo Presentación',
      entryMessage: 'Hola, mi folio es {{folio}}',
      flowDefinition: validFlow(),
      origins: [],
    })
  })

  it('lanza 400 INVALID_FLOW con los issues si el flow es invalido', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    const invalidFlow = {
      nodes: {
        welcome: {
          id: 'welcome',
          type: 'interactive_buttons',
          body: '¿?',
          buttons: [{ id: 'x', title: 'X' }],
          transitions: { x: 'no_existe' },
          onFreeText: 'reprompt',
        },
      },
    }
    try {
      await svc.createCampaign({ name: 'Demo', entryMessage: 'Hola {{folio}}', flowDefinition: invalidFlow })
      throw new Error('deberia haber lanzado')
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError)
      expect((e as HttpError).statusCode).toBe(400)
      expect((e as HttpError).code).toBe('INVALID_FLOW')
      expect(Array.isArray((e as HttpError).details)).toBe(true)
      expect(((e as HttpError).details as { code: string }[]).some((i) => i.code === 'NODE_REF_NOT_FOUND')).toBe(true)
    }
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('sin flowDefinition no valida el flow y guarda nodes vacio', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    await svc.createCampaign({ name: 'Demo', entryMessage: 'Hola {{folio}}' })
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ flowDefinition: { nodes: {} } })
    )
  })

  it('lanza 400 INVALID_ENTRY_MESSAGE si falta {{folio}}', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    await expect(
      svc.createCampaign({ name: 'Demo', entryMessage: 'Hola, quiero info' })
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ENTRY_MESSAGE' })
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('hace el slug unico con sufijo -2, -3 si ya existe', async () => {
    const repo = makeRepo({
      slugExists: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    })
    const svc = new CampaignService(repo)
    await svc.createCampaign({ name: 'Demo', entryMessage: 'Hola {{folio}}' })
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'demo-3' }))
  })

  it('normaliza origins: trim, dedupe case-insensitive, descarta vacíos', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    await svc.createCampaign({
      name: 'Demo',
      entryMessage: 'Hola {{folio}}',
      origins: [' Facebook ', 'facebook', '', 'Instagram'],
    })
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ origins: ['Facebook', 'Instagram'] }))
  })

  it('sin origins → []', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    await svc.createCampaign({ name: 'Demo', entryMessage: 'Hola {{folio}}' })
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ origins: [] }))
  })
})

describe('CampaignService.updateCampaign', () => {
  it('lanza 400 INVALID_FLOW si el flow patcheado es invalido', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    await expect(
      svc.updateCampaign('c1', {
        flowDefinition: { nodes: { welcome: { id: 'welcome', type: 'interactive_buttons', body: '?', buttons: [{ id: 'x', title: 'X' }], transitions: { x: 'no' }, onFreeText: 'reprompt' } } },
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_FLOW' })
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('lanza 400 INVALID_ENTRY_MESSAGE si el entryMessage patcheado no tiene {{folio}}', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    await expect(svc.updateCampaign('c1', { entryMessage: 'sin folio' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_ENTRY_MESSAGE',
    })
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('pasa el patch sin tocar el slug', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    await svc.updateCampaign('c1', { name: 'Nuevo nombre' })
    expect(repo.update).toHaveBeenCalledWith('c1', { name: 'Nuevo nombre' })
  })

  it('acepta un patch de flow valido', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    await svc.updateCampaign('c1', { flowDefinition: validFlow() })
    expect(repo.update).toHaveBeenCalledWith('c1', { flowDefinition: validFlow() })
  })

  it('acepta y normaliza origins en el patch', async () => {
    const repo = makeRepo()
    const svc = new CampaignService(repo)
    await svc.updateCampaign('c1', { origins: [' TikTok ', 'tiktok'] })
    expect(repo.update).toHaveBeenCalledWith('c1', expect.objectContaining({ origins: ['TikTok'] }))
  })
})