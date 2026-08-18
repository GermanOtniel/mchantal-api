import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidateAllPermissions } from '../../../shared/rbac/permission-cache'

const permissionRepo = {
  getKeysForUser: vi.fn(),
  getRolesForUser: vi.fn(),
  findAll: vi.fn(),
  userHasRoleSlug: vi.fn(),
}

vi.mock('../repositories/rbac.repository', () => ({
  PermissionRepository: vi.fn(function () {
    return permissionRepo
  }),
}))

import { PermissionService, buildUserAccessProfile } from './permission.service'

describe('PermissionService', () => {
  let service: PermissionService

  beforeEach(() => {
    invalidateAllPermissions()
    permissionRepo.getKeysForUser.mockReset()
    permissionRepo.getRolesForUser.mockReset()
    permissionRepo.findAll.mockReset()
    permissionRepo.userHasRoleSlug.mockReset()
    service = new PermissionService()
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repo = () => (service as any).permissionRepo

  it('getPermissionKeysForUser: cache miss llama al repo y devuelve un Set', async () => {
    repo().getKeysForUser.mockResolvedValue(['leads.read', 'roles.manage'])
    const result = await service.getPermissionKeysForUser('u1')
    expect(result).toBeInstanceOf(Set)
    expect([...result]).toEqual(['leads.read', 'roles.manage'])
    expect(repo().getKeysForUser).toHaveBeenCalledTimes(1)
  })

  it('getPermissionKeysForUser: cache hit no vuelve a llamar al repo', async () => {
    repo().getKeysForUser.mockResolvedValue(['leads.read'])
    await service.getPermissionKeysForUser('u1')
    await service.getPermissionKeysForUser('u1')
    expect(repo().getKeysForUser).toHaveBeenCalledTimes(1)
  })

  it('invalidateCache: siguiente llamada vuelve a consultar el repo', async () => {
    repo().getKeysForUser.mockResolvedValue(['leads.read'])
    await service.getPermissionKeysForUser('u1')
    service.invalidateCache('u1')
    await service.getPermissionKeysForUser('u1')
    expect(repo().getKeysForUser).toHaveBeenCalledTimes(2)
  })

  it('listAllPermissions mapea a PermissionSummary', async () => {
    repo().findAll.mockResolvedValue([
      { id: 'p1', key: 'leads.read', module: 'leads', description: 'Ver leads' },
    ])
    const result = await service.listAllPermissions()
    expect(result).toEqual([
      { id: 'p1', key: 'leads.read', module: 'leads', description: 'Ver leads' },
    ])
  })

  it('canAssignSuperAdminRole delega a userHasRoleSlug con super-admin', async () => {
    repo().userHasRoleSlug.mockResolvedValue(true)
    const result = await service.canAssignSuperAdminRole('u1')
    expect(result).toBe(true)
    expect(repo().userHasRoleSlug).toHaveBeenCalledWith('u1', 'super-admin')
  })

  it('buildUserAccessProfile devuelve roles + permisos ordenados', async () => {
    repo().getRolesForUser.mockResolvedValue([
      { id: 'r1', name: 'General Admin', slug: 'general-admin', description: null, isSystem: true },
    ])
    repo().getKeysForUser.mockResolvedValue(['z.perm', 'a.perm'])
    const profile = await buildUserAccessProfile('u1', service)
    expect(profile.roles).toHaveLength(1)
    expect(profile.permissions).toEqual(['a.perm', 'z.perm'])
  })
})