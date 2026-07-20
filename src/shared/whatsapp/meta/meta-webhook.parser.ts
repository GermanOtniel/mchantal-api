import type {
  NormalizedInboundEvent,
  NormalizedMessage,
  NormalizedMessageStatus,
  NormalizedMessageType,
} from '../types/inbound.types'

type MetaWebhookPayload = {
  object?: string
  entry?: Array<{
    changes?: Array<{
      value?: MetaChangeValue
    }>
  }>
}

type MetaChangeValue = {
  messaging_product?: string
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>
  messages?: MetaInboundMessage[]
  statuses?: MetaStatus[]
}

type MetaInboundMessage = {
  id?: string
  from?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  interactive?: {
    type?: string
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string }
  }
  image?: { id?: string; caption?: string }
  audio?: { id?: string }
  document?: { id?: string; caption?: string; filename?: string }
  video?: { id?: string; caption?: string }
}

type MetaStatus = {
  id?: string
  status?: string
  timestamp?: string
  recipient_id?: string
  errors?: Array<{ title?: string; message?: string }>
}

function parseTimestamp(ts: string | undefined): Date {
  if (!ts) return new Date()
  const n = Number.parseInt(ts, 10)
  if (Number.isNaN(n)) return new Date()
  return new Date(n * 1000)
}

function mapMessageType(type: string | undefined): NormalizedMessageType {
  switch (type) {
    case 'text':
      return 'text'
    case 'image':
      return 'image'
    case 'audio':
      return 'audio'
    case 'document':
      return 'document'
    case 'video':
      return 'video'
    case 'interactive':
      return 'interactive'
    default:
      return 'unknown'
  }
}

function normalizeMessage(
  msg: MetaInboundMessage,
  contactName?: string
): NormalizedMessage | null {
  if (!msg.id || !msg.from) return null

  const type = mapMessageType(msg.type)
  let text: string | undefined
  let mediaProviderId: string | undefined
  let interactiveReplyId: string | undefined
  let interactiveReplyTitle: string | undefined
  let interactiveType: 'button_reply' | 'list_reply' | undefined

  if (type === 'text') {
    text = msg.text?.body
  } else if (type === 'interactive') {
    if (msg.interactive?.type === 'button_reply') {
      interactiveType = 'button_reply'
      interactiveReplyId = msg.interactive.button_reply?.id
      interactiveReplyTitle = msg.interactive.button_reply?.title
      text = interactiveReplyTitle
    } else if (msg.interactive?.type === 'list_reply') {
      interactiveType = 'list_reply'
      interactiveReplyId = msg.interactive.list_reply?.id
      interactiveReplyTitle = msg.interactive.list_reply?.title
      text = interactiveReplyTitle
    }
  } else if (type === 'image') {
    mediaProviderId = msg.image?.id
    text = msg.image?.caption
  } else if (type === 'audio') {
    mediaProviderId = msg.audio?.id
  } else if (type === 'document') {
    mediaProviderId = msg.document?.id
    text = msg.document?.caption ?? msg.document?.filename
  } else if (type === 'video') {
    mediaProviderId = msg.video?.id
    text = msg.video?.caption
  }

  return {
    providerMessageId: msg.id,
    waId: msg.from.replace(/\D/g, ''),
    contactName,
    timestamp: parseTimestamp(msg.timestamp),
    type,
    text,
    mediaProviderId,
    interactiveReplyId,
    interactiveReplyTitle,
    interactiveType,
  }
}

function normalizeStatus(st: MetaStatus): NormalizedMessageStatus | null {
  if (!st.id || !st.status) return null

  const statusMap: Record<string, NormalizedMessageStatus['status'] | undefined> =
    {
      sent: 'sent',
      delivered: 'delivered',
      read: 'read',
      failed: 'failed',
    }

  const mapped = statusMap[st.status]
  if (!mapped) return null

  const err = st.errors?.[0]

  return {
    providerMessageId: st.id,
    status: mapped,
    timestamp: parseTimestamp(st.timestamp),
    recipientWaId: st.recipient_id?.replace(/\D/g, ''),
    errorMessage: err?.message ?? err?.title,
  }
}

export function parseMetaInboundPayload(body: unknown): NormalizedInboundEvent[] {
  const payload = body as MetaWebhookPayload
  if (payload?.object !== 'whatsapp_business_account') return []

  const events: NormalizedInboundEvent[] = []

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue

      const contactName = value.contacts?.[0]?.profile?.name

      for (const msg of value.messages ?? []) {
        const normalized = normalizeMessage(msg, contactName)
        if (normalized) {
          events.push({ kind: 'message', message: normalized })
        }
      }

      for (const st of value.statuses ?? []) {
        const normalized = normalizeStatus(st)
        if (normalized) {
          events.push({ kind: 'status', status: normalized })
        }
      }
    }
  }

  return events
}
