import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { Campaign } from './campaign.entity'

@Entity({ name: 'assignment_rule_sets' })
export class AssignmentRuleSet {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'campaign_id' })
  campaignId!: string

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: Campaign

  @Column({ type: 'varchar', length: 80 })
  key!: string

  @Column({ type: 'int', default: 1 })
  version!: number

  @Column({ type: 'timestamptz', name: 'effective_from', default: () => 'now()' })
  effectiveFrom!: Date

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean

  @Column({ type: 'jsonb', default: () => "'[]'" })
  rules!: unknown[]

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
