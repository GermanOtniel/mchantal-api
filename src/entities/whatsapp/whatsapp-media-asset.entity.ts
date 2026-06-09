import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm'

export type MediaDownloadStatus = 'pending' | 'ready' | 'failed'

@Entity({ name: 'whatsapp_media_assets' })
export class WhatsAppMediaAsset {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255, name: 'provider_media_id' })
  providerMediaId!: string

  @Column({ type: 'varchar', length: 127, nullable: true, name: 'mime_type' })
  mimeType!: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  sha256!: string | null

  @Column({ type: 'bigint', nullable: true, name: 'size_bytes' })
  sizeBytes!: string | null

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'original_filename',
  })
  originalFilename!: string | null

  @Column({ type: 'varchar', length: 512, nullable: true, name: 'storage_key' })
  storageKey!: string | null

  @Column({
    type: 'varchar',
    length: 20,
    name: 'download_status',
    default: 'pending',
  })
  downloadStatus!: MediaDownloadStatus

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
