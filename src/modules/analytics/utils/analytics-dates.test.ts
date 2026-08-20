import { describe, it, expect } from 'vitest'
import {
  addDays,
  diffDays,
  startOfWeekMonday,
  startOfMonth,
  dayBoundsUtc,
  todayInTz,
  daysBetweenInclusive,
} from './analytics-dates'

describe('analytics-dates', () => {
  it('startOfWeekMonday: domingo → lunes anterior', () => {
    expect(startOfWeekMonday('2026-08-16')).toBe('2026-08-10')
  })

  it('startOfWeekMonday: miércoles → lunes de esa semana', () => {
    expect(startOfWeekMonday('2026-08-12')).toBe('2026-08-10')
  })

  it('startOfWeekMonday: lunes → mismo lunes', () => {
    expect(startOfWeekMonday('2026-08-10')).toBe('2026-08-10')
  })

  it('startOfMonth', () => {
    expect(startOfMonth('2026-08-19')).toBe('2026-08-01')
  })

  it('addDays / diffDays', () => {
    expect(addDays('2026-08-19', -1)).toBe('2026-08-18')
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(diffDays('2026-08-10', '2026-08-19')).toBe(9)
    expect(diffDays('2026-08-19', '2026-08-10')).toBe(-9)
  })

  it('daysBetweenInclusive incluye ambos extremos', () => {
    expect(daysBetweenInclusive('2026-08-10', '2026-08-12')).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
    ])
  })

  it('dayBoundsUtc: día Mexico City (UTC-6) -> [start, end) UTC', () => {
    const { start, end } = dayBoundsUtc('2026-08-19')
    expect(start.toISOString()).toBe('2026-08-19T06:00:00.000Z')
    expect(end.toISOString()).toBe('2026-08-20T06:00:00.000Z')
  })

  it('todayInTz devuelve YYYY-MM-DD', () => {
    expect(/^\d{4}-\d{2}-\d{2}$/.test(todayInTz())).toBe(true)
  })
})