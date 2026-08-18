import { describe, it, expect } from 'vitest'
import { ESTADOS_DE_MEXICO } from '../../../database/migrations/1750200000000-MatcherDictionaryPresetsSeed'
import { validateMatcherDictionary } from '../../matcher-dictionaries/services/dictionary-validator'
import { classify } from '../../matcher-dictionaries/services/classifier'

describe('preset estados-de-mexico', () => {
  it('es un diccionario válido (sin issues)', () => {
    const issues = validateMatcherDictionary({
      slug: 'estados-de-mexico',
      name: 'Estados de México',
      categories: ESTADOS_DE_MEXICO,
    })
    expect(issues).toEqual([])
  })

  it('tiene 32 categorías con ids únicos', () => {
    expect(ESTADOS_DE_MEXICO).toHaveLength(32)
    const ids = new Set(ESTADOS_DE_MEXICO.map((c) => c.id))
    expect(ids.size).toBe(32)
  })

  it('clasifica casos clave', () => {
    const cats = ESTADOS_DE_MEXICO
    expect(classify('Soy de Guadalajara', cats)?.categoryId).toBe('jalisco')
    expect(classify('Vivo en Monterrey', cats)?.categoryId).toBe('nuevo_leon')
    expect(classify('De Baja California Sur', cats)?.categoryId).toBe('baja_california_sur')
    expect(classify('Baja California', cats)?.categoryId).toBe('baja_california')
    expect(classify('Estado de México', cats)?.categoryId).toBe('estado_mexico')
    expect(classify('CDMX', cats)?.categoryId).toBe('cdmx')
    expect(classify('Mérida', cats)?.categoryId).toBe('yucatan')
    expect(classify('México', cats)).toBeNull()
  })
})