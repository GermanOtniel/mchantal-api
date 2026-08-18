import { describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'

vi.mock('../../config/env', () => ({
  getEnv: () => ({
    jwtSecret: 'test-secret-min-32-chars-xxxxxxxxxxxx',
    jwtAccessExpiresIn: '7d',
  }),
}))

import { jwtAuthHook } from './jwt-auth.hook'

function makeReq(headers: Record<string, string | undefined> = {}) {
  return { headers } as Parameters<typeof jwtAuthHook>[0]
}

describe('jwtAuthHook', () => {
  const secret = 'test-secret-min-32-chars-xxxxxxxxxxxx'

  it('lanza 401 UNAUTHORIZED si no hay header Authorization', async () => {
    await expect(jwtAuthHook(makeReq({}), {} as never)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    })
  })

  it('lanza 401 si el header no empieza con "Bearer "', async () => {
    await expect(
      jwtAuthHook(makeReq({ authorization: 'Token abc' }), {} as never)
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' })
  })

  it('lanza 401 si el token es inválido', async () => {
    await expect(
      jwtAuthHook(makeReq({ authorization: 'Bearer not-a-jwt' }), {} as never)
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' })
  })

  it('lanza 401 si el payload no tiene sub/email', async () => {
    const badToken = jwt.sign({ foo: 'bar' }, secret)
    await expect(
      jwtAuthHook(makeReq({ authorization: `Bearer ${badToken}` }), {} as never)
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' })
  })

  it('setea request.user = {sub, email} con un token válido', async () => {
    const token = jwt.sign({ sub: 'u1', email: 'a@b.com' }, secret)
    const req = makeReq({ authorization: `Bearer ${token}` })
    await jwtAuthHook(req, {} as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((req as any).user).toEqual({ sub: 'u1', email: 'a@b.com' })
  })
})