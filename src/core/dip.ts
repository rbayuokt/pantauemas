import type { DayPrice, DipEvent, DipStateRow } from '../types.js'

export interface DipResult {
  event: DipEvent | null
  /** Replacement for the stored per-size dip state; null clears it */
  next: DipStateRow | null
}

/**
 * Flags when the price sits notably below its recent high, so a real dip
 * still gets noticed even when it lands between ladder rungs.
 * One alert per dip episode: we only re-alert when the price falls at least
 * another 1% below the last alerted level. The episode resets once the price
 * recovers to within half the threshold of the reference high.
 *
 * Dip state is per bar size, not per user: the price series is global, so the
 * episode is too. Who gets notified is decided by the caller.
 */
export function detectDip(
  currentPrice: number,
  daily: DayPrice[],
  lookbackDays: number,
  thresholdPct: number,
  last: DipStateRow | null,
  today: string,
  brand: DipStateRow['brand'],
  gramasi: number,
): DipResult {
  const recent = daily.slice(-lookbackDays).filter((d) => d.date !== today)
  if (recent.length < 3) return { event: null, next: last }
  const refHigh = Math.max(...recent.map((d) => d.price))
  const dropPct = ((refHigh - currentPrice) / refHigh) * 100

  if (dropPct < thresholdPct) {
    // Recovered enough? Close the episode so the next dip alerts again.
    return { event: null, next: dropPct < thresholdPct / 2 ? null : last }
  }

  if (last && currentPrice > last.price * 0.99) return { event: null, next: last }

  return {
    event: { refHigh, dropPct },
    next: { brand, gramasi, date: today, price: currentPrice, refHigh },
  }
}
