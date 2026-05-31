import { createHash, randomBytes } from 'crypto'
import jwt, { type SignOptions } from 'jsonwebtoken'
import type { AppEnv } from '../../../config/env'

export class TokenService {
  constructor(private readonly env: AppEnv) {}

  /** Token opaco en claro para enviar al cliente (refresh / reset) */
  generateOpaqueToken(): string {
    return randomBytes(32).toString('hex')
  }

  hashOpaqueToken(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex')
  }

  signAccessToken(payload: { sub: string; email: string }): string {
    return jwt.sign(
      { sub: payload.sub, email: payload.email },
      this.env.jwtSecret,
      { expiresIn: this.env.jwtAccessExpiresIn } as SignOptions
    )
  }

  refreshExpiresAt(): Date {
    const d = new Date()
    d.setDate(d.getDate() + this.env.refreshTokenDays)
    return d
  }

  passwordResetExpiresAt(): Date {
    const d = new Date()
    d.setMinutes(d.getMinutes() + this.env.passwordResetTokenMinutes)
    return d
  }
}
