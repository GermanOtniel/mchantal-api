import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { User } from '../auth/user.entity'
import { WhatsAppContact } from './whatsapp-contact.entity'
import { WhatsAppMessage, type MessageDirection } from './whatsapp-message.entity'

export type ConversationStatus = 'open' | 'closed'

@Entity({ name: 'whatsapp_conversations' })
export class WhatsAppConversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'contact_id' })
  contactId!: string

  @ManyToOne(() => WhatsAppContact, (c) => c.conversations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'contact_id' })
  contact!: WhatsAppContact

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status!: ConversationStatus

  @Column({ type: 'uuid', nullable: true, name: 'lead_id' })
  leadId!: string | null

  @Column({ type: 'uuid', nullable: true, name: 'assignee_user_id' })
  assigneeUserId!: string | null

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assignee_user_id' })
  assignee?: User | null

  @Column({ type: 'timestamptz', nullable: true, name: 'last_message_at' })
  lastMessageAt!: Date | null

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    name: 'last_message_direction',
  })
  lastMessageDirection!: MessageDirection | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @OneToMany(() => WhatsAppMessage, (m) => m.conversation)
  messages!: WhatsAppMessage[]
}
