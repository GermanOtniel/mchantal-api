import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { Campaign } from '../campaigns/campaign.entity'
import { User } from '../auth/user.entity'
import { WhatsAppContact } from '../whatsapp/whatsapp-contact.entity'

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

  @Column({ type: 'jsonb', default: () => "'{}'" })
  context!: Record<string, unknown>

  @Column({ type: 'varchar', length: 20, name: 'assignment_mode', nullable: true })
  assignmentMode!: 'executive' | 'pool' | 'manual' | null

  @Column({ type: 'uuid', name: 'assigned_executive_id', nullable: true })
  assignedExecutiveId!: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_executive_id' })
  assignedExecutive!: User | null

  @Column({ type: 'timestamptz', name: 'assigned_at', nullable: true })
  assignedAt!: Date | null

  @Column({ type: 'timestamptz', name: 'enrolled_at', default: () => 'now()' })
  enrolledAt!: Date

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}