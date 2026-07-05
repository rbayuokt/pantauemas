import type { Config } from '../config.js'
import type { Db } from '../core/db.js'
import { detectDip } from '../core/dip.js'
import { refreshSpot } from '../core/spot.js'
import {
  allWatches, fireWatch, getDipState, mergedDaily, rearmWatch, setDipState, storeMarket, watchedCombos,
} from '../core/store.js'
import { evaluateRung } from '../core/targets.js'
import { brandPrices, fetchMarket, priceOf } from '../sources/market.js'
import type { TelegramApi } from '../bot/api.js'
import { comboLabel, dipMessage, targetHitMessage } from '../bot/copy.js'
import { sendNtfy } from '../notify/ntfy.js'
import type { Lang, WatchRow } from '../types.js'
import { log, rupiah, wibDate } from '../util.js'

async function deliver(
  api: TelegramApi,
  config: Config,
  chatId: string,
  text: string,
  ntfyTopic: string | null,
  priority: 'urgent' | 'default',
): Promise<void> {
  try {
    await api.sendMessage(chatId, text)
  } catch (err) {
    // A user who blocked the bot should never take the tick down with them.
    log(`send to ${chatId} failed: ${err}`)
  }
  if (ntfyTopic) {
    const plain = text.replace(/<[^>]+>/g, '')
    await sendNtfy(config.ntfyServer, ntfyTopic, { title: 'PantauEmas', body: plain, priority }, config.ntfyToken).catch(
      (err) => log(`ntfy to ${ntfyTopic} failed: ${err}`),
    )
  }
}

export async function runTick(db: Db, api: TelegramApi, config: Config): Promise<void> {
  // Scheduled jobs are the only place the metalpriceapi quota is spent.
  await refreshSpot(db, config.metalpriceApiKey).catch((err) => log(`spot refresh failed: ${err}`))
  const market = await fetchMarket()
  storeMarket(db, market)
  const summary = market.brands
    .map((b) => `${b.brand} 1g = ${priceOf(market, b.brand, 1) ? rupiah(priceOf(market, b.brand, 1)!.price) : 'n/a'} (${b.source})`)
    .join(', ')
  log(summary)

  const watches = allWatches(db)
  const byChat = new Map<string, Array<WatchRow & { lang: Lang; ntfyTopic: string | null }>>()
  for (const w of watches) {
    if (!byChat.has(w.chatId)) byChat.set(w.chatId, [])
    byChat.get(w.chatId)!.push(w)
  }

  // Which brand+size combos already produced a hit alert per chat, so dips stay quiet there.
  const alertedCombos = new Map<string, Set<string>>()
  let hits = 0

  for (const [chatId, chatWatches] of byChat) {
    const lang = chatWatches[0]!.lang
    const combos = [...new Set(chatWatches.map((w) => `${w.brand}:${w.gramasi}`))]
    for (const comboKey of combos) {
      const [brand, gramasiRaw] = comboKey.split(':') as [WatchRow['brand'], string]
      const gramasi = Number(gramasiRaw)
      const size = priceOf(market, brand, gramasi)
      if (!size) continue
      const rungs = chatWatches.filter((w) => w.brand === brand && w.gramasi === gramasi)
      const hitTargets: number[] = []
      for (const rung of rungs) {
        const action = evaluateRung(size.price, rung.target, rung.firedAt !== null, config.rearmBufferPct)
        if (action === 'fire') {
          fireWatch(db, rung.id, size.price)
          hitTargets.push(rung.target)
        } else if (action === 'rearm') {
          rearmWatch(db, rung.id)
          log(`re-armed ${comboLabel(brand, gramasi)} ${rupiah(rung.target)} for ${chatId}`)
        }
      }
      if (hitTargets.length) {
        hits += hitTargets.length
        const stillArmed = rungs.filter((r) => !hitTargets.includes(r.target) && r.firedAt === null).map((r) => r.target)
        const source = brandPrices(market, brand)!.source
        await deliver(api, config, chatId, targetHitMessage(lang, brand, size, hitTargets, stillArmed, source), chatWatches[0]!.ntfyTopic, 'urgent')
        if (!alertedCombos.has(chatId)) alertedCombos.set(chatId, new Set())
        alertedCombos.get(chatId)!.add(comboKey)
      }
    }
  }

  // Dip pass: one episode per brand+size, fanned out to whoever watches that combo.
  const today = wibDate()
  for (const combo of watchedCombos(db)) {
    const size = priceOf(market, combo.brand, combo.gramasi)
    if (!size) continue
    const daily = mergedDaily(db, combo.brand, combo.gramasi)
    const result = detectDip(
      size.price, daily, config.dipLookbackDays, config.dipThresholdPct,
      getDipState(db, combo.brand, combo.gramasi), today, combo.brand, combo.gramasi,
    )
    setDipState(db, result.next, combo.brand, combo.gramasi)
    if (!result.event) continue
    const source = brandPrices(market, combo.brand)!.source
    const watchers = new Map(
      watches
        .filter((w) => w.brand === combo.brand && w.gramasi === combo.gramasi)
        .map((w) => [w.chatId, { lang: w.lang, ntfyTopic: w.ntfyTopic }]),
    )
    for (const [chatId, who] of watchers) {
      if (alertedCombos.get(chatId)?.has(`${combo.brand}:${combo.gramasi}`)) continue
      await deliver(api, config, chatId, dipMessage(who.lang, combo.brand, size, result.event, config.dipLookbackDays, source), who.ntfyTopic, 'default')
    }
  }

  log(hits ? `${hits} target(s) fired` : 'no alerts this tick')
}
