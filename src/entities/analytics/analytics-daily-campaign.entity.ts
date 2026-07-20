import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm'
import { Campaign } from '../leads/campaign.entity'

@Entity({ name: 'analytics_daily_campaign' })
export class AnalyticsDailyCampaign {
  @PrimaryColumn({ type: 'date' })
  date!: string

  @PrimaryColumn({ type: 'uuid', name: 'campaign_id' })
  campaignId!: string

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: Campaign

  @Column({ type: 'int', name: 'captures_count', default: 0 })
  capturesCount!: number

  @Column({ type: 'int', name: 'enrollments_count', default: 0 })
  enrollmentsCount!: number

  @Column({ type: 'int', name: 'conversions_count', default: 0 })
  conversionsCount!: number

  @Column({ type: 'jsonb', name: 'by_origin', default: () => "'{}'" })
  byOrigin!: Record<string, number>

  @CreateDateColumn({ name: 'computed_at', type: 'timestamptz' })
  computedAt!: Date
}
