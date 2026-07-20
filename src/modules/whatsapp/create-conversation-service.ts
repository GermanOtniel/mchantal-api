import { ConversationService } from './services/conversation.service'
import { getRealtimeBus } from './realtime'
import { getLeadFlowEngine } from '../leads/create-lead-flow-engine'

let instance: ConversationService | null = null

export function getConversationService(): ConversationService {
  if (!instance) {
    instance = new ConversationService(getRealtimeBus(), getLeadFlowEngine())
  }
  return instance
}
