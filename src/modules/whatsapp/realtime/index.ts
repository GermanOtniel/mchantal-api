import { InMemoryRealtimeBus, type RealtimeBus } from './realtime-bus'
import { SseConnectionManager } from './sse-connection-manager'

let bus: RealtimeBus | null = null
let sseManager: SseConnectionManager | null = null

export function getRealtimeBus(): RealtimeBus {
  if (!bus) bus = new InMemoryRealtimeBus()
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
  const sse = sseManager
  const busRef = bus
  sseManager = null
  bus = null
  try {
    await sse?.close()
    await busRef?.close()
  } catch {
    // best-effort shutdown; singletons already nulled
  }
}
