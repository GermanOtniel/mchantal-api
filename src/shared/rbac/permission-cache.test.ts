import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCachedPermissions,
  setCachedPermissions,
  invalidateUserPermissions,
  invalidateAllPermissions,
} from './permission-cache'

describe('permission-cache', () => {
  beforeEach(() => {
    invalidateAllPermissions()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('getCachedPermissions devuelve null si nunca se guardó', () => {
    expect(getCachedPermissions('u1')).toBeNull()
  })

  it('setCachedPermissions luego getCachedPermissions devuelve el set (hit)', () => {
    const perms = new Set(['leads.read', 'roles.manage'])
    setCachedPermissions('u1', perms)
    expect(getCachedPermissions('u1')).toBe(perms)
  })

  it('get devuelve null tras expirar el TTL (60s)', () => {
    setCachedPermissions('u1', new Set(['leads.read']))
    vi.advanceTimersByTime(60_001)
    expect(getCachedPermissions('u1')).toBeNull()
  })

  it('get devuelve el set antes de expirar el TTL', () => {
    setCachedPermissions('u1', new Set(['leads.read']))
    vi.advanceTimersByTime(59_999)
    expect(getCachedPermissions('u1')).not.toBeNull()
  })

  it('invalidateUserPermissions elimina sólo a ese usuario', () => {
    setCachedPermissions('u1', new Set(['a']))
    setCachedPermissions('u2', new Set(['b']))
    invalidateUserPermissions('u1')
    expect(getCachedPermissions('u1')).toBeNull()
    expect(getCachedPermissions('u2')).not.toBeNull()
  })

  it('invalidateAllPermissions limpia todo', () => {
    setCachedPermissions('u1', new Set(['a']))
    setCachedPermissions('u2', new Set(['b']))
    invalidateAllPermissions()
    expect(getCachedPermissions('u1')).toBeNull()
    expect(getCachedPermissions('u2')).toBeNull()
  })
})