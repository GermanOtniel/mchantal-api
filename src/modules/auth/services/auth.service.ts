import bcrypt from 'bcryptjs'
import { AppDataSource } from '../../../database/data-source'
import { User } from '../../../entities/auth/user.entity'
import { RefreshToken } from '../../../entities/auth/refresh-token.entity'
import type { AppEnv } from '../../../config/env'
import { HttpError } from '../http-error'
import { UserRepository } from '../repositories/user.repository'
import { RefreshTokenRepository } from '../repositories/refresh-token.repository'
import { TokenService } from './token.service'
import type {
  LoginInput,
  LogoutInput,
  LoginResult,
  RefreshInput,
  RefreshResult,
  RegisterInput,
  RegisterResult,
} from '../types/auth.types'
import {
  buildUserAccessProfile,
  PermissionService,
} from '../../rbac/services/permission.service'
import { toUserPublic, type AuthUser } from '../types/auth.types'
import {
  buildFullName,
  normalizeOptionalName,
  normalizeRequiredName,
} from '../../../utils/full-name'

const BCRYPT_ROUNDS = 10

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function parseRegisterNames(input: RegisterInput) {
  const firstName = normalizeRequiredName(input.firstName)
  const lastName = normalizeRequiredName(input.lastName)
  const middleName = normalizeOptionalName(input.middleName)
  const secondLastName = normalizeOptionalName(input.secondLastName)
  const fullName = buildFullName({
    firstName,
    middleName,
    lastName,
    secondLastName,
  })
  if (!fullName) {
    throw new HttpError('Invalid name fields', 400, 'INVALID_NAME')
  }
  return { firstName, middleName, lastName, secondLastName, fullName }
}

export class AuthService {
  private readonly userRepo = new UserRepository()
  private readonly refreshRepo = new RefreshTokenRepository()
  private readonly permissionService = new PermissionService()

  constructor(
    private readonly env: AppEnv,
    private readonly tokens: TokenService
  ) {}

  private async toAuthUser(user: User): Promise<AuthUser> {
    const access = await buildUserAccessProfile(user.id, this.permissionService)
    return {
      ...toUserPublic(user),
      roles: access.roles.map((r) => ({ id: r.id, name: r.name, slug: r.slug })),
      permissions: access.permissions,
    }
  }

  async register(input: RegisterInput): Promise<RegisterResult> {
    const email = normalizeEmail(input.email)
    const existing = await this.userRepo.findByEmail(email)
    if (existing) {
      throw new HttpError('Email already registered', 409, 'EMAIL_EXISTS')
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)
    const names = parseRegisterNames(input)
    const rawRefresh = this.tokens.generateOpaqueToken()
    const refreshHash = this.tokens.hashOpaqueToken(rawRefresh)
    const expiresAt = this.tokens.refreshExpiresAt()

    const result = await AppDataSource.transaction(async (manager) => {
      const u = manager.getRepository(User).create({
        email,
        passwordHash,
        firstName: names.firstName,
        middleName: names.middleName,
        lastName: names.lastName,
        secondLastName: names.secondLastName,
        fullName: names.fullName,
        emailVerifiedAt: null,
      })
      const saved = await manager.getRepository(User).save(u)
      await manager.getRepository(RefreshToken).save(
        manager.getRepository(RefreshToken).create({
          userId: saved.id,
          tokenHash: refreshHash,
          expiresAt,
          revokedAt: null,
        })
      )
      return saved
    })

    const accessToken = this.tokens.signAccessToken({
      sub: result.id,
      email: result.email,
    })

    return {
      user: await this.toAuthUser(result),
      accessToken,
      refreshToken: rawRefresh,
    }
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const email = normalizeEmail(input.email)
    const user = await this.userRepo.findByEmail(email)
    if (!user) {
      throw new HttpError('Invalid credentials', 401, 'INVALID_CREDENTIALS')
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash)
    if (!ok) {
      throw new HttpError('Invalid credentials', 401, 'INVALID_CREDENTIALS')
    }

    const rawRefresh = this.tokens.generateOpaqueToken()
    const refreshHash = this.tokens.hashOpaqueToken(rawRefresh)
    const expiresAt = this.tokens.refreshExpiresAt()

    await this.refreshRepo.create({
      userId: user.id,
      tokenHash: refreshHash,
      expiresAt,
    })

    const accessToken = this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
    })

    return {
      user: await this.toAuthUser(user),
      accessToken,
      refreshToken: rawRefresh,
    }
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.userRepo.findById(userId)
    if (!user) {
      throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED')
    }
    return this.toAuthUser(user)
  }

  async refresh(input: RefreshInput): Promise<RefreshResult> {
    const hash = this.tokens.hashOpaqueToken(input.refreshToken)
    const row = await this.refreshRepo.findActiveByTokenHash(hash)
    if (!row) {
      throw new HttpError('Invalid or expired refresh token', 401, 'INVALID_REFRESH')
    }

    const user = await this.userRepo.findById(row.userId)
    if (!user) {
      throw new HttpError('Invalid or expired refresh token', 401, 'INVALID_REFRESH')
    }

    const rawRefresh = this.tokens.generateOpaqueToken()
    const newHash = this.tokens.hashOpaqueToken(rawRefresh)
    const expiresAt = this.tokens.refreshExpiresAt()

    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(RefreshToken).update(
        { id: row.id },
        { revokedAt: new Date() }
      )
      await manager.getRepository(RefreshToken).save(
        manager.getRepository(RefreshToken).create({
          userId: user.id,
          tokenHash: newHash,
          expiresAt,
          revokedAt: null,
        })
      )
    })

    const accessToken = this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
    })

    return { accessToken, refreshToken: rawRefresh }
  }

  async logout(input: LogoutInput): Promise<void> {
    const hash = this.tokens.hashOpaqueToken(input.refreshToken)
    await this.refreshRepo.revokeByTokenHash(hash)
  }
}
