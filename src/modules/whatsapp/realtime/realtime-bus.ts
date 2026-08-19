import { EventEmitter } from 'node:events'
import type { WhatsAppRealtimeEvent } from './types'

export type RealtimeEventHandler = (event: WhatsAppRealtimeEvent) => void

export interface RealtimeBus {
  publish(event: WhatsAppRealtimeEvent): void
  subscribe(handler: RealtimeEventHandler): () => void
  close(): Promise<void>
}

export class InMemoryRealtimeBus implements RealtimeBus {
  private readonly emitter = new EventEmitter()

  publish(event: WhatsAppRealtimeEvent): void {
    this.emitter.emit('event', event)
  }

  subscribe(handler: RealtimeEventHandler): () => void {
    this.emitter.on('event', handler)
    return () => {
      this.emitter.off('event', handler)
    }
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners()
  }
}
