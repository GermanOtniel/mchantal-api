import Redis from 'ioredis'
import { InMemoryRealtimeBus } from './realtime-bus'
import type { RealtimeBus } from './realtime-bus'
import { WHATSAPP_REALTIME_CHANNEL, type WhatsAppRealtimeEvent } from './types'

export class RedisRealtimeBus implements RealtimeBus {
  private readonly local = new InMemoryRealtimeBus()
  private readonly publisher: Redis
  private readonly subscriber: Redis

  constructor(redisUrl: string) {
    this.publisher = new Redis(redisUrl)
    this.subscriber = new Redis(redisUrl)

    this.subscriber.on('message', (_channel, message) => {
      try {
        const event = JSON.parse(message) as WhatsAppRealtimeEvent
        this.local.publish(event)
      } catch {
        // ignore malformed payloads
      }
    })

    void this.subscriber.subscribe(WHATSAPP_REALTIME_CHANNEL)
  }

  publish(event: WhatsAppRealtimeEvent): void {
    void this.publisher.publish(WHATSAPP_REALTIME_CHANNEL, JSON.stringify(event))
  }

  subscribe(handler: (event: WhatsAppRealtimeEvent) => void): () => void {
    return this.local.subscribe(handler)
  }

  async close(): Promise<void> {
    await this.local.close()
    await this.subscriber.unsubscribe(WHATSAPP_REALTIME_CHANNEL)
    this.subscriber.disconnect()
    this.publisher.disconnect()
  }
}

export function createRealtimeBus(redisUrl?: string): RealtimeBus {
  if (redisUrl) {
    return new RedisRealtimeBus(redisUrl)
  }
  return new InMemoryRealtimeBus()
}
