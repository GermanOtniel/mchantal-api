import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm'

@Entity({ name: 'analytics_daily_global' })
export class AnalyticsDailyGlobal {
  @PrimaryColumn({ type: 'date' })
  date!: string

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
