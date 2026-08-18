import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { RolePermission } from './role-permission.entity'
import { UserRole } from './user-role.entity'

@Entity({ name: 'roles' })
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 100 })
  name!: string

  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null

  @Column({ type: 'boolean', name: 'is_system', default: false })
  isSystem!: boolean

  @OneToMany(() => RolePermission, (rp) => rp.role)
  rolePermissions!: RolePermission[]

  @OneToMany(() => UserRole, (ur) => ur.role)
  userRoles!: UserRole[]

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
