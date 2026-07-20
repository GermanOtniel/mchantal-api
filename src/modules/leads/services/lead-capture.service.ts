import { getEnv } from '../../../config/env'
import { HttpError } from '../../auth/http-error'
import { CampaignRepository } from '../repositories/campaign.repository'
import { LeadCaptureRepository } from '../repositories/lead-capture.repository'
import {
  buildWhatsAppRedirectUrl,
  evaluateEntryRules,
  validateCaptureParams,
} from './entry-rules.evaluator'
import { generateFolio } from './folio.service'
import type {
  CampaignEntryRule,
  CampaignParamDefinition,
} from '../types/campaign-config.types'

const MAX_FOLIO_RETRIES = 5

export class LeadCaptureService {
  constructor(
    private readonly campaigns = new CampaignRepository(),
    private readonly captures = new LeadCaptureRepository()
  ) {}

  async createPublicCapture(input: {
    campaignSlug: string
    params: Record<string, string>
  }) {
    const campaign = await this.campaigns.findActiveBySlug(input.campaignSlug)
    if (!campaign) {
      throw new HttpError('Campaign not found or inactive', 404, 'CAMPAIGN_NOT_ACTIVE')
    }

    const paramDefinitions = (campaign.paramDefinitions ??
      []) as CampaignParamDefinition[]
    const entryRules = (campaign.entryRules ?? []) as CampaignEntryRule[]

    let capturedParams: Record<string, string>
    try {
      capturedParams = validateCaptureParams(input.params, paramDefinitions)
    } catch (error) {
      throw new HttpError(
        error instanceof Error ? error.message : 'Invalid capture params',
        400,
        'INVALID_CAPTURE_PARAMS'
      )
    }

    const folio = await this.generateUniqueFolio()
    const evaluated = evaluateEntryRules(entryRules, capturedParams, folio)

    const env = getEnv()
    if (!env.whatsappBusinessPhone) {
      throw new HttpError(
        'WhatsApp business phone is not configured',
        503,
        'WHATSAPP_PHONE_NOT_CONFIGURED'
      )
    }

    const capture = await this.captures.create({
      folio,
      campaignId: campaign.id,
      capturedParams,
      resolvedIntent: evaluated.resolvedIntent,
      resolvedMessage: evaluated.messageTemplate,
      entryNodeId: evaluated.entryNodeId,
      initialContext: evaluated.initialContext,
      status: 'pending',
    })

    const redirectUrl = buildWhatsAppRedirectUrl(
      env.whatsappBusinessPhone,
      evaluated.messageTemplate
    )

    return {
      folio: capture.folio,
      redirectUrl,
      campaignId: campaign.id,
      campaignSlug: campaign.slug,
    }
  }

  listCaptures(params: { campaignId?: string; status?: string; limit?: number }) {
    return this.captures.list(params)
  }

  private async generateUniqueFolio(): Promise<string> {
    for (let attempt = 0; attempt < MAX_FOLIO_RETRIES; attempt++) {
      const folio = generateFolio()
      const exists = await this.captures.folioExists(folio)
      if (!exists) return folio
    }
    throw new HttpError('Could not generate unique folio', 500, 'FOLIO_GENERATION_FAILED')
  }
}
