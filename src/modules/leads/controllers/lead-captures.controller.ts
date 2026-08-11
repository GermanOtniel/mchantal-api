import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Static } from '@sinclair/typebox'
import { HttpError } from '../../auth/http-error'
import type { LeadCaptureService } from '../services/lead-capture.service'
import { CreateLeadCaptureBodySchema } from '../schemas/lead-captures.schemas'

function handleError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send({ code: err.code, message: err.message })
  }
  throw err
}

export class LeadCapturesController {
  constructor(private readonly leadCaptureService: LeadCaptureService) {}

  create = async (
    request: FastifyRequest<{ Body: Static<typeof CreateLeadCaptureBodySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const result = await this.leadCaptureService.createCapture(request.body.slug)
      return reply.send(result)
    } catch (e) {
      return handleError(reply, e)
    }
  }
}