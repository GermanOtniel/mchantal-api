import { InMemoryRealtimeBus, type RealtimeBus } from './realtime-bus'
import { SseConnectionManager, type ScopeResolver } from './sse-connection-manager'
import { WhatsAppConversationRepository } from '../repositories/whatsapp-conversation.repository'
import { CampaignLeadRepository } from '../../leads/repositories/campaign-lead.repository'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'

let bus: RealtimeBus | null = null
let sseManager: SseConnectionManager | null = null
let scopeResolver: ScopeResolver | null = null

function getScopeResolver(): ScopeResolver {
  if (!scopeResolver) {
    const convRepo = new WhatsAppConversationRepository()
    const leadRepo = new CampaignLeadRepository()
    const convCache = new Map<string, string | null>() // conversationId -> contactId
    scopeResolver = async (userId, permissions, conversationId) => {
      if (permissions.has(PERMISSIONS.LEADS_READ_ALL)) return true
      let contactId = convCache.get(conversationId)
      if (contactId === undefined) {
        const conv = await convRepo.findById(conversationId)
        contactId = conv?.contactId ?? null
        convCache.set(conversationId, contactId)
      }
      if (!contactId) return false
      return leadRepo.existsByContactIdAndAssignee(contactId, userId)
    }
  }
  return scopeResolver
}

export function getRealtimeBus(): RealtimeBus {
  if (!bus) bus = new InMemoryRealtimeBus()
  return bus
}

export function getSseConnectionManager(): SseConnectionManager {
  if (!sseManager) {
    sseManager = new SseConnectionManager(getRealtimeBus(), getScopeResolver())
    sseManager.start()
  }
  return sseManager
}

export async function closeRealtimeInfrastructure(): Promise<void> {
  const sse = sseManager
  const busRef = bus
  sseManager = null
  bus = null
  try {
    await sse?.close()
    await busRef?.close()
  } catch {
    // best-effort shutdown; singletons already nulled
  }
}