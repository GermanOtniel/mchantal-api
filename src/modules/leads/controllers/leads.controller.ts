import type { FastifyReply, FastifyRequest } from 'fastify'
import type { CampaignLeadRepositoryPort, LeadListItem } from '../types/leads.types'

function toResponse(l: LeadListItem) {
  return {
    id: l.id,
    folio: l.folio,
    campaignId: l.campaignId,
    campaignName: l.campaignName,
    contactWaId: l.contactWaId,
    contactName: l.contactName,
    answers: l.answers,
    assignmentMode: l.assignmentMode,
    assignedExecutiveId: l.assignedExecutiveId,
    assignedExecutiveName: l.assignedExecutiveName,
    assignedAt: l.assignedAt ? l.assignedAt.toISOString() : null,
    enrolledAt: l.enrolledAt.toISOString(),
  }
}

export class LeadsController {
  constructor(private readonly campaignLeads: CampaignLeadRepositoryPort) {}

  list = async (_req: FastifyRequest, reply: FastifyReply) => {
    const leads = await this.campaignLeads.listAll()
    return reply.send({ leads: leads.map(toResponse) })
  }
}