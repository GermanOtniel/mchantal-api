import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import { User } from '../auth/user.entity'
import { Role } from './role.entity'

@Entity({ name: 'user_roles' })
export class UserRole {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string

  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId!: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User

  @ManyToOne(() => Role, (role) => role.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: Role
}
