// Modelo de nodos del flujo conversacional (interactive_buttons + text_message + text_input).
import { validateAssignmentDirective } from '../../executives/services/assignment-validator'
import type {
  FlowDefinition,
  FlowNode,
  InteractiveButtonsNode,
  TextInputNode,
  TextMessageNode,
  ValidationIssue,
} from '../types/flow.types'

export type {
  FlowDefinition,
  FlowNode,
  InteractiveButtonsNode,
  TextInputNode,
  TextMessageNode,
  ValidationIssue,
} from '../types/flow.types'

const MAX_BUTTONS = 3

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function issue(field: string, code: string, message: string): ValidationIssue {
  return { field, code, message }
}

/** Valida la estructura y coherencia de un flowDefinition. Devuelve [] si es valido. */
export function validateFlowDefinition(flow: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const nodes = (flow as { nodes?: unknown } | null)?.nodes
  if (!isPlainObject(nodes)) {
    issues.push(issue('nodes', 'NODES_NOT_OBJECT', 'flowDefinition.nodes debe ser un objeto.'))
    return issues
  }

  const nodeIds = new Set(Object.keys(nodes))
  const entries = Object.entries(nodes) as [string, unknown][]

  const entryNodeIdRaw = (flow as { entryNodeId?: unknown } | null)?.entryNodeId
  if (entryNodeIdRaw !== undefined) {
    const target = nodes[entryNodeIdRaw as string] as { type?: string } | undefined
    if (!target || target.type !== 'interactive_buttons') {
      issues.push(issue('flow.entryNodeId', 'ENTRY_NODE_INVALID', 'entryNodeId no apunta a un nodo interactive_buttons existente.'))
    }
  }

  for (const [key, raw] of entries) {
    const base = `flow.nodes.${key}`
    const node = raw as { id?: unknown; type?: unknown }
    if (!isPlainObject(node)) {
      issues.push(issue(base, 'NODES_NOT_OBJECT', `El nodo "${key}" no es un objeto.`))
      continue
    }
    if (node.id !== key) {
      issues.push(issue(`${base}.id`, 'ID_MISMATCH', `El id del nodo ("${String(node.id)}") no coincide con su clave ("${key}").`))
    }

    if (node.type === 'interactive_buttons') {
      validateInteractive(base, node as unknown as InteractiveButtonsNode, nodeIds, issues)
    } else if (node.type === 'text_message') {
      validateText(base, node as unknown as TextMessageNode, nodeIds, issues)
    } else if (node.type === 'text_input') {
      validateTextInput(base, node as unknown as TextInputNode, nodeIds, issues)
    }
  }

  const entry = resolveEntry(nodes, entryNodeIdRaw as string | undefined)
  if (!entry) {
    issues.push(issue('flow.nodes', 'ENTRY_NODE_MISSING', 'Debe existir al menos un nodo interactive_buttons (entrada).'))
  } else {
    detectCycles(nodes as Record<string, unknown>, entry, issues)
  }

  return issues
}

/** Resuelve el nodo de entrada: entryNodeId (válido) → 'welcome' (si es interactive) → primer interactive. */
function resolveEntry(nodes: Record<string, unknown>, entryNodeId?: string): string | null {
  if (entryNodeId) {
    const n = nodes[entryNodeId] as { type?: string } | undefined
    if (n && n.type === 'interactive_buttons') return entryNodeId
  }
  const welcome = nodes['welcome'] as { type?: string } | undefined
  if (welcome && welcome.type === 'interactive_buttons') return 'welcome'
  const first = (Object.values(nodes) as { id?: string; type?: string }[]).find(
    (n) => isPlainObject(n) && n.type === 'interactive_buttons'
  )
  return first?.id ?? null
}

function validateInteractive(
  base: string,
  node: InteractiveButtonsNode,
  nodeIds: Set<string>,
  issues: ValidationIssue[]
): void {
  const buttons = node.buttons
  if (!Array.isArray(buttons) || buttons.length === 0) {
    issues.push(issue(`${base}.buttons`, 'BUTTONS_EMPTY', 'La pregunta debe tener al menos 1 botón.'))
    return
  }
  if (buttons.length > MAX_BUTTONS) {
    issues.push(issue(`${base}.buttons`, 'BUTTONS_TOO_MANY', `La pregunta tiene ${buttons.length} botones; el máximo es ${MAX_BUTTONS}.`))
  }
  const seenBtn = new Set<string>()
  const transitions = node.transitions ?? {}
  for (const btn of buttons) {
    if (typeof btn.title !== 'string' || btn.title.trim() === '') {
      issues.push(issue(`${base}.buttons`, 'BUTTON_TITLE_EMPTY', 'Todo botón debe tener un título no vacío.'))
    }
    if (seenBtn.has(btn.id)) {
      issues.push(issue(`${base}.buttons`, 'BUTTON_ID_DUPLICATE', `El id de botón "${btn.id}" está repetido.`))
    }
    seenBtn.add(btn.id)
    const target = transitions[btn.id]
    if (target === undefined || target === '') {
      issues.push(issue(`${base}.transitions.${btn.id}`, 'BRANCH_NOT_TERMINATED', `El botón "${btn.id}" no conduce a ningún nodo (falta cierre).`))
    } else if (!nodeIds.has(target)) {
      issues.push(issue(`${base}.transitions.${btn.id}`, 'NODE_REF_NOT_FOUND', `La transición del botón "${btn.id}" apunta a un nodo inexistente ("${target}").`))
    }
  }
  if (node.onFreeText !== undefined && node.onFreeText !== 'reprompt') {
    issues.push(issue(`${base}.onFreeText`, 'ON_FREE_TEXT_UNSUPPORTED', `onFreeText "${String(node.onFreeText)}" no es soportado en este slice (solo "reprompt").`))
  }
}

function validateText(
  base: string,
  node: TextMessageNode,
  nodeIds: Set<string>,
  issues: ValidationIssue[]
): void {
  const next = node.nextNodeId
  if (next !== undefined && next !== '' && !nodeIds.has(next)) {
    issues.push(issue(`${base}.nextNodeId`, 'NODE_REF_NOT_FOUND', `nextNodeId apunta a un nodo inexistente ("${next}").`))
  }
}

function validateTextInput(
  base: string,
  node: TextInputNode,
  nodeIds: Set<string>,
  issues: ValidationIssue[]
): void {
  if (typeof node.body !== 'string' || node.body.trim() === '') {
    issues.push(issue(`${base}.body`, 'TEXT_INPUT_BODY_EMPTY', 'El prompt de text_input no puede estar vacío.'))
  }
  if (typeof node.storeAs !== 'string' || node.storeAs.trim() === '') {
    issues.push(issue(`${base}.storeAs`, 'TEXT_INPUT_STOREAS_EMPTY', 'storeAs no puede estar vacío.'))
  }
  if (!node.matcher || typeof node.matcher.dictionaryId !== 'string' || node.matcher.dictionaryId.trim() === '') {
    issues.push(issue(`${base}.matcher`, 'TEXT_INPUT_DICTIONARY_MISSING', 'matcher.dictionaryId es obligatorio.'))
  }
  const transitions = node.transitions ?? {}
  for (const [catId, target] of Object.entries(transitions)) {
    if (!target || !nodeIds.has(target)) {
      issues.push(issue(`${base}.transitions.${catId}`, 'NODE_REF_NOT_FOUND', `La transición de la categoría "${catId}" apunta a un nodo inexistente ("${target}").`))
    }
  }
  const fallback = node.fallback
  if (typeof fallback === 'object' && fallback !== null) {
    const t = fallback.transition
    if (!t || !nodeIds.has(t)) {
      issues.push(issue(`${base}.fallback.transition`, 'NODE_REF_NOT_FOUND', `fallback.transition apunta a un nodo inexistente ("${String(t)}").`))
    }
  }
  if (node.assignment) {
    const a = validateAssignmentDirective(node.assignment)
    if (a.length > 0) {
      issues.push(issue(`${base}.assignment`, 'ASSIGNMENT_INVALID', 'La directiva de asignación es inválida.'))
    }
  }
  if (node.assignmentOverrides) {
    for (const [catId, directive] of Object.entries(node.assignmentOverrides)) {
      const a = validateAssignmentDirective(directive)
      if (a.length > 0) {
        issues.push(issue(`${base}.assignmentOverrides.${catId}`, 'ASSIGNMENT_INVALID', `El override de asignación para "${catId}" es inválido.`))
      }
    }
  }
}

/** DFS desde la entrada; detecta ciclos. */
function detectCycles(
  nodes: Record<string, unknown>,
  entryId: string,
  issues: ValidationIssue[]
): void {
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()

  const dfs = (id: string): boolean => {
    const node = nodes[id] as { type?: string; buttons?: { id: string }[]; transitions?: Record<string, string>; nextNodeId?: string } | undefined
    if (!node || !isPlainObject(node)) return false
    const c = color.get(id) ?? WHITE
    if (c === GRAY) {
      issues.push(issue(`flow.nodes.${id}`, 'CYCLE', `Se detectó un ciclo que incluye el nodo "${id}".`))
      return true
    }
    if (c === BLACK) return false
    color.set(id, GRAY)
    let cycle = false
    if (node.type === 'interactive_buttons') {
      for (const btn of node.buttons ?? []) {
        const t = node.transitions?.[btn.id]
        if (t && nodes[t] && dfs(t)) { cycle = true; break }
      }
    } else if (node.type === 'text_message') {
      if (node.nextNodeId && nodes[node.nextNodeId] && dfs(node.nextNodeId)) cycle = true
    } else if (node.type === 'text_input') {
      const transitions = node.transitions ?? {}
      for (const t of Object.values(transitions)) {
        if (t && nodes[t] && dfs(t)) { cycle = true; break }
      }
      if (!cycle) {
      const fb = node.fallback
      if (typeof fb === 'object' && fb !== null && nodes[fb.transition] && dfs(fb.transition)) cycle = true
      }
    }
    color.set(id, BLACK)
    return cycle
  }

  dfs(entryId)
}

/** Valida el mensaje de entrada (el que el lead envía). Debe contener {{folio}}. */
export function validateEntryMessage(entryMessage: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (typeof entryMessage !== 'string' || entryMessage.trim() === '') {
    issues.push(issue('entryMessage', 'ENTRY_MESSAGE_EMPTY', 'El mensaje de entrada no puede estar vacío.'))
    return issues
  }
  if (!entryMessage.includes('{{folio}}')) {
    issues.push(issue('entryMessage', 'ENTRY_MESSAGE_NO_FOLIO', 'El mensaje de entrada debe contener {{folio}}.'))
  }
  return issues
}