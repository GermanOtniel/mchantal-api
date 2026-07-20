export type NormalizedMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'document'
  | 'video'
  | 'interactive'
  | 'unknown'

export type NormalizedMessage = {
  providerMessageId: string
  waId: string
  contactName?: string
  timestamp: Date
  type: NormalizedMessageType
  text?: string
  mediaProviderId?: string
  interactiveReplyId?: string
  interactiveReplyTitle?: string
  interactiveType?: 'button_reply' | 'list_reply'
}

export type NormalizedDeliveryStatus =
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'

export type NormalizedMessageStatus = {
  providerMessageId: string
  status: NormalizedDeliveryStatus
  timestamp: Date
  recipientWaId?: string
  errorMessage?: string
}

export type NormalizedInboundEvent =
  | { kind: 'message'; message: NormalizedMessage }
  | { kind: 'status'; status: NormalizedMessageStatus }
