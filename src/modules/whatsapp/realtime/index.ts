import { createRealtimeBus } from './realtime-bus.redis'
import type { RealtimeBus } from './realtime-bus'
import { SseConnectionManager } from './sse-connection-manager'

let bus: RealtimeBus | null = null
let sseManager: SseConnectionManager | null = null

export function getRealtimeBus(): RealtimeBus {
  if (!bus) {
    const redisUrl = process.env.REDIS_URL?.trim()
    bus = createRealtimeBus(redisUrl || undefined)
  }
  return bus
}

export function getSseConnectionManager(): SseConnectionManager {
  if (!sseManager) {
    sseManager = new SseConnectionManager(getRealtimeBus())
    sseManager.start()
  }
  return sseManager
}

export async function closeRealtimeInfrastructure(): Promise<void> {
  await sseManager?.close()
  await bus?.close()
  sseManager = null
  bus = null
}
