import { describe, it, expect } from 'vitest'
import { generateFolio, generateFolioSuffix, generateBaseFolio, FOLIO_REGEX } from './folio.service'

describe('folio.service', () => {
  it('generateFolio produce un folio con prefijo MC- y 5 chars', () => {
    const folio = generateFolio()
    expect(folio.startsWith('MC-')).toBe(true)
    expect(folio.length).toBe(8) // 'MC-' (3) + 5
  })

  it('generateFolio matchea FOLIO_REGEX', () => {
    expect(FOLIO_REGEX.test(generateFolio())).toBe(true)
  })

  it('FOLIO_REGEX matchea un folio valido dentro de un texto', () => {
    const m = 'Hola mi folio es MC-ABCDE quiero info'.match(FOLIO_REGEX)
    expect(m?.[0]).toBe('MC-ABCDE')
  })

  it('FOLIO_REGEX rechaza folios con chars fuera del charset (0,1,I,L,O)', () => {
    expect(FOLIO_REGEX.test('MC-ABC1E')).toBe(false) // 1 no permitido
    expect(FOLIO_REGEX.test('MC-ABCDE')).toBe(true)
    expect(FOLIO_REGEX.test('MC-ABCDI')).toBe(false) // I no permitido
  })

  it('generateFolioSuffix tiene largo 5', () => {
    expect(generateFolioSuffix().length).toBe(5)
  })
})

describe('generateBaseFolio', () => {
  it('tiene prefijo B- y 5 chars del charset', () => {
    const folio = generateBaseFolio()
    expect(folio).toMatch(/^B-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/)
  })

  it('no es matcheado por FOLIO_REGEX (no re-dispara enrollFromFolio)', () => {
    const folio = generateBaseFolio()
    expect(FOLIO_REGEX.test(folio)).toBe(false)
  })

  it('genera valores distintos en llamadas sucesivas (no constante)', () => {
    const samples = new Set<string>()
    for (let i = 0; i < 50; i++) samples.add(generateBaseFolio())
    expect(samples.size).toBeGreaterThan(1)
  })
})