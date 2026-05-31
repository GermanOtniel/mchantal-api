import { IsNull, MoreThan } from 'typeorm'
import { AppDataSource } from '../../../database/data-source'
import { PasswordResetToken } from '../../../entities/auth/password-reset-token.entity'

export class PasswordResetTokenRepository {
  private get repo() {
    return AppDataSource.getRepository(PasswordResetToken)
  }

  async deletePendingForUser(userId: string): Promise<void> {
    await this.repo.delete({ userId, usedAt: IsNull() })
  }

  async create(data: {
    userId: string
    tokenHash: string
    expiresAt: Date
  }): Promise<PasswordResetToken> {
    const row = this.repo.create({
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      usedAt: null,
    })
    return this.repo.save(row)
  }

  async findValidByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.repo.findOne({
      where: {
        tokenHash,
        usedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    })
  }

  async markUsed(id: string): Promise<void> {
    await this.repo.update({ id }, { usedAt: new Date() })
  }
}
