import { describe, expect, it } from 'vitest'
import { resolveSsl } from './db'

describe('resolveSsl', () => {
  it('devuelve false cuando DB_SSL no está definido', () => {
    expect(resolveSsl(undefined)).toBe(false)
  })

  it('devuelve false cuando DB_SSL está vacío', () => {
    expect(resolveSsl('')).toBe(false)
  })

  it('devuelve false cuando DB_SSL no es "true"', () => {
    expect(resolveSsl('false')).toBe(false)
    expect(resolveSsl('1')).toBe(false)
    expect(resolveSsl('TRUE')).toBe(false)
  })

  it('devuelve { rejectUnauthorized: false } cuando DB_SSL === "true"', () => {
    expect(resolveSsl('true')).toEqual({ rejectUnauthorized: false })
  })
})