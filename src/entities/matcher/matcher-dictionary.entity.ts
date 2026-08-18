import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity({ name: 'matcher_dictionaries' })
export class MatcherDictionary {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 120, unique: true })
  slug!: string

  @Column({ type: 'varchar', length: 200 })
  name!: string

  @Column({ type: 'jsonb', default: () => "'[]'" })
  categories!: { id: string; label: string; aliases: string[] }[]

  @Column({ type: 'boolean', name: 'is_system', default: false })
  isSystem!: boolean

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}