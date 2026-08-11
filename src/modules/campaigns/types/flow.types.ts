// Modelo de nodos del flujo conversacional (slice: solo interactive_buttons + text_message).

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

export type FlowNode = InteractiveButtonsNode | TextMessageNode

export type FlowDefinition = { nodes: Record<string, FlowNode> }

export type ValidationIssue = { field: string; code: string; message: string }