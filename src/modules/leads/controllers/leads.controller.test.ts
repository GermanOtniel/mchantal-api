import { describe, it, expect, vi } from 'vitest'
import { LeadsController } from './leads.controller'
import { HttpError } from '../../auth/http-error'
import type { LeadsService } from '../services/leads.service'

function makeService(over: Partial<LeadsService> = {}): LeadsService {
  return {
    listLeads: vi.fn(async () => ({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 })),
    filterOptions: vi.fn(async () => ({ campaigns: [], executives: [] })),
    clearNeedsReply: vi.fn(async () => {}),
    getLead: vi.fn(async () => ({ id: 'lead-1' })),
    getTimeline: vi.fn(async () => []),
    reassign: vi.fn(async () => {}),
    changeStatus: vi.fn(async () => {}),
    resumeFlow: vi.fn(async () => {}),
    listExecutives: vi.fn(async () => []),
    ...over,
  } as unknown as LeadsService
}

type Sent = { status?: number; body?: unknown }

function makeReply(): { reply: unknown; sent: Sent[] } {
  const sent: Sent[] = []
  const reply = {
    status(code: number) {
      const cur: Sent = { status: code }
      sent.push(cur)
      return {
        send: (body: unknown) => {
          cur.body = body
          return reply
        },
      }
    },
    send(body: unknown) {
      const cur: Sent = {}
      sent.push(cur)
      cur.body = body
      return reply
    },
    code(c: number) {
      return reply.status(c)
    },
  }
  return { reply, sent }
}

function makeRequest(over: Partial<{
  params: Record<string, string>
  body: Record<string, unknown>
  permissions: Set<string> | undefined
  user: { sub: string } | undefined
}> = {}): { request: unknown } {
  const request = {
    params: over.params ?? { id: 'lead-1' },
    body: over.body ?? {},
    query: {},
    permissions: over.permissions ?? new Set<string>(['leads.attend', 'leads.read.all']),
    user: 'user' in over ? over.user : { sub: 'user-1' },
  }
  return { request }
}

describe('LeadsController.getLead', () => {
  it('calls service.getLead with {permissions, userId, leadId} and sends result', async () => {
    const service = makeService({ getLead: vi.fn(async () => ({ id: 'lead-1', folio: 'F-1' })) })
    const controller = new LeadsController(service)
    const { request } = makeRequest()
    const { reply, sent } = makeReply()

    await controller.getLead(request as never, reply as never)

    expect(service.getLead).toHaveBeenCalledWith({
      permissions: expect.any(Set),
      userId: 'user-1',
      leadId: 'lead-1',
    })
    expect(sent[0].status).toBeUndefined()
    expect(sent[0].body).toEqual({ id: 'lead-1', folio: 'F-1' })
  })

  it('missing user → throws HttpError 403 (handleError → reply 403)', async () => {
    const service = makeService()
    const controller = new LeadsController(service)
    const { request } = makeRequest({ user: undefined })
    const { reply, sent } = makeReply()

    await controller.getLead(request as never, reply as never)

    expect(sent[0].status).toBe(403)
    expect(sent[0].body).toEqual({ code: 'FORBIDDEN', message: 'Forbidden' })
    expect(service.getLead).not.toHaveBeenCalled()
  })

  it('service throws HttpError 404 → handleError → reply 404', async () => {
    const service = makeService({
      getLead: vi.fn(async () => {
        throw new HttpError('Lead not found', 404, 'LEAD_NOT_FOUND')
      }),
    })
    const controller = new LeadsController(service)
    const { request } = makeRequest()
    const { reply, sent } = makeReply()

    await controller.getLead(request as never, reply as never)

    expect(sent[0].status).toBe(404)
    expect(sent[0].body).toEqual({ code: 'LEAD_NOT_FOUND', message: 'Lead not found' })
  })
})

describe('LeadsController.getTimeline', () => {
  it('calls service.getTimeline and sends { items: result }', async () => {
    const events = [{ id: 'e1', leadId: 'lead-1', type: 'reassignment' }]
    const service = makeService({ getTimeline: vi.fn(async () => events) })
    const controller = new LeadsController(service)
    const { request } = makeRequest()
    const { reply, sent } = makeReply()

    await controller.getTimeline(request as never, reply as never)

    expect(service.getTimeline).toHaveBeenCalledWith({
      permissions: expect.any(Set),
      userId: 'user-1',
      leadId: 'lead-1',
    })
    expect(sent[0].body).toEqual({ items: events })
  })
})

describe('LeadsController.reassign', () => {
  it('calls service.reassign with body fields and returns 204', async () => {
    const service = makeService()
    const controller = new LeadsController(service)
    const { request } = makeRequest({
      body: { assigneeUserId: 'exec-2', reason: 'because' },
      permissions: new Set<string>(['leads.reassign', 'leads.read.all']),
    })
    const { reply, sent } = makeReply()

    await controller.reassign(request as never, reply as never)

    expect(service.reassign).toHaveBeenCalledWith({
      permissions: expect.any(Set),
      userId: 'user-1',
      leadId: 'lead-1',
      assigneeUserId: 'exec-2',
      reason: 'because',
    })
    expect(sent[0].status).toBe(204)
  })
})

describe('LeadsController.changeStatus', () => {
  it('calls service.changeStatus with body fields and returns 204', async () => {
    const service = makeService()
    const controller = new LeadsController(service)
    const { request } = makeRequest({
      body: { status: 'won', reason: 'closed' },
      permissions: new Set<string>(['leads.change_status', 'leads.read.all']),
    })
    const { reply, sent } = makeReply()

    await controller.changeStatus(request as never, reply as never)

    expect(service.changeStatus).toHaveBeenCalledWith({
      permissions: expect.any(Set),
      userId: 'user-1',
      leadId: 'lead-1',
      status: 'won',
      reason: 'closed',
    })
    expect(sent[0].status).toBe(204)
  })
})

describe('LeadsController.resumeFlow', () => {
  it('calls service.resumeFlow and returns 204', async () => {
    const service = makeService()
    const controller = new LeadsController(service)
    const { request } = makeRequest()
    const { reply, sent } = makeReply()

    await controller.resumeFlow(request as never, reply as never)

    expect(service.resumeFlow).toHaveBeenCalledWith({
      permissions: expect.any(Set),
      userId: 'user-1',
      leadId: 'lead-1',
    })
    expect(sent[0].status).toBe(204)
  })
})

describe('LeadsController.listExecutives', () => {
  it('calls service.listExecutives and sends { items: result }', async () => {
    const execs = [{ userId: 'exec-1', fullName: 'Ana', activeLeads: 3 }]
    const service = makeService({ listExecutives: vi.fn(async () => execs) })
    const controller = new LeadsController(service)
    const { request } = makeRequest({
      permissions: new Set<string>(['leads.reassign', 'leads.read.all']),
    })
    const { reply, sent } = makeReply()

    await controller.listExecutives(request as never, reply as never)

    expect(service.listExecutives).toHaveBeenCalledWith({
      permissions: expect.any(Set),
      userId: 'user-1',
      leadId: 'lead-1',
    })
    expect(sent[0].body).toEqual({ items: execs })
  })
})