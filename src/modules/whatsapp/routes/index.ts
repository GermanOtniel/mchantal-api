import type { FastifyPluginAsync } from 'fastify'
import { webhookPlugin } from './webhook.routes'
import { whatsappPlugin } from './whatsapp.routes'

export const whatsappModulePlugin: FastifyPluginAsync = async (app) => {
  await app.register(webhookPlugin, { prefix: '/v1/webhooks' })
  await app.register(whatsappPlugin, { prefix: '/v1/whatsapp' })
}
