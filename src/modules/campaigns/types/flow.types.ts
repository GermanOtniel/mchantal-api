// Modelo de nodos del flujo conversacional.
import type { AssignmentDirective } from '../../executives/types/assignment.types'

export type InteractiveButtonsNode = {
  id: string
  type: 'interactive_buttons'
  body: string
  buttons: { id: string; title: string }[]
  transitions: Record<string, string>
  onFreeText?: 'reprompt'
}

export type TextMessageNode = {
  id: string
  type: 'text_message'
  body: string
  nextNodeId?: string
}

export type TextInputNode = {
  id: string
  type: 'text_input'
  body: string
  storeAs: string
  matcher: { dictionaryId: string }
  transitions: Record<string, string> // categoryId → nodeId
  fallback?: 'reprompt' | { transition: string }
  assignment?: AssignmentDirective // default para todas las categorías
  assignmentOverrides?: Record<string, AssignmentDirective> // categoryId → directiva (excepciones)
}

export type FlowNode = InteractiveButtonsNode | TextMessageNode | TextInputNode

export type FlowDefinition = { nodes: Record<string, FlowNode>; entryNodeId?: string }

export type ValidationIssue = { field: string; code: string; message: string }