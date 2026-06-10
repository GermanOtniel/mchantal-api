import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import Fastify from 'fastify'
import { getEnv } from './config/env'
import { authPlugin } from './modules/auth/routes/auth.routes'
import { rbacPlugin } from './modules/rbac/routes/rbac.routes'
import { whatsappModulePlugin } from './modules/whatsapp/routes'

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
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
  await app.register(authPlugin, { prefix: '/v1/auth' })
  await app.register(rbacPlugin, { prefix: '/v1/rbac' })

  if (env.whatsappEnabled) {
    await app.register(whatsappModulePlugin)
  }

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  return app
}
