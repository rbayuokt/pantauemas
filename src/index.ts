import { loadConfig, type Config } from './config.js'
import { TelegramApi } from './bot/api.js'
import { BotHandlers } from './bot/handlers.js'
import { openDb, type Db } from './core/db.js'
import { runBackfill } from './jobs/backfill.js'
import { runDigest } from './jobs/digest.js'
import { runTick } from './jobs/tick.js'
import { log, nextWibOccurrence } from './util.js'

async function safely(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    log(`${label} failed: ${err}`)
  }
}

async function scheduleLoop(db: Db, api: TelegramApi, config: Config): Promise<void> {
  log(`schedule: ticks at ${config.tickTimes.join(', ')} WIB, digest at ${config.digestTime} WIB`)
  await safely('tick', () => runTick(db, api, config))
  for (;;) {
    const events = [
      ...config.tickTimes.map((t) => ({ type: 'tick' as const, at: nextWibOccurrence(t, Date.now()) })),
      { type: 'digest' as const, at: nextWibOccurrence(config.digestTime, Date.now()) },
    ].sort((a, b) => a.at - b.at)
    const next = events[0]!
    log(`next ${next.type} at ${new Date(next.at).toISOString()}`)
    await new Promise((resolve) => setTimeout(resolve, next.at - Date.now()))
    if (next.type === 'tick') await safely('tick', () => runTick(db, api, config))
    else await safely('digest', () => runDigest(db, api, config))
  }
}

async function pollLoop(api: TelegramApi, handlers: BotHandlers): Promise<void> {
  for await (const update of api.poll()) {
    await handlers.handleUpdate(update)
  }
}

const command = process.argv[2] ?? 'bot'
const config = loadConfig()
const db = openDb(config.dataDir)
const api = new TelegramApi(config.telegramToken)

switch (command) {
  case 'bot': {
    const handlers = new BotHandlers(api, db, config)
    if (api.isLive) await handlers.registerCommands()
    await Promise.all([pollLoop(api, handlers), scheduleLoop(db, api, config)])
    break
  }
  case 'tick':
    await runTick(db, api, config)
    break
  case 'digest':
    await runDigest(db, api, config)
    break
  case 'backfill':
    await runBackfill(db)
    break
  default:
    console.error(`unknown command "${command}" (expected: bot | tick | digest | backfill)`)
    process.exit(1)
}
