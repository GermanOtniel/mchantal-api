import bcrypt from 'bcryptjs'
import type { AppEnv } from '../../../config/env'
import { AppDataSource } from '../../../database/data-source'
import { PasswordResetToken } from '../../../entities/auth/password-reset-token.entity'
import { User } from '../../../entities/auth/user.entity'
import type { Mailer } from '../../../shared/email/mailer.interface'
import { HttpError } from '../http-error'
import { PasswordResetTokenRepository } from '../repositories/password-reset-token.repository'
import { UserRepository } from '../repositories/user.repository'
import { TokenService } from './token.service'
import type { ForgotPasswordInput, ResetPasswordInput } from '../types/auth.types'

const BCRYPT_ROUNDS = 10

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function buildResetLink(baseUrl: string, rawToken: string): string {
  const sep = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${sep}token=${encodeURIComponent(rawToken)}`
}

export class PasswordResetService {
  private readonly userRepo = new UserRepository()
  private readonly resetRepo = new PasswordResetTokenRepository()

  constructor(
    private readonly env: AppEnv,
    private readonly tokens: TokenService,
    private readonly mailer: Mailer
  ) {}

  async requestReset(input: ForgotPasswordInput): Promise<void> {
    const email = normalizeEmail(input.email)
    const user = await this.userRepo.findByEmail(email)
    if (!user) return

    const raw = this.tokens.generateOpaqueToken()
    const tokenHash = this.tokens.hashOpaqueToken(raw)
    const expiresAt = this.tokens.passwordResetExpiresAt()

    await AppDataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .delete()
        .from(PasswordResetToken)
        .where('user_id = :userId', { userId: user.id })
        .andWhere('used_at IS NULL')
        .execute()

      await manager.getRepository(PasswordResetToken).save(
        manager.getRepository(PasswordResetToken).create({
          userId: user.id,
          tokenHash,
          expiresAt,
          usedAt: null,
        })
      )
    })

    const link = buildResetLink(this.env.frontendPasswordResetUrl, raw)
    const subject = 'Restablecer contraseña'
    const text = `Usá este enlace para restablecer tu contraseña (caduca en breve): ${link}`
    const html = `<p>Restablecé tu contraseña con este enlace:</p><p><a href="${link}">${link}</a></p>`

    await this.mailer.sendPasswordResetEmail(user.email, subject, text, html)
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const hash = this.tokens.hashOpaqueToken(input.token)
    const row = await this.resetRepo.findValidByTokenHash(hash)
    if (!row) {
      throw new HttpError('Invalid or expired token', 400, 'INVALID_RESET_TOKEN')
    }

    const newHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS)

    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(User).update({ id: row.userId }, { passwordHash: newHash })
      await manager
        .getRepository(PasswordResetToken)
        .update({ id: row.id }, { usedAt: new Date() })
    })
  }
}
