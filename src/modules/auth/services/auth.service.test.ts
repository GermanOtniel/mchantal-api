import { beforeEach, describe, expect, it, vi } from 'vitest'

const userRepo = {
  findByEmail: vi.fn(),
  findById: vi.fn(),
}
const refreshRepo = {
  create: vi.fn(),
  findActiveByTokenHash: vi.fn(),
  revokeByTokenHash: vi.fn(),
}
const tokens = {
  generateOpaqueToken: vi.fn().mockReturnValue('raw-refresh'),
  hashOpaqueToken: vi.fn().mockReturnValue('hash'),
  signAccessToken: vi.fn().mockReturnValue('access-token'),
  refreshExpiresAt: vi.fn().mockReturnValue(new Date()),
  passwordResetExpiresAt: vi.fn(),
}

const accessProfile = {
  roles: [{ id: 'r1', name: 'General Admin', slug: 'general-admin', description: null, isSystem: true }],
  permissions: ['leads.read', 'roles.manage'],
}

vi.mock('../repositories/user.repository', () => ({
  UserRepository: vi.fn(function () {
    return userRepo
  }),
}))
vi.mock('../repositories/refresh-token.repository', () => ({
  RefreshTokenRepository: vi.fn(function () {
    return refreshRepo
  }),
}))
vi.mock('../../rbac/services/permission.service', () => ({
  PermissionService: vi.fn(function () {
    return {}
  }),
  buildUserAccessProfile: vi.fn(async () => accessProfile),
}))
vi.mock('../../../database/data-source', () => ({
  AppDataSource: {
    transaction: vi.fn(async (cb: (m: unknown) => Promise<unknown>) =>
      cb({
        getRepository: () => ({
          create: (d: unknown) => d,
          save: async (d: unknown) => d,
          update: vi.fn(),
        }),
      })
    ),
  },
}))
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async () => 'hashed'),
    compare: vi.fn(async () => true),
  },
}))

import { AuthService } from './auth.service'
import { HttpError } from '../http-error'
import type { AppEnv } from '../../../config/env'
import { buildUserAccessProfile } from '../../rbac/services/permission.service'

const env = { jwtSecret: 'x', jwtAccessExpiresIn: '7d' } as unknown as AppEnv

function makeUser(over: Partial<{ id: string; email: string; passwordHash: string; fullName: string }> = {}) {
  return {
    id: 'u1',
    email: 'a@b.com',
    passwordHash: 'hashed',
    firstName: 'A',
    middleName: null,
    lastName: 'B',
    secondLastName: null,
    fullName: 'A B',
    emailVerifiedAt: null,
    ...over,
  }
}

describe('AuthService', () => {
  let service: AuthService

  beforeEach(() => {
    service = new AuthService(env, tokens as unknown as never)
    userRepo.findByEmail.mockReset()
    userRepo.findById.mockReset()
    refreshRepo.create.mockReset()
    tokens.signAccessToken.mockReset().mockReturnValue('access-token')
    tokens.generateOpaqueToken.mockReset().mockReturnValue('raw-refresh')
    tokens.hashOpaqueToken.mockReset().mockReturnValue('hash')
    tokens.refreshExpiresAt.mockReset().mockReturnValue(new Date())
    buildUserAccessProfile.mockReset().mockResolvedValue(accessProfile)
  })

  it('login devuelve AuthUser con roles + permissions', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser())
    const result = await service.login({ email: 'a@b.com', password: 'x' })
    expect(result.accessToken).toBe('access-token')
    expect(result.user.roles).toEqual([{ id: 'r1', name: 'General Admin', slug: 'general-admin' }])
    expect(result.user.permissions).toEqual(['leads.read', 'roles.manage'])
  })

  it('login con email inexistente lanza 401 INVALID_CREDENTIALS', async () => {
    userRepo.findByEmail.mockResolvedValue(null)
    await expect(service.login({ email: 'x@y.com', password: 'x' })).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    })
  })

  it('register devuelve AuthUser y no auto-asigna rol (roles vienen del profile, vacíos para nuevo)', async () => {
    userRepo.findByEmail.mockResolvedValue(null) // no existe
    buildUserAccessProfile.mockResolvedValue({ roles: [], permissions: [] })
    const result = await service.register({
      email: 'new@b.com',
      password: 'x',
      firstName: 'N',
      lastName: 'M',
    })
    expect(result.user.roles).toEqual([])
    expect(result.user.permissions).toEqual([])
    expect(result.accessToken).toBe('access-token')
  })

  it('register con email existente lanza 409 EMAIL_EXISTS', async () => {
    userRepo.findByEmail.mockResolvedValue(makeUser())
    await expect(
      service.register({ email: 'a@b.com', password: 'x', firstName: 'N', lastName: 'M' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_EXISTS' })
  })

  it('me devuelve AuthUser', async () => {
    userRepo.findById.mockResolvedValue(makeUser())
    const user = await service.me('u1')
    expect(user.id).toBe('u1')
    expect(user.permissions).toEqual(['leads.read', 'roles.manage'])
  })

  it('me con usuario inexistente lanza 401', async () => {
    userRepo.findById.mockResolvedValue(null)
    await expect(service.me('nope')).rejects.toBeInstanceOf(HttpError)
  })
})