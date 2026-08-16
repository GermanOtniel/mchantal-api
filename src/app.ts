import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import Fastify from 'fastify'
import { getEnv } from './config/env'
import { authPlugin } from './modules/auth/routes/auth.routes'
import { campaignsPlugin } from './modules/campaigns/routes/campaigns.routes'
import { webhookPlugin } from './modules/whatsapp/routes/webhook.routes'
import { publicLeadCapturePlugin } from './modules/leads/routes/lead-captures.routes'

export async function buildApp() {
  const env = getEnv()

  const app = Fastify({
    logger: env.isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true },
          },
        }
      : true,
  }).withTypeProvider<TypeBoxTypeProvider>()

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
  })
  await app.register(helmet)
  await app.register(authPlugin, { prefix: '/v1/auth' })
  await app.register(campaignsPlugin, { prefix: '/v1/campaigns' })
  await app.register(publicLeadCapturePlugin, { prefix: '/v1/public' })
  await app.register(webhookPlugin)

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  return app
}
