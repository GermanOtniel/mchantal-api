import { describe, it, expect } from 'vitest'
import { classify, normalizeText } from './classifier'
import type { MatcherCategory } from '../types/dictionary.types'

const CATS: MatcherCategory[] = [
  { id: 'jalisco', label: 'Jalisco', aliases: ['jalisco', 'guadalajara', 'gdl', 'jal'] },
  { id: 'nuevo_leon', label: 'Nuevo León', aliases: ['nuevo leon', 'monterrey', 'mty', 'nl'] },
  { id: 'estado_mexico', label: 'Estado de México', aliases: ['estado de mexico', 'edomex', 'toluca'] },
  { id: 'cdmx', label: 'Ciudad de México', aliases: ['ciudad de mexico', 'cdmx', 'df', 'distrito federal'] },
  { id: 'baja_california', label: 'Baja California', aliases: ['baja california', 'bc', 'tijuana'] },
  { id: 'baja_california_sur', label: 'Baja California Sur', aliases: ['baja california sur', 'bcs', 'la paz'] },
  { id: 'yucatan', label: 'Yucatán', aliases: ['yucatan', 'merida', 'yuc'] },
  { id: 'queretaro', label: 'Querétaro', aliases: ['queretaro', 'qro'] },
]

describe('normalizeText', () => {
  it('quita acentos, pasa a minúsculas, colapsa no-alfanum a espacio', () => {
    expect(normalizeText('Estado de México')).toBe('estado de mexico')
    expect(normalizeText('  Nuevo   León! ')).toBe('nuevo leon')
    expect(normalizeText('Yucatán-Mérida')).toBe('yucatan merida')
  })
  it('string vacío o solo símbolos → vacío', () => {
    expect(normalizeText('   ')).toBe('')
    expect(normalizeText('!!!')).toBe('')
  })
})

describe('classify', () => {
  it('matchea por alias exacto de ciudad-proxy', () => {
    expect(classify('Soy de Guadalajara', CATS)).toEqual({ categoryId: 'jalisco', matchedAlias: 'guadalajara' })
  })
  it('varios aliases de la misma categoría → esa categoría', () => {
    expect(classify('Vivo en Monterrey NL', CATS)?.categoryId).toBe('nuevo_leon')
  })
  it('alias más largo gana (baja california sur vs baja california)', () => {
    expect(classify('De Baja California Sur', CATS)?.categoryId).toBe('baja_california_sur')
  })
  it('alias más corto cuando no está el más específico', () => {
    expect(classify('Baja California', CATS)?.categoryId).toBe('baja_california')
  })
  it('normaliza acentos antes de comparar', () => {
    expect(classify('Estado de México', CATS)?.categoryId).toBe('estado_mexico')
  })
  it('sin coincidencia → null', () => {
    expect(classify('México', CATS)).toBeNull()
    expect(classify('xyz qwerty', CATS)).toBeNull()
  })
  it('input vacío → null', () => {
    expect(classify('   ', CATS)).toBeNull()
  })
  it('categorías sin aliases no rompen', () => {
    expect(classify('jalisco', [{ id: 'x', label: 'X', aliases: [] }])).toBeNull()
  })
})