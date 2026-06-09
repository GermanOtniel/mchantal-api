import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { getWhatsAppEnv } from '../../../config/env'
import { jwtAuthHook } from '../../../shared/auth/jwt-auth.hook'
import { createWhatsAppProvider } from '../../../shared/whatsapp/create-whatsapp-provider'
import { HttpError } from '../../auth/http-error'
import { WhatsAppController } from '../controllers/whatsapp.controller'
import {
  ConversationsListResponseSchema,
  ErrorResponseSchema,
  ListConversationsQuerySchema,
  ListMessagesQuerySchema,
  MessagesListResponseSchema,
  SendMessageBodySchema,
  SendMessageResponseSchema,
  ConversationIdParamsSchema,
} from '../schemas/whatsapp.schemas'
import { ConversationService } from '../services/conversation.service'

export const whatsappPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const waEnv = getWhatsAppEnv()
  const provider = createWhatsAppProvider(waEnv)
  const conversations = new ConversationService()
  const controller = new WhatsAppController(conversations, provider)

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

  app.get(
    '/conversations',
    {
      schema: {
        querystring: ListConversationsQuerySchema,
        response: {
          200: ConversationsListResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    controller.listConversations
  )

  app.get(
    '/conversations/:id/messages',
    {
      schema: {
        params: ConversationIdParamsSchema,
        querystring: ListMessagesQuerySchema,
        response: {
          200: MessagesListResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    controller.listMessages
  )

  app.post(
    '/messages',
    {
      schema: {
        body: SendMessageBodySchema,
        response: {
          201: SendMessageResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          502: ErrorResponseSchema,
        },
      },
    },
    controller.sendMessage
  )
}
