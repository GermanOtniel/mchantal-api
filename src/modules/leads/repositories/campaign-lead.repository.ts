import { AppDataSource } from '../../../database/data-source'
import { CampaignLead } from '../../../entities/leads/campaign-lead.entity'

export class CampaignLeadRepository {
  private get repo() {
    return AppDataSource.getRepository(CampaignLead)
  }

  findById(id: string) {
    return this.repo.findOne({
      where: { id },
      relations: { campaign: true, contact: true, leadCapture: true, assignee: true },
    })
  }

  findByContactAndCampaign(contactId: string, campaignId: string) {
    return this.repo.findOne({ where: { contactId, campaignId } })
  }

  findActiveByContactId(contactId: string) {
    return this.repo
      .createQueryBuilder('cl')
      .innerJoin('lead_flow_states', 'fs', 'fs.campaign_lead_id = cl.id')
      .where('cl.contact_id = :contactId', { contactId })
      .andWhere('fs.status = :status', { status: 'active' })
      .orderBy('fs.last_interaction_at', 'DESC')
      .getOne()
  }

  create(data: Partial<CampaignLead>) {
    const entity = this.repo.create(data)
    return this.repo.save(entity)
  }

  async save(entity: CampaignLead) {
    return this.repo.save(entity)
  }

  list(params: {
    campaignId?: string
    statusKey?: string
    assigneeUserId?: string
    limit?: number
  }) {
    const qb = this.repo
      .createQueryBuilder('cl')
      .leftJoinAndSelect('cl.campaign', 'campaign')
      .leftJoinAndSelect('cl.contact', 'contact')
      .leftJoinAndSelect('cl.assignee', 'assignee')
      .orderBy('cl.enrolledAt', 'DESC')
      .take(params.limit ?? 50)

    if (params.campaignId) {
      qb.andWhere('cl.campaignId = :campaignId', { campaignId: params.campaignId })
    }
    if (params.statusKey) {
      qb.andWhere('cl.statusKey = :statusKey', { statusKey: params.statusKey })
    }
    if (params.assigneeUserId) {
      qb.andWhere('cl.assigneeUserId = :assigneeUserId', {
        assigneeUserId: params.assigneeUserId,
      })
    }

    return qb.getMany()
  }

  countActiveByAssignee(userId: string) {
    return this.repo.count({
      where: {
        assigneeUserId: userId,
        isSuccessful: false,
      },
    })
  }
}
