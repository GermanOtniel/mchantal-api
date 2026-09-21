import { AppDataSource } from '../../../database/data-source'
import { LeadEvent } from '../../../entities/leads/lead-event.entity'
import type { LeadEventData, LeadEventsRepositoryPort } from '../types/leads.types'

function toData(e: LeadEvent): LeadEventData {
  return {
    id: e.id,
    leadId: e.leadId,
    type: e.type,
    fromValue: e.fromValue,
    toValue: e.toValue,
    reason: e.reason,
    milestoneKind: e.milestoneKind,
    actorUserId: e.actorUserId,
    createdAt: e.createdAt,
  }
}

export class LeadEventsRepository implements LeadEventsRepositoryPort {
  private get repo() {
    return AppDataSource.getRepository(LeadEvent)
  }

  async record(
    data: Omit<LeadEventData, 'id' | 'createdAt'> & { createdAt?: Date }
  ): Promise<LeadEventData> {
    const saved = await this.repo.save(
      this.repo.create({
        leadId: data.leadId,
        type: data.type,
        fromValue: data.fromValue,
        toValue: data.toValue,
        reason: data.reason,
        milestoneKind: data.milestoneKind,
        actorUserId: data.actorUserId,
        createdAt: data.createdAt,
      } as Partial<LeadEvent>)
    )
    return toData(saved)
  }

  async listByLead(leadId: string): Promise<LeadEventData[]> {
    const rows = await this.repo.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
    })
    return rows.map(toData)
  }

  async findLatestStatusChangeLeadId(leadIds: string[]): Promise<string | null> {
    if (leadIds.length === 0) return null
    const row = await this.repo
      .createQueryBuilder('e')
      .select('e.lead_id', 'leadId')
      .addSelect('MAX(e.created_at)', 'latest')
      .where('e.type = :type', { type: 'status_change' })
      .andWhere('e.lead_id IN (:...leadIds)', { leadIds })
      .groupBy('e.lead_id')
      .orderBy('latest', 'DESC')
      .limit(1)
      .getRawOne<{ leadId: string }>()
    return row?.leadId ?? null
  }
}