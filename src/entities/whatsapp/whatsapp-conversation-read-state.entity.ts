import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm'
import { User } from '../auth/user.entity'
import { WhatsAppConversation } from './whatsapp-conversation.entity'

@Entity({ name: 'whatsapp_conversation_read_states' })
@Unique('UQ_whatsapp_conversation_read_states_pair', [
  'conversationId',
  'userId',
])
export class WhatsAppConversationReadState {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'conversation_id' })
  conversationId!: string

  @ManyToOne(() => WhatsAppConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: WhatsAppConversation

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ type: 'timestamptz', name: 'last_read_at' })
  lastReadAt!: Date
}
