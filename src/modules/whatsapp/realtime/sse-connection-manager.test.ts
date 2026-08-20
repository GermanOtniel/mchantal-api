import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { InMemoryRealtimeBus } from './realtime-bus'
import { SseConnectionManager, type ScopeResolver } from './sse-connection-manager'
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

const ALL_PERMS = new Set(['leads.read', 'leads.read.all'])
const SCOPED_PERMS = new Set(['leads.read'])

const messageCreatedEvent = (conversationId = 'c1'): WhatsAppRealtimeEvent => ({
  type: 'message.created',
  payload: {
    conversationId,
    message: { id: 'm1' } as never,
  },
})

// broadcast is async (awaits the scopeResolver); drain microtasks so writes settle.
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('SseConnectionManager', () => {
  let bus: InMemoryRealtimeBus
  let manager: SseConnectionManager
  let fakeResolver: ReturnType<typeof vi.fn<ScopeResolver>>

  beforeEach(() => {
    vi.useFakeTimers()
    bus = new InMemoryRealtimeBus()
    // Default: allow everyone (overridden per test).
    fakeResolver = vi.fn(async () => true)
    manager = new SseConnectionManager(bus, fakeResolver as unknown as ScopeResolver)
    manager.start()
  })

  afterEach(() => {
    manager.close()
    vi.useRealTimers()
  })

  it('addClient writes SSE headers + ": connected" and registers the client', () => {
    const { res, written } = createFakeResponse()

    manager.addClient('user-1', SCOPED_PERMS, res)

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'text/event-stream' }),
    )
    expect(written).toContain(': connected\n\n')
    expect(manager.getActiveConnectionCount()).toBe(1)
  })

  it('broadcast delivers a formatted SSE frame to the client', async () => {
    const { res, written } = createFakeResponse()
    manager.addClient('user-1', ALL_PERMS, res)
    written.length = 0
    res.write.mockClear()

    bus.publish(messageCreatedEvent('c1'))
    await flush()

    const event = messageCreatedEvent('c1')
    expect(written).toContain(`event: message.created\ndata: ${JSON.stringify(event.payload)}\n\n`)
    expect(res.write).toHaveBeenCalled()
  })

  it('response "close" event triggers removeClient (count returns to 0)', () => {
    const { res, handlers } = createFakeResponse()
    manager.addClient('user-1', SCOPED_PERMS, res)
    expect(manager.getActiveConnectionCount()).toBe(1)

    handlers.close?.()

    expect(manager.getActiveConnectionCount()).toBe(0)
  })

  it('close() ends all responses and unsubscribes from the bus (count 0 after)', async () => {
    const { res } = createFakeResponse()
    manager.addClient('user-1', SCOPED_PERMS, res)
    expect(manager.getActiveConnectionCount()).toBe(1)

    await manager.close()

    expect(res.end).toHaveBeenCalled()
    expect(manager.getActiveConnectionCount()).toBe(0)

    // After close, publishing should NOT reach the (ended) client.
    res.write.mockClear()
    bus.publish(messageCreatedEvent('c1'))
    await flush()
    expect(res.write).not.toHaveBeenCalled()
  })

  it('the "error" listener from #1 triggers removeClient on abrupt disconnect', () => {
    const { res, handlers } = createFakeResponse()
    manager.addClient('user-1', SCOPED_PERMS, res)
    expect(manager.getActiveConnectionCount()).toBe(1)

    expect(handlers.error).toBeTypeOf('function')
    handlers.error?.()

    expect(manager.getActiveConnectionCount()).toBe(0)
  })

  it('heartbeat is cleared when the client is removed (no leaked writes)', () => {
    const { res, written, handlers } = createFakeResponse()
    manager.addClient('user-1', SCOPED_PERMS, res)
    const beforeHeartbeat = written.length

    handlers.close?.()
    // Advance well past the heartbeat interval; no new writes should occur.
    vi.advanceTimersByTime(60_000)

    expect(written.length).toBe(beforeHeartbeat)
    expect(manager.getActiveConnectionCount()).toBe(0)
  })

  it('a scoped client whose ScopeResolver returns true receives the event', async () => {
    fakeResolver.mockImplementation(async () => true)
    const { res, written } = createFakeResponse()
    manager.addClient('user-1', SCOPED_PERMS, res)
    written.length = 0
    res.write.mockClear()

    bus.publish(messageCreatedEvent('c9'))
    await flush()

    expect(fakeResolver).toHaveBeenCalledWith('user-1', SCOPED_PERMS, 'c9')
    expect(res.write).toHaveBeenCalled()
  })

  it('a scoped client whose ScopeResolver returns false does NOT receive the event', async () => {
    fakeResolver.mockImplementation(async () => false)
    const { res, written } = createFakeResponse()
    manager.addClient('user-1', SCOPED_PERMS, res)
    written.length = 0
    res.write.mockClear()

    bus.publish(messageCreatedEvent('c9'))
    await flush()

    expect(fakeResolver).toHaveBeenCalledWith('user-1', SCOPED_PERMS, 'c9')
    expect(res.write).not.toHaveBeenCalled()
    expect(written).toHaveLength(0)
  })

  it('a client with leads.read.all receives events for any conversationId', async () => {
    fakeResolver.mockImplementation(async (_u, perms) => perms.has('leads.read.all'))
    const { res, written } = createFakeResponse()
    manager.addClient('user-1', ALL_PERMS, res)
    written.length = 0
    res.write.mockClear()

    bus.publish(messageCreatedEvent('any-conv'))
    await flush()

    expect(fakeResolver).toHaveBeenCalledWith('user-1', ALL_PERMS, 'any-conv')
    expect(res.write).toHaveBeenCalled()
  })

  it('different clients are filtered independently (one allowed, one denied)', async () => {
    fakeResolver.mockImplementation(async (userId) => userId === 'allowed-user')
    const allowed = createFakeResponse()
    const denied = createFakeResponse()
    manager.addClient('allowed-user', SCOPED_PERMS, allowed.res)
    manager.addClient('denied-user', SCOPED_PERMS, denied.res)
    allowed.written.length = 0
    denied.written.length = 0
    allowed.res.write.mockClear()
    denied.res.write.mockClear()

    bus.publish(messageCreatedEvent('c-shared'))
    await flush()

    expect(allowed.res.write).toHaveBeenCalled()
    expect(denied.res.write).not.toHaveBeenCalled()
  })
})