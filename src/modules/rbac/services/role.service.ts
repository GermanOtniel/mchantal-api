import { AppDataSource } from '../../../database/data-source'
import { User } from '../../../entities/auth/user.entity'
import { HttpError } from '../../auth/http-error'
import { UserRepository } from '../../auth/repositories/user.repository'
import { SUPER_ADMIN_ROLE_SLUG } from '../../../shared/rbac/permissions.catalog'
import {
  PermissionRepository,
  RoleRepository,
  UserRoleRepository,
} from '../repositories/rbac.repository'
import { PermissionService } from './permission.service'

export type RoleWithPermissions = {
  id: string
  name: string
  slug: string
  description: string | null
  isSystem: boolean
  permissions: {
    id: string
    key: string
    module: string
    description: string
  }[]
}

export type RoleSummary = {
  id: string
  name: string
  slug: string
  description: string | null
  isSystem: boolean
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export class RoleService {
  private readonly roleRepo = new RoleRepository()
  private readonly permissionRepo = new PermissionRepository()
  private readonly userRoleRepo = new UserRoleRepository()

  constructor(private readonly permissionService: PermissionService) {}

  async listRoles(): Promise<RoleWithPermissions[]> {
    const roles = await this.roleRepo.findAll()
    return Promise.all(
      roles.map(async (role) => ({
        id: role.id,
        name: role.name,
        slug: role.slug,
        description: role.description,
        isSystem: role.isSystem,
        permissions: await this.roleRepo.getPermissionsForRole(role.id),
      }))
    )
  }

  async getRoleById(id: string): Promise<RoleWithPermissions> {
    const role = await this.roleRepo.findById(id)
    if (!role) {
      throw new HttpError('Role not found', 404, 'ROLE_NOT_FOUND')
    }

    return {
      id: role.id,
      name: role.name,
      slug: role.slug,
      description: role.description,
      isSystem: role.isSystem,
      permissions: await this.roleRepo.getPermissionsForRole(role.id),
    }
  }

  async createRole(input: {
    name: string
    slug?: string
    description?: string | null
    permissionKeys: string[]
  }): Promise<RoleWithPermissions> {
    const slug = input.slug?.trim() || slugify(input.name)
    if (!slug) {
      throw new HttpError('Invalid role slug', 400, 'INVALID_ROLE_SLUG')
    }

    const existing = await this.roleRepo.findBySlug(slug)
    if (existing) {
      throw new HttpError('Role slug already exists', 409, 'ROLE_SLUG_EXISTS')
    }

    const permissions = await this.permissionRepo.findByKeys(input.permissionKeys)
    if (permissions.length !== input.permissionKeys.length) {
      throw new HttpError('One or more permissions are invalid', 400, 'INVALID_PERMISSION')
    }

    const role = await this.roleRepo.create({
      name: input.name.trim(),
      slug,
      description: input.description?.trim() ?? null,
    })

    await this.roleRepo.setPermissionsForRole(
      role.id,
      permissions.map((p) => p.id)
    )

    return this.getRoleById(role.id)
  }

  async updateRole(
    id: string,
    input: { name?: string; description?: string | null }
  ): Promise<RoleWithPermissions> {
    const role = await this.roleRepo.findById(id)
    if (!role) {
      throw new HttpError('Role not found', 404, 'ROLE_NOT_FOUND')
    }

    await this.roleRepo.update(id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() ?? null }
        : {}),
    })

    return this.getRoleById(id)
  }

  async deleteRole(id: string): Promise<void> {
    const role = await this.roleRepo.findById(id)
    if (!role) {
      throw new HttpError('Role not found', 404, 'ROLE_NOT_FOUND')
    }
    if (role.isSystem) {
      throw new HttpError('System roles cannot be deleted', 403, 'SYSTEM_ROLE_PROTECTED')
    }

    const userIds = await this.userRoleRepo.getUserIdsWithRole(id)
    await this.roleRepo.delete(id)
    for (const userId of userIds) {
      this.permissionService.invalidateCache(userId)
    }
  }

  async setRolePermissions(
    roleId: string,
    permissionKeys: string[]
  ): Promise<RoleWithPermissions> {
    const role = await this.roleRepo.findById(roleId)
    if (!role) {
      throw new HttpError('Role not found', 404, 'ROLE_NOT_FOUND')
    }

    const permissions = await this.permissionRepo.findByKeys(permissionKeys)
    if (permissions.length !== permissionKeys.length) {
      throw new HttpError('One or more permissions are invalid', 400, 'INVALID_PERMISSION')
    }

    await this.roleRepo.setPermissionsForRole(
      roleId,
      permissions.map((p) => p.id)
    )

    const userIds = await this.userRoleRepo.getUserIdsWithRole(roleId)
    for (const userId of userIds) {
      this.permissionService.invalidateCache(userId)
    }

    return this.getRoleById(roleId)
  }

  async assignRoleToUserBySlug(userEmail: string, roleSlug: string): Promise<void> {
    const role = await this.roleRepo.findBySlug(roleSlug)
    if (!role) {
      throw new HttpError('Role not found', 404, 'ROLE_NOT_FOUND')
    }

    const userRepo = new UserRepository()
    const user = await userRepo.findByEmail(userEmail.trim().toLowerCase())
    if (!user) {
      throw new HttpError('User not found', 404, 'USER_NOT_FOUND')
    }

    await this.userRoleRepo.assignRole(user.id, role.id)
    this.permissionService.invalidateCache(user.id)
  }
}

export class UserRoleService {
  private readonly userRoleRepo = new UserRoleRepository()
  private readonly roleRepo = new RoleRepository()
  private readonly permissionRepo = new PermissionRepository()

  constructor(private readonly permissionService: PermissionService) {}

  async listUsersWithRoles(): Promise<
    {
      id: string
      email: string
      fullName: string
      roles: { id: string; name: string; slug: string }[]
    }[]
  > {
    const users = await AppDataSource.getRepository(User).find({
      order: { fullName: 'ASC' },
    })

    return Promise.all(
      users.map(async (user) => {
        const roles = await this.permissionRepo.getRolesForUser(user.id)
        return {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roles: roles.map((r) => ({ id: r.id, name: r.name, slug: r.slug })),
        }
      })
    )
  }

  async getUserRoles(userId: string): Promise<RoleSummary[]> {
    const roles = await this.permissionRepo.getRolesForUser(userId)
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      isSystem: r.isSystem,
    }))
  }

  async setUserRoles(
    targetUserId: string,
    roleIds: string[],
    actorUserId: string
  ): Promise<{ id: string; name: string; slug: string }[]> {
    const roles = await Promise.all(roleIds.map((id) => this.roleRepo.findById(id)))
    if (roles.some((r) => !r)) {
      throw new HttpError('One or more roles are invalid', 400, 'INVALID_ROLE')
    }

    const assigningSuperAdmin = roles.some((r) => r?.slug === SUPER_ADMIN_ROLE_SLUG)
    if (assigningSuperAdmin) {
      const actorIsSuperAdmin = await this.permissionRepo.userHasRoleSlug(
        actorUserId,
        SUPER_ADMIN_ROLE_SLUG
      )
      if (!actorIsSuperAdmin) {
        throw new HttpError(
          'Only Super Admin can assign Super Admin role',
          403,
          'SUPER_ADMIN_ASSIGNMENT_FORBIDDEN'
        )
      }
    }

    await this.userRoleRepo.setRolesForUser(targetUserId, roleIds)
    this.permissionService.invalidateCache(targetUserId)

    const updatedRoles = await this.permissionRepo.getRolesForUser(targetUserId)
    return updatedRoles.map((r) => ({ id: r.id, name: r.name, slug: r.slug }))
  }
}
