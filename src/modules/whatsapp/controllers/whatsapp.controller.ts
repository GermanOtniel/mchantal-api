import type { FastifyReply, FastifyRequest } from 'fastify'
import { HttpError } from '../../auth/http-error'
import type { WhatsAppProvider } from '../../../shared/whatsapp/whatsapp-provider.interface'
import type { ConversationService } from '../services/conversation.service'

export class WhatsAppController {
  constructor(
    private readonly conversations: ConversationService,
    private readonly provider: WhatsAppProvider
  ) {}

  listMessages = async (
    request: FastifyRequest<{
      Params: { id: string }
      Querystring: { limit?: number; cursor?: string }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const limit = request.query.limit ?? 50
      await this.conversations.assertConversationInScope(
        request.params.id,
        request.permissions ?? new Set<string>(),
        request.user!.sub
      )
      const items = await this.conversations.listMessages(
        request.params.id,
        limit,
        request.query.cursor
      )
      const nextCursor =
        items.length === limit ? items[items.length - 1]?.id ?? null : null
      return reply.send({ items, nextCursor })
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        })
      }
      throw err
    }
  }

  sendMessage = async (
    request: FastifyRequest<{
      Body: { conversationId?: string; toWaId?: string; text: string }
    }>,
    reply: FastifyReply
  ) => {
    const { conversationId, toWaId, text } = request.body

    if (!conversationId && !toWaId) {
      return reply.status(400).send({
        error: 'Provide conversationId or toWaId',
        code: 'INVALID_RECIPIENT',
      })
    }

    try {
      // Scope check only when conversationId is present (Atender always sends
      // conversationId; toWaId-only is not used by the UI).
      if (conversationId) {
        await this.conversations.assertConversationInScope(
          conversationId,
          request.permissions ?? new Set<string>(),
          request.user!.sub
        )
      }
      const result = await this.conversations.sendTextMessage(this.provider, {
        conversationId,
        toWaId,
        text,
      })
      return reply.status(201).send(result)
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          code: err.code,
        })
      }
      request.log.error(err)
      return reply.status(502).send({
        error: 'Failed to send WhatsApp message',
        code: 'WHATSAPP_SEND_FAILED',
      })
    }
  }
}