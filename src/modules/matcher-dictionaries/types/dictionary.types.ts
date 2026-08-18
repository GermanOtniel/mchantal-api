export type MatcherCategory = { id: string; label: string; aliases: string[] }

export type MatcherDictionaryData = {
  id: string
  slug: string
  name: string
  categories: MatcherCategory[]
  isSystem: boolean
}

export type CreateDictionaryData = {
  slug: string
  name: string
  categories: MatcherCategory[]
  isSystem?: boolean
}

export type UpdateDictionaryData = Partial<Pick<MatcherDictionaryData, 'slug' | 'name' | 'categories'>>

export interface MatcherDictionaryRepositoryPort {
  listAll(): Promise<MatcherDictionaryData[]>
  findById(id: string): Promise<MatcherDictionaryData | null>
  findBySlug(slug: string): Promise<MatcherDictionaryData | null>
  create(data: CreateDictionaryData): Promise<MatcherDictionaryData>
  update(id: string, patch: UpdateDictionaryData): Promise<MatcherDictionaryData>
  delete(id: string): Promise<void>
  slugExists(slug: string, exceptId?: string): Promise<boolean>
}