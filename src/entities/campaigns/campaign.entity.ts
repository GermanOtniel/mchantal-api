import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity({ name: 'campaigns' })
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 120, unique: true })
  slug!: string

  @Column({ type: 'varchar', length: 200 })
  name!: string

  @Column({ type: 'text', name: 'entry_message' })
  entryMessage!: string

  @Column({ type: 'jsonb', name: 'flow_definition', default: () => "'{}'" })
  flowDefinition!: Record<string, unknown>

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  origins!: string[]

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}