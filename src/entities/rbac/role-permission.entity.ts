import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import { Permission } from './permission.entity'
import { Role } from './role.entity'

@Entity({ name: 'role_permissions' })
export class RolePermission {
  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId!: string

  @PrimaryColumn({ name: 'permission_id', type: 'uuid' })
  permissionId!: string

  @ManyToOne(() => Role, (role) => role.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: Role

  @ManyToOne(() => Permission, (permission) => permission.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'permission_id' })
  permission!: Permission
}
