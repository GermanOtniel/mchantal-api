import { Type } from '@sinclair/typebox'

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
  code: Type.String(),
})

export const ConversationItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  status: Type.Union([Type.Literal('open'), Type.Literal('closed')]),
  leadId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  lastMessageAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  contact: Type.Object({
    waId: Type.String(),
    profileName: Type.Union([Type.String(), Type.Null()]),
  }),
  createdAt: Type.String({ format: 'date-time' }),
})

export const ConversationsListResponseSchema = Type.Object({
  items: Type.Array(ConversationItemSchema),
  nextCursor: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
})

export const ListConversationsQuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  cursor: Type.Optional(Type.String({ format: 'uuid' })),
})

export const MessageItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  conversationId: Type.String({ format: 'uuid' }),
  direction: Type.Union([Type.Literal('inbound'), Type.Literal('outbound')]),
  providerMessageId: Type.String(),
  type: Type.String(),
  bodyText: Type.Union([Type.String(), Type.Null()]),
  status: Type.String(),
  sentAt: Type.String({ format: 'date-time' }),
})

export const MessagesListResponseSchema = Type.Object({
  items: Type.Array(MessageItemSchema),
  nextCursor: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
})

export const ListMessagesQuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
  cursor: Type.Optional(Type.String({ format: 'uuid' })),
})

export const SendMessageBodySchema = Type.Object(
  {
    conversationId: Type.Optional(Type.String({ format: 'uuid' })),
    toWaId: Type.Optional(Type.String({ minLength: 8, maxLength: 20 })),
    text: Type.String({ minLength: 1, maxLength: 4096 }),
  },
  {
    additionalProperties: false,
  }
)

export const SendMessageResponseSchema = Type.Object({
  providerMessageId: Type.String(),
  conversationId: Type.String({ format: 'uuid' }),
})

export const ConversationIdParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})
