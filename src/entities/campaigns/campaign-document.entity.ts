import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { Campaign } from './campaign.entity'

@Entity({ name: 'campaign_documents' })
export class CampaignDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'campaign_id' })
  campaignId!: string

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: Campaign

  @Column({ type: 'varchar', length: 200, name: 'display_name' })
  displayName!: string

  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  fileName!: string

  @Column({ type: 'varchar', length: 100, name: 'mime_type' })
  mimeType!: string

  @Column({ type: 'integer', name: 'file_size' })
  fileSize!: number

  @Column({ type: 'varchar', length: 300, name: 'cloudinary_public_id' })
  cloudinaryPublicId!: string

  @Column({ type: 'varchar', length: 500, name: 'cloudinary_url' })
  cloudinaryUrl!: string

  @Column({ type: 'varchar', length: 200, name: 'meta_media_id', nullable: true })
  metaMediaId!: string | null

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null

  @Column({ type: 'uuid', name: 'uploaded_by', nullable: true })
  uploadedBy!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}