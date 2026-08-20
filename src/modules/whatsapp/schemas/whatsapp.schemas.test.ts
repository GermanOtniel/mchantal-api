import { describe, it, expect } from 'vitest'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import {
  ListMessagesQuerySchema,
  MessagesListResponseSchema,
} from './whatsapp.schemas'

function compile(schema: unknown) {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  return ajv.compile(schema as never)
}

const COMPOSITE_CURSOR = '2026-08-19T10:00:00.000Z|bfaaf994-8a3b-42ef-b5bf-a819d8f14a46'

describe('whatsapp message cursor schemas', () => {
  it('nextCursor acepta un cursor codificado (sentAt|id)', () => {
    const validate = compile(MessagesListResponseSchema) as (d: unknown) => boolean
    const ok = validate({ items: [], nextCursor: COMPOSITE_CURSOR })
    expect(ok).toBe(true)
  })

  it('nextCursor acepta null', () => {
    const validate = compile(MessagesListResponseSchema) as (d: unknown) => boolean
    expect(validate({ items: [], nextCursor: null })).toBe(true)
  })

  it('cursor del querystring acepta un cursor codificado', () => {
    const validate = compile(ListMessagesQuerySchema) as (d: unknown) => boolean
    expect(validate({ limit: 50, cursor: COMPOSITE_CURSOR })).toBe(true)
  })
})