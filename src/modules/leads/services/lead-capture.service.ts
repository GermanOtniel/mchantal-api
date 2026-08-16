import { HttpError } from '../../auth/http-error'
import { generateFolio as defaultGenerateFolio } from './folio.service'

export type LeadCaptureServiceDeps = {
  campaigns: { findBySlug(slug: string): Promise<{ id: string; entryMessage: string } | null> }
  captures: {
    create(data: { folio: string; campaignId: string; status: 'pending' }): Promise<unknown>
  }
  businessPhoneNumberE164: string
  generateFolio?: () => string
}

function interpolateEntryMessage(template: string, folio: string): string {
  return template.replace(/\{\{folio\}\}/g, folio)
}

function buildWaMeUrl(phoneE164: string, message: string): string {
  const digits = phoneE164.replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

export class LeadCaptureService {
  constructor(private readonly deps: LeadCaptureServiceDeps) {}

  async createCapture(slug: string): Promise<{ folio: string; redirectUrl: string }> {
    const campaign = await this.deps.campaigns.findBySlug(slug)
    if (!campaign) {
      throw new HttpError('Campaña no encontrada', 404, 'CAMPAIGN_NOT_FOUND')
    }

    const generateFolio = this.deps.generateFolio ?? defaultGenerateFolio
    const folio = generateFolio()
    await this.deps.captures.create({ folio, campaignId: campaign.id, status: 'pending' })

    const message = interpolateEntryMessage(campaign.entryMessage, folio)
    const redirectUrl = buildWaMeUrl(this.deps.businessPhoneNumberE164, message)
    return { folio, redirectUrl }
  }
}