import { AppDataSource } from '../../../database/data-source'
import { LeadFlowState } from '../../../entities/leads/lead-flow-state.entity'
import type {
  CreateFlowStateData,
  LeadFlowStateData,
  LeadFlowStateRepositoryPort,
} from '../types/leads.types'

function toData(s: LeadFlowState): LeadFlowStateData {
  return {
    id: s.id,
    campaignLeadId: s.campaignLeadId,
    currentNodeId: s.currentNodeId,
    context: s.context,
    status: s.status,
    lastInteractionAt: s.lastInteractionAt,
    completedAt: s.completedAt,
  }
}

export class LeadFlowStateRepository implements LeadFlowStateRepositoryPort {
  private get repo() {
    return AppDataSource.getRepository(LeadFlowState)
  }

  async findActiveByCampaignLeadId(campaignLeadId: string): Promise<LeadFlowStateData | null> {
    const s = await this.repo.findOne({ where: { campaignLeadId, status: 'active' } })
    return s ? toData(s) : null
  }

  async findByCampaignLeadId(campaignLeadId: string): Promise<LeadFlowStateData | null> {
    const s = await this.repo.findOne({ where: { campaignLeadId } })
    return s ? toData(s) : null
  }

  async create(data: CreateFlowStateData): Promise<LeadFlowStateData> {
    const saved = await this.repo.save(
      this.repo.create({
        campaignLeadId: data.campaignLeadId,
        currentNodeId: data.currentNodeId,
        context: data.context,
        status: data.status,
        lastInteractionAt: data.lastInteractionAt,
      })
    )
    return toData(saved)
  }

  async save(state: LeadFlowStateData): Promise<LeadFlowStateData> {
    const entity = await this.repo.findOne({ where: { campaignLeadId: state.campaignLeadId } })
    if (!entity) throw new Error('LeadFlowState no encontrado')
    entity.currentNodeId = state.currentNodeId
    entity.context = state.context
    entity.status = state.status
    entity.lastInteractionAt = state.lastInteractionAt
    entity.completedAt = state.completedAt ?? null
    await this.repo.save(entity)
    return state
  }
}