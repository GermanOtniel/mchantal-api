// Modelo de nodos del flujo conversacional (slice: solo interactive_buttons + text_message).
import type {
  FlowDefinition,
  FlowNode,
  InteractiveButtonsNode,
  TextMessageNode,
  ValidationIssue,
} from '../types/flow.types'

export type {
  FlowDefinition,
  FlowNode,
  InteractiveButtonsNode,
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
    }
  }

  const entry = (Object.values(nodes) as { type?: string }[]).find(
    (n) => isPlainObject(n) && n.type === 'interactive_buttons'
  )
  if (!entry) {
    issues.push(issue('flow.nodes', 'ENTRY_NODE_MISSING', 'Debe existir al menos un nodo interactive_buttons (entrada).'))
  } else {
    detectCycles(nodes as Record<string, unknown>, (entry as { id: string }).id, issues)
  }

  return issues
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