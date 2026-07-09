import type { FastifyPluginAsync } from 'fastify'
import { getWhatsAppEnv } from '../../../config/env'
import { createWhatsAppProvider } from '../../../shared/whatsapp/create-whatsapp-provider'
import { WebhookController } from '../controllers/webhook.controller'
import { getConversationService } from '../create-conversation-service'
import { InboundWebhookService } from '../services/inbound-webhook.service'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer
  }
}

export const webhookPlugin: FastifyPluginAsync = async (app) => {
  const waEnv = getWhatsAppEnv()
  const provider = createWhatsAppProvider(waEnv)
  const conversations = getConversationService()
  const inbound = new InboundWebhookService(provider, conversations)
  const controller = new WebhookController(inbound)

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (request, body, done) => {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
      request.rawBody = buf
      try {
        const json = JSON.parse(buf.toString('utf8')) as unknown
        done(null, json)
      } catch (err) {
        done(err as Error, undefined)
      }
    }
  )

  app.get('/whatsapp', controller.verify)
  app.post('/whatsapp', controller.receive)
}
