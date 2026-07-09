export type MessageRealtimePayload = {
  id: string
  conversationId: string
  direction: 'inbound' | 'outbound'
  providerMessageId: string
  type: string
  bodyText: string | null
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  sentAt: string
}

export type ConversationUpdatedPayload = {
  conversationId: string
  lastMessageAt: string
  lastMessageDirection: 'inbound' | 'outbound'
  needsReply: boolean
}

export type MessageStatusUpdatedPayload = {
  conversationId: string
  providerMessageId: string
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
}

export type ConversationReadPayload = {
  conversationId: string
  userId: string
}

export type WhatsAppRealtimeEvent =
  | { type: 'message.created'; payload: { conversationId: string; message: MessageRealtimePayload } }
  | { type: 'message.status_updated'; payload: MessageStatusUpdatedPayload }
  | { type: 'conversation.updated'; payload: ConversationUpdatedPayload }
  | { type: 'conversation.read'; payload: ConversationReadPayload }

export const WHATSAPP_REALTIME_CHANNEL = 'whatsapp:events'
