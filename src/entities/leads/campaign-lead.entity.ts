import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { User } from '../auth/user.entity'
import { WhatsAppContact } from '../whatsapp/whatsapp-contact.entity'
import { Campaign } from './campaign.entity'
import { LeadCapture } from './lead-capture.entity'

@Entity({ name: 'campaign_leads' })
export class CampaignLead {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'contact_id' })
  contactId!: string

  @ManyToOne(() => WhatsAppContact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact!: WhatsAppContact

  @Column({ type: 'uuid', name: 'campaign_id' })
  campaignId!: string

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: Campaign

  @Column({ type: 'uuid', nullable: true, name: 'lead_capture_id' })
  leadCaptureId!: string | null

  @ManyToOne(() => LeadCapture, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lead_capture_id' })
  leadCapture!: LeadCapture | null

  @Column({ type: 'varchar', length: 80, name: 'status_key', default: 'nuevo' })
  statusKey!: string

  @Column({ type: 'varchar', length: 120, nullable: true, name: 'resolved_intent' })
  resolvedIntent!: string | null

  @Column({ type: 'jsonb', default: () => "'{}'" })
  context!: Record<string, unknown>

  @Column({ type: 'uuid', nullable: true, name: 'assignee_user_id' })
  assigneeUserId!: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignee_user_id' })
  assignee!: User | null

  @Column({ type: 'boolean', name: 'is_successful', default: false })
  isSuccessful!: boolean

  @Column({ type: 'timestamptz', nullable: true, name: 'success_at' })
  successAt!: Date | null

  @Column({ type: 'timestamptz', nullable: true, name: 'assigned_at' })
  assignedAt!: Date | null

  @Column({ type: 'timestamptz', name: 'enrolled_at', default: () => 'now()' })
  enrolledAt!: Date

  @Column({ type: 'timestamptz', nullable: true, name: 'closed_at' })
  closedAt!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @OneToOne('LeadFlowState', 'campaignLead')
  flowState?: unknown
}
