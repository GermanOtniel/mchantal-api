import { describe, it, expect } from 'vitest'
import { InMemoryRealtimeBus } from './realtime-bus'
import type { WhatsAppRealtimeEvent } from './types'

describe('InMemoryRealtimeBus', () => {
  it('publishes events to subscribers', () => {
    const bus = new InMemoryRealtimeBus()
    const received: WhatsAppRealtimeEvent[] = []
    bus.subscribe((e) => received.push(e))
    const event: WhatsAppRealtimeEvent = {
      type: 'message.created',
      payload: { conversationId: 'c1', message: {} as never },
    }
    bus.publish(event)
    expect(received).toEqual([event])
  })

  it('unsubscribe stops delivery', () => {
    const bus = new InMemoryRealtimeBus()
    const received: WhatsAppRealtimeEvent[] = []
    const unsub = bus.subscribe((e) => received.push(e))
    unsub()
    bus.publish({ type: 'message.created', payload: { conversationId: 'c1', message: {} as never } })
    expect(received).toHaveLength(0)
  })
})
