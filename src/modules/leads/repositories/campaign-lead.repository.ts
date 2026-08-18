import { AppDataSource } from '../../../database/data-source'
import { CampaignLead } from '../../../entities/leads/campaign-lead.entity'
import type { FlowDefinition } from '../../campaigns/types/flow.types'
import type {
  CampaignLeadContext,
  CampaignLeadData,
  CampaignLeadRepositoryPort,
  CreateCampaignLeadData,
  LeadListItem,
  ListLeadsRepoParams,
  LeadsRepoPage,
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
    assignmentMode: lead.assignmentMode,
    assignedExecutiveId: lead.assignedExecutiveId,
    assignedAt: lead.assignedAt,
  }
}

type LeadQB = import('typeorm').SelectQueryBuilder<CampaignLead>

function applyLeadFilters(qb: LeadQB, p: ListLeadsRepoParams): void {
  if (p.scopeUserId) qb.andWhere('cl.assigned_executive_id = :scopeUserId', { scopeUserId: p.scopeUserId })
  if (p.campaignId) qb.andWhere('cl.campaign_id = :campaignId', { campaignId: p.campaignId })
  if (p.status) qb.andWhere('cl.status = :status', { status: p.status })
  if (p.executiveId) qb.andWhere('cl.assigned_executive_id = :executiveId', { executiveId: p.executiveId })
  if (p.q) {
    qb.andWhere('(cl.id = :qExact OR cl.context->>\'folio\' ILIKE :qLike)', { qExact: p.q, qLike: `%${p.q}%` })
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
    entity.assignmentMode = lead.assignmentMode ?? null
    entity.assignedExecutiveId = lead.assignedExecutiveId ?? null
    entity.assignedAt = lead.assignedAt ?? null
    await this.repo.save(entity)
    return lead
  }

  async listAll(): Promise<LeadListItem[]> {
    const rows = await this.repo.find({
      relations: ['campaign', 'contact', 'assignedExecutive'],
      order: { enrolledAt: 'DESC' },
      take: 500,
    })
    return rows.map((r) => {
      const ctx = (r.context as { folio?: string; answers?: Record<string, string> } | undefined) ?? {}
      return {
        id: r.id,
        folio: ctx.folio ?? null,
        campaignId: r.campaignId,
        campaignName: r.campaign?.name ?? '',
        contactWaId: r.contact?.waId ?? '',
        contactName: r.contact?.profileName ?? null,
        answers: ctx.answers ?? {},
        assignmentMode: r.assignmentMode,
        assignedExecutiveId: r.assignedExecutiveId,
        assignedExecutiveName: r.assignedExecutive?.fullName ?? null,
        assignedAt: r.assignedAt,
        enrolledAt: r.enrolledAt,
        status: r.status,
        needsReply: false,
      }
    })
  }

  async listLeads(p: ListLeadsRepoParams): Promise<LeadsRepoPage> {
    const qb = this.repo
      .createQueryBuilder('cl')
      .leftJoinAndSelect('cl.campaign', 'campaign')
      .leftJoinAndSelect('cl.contact', 'contact')
      .leftJoinAndSelect('cl.assignedExecutive', 'executive')
      .leftJoin('whatsapp_conversations', 'wc', "wc.lead_id = cl.id AND wc.status = 'open'")
      .addSelect('wc.last_message_at', 'wc_last_message_at')
      .addSelect('wc.last_message_direction', 'wc_last_message_direction')
      .addSelect('wc.needs_reply_cleared_at', 'wc_cleared_at')
      .addSelect(
        `CASE WHEN wc.last_message_direction = 'inbound' AND wc.last_message_at > COALESCE(wc.needs_reply_cleared_at, '-infinity'::timestamptz) THEN true ELSE false END`,
        'needsReply'
      )
      .orderBy('cl.enrolled_at', 'DESC')
      .skip((p.page - 1) * p.pageSize)
      .take(p.pageSize)

    applyLeadFilters(qb, p)

    const { entities, raw } = await qb.getRawAndEntities()

    const items: LeadListItem[] = entities.map((r, i) => {
      const ctx = (r.context as { folio?: string; answers?: Record<string, string> } | undefined) ?? {}
      return {
        id: r.id,
        folio: ctx.folio ?? null,
        campaignId: r.campaignId,
        campaignName: r.campaign?.name ?? '',
        contactWaId: r.contact?.waId ?? '',
        contactName: r.contact?.profileName ?? null,
        answers: ctx.answers ?? {},
        assignmentMode: r.assignmentMode,
        assignedExecutiveId: r.assignedExecutiveId,
        assignedExecutiveName: r.assignedExecutive?.fullName ?? null,
        assignedAt: r.assignedAt,
        enrolledAt: r.enrolledAt,
        status: r.status,
        needsReply: Boolean((raw[i] as Record<string, unknown>)?.needsReply),
      }
    })

    const countQb = this.repo.createQueryBuilder('cl')
    applyLeadFilters(countQb, p)
    const total = await countQb.getCount()

    return { items, total }
  }
}