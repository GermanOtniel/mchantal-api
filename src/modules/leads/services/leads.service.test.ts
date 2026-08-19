import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LeadsService } from './leads.service'
import type {
  CampaignLeadRepositoryPort,
  CampaignLeadData,
  LeadListItem,
  WhatsAppConversationRepositoryWidePort,
  WhatsAppConversationRepositoryPort,
  ConversationData,
  LeadFlowStateData,
  LeadFlowStateRepositoryPort,
  MatcherDictionaryResolverPort,
  ContactData,
  LeadEventsRepositoryPort,
  LeadEventData,
} from '../types/leads.types'
import type { MatcherDictionaryData } from '../../matcher-dictionaries/types/dictionary.types'
import type { CampaignRepositoryPort, Campaign } from '../../campaigns/types/campaign.types'
import type { ExecutiveRepositoryPort, ExecutiveData, AvailableExecutive } from '../../executives/types/executives.types'
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
    campaign: { id: 'c1', name: 'Campaña 1', flowDefinition: { nodes: {} } },
    context: { folio: 'MC-1', answers: {} },
    assignmentMode: 'executive', assignedExecutiveId: 'u1', assignedAt: new Date('2026-01-01'),
    status: 'new', enrolledAt: new Date('2026-01-01'),
    ...over,
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
    findOpenByLeadId: vi.fn(async () => null),
    createOpen: vi.fn(async () => ({ id: 'conv', contactId: 'ct', contactWaId: 'w', status: 'open', leadId: null, lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null })),
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
    listAvailableForCampaign: vi.fn(async () => [
      { userId: 'u1', fullName: 'Pepe', activeLeads: 3 },
      { userId: 'u2', fullName: 'Ana', activeLeads: 1 },
    ] as AvailableExecutive[]),
    update: vi.fn(async () => ({}) as ExecutiveData),
    touchLastAssignedAt: vi.fn(async () => {}),
    ...over,
  }
}

function mkFlowStateRepo(over: Partial<LeadFlowStateRepositoryPort> = {}): LeadFlowStateRepositoryPort {
  return {
    findActiveByCampaignLeadId: vi.fn(async () => null),
    findByCampaignLeadId: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: 'fs', campaignLeadId: 'l1', currentNodeId: 'n1', context: {}, status: 'active', lastInteractionAt: new Date(), completedAt: null })),
    save: vi.fn(async (s) => s),
    ...over,
  }
}

function mkDictRepo(over: Partial<MatcherDictionaryResolverPort> = {}): MatcherDictionaryResolverPort {
  return {
    findById: vi.fn(async () => null),
    ...over,
  }
}

function mkContactRepo(over: Partial<WhatsAppContactRepositoryPort> = {}): WhatsAppContactRepositoryPort {
  return {
    upsert: vi.fn(async () => ({ id: 'ct', waId: 'w', profileName: 'Ana' })),
    findById: vi.fn(async () => ({ id: 'ct', waId: '5212345678', profileName: 'Ana' })),
    ...over,
  }
}

function mkLeadEventsRepo(over: Partial<LeadEventsRepositoryPort> = {}): LeadEventsRepositoryPort {
  return {
    record: vi.fn(async (data) => ({ id: 'e1', createdAt: new Date('2026-01-01'), ...data }) as LeadEventData),
    listByLead: vi.fn(async () => []),
    ...over,
  }
}

const PAGE_SIZE = 50

function perms(...keys: string[]): Set<string> {
  return new Set(keys)
}

function mkSvc(over: {
  leadsRepo?: CampaignLeadRepositoryPort
  convRepo?: WhatsAppConversationRepositoryWidePort
  campaignRepo?: CampaignRepositoryPort
  execRepo?: ExecutiveRepositoryPort
  flowStates?: LeadFlowStateRepositoryPort
  dictionaries?: MatcherDictionaryResolverPort
  contacts?: WhatsAppContactRepositoryPort
  leadEvents?: LeadEventsRepositoryPort
} = {}): LeadsService {
  return new LeadsService(
    over.leadsRepo ?? mkLeadsRepo(),
    over.convRepo ?? mkConvRepo(),
    over.campaignRepo ?? mkCampaignRepo(),
    over.execRepo ?? mkExecRepo(),
    over.flowStates ?? mkFlowStateRepo(),
    over.dictionaries ?? mkDictRepo(),
    over.contacts ?? mkContactRepo(),
    over.leadEvents ?? mkLeadEventsRepo(),
    PAGE_SIZE,
  )
}

describe('LeadsService.listLeads — permisos y scope', () => {
  let svc: LeadsService
  let leadsRepo: CampaignLeadRepositoryPort
  beforeEach(() => {
    leadsRepo = mkLeadsRepo()
    svc = mkSvc({ leadsRepo })
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
    svc = mkSvc({ leadsRepo })
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

  it('descarta assignment sin leads.filter.assignment', async () => {
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', query: { assignment: 'unassigned' } })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ assignment: undefined }))
  })

  it('acepta assignment=unassigned con leads.filter.assignment', async () => {
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL, PERMISSIONS.LEADS_FILTER_ASSIGNMENT), userId: 'u1', query: { assignment: 'unassigned' } })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ assignment: 'unassigned' }))
  })

  it('acepta assignment=user:u2 con leads.filter.assignment', async () => {
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL, PERMISSIONS.LEADS_FILTER_ASSIGNMENT), userId: 'u1', query: { assignment: 'user:u2' } })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ assignment: 'user:u2' }))
  })

  it('q siempre se pasa (dentro del scope)', async () => {
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', query: { q: 'MC-1' } })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ q: 'MC-1' }))
  })
})

describe('LeadsService.listLeads — paginación y shape', () => {
  it('page default 1, 400 si page < 1', async () => {
    const leadsRepo = mkLeadsRepo()
    const svc = mkSvc({ leadsRepo })
    await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', query: {} })
    expect(leadsRepo.listLeads).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 50 }))
    await expect(svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', query: { page: 0 } })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('shape {items,page,pageSize,total,totalPages} y mapea fechas a ISO', async () => {
    const leadsRepo = mkLeadsRepo({ listLeads: vi.fn(async () => ({ items: [leadItem({ needsReply: true })], total: 60 })) })
    const svc = mkSvc({ leadsRepo })
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
    const svc = mkSvc({ leadsRepo })
    const res = await svc.listLeads({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', query: {} })
    expect(res.totalPages).toBe(0)
  })
})

describe('LeadsService.filterOptions', () => {
  it('sin leads.filter.campaign → campaigns vacío', async () => {
    const svc = mkSvc()
    const res = await svc.filterOptions({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL), userId: 'u1' })
    expect(res.campaigns).toEqual([])
  })

  it('con filter.campaign → campaigns populado', async () => {
    const svc = mkSvc()
    const res = await svc.filterOptions({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL, PERMISSIONS.LEADS_FILTER_CAMPAIGN), userId: 'u1' })
    expect(res.campaigns).toEqual([{ id: 'c1', name: 'Campaña 1' }])
  })

  it('sin leads.filter.assignment → executives vacío', async () => {
    const svc = mkSvc()
    const res = await svc.filterOptions({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL), userId: 'u1' })
    expect(res.executives).toEqual([])
  })

  it('con leads.filter.assignment → executives activos', async () => {
    const svc = mkSvc()
    const res = await svc.filterOptions({ permissions: perms(PERMISSIONS.LEADS_READ, PERMISSIONS.LEADS_READ_ALL, PERMISSIONS.LEADS_FILTER_ASSIGNMENT), userId: 'u1' })
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
    svc = mkSvc({ leadsRepo, convRepo })
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

// ── getLead ──

const textInputNode = {
  id: 'n1',
  type: 'text_input' as const,
  body: '¿Cuál es tu ciudad?',
  storeAs: 'city',
  matcher: { dictionaryId: 'dict-city' },
  transitions: {},
}
const freeTextNode = {
  id: 'n2',
  type: 'free_text' as const,
  body: 'Comentarios',
  storeAs: 'comments',
}
const buttonsNode = {
  id: 'n3',
  type: 'interactive_buttons' as const,
  body: '¿Cómo te enteraste?',
  buttons: [
    { id: 'comprar', title: 'Quiero comprar' },
    { id: 'promo', title: 'Vi una promoción' },
  ],
  transitions: {},
}

function convData(over: Partial<ConversationData> = {}): ConversationData {
  return {
    id: 'conv1', contactId: 'ct', contactWaId: '5212345678', status: 'open', leadId: 'l1',
    lastMessageAt: null, lastMessageDirection: null, needsReplyClearedAt: null, ...over,
  }
}

function flowStateData(over: Partial<LeadFlowStateData> = {}): LeadFlowStateData {
  return {
    id: 'fs1', campaignLeadId: 'l1', currentNodeId: 'n1', context: {}, status: 'active',
    lastInteractionAt: new Date('2026-01-01'), completedAt: null, ...over,
  }
}

function dictData(over: Partial<MatcherDictionaryData> = {}): MatcherDictionaryData {
  return {
    id: 'dict-city', slug: 'ciudad', name: 'Ciudad',
    categories: [
      { id: 'cat-cdmx', label: 'Ciudad de México', aliases: ['cdmx'] },
      { id: 'cat-gdl', label: 'Guadalajara', aliases: ['gdl'] },
    ],
    isSystem: false, ...over,
  }
}

describe('LeadsService.getLead', () => {
  it('sin leads.attend → 403', async () => {
    const svc = mkSvc()
    await expect(svc.getLead({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lead no existe → 404', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => null) })
    const svc = mkSvc({ leadsRepo })
    await expect(svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 404, code: 'LEAD_NOT_FOUND' })
  })

  it('sin read.all y lead asignado a otro → 404', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => leadData({ assignedExecutiveId: 'u2' })) })
    const svc = mkSvc({ leadsRepo })
    await expect(svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 404, code: 'LEAD_NOT_FOUND' })
  })

  it('Q&A con text_input → resuelve label del diccionario (cacheado)', async () => {
    const leadsRepo = mkLeadsRepo({
      findById: vi.fn(async () => leadData({
        campaign: { id: 'c1', name: 'Campaña 1', flowDefinition: { nodes: { n1: textInputNode } } },
      })),
    })
    const flowStates = mkFlowStateRepo({
      findByCampaignLeadId: vi.fn(async () => flowStateData({ context: { answers: { city: 'cat-cdmx' } } })),
    })
    const dictionaries = mkDictRepo({ findById: vi.fn(async () => dictData()) })
    const svc = mkSvc({ leadsRepo, flowStates, dictionaries })
    const res = await svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(res.answers).toEqual([{ storeAs: 'city', prompt: '¿Cuál es tu ciudad?', value: 'Ciudad de México' }])
    expect(dictionaries.findById).toHaveBeenCalledTimes(1)
    expect(dictionaries.findById).toHaveBeenCalledWith('dict-city')
  })

  it('Q&A con free_text → value = texto crudo (no llama al diccionario)', async () => {
    const leadsRepo = mkLeadsRepo({
      findById: vi.fn(async () => leadData({
        campaign: { id: 'c1', name: 'Campaña 1', flowDefinition: { nodes: { n2: freeTextNode } } },
      })),
    })
    const flowStates = mkFlowStateRepo({
      findByCampaignLeadId: vi.fn(async () => flowStateData({ context: { answers: { comments: 'Hola, me interesa' } } })),
    })
    const dictionaries = mkDictRepo({ findById: vi.fn(async () => null) })
    const svc = mkSvc({ leadsRepo, flowStates, dictionaries })
    const res = await svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(res.answers).toEqual([{ storeAs: 'comments', prompt: 'Comentarios', value: 'Hola, me interesa' }])
    expect(dictionaries.findById).not.toHaveBeenCalled()
  })

  it('Q&A con interactive_buttons → resuelve title desde el button id', async () => {
    const leadsRepo = mkLeadsRepo({
      findById: vi.fn(async () => leadData({
        campaign: { id: 'c1', name: 'Campaña 1', flowDefinition: { nodes: { n3: buttonsNode } } },
      })),
    })
    const flowStates = mkFlowStateRepo({
      findByCampaignLeadId: vi.fn(async () => flowStateData({ context: { answers: { n3: 'comprar' } } })),
    })
    const dictionaries = mkDictRepo({ findById: vi.fn(async () => null) })
    const svc = mkSvc({ leadsRepo, flowStates, dictionaries })
    const res = await svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(res.answers).toEqual([{ storeAs: 'n3', prompt: '¿Cómo te enteraste?', value: 'Quiero comprar' }])
    expect(dictionaries.findById).not.toHaveBeenCalled()
  })

  it('Q&A con interactive_buttons: button id no listado → value = replyId crudo', async () => {
    const leadsRepo = mkLeadsRepo({
      findById: vi.fn(async () => leadData({
        campaign: { id: 'c1', name: 'Campaña 1', flowDefinition: { nodes: { n3: buttonsNode } } },
      })),
    })
    const flowStates = mkFlowStateRepo({
      findByCampaignLeadId: vi.fn(async () => flowStateData({ context: { answers: { n3: 'otro' } } })),
    })
    const svc = mkSvc({ leadsRepo, flowStates })
    const res = await svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(res.answers).toEqual([{ storeAs: 'n3', prompt: '¿Cómo te enteraste?', value: 'otro' }])
  })

  it('Q&A con interactive_buttons: sin selección (answers[n3] undefined) → no aparece', async () => {
    const leadsRepo = mkLeadsRepo({
      findById: vi.fn(async () => leadData({
        campaign: { id: 'c1', name: 'Campaña 1', flowDefinition: { nodes: { n3: buttonsNode } } },
      })),
    })
    const flowStates = mkFlowStateRepo({
      findByCampaignLeadId: vi.fn(async () => flowStateData({ context: { answers: {} } })),
    })
    const svc = mkSvc({ leadsRepo, flowStates })
    const res = await svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(res.answers).toEqual([])
  })

  it('Q&A mixto: interactive_buttons + text_input ambos presentes', async () => {
    const leadsRepo = mkLeadsRepo({
      findById: vi.fn(async () => leadData({
        campaign: { id: 'c1', name: 'Campaña 1', flowDefinition: { nodes: { n1: textInputNode, n3: buttonsNode } } },
      })),
    })
    const flowStates = mkFlowStateRepo({
      findByCampaignLeadId: vi.fn(async () => flowStateData({ context: { answers: { city: 'cat-cdmx', n3: 'promo' } } })),
    })
    const dictionaries = mkDictRepo({ findById: vi.fn(async () => dictData()) })
    const svc = mkSvc({ leadsRepo, flowStates, dictionaries })
    const res = await svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(res.answers).toEqual([
      { storeAs: 'city', prompt: '¿Cuál es tu ciudad?', value: 'Ciudad de México' },
      { storeAs: 'n3', prompt: '¿Cómo te enteraste?', value: 'Vi una promoción' },
    ])
  })

  it('sin flowState → answers [] y flowState null', async () => {
    const svc = mkSvc({ flowStates: mkFlowStateRepo({ findByCampaignLeadId: vi.fn(async () => null) }) })
    const res = await svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(res.answers).toEqual([])
    expect(res.flowState).toBeNull()
  })

  it('needsReply true: inbound con lastMessageAt > needsReplyClearedAt', async () => {
    const convRepo = mkConvRepo({
      findOpenByLeadId: vi.fn(async () => convData({
        lastMessageDirection: 'inbound',
        lastMessageAt: new Date('2026-02-01'),
        needsReplyClearedAt: new Date('2026-01-01'),
      })),
    })
    const svc = mkSvc({ convRepo })
    const res = await svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(res.needsReply).toBe(true)
  })

  it('needsReply false: direction outbound', async () => {
    const convRepo = mkConvRepo({
      findOpenByLeadId: vi.fn(async () => convData({
        lastMessageDirection: 'outbound',
        lastMessageAt: new Date('2026-02-01'),
        needsReplyClearedAt: null,
      })),
    })
    const svc = mkSvc({ convRepo })
    const res = await svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(res.needsReply).toBe(false)
  })

  it('needsReply false: no hay conversación', async () => {
    const convRepo = mkConvRepo({ findOpenByLeadId: vi.fn(async () => null) })
    const svc = mkSvc({ convRepo })
    const res = await svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(res.needsReply).toBe(false)
    expect(res.conversationId).toBeNull()
  })

  it('assignedExecutive: id set → {id, fullName}', async () => {
    const execRepo = mkExecRepo({ findById: vi.fn(async () => ({ id: 'u1', fullName: 'Pepe Grillo', email: 'p@x', isActive: true, coverage: {}, lastAssignedAt: null })) })
    const svc = mkSvc({ execRepo })
    const res = await svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(res.assignedExecutive).toEqual({ id: 'u1', fullName: 'Pepe Grillo' })
  })

  it('assignedExecutive: null cuando no asignado', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => leadData({ assignedExecutiveId: null })) })
    const svc = mkSvc({ leadsRepo })
    const res = await svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(res.assignedExecutive).toBeNull()
  })

  it('retorna folio, campaignName, status, enrolledAt iso, conversationId, contact', async () => {
    const convRepo = mkConvRepo({ findOpenByLeadId: vi.fn(async () => convData({ id: 'conv-9' })) })
    const flowStates = mkFlowStateRepo({ findByCampaignLeadId: vi.fn(async () => flowStateData({ status: 'paused' })) })
    const svc = mkSvc({ convRepo, flowStates })
    const res = await svc.getLead({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(res.folio).toBe('MC-1')
    expect(res.campaignName).toBe('Campaña 1')
    expect(res.status).toBe('new')
    expect(res.enrolledAt).toBe(new Date('2026-01-01').toISOString())
    expect(res.conversationId).toBe('conv-9')
    expect(res.flowState).toBe('paused')
    expect(res.contact).toEqual({ name: 'Ana', waId: '5212345678' })
  })
})
// ── getTimeline ──

function leadEventData(over: Partial<LeadEventData> = {}): LeadEventData {
  return {
    id: 'e1', leadId: 'l1', type: 'reassignment',
    fromValue: null, toValue: 'u2', reason: 'r',
    milestoneKind: null, actorUserId: 'u1',
    createdAt: new Date('2026-03-01T10:00:00Z'),
    ...over,
  }
}

describe('LeadsService.getTimeline', () => {
  it('sin leads.attend → 403', async () => {
    const svc = mkSvc()
    await expect(svc.getTimeline({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lead no existe → 404', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => null) })
    const svc = mkSvc({ leadsRepo })
    await expect(svc.getTimeline({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 404, code: 'LEAD_NOT_FOUND' })
  })

  it('sin read.all y lead asignado a otro → 404', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => leadData({ assignedExecutiveId: 'u2' })) })
    const svc = mkSvc({ leadsRepo })
    await expect(svc.getTimeline({ permissions: perms(PERMISSIONS.LEADS_ATTEND), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 404, code: 'LEAD_NOT_FOUND' })
  })

  it('retorna eventos con createdAt en ISO', async () => {
    const leadEvents = mkLeadEventsRepo({
      listByLead: vi.fn(async () => [
        leadEventData({ id: 'e1', createdAt: new Date('2026-03-01T10:00:00Z') }),
        leadEventData({ id: 'e2', type: 'status_change', createdAt: new Date('2026-03-02T11:00:00Z') }),
      ]),
    })
    const svc = mkSvc({ leadEvents })
    const res = await svc.getTimeline({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(leadEvents.listByLead).toHaveBeenCalledWith('l1')
    expect(res).toHaveLength(2)
    expect(res[0].createdAt).toBe(new Date('2026-03-01T10:00:00Z').toISOString())
    expect(res[1].createdAt).toBe(new Date('2026-03-02T11:00:00Z').toISOString())
    expect(typeof res[0].createdAt).toBe('string')
  })
})

// ── reassign ──

describe('LeadsService.reassign', () => {
  it('sin leads.reassign → 403', async () => {
    const svc = mkSvc()
    await expect(svc.reassign({ permissions: perms(PERMISSIONS.LEADS_ATTEND), userId: 'u1', leadId: 'l1', assigneeUserId: 'u2', reason: 'r' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lead no existe → 404', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => null) })
    const svc = mkSvc({ leadsRepo })
    await expect(svc.reassign({ permissions: perms(PERMISSIONS.LEADS_REASSIGN, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1', assigneeUserId: 'u2', reason: 'r' })).rejects.toMatchObject({ statusCode: 404, code: 'LEAD_NOT_FOUND' })
  })

  it('sin read.all y lead asignado a otro → 404', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => leadData({ assignedExecutiveId: 'u2' })) })
    const svc = mkSvc({ leadsRepo })
    await expect(svc.reassign({ permissions: perms(PERMISSIONS.LEADS_REASSIGN), userId: 'u1', leadId: 'l1', assigneeUserId: 'u3', reason: 'r' })).rejects.toMatchObject({ statusCode: 404, code: 'LEAD_NOT_FOUND' })
  })

  it('reason vacío → 400 REASON_REQUIRED', async () => {
    const svc = mkSvc()
    await expect(svc.reassign({ permissions: perms(PERMISSIONS.LEADS_REASSIGN, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1', assigneeUserId: 'u2', reason: '   ' })).rejects.toMatchObject({ statusCode: 400, code: 'REASON_REQUIRED' })
  })

  it('reasigna a ejecutivo → save con nuevo assignee + assignedAt, record reassignment', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => leadData({ assignedExecutiveId: 'u2' })) })
    const leadEvents = mkLeadEventsRepo()
    const svc = mkSvc({ leadsRepo, leadEvents })
    await svc.reassign({ permissions: perms(PERMISSIONS.LEADS_REASSIGN, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1', assigneeUserId: 'u3', reason: 'cambio de ejecutivo' })
    expect(leadsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ assignedExecutiveId: 'u3', assignedAt: expect.any(Date) }))
    expect(leadEvents.record).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'l1', type: 'reassignment', fromValue: 'u2', toValue: 'u3', reason: 'cambio de ejecutivo', milestoneKind: null, actorUserId: 'u1',
    }))
  })

  it('reasigna a null (unassign) → toValue null, assignedAt null', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => leadData({ assignedExecutiveId: 'u2' })) })
    const leadEvents = mkLeadEventsRepo()
    const svc = mkSvc({ leadsRepo, leadEvents })
    await svc.reassign({ permissions: perms(PERMISSIONS.LEADS_REASSIGN, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1', assigneeUserId: null, reason: 'liberar' })
    expect(leadsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ assignedExecutiveId: null, assignedAt: null }))
    expect(leadEvents.record).toHaveBeenCalledWith(expect.objectContaining({ fromValue: 'u2', toValue: null }))
  })
})

// ── changeStatus ──

describe('LeadsService.changeStatus', () => {
  it('sin leads.change_status → 403', async () => {
    const svc = mkSvc()
    await expect(svc.changeStatus({ permissions: perms(PERMISSIONS.LEADS_ATTEND), userId: 'u1', leadId: 'l1', status: 'qualified', reason: 'r' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lead no existe → 404', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => null) })
    const svc = mkSvc({ leadsRepo })
    await expect(svc.changeStatus({ permissions: perms(PERMISSIONS.LEADS_CHANGE_STATUS, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1', status: 'qualified', reason: 'r' })).rejects.toMatchObject({ statusCode: 404, code: 'LEAD_NOT_FOUND' })
  })

  it('sin read.all y lead asignado a otro → 404', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => leadData({ assignedExecutiveId: 'u2' })) })
    const svc = mkSvc({ leadsRepo })
    await expect(svc.changeStatus({ permissions: perms(PERMISSIONS.LEADS_CHANGE_STATUS), userId: 'u1', leadId: 'l1', status: 'qualified', reason: 'r' })).rejects.toMatchObject({ statusCode: 404, code: 'LEAD_NOT_FOUND' })
  })

  it('status inválido → 400 INVALID_STATUS', async () => {
    const svc = mkSvc()
    await expect(svc.changeStatus({ permissions: perms(PERMISSIONS.LEADS_CHANGE_STATUS, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1', status: 'bogus', reason: 'r' })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_STATUS' })
  })

  it('status igual al actual → 400 SAME_STATUS', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => leadData({ status: 'qualified' })) })
    const svc = mkSvc({ leadsRepo })
    await expect(svc.changeStatus({ permissions: perms(PERMISSIONS.LEADS_CHANGE_STATUS, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1', status: 'qualified', reason: 'r' })).rejects.toMatchObject({ statusCode: 400, code: 'SAME_STATUS' })
  })

  it('reason vacío → 400 REASON_REQUIRED', async () => {
    const svc = mkSvc()
    await expect(svc.changeStatus({ permissions: perms(PERMISSIONS.LEADS_CHANGE_STATUS, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1', status: 'qualified', reason: '  ' })).rejects.toMatchObject({ statusCode: 400, code: 'REASON_REQUIRED' })
  })

  it('válido → save con nuevo status, record status_change', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => leadData({ status: 'new' })) })
    const leadEvents = mkLeadEventsRepo()
    const svc = mkSvc({ leadsRepo, leadEvents })
    await svc.changeStatus({ permissions: perms(PERMISSIONS.LEADS_CHANGE_STATUS, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1', status: 'qualified', reason: 'calificado' })
    expect(leadsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'qualified' }))
    expect(leadEvents.record).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'l1', type: 'status_change', fromValue: 'new', toValue: 'qualified', reason: 'calificado', milestoneKind: null, actorUserId: 'u1',
    }))
  })
})

// ── resumeFlow ──

describe('LeadsService.resumeFlow', () => {
  it('sin leads.attend → 403', async () => {
    const svc = mkSvc()
    await expect(svc.resumeFlow({ permissions: perms(PERMISSIONS.LEADS_READ), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lead no existe → 404', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => null) })
    const svc = mkSvc({ leadsRepo })
    await expect(svc.resumeFlow({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 404, code: 'LEAD_NOT_FOUND' })
  })

  it('sin read.all y lead asignado a otro → 404', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => leadData({ assignedExecutiveId: 'u2' })) })
    const svc = mkSvc({ leadsRepo })
    await expect(svc.resumeFlow({ permissions: perms(PERMISSIONS.LEADS_ATTEND), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 404, code: 'LEAD_NOT_FOUND' })
  })

  it('flowState active → 400 FLOW_NOT_PAUSED', async () => {
    const flowStates = mkFlowStateRepo({ findByCampaignLeadId: vi.fn(async () => flowStateData({ status: 'active' })) })
    const svc = mkSvc({ flowStates })
    await expect(svc.resumeFlow({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 400, code: 'FLOW_NOT_PAUSED' })
  })

  it('sin flowState → 400 FLOW_NOT_PAUSED', async () => {
    const flowStates = mkFlowStateRepo({ findByCampaignLeadId: vi.fn(async () => null) })
    const svc = mkSvc({ flowStates })
    await expect(svc.resumeFlow({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 400, code: 'FLOW_NOT_PAUSED' })
  })

  it('flowState paused → save con status active', async () => {
    const flowStates = mkFlowStateRepo({ findByCampaignLeadId: vi.fn(async () => flowStateData({ status: 'paused' })) })
    const svc = mkSvc({ flowStates })
    await svc.resumeFlow({ permissions: perms(PERMISSIONS.LEADS_ATTEND, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(flowStates.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }))
  })
})

// ── listExecutives ──

describe('LeadsService.listExecutives', () => {
  it('sin leads.reassign → 403', async () => {
    const svc = mkSvc()
    await expect(svc.listExecutives({ permissions: perms(PERMISSIONS.LEADS_ATTEND), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' })
  })

  it('lead no existe → 404', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => null) })
    const svc = mkSvc({ leadsRepo })
    await expect(svc.listExecutives({ permissions: perms(PERMISSIONS.LEADS_REASSIGN, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 404, code: 'LEAD_NOT_FOUND' })
  })

  it('sin read.all y lead asignado a otro → 404', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => leadData({ assignedExecutiveId: 'u2' })) })
    const execRepo = mkExecRepo()
    const svc = mkSvc({ leadsRepo, execRepo })
    await expect(svc.listExecutives({ permissions: perms(PERMISSIONS.LEADS_REASSIGN), userId: 'u1', leadId: 'l1' })).rejects.toMatchObject({ statusCode: 404, code: 'LEAD_NOT_FOUND' })
    expect(execRepo.listAvailableForCampaign).not.toHaveBeenCalled()
  })

  it('ok (read.all) → retorna lista del repo con el campaignId del lead', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => leadData({ campaignId: 'c9' })) })
    const execRepo = mkExecRepo()
    const svc = mkSvc({ leadsRepo, execRepo })
    const res = await svc.listExecutives({ permissions: perms(PERMISSIONS.LEADS_REASSIGN, PERMISSIONS.LEADS_READ_ALL), userId: 'u1', leadId: 'l1' })
    expect(execRepo.listAvailableForCampaign).toHaveBeenCalledWith('c9')
    expect(res).toEqual([
      { userId: 'u1', fullName: 'Pepe', activeLeads: 3 },
      { userId: 'u2', fullName: 'Ana', activeLeads: 1 },
    ])
    expect(typeof res[0].activeLeads).toBe('number')
  })

  it('ok (scope propio) → retorna lista cuando el lead es mío', async () => {
    const leadsRepo = mkLeadsRepo({ findById: vi.fn(async () => leadData({ assignedExecutiveId: 'u1', campaignId: 'c1' })) })
    const execRepo = mkExecRepo()
    const svc = mkSvc({ leadsRepo, execRepo })
    const res = await svc.listExecutives({ permissions: perms(PERMISSIONS.LEADS_REASSIGN), userId: 'u1', leadId: 'l1' })
    expect(execRepo.listAvailableForCampaign).toHaveBeenCalledWith('c1')
    expect(res).toHaveLength(2)
  })
})
