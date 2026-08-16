export type PoolSelector =
  | { kind: 'coverage'; attribute: string; value: string }
  | { kind: 'executive_ids'; ids: string[] }
  | { kind: 'all_active' }

export type AssignmentStrategy = 'round_robin' | 'least_busy' | 'random'

export type AssignmentDirective =
  | { mode: 'executive'; executiveId: string }
  | { mode: 'pool'; selector: PoolSelector; strategy: AssignmentStrategy }
  | { mode: 'manual' }

export type AssignmentResult =
  | { mode: 'executive'; executiveId: string }
  | { mode: 'pool'; executiveId: string }
  | { mode: 'manual'; executiveId: null }

/** Contexto del lead (lead.context), incluye `answers: Record<string,string>`. */
export type LeadAssignmentContext = Record<string, unknown>