import { AppDataSource } from '../../../database/data-source'
import { WhatsAppContact } from '../../../entities/whatsapp/whatsapp-contact.entity'
import type { ContactData, WhatsAppContactRepositoryPort } from '../../leads/types/leads.types'

export class WhatsAppContactRepository implements WhatsAppContactRepositoryPort {
  private get repo() {
    return AppDataSource.getRepository(WhatsAppContact)
  }

  async upsert(waId: string, profileName?: string | null): Promise<ContactData> {
    let contact = await this.repo.findOne({ where: { waId } })
    if (contact) {
      const newName = profileName ?? null
      if (contact.profileName !== newName) {
        contact.profileName = newName
        await this.repo.save(contact)
      }
    } else {
      contact = this.repo.create({ waId, profileName: profileName ?? null })
      contact = await this.repo.save(contact)
    }
    return { id: contact.id, waId: contact.waId, profileName: contact.profileName }
  }
}