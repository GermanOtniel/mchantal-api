import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { RolePermission } from './role-permission.entity'

@Entity({ name: 'permissions' })
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 100, unique: true })
  key!: string

  @Column({ type: 'varchar', length: 50 })
  module!: string

  @Column({ type: 'varchar', length: 255 })
  description!: string

  @OneToMany(() => RolePermission, (rp) => rp.permission)
  rolePermissions!: RolePermission[]

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
