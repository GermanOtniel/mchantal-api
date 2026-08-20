import { describe, expect, it } from 'vitest'
import { resolveCorsOrigin } from './cors'

describe('resolveCorsOrigin', () => {
  it('devuelve true cuando CORS_ORIGIN no está definido (refleja cualquier origen, igual que antes)', () => {
    expect(resolveCorsOrigin(undefined)).toBe(true)
  })

  it('devuelve true cuando CORS_ORIGIN está vacío', () => {
    expect(resolveCorsOrigin('')).toBe(true)
  })

  it('devuelve un solo string cuando hay un único origen', () => {
    expect(resolveCorsOrigin('https://mchantal-crm.vercel.app')).toBe(
      'https://mchantal-crm.vercel.app'
    )
  })

  it('devuelve un arreglo cuando hay varios orígenes separados por coma', () => {
    expect(
      resolveCorsOrigin('https://mchantal-crm.vercel.app, https://preview.vercel.app')
    ).toEqual(['https://mchantal-crm.vercel.app', 'https://preview.vercel.app'])
  })

  it('ignora orígenes vacíos por comas sobrantes', () => {
    expect(resolveCorsOrigin('https://a.app, , https://b.app')).toEqual([
      'https://a.app',
      'https://b.app',
    ])
  })
})