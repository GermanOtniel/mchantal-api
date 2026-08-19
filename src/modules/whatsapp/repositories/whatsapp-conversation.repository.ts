import { AppDataSource } from '../../../database/data-source'
import { WhatsAppConversation } from '../../../entities/whatsapp/whatsapp-conversation.entity'
import type {
  ConversationData,
  WhatsAppConversationRepositoryWidePort,
} from '../../leads/types/leads.types'

function toData(c: WhatsAppConversation): ConversationData {
  return {
    id: c.id,
    contactId: c.contactId,
    contactWaId: '',
    status: c.status,
    leadId: c.leadId,
    lastMessageAt: c.lastMessageAt,
    lastMessageDirection: c.lastMessageDirection,
    needsReplyClearedAt: c.needsReplyClearedAt,
  }
}

export class WhatsAppConversationRepository
  implements WhatsAppConversationRepositoryWidePort
{
  private get repo() {
    return AppDataSource.getRepository(WhatsAppConversation)
  }

  async findById(id: string): Promise<ConversationData | null> {
    const c = await this.repo.findOne({
      where: { id },
      relations: ['contact'],
    })
    if (!c) return null
    return {
      id: c.id,
      contactId: c.contactId,
      contactWaId: c.contact?.waId ?? '',
      status: c.status,
      leadId: c.leadId,
      lastMessageAt: c.lastMessageAt,
      lastMessageDirection: c.lastMessageDirection,
      needsReplyClearedAt: c.needsReplyClearedAt,
    }
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

  async clearNeedsReplyByLeadId(leadId: string): Promise<boolean> {
    const res = await this.repo.update(
      { leadId, status: 'open' },
      { needsReplyClearedAt: new Date() }
    )
    return (res.affected ?? 0) > 0
  }
}