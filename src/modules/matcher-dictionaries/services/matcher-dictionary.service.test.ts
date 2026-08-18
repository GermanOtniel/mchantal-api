import { describe, it, expect, vi } from 'vitest'
import { MatcherDictionaryService } from './matcher-dictionary.service'
import type {
  MatcherDictionaryRepositoryPort,
  MatcherDictionaryData,
  CreateDictionaryData,
} from '../types/dictionary.types'

function mkRepo(over: Partial<MatcherDictionaryRepositoryPort> = {}): MatcherDictionaryRepositoryPort {
  return {
    listAll: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    findBySlug: vi.fn(async () => null),
    create: vi.fn(async (d: CreateDictionaryData) => ({
      id: 'd1',
      slug: d.slug,
      name: d.name,
      categories: d.categories,
      isSystem: d.isSystem ?? false,
    })),
    update: vi.fn(async (_id, patch) => ({
      id: 'd1',
      slug: 's',
      name: 'N',
      categories: [],
      isSystem: false,
      ...patch,
    } as MatcherDictionaryData)),
    delete: vi.fn(async () => {}),
    slugExists: vi.fn(async () => false),
    ...over,
  }
}

const VALID: CreateDictionaryData = {
  slug: 'estados-de-mexico',
  name: 'Estados de México',
  categories: [{ id: 'jalisco', label: 'Jalisco', aliases: ['jalisco', 'gdl'] }],
}

describe('MatcherDictionaryService — create', () => {
  it('crea con datos válidos', async () => {
    const repo = mkRepo()
    const svc = new MatcherDictionaryService(repo)
    const d = await svc.create(VALID)
    expect(d.slug).toBe('estados-de-mexico')
    expect(repo.create).toHaveBeenCalledOnce()
  })
  it('rechaza diccionario inválido (400 INVALID_DICTIONARY)', async () => {
    const repo = mkRepo()
    const svc = new MatcherDictionaryService(repo)
    await expect(svc.create({ slug: '', name: '', categories: [] })).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_DICTIONARY',
    })
    expect(repo.create).not.toHaveBeenCalled()
  })
  it('rechaza slug duplicado (409 SLUG_TAKEN)', async () => {
    const repo = mkRepo({ slugExists: vi.fn(async () => true) })
    const svc = new MatcherDictionaryService(repo)
    await expect(svc.create(VALID)).rejects.toMatchObject({ statusCode: 409, code: 'SLUG_TAKEN' })
  })
})

describe('MatcherDictionaryService — update', () => {
  it('edita diccionario propio (no sistema)', async () => {
    const repo = mkRepo({
      findById: vi.fn(async () => ({ id: 'd1', slug: 's', name: 'N', categories: [{ id: 'jalisco', label: 'Jalisco', aliases: ['jalisco'] }], isSystem: false })),
    })
    const svc = new MatcherDictionaryService(repo)
    await svc.update('d1', { name: 'Nuevo' })
    expect(repo.update).toHaveBeenCalledWith('d1', expect.objectContaining({ name: 'Nuevo' }))
  })
  it('bloquea edición de diccionario de sistema (403 SYSTEM_DICTIONARY)', async () => {
    const repo = mkRepo({
      findById: vi.fn(async () => ({ id: 'd1', slug: 's', name: 'N', categories: [], isSystem: true })),
    })
    const svc = new MatcherDictionaryService(repo)
    await expect(svc.update('d1', { name: 'X' })).rejects.toMatchObject({
      statusCode: 403,
      code: 'SYSTEM_DICTIONARY',
    })
    expect(repo.update).not.toHaveBeenCalled()
  })
  it('404 si no existe', async () => {
    const repo = mkRepo({ findById: vi.fn(async () => null) })
    const svc = new MatcherDictionaryService(repo)
    await expect(svc.update('nope', { name: 'X' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'DICTIONARY_NOT_FOUND',
    })
  })
  it('rechaza patch inválido (400 INVALID_DICTIONARY)', async () => {
    const repo = mkRepo({
      findById: vi.fn(async () => ({ id: 'd1', slug: 's', name: 'N', categories: [{ id: 'jalisco', label: 'Jalisco', aliases: ['jalisco'] }], isSystem: false })),
    })
    const svc = new MatcherDictionaryService(repo)
    await expect(svc.update('d1', { name: '' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_DICTIONARY',
    })
    expect(repo.update).not.toHaveBeenCalled()
  })
  it('rechaza slug duplicado al cambiar (409 SLUG_TAKEN)', async () => {
    const repo = mkRepo({
      findById: vi.fn(async () => ({ id: 'd1', slug: 's', name: 'N', categories: [{ id: 'jalisco', label: 'Jalisco', aliases: ['jalisco'] }], isSystem: false })),
      slugExists: vi.fn(async () => true),
    })
    const svc = new MatcherDictionaryService(repo)
    await expect(svc.update('d1', { slug: 'tomado' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'SLUG_TAKEN',
    })
  })
})

describe('MatcherDictionaryService — clone', () => {
  it('clona un diccionario en una copia editable isSystem=false', async () => {
    const repo = mkRepo({
      findById: vi.fn(async () => ({
        id: 'orig',
        slug: 'estados-de-mexico',
        name: 'Estados de México',
        categories: [{ id: 'jalisco', label: 'Jalisco', aliases: ['jalisco'] }],
        isSystem: true,
      })),
      slugExists: vi.fn(async () => false),
    })
    const svc = new MatcherDictionaryService(repo)
    const clone = await svc.clone('orig')
    expect(clone.isSystem).toBe(false)
    expect(clone.name).toBe('Estados de México (copia)')
    expect(clone.slug).toBe('estados-de-mexico-copia')
    expect(clone.categories).toHaveLength(1)
    expect(repo.create).toHaveBeenCalledOnce()
  })
  it('genera slug alternativo si el de copia ya existe', async () => {
    let calls = 0
    const repo = mkRepo({
      findById: vi.fn(async () => ({
        id: 'orig',
        slug: 'estados-de-mexico',
        name: 'Estados de México',
        categories: [],
        isSystem: true,
      })),
      slugExists: vi.fn(async () => {
        calls++
        return calls === 1 // el primero (-copia) existe, el segundo no
      }),
    })
    const svc = new MatcherDictionaryService(repo)
    const clone = await svc.clone('orig')
    expect(clone.slug).toBe('estados-de-mexico-copia-2')
  })
  it('404 si no existe el origen', async () => {
    const repo = mkRepo({ findById: vi.fn(async () => null) })
    const svc = new MatcherDictionaryService(repo)
    await expect(svc.clone('nope')).rejects.toMatchObject({ statusCode: 404, code: 'DICTIONARY_NOT_FOUND' })
  })
})

describe('MatcherDictionaryService — delete', () => {
  it('bloquea borrado de sistema (403)', async () => {
    const repo = mkRepo({
      findById: vi.fn(async () => ({ id: 'd1', slug: 's', name: 'N', categories: [], isSystem: true })),
    })
    const svc = new MatcherDictionaryService(repo)
    await expect(svc.delete('d1')).rejects.toMatchObject({ statusCode: 403, code: 'SYSTEM_DICTIONARY' })
    expect(repo.delete).not.toHaveBeenCalled()
  })
  it('borra diccionario propio', async () => {
    const repo = mkRepo({
      findById: vi.fn(async () => ({ id: 'd1', slug: 's', name: 'N', categories: [{ id: 'jalisco', label: 'Jalisco', aliases: ['jalisco'] }], isSystem: false })),
    })
    const svc = new MatcherDictionaryService(repo)
    await svc.delete('d1')
    expect(repo.delete).toHaveBeenCalledWith('d1')
  })
  it('404 si no existe', async () => {
    const repo = mkRepo({ findById: vi.fn(async () => null) })
    const svc = new MatcherDictionaryService(repo)
    await expect(svc.delete('nope')).rejects.toMatchObject({ statusCode: 404, code: 'DICTIONARY_NOT_FOUND' })
  })
})