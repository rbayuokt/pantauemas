import type { Db } from './db.js'
import { bumpSpotCalls, countSpotCalls, getSpot, latestSpots, storeSpot, type SpotRow } from './store.js'
import { fetchMetalSpot, type MetalSpot } from '../sources/metalprice.js'
import type { DriverInfo } from '../types.js'
import { log, wibDate } from '../util.js'

/**
 * Hard ceiling on metalpriceapi attempts per month. The free plan allows 100;
 * one successful call per day needs at most 31. The gap is retry headroom for
 * days the API is down, and the ledger refuses to go past it no matter how
 * often the bot restarts. Attempts are counted before the call, so failures
 * spend budget too - safe by default.
 */
const MONTHLY_CALL_BUDGET = 80

/**
 * Fetch and store today's world gold + USD/IDR snapshot: at most one
 * successful call per WIB day, never past the monthly budget. Only scheduled
 * jobs call this. User commands read the stored rows via latestSpot /
 * spotDriver and can never trigger an API call, so the quota is untouchable
 * from chat.
 */
export async function refreshSpot(
  db: Db,
  apiKey: string | null,
  fetcher: (key: string) => Promise<MetalSpot> = fetchMetalSpot,
): Promise<void> {
  if (!apiKey) return
  const today = wibDate()
  if (getSpot(db, today)) return
  const month = today.slice(0, 7)
  const used = countSpotCalls(db, month)
  if (used >= MONTHLY_CALL_BUDGET) {
    log(`metalpriceapi budget spent for ${month} (${used}/${MONTHLY_CALL_BUDGET}), skipping spot refresh`)
    return
  }
  bumpSpotCalls(db, month)
  const spot = await fetcher(apiKey)
  storeSpot(db, { date: today, goldUsd: spot.goldUsdPerOz, usdidr: spot.usdidr })
  log(`spot ${today}: gold $${spot.goldUsdPerOz.toFixed(2)}/oz, USD/IDR ${spot.usdidr.toFixed(0)} (call ${used + 1}/${MONTHLY_CALL_BUDGET} this month)`)
}

/** Latest stored snapshot, or null if none is fresh enough to show. */
export function latestSpot(db: Db, maxAgeDays = 3): SpotRow | null {
  const rows = latestSpots(db, 1)
  const last = rows[rows.length - 1]
  if (!last) return null
  const cutoff = wibDate(new Date(Date.now() - maxAgeDays * 24 * 3600 * 1000).toISOString())
  return last.date >= cutoff ? last : null
}

/** Day-over-day driver from the two most recent snapshots, all from the db. */
export function spotDriver(db: Db): DriverInfo | null {
  const rows = latestSpots(db, 2)
  if (rows.length < 2) return null
  const [prev, last] = rows as [SpotRow, SpotRow]
  return {
    goldChangePct: ((last.goldUsd - prev.goldUsd) / prev.goldUsd) * 100,
    fxChangePct: ((last.usdidr - prev.usdidr) / prev.usdidr) * 100,
  }
}
