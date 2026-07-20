import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { LeadCapture } from './lead-capture.entity'

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'archived'

@Entity({ name: 'campaigns' })
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 120, unique: true })
  slug!: string

  @Column({ type: 'varchar', length: 200 })
  name!: string

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status!: CampaignStatus

  @Column({ type: 'jsonb', name: 'param_definitions', default: () => "'[]'" })
  paramDefinitions!: unknown[]

  @Column({ type: 'jsonb', name: 'entry_rules', default: () => "'[]'" })
  entryRules!: unknown[]

  @Column({ type: 'jsonb', name: 'flow_definition', default: () => "'{}'" })
  flowDefinition!: Record<string, unknown>

  @Column({ type: 'jsonb', name: 'status_definitions', default: () => "'[]'" })
  statusDefinitions!: unknown[]

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @OneToMany(() => LeadCapture, (capture) => capture.campaign)
  captures!: LeadCapture[]
}
