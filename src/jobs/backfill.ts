import type { Db } from '../core/db.js'
import { replaceBackfill, storeMarket } from '../core/store.js'
import { fetchMarket } from '../sources/market.js'
import { fetchDailyCloses, GOLD_SYMBOL, GRAMS_PER_TROY_OZ, USDIDR_SYMBOL } from '../sources/yahoo.js'
import type { Brand, SizePrice } from '../types.js'
import { gram, log } from '../util.js'

/** ~1y of daily world gold in rupiah per gram, before any retail premium. */
async function fetchRawPerGram(): Promise<Array<{ date: string; price: number }>> {
  const [gold, fx] = await Promise.all([
    fetchDailyCloses(GOLD_SYMBOL, '1y'),
    fetchDailyCloses(USDIDR_SYMBOL, '1y'),
  ])
  const fxByDate = new Map(fx.map((d) => [d.date, d.close]))
  const rawPerGram = gold
    .filter((g) => fxByDate.has(g.date))
    .map((g) => ({ date: g.date, price: (g.close / GRAMS_PER_TROY_OZ) * fxByDate.get(g.date)! }))
  if (rawPerGram.length < 30) throw new Error(`only ${rawPerGram.length} overlapping days from Yahoo, refusing to backfill`)
  return rawPerGram
}

function backfillCombo(db: Db, brand: Brand, size: SizePrice, rawPerGram: Array<{ date: string; price: number }>): void {
  const latestRaw = rawPerGram[rawPerGram.length - 1]!.price
  const premiumFactor = size.price / (latestRaw * size.gramasi)
  replaceBackfill(db, brand, size.gramasi, rawPerGram.map((r) => ({ date: r.date, price: r.price * size.gramasi * premiumFactor })))
  log(`${brand} ${gram(size.gramasi)}: ${rawPerGram.length} days backfilled (premium factor ${premiumFactor.toFixed(3)})`)
}

/**
 * Rebuild ~1y of daily history for every brand and bar size from world gold
 * and USD/IDR, scaled so each series' latest synthetic day matches its real
 * price today. The scale factor bakes in that brand+size's retail premium
 * (small bars carry a bigger premium per gram; Antam carries a brand premium
 * over EMASKU), which makes percentiles usable from day one.
 */
export async function runBackfill(db: Db): Promise<void> {
  const [rawPerGram, market] = await Promise.all([fetchRawPerGram(), fetchMarket()])
  storeMarket(db, market)
  for (const bp of market.brands) {
    for (const size of bp.sizes) backfillCombo(db, bp.brand, size, rawPerGram)
  }
}

/**
 * On-demand healing for a single brand+size whose history turned out too
 * short, e.g. /analyze on a bot where the one-time backfill was never run.
 * Same synthesis as runBackfill, just scoped to one series.
 */
export async function backfillOne(db: Db, brand: Brand, size: SizePrice): Promise<void> {
  backfillCombo(db, brand, size, await fetchRawPerGram())
}
