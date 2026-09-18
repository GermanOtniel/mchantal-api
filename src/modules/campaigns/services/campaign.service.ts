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
  entryMessage?: string
  flowDefinition?: Record<string, unknown>
  origins?: string[]
  kind?: 'base' | 'normal'
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

function hasInteractiveNode(flow: Record<string, unknown>): boolean {
  const nodes = (flow as { nodes?: Record<string, { type?: string }> }).nodes
  if (!nodes) return false
  return Object.values(nodes).some((n) => n?.type === 'interactive_buttons')
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
    const kind = input.kind ?? 'normal'

    if (kind === 'base') {
      // Solo puede existir una base activa.
      const existing = await this.campaigns.findActiveBase()
      if (existing) {
        throw new HttpError(
          'Ya existe una campaña base activa',
          409,
          'BASE_ALREADY_EXISTS'
        )
      }
      // La base no pasa por /go/:slug ni genera captura: entryMessage y origins
      // son irrelevantes. Se descartan (no fallan).
    } else {
      const entryIssues = validateEntryMessage(input.entryMessage)
      if (entryIssues.length > 0) {
        throw new HttpError(
          'Mensaje de entrada inválido',
          400,
          'INVALID_ENTRY_MESSAGE',
          entryIssues
        )
      }
    }

    const flow = input.flowDefinition ?? EMPTY_FLOW
    if (input.flowDefinition !== undefined) {
      const flowIssues = validateFlowDefinition(flow).filter((i) => (i.severity ?? 'error') === 'error')
      if (flowIssues.length > 0) {
        throw new HttpError('Flujo inválido', 400, 'INVALID_FLOW', flowIssues)
      }
    }

    // La base necesita al menos un nodo interactivo: es el punto de entrada
    // del flujo que se le envía al orphan al enrolarlo.
    if (kind === 'base' && !hasInteractiveNode(flow)) {
      throw new HttpError(
        'La campaña base requiere al menos un nodo interactivo (botones)',
        400,
        'INVALID_FLOW',
        [{ field: 'flowDefinition', code: 'BASE_NEEDS_INTERACTIVE_NODE', message: 'La campaña base requiere al menos un nodo interactivo (botones)' }]
      )
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
      entryMessage: kind === 'base' ? '' : input.entryMessage ?? '',
      flowDefinition: flow,
      origins: kind === 'base' ? [] : normalizeOrigins(input.origins),
      kind,
    })
  }

  async updateCampaign(id: string, patch: UpdateCampaignData): Promise<Campaign> {
    if ('kind' in patch && patch.kind !== undefined) {
      throw new HttpError(
        'El tipo de campaña no se puede cambiar',
        400,
        'KIND_IMMUTABLE'
      )
    }
    if (patch.flowDefinition !== undefined) {
      const issues = validateFlowDefinition(patch.flowDefinition).filter((i) => (i.severity ?? 'error') === 'error')
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