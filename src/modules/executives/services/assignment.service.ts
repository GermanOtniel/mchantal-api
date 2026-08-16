import { HttpError } from '../../auth/http-error'
import type { ExecutiveData, ExecutiveRepositoryPort } from '../types/executives.types'
import type { AssignmentDirective, AssignmentResult, LeadAssignmentContext, PoolSelector } from '../types/assignment.types'

/** Interpola {{answers.<key>}} y {{<key>}} desde el contexto del lead. */
function interpolate(tpl: string, ctx: LeadAssignmentContext): string {
  return tpl.replace(/\{\{(\w+(?:\.\w+)?)\}\}/g, (_, expr: string) => {
    const [root, ...rest] = expr.split('.')
    let cur: unknown = ctx[root]
    for (const k of rest) {
      cur = (cur as Record<string, unknown> | undefined)?.[k]
    }
    return cur === undefined || cur === null ? '' : String(cur)
  })
}

/** Round-robin: el ejecutivo con lastAssignedAt más antiguo (null = más antiguo). */
function pickRoundRobin(candidates: ExecutiveData[]): ExecutiveData | null {
  if (candidates.length === 0) return null
  return candidates.reduce((best, cur) => {
    if (best.lastAssignedAt === null) return best
    if (cur.lastAssignedAt === null) return cur
    return cur.lastAssignedAt < best.lastAssignedAt ? cur : best
  })
}

export class AssignmentService {
  constructor(private readonly execs: ExecutiveRepositoryPort) {}

  async resolve(directive: AssignmentDirective, leadContext: LeadAssignmentContext): Promise<AssignmentResult> {
    switch (directive.mode) {
      case 'executive': {
        const exec = await this.execs.findById(directive.executiveId)
        if (!exec) throw new HttpError('Ejecutivo no encontrado', 400, 'EXECUTIVE_NOT_FOUND')
        return { mode: 'executive', executiveId: exec.id }
      }
      case 'manual':
        return { mode: 'manual', executiveId: null }
      case 'pool':
        return this.resolvePool(directive.selector, directive.strategy, leadContext)
    }
  }

  private async resolvePool(
    selector: PoolSelector,
    _strategy: string,
    leadContext: LeadAssignmentContext
  ): Promise<AssignmentResult> {
    const candidates = await this.candidatesFor(selector, leadContext)
    const chosen = pickRoundRobin(candidates)
    if (!chosen) return { mode: 'manual', executiveId: null }
    await this.execs.touchLastAssignedAt(chosen.id)
    return { mode: 'pool', executiveId: chosen.id }
  }

  private async candidatesFor(
    selector: PoolSelector,
    leadContext: LeadAssignmentContext
  ): Promise<ExecutiveData[]> {
    if (selector.kind === 'coverage') {
      const value = interpolate(selector.value, leadContext)
      if (value === '') return []
      return this.execs.findActiveByCoverage(selector.attribute, value)
    }
    if (selector.kind === 'all_active') {
      return this.execs.findAllActive()
    }
    // executive_ids: resolver cada uno y quedarse con los activos existentes
    const found = await Promise.all(selector.ids.map((id) => this.execs.findById(id)))
    return found.filter((e): e is ExecutiveData => e !== null && e.isActive)
  }
}