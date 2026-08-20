import { HttpError } from '../../auth/http-error'
import { generateFolio as defaultGenerateFolio } from './folio.service'

export type LeadCaptureServiceDeps = {
  campaigns: {
    findBySlug(slug: string): Promise<{ id: string; entryMessage: string; origins: string[] } | null>
  }
  captures: {
    create(data: { folio: string; campaignId: string; status: 'pending'; origin: string }): Promise<unknown>
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

/**
 * Normalización A1 (allowlist suave): el origen nunca bloquea la captura.
 * - origin presente y en la lista de la campaña → se guarda tal cual viene.
 * - ausente, vacío, o fuera de la lista → 'unknown'.
 * La comparación es case-insensitive; se guarda el valor que vino en la URL.
 */
function normalizeOrigin(origin: string | undefined, allowed: string[]): string {
  const value = origin?.trim()
  if (!value) return 'unknown'
  return allowed.some((a) => a.toLowerCase() === value.toLowerCase()) ? value : 'unknown'
}

export class LeadCaptureService {
  constructor(private readonly deps: LeadCaptureServiceDeps) {}

  async createCapture(
    slug: string,
    origin?: string
  ): Promise<{ folio: string; redirectUrl: string }> {
    const campaign = await this.deps.campaigns.findBySlug(slug)
    if (!campaign) {
      throw new HttpError('Campaña no encontrada', 404, 'CAMPAIGN_NOT_FOUND')
    }

    const generateFolio = this.deps.generateFolio ?? defaultGenerateFolio
    const folio = generateFolio()
    const normalizedOrigin = normalizeOrigin(origin, campaign.origins)
    await this.deps.captures.create({
      folio,
      campaignId: campaign.id,
      status: 'pending',
      origin: normalizedOrigin,
    })

    const message = interpolateEntryMessage(campaign.entryMessage, folio)
    const redirectUrl = buildWaMeUrl(this.deps.businessPhoneNumberE164, message)
    return { folio, redirectUrl }
  }
}