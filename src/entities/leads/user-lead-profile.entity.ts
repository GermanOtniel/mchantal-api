import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm'
import { User } from '../auth/user.entity'

@Entity({ name: 'user_lead_profiles' })
export class UserLeadProfile {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId!: string

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ type: 'jsonb', default: () => "'[]'" })
  segments!: string[]

  @Column({ type: 'boolean', name: 'is_accepting_leads', default: true })
  isAcceptingLeads!: boolean

  @Column({ type: 'int', nullable: true, name: 'max_active_leads' })
  maxActiveLeads!: number | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
