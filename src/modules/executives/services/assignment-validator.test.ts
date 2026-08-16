import { describe, it, expect } from 'vitest'
import { validateAssignmentDirective } from './assignment-validator'
import type { AssignmentDirective } from '../types/assignment.types'

function codes(issues: { code: string }[]): string[] {
  return issues.map((i) => i.code)
}

describe('validateAssignmentDirective — válidos', () => {
  it('executive válido', () => {
    expect(validateAssignmentDirective({ mode: 'executive', executiveId: 'u1' })).toEqual([])
  })
  it('pool coverage válido', () => {
    const d: AssignmentDirective = { mode: 'pool', selector: { kind: 'coverage', attribute: 'states', value: '{{answers.estado}}' }, strategy: 'round_robin' }
    expect(validateAssignmentDirective(d)).toEqual([])
  })
  it('pool executive_ids válido', () => {
    const d: AssignmentDirective = { mode: 'pool', selector: { kind: 'executive_ids', ids: ['u1', 'u2'] }, strategy: 'random' }
    expect(validateAssignmentDirective(d)).toEqual([])
  })
  it('pool all_active válido', () => {
    const d: AssignmentDirective = { mode: 'pool', selector: { kind: 'all_active' }, strategy: 'least_busy' }
    expect(validateAssignmentDirective(d)).toEqual([])
  })
  it('manual válido', () => {
    expect(validateAssignmentDirective({ mode: 'manual' })).toEqual([])
  })
})

describe('validateAssignmentDirective — inválidos', () => {
  it('no es objeto', () => expect(codes(validateAssignmentDirective(null))).toContain('NOT_OBJECT'))
  it('mode desconocido', () => expect(codes(validateAssignmentDirective({ mode: 'x' }))).toContain('MODE_UNKNOWN'))
  it('executive sin executiveId', () => expect(codes(validateAssignmentDirective({ mode: 'executive', executiveId: '' }))).toContain('EXECUTIVE_ID_EMPTY'))
  it('pool sin selector', () => expect(codes(validateAssignmentDirective({ mode: 'pool', strategy: 'round_robin' }))).toContain('POOL_SELECTOR_MISSING'))
  it('pool con selector kind desconocido', () => expect(codes(validateAssignmentDirective({ mode: 'pool', selector: { kind: 'x' }, strategy: 'round_robin' }))).toContain('POOL_SELECTOR_KIND_UNKNOWN'))
  it('pool coverage sin attribute', () => expect(codes(validateAssignmentDirective({ mode: 'pool', selector: { kind: 'coverage', attribute: '', value: 'x' }, strategy: 'round_robin' }))).toContain('COVERAGE_ATTRIBUTE_EMPTY'))
  it('pool coverage sin value', () => expect(codes(validateAssignmentDirective({ mode: 'pool', selector: { kind: 'coverage', attribute: 'states', value: '' }, strategy: 'round_robin' }))).toContain('COVERAGE_VALUE_EMPTY'))
  it('pool executive_ids vacío', () => expect(codes(validateAssignmentDirective({ mode: 'pool', selector: { kind: 'executive_ids', ids: [] }, strategy: 'round_robin' }))).toContain('EXECUTIVE_IDS_EMPTY'))
  it('pool con strategy desconocido', () => expect(codes(validateAssignmentDirective({ mode: 'pool', selector: { kind: 'all_active' }, strategy: 'x' }))).toContain('STRATEGY_UNKNOWN'))
  it('pool sin strategy', () => expect(codes(validateAssignmentDirective({ mode: 'pool', selector: { kind: 'all_active' } }))).toContain('STRATEGY_MISSING'))
})