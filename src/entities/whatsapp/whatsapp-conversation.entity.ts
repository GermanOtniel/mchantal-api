import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { WhatsAppContact } from './whatsapp-contact.entity'

export type ConversationStatus = 'open' | 'closed'
export type MessageDirection = 'inbound' | 'outbound'

@Entity({ name: 'whatsapp_conversations' })
export class WhatsAppConversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'contact_id' })
  contactId!: string

  @ManyToOne(() => WhatsAppContact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact!: WhatsAppContact

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status!: ConversationStatus

  @Column({ type: 'uuid', nullable: true, name: 'lead_id' })
  leadId!: string | null

  @Column({ type: 'timestamptz', nullable: true, name: 'last_message_at' })
  lastMessageAt!: Date | null

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'last_message_direction' })
  lastMessageDirection!: MessageDirection | null

  @Column({ type: 'timestamptz', nullable: true, name: 'needs_reply_cleared_at' })
  needsReplyClearedAt!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}