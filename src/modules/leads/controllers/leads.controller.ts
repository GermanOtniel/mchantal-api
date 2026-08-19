import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Static } from '@sinclair/typebox'
import { HttpError } from '../../auth/http-error'
import type { LeadsService } from '../services/leads.service'
import type { ListLeadsQuerySchema, LeadIdParamsSchema } from '../schemas/leads.schemas'

function handleError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send({ code: err.code, message: err.message })
  }
  throw err
}

export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  list = async (
    request: FastifyRequest<{ Querystring: Static<typeof ListLeadsQuerySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.permissions || !request.user?.sub) {
        throw new HttpError('Forbidden', 403, 'FORBIDDEN')
      }
      const result = await this.service.listLeads({
        permissions: request.permissions,
        userId: request.user.sub,
        query: request.query,
      })
      return reply.send(result)
    } catch (e) {
      return handleError(reply, e)
    }
  }

  filterOptions = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!request.permissions || !request.user?.sub) {
        throw new HttpError('Forbidden', 403, 'FORBIDDEN')
      }
      const result = await this.service.filterOptions({
        permissions: request.permissions,
        userId: request.user.sub,
      })
      return reply.send(result)
    } catch (e) {
      return handleError(reply, e)
    }
  }

  clearNeedsReply = async (
    request: FastifyRequest<{ Params: Static<typeof LeadIdParamsSchema> }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.permissions || !request.user?.sub) {
        throw new HttpError('Forbidden', 403, 'FORBIDDEN')
      }
      await this.service.clearNeedsReply({
        permissions: request.permissions,
        userId: request.user.sub,
        leadId: request.params.id,
      })
      return reply.code(204).send()
    } catch (e) {
      return handleError(reply, e)
    }
  }
}