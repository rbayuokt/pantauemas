import type { AnalysisReport, DayPrice, DriverInfo, SizePrice } from '../types.js'
import type { DailyClose } from '../sources/yahoo.js'

const PERCENTILE_WINDOW_DAYS = 90

function movingAverage(series: number[], window: number): number | null {
  if (series.length < window) return null
  const slice = series.slice(-window)
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

function lastChangePct(closes: DailyClose[]): number | null {
  if (closes.length < 2) return null
  const prev = closes[closes.length - 2]!.close
  const last = closes[closes.length - 1]!.close
  return ((last - prev) / prev) * 100
}

/**
 * What moved the local price: world gold (in USD) or the USD/IDR rate.
 * Local price per gram is roughly spot / 31.1 * usdidr + premium, so
 * day-over-day the two changes add up. Rendering is left to the copy layer
 * so it can be translated.
 */
export function computeDriver(gold: DailyClose[], fx: DailyClose[]): DriverInfo | null {
  const goldChangePct = lastChangePct(gold)
  const fxChangePct = lastChangePct(fx)
  if (goldChangePct === null || fxChangePct === null) return null
  return { goldChangePct, fxChangePct }
}

/**
 * The honest version of "should I buy": no prediction, just where today sits
 * relative to recent history. cheaperThanPct is the share of the last ~90 days
 * that were more expensive than today; high means today is a good day.
 */
export function buildReport(daily: DayPrice[], current: SizePrice, driver?: DriverInfo | null): AnalysisReport {
  const window = daily.filter((d) => d.price > 0).slice(-PERCENTILE_WINDOW_DAYS)
  const prices = window.map((d) => d.price)

  let cheaperThanPct: number | null = null
  if (window.length >= 20) {
    const moreExpensive = window.filter((d) => d.price > current.price).length
    cheaperThanPct = (moreExpensive / window.length) * 100
  }

  const ma7 = movingAverage(prices, 7)
  const ma30 = movingAverage(prices, 30)
  let trend: AnalysisReport['trend'] = null
  if (ma7 !== null && ma30 !== null) {
    if (ma7 < ma30 * 0.998) trend = 'down'
    else if (ma7 > ma30 * 1.002) trend = 'up'
    else trend = 'flat'
  }

  const spreadPct = ((current.price - current.buybackPrice) / current.price) * 100

  let verdict: AnalysisReport['verdict'] = null
  if (cheaperThanPct !== null) {
    if (cheaperThanPct >= 70) verdict = 'CHEAP'
    else if (cheaperThanPct <= 30) verdict = 'EXPENSIVE'
    else verdict = 'NEUTRAL'
  }

  return { sampleDays: window.length, cheaperThanPct, ma7, ma30, trend, spreadPct, verdict, driver: driver ?? undefined }
}
