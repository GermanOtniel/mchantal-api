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
import { WhatsAppContact } from './whatsapp-contact.entity'
import { WhatsAppMessage } from './whatsapp-message.entity'

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

  @Column({ type: 'timestamptz', nullable: true, name: 'last_message_at' })
  lastMessageAt!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @OneToMany(() => WhatsAppMessage, (m) => m.conversation)
  messages!: WhatsAppMessage[]
}
