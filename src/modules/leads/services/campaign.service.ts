import { HttpError } from '../../auth/http-error'
import type { Campaign } from '../../../entities/leads/campaign.entity'
import { CampaignRepository } from '../repositories/campaign.repository'
import type {
  CampaignEntryRule,
  CampaignParamDefinition,
} from '../types/campaign-config.types'
import { withDefaultOriginParam } from '../types/campaign-config.types'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export class CampaignService {
  constructor(private readonly campaigns = new CampaignRepository()) {}

  listCampaigns() {
    return this.campaigns.listAll()
  }

  async getCampaign(id: string) {
    const campaign = await this.campaigns.findById(id)
    if (!campaign) {
      throw new HttpError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND')
    }
    return campaign
  }

  async createCampaign(input: {
    name: string
    slug?: string
    status?: Campaign['status']
    paramDefinitions?: CampaignParamDefinition[]
    entryRules?: CampaignEntryRule[]
    flowDefinition?: Record<string, unknown>
    statusDefinitions?: unknown[]
  }) {
    const slug = slugify(input.slug ?? input.name)
    if (!slug) {
      throw new HttpError('Invalid campaign slug', 400, 'INVALID_CAMPAIGN_SLUG')
    }
    if (await this.campaigns.slugExists(slug)) {
      throw new HttpError('Campaign slug already exists', 409, 'CAMPAIGN_SLUG_EXISTS')
    }

    return this.campaigns.create({
      name: input.name.trim(),
      slug,
      status: input.status ?? 'draft',
      paramDefinitions: withDefaultOriginParam(input.paramDefinitions ?? []),
      entryRules: input.entryRules ?? [],
      flowDefinition: input.flowDefinition ?? {
        nodes: {
          welcome: {
            id: 'welcome',
            type: 'interactive_buttons',
            body: 'Hola {{folio}} 👋\n¿En qué te podemos ayudar?',
            buttons: [
              { id: 'compra', title: 'Quiero comprar' },
              { id: 'info', title: 'Solo información' },
            ],
            transitions: { compra: 'assign_default', info: 'assign_default' },
            onFreeText: 'reprompt',
          },
          assign_default: {
            id: 'assign_default',
            type: 'assign_executive',
            ruleSetKey: 'default',
            messageAfterAssign:
              'Gracias por tu interés. Un ejecutivo te atenderá en breve.',
          },
        },
      },
      statusDefinitions: input.statusDefinitions ?? [
        { key: 'nuevo', label: 'Nuevo', isInitial: true, sortOrder: 1 },
        { key: 'calificando', label: 'En calificación', sortOrder: 2 },
        { key: 'asignado', label: 'Asignado', sortOrder: 3 },
        {
          key: 'cerrado_ganado',
          label: 'Cerrado — Ganado',
          isTerminal: true,
          isSuccess: true,
          sortOrder: 4,
        },
      ],
    })
  }

  async updateCampaign(
    id: string,
    input: Partial<{
      name: string
      slug: string
      status: Campaign['status']
      paramDefinitions: CampaignParamDefinition[]
      entryRules: CampaignEntryRule[]
      flowDefinition: Record<string, unknown>
      statusDefinitions: unknown[]
    }>
  ) {
    const existing = await this.getCampaign(id)
    const nextSlug = input.slug ? slugify(input.slug) : undefined

    if (nextSlug && nextSlug !== existing.slug) {
      if (await this.campaigns.slugExists(nextSlug, id)) {
        throw new HttpError('Campaign slug already exists', 409, 'CAMPAIGN_SLUG_EXISTS')
      }
    }

    const updated = await this.campaigns.update(id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.paramDefinitions !== undefined
        ? { paramDefinitions: withDefaultOriginParam(input.paramDefinitions) }
        : {}),
      ...(input.entryRules !== undefined ? { entryRules: input.entryRules } : {}),
      ...(input.flowDefinition !== undefined
        ? { flowDefinition: input.flowDefinition }
        : {}),
      ...(input.statusDefinitions !== undefined
        ? { statusDefinitions: input.statusDefinitions }
        : {}),
    })

    if (!updated) {
      throw new HttpError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND')
    }

    return updated
  }
}
