import type { ServerResponse } from 'node:http'
import type { RealtimeBus } from './realtime-bus'
import type { WhatsAppRealtimeEvent } from './types'

const HEARTBEAT_MS = 30_000

export type ScopeResolver = (
  userId: string,
  permissions: Set<string>,
  conversationId: string,
) => Promise<boolean>

type SseClient = {
  userId: string
  permissions: Set<string>
  response: ServerResponse
  heartbeat: ReturnType<typeof setInterval>
}

function formatSseEvent(event: WhatsAppRealtimeEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`
}

function extractConversationId(event: WhatsAppRealtimeEvent): string | null {
  return event.payload.conversationId ?? null
}

export class SseConnectionManager {
  private readonly clients = new Set<SseClient>()
  private unsubscribeBus: (() => void) | null = null

  constructor(private readonly bus: RealtimeBus, private readonly scopeResolver: ScopeResolver) {}

  start(): void {
    if (this.unsubscribeBus) return
    this.unsubscribeBus = this.bus.subscribe((event) => {
      void this.broadcast(event)
    })
  }

  addClient(userId: string, permissions: Set<string>, response: ServerResponse, origin?: string): void {
    const corsHeaders: Record<string, string> = origin
      ? {
          'Access-Control-Allow-Origin': origin,
          Vary: 'Origin',
        }
      : { 'Access-Control-Allow-Origin': '*' }

    response.writeHead(200, {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    response.write(': connected\n\n')

    const heartbeat = setInterval(() => {
      if (!response.writableEnded) {
        response.write(': ping\n\n')
      }
    }, HEARTBEAT_MS)

    const client: SseClient = { userId, permissions, response, heartbeat }
    this.clients.add(client)

    response.on('close', () => {
      this.removeClient(client)
    })
    // Prevent an unhandled 'error' event on abrupt disconnect from crashing the process.
    response.on('error', () => this.removeClient(client))
  }

  private removeClient(client: SseClient): void {
    clearInterval(client.heartbeat)
    this.clients.delete(client)
  }

  private async broadcast(event: WhatsAppRealtimeEvent): Promise<void> {
    const conversationId = extractConversationId(event)
    if (!conversationId) {
      // no conversationId → don't broadcast (all current events have one; safe default)
      return
    }
    for (const client of this.clients) {
      if (client.response.writableEnded) {
        this.removeClient(client)
        continue
      }
      try {
        const allowed = await this.scopeResolver(client.userId, client.permissions, conversationId)
        if (!allowed) continue
        client.response.write(formatSseEvent(event))
      } catch {
        // best-effort: skip this client on error
      }
    }
  }

  getActiveConnectionCount(): number {
    return this.clients.size
  }

  async close(): Promise<void> {
    this.unsubscribeBus?.()
    this.unsubscribeBus = null

    for (const client of this.clients) {
      clearInterval(client.heartbeat)
      if (!client.response.writableEnded) {
        client.response.end()
      }
    }
    this.clients.clear()
  }
}