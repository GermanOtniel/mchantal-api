import type { FastifyReply, FastifyRequest } from 'fastify'
import { HttpError } from '../../auth/http-error'
import { AnalyticsQueryRepository } from '../repositories/analytics-query.repository'
import { AnalyticsQueryService } from '../services/analytics-query.service'

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

export class AnalyticsController {
  private readonly service = new AnalyticsQueryService(new AnalyticsQueryRepository())

  overviewKpis = async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send(await this.service.getOverviewKpis())
    } catch (e) {
      return handleError(reply, e)
    }
  }

  overviewCharts = async (
    request: FastifyRequest<{ Querystring: { from?: string; to?: string; topN?: number } }>,
    reply: FastifyReply
  ) => {
    try {
      const { from, to } = this.service.defaultRange()
      return reply.send(
        await this.service.getOverviewCharts(
          request.query.from ?? from,
          request.query.to ?? to,
          request.query.topN ?? 10
        )
      )
    } catch (e) {
      return handleError(reply, e)
    }
  }

  overviewCampaignsTable = async (
    request: FastifyRequest<{
      Querystring: { from?: string; to?: string; page?: number; limit?: number }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { from, to } = this.service.defaultRange()
      return reply.send(
        await this.service.listCampaignsTable(
          request.query.from ?? from,
          request.query.to ?? to,
          request.query.page ?? 1,
          request.query.limit ?? 25
        )
      )
    } catch (e) {
      return handleError(reply, e)
    }
  }

  campaignKpis = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      return reply.send(await this.service.getCampaignKpis(request.params.id))
    } catch (e) {
      return handleError(reply, e)
    }
  }

  campaignCharts = async (
    request: FastifyRequest<{
      Params: { id: string }
      Querystring: { from?: string; to?: string }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { from, to } = this.service.defaultRange()
      return reply.send(
        await this.service.getCampaignCharts(
          request.params.id,
          request.query.from ?? from,
          request.query.to ?? to
        )
      )
    } catch (e) {
      return handleError(reply, e)
    }
  }
}