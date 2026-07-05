import type { AnalysisReport, DayPrice, DriverInfo, SizePrice, TimingReport, TimingSignal } from '../types.js'
import type { DailyClose } from '../sources/yahoo.js'

const PERCENTILE_WINDOW_DAYS = 90
const DIP_WINDOW_DAYS = 14

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

/**
 * The /analyze view: buildReport plus range context and a small checklist of
 * yes/no buy signals. Still no prediction; each signal only asks whether today
 * looks cheap against recorded history, and each is shown to the user so the
 * verdict is never a black box. Signals without enough history are left out,
 * and no verdict is given until at least 3 can be evaluated.
 */
export function buildTimingReport(daily: DayPrice[], current: SizePrice, driver?: DriverInfo | null): TimingReport {
  const report = buildReport(daily, current, driver)
  const window = daily.filter((d) => d.price > 0).slice(-PERCENTILE_WINDOW_DAYS)
  const prices = window.map((d) => d.price)

  let low90: number | null = null
  let high90: number | null = null
  let rangePosPct: number | null = null
  if (window.length >= 20) {
    low90 = Math.min(...prices)
    high90 = Math.max(...prices)
    rangePosPct = high90 > low90 ? ((current.price - low90) / (high90 - low90)) * 100 : 50
  }

  const dipWindow = prices.slice(-DIP_WINDOW_DAYS)
  let dropFromHigh14Pct: number | null = null
  if (dipWindow.length >= 5) {
    const high14 = Math.max(...dipWindow)
    dropFromHigh14Pct = ((high14 - current.price) / high14) * 100
  }

  const signals: TimingSignal[] = []
  if (report.cheaperThanPct !== null) signals.push({ key: 'percentile', pass: report.cheaperThanPct >= 60 })
  if (rangePosPct !== null) signals.push({ key: 'range', pass: rangePosPct <= 35 })
  if (report.ma7 !== null) signals.push({ key: 'momentum', pass: current.price <= report.ma7 })
  if (dropFromHigh14Pct !== null) signals.push({ key: 'dip', pass: dropFromHigh14Pct >= 1 })

  const score = signals.filter((s) => s.pass).length
  const maxScore = signals.length
  let timing: TimingReport['timing'] = null
  if (maxScore >= 3) {
    if (score >= maxScore * 0.75) timing = 'good'
    else if (score >= maxScore * 0.5) timing = 'ok'
    else timing = 'wait'
  }

  // Continuous companion to the yes/no signals: each component is the same
  // statistic mapped onto 0-100, blended by weight. 100 = today is at its
  // cheapest by every measure; 0 = pricier than everything recorded.
  const clamp = (x: number) => Math.min(100, Math.max(0, x))
  const components: Array<{ value: number; weight: number }> = []
  if (report.cheaperThanPct !== null) components.push({ value: report.cheaperThanPct, weight: 0.4 })
  if (rangePosPct !== null) components.push({ value: clamp(100 - rangePosPct), weight: 0.3 })
  if (report.ma7 !== null) {
    // ±2% around the 7-day average maps to 0-100, at the average = 50.
    const belowMa7Pct = ((report.ma7 - current.price) / report.ma7) * 100
    components.push({ value: clamp(50 + (belowMa7Pct / 2) * 50), weight: 0.15 })
  }
  if (dropFromHigh14Pct !== null) {
    // A 3%+ drop off the 14-day high counts as a full-strength dip.
    components.push({ value: clamp((dropFromHigh14Pct / 3) * 100), weight: 0.15 })
  }
  let confidencePct: number | null = null
  if (timing !== null && components.length) {
    const totalWeight = components.reduce((a, c) => a + c.weight, 0)
    confidencePct = components.reduce((a, c) => a + c.value * c.weight, 0) / totalWeight
  }

  return { report, low90, high90, rangePosPct, dropFromHigh14Pct, signals, score, maxScore, timing, confidencePct }
}
