import { AppDataSource } from '../../../database/data-source'
import { Permission } from '../../../entities/rbac/permission.entity'
import { Role } from '../../../entities/rbac/role.entity'
import { RolePermission } from '../../../entities/rbac/role-permission.entity'
import { UserRole } from '../../../entities/rbac/user-role.entity'

export type RoleSummary = {
  id: string
  name: string
  slug: string
  description: string | null
  isSystem: boolean
}

export type PermissionSummary = {
  id: string
  key: string
  module: string
  description: string
}

export class PermissionRepository {
  private get permissionRepo() {
    return AppDataSource.getRepository(Permission)
  }

  async findAll(): Promise<Permission[]> {
    return this.permissionRepo.find({ order: { module: 'ASC', key: 'ASC' } })
  }

  async findByKeys(keys: string[]): Promise<Permission[]> {
    if (keys.length === 0) return []
    return this.permissionRepo
      .createQueryBuilder('p')
      .where('p.key IN (:...keys)', { keys })
      .getMany()
  }

  async getKeysForUser(userId: string): Promise<string[]> {
    const rows = await AppDataSource.getRepository(UserRole)
      .createQueryBuilder('ur')
      .innerJoin(RolePermission, 'rp', 'rp.role_id = ur.role_id')
      .innerJoin(Permission, 'p', 'p.id = rp.permission_id')
      .where('ur.user_id = :userId', { userId })
      .select('DISTINCT p.key', 'key')
      .getRawMany<{ key: string }>()

    return rows.map((row) => row.key)
  }

  async getRolesForUser(userId: string): Promise<RoleSummary[]> {
    const roles = await AppDataSource.getRepository(UserRole)
      .createQueryBuilder('ur')
      .innerJoinAndSelect('ur.role', 'role')
      .where('ur.user_id = :userId', { userId })
      .getMany()

    return roles.map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
      slug: ur.role.slug,
      description: ur.role.description,
      isSystem: ur.role.isSystem,
    }))
  }

  async userHasRoleSlug(userId: string, slug: string): Promise<boolean> {
    const count = await AppDataSource.getRepository(UserRole)
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'role')
      .where('ur.user_id = :userId', { userId })
      .andWhere('role.slug = :slug', { slug })
      .getCount()

    return count > 0
  }
}

export class RoleRepository {
  private get roleRepo() {
    return AppDataSource.getRepository(Role)
  }

  async findAll(): Promise<Role[]> {
    return this.roleRepo.find({ order: { name: 'ASC' } })
  }

  async findById(id: string): Promise<Role | null> {
    return this.roleRepo.findOne({ where: { id } })
  }

  async findBySlug(slug: string): Promise<Role | null> {
    return this.roleRepo.findOne({ where: { slug } })
  }

  async create(data: {
    name: string
    slug: string
    description?: string | null
    isSystem?: boolean
  }): Promise<Role> {
    const role = this.roleRepo.create({
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      isSystem: data.isSystem ?? false,
    })
    return this.roleRepo.save(role)
  }

  async update(
    id: string,
    data: Partial<Pick<Role, 'name' | 'description'>>
  ): Promise<Role | null> {
    await this.roleRepo.update({ id }, data)
    return this.findById(id)
  }

  async delete(id: string): Promise<void> {
    await this.roleRepo.delete({ id })
  }

  async getPermissionIdsForRole(roleId: string): Promise<string[]> {
    const rows = await AppDataSource.getRepository(RolePermission).find({
      where: { roleId },
    })
    return rows.map((row) => row.permissionId)
  }

  async getPermissionsForRole(roleId: string): Promise<PermissionSummary[]> {
    const rows = await AppDataSource.getRepository(RolePermission)
      .createQueryBuilder('rp')
      .innerJoinAndSelect('rp.permission', 'p')
      .where('rp.role_id = :roleId', { roleId })
      .orderBy('p.module', 'ASC')
      .addOrderBy('p.key', 'ASC')
      .getMany()

    return rows.map((row) => ({
      id: row.permission.id,
      key: row.permission.key,
      module: row.permission.module,
      description: row.permission.description,
    }))
  }

  async setPermissionsForRole(roleId: string, permissionIds: string[]): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(RolePermission).delete({ roleId })
      if (permissionIds.length === 0) return
      await manager.getRepository(RolePermission).save(
        permissionIds.map((permissionId) =>
          manager.getRepository(RolePermission).create({ roleId, permissionId })
        )
      )
    })
  }
}

export class UserRoleRepository {
  private get userRoleRepo() {
    return AppDataSource.getRepository(UserRole)
  }

  async getRoleIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.userRoleRepo.find({ where: { userId } })
    return rows.map((row) => row.roleId)
  }

  async setRolesForUser(userId: string, roleIds: string[]): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(UserRole).delete({ userId })
      if (roleIds.length === 0) return
      await manager.getRepository(UserRole).save(
        roleIds.map((roleId) =>
          manager.getRepository(UserRole).create({ userId, roleId })
        )
      )
    })
  }

  async assignRole(userId: string, roleId: string): Promise<void> {
    await this.userRoleRepo
      .createQueryBuilder()
      .insert()
      .into(UserRole)
      .values({ userId, roleId })
      .orIgnore()
      .execute()
  }

  async getUserIdsWithRole(roleId: string): Promise<string[]> {
    const rows = await this.userRoleRepo.find({ where: { roleId } })
    return rows.map((row) => row.userId)
  }
}
