import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { InMemoryRealtimeBus } from './realtime-bus'
import { SseConnectionManager } from './sse-connection-manager'
import type { WhatsAppRealtimeEvent } from './types'

type Handlers = { [event: string]: ((...args: unknown[]) => void) | undefined }

function createFakeResponse() {
  const handlers: Handlers = {}
  const written: string[] = []
  const res = {
    writableEnded: false,
    writeHead: vi.fn((_status: number, _headers?: Record<string, string>) => {}),
    write: vi.fn((chunk: string) => {
      written.push(chunk)
      return true
    }),
    end: vi.fn(() => {
      res.writableEnded = true
    }),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler
      return res
    }),
  }
  return { res, handlers, written }
}

describe('SseConnectionManager', () => {
  let bus: InMemoryRealtimeBus
  let manager: SseConnectionManager

  beforeEach(() => {
    vi.useFakeTimers()
    bus = new InMemoryRealtimeBus()
    manager = new SseConnectionManager(bus)
    manager.start()
  })

  afterEach(() => {
    manager.close()
    vi.useRealTimers()
  })

  it('addClient writes SSE headers + ": connected" and registers the client', () => {
    const { res, written } = createFakeResponse()

    manager.addClient('user-1', res)

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'text/event-stream' }),
    )
    expect(written).toContain(': connected\n\n')
    expect(manager.getActiveConnectionCount()).toBe(1)
  })

  it('broadcast delivers a formatted SSE frame to the client', () => {
    const { res, written } = createFakeResponse()
    manager.addClient('user-1', res)
    written.length = 0

    const event: WhatsAppRealtimeEvent = {
      type: 'message.created',
      payload: {
        conversationId: 'c1',
        message: { id: 'm1' } as never,
      },
    }
    bus.publish(event)

    expect(written).toContain(`event: message.created\ndata: ${JSON.stringify(event.payload)}\n\n`)
    expect(res.write).toHaveBeenCalled()
  })

  it('response "close" event triggers removeClient (count returns to 0)', () => {
    const { res, handlers } = createFakeResponse()
    manager.addClient('user-1', res)
    expect(manager.getActiveConnectionCount()).toBe(1)

    handlers.close?.()

    expect(manager.getActiveConnectionCount()).toBe(0)
  })

  it('close() ends all responses and unsubscribes from the bus (count 0 after)', async () => {
    const { res } = createFakeResponse()
    manager.addClient('user-1', res)
    expect(manager.getActiveConnectionCount()).toBe(1)

    await manager.close()

    expect(res.end).toHaveBeenCalled()
    expect(manager.getActiveConnectionCount()).toBe(0)

    // After close, publishing should NOT reach the (ended) client.
    res.write.mockClear()
    bus.publish({
      type: 'message.created',
      payload: { conversationId: 'c1', message: {} as never },
    })
    expect(res.write).not.toHaveBeenCalled()
  })

  it('the "error" listener from #1 triggers removeClient on abrupt disconnect', () => {
    const { res, handlers } = createFakeResponse()
    manager.addClient('user-1', res)
    expect(manager.getActiveConnectionCount()).toBe(1)

    expect(handlers.error).toBeTypeOf('function')
    handlers.error?.()

    expect(manager.getActiveConnectionCount()).toBe(0)
  })

  it('heartbeat is cleared when the client is removed (no leaked writes)', () => {
    const { res, written, handlers } = createFakeResponse()
    manager.addClient('user-1', res)
    const beforeHeartbeat = written.length

    handlers.close?.()
    // Advance well past the heartbeat interval; no new writes should occur.
    vi.advanceTimersByTime(60_000)

    expect(written.length).toBe(beforeHeartbeat)
    expect(manager.getActiveConnectionCount()).toBe(0)
  })
})
