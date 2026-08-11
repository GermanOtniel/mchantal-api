import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'whatsapp_contacts' })
export class WhatsAppContact {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 20, unique: true, name: 'wa_id' })
  waId!: string

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'profile_name' })
  profileName!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}