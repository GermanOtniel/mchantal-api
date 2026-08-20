import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { getEnv } from '../../../config/env'
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
  ConversationIdParamsSchema,
  ErrorResponseSchema,
  ListMessagesQuerySchema,
  MessagesListResponseSchema,
  SendMessageBodySchema,
  SendMessageResponseSchema,
} from '../schemas/whatsapp.schemas'
import { getConversationService } from '../create-conversation-service'

/**
 * Endpoints de WhatsApp para la vista "Atender lead" (Fase 1, lead-attend).
 * Sólo 3 rutas, todas gated por LEADS_ATTEND:
 *   GET  /conversations/:id/messages  — historial de mensajes de la conversación
 *   POST /messages                    — envío de texto (siempre con conversationId)
 *   GET  /events                       — stream SSE en tiempo real
 *
 * No se exponen /conversations (listado) ni /conversations/:id/read (mark-read):
 * esos son de Fase 2 (panel de conversaciones).
 */
export const whatsappPlugin: FastifyPluginAsyncTypebox = async (app) => {
  const provider = createWhatsAppProvider(getEnv().whatsapp)
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
    '/conversations/:id/messages',
    {
      preHandler: requirePermission(PERMISSIONS.LEADS_ATTEND),
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
      preHandler: requirePermission(PERMISSIONS.LEADS_ATTEND),
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
    { preHandler: requirePermission(PERMISSIONS.LEADS_ATTEND) },
    realtimeController.subscribe
  )
}
