import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { CampaignLead } from './campaign-lead.entity'

export type LeadFlowStateStatus = 'active' | 'completed'

@Entity({ name: 'lead_flow_states' })
export class LeadFlowState {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', unique: true, name: 'campaign_lead_id' })
  campaignLeadId!: string

  @OneToOne(() => CampaignLead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_lead_id' })
  campaignLead!: CampaignLead

  @Column({ type: 'varchar', length: 100, name: 'current_node_id' })
  currentNodeId!: string

  @Column({ type: 'jsonb', default: () => "'{}'" })
  context!: Record<string, unknown>

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: LeadFlowStateStatus

  @Column({ type: 'timestamptz', name: 'last_interaction_at', default: () => 'now()' })
  lastInteractionAt!: Date

  @Column({ type: 'timestamptz', nullable: true, name: 'completed_at' })
  completedAt!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}