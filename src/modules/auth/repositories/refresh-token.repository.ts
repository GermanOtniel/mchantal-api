import { IsNull } from 'typeorm'
import { AppDataSource } from '../../../database/data-source'
import { RefreshToken } from '../../../entities/auth/refresh-token.entity'

export class RefreshTokenRepository {
  private get repo() {
    return AppDataSource.getRepository(RefreshToken)
  }

  async create(data: {
    userId: string
    tokenHash: string
    expiresAt: Date
  }): Promise<RefreshToken> {
    const row = this.repo.create({
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      revokedAt: null,
    })
    return this.repo.save(row)
  }

  async findActiveByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.repo.findOne({
      where: { tokenHash, revokedAt: IsNull() },
    })
    if (!row) return null
    if (row.expiresAt.getTime() <= Date.now()) return null
    return row
  }

  async revokeById(id: string): Promise<void> {
    await this.repo.update({ id }, { revokedAt: new Date() })
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.repo.update({ tokenHash }, { revokedAt: new Date() })
  }
}
