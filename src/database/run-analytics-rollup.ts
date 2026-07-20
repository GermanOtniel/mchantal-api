import 'reflect-metadata'
import * as dotenv from 'dotenv'
import { AppDataSource } from './data-source'
import { AnalyticsRollupService } from '../modules/analytics/services/analytics-rollup.service'
import { addDays, todayInTz } from '../modules/analytics/utils/analytics-dates'

dotenv.config()

async function main() {
  const args = process.argv.slice(2)
  let from: string | undefined
  let to: string | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from') from = args[i + 1]
    if (args[i] === '--to') to = args[i + 1]
  }

  await AppDataSource.initialize()

  const rollup = new AnalyticsRollupService()

  if (from && to) {
    await rollup.rollupRange(from, to)
    console.log(`Rollup completado: ${from} → ${to}`)
  } else {
    const yesterday = addDays(todayInTz(), -1)
    await rollup.rollupDay(yesterday)
    console.log(`Rollup completado para ayer: ${yesterday}`)
  }

  await AppDataSource.destroy()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
