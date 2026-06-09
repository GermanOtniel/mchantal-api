import type { FastifyReply, FastifyRequest } from 'fastify'
import { InboundWebhookService } from '../services/inbound-webhook.service'

export class WebhookController {
  constructor(private readonly inbound: InboundWebhookService) {}

  verify = async (
    request: FastifyRequest<{
      Querystring: {
        'hub.mode'?: string
        'hub.verify_token'?: string
        'hub.challenge'?: string
      }
    }>,
    reply: FastifyReply
  ) => {
    const challenge = this.inbound.verifySubscription({
      mode: request.query['hub.mode'],
      verifyToken: request.query['hub.verify_token'],
      challenge: request.query['hub.challenge'],
    })

    if (challenge == null) {
      return reply.status(403).send('Forbidden')
    }

    return reply.status(200).type('text/plain').send(challenge)
  }

  receive = async (request: FastifyRequest, reply: FastifyReply) => {
    const rawBody = request.rawBody
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      return reply.status(400).send({ error: 'Missing raw body', code: 'BAD_REQUEST' })
    }

    try {
      await this.inbound.handleWebhook(
        rawBody,
        request.headers,
        request.body
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Webhook error'
      if (message === 'Invalid webhook signature') {
        return reply.status(401).send({ error: message, code: 'INVALID_SIGNATURE' })
      }
      request.log.error(err)
      return reply.status(500).send({ error: 'Webhook processing failed', code: 'WEBHOOK_ERROR' })
    }

    return reply.status(200).send({ success: true })
  }
}
