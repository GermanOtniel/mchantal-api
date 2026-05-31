import 'reflect-metadata'
import * as dotenv from 'dotenv'

dotenv.config()

import { getEnv } from './config/env'
getEnv()

import { buildApp } from './app'
import { AppDataSource } from './database/data-source'

const PORT = Number(process.env.PORT) || 3001

async function main() {
  try {
    await AppDataSource.initialize()
    console.log('✅ Base de datos conectada')
  } catch (err) {
    console.error('❌ Error conectando a la base de datos:', err)
    process.exit(1)
  }

  const app = await buildApp()

  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
}

main().catch(console.error)
