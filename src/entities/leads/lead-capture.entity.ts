import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { Campaign } from '../campaigns/campaign.entity'

export type LeadCaptureStatus = 'pending' | 'matched' | 'expired'

@Entity({ name: 'lead_captures' })
export class LeadCapture {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 12, unique: true })
  folio!: string

  @Column({ type: 'uuid', name: 'campaign_id' })
  campaignId!: string

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: Campaign

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: LeadCaptureStatus

  @Column({ type: 'uuid', nullable: true, name: 'campaign_lead_id' })
  campaignLeadId!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}