import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { getWhatsAppEnv } from '../../../config/env'
import { jwtAuthHook } from '../../../shared/auth/jwt-auth.hook'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import {
  loadPermissionsHook,
  requirePermission,
} from '../../../shared/rbac/rbac.hooks'
import { createWhatsAppProvider } from '../../../shared/whatsapp/create-whatsapp-provider'
import { HttpError } from '../../auth/http-error'
import { WhatsAppController } from '../controllers/whatsapp.controller'
import { RealtimeController } from '../controllers/realtime.controller'
import {
  ConversationsListResponseSchema,
  ErrorResponseSchema,
  ListConversationsQuerySchema,
  ListMessagesQuerySchema,
  MessagesListResponseSchema,
  SendMessageBodySchema,
  SendMessageResponseSchema,
  ConversationIdParamsSchema,
  MarkConversationReadResponseSchema,
} from '../schemas/whatsapp.schemas'
import { getConversationService } from '../create-conversation-service'

export const whatsappPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const waEnv = getWhatsAppEnv()
  const provider = createWhatsAppProvider(waEnv)
  const conversations = getConversationService()
  const controller = new WhatsAppController(conversations, provider)
  const realtimeController = new RealtimeController()

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
      })
    }
    throw error
  })

  app.addHook('preHandler', jwtAuthHook)
  app.addHook('preHandler', loadPermissionsHook)

  app.get(
    '/conversations',
    {
      preHandler: requirePermission(PERMISSIONS.WHATSAPP_CONVERSATIONS_READ),
      schema: {
        querystring: ListConversationsQuerySchema,
        response: {
          200: ConversationsListResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    controller.listConversations
  )

  app.post(
    '/conversations/:id/read',
    {
      preHandler: requirePermission(PERMISSIONS.WHATSAPP_CONVERSATIONS_READ),
      schema: {
        params: ConversationIdParamsSchema,
        response: {
          200: MarkConversationReadResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    controller.markConversationRead
  )

  app.get(
    '/conversations/:id/messages',
    {
      preHandler: requirePermission(PERMISSIONS.WHATSAPP_CONVERSATIONS_READ),
      schema: {
        params: ConversationIdParamsSchema,
        querystring: ListMessagesQuerySchema,
        response: {
          200: MessagesListResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    controller.listMessages
  )

  app.post(
    '/messages',
    {
      preHandler: requirePermission(PERMISSIONS.WHATSAPP_MESSAGES_SEND),
      schema: {
        body: SendMessageBodySchema,
        response: {
          201: SendMessageResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          502: ErrorResponseSchema,
        },
      },
    },
    controller.sendMessage
  )

  app.get(
    '/events',
    {
      preHandler: requirePermission(PERMISSIONS.WHATSAPP_CONVERSATIONS_READ),
    },
    realtimeController.subscribe
  )
}
