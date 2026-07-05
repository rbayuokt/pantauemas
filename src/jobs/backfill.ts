import type { Db } from '../core/db.js'
import { replaceBackfill, storeMarket } from '../core/store.js'
import { fetchMarket } from '../sources/market.js'
import { fetchDailyCloses, GOLD_SYMBOL, GRAMS_PER_TROY_OZ, USDIDR_SYMBOL } from '../sources/yahoo.js'
import { gram, log } from '../util.js'

/**
 * Rebuild ~1y of daily history for every brand and bar size from world gold
 * and USD/IDR, scaled so each series' latest synthetic day matches its real
 * price today. The scale factor bakes in that brand+size's retail premium
 * (small bars carry a bigger premium per gram; Antam carries a brand premium
 * over EMASKU), which makes percentiles usable from day one.
 */
export async function runBackfill(db: Db): Promise<void> {
  const [gold, fx, market] = await Promise.all([
    fetchDailyCloses(GOLD_SYMBOL, '1y'),
    fetchDailyCloses(USDIDR_SYMBOL, '1y'),
    fetchMarket(),
  ])
  storeMarket(db, market)

  const fxByDate = new Map(fx.map((d) => [d.date, d.close]))
  const rawPerGram = gold
    .filter((g) => fxByDate.has(g.date))
    .map((g) => ({ date: g.date, price: (g.close / GRAMS_PER_TROY_OZ) * fxByDate.get(g.date)! }))
  if (rawPerGram.length < 30) throw new Error(`only ${rawPerGram.length} overlapping days from Yahoo, refusing to backfill`)
  const latestRaw = rawPerGram[rawPerGram.length - 1]!.price

  for (const bp of market.brands) {
    for (const size of bp.sizes) {
      const premiumFactor = size.price / (latestRaw * size.gramasi)
      replaceBackfill(db, bp.brand, size.gramasi, rawPerGram.map((r) => ({ date: r.date, price: r.price * size.gramasi * premiumFactor })))
      log(`${bp.brand} ${gram(size.gramasi)}: ${rawPerGram.length} days backfilled (premium factor ${premiumFactor.toFixed(3)})`)
    }
  }
}
