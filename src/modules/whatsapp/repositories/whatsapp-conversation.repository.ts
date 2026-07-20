import { AppDataSource } from '../../../database/data-source'
import type { MessageDirection } from '../../../entities/whatsapp/whatsapp-message.entity'
import { WhatsAppConversation } from '../../../entities/whatsapp/whatsapp-conversation.entity'

export type ConversationListItem = WhatsAppConversation & {
  contact: { waId: string; profileName: string | null }
  unreadCount: number
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
      lastMessageDirection: null,
      leadId: null,
    })
    return this.repo.save(c)
  }

  async findById(id: string): Promise<WhatsAppConversation | null> {
    return this.repo.findOne({
      where: { id },
      relations: { contact: true, assignee: true },
    })
  }

  async touchLastMessage(
    id: string,
    at: Date,
    direction: MessageDirection
  ): Promise<void> {
    await this.repo.update(
      { id },
      { lastMessageAt: at, lastMessageDirection: direction }
    )
  }

  async setLeadAndAssignee(
    conversationId: string,
    leadId: string | null,
    assigneeUserId: string | null
  ): Promise<void> {
    await this.repo.update(
      { id: conversationId },
      { leadId, assigneeUserId }
    )
  }

  async listPaginatedForViewer(
    limit: number,
    viewerUserId: string,
    cursor?: string,
    assigneeUserId?: string
  ): Promise<ConversationListItem[]> {
    const qb = this.repo
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.contact', 'contact')
      .leftJoinAndSelect('c.assignee', 'assignee')
      .leftJoin(
        'whatsapp_conversation_read_states',
        'rs',
        'rs.conversation_id = c.id AND rs.user_id = :viewerUserId',
        { viewerUserId }
      )
      .addSelect(
        `COALESCE((
          SELECT COUNT(*)::int
          FROM whatsapp_messages m
          WHERE m.conversation_id = c.id
            AND m.direction = 'inbound'
            AND m.sent_at > COALESCE(rs.last_read_at, '-infinity'::timestamptz)
        ), 0)`,
        'unreadCount'
      )
      .orderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('c.createdAt', 'DESC')
      .take(limit)

    if (assigneeUserId) {
      qb.andWhere('c.assignee_user_id = :assigneeUserId', { assigneeUserId })
    }

    if (cursor) {
      qb.andWhere('c.id < :cursor', { cursor })
    }

    const { entities, raw } = await qb.getRawAndEntities()

    return entities.map((entity, index) => ({
      ...entity,
      unreadCount: Number(raw[index]?.unreadCount ?? 0),
    })) as ConversationListItem[]
  }
}
