import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { WhatsAppConversation } from './whatsapp-conversation.entity'
import { WhatsAppMediaAsset } from './whatsapp-media-asset.entity'

export type MessageDirection = 'inbound' | 'outbound'

export type MessageDeliveryStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'

@Entity({ name: 'whatsapp_messages' })
@Index('IDX_whatsapp_messages_conversation_sent', ['conversationId', 'sentAt'])
export class WhatsAppMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'conversation_id' })
  conversationId!: string

  @ManyToOne(() => WhatsAppConversation, (c) => c.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: WhatsAppConversation

  @Column({ type: 'varchar', length: 20 })
  direction!: MessageDirection

  @Column({
    type: 'varchar',
    length: 255,
    unique: true,
    name: 'provider_message_id',
  })
  providerMessageId!: string

  @Column({ type: 'varchar', length: 30 })
  type!: string

  @Column({ type: 'text', nullable: true, name: 'body_text' })
  bodyText!: string | null

  @Column({ type: 'uuid', nullable: true, name: 'media_asset_id' })
  mediaAssetId!: string | null

  @ManyToOne(() => WhatsAppMediaAsset, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'media_asset_id' })
  mediaAsset!: WhatsAppMediaAsset | null

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: MessageDeliveryStatus

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>

  @Column({ type: 'timestamptz', name: 'sent_at' })
  sentAt!: Date

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
