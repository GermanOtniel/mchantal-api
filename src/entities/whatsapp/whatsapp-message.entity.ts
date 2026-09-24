import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { WhatsAppConversation } from './whatsapp-conversation.entity'

export type MessageDirection = 'inbound' | 'outbound'
export type MessageDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

@Entity({ name: 'whatsapp_messages' })
export class WhatsAppMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'conversation_id' })
  conversationId!: string

  @ManyToOne(() => WhatsAppConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: WhatsAppConversation

  @Column({ type: 'varchar', length: 20 })
  direction!: MessageDirection

  @Column({ type: 'varchar', length: 255, unique: true, name: 'provider_message_id' })
  providerMessageId!: string

  @Column({ type: 'varchar', length: 30 })
  type!: string

  @Column({ type: 'text', nullable: true, name: 'body_text' })
  bodyText!: string | null

  @Column({ type: 'varchar', length: 30, default: 'pending' })
  status!: MessageDeliveryStatus | string

  @Column({ type: 'timestamptz', name: 'sent_at' })
  sentAt!: Date

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>

  @Column({ type: 'varchar', length: 500, name: 'media_url', nullable: true })
  mediaUrl!: string | null

  @Column({ type: 'varchar', length: 30, name: 'media_type', nullable: true })
  mediaType!: string | null

  @Column({ type: 'text', name: 'media_caption', nullable: true })
  mediaCaption!: string | null

  @Column({ type: 'varchar', length: 255, name: 'media_file_name', nullable: true })
  mediaFileName!: string | null

  @Column({ type: 'uuid', name: 'campaign_document_id', nullable: true })
  campaignDocumentId!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}