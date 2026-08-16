import { describe, it, expect } from 'vitest'
import { slugifyName } from './slugify'

describe('slugifyName', () => {
  it('pasa minusculas y reemplaza espacios por guiones', () => {
    expect(slugifyName('Demo Presentación')).toBe('demo-presentación')
  })

  it('colapsa multiples separadores', () => {
    expect(slugifyName('Hola   mundo!!!')).toBe('hola-mundo')
  })

  it('recorta guiones a los lados', () => {
    expect(slugifyName('  --Hola--  ')).toBe('hola')
  })

  it('cadena vacia devuelve vacio', () => {
    expect(slugifyName('   ')).toBe('')
  })
})