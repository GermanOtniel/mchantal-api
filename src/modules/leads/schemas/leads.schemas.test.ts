import { describe, it, expect } from 'vitest'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { LeadDetailResponseSchema } from './leads.schemas'

function compile(schema: unknown) {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  return ajv.compile(schema as never)
}

// Payload mínimo válido de LeadDetailResponse (sin siblings) para construir sobre él.
const basePayload = {
  id: 'l1',
  folio: 'MC-1',
  campaignId: 'c1',
  campaignName: 'Campaña 1',
  contact: { name: 'Ana', waId: '123' },
  status: 'new',
  assignedExecutive: { id: 'u1', fullName: 'Pepe' },
  needsReply: false,
  enrolledAt: '2026-01-01T00:00:00.000Z',
  flowState: 'active',
  conversationId: 'conv1',
  answers: [],
}

describe('LeadDetailResponseSchema — siblings', () => {
  it('acepta un payload con siblings', () => {
    const validate = compile(LeadDetailResponseSchema) as (d: unknown) => boolean
    const ok = validate({
      ...basePayload,
      siblings: [
        { campaignName: 'Campaña B', assignedExecutiveName: 'Juan Pérez' },
        { campaignName: 'Campaña C', assignedExecutiveName: 'María Gómez' },
      ],
    })
    expect(ok).toBe(true)
  })

  it('acepta un payload con siblings vacío', () => {
    const validate = compile(LeadDetailResponseSchema) as (d: unknown) => boolean
    expect(validate({ ...basePayload, siblings: [] })).toBe(true)
  })

  it('RECHAZA un payload sin siblings (la propiedad es requerida por el schema)', () => {
    const validate = compile(LeadDetailResponseSchema) as (d: unknown) => boolean
    expect(validate(basePayload)).toBe(false)
  })
})