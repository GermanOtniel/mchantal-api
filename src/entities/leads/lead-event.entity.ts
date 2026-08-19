import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { CampaignLead } from './campaign-lead.entity'

export type LeadEventType =
  | 'status_change'
  | 'reassignment'
  | 'needs_reply_cleared'
  | 'enrolled'
  | 'message_milestone'

@Entity({ name: 'lead_events' })
export class LeadEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'lead_id' })
  leadId!: string

  @ManyToOne(() => CampaignLead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead!: CampaignLead

  @Column({ type: 'varchar', length: 40 })
  type!: LeadEventType

  @Column({ type: 'varchar', length: 60, name: 'from_value', nullable: true })
  fromValue!: string | null

  @Column({ type: 'varchar', length: 60, name: 'to_value', nullable: true })
  toValue!: string | null

  @Column({ type: 'text', nullable: true })
  reason!: string | null

  @Column({ type: 'varchar', length: 40, name: 'milestone_kind', nullable: true })
  milestoneKind!: string | null

  @Column({ type: 'uuid', name: 'actor_user_id', nullable: true })
  actorUserId!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}