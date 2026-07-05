import type { Config } from '../config.js'
import type { TelegramApi } from '../bot/api.js'
import { brandSources, digestMessage, type DigestSection } from '../bot/copy.js'
import { buildReport, computeDriver } from '../core/analysis.js'
import { refreshSpot } from '../core/spot.js'
import type { Db } from '../core/db.js'
import { digestUsers, listWatches, mergedDaily, storeMarket } from '../core/store.js'
import { nearestTargetBelowPrice } from '../core/targets.js'
import { brandPrices, fetchMarket, priceOf } from '../sources/market.js'
import { fetchDailyCloses, GOLD_SYMBOL, USDIDR_SYMBOL } from '../sources/yahoo.js'
import type { DriverInfo } from '../types.js'
import { log, wibDate } from '../util.js'

async function fetchDriver(): Promise<DriverInfo | null> {
  try {
    const [gold, fx] = await Promise.all([
      fetchDailyCloses(GOLD_SYMBOL, '10d'),
      fetchDailyCloses(USDIDR_SYMBOL, '10d'),
    ])
    return computeDriver(gold, fx)
  } catch (err) {
    log(`driver data unavailable (${err}), digest goes out without it`)
    return null
  }
}

export async function runDigest(db: Db, api: TelegramApi, config: Config): Promise<void> {
  await refreshSpot(db, config.metalpriceApiKey).catch((err) => log(`spot refresh failed: ${err}`))
  const market = await fetchMarket()
  storeMarket(db, market)
  const driver = await fetchDriver()
  const today = wibDate()
  let sent = 0

  for (const user of digestUsers(db)) {
    const watches = listWatches(db, user.chatId)
    if (!watches.length) continue

    const sections: DigestSection[] = []
    const combos = [...new Map(watches.map((w) => [`${w.brand}:${w.gramasi}`, { brand: w.brand, gramasi: w.gramasi }])).values()]
    for (const combo of combos) {
      const size = priceOf(market, combo.brand, combo.gramasi)
      if (!size) continue
      const daily = mergedDaily(db, combo.brand, combo.gramasi)
      const yesterday = [...daily].reverse().find((d) => d.date < today) ?? null
      const armed = watches
        .filter((w) => w.brand === combo.brand && w.gramasi === combo.gramasi && w.firedAt === null)
        .map((w) => w.target)
      sections.push({
        brand: combo.brand,
        sources: brandSources(brandPrices(market, combo.brand)!),
        size,
        yesterdayPrice: yesterday?.price ?? null,
        report: buildReport(daily, size, driver),
        nearestTarget: nearestTargetBelowPrice(size.price, armed),
        hasArmedBelow: armed.some((a) => a < size.price),
      })
    }
    if (!sections.length) continue

    try {
      await api.sendMessage(user.chatId, digestMessage(user.lang, sections), { silent: true })
      sent++
    } catch (err) {
      log(`digest to ${user.chatId} failed: ${err}`)
    }
  }
  log(`digest sent to ${sent} user(s)`)
}
