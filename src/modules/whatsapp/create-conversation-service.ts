import { ConversationService } from './services/conversation.service'
import { getRealtimeBus } from './realtime'

let instance: ConversationService | null = null

export function getConversationService(): ConversationService {
  if (!instance) {
    instance = new ConversationService(getRealtimeBus())
  }
  return instance
}
