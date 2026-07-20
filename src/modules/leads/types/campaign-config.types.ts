export type CampaignParamKind = 'tracking' | 'intent' | 'action'

export type CampaignParamDefinition = {
  key: string
  label: string
  kind: CampaignParamKind
  required?: boolean
  allowedValues?: string[]
}

export type CampaignEntryEffect =
  | { type: 'set_message_template'; template: string }
  | { type: 'set_intent'; value: string }
  | { type: 'set_initial_status'; statusKey: string }
  | { type: 'set_entry_node'; nodeId: string }
  | { type: 'set_context'; values: Record<string, string> }
  | { type: 'append_message'; text: string }
  | { type: 'set_tags'; tags: string[] }

export type CampaignEntryRule = {
  when: Record<string, string> | { _default: true }
  effects: CampaignEntryEffect[]
}

export type EntryRulesResult = {
  messageTemplate: string
  resolvedIntent: string | null
  entryNodeId: string | null
  initialContext: Record<string, string>
  initialStatusKey: string | null
  tags: string[]
}

export const DEFAULT_ORIGIN_PARAM: CampaignParamDefinition = {
  key: 'origin',
  label: 'Origen',
  kind: 'tracking',
  required: true,
}

export const DEFAULT_MESSAGE_TEMPLATE =
  'Hola Madame Chantal 👋\nMi folio es {{folio}}\nMe gustaría recibir más información.'

export function withDefaultOriginParam(
  definitions: CampaignParamDefinition[]
): CampaignParamDefinition[] {
  const withoutOrigin = definitions.filter((d) => d.key !== 'origin')
  return [DEFAULT_ORIGIN_PARAM, ...withoutOrigin]
}
