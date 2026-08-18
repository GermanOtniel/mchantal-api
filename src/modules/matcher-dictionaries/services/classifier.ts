import type { MatcherCategory } from '../types/dictionary.types'

/** Minúsculas, sin acentos, no-alfanum → espacio, colapsa espacios. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export type ClassifyResult = { categoryId: string; matchedAlias: string } | null

/**
 * Clasifica texto libre contra categorías. Candidatos = alias cuyo texto
 * normalizado está contenido en el input normalizado. Desempate: alias más
 * largo (más específico) gana. Sin candidatos → null.
 */
export function classify(input: string, categories: MatcherCategory[]): ClassifyResult {
  const normInput = normalizeText(input)
  if (normInput === '') return null
  let best: { categoryId: string; alias: string; normAlias: string } | null = null
  for (const cat of categories) {
    for (const alias of cat.aliases) {
      const normAlias = normalizeText(alias)
      if (normAlias === '') continue
      if (!normInput.includes(normAlias)) continue
      if (!best || normAlias.length > best.normAlias.length) {
        best = { categoryId: cat.id, alias, normAlias }
      }
    }
  }
  return best ? { categoryId: best.categoryId, matchedAlias: best.alias } : null
}