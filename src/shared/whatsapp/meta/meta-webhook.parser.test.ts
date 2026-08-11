import { describe, it, expect } from 'vitest'
import { parseMetaInboundPayload } from './meta-webhook.parser'

describe('parseMetaInboundPayload', () => {
  it('parsea un mensaje de texto con contacto', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: {
        messaging_product: 'whatsapp',
        contacts: [{ wa_id: '123', profile: { name: 'Ana' } }],
        messages: [{ id: 'm1', from: '123', timestamp: '1700000000', type: 'text', text: { body: 'Hola mi folio es MC-ABCDE' } }],
      } }] }],
    }
    const events = parseMetaInboundPayload(payload)
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('message')
    const m = events[0].message
    expect(m.providerMessageId).toBe('m1')
    expect(m.waId).toBe('123')
    expect(m.contactName).toBe('Ana')
    expect(m.type).toBe('text')
    expect(m.text).toBe('Hola mi folio es MC-ABCDE')
    expect(m.timestamp).toEqual(new Date(1700000000 * 1000))
  })

  it('parsea una respuesta de botón (interactive button_reply)', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: {
        messages: [{ id: 'm2', from: '521234567890', timestamp: '1700000001', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'comprar', title: 'Quiero comprar' } } }],
      } }] }],
    }
    const events = parseMetaInboundPayload(payload)
    expect(events[0].message.type).toBe('interactive')
    expect(events[0].message.interactiveReplyId).toBe('comprar')
    expect(events[0].message.interactiveReplyTitle).toBe('Quiero comprar')
    expect(events[0].message.interactiveType).toBe('button_reply')
    expect(events[0].message.text).toBe('Quiero comprar')
    expect(events[0].message.waId).toBe('521234567890')
  })

  it('parsea un evento de status (delivered)', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: {
        statuses: [{ id: 'm3', status: 'delivered', timestamp: '1700000002', recipient_id: '123' }],
      } }] }],
    }
    const events = parseMetaInboundPayload(payload)
    expect(events[0].kind).toBe('status')
    expect(events[0].status.providerMessageId).toBe('m3')
    expect(events[0].status.status).toBe('delivered')
    expect(events[0].status.recipientWaId).toBe('123')
  })

  it('parsea status failed con errorMessage', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: {
        statuses: [{ id: 'm4', status: 'failed', timestamp: '1700000003', errors: [{ message: 'user blocked' }] }],
      } }] }],
    }
    const events = parseMetaInboundPayload(payload)
    expect(events[0].status.status).toBe('failed')
    expect(events[0].status.errorMessage).toBe('user blocked')
  })

  it('ignora payload que no es whatsapp_business_account', () => {
    expect(parseMetaInboundPayload({ object: 'other' })).toEqual([])
    expect(parseMetaInboundPayload({})).toEqual([])
  })

  it('ignora mensaje sin id o sin from', () => {
    const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ type: 'text', text: { body: 'x' } }] } }] }] }
    expect(parseMetaInboundPayload(payload)).toEqual([])
  })

  it('devuelve [] si no hay entry/changes', () => {
    expect(parseMetaInboundPayload({ object: 'whatsapp_business_account' })).toEqual([])
  })
})