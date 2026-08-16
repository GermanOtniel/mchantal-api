import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Static } from '@sinclair/typebox'
import { HttpError } from '../../auth/http-error'
import type { ExecutiveRepositoryPort } from '../types/executives.types'
import type { ExecutiveData } from '../types/executives.types'
import { UpdateExecutiveBodySchema } from '../schemas/executives.schemas'

function toResponse(e: ExecutiveData) {
  return {
    id: e.id,
    fullName: e.fullName,
    email: e.email,
    isActive: e.isActive,
    coverage: e.coverage,
    lastAssignedAt: e.lastAssignedAt ? e.lastAssignedAt.toISOString() : null,
  }
}

function handleError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send({ code: err.code, message: err.message, details: err.details })
  }
  throw err
}

export class ExecutivesController {
  constructor(private readonly execs: ExecutiveRepositoryPort) {}

  list = async (_req: FastifyRequest, reply: FastifyReply) => {
    const executives = await this.execs.listExecutives()
    return reply.send({ executives: executives.map(toResponse) })
  }

  update = async (
    req: FastifyRequest<{ Params: { id: string }; Body: Static<typeof UpdateExecutiveBodySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const e = await this.execs.update(req.params.id, req.body)
      return reply.send(toResponse(e))
    } catch (e) {
      return handleError(reply, e)
    }
  }
}