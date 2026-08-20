import type { FastifyPluginAsync } from 'fastify'
import { getEnv } from '../../../config/env'
import { MetaWhatsAppProvider } from '../../../shared/whatsapp/meta/meta-whatsapp.provider'
import { WebhookController } from '../controllers/webhook.controller'
import { getConversationService } from '../create-conversation-service'
import { InboundWebhookService } from '../services/inbound-webhook.service'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer
  }
}

export const webhookPlugin: FastifyPluginAsync = async (app) => {
  const env = getEnv()
  const provider = new MetaWhatsAppProvider(env.whatsapp)
  const conversationService = getConversationService()
  const inbound = new InboundWebhookService(provider, conversationService)
  const controller = new WebhookController(inbound)

  // Captura el raw body para validar la firma X-Hub-Signature-256 de Meta.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (request, body, done) => {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
      request.rawBody = buf
      try {
        done(null, JSON.parse(buf.toString('utf8')) as unknown)
      } catch (err) {
        done(err as Error, undefined)
      }
    }
  )

  app.get('/v1/webhooks/whatsapp', controller.verify)
  app.post('/v1/webhooks/whatsapp', controller.receive)
}