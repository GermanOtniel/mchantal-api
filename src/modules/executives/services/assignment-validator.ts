export type ValidationIssue = { field: string; code: string; message: string }

function issue(field: string, code: string, message: string): ValidationIssue {
  return { field, code, message }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

const STRATEGIES = new Set(['round_robin', 'least_busy', 'random'])

/** Valida una AssignmentDirective. Devuelve [] si es válida. */
export function validateAssignmentDirective(d: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isPlainObject(d)) return [issue('directive', 'NOT_OBJECT', 'La directiva debe ser un objeto.')]

  const mode = d.mode
  if (mode === 'executive') {
    if (typeof d.executiveId !== 'string' || d.executiveId.trim() === '') {
      issues.push(issue('executiveId', 'EXECUTIVE_ID_EMPTY', 'executiveId no puede estar vacío.'))
    }
    return issues
  }
  if (mode === 'manual') {
    return issues
  }
  if (mode !== 'pool') {
    issues.push(issue('mode', 'MODE_UNKNOWN', `mode "${String(mode)}" no es soportado.`))
    return issues
  }

  // pool
  const selector = d.selector
  if (!isPlainObject(selector)) {
    issues.push(issue('selector', 'POOL_SELECTOR_MISSING', 'pool requiere selector.'))
    return issues
  }
  if (typeof d.strategy !== 'string') {
    issues.push(issue('strategy', 'STRATEGY_MISSING', 'pool requiere strategy.'))
  } else if (!STRATEGIES.has(d.strategy)) {
    issues.push(issue('strategy', 'STRATEGY_UNKNOWN', `strategy "${d.strategy}" no es soportado.`))
  }
  const kind = selector.kind
  if (kind === 'coverage') {
    if (typeof selector.attribute !== 'string' || selector.attribute.trim() === '') {
      issues.push(issue('selector.attribute', 'COVERAGE_ATTRIBUTE_EMPTY', 'coverage.attribute no puede estar vacío.'))
    }
    if (typeof selector.value !== 'string' || selector.value.trim() === '') {
      issues.push(issue('selector.value', 'COVERAGE_VALUE_EMPTY', 'coverage.value no puede estar vacío.'))
    }
  } else if (kind === 'executive_ids') {
    if (!Array.isArray(selector.ids) || selector.ids.length === 0) {
      issues.push(issue('selector.ids', 'EXECUTIVE_IDS_EMPTY', 'executive_ids debe tener al menos 1 id.'))
    }
  } else if (kind === 'all_active') {
    // sin campos extra
  } else {
    issues.push(issue('selector.kind', 'POOL_SELECTOR_KIND_UNKNOWN', `selector.kind "${String(kind)}" no es soportado.`))
  }
  return issues
}