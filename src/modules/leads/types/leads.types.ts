import type { FlowDefinition } from '../../campaigns/types/flow.types'
import type { NormalizedMessage } from '../../../shared/whatsapp/types/inbound.types'
import type { LeadEventType } from '../../../entities/leads/lead-event.entity'

export type { LeadEventType }
import type { AssignmentDirective, AssignmentResult, LeadAssignmentContext } from '../../executives/types/assignment.types'
import type { MatcherDictionaryData } from '../../matcher-dictionaries/types/dictionary.types'
import type { RealtimeBus } from '../../whatsapp/realtime/realtime-bus'

export const LEAD_STATUSES = ['new', 'in_progress', 'on_hold', 'qualified', 'disqualified'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]
export const LEAD_STATUS_DEFAULT: LeadStatus = 'new'

export type LeadCaptureData = {
  id: string
  folio: string
  campaignId: string
  campaign: { id: string; flowDefinition: FlowDefinition }
  status: 'pending' | 'matched' | 'expired'
  campaignLeadId?: string | null
}

export type CampaignLeadContext = {
  folio?: string
  answers: Record<string, string>
} & Record<string, unknown>

export type CampaignLeadData = {
  id: string
  contactId: string
  campaignId: string
  campaign: { id: string; name: string; flowDefinition: FlowDefinition }
  context: CampaignLeadContext
  assignmentMode?: 'executive' | 'pool' | 'manual' | null
  assignedExecutiveId?: string | null
  assignedAt?: Date | null
  status: string
  enrolledAt: Date
}

export type LeadFlowStateData = {
  id: string
  campaignLeadId: string
  currentNodeId: string
  context: Record<string, unknown>
  status: 'active' | 'paused' | 'completed'
  lastInteractionAt: Date
  completedAt?: Date | null
}

export type ConversationData = {
  id: string
  contactId: string
  contactWaId: string
  status: 'open' | 'closed'
  leadId: string | null
  lastMessageAt: Date | null
  lastMessageDirection: 'inbound' | 'outbound' | null
  needsReplyClearedAt: Date | null
}

export type MessageCreateData = {
  conversationId: string
  direction: 'inbound' | 'outbound'
  providerMessageId: string
  type: string
  bodyText: string | null
  status: string
  sentAt: Date
  metadata: Record<string, unknown>
}

export type CreateCampaignLeadData = {
  contactId: string
  campaignId: string
  context: CampaignLeadContext
}

export type CreateFlowStateData = {
  campaignLeadId: string
  currentNodeId: string
  context: Record<string, unknown>
  status: 'active' | 'paused' | 'completed'
  lastInteractionAt: Date
}

export interface LeadCaptureRepositoryPort {
  findPendingByFolio(folio: string): Promise<LeadCaptureData | null>
  markMatched(captureId: string, leadId: string): Promise<void>
}

export interface CampaignLeadRepositoryPort {
  findByContactAndCampaign(
    contactId: string,
    campaignId: string
  ): Promise<CampaignLeadData | null>
  create(data: CreateCampaignLeadData): Promise<CampaignLeadData>
  findById(id: string): Promise<CampaignLeadData | null>
  save(lead: CampaignLeadData): Promise<CampaignLeadData>
  listAll(): Promise<LeadListItem[]>
  listLeads(params: ListLeadsRepoParams): Promise<LeadsRepoPage>
}

export type LeadListItem = {
  id: string
  folio: string | null
  campaignId: string
  campaignName: string
  contactWaId: string
  contactName: string | null
  answers: Record<string, string>
  assignmentMode: 'executive' | 'pool' | 'manual' | null
  assignedExecutiveId: string | null
  assignedExecutiveName: string | null
  assignedAt: Date | null
  enrolledAt: Date
  status: string
  needsReply: boolean
}

export type ListLeadsRepoParams = {
  scopeUserId: string | null
  campaignId?: string
  status?: string
  assignment?: string
  q?: string
  page: number
  pageSize: number
}

export type LeadsRepoPage = { items: LeadListItem[]; total: number }

export interface LeadFlowStateRepositoryPort {
  findActiveByCampaignLeadId(campaignLeadId: string): Promise<LeadFlowStateData | null>
  findByCampaignLeadId(campaignLeadId: string): Promise<LeadFlowStateData | null>
  create(data: CreateFlowStateData): Promise<LeadFlowStateData>
  save(state: LeadFlowStateData): Promise<LeadFlowStateData>
}

export interface WhatsAppConversationRepositoryPort {
  findById(id: string): Promise<ConversationData | null>
  setLead(conversationId: string, leadId: string): Promise<void>
  touchLastMessage(id: string, at: Date, direction: 'inbound' | 'outbound'): Promise<void>
}

export interface WhatsAppMessageRepositoryPort {
  create(data: MessageCreateData): Promise<MessageData>
}

export interface MatcherDictionaryResolverPort {
  findById(id: string): Promise<MatcherDictionaryData | null>
}

export interface AssignmentResolverPort {
  resolve(directive: AssignmentDirective, leadContext: LeadAssignmentContext): Promise<AssignmentResult>
}

export type FlowEngineDeps = {
  captures: LeadCaptureRepositoryPort
  campaignLeads: CampaignLeadRepositoryPort
  flowStates: LeadFlowStateRepositoryPort
  conversations: WhatsAppConversationRepositoryPort
  messages: WhatsAppMessageRepositoryPort
  dictionaries: MatcherDictionaryResolverPort
  assignment: AssignmentResolverPort
  leadEvents?: LeadEventsRepositoryPort
  realtimeBus?: RealtimeBus
}

export type InboundFlowContext = {
  conversationId: string
  contactId: string
  waId: string
  message: NormalizedMessage
}

// ── Puertos anchos (para ConversationService: dedupe, upsert contacto, status) ──

export type ContactData = { id: string; waId: string; profileName: string | null }

export interface WhatsAppContactRepositoryPort {
  upsert(waId: string, profileName?: string | null): Promise<ContactData>
  findById(contactId: string): Promise<ContactData | null>
}

export interface WhatsAppConversationRepositoryWidePort
  extends WhatsAppConversationRepositoryPort {
  findOpenByContactId(contactId: string): Promise<ConversationData | null>
  findOpenByLeadId(leadId: string): Promise<ConversationData | null>
  createOpen(contactId: string): Promise<ConversationData>
  clearNeedsReplyByLeadId(leadId: string): Promise<boolean>
  clearNeedsReplyByContactId(contactId: string): Promise<boolean>
}

export type MessageData = {
  id: string
  conversationId: string
  direction: 'inbound' | 'outbound'
  providerMessageId: string
  type: string
  bodyText: string | null
  status: string
  metadata: Record<string, unknown>
  sentAt: Date
}

export interface WhatsAppMessageRepositoryWidePort
  extends WhatsAppMessageRepositoryPort {
  findByProviderMessageId(providerMessageId: string): Promise<MessageData | null>
  updateStatus(providerMessageId: string, status: string): Promise<void>
  updateStatusAndMetadata(
    providerMessageId: string,
    status: string,
    metadata: Record<string, unknown>
  ): Promise<void>
  listByConversation(
    conversationId: string,
    limit: number,
    cursor?: string
  ): Promise<MessageData[]>
  countInboundByConversation(conversationId: string): Promise<number>
}

export type ListLeadsQuery = {
  page?: number
  campaignId?: string
  status?: string
  assignment?: string
  q?: string
}

export type LeadItemResponse = {
  id: string
  folio: string | null
  campaignId: string
  campaignName: string
  contactWaId: string
  contactName: string | null
  answers: Record<string, string>
  assignmentMode: 'executive' | 'pool' | 'manual' | null
  assignedExecutiveId: string | null
  assignedExecutiveName: string | null
  assignedAt: string | null
  enrolledAt: string
  status: string
  needsReply: boolean
}

export type LeadsPageResponse = {
  items: LeadItemResponse[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type LeadFilterOptions = {
  campaigns: { id: string; name: string }[]
  executives: { id: string; fullName: string }[]
}

export type LeadQAItem = { storeAs: string; prompt: string; value: string }

export type LeadDetailResponse = {
  id: string
  folio: string | null
  campaignId: string
  campaignName: string
  contact: { name: string | null; waId: string }
  status: string
  assignedExecutive: { id: string; fullName: string } | null
  needsReply: boolean
  enrolledAt: string
  flowState: 'active' | 'paused' | 'completed' | null
  conversationId: string | null
  answers: LeadQAItem[]
}

export type LeadEventData = {
  id: string
  leadId: string
  type: LeadEventType
  fromValue: string | null
  toValue: string | null
  reason: string | null
  milestoneKind: string | null
  actorUserId: string | null
  createdAt: Date
}

export type LeadEventResponse = {
  id: string
  leadId: string
  type: LeadEventType
  fromValue: string | null
  toValue: string | null
  reason: string | null
  milestoneKind: string | null
  actorUserId: string | null
  createdAt: string
}

export interface LeadEventsRepositoryPort {
  record(data: Omit<LeadEventData, 'id' | 'createdAt'> & { createdAt?: Date }): Promise<LeadEventData>
  listByLead(leadId: string): Promise<LeadEventData[]>
}
