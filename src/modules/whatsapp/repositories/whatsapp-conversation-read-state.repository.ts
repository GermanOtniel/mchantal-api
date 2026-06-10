import { AppDataSource } from '../../../database/data-source'
import { WhatsAppConversationReadState } from '../../../entities/whatsapp/whatsapp-conversation-read-state.entity'

export class WhatsAppConversationReadStateRepository {
  private get repo() {
    return AppDataSource.getRepository(WhatsAppConversationReadState)
  }

  async upsertLastReadAt(
    conversationId: string,
    userId: string,
    lastReadAt: Date
  ): Promise<void> {
    await this.repo.upsert(
      { conversationId, userId, lastReadAt },
      { conflictPaths: ['conversationId', 'userId'] }
    )
  }
}
