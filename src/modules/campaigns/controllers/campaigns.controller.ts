import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Static } from '@sinclair/typebox'
import { HttpError } from '../../auth/http-error'
import type { CampaignService } from '../services/campaign.service'
import type { Campaign } from '../types/campaign.types'
import {
  CreateCampaignBodySchema,
  UpdateCampaignBodySchema,
} from '../schemas/campaigns.schemas'
import { flowWarnings } from '../services/flow-validator'
import type { ValidationIssue } from '../types/flow.types'

function toResponse(c: Campaign) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    entryMessage: c.entryMessage,
    flowDefinition: c.flowDefinition,
    origins: c.origins,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

function handleError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send({
      code: err.code,
      message: err.message,
      details: err.details,
    })
  }
  throw err
}

export class CampaignsController {
  constructor(private readonly campaignService: CampaignService) {}

  list = async (_request: FastifyRequest, reply: FastifyReply) => {
    const campaigns = await this.campaignService.listAll()
    return reply.send({ campaigns: campaigns.map(toResponse) })
  }

  create = async (
    request: FastifyRequest<{ Body: Static<typeof CreateCampaignBodySchema> }>,
    reply: FastifyReply
  ) => {
    try {
      const c = await this.campaignService.createCampaign(request.body)
      const warnings: ValidationIssue[] = request.body.flowDefinition
        ? flowWarnings(request.body.flowDefinition)
        : []
      return reply.code(201).send({ ...toResponse(c), warnings })
    } catch (e) {
      return handleError(reply, e)
    }
  }

  getById = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const c = await this.campaignService.findById(request.params.id)
      if (!c) throw new HttpError('Campaña no encontrada', 404, 'CAMPAIGN_NOT_FOUND')
      return reply.send(toResponse(c))
    } catch (e) {
      return handleError(reply, e)
    }
  }

  update = async (
    request: FastifyRequest<{
      Params: { id: string }
      Body: Static<typeof UpdateCampaignBodySchema>
    }>,
    reply: FastifyReply
  ) => {
    try {
      const c = await this.campaignService.updateCampaign(
        request.params.id,
        request.body
      )
      const warnings: ValidationIssue[] = request.body.flowDefinition
        ? flowWarnings(request.body.flowDefinition)
        : []
      return reply.send({ ...toResponse(c), warnings })
    } catch (e) {
      return handleError(reply, e)
    }
  }
}