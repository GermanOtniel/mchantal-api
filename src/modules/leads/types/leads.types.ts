import type { FlowDefinition } from '../../campaigns/types/flow.types'
import type { NormalizedMessage } from '../../../shared/whatsapp/types/inbound.types'

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
  campaign: { id: string; flowDefinition: FlowDefinition }
  context: CampaignLeadContext
}

export type LeadFlowStateData = {
  id: string
  campaignLeadId: string
  currentNodeId: string
  context: Record<string, unknown>
  status: 'active' | 'completed'
  lastInteractionAt: Date
  completedAt?: Date | null
}

export type ConversationData = {
  id: string
  contactId: string
  status: 'open' | 'closed'
  leadId: string | null
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
  status: 'active' | 'completed'
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
}

export interface LeadFlowStateRepositoryPort {
  findActiveByCampaignLeadId(campaignLeadId: string): Promise<LeadFlowStateData | null>
  findByCampaignLeadId(campaignLeadId: string): Promise<LeadFlowStateData | null>
  create(data: CreateFlowStateData): Promise<LeadFlowStateData>
  save(state: LeadFlowStateData): Promise<LeadFlowStateData>
}

export interface WhatsAppConversationRepositoryPort {
  findById(id: string): Promise<ConversationData | null>
  setLead(conversationId: string, leadId: string): Promise<void>
}

export interface WhatsAppMessageRepositoryPort {
  create(data: MessageCreateData): Promise<unknown>
}

export type FlowEngineDeps = {
  captures: LeadCaptureRepositoryPort
  campaignLeads: CampaignLeadRepositoryPort
  flowStates: LeadFlowStateRepositoryPort
  conversations: WhatsAppConversationRepositoryPort
  messages: WhatsAppMessageRepositoryPort
}

export type InboundFlowContext = {
  conversationId: string
  contactId: string
  waId: string
  message: NormalizedMessage
}