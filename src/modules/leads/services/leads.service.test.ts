import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LeadsService } from './leads.service'
import type {
  CampaignLeadRepositoryPort,
  CampaignLeadData,
  LeadListItem,
  WhatsAppConversationRepositoryWidePort,
} from '../types/leads.types'
import type { CampaignRepositoryPort, Campaign } from '../../campaigns/types/campaign.types'
import type { ExecutiveRepositoryPort, ExecutiveData } from '../../executives/types/executives.types'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'

function leadItem(over: Partial<LeadListItem> = {}): LeadListItem {
  return {
    id: 'l1', folio: 'MC-1', campaignId: 'c1', campaignName: 'C', contactWaId: 'w', contactName: 'Ana',
    answers: {}, assignmentMode: 'executive', assignedExecutiveId: 'u1', assignedExecutiveName: 'Pepe',
    assignedAt: new Date('2026-01-01'), enrolledAt: new Date('2026-01-01'), status: 'new', needsReply: false, ...over,
  }
}

function leadData(over: Partial<CampaignLeadData> = {}): CampaignLeadData {
  return {
    id: 'l1', contactId: 'ct', campaignId: 'c1',
    campaign: { id: 'c1', flowDefinition: { nodes: {} } },
    context: { folio: 'MC-1', answers: {} },
    assignmentMode: 'executive', assignedExecutiveId: 'u1', assignedAt: new Date('2026-01-01'), ...over,
  }
}

function mkLeadsRepo(over: Partial<CampaignLeadRepositoryPort> = {}): CampaignLeadRepositoryPort {
  return {
    findByContactAndCampaign: vi.fn(async () => null),
    create: vi.fn(async () => leadData()),
    findById: vi.fn(async () => leadData()),
    save: vi.fn(async (l) => l),
    listAll: vi.fn(async () => []),
    listLeads: vi.fn(async () => ({ items: [leadItem()], total: 1 })),
    ...over,
  }
}

function mkConvRepo(over: Partial<WhatsAppConversationRepositoryWidePort> = {}): WhatsAppConversationRepositoryWidePort {
  return {
    findById: vi.fn(async () => null),
    setLead: vi.fn(async () => {}),
    findOpenByContactId: vi.fn(async () => null),
    createOpen: vi.fn(async () => ({ id: 'conv', contactId: 'ct', status: 'open', leadId: null })),
    touchLastMessage: vi.fn(async () => {}),
    clearNeedsReplyByLeadId: vi.fn(async () => true),
    ...over,
  }
}

function mkCampaignRepo(over: Partial<CampaignRepositoryPort> = {}): CampaignRepositoryPort {
  return {
    create: vi.fn(async () => ({}) as Campaign),
    update: vi.fn(async () => ({}) as Campaign),
    findById: vi.fn(async () => null),
    listAll: vi.fn(async () => [{ id: 'c1', slug: 'c', name: 'Campaña 1', entryMessage: '', flowDefinition: {}, createdAt: new Date(), updatedAt: new Date() }]),
    slugExists: vi.fn(async () => false),
    ...over,
  }
}

function mkExecRepo(over: Partial<ExecutiveRepositoryPort> = {}): ExecutiveRepositoryPort {
  return {
    listAll: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    findActiveByCoverage: vi.fn(async () => []),
    findAllActive: vi.fn(async () => [{ id: 'u1', fullName: 'Pepe', email: 'p@x', isActive: true, coverage: {}, lastAssignedAt: null } as ExecutiveData]),
    update: vi.fn(async () => ({}) as ExecutiveData),
    touchLastAssignedAt: vi.fn(async () => {}),
    ...over,
  }
}

const PAGE_SIZE = 50

function perms(...keys: string[]): Set<string> {
  return new Set(keys)
}

describe('LeadsService.listLeads — permisos y scope', () => {
  let svc: LeadsService
  let leadsRepo: CampaignLeadRepositoryPort
  beforeEach(() => {
    leadsRepo = mkLeadsRepo()
    svc = new LeadsService(leadsRepo, mkConvRepo(), mkCampaignRepo(), mkExecRepo(), PAGE_SIZE)
  })

  it('sin leads.read → 403', async () => {
    await expect(svc.listLeads({ permissions: perms(), userId: 'u1', query: {} })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('con leads.read.all → scopeUserId null (todos)', async () => {
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', query: {} })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ scopeUserId: null }))
  })

  it('sin leads.read.all → scopeUserId = userId (sólo los míos)', async () => {
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', query: {} })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ scopeUserId: 'u1' }))
  })
})

describe('LeadsService.listLeads — descarte de filtros sin permiso', () => {
  let svc: LeadsService
  let leadsRepo: CampaignLeadRepositoryPort
  beforeEach(() => {
    leadsRepo = mkLeadsRepo()
    svc = new LeadsService(leadsRepo, mkConvRepo(), mkCampaignRepo(), mkExecRepo(), PAGE_SIZE)
  })

  it('descarta campaignId sin leads.filter.campaign', async () => {
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', query: { campaignId: 'c1' } })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ campaignId: undefined }))
  })

  it('acepta campaignId con leads.filter.campaign', async () => {
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL, PERMISSIONS.LEADS_FILTER_CAMPAIGN), userId: 'u1', query: { campaignId: 'c1' } })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 'c1' }))
  })

  it('descarta status sin leads.filter.status', async () => {
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', query: { status: 'new' } })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }))
  })

  it('400 si status no es válido (con permiso)', async () => {
    await expect(svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL, PERMISSIONS.LEADS_FILTER_STATUS), userId: 'u1', query: { status: 'bogus' } })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('descarta executiveId sin leads.filter.executive', async () => {
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', query: { executiveId: 'u2' } })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ executiveId: undefined }))
  })

  it('descarta executiveId sin leads.read.all (aunque tenga filter.executive)', async () => {
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_FILTER_EXECUTIVE), userId: 'u1', query: { executiveId: 'u2' } })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ executiveId: undefined, scopeUserId: 'u1' }))
  })

  it('acepta executiveId con filter.executive + read.all', async () => {
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL, PERMISSIONS.LEADS_FILTER_EXECUTIVE), userId: 'u1', query: { executiveId: 'u2' } })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ executiveId: 'u2' }))
  })

  it('q siempre se pasa (dentro del scope)', async () => {
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', query: { q: 'MC-1' } })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ q: 'MC-1' }))
  })
})

describe('LeadsService.listLeads — paginación y shape', () => {
  it('page default 1, 400 si page < 1', async () => {
    const leadsRepo = mkLeadsRepo()
    const svc = new LeadsService(leadsRepo, mkConvRepo(), mkCampaignRepo(), mkExecRepo(), PAGE_SIZE)
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', query: {} })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 50 }))
    await expect(svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', query: { page: 0 } })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('shape {items,page,pageSize,total,totalPages} y mapea fechas a ISO', async () => {
    const leadsRepo = mkLeadsRepo({ listLeads: vi.fn(async () => ({ items: [leadItem({ needsReply: true })], total: 60 })) })
    const svc = new LeadsService(leadsRepo, mkConvRepo(), mkCampaignRepo(), mkExecRepo(), PAGE_SIZE)
    const res = await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', query: { page: 1 } })
    expect(res.page).toBe(1)
    expect(res.pageSize).toBe(50)
    expect(res.total).toBe(60)
    expect(res.totalPages).toBe(2)
    expect(res.items[0].needsReply).toBe(true)
    expect(res.items[0].enrolledAt).toBe(new Date('2026-01-01').toISOString())
    expect(res.items[0].assignedAt).toBe(new Date('2026-01-01').toISOString())
  })

  it('total 0 → totalPages 0', async () => {
    const leadsRepo = mkLeadsRepo({ listLeads: vi.fn(async () => ({ items: [], total: 0 })) })
    const svc = new LeadsService(leadsRepo, mkConvRepo(), mkCampaignRepo(), mkExecRepo(), PAGE_SIZE)
    const res = await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', query: {} })
    expect(res.totalPages).toBe(0)
  })
})

describe('LeadsService.filterOptions', () => {
  it('sin leads.filter.campaign → campaigns vacío', async () => {
    const svc = new LeadsService(mkLeadsRepo(), mkConvRepo(), mkCampaignRepo(), mkExecRepo(), PAGE_SIZE)
    const res = await svc.filterOptions({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL), userId: 'u1' })
    expect(res.campaigns).toEqual([])
  })

  it('con filter.campaign → campaigns populado', async () => {
    const svc = new LeadsService(mkLeadsRepo(), mkConvRepo(), mkCampaignRepo(), mkExecRepo(), PAGE_SIZE)
    const res = await svc.filterOptions({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL, PERMISSIONS.LEADS_FILTER_CAMPAIGN), userId: 'u1' })
    expect(res.campaigns).toEqual([{ id: 'c1', name: 'Campaña 1' }])
  })

  it('sin filter.executive o sin read.all → executives vacío', async () => {
    const svc = new LeadsService(mkLeadsRepo(), mkConvRepo(), mkCampaignRepo(), mkExecRepo(), PAGE_SIZE)
    const r1 = await svc.filterOptions({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_FILTER_EXECUTIVE), userId: 'u1' })
    expect(r1.executives).toEqual([])
    const r2 = await svc.filterOptions({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL), userId: 'u1' })
    expect(r2.executives).toEqual([])
  })

  it('con filter.executive + read.all → executives activos', async () => {
    const svc = new LeadsService(mkLeadsRepo(), mkConvRepo(), mkCampaignRepo(), mkExecRepo(), PAGE_SIZE)
    const res = await svc.filterOptions({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL, PERMISSIONS.LEADS_FILTER_EXECUTIVE), userId: 'u1' })
    expect(res.executives).toEqual([{ id: 'u1', fullName: 'Pepe' }])
  })
})

describe('LeadsService.clearNeedsReply', () => {
  let leadsRepo: CampaignLeadRepositoryPort
  let convRepo: WhatsAppConversationRepositoryWidePort
  let svc: LeadsService
  beforeEach(() => {
    leadsRepo = mkLeadsRepo()
    convRepo = mkConvRepo()
    svc = new LeadsService(leadsRepo, convRepo, mkCampaignRepo(), mkExecRepo(), PAGE_SIZE)
  })

  it('sin leads.clear_needs_reply → 403', async () => {
    await expect(svc.clearNeedsReply({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lead no existe → 404', async () => {
    leadsRepo.findById = vi.fn(async () => null)
    await expect(svc.clearNeedsReply({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_CLEAR_NEEDS_REPLY), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('sin read.all y lead asignado a otro → 404', async () => {
    leadsRepo.findById = vi.fn(async () => leadData({ assignedExecutiveId: 'u2' }))
    await expect(svc.clearNeedsReply({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_CLEAR_NEEDS_REPLY), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 404 })
    expect(convRepo.clearNeedsReplyByLeadId).not.toHaveBeenCalled()
  })

  it('sin conversación abierta → 404', async () => {
    convRepo.clearNeedsReplyByLeadId = vi.fn(async () => false)
    await expect(svc.clearNeedsReply({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL, PERMISSIONS.LEADS_CLEAR_NEEDS_REPLY), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('ok → llama clearNeedsReplyByLeadId', async () => {
    await svc.clearNeedsReply({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL, PERMISSIONS.LEADS_CLEAR_NEEDS_REPLY), userId: 'u1', leadId: 'l1' })
    expect(convRepo.clearNeedsReplyByLeadId).toHaveBeenCalledWith('l1')
  })

  it('ok con scope propio (lead asignado a mí, sin read.all)', async () => {
    leadsRepo.findById = vi.fn(async () => leadData({ assignedExecutiveId: 'u1' }))
    await svc.clearNeedsReply({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_CLEAR_NEEDS_REPLY), userId: 'u1', leadId: 'l1' })
    expect(convRepo.clearNeedsReplyByLeadId).toHaveBeenCalledWith('l1')
  })
})