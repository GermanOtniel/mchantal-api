import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'

export function buildApp() {
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty'
      }
    }
  })

  app.register(cors)
  app.register(helmet)

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  return app
}