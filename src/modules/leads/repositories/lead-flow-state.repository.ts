import { AppDataSource } from '../../../database/data-source'
import { LeadFlowState } from '../../../entities/leads/lead-flow-state.entity'

export class LeadFlowStateRepository {
  private get repo() {
    return AppDataSource.getRepository(LeadFlowState)
  }

  findByCampaignLeadId(campaignLeadId: string) {
    return this.repo.findOne({ where: { campaignLeadId } })
  }

  findActiveByCampaignLeadId(campaignLeadId: string) {
    return this.repo.findOne({
      where: { campaignLeadId, status: 'active' },
    })
  }

  create(data: Partial<LeadFlowState>) {
    const entity = this.repo.create(data)
    return this.repo.save(entity)
  }

  async save(entity: LeadFlowState) {
    return this.repo.save(entity)
  }
}
