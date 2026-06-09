import { AppDataSource } from '../../../database/data-source'
import { WhatsAppConversation } from '../../../entities/whatsapp/whatsapp-conversation.entity'

export type ConversationListItem = WhatsAppConversation & {
  contact: { waId: string; profileName: string | null }
}

export class WhatsAppConversationRepository {
  private get repo() {
    return AppDataSource.getRepository(WhatsAppConversation)
  }

  async findOpenByContactId(
    contactId: string
  ): Promise<WhatsAppConversation | null> {
    return this.repo.findOne({
      where: { contactId, status: 'open' },
      order: { createdAt: 'DESC' },
    })
  }

  async createOpen(contactId: string): Promise<WhatsAppConversation> {
    const c = this.repo.create({
      contactId,
      status: 'open',
      lastMessageAt: null,
      leadId: null,
    })
    return this.repo.save(c)
  }

  async findById(id: string): Promise<WhatsAppConversation | null> {
    return this.repo.findOne({
      where: { id },
      relations: { contact: true },
    })
  }

  async touchLastMessageAt(id: string, at: Date): Promise<void> {
    await this.repo.update({ id }, { lastMessageAt: at })
  }

  async listPaginated(
    limit: number,
    cursor?: string
  ): Promise<ConversationListItem[]> {
    const qb = this.repo
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.contact', 'contact')
      .orderBy('c.last_message_at', 'DESC', 'NULLS LAST')
      .addOrderBy('c.created_at', 'DESC')
      .take(limit)

    if (cursor) {
      qb.andWhere('c.id < :cursor', { cursor })
    }

    return qb.getMany() as Promise<ConversationListItem[]>
  }
}
