import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { Campaign } from './campaign.entity'

export type LeadCaptureStatus = 'pending' | 'matched' | 'expired'

@Entity({ name: 'lead_captures' })
export class LeadCapture {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 12, unique: true })
  folio!: string

  @Column({ type: 'uuid', name: 'campaign_id' })
  campaignId!: string

  @ManyToOne(() => Campaign, (campaign) => campaign.captures, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: Campaign

  @Column({ type: 'jsonb', name: 'captured_params', default: () => "'{}'" })
  capturedParams!: Record<string, string>

  @Column({ type: 'varchar', length: 120, nullable: true, name: 'resolved_intent' })
  resolvedIntent!: string | null

  @Column({ type: 'text', name: 'resolved_message' })
  resolvedMessage!: string

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'entry_node_id' })
  entryNodeId!: string | null

  @Column({ type: 'jsonb', name: 'initial_context', default: () => "'{}'" })
  initialContext!: Record<string, string>

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: LeadCaptureStatus

  @Column({ type: 'uuid', nullable: true, name: 'campaign_lead_id' })
  campaignLeadId!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
