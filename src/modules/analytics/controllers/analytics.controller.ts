import type { FastifyReply, FastifyRequest } from 'fastify'
import { AnalyticsQueryService } from '../services/analytics-query.service'

export class AnalyticsController {
  constructor(private readonly analytics = new AnalyticsQueryService()) {}

  overviewKpis = async (_request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.analytics.getOverviewKpis()
    return reply.send(data)
  }

  overviewCharts = async (
    request: FastifyRequest<{
      Querystring: { from?: string; to?: string; topN?: number }
    }>,
    reply: FastifyReply
  ) => {
    const defaults = this.analytics.defaultRange()
    const from = request.query.from ?? defaults.from
    const to = request.query.to ?? defaults.to
    const data = await this.analytics.getOverviewCharts(from, to, request.query.topN ?? 10)
    return reply.send(data)
  }

  overviewCampaignsTable = async (
    request: FastifyRequest<{
      Querystring: { from?: string; to?: string; page?: number; limit?: number }
    }>,
    reply: FastifyReply
  ) => {
    const defaults = this.analytics.defaultRange()
    const from = request.query.from ?? defaults.from
    const to = request.query.to ?? defaults.to
    const data = await this.analytics.listCampaignsTable(
      from,
      to,
      request.query.page ?? 1,
      request.query.limit ?? 25
    )
    return reply.send(data)
  }

  campaignKpis = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const data = await this.analytics.getCampaignKpis(request.params.id)
    return reply.send(data)
  }

  campaignCharts = async (
    request: FastifyRequest<{
      Params: { id: string }
      Querystring: { from?: string; to?: string }
    }>,
    reply: FastifyReply
  ) => {
    const defaults = this.analytics.defaultRange()
    const from = request.query.from ?? defaults.from
    const to = request.query.to ?? defaults.to
    const data = await this.analytics.getCampaignCharts(request.params.id, from, to)
    return reply.send(data)
  }
}
