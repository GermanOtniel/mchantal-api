export type MatcherCategory = { id: string; label: string; aliases: string[] }

export type MatcherDictionaryData = {
  id: string
  slug: string
  name: string
  categories: MatcherCategory[]
  isSystem: boolean
}