export type FlowButton = {
  id: string
  title: string
}

export type FlowNodeBase = {
  id: string
}

export type InteractiveButtonsNode = FlowNodeBase & {
  type: 'interactive_buttons'
  body: string
  buttons: FlowButton[]
  transitions: Record<string, string>
  onFreeText?: 'reprompt' | 'fallback_node' | 'handoff'
  fallbackNodeId?: string
}

export type TextMessageNode = FlowNodeBase & {
  type: 'text_message'
  body: string
  nextNodeId?: string
}

export type SetContextNode = FlowNodeBase & {
  type: 'set_context'
  values: Record<string, string>
  nextNodeId: string
}

export type SetIntentNode = FlowNodeBase & {
  type: 'set_intent'
  value: string
  nextNodeId: string
}

export type SetStatusNode = FlowNodeBase & {
  type: 'set_status'
  statusKey: string
  nextNodeId?: string
}

export type AssignExecutiveNode = FlowNodeBase & {
  type: 'assign_executive'
  ruleSetKey: string
  messageAfterAssign?: string
}

export type HandoffNode = FlowNodeBase & {
  type: 'handoff'
  message?: string
}

export type FlowNode =
  | InteractiveButtonsNode
  | TextMessageNode
  | SetContextNode
  | SetIntentNode
  | SetStatusNode
  | AssignExecutiveNode
  | HandoffNode

export type FlowDefinition = {
  nodes: Record<string, FlowNode>
}

export type CampaignStatusDefinition = {
  key: string
  label: string
  color?: string
  isInitial?: boolean
  isTerminal?: boolean
  isSuccess?: boolean
  sortOrder: number
}

export type AssignmentCondition = {
  intent?: string
  origin?: string
  tags?: string[]
  answers?: Record<string, string>
  _default?: true
}

export type ExecutivePool = {
  kind: 'role'
  roleSlug: string
  segments?: string[]
}

export type AssignmentTarget =
  | { type: 'user'; userId: string }
  | { type: 'round_robin'; pool: ExecutivePool }
  | { type: 'least_load'; pool: ExecutivePool }

export type AssignmentRule = {
  priority: number
  when: AssignmentCondition
  assign: AssignmentTarget
}
