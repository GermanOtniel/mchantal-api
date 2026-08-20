import { HttpError } from '../../auth/http-error'
import { slugifyName } from './slugify'
import { validateEntryMessage, validateFlowDefinition } from './flow-validator'
import type {
  Campaign,
  CampaignRepositoryPort,
  UpdateCampaignData,
} from '../types/campaign.types'

const EMPTY_FLOW: Record<string, unknown> = { nodes: {} }

export type CreateCampaignInput = {
  name: string
  entryMessage: string
  flowDefinition?: Record<string, unknown>
  origins?: string[]
}

/** Normaliza la lista de orígenes: trim, colapsa espacios internos, dedupe
 * case-insensitive (conserva la primera capitalización), descarta vacíos. */
function normalizeOrigins(input: string[] | undefined): string[] {
  if (!input) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const v = raw.trim().replace(/\s+/g, ' ')
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

export class CampaignService {
  constructor(private readonly campaigns: CampaignRepositoryPort) {}

  async listAll(): Promise<Campaign[]> {
    return this.campaigns.listAll()
  }

  async findById(id: string): Promise<Campaign | null> {
    return this.campaigns.findById(id)
  }

  async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    const entryIssues = validateEntryMessage(input.entryMessage)
    if (entryIssues.length > 0) {
      throw new HttpError(
        'Mensaje de entrada inválido',
        400,
        'INVALID_ENTRY_MESSAGE',
        entryIssues
      )
    }

    const flow = input.flowDefinition ?? EMPTY_FLOW
    if (input.flowDefinition !== undefined) {
      const flowIssues = validateFlowDefinition(flow)
      if (flowIssues.length > 0) {
        throw new HttpError('Flujo inválido', 400, 'INVALID_FLOW', flowIssues)
      }
    }

    const base = slugifyName(input.name)
    let slug = base
    let suffix = 2
    while (await this.campaigns.slugExists(slug)) {
      slug = `${base}-${suffix++}`
    }

    return this.campaigns.create({
      slug,
      name: input.name,
      entryMessage: input.entryMessage,
      flowDefinition: flow,
      origins: normalizeOrigins(input.origins),
    })
  }

  async updateCampaign(id: string, patch: UpdateCampaignData): Promise<Campaign> {
    if (patch.flowDefinition !== undefined) {
      const issues = validateFlowDefinition(patch.flowDefinition)
      if (issues.length > 0) {
        throw new HttpError('Flujo inválido', 400, 'INVALID_FLOW', issues)
      }
    }
    if (patch.entryMessage !== undefined) {
      const issues = validateEntryMessage(patch.entryMessage)
      if (issues.length > 0) {
        throw new HttpError(
          'Mensaje de entrada inválido',
          400,
          'INVALID_ENTRY_MESSAGE',
          issues
        )
      }
    }
    const normalized: UpdateCampaignData =
      patch.origins !== undefined ? { ...patch, origins: normalizeOrigins(patch.origins) } : patch
    return this.campaigns.update(id, normalized)
  }
}