import type { FastifyReply, FastifyRequest } from 'fastify'
import { PERMISSIONS } from '../../../shared/rbac/permissions.catalog'
import { HttpError } from '../../auth/http-error'
import type { WhatsAppProvider } from '../../../shared/whatsapp/whatsapp-provider.interface'
import { ConversationService } from '../services/conversation.service'

export class WhatsAppController {
  constructor(
    private readonly conversations: ConversationService,
    private readonly provider: WhatsAppProvider
  ) {}

  listConversations = async (
    request: FastifyRequest<{
      Querystring: { limit?: number; cursor?: string; userId?: string }
    }>,
    reply: FastifyReply
  ) => {
    const limit = request.query.limit ?? 50
    const permissions = request.permissions ?? new Set<string>()
    const onlyAssigned =
      permissions.has(PERMISSIONS.LEADS_INBOX_ASSIGNED) &&
      !permissions.has(PERMISSIONS.LEADS_READ)
    const assigneeFilter = onlyAssigned
      ? request.user!.sub
      : request.query.userId

    const items = await this.conversations.listConversations(
      limit,
      request.query.cursor,
      request.user!.sub,
      assigneeFilter
    )
    const nextCursor =
      items.length === limit ? items[items.length - 1]?.id ?? null : null

    return reply.send({ items, nextCursor })
  }

  markConversationRead = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const result = await this.conversations.markConversationRead(
        request.params.id,
        request.user!.sub
      )
      return reply.send(result)
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

  listMessages = async (
    request: FastifyRequest<{
      Params: { id: string }
      Querystring: { limit?: number; cursor?: string }
    }>,
    reply: FastifyReply
  ) => {
    try {
      const limit = request.query.limit ?? 50
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
