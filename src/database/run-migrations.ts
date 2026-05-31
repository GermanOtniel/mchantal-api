import 'reflect-metadata'
import * as dotenv from 'dotenv'

dotenv.config()

import { AppDataSource } from './data-source'

async function main() {
  await AppDataSource.initialize()
  const executed = await AppDataSource.runMigrations({ transaction: 'all' })
  for (const m of executed) {
    console.log('Migration aplicada:', m.name)
  }
  if (executed.length === 0) {
    console.log('No hay migraciones pendientes')
  }
  await AppDataSource.destroy()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
