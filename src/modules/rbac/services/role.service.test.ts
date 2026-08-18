import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidateAllPermissions } from '../../../shared/rbac/permission-cache'

const roleRepo = {
  findAll: vi.fn(),
  findById: vi.fn(),
  findBySlug: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getPermissionIdsForRole: vi.fn(),
  getPermissionsForRole: vi.fn(),
  setPermissionsForRole: vi.fn(),
}
const permissionRepo = {
  findAll: vi.fn(),
  findByKeys: vi.fn(),
  getKeysForUser: vi.fn(),
  getRolesForUser: vi.fn(),
  userHasRoleSlug: vi.fn(),
}
const userRoleRepo = {
  getRoleIdsForUser: vi.fn(),
  setRolesForUser: vi.fn(),
  assignRole: vi.fn(),
  getUserIdsWithRole: vi.fn(),
}
const userRepo = { findByEmail: vi.fn() }

vi.mock('../repositories/rbac.repository', () => ({
  PermissionRepository: vi.fn(function () {
    return permissionRepo
  }),
  RoleRepository: vi.fn(function () {
    return roleRepo
  }),
  UserRoleRepository: vi.fn(function () {
    return userRoleRepo
  }),
}))

vi.mock('../../auth/repositories/user.repository', () => ({
  UserRepository: vi.fn(function () {
    return userRepo
  }),
}))

vi.mock('../../../database/data-source', () => ({
  AppDataSource: {
    getRepository: vi.fn(() => ({ find: vi.fn().mockResolvedValue([]) })),
  },
}))

import { RoleService, UserRoleService } from './role.service'
import { PermissionService } from './permission.service'

describe('RoleService / UserRoleService', () => {
  let permissionService: PermissionService
  let roleService: RoleService
  let userRoleService: UserRoleService

  beforeEach(() => {
    invalidateAllPermissions()
    for (const m of [roleRepo, permissionRepo, userRoleRepo, userRepo]) {
      for (const k of Object.keys(m)) (m as Record<string, vi.Mock>).mockReset?.()
    }
    permissionService = new PermissionService()
    roleService = new RoleService(permissionService)
    userRoleService = new UserRoleService(permissionService)
  })

  describe('RoleService.createRole', () => {
    it('genera slug desde el nombre si no se provee', async () => {
      permissionRepo.findByKeys.mockResolvedValue([{ id: 'p1' }])
      roleRepo.findBySlug.mockResolvedValue(null)
      roleRepo.create.mockResolvedValue({ id: 'r1' })
      roleRepo.findById.mockResolvedValue({ id: 'r1', name: 'X', slug: 'x', description: null, isSystem: false })
      roleRepo.getPermissionsForRole.mockResolvedValue([])
      await roleService.createRole({ name: 'Mi Rol', permissionKeys: ['leads.read'] })
      expect(roleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Mi Rol', slug: 'mi-rol' })
      )
    })

    it('lanza 409 ROLE_SLUG_EXISTS si el slug ya existe', async () => {
      roleRepo.findBySlug.mockResolvedValue({ id: 'exists' })
      await expect(
        roleService.createRole({ name: 'X', permissionKeys: [] })
      ).rejects.toMatchObject({ statusCode: 409, code: 'ROLE_SLUG_EXISTS' })
    })

    it('lanza 400 INVALID_PERMISSION si algún permiso no existe', async () => {
      roleRepo.findBySlug.mockResolvedValue(null)
      permissionRepo.findByKeys.mockResolvedValue([]) // ninguno encontrado
      await expect(
        roleService.createRole({ name: 'X', permissionKeys: ['no.existe'] })
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PERMISSION' })
    })
  })

  describe('RoleService.deleteRole', () => {
    it('lanza 403 SYSTEM_ROLE_PROTECTED para rol sistema', async () => {
      roleRepo.findById.mockResolvedValue({ id: 'r1', isSystem: true })
      await expect(roleService.deleteRole('r1')).rejects.toMatchObject({
        statusCode: 403,
        code: 'SYSTEM_ROLE_PROTECTED',
      })
    })

    it('borra rol no-sistema e invalida cache de usuarios con ese rol', async () => {
      roleRepo.findById.mockResolvedValue({ id: 'r1', isSystem: false })
      userRoleRepo.getUserIdsWithRole.mockResolvedValue(['u1', 'u2'])
      const spy = vi.spyOn(permissionService, 'invalidateCache').mockImplementation(() => undefined)
      await roleService.deleteRole('r1')
      expect(roleRepo.delete).toHaveBeenCalledWith('r1')
      expect(spy).toHaveBeenCalledWith('u1')
      expect(spy).toHaveBeenCalledWith('u2')
      spy.mockRestore()
    })
  })

  describe('RoleService.setRolePermissions', () => {
    it('lanza 400 INVALID_PERMISSION si un permiso no existe', async () => {
      roleRepo.findById.mockResolvedValue({ id: 'r1' })
      permissionRepo.findByKeys.mockResolvedValue([])
      await expect(
        roleService.setRolePermissions('r1', ['no.existe'])
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PERMISSION' })
    })

    it('setea permisos e invalida cache de usuarios del rol', async () => {
      roleRepo.findById.mockResolvedValue({ id: 'r1' })
      permissionRepo.findByKeys.mockResolvedValue([{ id: 'p1' }])
      userRoleRepo.getUserIdsWithRole.mockResolvedValue(['u1'])
      roleRepo.getPermissionsForRole.mockResolvedValue([])
      roleRepo.findById.mockResolvedValue({ id: 'r1', name: 'X', slug: 'x', description: null, isSystem: false })
      const spy = vi.spyOn(permissionService, 'invalidateCache').mockImplementation(() => undefined)
      await roleService.setRolePermissions('r1', ['leads.read'])
      expect(roleRepo.setPermissionsForRole).toHaveBeenCalledWith('r1', ['p1'])
      expect(spy).toHaveBeenCalledWith('u1')
      spy.mockRestore()
    })
  })

  describe('RoleService.assignRoleToUserBySlug', () => {
    it('lanza 404 ROLE_NOT_FOUND si el rol no existe', async () => {
      roleRepo.findBySlug.mockResolvedValue(null)
      await expect(
        roleService.assignRoleToUserBySlug('a@b.com', 'no-existe')
      ).rejects.toMatchObject({ statusCode: 404, code: 'ROLE_NOT_FOUND' })
    })

    it('lanza 404 USER_NOT_FOUND si el usuario no existe', async () => {
      roleRepo.findBySlug.mockResolvedValue({ id: 'r1' })
      userRepo.findByEmail.mockResolvedValue(null)
      await expect(
        roleService.assignRoleToUserBySlug('a@b.com', 'super-admin')
      ).rejects.toMatchObject({ statusCode: 404, code: 'USER_NOT_FOUND' })
    })

    it('asigna el rol e invalida cache', async () => {
      roleRepo.findBySlug.mockResolvedValue({ id: 'r1' })
      userRepo.findByEmail.mockResolvedValue({ id: 'u1' })
      const spy = vi.spyOn(permissionService, 'invalidateCache').mockImplementation(() => undefined)
      await roleService.assignRoleToUserBySlug('a@b.com', 'super-admin')
      expect(userRoleRepo.assignRole).toHaveBeenCalledWith('u1', 'r1')
      expect(spy).toHaveBeenCalledWith('u1')
      spy.mockRestore()
    })
  })

  describe('UserRoleService.setUserRoles', () => {
    it('lanza 403 al asignar super-admin si el actor no es super-admin', async () => {
      roleRepo.findById.mockResolvedValue({ id: 'r1', slug: 'super-admin' })
      permissionRepo.userHasRoleSlug.mockResolvedValue(false) // actor no es super-admin
      await expect(
        userRoleService.setUserRoles('target', ['r1'], 'actor')
      ).rejects.toMatchObject({ statusCode: 403, code: 'SUPER_ADMIN_ASSIGNMENT_FORBIDDEN' })
    })

    it('asigna cuando el actor es super-admin', async () => {
      roleRepo.findById.mockResolvedValue({ id: 'r1', slug: 'super-admin' })
      permissionRepo.userHasRoleSlug.mockResolvedValue(true)
      permissionRepo.getRolesForUser.mockResolvedValue([])
      const spy = vi.spyOn(permissionService, 'invalidateCache').mockImplementation(() => undefined)
      await userRoleService.setUserRoles('target', ['r1'], 'actor')
      expect(userRoleRepo.setRolesForUser).toHaveBeenCalled()
      expect(spy).toHaveBeenCalledWith('target')
      spy.mockRestore()
    })

    it('lanza 400 INVALID_ROLE si algún rol no existe', async () => {
      roleRepo.findById.mockResolvedValue(null)
      await expect(
        userRoleService.setUserRoles('target', ['r-x'], 'actor')
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ROLE' })
    })
  })

  describe('UserRoleService — ocultar/preservar super-admin', () => {
    const superAdminRole = { id: 'sa', name: 'Super Admin', slug: 'super-admin', description: null, isSystem: true }
    const generalAdminRole = { id: 'ga', name: 'General Admin', slug: 'general-admin', description: null, isSystem: true }

    it('listUsersWithRoles(false) filtra super-admin de los roles de cada usuario', async () => {
      // AppDataSource.getRepository(User).find mock devuelve un usuario
      const { AppDataSource } = await import('../../../database/data-source')
      ;(AppDataSource.getRepository as unknown as vi.Mock).mockReturnValue({
        find: vi.fn().mockResolvedValue([{ id: 'u1', email: 'a@b.com', fullName: 'A' }]),
      })
      permissionRepo.getRolesForUser.mockResolvedValue([superAdminRole, generalAdminRole])
      const users = await userRoleService.listUsersWithRoles(false)
      expect(users[0].roles.map((r) => r.slug)).toEqual(['general-admin'])
    })

    it('listUsersWithRoles(true) incluye super-admin', async () => {
      const { AppDataSource } = await import('../../../database/data-source')
      ;(AppDataSource.getRepository as unknown as vi.Mock).mockReturnValue({
        find: vi.fn().mockResolvedValue([{ id: 'u1', email: 'a@b.com', fullName: 'A' }]),
      })
      permissionRepo.getRolesForUser.mockResolvedValue([superAdminRole, generalAdminRole])
      const users = await userRoleService.listUsersWithRoles(true)
      expect(users[0].roles.map((r) => r.slug)).toContain('super-admin')
    })

    it('getUserRoles(userId, false) filtra super-admin', async () => {
      permissionRepo.getRolesForUser.mockResolvedValue([superAdminRole, generalAdminRole])
      const roles = await userRoleService.getUserRoles('u1', false)
      expect(roles.map((r) => r.slug)).toEqual(['general-admin'])
    })

    it('getUserRoles(userId, true) incluye super-admin', async () => {
      permissionRepo.getRolesForUser.mockResolvedValue([superAdminRole, generalAdminRole])
      const roles = await userRoleService.getUserRoles('u1', true)
      expect(roles.map((r) => r.slug)).toContain('super-admin')
    })

    it('setUserRoles preserva super-admin existente cuando el actor NO es super-admin', async () => {
      // target tiene super-admin; actor no es super-admin; envía [] (no ve super-admin)
      permissionRepo.userHasRoleSlug.mockResolvedValue(false) // actor no es super-admin
      userRoleRepo.getRoleIdsForUser.mockResolvedValue(['sa']) // target tiene super-admin
      roleRepo.findById.mockImplementation((id: string) =>
        Promise.resolve(id === 'sa' ? { id: 'sa', slug: 'super-admin' } : null)
      )
      permissionRepo.getRolesForUser.mockResolvedValue([superAdminRole])
      const result = await userRoleService.setUserRoles('target', [], 'actor')
      expect(userRoleRepo.setRolesForUser).toHaveBeenCalledWith('target', ['sa'])
      expect(result.map((r) => r.slug)).not.toContain('super-admin') // filtrado en respuesta
    })

    it('setUserRoles NO preserva super-admin cuando el actor ES super-admin', async () => {
      permissionRepo.userHasRoleSlug.mockResolvedValue(true)
      userRoleRepo.getRoleIdsForUser.mockResolvedValue(['sa'])
      roleRepo.findById.mockResolvedValue(null) // no roles enviados
      permissionRepo.getRolesForUser.mockResolvedValue([])
      await userRoleService.setUserRoles('target', [], 'actor')
      expect(userRoleRepo.setRolesForUser).toHaveBeenCalledWith('target', [])
    })
  })
})