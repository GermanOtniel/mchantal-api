import { AppDataSource } from '../../../database/data-source'
import { LeadCapture } from '../../../entities/leads/lead-capture.entity'
import type { FlowDefinition } from '../../campaigns/types/flow.types'
import type {
  LeadCaptureData,
  LeadCaptureRepositoryPort,
} from '../types/leads.types'

function toData(c: LeadCapture): LeadCaptureData {
  return {
    id: c.id,
    folio: c.folio,
    campaignId: c.campaignId,
    campaign: {
      id: c.campaign.id,
      flowDefinition: c.campaign.flowDefinition as unknown as FlowDefinition,
    },
    status: c.status,
    campaignLeadId: c.campaignLeadId,
    origin: c.origin,
  }
}

export class LeadCaptureRepository implements LeadCaptureRepositoryPort {
  private get repo() {
    return AppDataSource.getRepository(LeadCapture)
  }

  async findPendingByFolio(folio: string): Promise<LeadCaptureData | null> {
    const c = await this.repo.findOne({
      where: { folio, status: 'pending' },
      relations: ['campaign'],
    })
    return c ? toData(c) : null
  }

  async markMatched(captureId: string, leadId: string): Promise<void> {
    await this.repo.update({ id: captureId }, { status: 'matched', campaignLeadId: leadId })
  }

  async create(data: { folio: string; campaignId: string; status: 'pending'; origin: string }): Promise<LeadCapture> {
    return this.repo.save(this.repo.create({ folio: data.folio, campaignId: data.campaignId, status: data.status, origin: data.origin }))
  }
}