import { AppDataSource } from '../../../database/data-source'
import { CampaignLead } from '../../../entities/leads/campaign-lead.entity'
import type { FlowDefinition } from '../../campaigns/types/flow.types'
import type {
  CampaignLeadContext,
  CampaignLeadData,
  CampaignLeadRepositoryPort,
  CreateCampaignLeadData,
} from '../types/leads.types'

function toData(lead: CampaignLead): CampaignLeadData {
  return {
    id: lead.id,
    contactId: lead.contactId,
    campaignId: lead.campaignId,
    campaign: {
      id: lead.campaign.id,
      flowDefinition: lead.campaign.flowDefinition as unknown as FlowDefinition,
    },
    context: lead.context as unknown as CampaignLeadContext,
  }
}

export class CampaignLeadRepository implements CampaignLeadRepositoryPort {
  private get repo() {
    return AppDataSource.getRepository(CampaignLead)
  }

  async findByContactAndCampaign(
    contactId: string,
    campaignId: string
  ): Promise<CampaignLeadData | null> {
    const lead = await this.repo.findOne({
      where: { contactId, campaignId },
      relations: ['campaign'],
    })
    return lead ? toData(lead) : null
  }

  async create(data: CreateCampaignLeadData): Promise<CampaignLeadData> {
    const saved = await this.repo.save(
      this.repo.create({
        contactId: data.contactId,
        campaignId: data.campaignId,
        context: data.context as unknown as Record<string, unknown>,
      })
    )
    const reloaded = await this.repo.findOne({ where: { id: saved.id }, relations: ['campaign'] })
    if (!reloaded) throw new Error('CampaignLead no encontrado tras create')
    return toData(reloaded)
  }

  async findById(id: string): Promise<CampaignLeadData | null> {
    const lead = await this.repo.findOne({ where: { id }, relations: ['campaign'] })
    return lead ? toData(lead) : null
  }

  async save(lead: CampaignLeadData): Promise<CampaignLeadData> {
    const entity = await this.repo.findOne({ where: { id: lead.id } })
    if (!entity) throw new Error('CampaignLead no encontrado')
    entity.context = lead.context as unknown as Record<string, unknown>
    await this.repo.save(entity)
    return lead
  }
}