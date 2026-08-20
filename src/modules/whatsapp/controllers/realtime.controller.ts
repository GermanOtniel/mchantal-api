import type { FastifyReply, FastifyRequest } from 'fastify'
import { getSseConnectionManager } from '../realtime'

export class RealtimeController {
  subscribe = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.hijack()
    const userId = request.user!.sub
    const origin = request.headers.origin
    getSseConnectionManager().addClient(
      userId,
      request.permissions ?? new Set<string>(),
      reply.raw,
      typeof origin === 'string' ? origin : undefined,
    )
  }
}
