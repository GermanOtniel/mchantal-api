import type { FlowDefinition } from '../services/flow-validator'

export type Campaign = {
  id: string
  slug: string
  name: string
  entryMessage: string
  flowDefinition: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type CreateCampaignData = {
  slug: string
  name: string
  entryMessage: string
  flowDefinition: Record<string, unknown>
}

export type UpdateCampaignData = Partial<
  Pick<Campaign, 'name' | 'entryMessage' | 'flowDefinition'>
>

// Re-export para comodidad de quienes importan desde types.
export type { FlowDefinition } from '../services/flow-validator'

export interface CampaignRepositoryPort {
  create(data: CreateCampaignData): Promise<Campaign>
  update(id: string, patch: UpdateCampaignData): Promise<Campaign>
  findById(id: string): Promise<Campaign | null>
  listAll(): Promise<Campaign[]>
  slugExists(slug: string, exceptId?: string): Promise<boolean>
}