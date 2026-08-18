import {
  getCachedPermissions,
  invalidateUserPermissions,
  setCachedPermissions,
} from '../../../shared/rbac/permission-cache'
import { SUPER_ADMIN_ROLE_SLUG } from '../../../shared/rbac/permissions.catalog'
import type { PermissionSummary, RoleSummary } from '../repositories/rbac.repository'
import { PermissionRepository } from '../repositories/rbac.repository'

export class PermissionService {
  private readonly permissionRepo = new PermissionRepository()

  async getPermissionKeysForUser(userId: string): Promise<Set<string>> {
    const cached = getCachedPermissions(userId)
    if (cached) return cached

    const keys = await this.permissionRepo.getKeysForUser(userId)
    const permissions = new Set(keys)
    setCachedPermissions(userId, permissions)
    return permissions
  }

  async getRolesForUser(userId: string): Promise<RoleSummary[]> {
    return this.permissionRepo.getRolesForUser(userId)
  }

  async listAllPermissions(): Promise<PermissionSummary[]> {
    const permissions = await this.permissionRepo.findAll()
    return permissions.map((p) => ({
      id: p.id,
      key: p.key,
      module: p.module,
      description: p.description,
    }))
  }

  async userHasRoleSlug(userId: string, slug: string): Promise<boolean> {
    return this.permissionRepo.userHasRoleSlug(userId, slug)
  }

  invalidateCache(userId: string): void {
    invalidateUserPermissions(userId)
  }

  async canAssignSuperAdminRole(userId: string): Promise<boolean> {
    return this.permissionRepo.userHasRoleSlug(userId, SUPER_ADMIN_ROLE_SLUG)
  }
}

export type UserAccessProfile = {
  roles: RoleSummary[]
  permissions: string[]
}

export async function buildUserAccessProfile(
  userId: string,
  permissionService: PermissionService
): Promise<UserAccessProfile> {
  const [roles, permissionSet] = await Promise.all([
    permissionService.getRolesForUser(userId),
    permissionService.getPermissionKeysForUser(userId),
  ])

  return {
    roles,
    permissions: [...permissionSet].sort(),
  }
}
