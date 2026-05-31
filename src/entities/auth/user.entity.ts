import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { RefreshToken } from './refresh-token.entity'
import { PasswordResetToken } from './password-reset-token.entity'

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash!: string

  @Column({ type: 'varchar', length: 100, name: 'first_name' })
  firstName!: string

  @Column({ type: 'varchar', length: 100, name: 'middle_name', nullable: true })
  middleName!: string | null

  @Column({ type: 'varchar', length: 100, name: 'last_name' })
  lastName!: string

  @Column({
    type: 'varchar',
    length: 100,
    name: 'second_last_name',
    nullable: true,
  })
  secondLastName!: string | null

  @Column({ type: 'varchar', length: 400, name: 'full_name' })
  fullName!: string

  @Column({ type: 'timestamptz', nullable: true, name: 'email_verified_at' })
  emailVerifiedAt!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date

  @OneToMany(() => RefreshToken, (t) => t.user)
  refreshTokens!: RefreshToken[]

  @OneToMany(() => PasswordResetToken, (t) => t.user)
  passwordResetTokens!: PasswordResetToken[]
}
