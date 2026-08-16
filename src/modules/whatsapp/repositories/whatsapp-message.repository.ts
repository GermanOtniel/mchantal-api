import { AppDataSource } from '../../../database/data-source'
import { WhatsAppMessage } from '../../../entities/whatsapp/whatsapp-message.entity'
import type {
  MessageCreateData,
  MessageData,
  WhatsAppMessageRepositoryWidePort,
} from '../../leads/types/leads.types'

function toData(m: WhatsAppMessage): MessageData {
  return {
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction,
    providerMessageId: m.providerMessageId,
    type: m.type,
    bodyText: m.bodyText,
    status: m.status,
    metadata: m.metadata,
    sentAt: m.sentAt,
  }
}

export class WhatsAppMessageRepository implements WhatsAppMessageRepositoryWidePort {
  private get repo() {
    return AppDataSource.getRepository(WhatsAppMessage)
  }

  async create(data: MessageCreateData): Promise<WhatsAppMessage> {
    return this.repo.save(
      this.repo.create({
        conversationId: data.conversationId,
        direction: data.direction,
        providerMessageId: data.providerMessageId,
        type: data.type,
        bodyText: data.bodyText,
        status: data.status,
        sentAt: data.sentAt,
        metadata: data.metadata,
      })
    )
  }

  async findByProviderMessageId(providerMessageId: string): Promise<MessageData | null> {
    const m = await this.repo.findOne({ where: { providerMessageId } })
    return m ? toData(m) : null
  }

  async updateStatus(providerMessageId: string, status: string): Promise<void> {
    await this.repo.update({ providerMessageId }, { status })
  }

  async updateStatusAndMetadata(
    providerMessageId: string,
    status: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const entity = await this.repo.findOne({ where: { providerMessageId } })
    if (!entity) return
    entity.status = status
    entity.metadata = metadata
    await this.repo.save(entity)
  }
}