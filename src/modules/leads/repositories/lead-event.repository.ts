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
}