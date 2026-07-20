import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm'
import { User } from '../auth/user.entity'
import { Campaign } from './campaign.entity'

@Entity({ name: 'campaign_executives' })
export class CampaignExecutive {
  @PrimaryColumn({ type: 'uuid', name: 'campaign_id' })
  campaignId!: string

  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId!: string

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: Campaign

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ type: 'boolean', default: true })
  enabled!: boolean

  @Column({ type: 'int', default: 0 })
  priority!: number
}
