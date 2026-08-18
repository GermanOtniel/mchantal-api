import { AppDataSource } from '../../../database/data-source'
import { WhatsAppConversation } from '../../../entities/whatsapp/whatsapp-conversation.entity'
import type {
  ConversationData,
  WhatsAppConversationRepositoryWidePort,
} from '../../leads/types/leads.types'

function toData(c: WhatsAppConversation): ConversationData {
  return { id: c.id, contactId: c.contactId, status: c.status, leadId: c.leadId }
}

export class WhatsAppConversationRepository
  implements WhatsAppConversationRepositoryWidePort
{
  private get repo() {
    return AppDataSource.getRepository(WhatsAppConversation)
  }

  async findById(id: string): Promise<ConversationData | null> {
    const c = await this.repo.findOne({ where: { id } })
    return c ? toData(c) : null
  }

  async setLead(conversationId: string, leadId: string): Promise<void> {
    await this.repo.update({ id: conversationId }, { leadId })
  }

  async findOpenByContactId(contactId: string): Promise<ConversationData | null> {
    const c = await this.repo.findOne({
      where: { contactId, status: 'open' },
      order: { createdAt: 'DESC' },
    })
    return c ? toData(c) : null
  }

  async createOpen(contactId: string): Promise<ConversationData> {
    const c = await this.repo.save(this.repo.create({ contactId, status: 'open' }))
    return toData(c)
  }

  async touchLastMessage(id: string, at: Date, direction: 'inbound' | 'outbound'): Promise<void> {
    await this.repo.update({ id }, { lastMessageAt: at, lastMessageDirection: direction })
  }
}