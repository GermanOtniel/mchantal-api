import { describe, it, expect, vi } from 'vitest'
import { AssignmentService } from './assignment.service'
import type {
  ExecutiveData,
  ExecutiveRepositoryPort,
  UpdateExecutiveData,
} from '../types/executives.types'
import type { AssignmentDirective, LeadAssignmentContext } from '../types/assignment.types'

function exec(over: Partial<ExecutiveData> = {}): ExecutiveData {
  return {
    id: 'e1',
    fullName: 'Pepe',
    email: 'pepe@x.com',
    isActive: true,
    coverage: { states: ['jalisco'] },
    lastAssignedAt: null,
    ...over,
  }
}

function mkRepo(over: Partial<ExecutiveRepositoryPort> = {}): ExecutiveRepositoryPort {
  return {
    listExecutives: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    findActiveByCoverage: vi.fn(async () => []),
    findAllActive: vi.fn(async () => []),
    update: vi.fn(async (_id: string, _p: UpdateExecutiveData) => exec()),
    touchLastAssignedAt: vi.fn(async () => {}),
    ...over,
  }
}

const CTX: LeadAssignmentContext = { folio: 'MC-1', answers: { estado: 'jalisco' } }

describe('AssignmentService — executive', () => {
  it('executive existe → asigna', async () => {
    const repo = mkRepo({ findById: vi.fn(async () => exec({ id: 'pepe' })) })
    const svc = new AssignmentService(repo)
    const r = await svc.resolve({ mode: 'executive', executiveId: 'pepe' }, CTX)
    expect(r).toEqual({ mode: 'executive', executiveId: 'pepe' })
  })
  it('executive no existe → 400 EXECUTIVE_NOT_FOUND', async () => {
    const repo = mkRepo({ findById: vi.fn(async () => null) })
    const svc = new AssignmentService(repo)
    await expect(svc.resolve({ mode: 'executive', executiveId: 'nope' }, CTX)).rejects.toMatchObject({
      statusCode: 400,
      code: 'EXECUTIVE_NOT_FOUND',
    })
  })
})

describe('AssignmentService — manual', () => {
  it('manual → { mode manual, executiveId null }', async () => {
    const svc = new AssignmentService(mkRepo())
    expect(await svc.resolve({ mode: 'manual' }, CTX)).toEqual({ mode: 'manual', executiveId: null })
  })
})

describe('AssignmentService — pool coverage', () => {
  it('interpola {{answers.estado}} y resuelve por cobertura', async () => {
    const repo = mkRepo({ findActiveByCoverage: vi.fn(async (_attr: string, _val: string) => [
      exec({ id: 'pepe', lastAssignedAt: new Date('2026-01-01') }),
      exec({ id: 'ana', lastAssignedAt: null }),
    ]) })
    const svc = new AssignmentService(repo)
    const d: AssignmentDirective = { mode: 'pool', selector: { kind: 'coverage', attribute: 'states', value: '{{answers.estado}}' }, strategy: 'round_robin' }
    const r = await svc.resolve(d, CTX)
    // round_robin = lastAssignedAt más antiguo (null = más antiguo) → ana
    expect(r).toEqual({ mode: 'pool', executiveId: 'ana' })
    expect(repo.findActiveByCoverage).toHaveBeenCalledWith('states', 'jalisco')
    expect(repo.touchLastAssignedAt).toHaveBeenCalledWith('ana')
  })
  it('pool vacío (sin cobertura) → fallback manual', async () => {
    const repo = mkRepo({ findActiveByCoverage: vi.fn(async () => []) })
    const svc = new AssignmentService(repo)
    const d: AssignmentDirective = { mode: 'pool', selector: { kind: 'coverage', attribute: 'states', value: '{{answers.estado}}' }, strategy: 'round_robin' }
    expect(await svc.resolve(d, CTX)).toEqual({ mode: 'manual', executiveId: null })
    expect(repo.touchLastAssignedAt).not.toHaveBeenCalled()
  })
  it('interpolación con valor literal (sin {{}})', async () => {
    const repo = mkRepo({ findActiveByCoverage: vi.fn(async () => [exec({ id: 'x' })]) })
    const svc = new AssignmentService(repo)
    const d: AssignmentDirective = { mode: 'pool', selector: { kind: 'coverage', attribute: 'states', value: 'jalisco' }, strategy: 'round_robin' }
    expect(await svc.resolve(d, CTX)).toEqual({ mode: 'pool', executiveId: 'x' })
    expect(repo.findActiveByCoverage).toHaveBeenCalledWith('states', 'jalisco')
  })
  it('template no resuelto (clave ausente) → usa el literal del template', async () => {
    const repo = mkRepo({ findActiveByCoverage: vi.fn(async () => []) })
    const svc = new AssignmentService(repo)
    const d: AssignmentDirective = { mode: 'pool', selector: { kind: 'coverage', attribute: 'states', value: '{{answers.ciudad}}' }, strategy: 'round_robin' }
    // answers.ciudad no existe → el valor interpolado queda vacío → string vacío no coincide → manual
    expect(await svc.resolve(d, { answers: { estado: 'jalisco' } })).toEqual({ mode: 'manual', executiveId: null })
  })
})

describe('AssignmentService — pool executive_ids', () => {
  it('round-robin entre los ids dados (filtrando existentes+activos)', async () => {
    const repo = mkRepo({ findById: vi.fn(async (id: string) => (id === 'pepe' ? exec({ id: 'pepe', lastAssignedAt: new Date('2026-01-01') }) : id === 'ana' ? exec({ id: 'ana', lastAssignedAt: null }) : null)) })
    const svc = new AssignmentService(repo)
    const d: AssignmentDirective = { mode: 'pool', selector: { kind: 'executive_ids', ids: ['pepe', 'ana', 'fantasma'] }, strategy: 'round_robin' }
    expect(await svc.resolve(d, CTX)).toEqual({ mode: 'pool', executiveId: 'ana' })
    expect(repo.touchLastAssignedAt).toHaveBeenCalledWith('ana')
  })
  it('todos inexistentes → manual', async () => {
    const repo = mkRepo({ findById: vi.fn(async () => null) })
    const svc = new AssignmentService(repo)
    const d: AssignmentDirective = { mode: 'pool', selector: { kind: 'executive_ids', ids: ['x'] }, strategy: 'round_robin' }
    expect(await svc.resolve(d, CTX)).toEqual({ mode: 'manual', executiveId: null })
  })
})

describe('AssignmentService — pool all_active', () => {
  it('round-robin entre todos los activos', async () => {
    const repo = mkRepo({ findAllActive: vi.fn(async () => [
      exec({ id: 'pepe', lastAssignedAt: new Date('2026-01-01') }),
      exec({ id: 'ana', lastAssignedAt: null }),
    ]) })
    const svc = new AssignmentService(repo)
    const d: AssignmentDirective = { mode: 'pool', selector: { kind: 'all_active' }, strategy: 'round_robin' }
    expect(await svc.resolve(d, CTX)).toEqual({ mode: 'pool', executiveId: 'ana' })
  })
  it('sin activos → manual', async () => {
    const repo = mkRepo({ findAllActive: vi.fn(async () => []) })
    const svc = new AssignmentService(repo)
    const d: AssignmentDirective = { mode: 'pool', selector: { kind: 'all_active' }, strategy: 'round_robin' }
    expect(await svc.resolve(d, CTX)).toEqual({ mode: 'manual', executiveId: null })
  })
})