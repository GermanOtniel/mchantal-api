import { AppDataSource } from '../../../database/data-source'
import {
  WhatsAppMessage,
  type MessageDeliveryStatus,
  type MessageDirection,
} from '../../../entities/whatsapp/whatsapp-message.entity'

export type CreateMessageData = {
  conversationId: string
  direction: MessageDirection
  providerMessageId: string
  type: string
  bodyText: string | null
  mediaAssetId?: string | null
  status: MessageDeliveryStatus
  sentAt: Date
}

export class WhatsAppMessageRepository {
  private get repo() {
    return AppDataSource.getRepository(WhatsAppMessage)
  }

  async findByProviderMessageId(
    providerMessageId: string
  ): Promise<WhatsAppMessage | null> {
    return this.repo.findOne({ where: { providerMessageId } })
  }

  async create(data: CreateMessageData): Promise<WhatsAppMessage> {
    const msg = this.repo.create({
      conversationId: data.conversationId,
      direction: data.direction,
      providerMessageId: data.providerMessageId,
      type: data.type,
      bodyText: data.bodyText,
      mediaAssetId: data.mediaAssetId ?? null,
      status: data.status,
      sentAt: data.sentAt,
    })
    return this.repo.save(msg)
  }

  async updateStatus(
    providerMessageId: string,
    status: MessageDeliveryStatus
  ): Promise<boolean> {
    const result = await this.repo.update({ providerMessageId }, { status })
    return (result.affected ?? 0) > 0
  }

  async listByConversation(
    conversationId: string,
    limit: number,
    cursor?: string
  ): Promise<WhatsAppMessage[]> {
    const qb = this.repo
      .createQueryBuilder('m')
      .where('m.conversationId = :conversationId', { conversationId })
      .orderBy('m.sentAt', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .take(limit)

    if (cursor) {
      qb.andWhere('m.id < :cursor', { cursor })
    }

    return qb.getMany()
  }
}
