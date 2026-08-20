import { describe, it, expect } from 'vitest'
import { encodeMessageCursor, decodeMessageCursor } from './whatsapp-message.repository'

describe('message cursor encode/decode', () => {
  it('round-trip: encode → decode restaura sentAt e id', () => {
    const sentAt = '2026-01-01T00:00:00.000Z'
    const id = 'm-uuid-1'
    const cursor = encodeMessageCursor(sentAt, id)
    expect(decodeMessageCursor(cursor)).toEqual({ sentAt, id })
  })

  it('round-trip con iso que contiene un offset (+00:00) sin `|`', () => {
    const sentAt = '2026-01-01T00:00:00+00:00'
    const id = 'a3f4-uuid'
    const cursor = encodeMessageCursor(sentAt, id)
    expect(decodeMessageCursor(cursor)).toEqual({ sentAt, id })
  })

  it('decode lanza si el cursor no tiene `|`', () => {
    expect(() => decodeMessageCursor('no-pipe-here')).toThrow('Invalid cursor')
  })

  it('decode lanza si el `|` está al inicio (sentAt vacío)', () => {
    expect(() => decodeMessageCursor('|only-id')).toThrow('Invalid cursor')
  })

  it('decode usa lastIndexOf para no romper con `|` en sentAt (defensivo)', () => {
    // ids son UUIDs sin `|`; pero si sentAt tuviera un `|`, lastIndexOf toma el último
    const sentAt = 'weird|sentAt'
    const id = 'm-1'
    const cursor = encodeMessageCursor(sentAt, id)
    expect(decodeMessageCursor(cursor)).toEqual({ sentAt, id })
  })
})