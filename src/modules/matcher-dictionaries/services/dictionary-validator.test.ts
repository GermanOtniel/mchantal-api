import { describe, it, expect } from 'vitest'
import { validateMatcherDictionary } from './dictionary-validator'

function dict(over: Record<string, unknown> = {}) {
  return {
    slug: 'estados-de-mexico',
    name: 'Estados de México',
    categories: [{ id: 'jalisco', label: 'Jalisco', aliases: ['jalisco', 'gdl'] }],
    ...over,
  }
}

function codes(issues: { code: string }[]): string[] {
  return issues.map((i) => i.code)
}

describe('validateMatcherDictionary — válido', () => {
  it('diccionario mínimo válido → []', () => {
    expect(validateMatcherDictionary(dict())).toEqual([])
  })
})

describe('validateMatcherDictionary — inválido', () => {
  it('no es objeto', () => expect(codes(validateMatcherDictionary(null))).toContain('NOT_OBJECT'))
  it('slug vacío', () => expect(codes(validateMatcherDictionary(dict({ slug: '' })))).toContain('SLUG_EMPTY'))
  it('name vacío', () => expect(codes(validateMatcherDictionary(dict({ name: '   ' })))).toContain('NAME_EMPTY'))
  it('categories no es array', () => expect(codes(validateMatcherDictionary(dict({ categories: {} })))).toContain('CATEGORIES_NOT_ARRAY'))
  it('categories vacío', () => expect(codes(validateMatcherDictionary(dict({ categories: [] })))).toContain('CATEGORIES_EMPTY'))
  it('id de categoría vacío', () => expect(codes(validateMatcherDictionary(dict({ categories: [{ id: '', label: 'X', aliases: ['x'] }] })))).toContain('CATEGORY_ID_EMPTY'))
  it('ids de categoría duplicados', () => expect(codes(validateMatcherDictionary(dict({ categories: [
    { id: 'dup', label: 'A', aliases: ['a'] }, { id: 'dup', label: 'B', aliases: ['b'] },
  ] })))).toContain('CATEGORY_ID_DUPLICATE'))
  it('label vacío', () => expect(codes(validateMatcherDictionary(dict({ categories: [{ id: 'x', label: '', aliases: ['x'] }] })))).toContain('CATEGORY_LABEL_EMPTY'))
  it('aliases vacío', () => expect(codes(validateMatcherDictionary(dict({ categories: [{ id: 'x', label: 'X', aliases: [] }] })))).toContain('CATEGORY_ALIASES_EMPTY'))
  it('alias vacío dentro del array', () => expect(codes(validateMatcherDictionary(dict({ categories: [{ id: 'x', label: 'X', aliases: [''] }] })))).toContain('CATEGORY_ALIAS_EMPTY'))
  it('alias que normaliza a duplicado dentro de la categoría', () => expect(codes(validateMatcherDictionary(dict({ categories: [{ id: 'x', label: 'X', aliases: ['Jalisco', 'jalisco'] }] })))).toContain('CATEGORY_ALIAS_DUPLICATE'))
})