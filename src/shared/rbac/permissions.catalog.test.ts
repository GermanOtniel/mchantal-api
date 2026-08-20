import { describe, it, expect } from 'vitest'
import { PERMISSIONS, PERMISSION_CATALOG, SYSTEM_ROLES } from './permissions.catalog'

describe('permissions catalog — leads listing (Scope A)', () => {
  it('define las 6 keys de leads', () => {
    expect(PERMISSIONS.LEADS_READ).toBe('leads.read')
    expect(PERMISSIONS.LEADS_READ_ALL).toBe('leads.read.all')
    expect(PERMISSIONS.LEADS_FILTER_CAMPAIGN).toBe('leads.filter.campaign')
    expect(PERMISSIONS.LEADS_FILTER_STATUS).toBe('leads.filter.status')
    expect(PERMISSIONS.LEADS_FILTER_ASSIGNMENT).toBe('leads.filter.assignment')
    expect(PERMISSIONS.LEADS_CLEAR_NEEDS_REPLY).toBe('leads.clear_needs_reply')
  })

  it('LEADS_ATTEND existe y está en PERMISSION_CATALOG con módulo leads', () => {
    expect(PERMISSIONS.LEADS_ATTEND).toBe('leads.attend')
    const def = PERMISSION_CATALOG.find((p) => p.key === PERMISSIONS.LEADS_ATTEND)
    expect(def).toBeDefined()
    expect(def!.module).toBe('leads')
    expect(def!.description.length).toBeGreaterThan(0)
  })

  it('LEADS_REASSIGN existe y está en PERMISSION_CATALOG con módulo leads', () => {
    expect(PERMISSIONS.LEADS_REASSIGN).toBe('leads.reassign')
    const def = PERMISSION_CATALOG.find((p) => p.key === PERMISSIONS.LEADS_REASSIGN)
    expect(def).toBeDefined()
    expect(def!.module).toBe('leads')
    expect(def!.description.length).toBeGreaterThan(0)
  })

  it('LEADS_CHANGE_STATUS existe y está en PERMISSION_CATALOG con módulo leads', () => {
    expect(PERMISSIONS.LEADS_CHANGE_STATUS).toBe('leads.change_status')
    const def = PERMISSION_CATALOG.find((p) => p.key === PERMISSIONS.LEADS_CHANGE_STATUS)
    expect(def).toBeDefined()
    expect(def!.module).toBe('leads')
    expect(def!.description.length).toBeGreaterThan(0)
  })

  it('PERMISSION_CATALOG incluye las 5 keys nuevas con módulo leads', () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key)
    expect(keys).toContain('leads.read.all')
    expect(keys).toContain('leads.filter.campaign')
    expect(keys).toContain('leads.filter.status')
    expect(keys).toContain('leads.filter.assignment')
    expect(keys).toContain('leads.clear_needs_reply')
    for (const key of [
      'leads.read.all',
      'leads.filter.campaign',
      'leads.filter.status',
      'leads.filter.assignment',
      'leads.clear_needs_reply',
    ]) {
      const def = PERMISSION_CATALOG.find((p) => p.key === key)!
      expect(def.module).toBe('leads')
      expect(def.description.length).toBeGreaterThan(0)
    }
  })

  it('SYSTEM_ROLES incluyen las 5 keys nuevas (auto-vía PERMISSION_CATALOG)', () => {
    const superAdminKeys = SYSTEM_ROLES.SUPER_ADMIN.permissionKeys
    expect(superAdminKeys).toContain('leads.read.all')
    expect(superAdminKeys).toContain('leads.clear_needs_reply')
    expect(SYSTEM_ROLES.GENERAL_ADMIN.permissionKeys).toContain('leads.filter.assignment')
  })

  it('ANALYTICS_READ existe con módulo analytics y los roles de sistema lo heredan', () => {
    expect(PERMISSIONS.ANALYTICS_READ).toBe('analytics.read')
    const def = PERMISSION_CATALOG.find((p) => p.key === PERMISSIONS.ANALYTICS_READ)
    expect(def).toBeDefined()
    expect(def!.module).toBe('analytics')
    expect(def!.description.length).toBeGreaterThan(0)
    expect(SYSTEM_ROLES.SUPER_ADMIN.permissionKeys).toContain('analytics.read')
    expect(SYSTEM_ROLES.GENERAL_ADMIN.permissionKeys).toContain('analytics.read')
  })
})