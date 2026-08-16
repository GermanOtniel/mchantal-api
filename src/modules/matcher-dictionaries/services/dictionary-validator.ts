import { normalizeText } from './classifier'

export type ValidationIssue = { field: string; code: string; message: string }

function issue(field: string, code: string, message: string): ValidationIssue {
  return { field, code, message }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Valida la estructura de un diccionario. Devuelve [] si es válido. */
export function validateMatcherDictionary(d: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isPlainObject(d)) return [issue('dictionary', 'NOT_OBJECT', 'El diccionario debe ser un objeto.')]

  const slug = d.slug
  if (typeof slug !== 'string' || slug.trim() === '') issues.push(issue('slug', 'SLUG_EMPTY', 'El slug no puede estar vacío.'))
  if (typeof d.name !== 'string' || d.name.trim() === '') issues.push(issue('name', 'NAME_EMPTY', 'El nombre no puede estar vacío.'))

  const categories = d.categories
  if (!Array.isArray(categories)) {
    issues.push(issue('categories', 'CATEGORIES_NOT_ARRAY', 'categories debe ser un array.'))
    return issues
  }
  if (categories.length === 0) issues.push(issue('categories', 'CATEGORIES_EMPTY', 'El diccionario debe tener al menos 1 categoría.'))

  const seenIds = new Set<string>()
  categories.forEach((cat, i) => {
    const base = `categories[${i}]`
    if (!isPlainObject(cat)) { issues.push(issue(base, 'CATEGORY_NOT_OBJECT', `La categoría ${i} no es un objeto.`)); return }
    const id = cat.id
    if (typeof id !== 'string' || id.trim() === '') {
      issues.push(issue(`${base}.id`, 'CATEGORY_ID_EMPTY', 'El id de categoría no puede estar vacío.'))
    } else if (seenIds.has(id)) {
      issues.push(issue(`${base}.id`, 'CATEGORY_ID_DUPLICATE', `El id de categoría "${id}" está repetido.`))
    } else {
      seenIds.add(id)
    }
    if (typeof cat.label !== 'string' || cat.label.trim() === '') {
      issues.push(issue(`${base}.label`, 'CATEGORY_LABEL_EMPTY', 'La etiqueta no puede estar vacía.'))
    }
    const aliases = cat.aliases
    if (!Array.isArray(aliases) || aliases.length === 0) {
      issues.push(issue(`${base}.aliases`, 'CATEGORY_ALIASES_EMPTY', 'La categoría debe tener al menos 1 alias.'))
      return
    }
    const seenNorm = new Set<string>()
    for (const a of aliases) {
      if (typeof a !== 'string' || a.trim() === '') {
        issues.push(issue(`${base}.aliases`, 'CATEGORY_ALIAS_EMPTY', 'Todo alias debe ser no vacío.'))
        continue
      }
      const n = normalizeText(a)
      if (seenNorm.has(n)) {
        issues.push(issue(`${base}.aliases`, 'CATEGORY_ALIAS_DUPLICATE', `El alias "${a}" es duplicado (normalizado).`))
        continue
      }
      seenNorm.add(n)
    }
  })
  return issues
}