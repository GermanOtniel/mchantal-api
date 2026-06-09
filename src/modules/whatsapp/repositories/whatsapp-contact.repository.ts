import { AppDataSource } from '../../../database/data-source'
import { WhatsAppContact } from '../../../entities/whatsapp/whatsapp-contact.entity'

export class WhatsAppContactRepository {
  private get repo() {
    return AppDataSource.getRepository(WhatsAppContact)
  }

  async findByWaId(waId: string): Promise<WhatsAppContact | null> {
    return this.repo.findOne({ where: { waId } })
  }

  async upsert(waId: string, profileName?: string): Promise<WhatsAppContact> {
    const existing = await this.findByWaId(waId)
    if (existing) {
      if (profileName && existing.profileName !== profileName) {
        existing.profileName = profileName
        return this.repo.save(existing)
      }
      return existing
    }

    const contact = this.repo.create({
      waId,
      profileName: profileName ?? null,
    })
    return this.repo.save(contact)
  }
}
