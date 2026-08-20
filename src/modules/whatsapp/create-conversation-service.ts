import { ConversationService } from './services/conversation.service'
import { getRealtimeBus } from './realtime'
import { WhatsAppContactRepository } from './repositories/whatsapp-contact.repository'
import { WhatsAppConversationRepository } from './repositories/whatsapp-conversation.repository'
import { WhatsAppMessageRepository } from './repositories/whatsapp-message.repository'
import { FlowEngine } from '../leads/services/flow-engine'
import { CampaignLeadRepository } from '../leads/repositories/campaign-lead.repository'
import { LeadCaptureRepository } from '../leads/repositories/lead-capture.repository'
import { LeadFlowStateRepository } from '../leads/repositories/lead-flow-state.repository'
import { LeadEventsRepository } from '../leads/repositories/lead-event.repository'
import { MatcherDictionaryRepository } from '../matcher-dictionaries/repositories/matcher-dictionary.repository'
import { AssignmentService } from '../executives/services/assignment.service'
import { ExecutiveRepository } from '../executives/repositories/executive.repository'

let instance: ConversationService | null = null

/**
 * Singleton de ConversationService compartido entre el webhook inbound
 * y los futuros endpoints SSE/send. Garantiza que ambos caminos publiquen
 * y consuman sobre el mismo RealtimeBus (instancia singleton).
 */
export function getConversationService(): ConversationService {
  if (!instance) {
    const captures = new LeadCaptureRepository()
    const campaignLeads = new CampaignLeadRepository()
    const flowStates = new LeadFlowStateRepository()
    const conversations = new WhatsAppConversationRepository()
    const messages = new WhatsAppMessageRepository()
    const contacts = new WhatsAppContactRepository()
    const dictionaries = new MatcherDictionaryRepository()
    const assignment = new AssignmentService(new ExecutiveRepository())
    const flowEngine = new FlowEngine({
      captures,
      campaignLeads,
      flowStates,
      conversations,
      messages,
      dictionaries,
      assignment,
      leadEvents: new LeadEventsRepository(),
      realtimeBus: getRealtimeBus(),
    })
    instance = new ConversationService({
      contacts,
      conversations,
      messages,
      campaignLeads,
      flowStates,
      leadEvents: new LeadEventsRepository(),
      flowEngine,
      realtimeBus: getRealtimeBus(),
    })
  }
  return instance
}

/**
 * Resetea el singleton de ConversationService. Útil para tests de
 * integración/SSE que necesitan un RealtimeBus fresco entre archivos.
 */
export function resetConversationService(): void {
  instance = null
}
