import type {
  CampaignEntryRule,
  CampaignParamDefinition,
  EntryRulesResult,
} from '../types/campaign-config.types'
import { DEFAULT_MESSAGE_TEMPLATE } from '../types/campaign-config.types'

function isDefaultRule(
  when: CampaignEntryRule['when']
): when is { _default: true } {
  return '_default' in when && when._default === true
}

function ruleMatches(
  when: CampaignEntryRule['when'],
  params: Record<string, string>
): boolean {
  if (isDefaultRule(when)) return false
  return Object.entries(when).every(([key, value]) => params[key] === value)
}

export function validateCaptureParams(
  params: Record<string, string>,
  definitions: CampaignParamDefinition[]
): Record<string, string> {
  const normalized: Record<string, string> = { ...params }

  for (const definition of definitions) {
    const value = normalized[definition.key]
    if (definition.required && (!value || value.trim() === '')) {
      if (definition.key === 'origin') {
        normalized.origin = 'unknown'
        continue
      }
      throw new Error(`Missing required param: ${definition.key}`)
    }
    if (
      value &&
      definition.allowedValues?.length &&
      !definition.allowedValues.includes(value)
    ) {
      throw new Error(`Invalid value for param ${definition.key}`)
    }
  }

  return normalized
}

export function evaluateEntryRules(
  rules: CampaignEntryRule[],
  params: Record<string, string>,
  folio: string
): EntryRulesResult {
  let messageTemplate = DEFAULT_MESSAGE_TEMPLATE
  let resolvedIntent: string | null = null
  let entryNodeId: string | null = null
  let initialStatusKey: string | null = null
  const initialContext: Record<string, string> = { ...params }
  const tags: string[] = []

  const matched =
    rules.find((rule) => ruleMatches(rule.when, params)) ??
    rules.find((rule) => isDefaultRule(rule.when))

  if (!matched) {
    return {
      messageTemplate: interpolateTemplate(messageTemplate, folio, initialContext),
      resolvedIntent,
      entryNodeId,
      initialContext,
      initialStatusKey,
      tags,
    }
  }

  for (const effect of matched.effects) {
    switch (effect.type) {
      case 'set_message_template':
        messageTemplate = effect.template
        break
      case 'set_intent':
        resolvedIntent = effect.value
        initialContext.intent = effect.value
        break
      case 'set_entry_node':
        entryNodeId = effect.nodeId
        break
      case 'set_initial_status':
        initialStatusKey = effect.statusKey
        break
      case 'set_context':
        Object.assign(initialContext, effect.values)
        break
      case 'append_message':
        messageTemplate = `${messageTemplate}${effect.text}`
        break
      case 'set_tags':
        tags.push(...effect.tags)
        break
      default:
        break
    }
  }

  return {
    messageTemplate: interpolateTemplate(messageTemplate, folio, initialContext),
    resolvedIntent,
    entryNodeId,
    initialContext,
    initialStatusKey,
    tags,
  }
}

export function interpolateTemplate(
  template: string,
  folio: string,
  context: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key === 'folio') return folio
    return context[key] ?? ''
  })
}

export function buildWhatsAppRedirectUrl(
  phoneE164: string,
  message: string
): string {
  const digits = phoneE164.replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
