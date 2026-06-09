import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { WhatsAppConversation } from './whatsapp-conversation.entity'

@Entity({ name: 'whatsapp_contacts' })
export class WhatsAppContact {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 20, unique: true, name: 'wa_id' })
  waId!: string

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'profile_name',
  })
  profileName!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @OneToMany(() => WhatsAppConversation, (c) => c.contact)
  conversations!: WhatsAppConversation[]
}
