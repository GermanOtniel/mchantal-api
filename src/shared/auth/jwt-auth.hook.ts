import jwt from 'jsonwebtoken'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { getEnv } from '../../config/env'
import { HttpError } from '../../modules/auth/http-error'

export type JwtUser = {
  sub: string
  email: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtUser
  }
}

export async function jwtAuthHook(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  const token = header.slice('Bearer '.length)
  const env = getEnv()

  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtUser
    if (!payload.sub || !payload.email) {
      throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED')
    }
    request.user = { sub: payload.sub, email: payload.email }
  } catch {
    throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED')
  }
}
