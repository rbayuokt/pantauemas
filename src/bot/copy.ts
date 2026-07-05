import type { AnalysisReport, Brand, DipEvent, Lang, Market, PriceSource, SizePrice, TimingReport, TimingSignal, WatchRow } from '../types.js'
import { gram, pct, rupiah, wibDateLabel } from '../util.js'
import type { InlineButton } from './api.js'
import { t, type MessageKey } from './i18n.js'

export const BRAND_LABEL: Record<Brand, string> = {
  emasku: 'EMASKU',
  antam: 'Antam',
}

/** Human-readable source label, shown so users know where the number is from. */
export function sourceName(source: PriceSource): string {
  if (source === 'hrta') return 'HRTA Gold'
  if (source === 'anekalogam') return 'Aneka Logam'
  return 'EmasKITA'
}

function sourceLine(lang: Lang, sources: PriceSource[]): string {
  const names = [...new Set(sources.map(sourceName))].join(', ')
  return t(lang, 'source_line', { source: names })
}

/** "EMASKU 1g" / "Antam 1g", the label used everywhere a price is named. */
export function comboLabel(brand: Brand, gramasi: number): string {
  return `${BRAND_LABEL[brand]} ${gram(gramasi)}`
}

export function targetHitMessage(
  lang: Lang,
  brand: Brand,
  size: SizePrice,
  hitTargets: number[],
  remainingArmed: number[],
  source: PriceSource,
): string {
  const lines = [t(lang, 'alert_hit_title')]
  for (const target of hitTargets) {
    lines.push(t(lang, 'alert_hit_line', { size: comboLabel(brand, size.gramasi), price: rupiah(size.price), target: rupiah(target) }))
  }
  const spread = ((size.price - size.buybackPrice) / size.price) * 100
  lines.push(t(lang, 'alert_hit_footer', { buyback: rupiah(size.buybackPrice), spread: pct(spread, lang) }))
  const below = remainingArmed.filter((r) => r < Math.min(...hitTargets))
  if (below.length) lines.push(t(lang, 'alert_next_rung', { target: rupiah(Math.max(...below)) }))
  lines.push('', sourceLine(lang, [source]))
  return lines.join('\n')
}

export function dipMessage(
  lang: Lang,
  brand: Brand,
  size: SizePrice,
  event: DipEvent,
  lookbackDays: number,
  source: PriceSource,
): string {
  const body = t(lang, 'alert_dip', {
    size: comboLabel(brand, size.gramasi),
    price: rupiah(size.price),
    drop: pct(event.dropPct, lang),
    days: lookbackDays,
    high: rupiah(event.refHigh),
  })
  return `${body}\n\n${sourceLine(lang, [source])}`
}

function changeLabel(lang: Lang, current: number, previous: number | null): string | null {
  if (!previous || previous <= 0) return null
  const change = ((current - previous) / previous) * 100
  const sign = change >= 0 ? '+' : ''
  return `${sign}${pct(change, lang)}`
}

export interface DigestSection {
  brand: Brand
  source: PriceSource
  size: SizePrice
  yesterdayPrice: number | null
  report: AnalysisReport
  nearestTarget: number | null
  hasArmedBelow: boolean
}

export function digestMessage(lang: Lang, sections: DigestSection[]): string {
  const blocks: string[] = [t(lang, 'digest_title', { date: wibDateLabel(lang) })]
  for (const s of sections) {
    const lines: string[] = []
    const change = changeLabel(lang, s.size.price, s.yesterdayPrice)
    lines.push(
      change
        ? t(lang, 'digest_price_line', {
            size: comboLabel(s.brand, s.size.gramasi), price: rupiah(s.size.price), change, buyback: rupiah(s.size.buybackPrice),
          })
        : t(lang, 'digest_price_line_nochange', {
            size: comboLabel(s.brand, s.size.gramasi), price: rupiah(s.size.price), buyback: rupiah(s.size.buybackPrice),
          }),
    )
    const r = s.report
    if (r.cheaperThanPct !== null) {
      lines.push(t(lang, 'digest_cheaper', { pct: pct(r.cheaperThanPct, lang, 0), days: r.sampleDays }))
    }
    if (r.trend) lines.push(t(lang, `digest_trend_${r.trend}` as const))
    if (r.verdict === 'CHEAP') lines.push(t(lang, 'digest_verdict_cheap'))
    else if (r.verdict === 'NEUTRAL') lines.push(t(lang, 'digest_verdict_neutral'))
    else if (r.verdict === 'EXPENSIVE') lines.push(t(lang, 'digest_verdict_expensive'))
    if (r.driver) lines.push(driverLine(lang, r.driver.goldChangePct, r.driver.fxChangePct))
    if (s.nearestTarget) {
      const gap = ((s.size.price - s.nearestTarget) / s.size.price) * 100
      lines.push(t(lang, 'digest_nearest', { target: rupiah(s.nearestTarget), gap: pct(gap, lang) }))
    } else if (s.hasArmedBelow === false) {
      lines.push(t(lang, 'digest_all_below'))
    }
    blocks.push(lines.join('\n'))
  }
  blocks.push(sourceLine(lang, sections.map((s) => s.source)))
  return blocks.join('\n\n')
}

function driverLine(lang: Lang, goldChangePct: number, fxChangePct: number): string {
  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${pct(n, lang)}`
  const params = { gold: fmt(goldChangePct), fx: fmt(fxChangePct) }
  if (Math.abs(goldChangePct) < 0.15 && Math.abs(fxChangePct) < 0.15) return t(lang, 'digest_driver_flat')
  if (Math.abs(goldChangePct) >= Math.abs(fxChangePct) * 1.5) return t(lang, 'digest_driver_gold', params)
  if (Math.abs(fxChangePct) >= Math.abs(goldChangePct) * 1.5) return t(lang, 'digest_driver_fx', params)
  return t(lang, 'digest_driver_mix', params)
}

const SIGNAL_KEY: Record<TimingSignal['key'], MessageKey> = {
  percentile: 'analyze_sig_percentile',
  range: 'analyze_sig_range',
  momentum: 'analyze_sig_momentum',
  dip: 'analyze_sig_dip',
}

export function analyzeMessage(
  lang: Lang,
  brand: Brand,
  source: PriceSource,
  size: SizePrice,
  timing: TimingReport,
  spot?: { goldUsd: number; usdidr: number } | null,
): string {
  const r = timing.report
  const lines = [t(lang, 'analyze_title', { size: comboLabel(brand, size.gramasi), date: wibDateLabel(lang) })]
  lines.push(t(lang, 'analyze_price_line', { price: rupiah(size.price), buyback: rupiah(size.buybackPrice), spread: pct(r.spreadPct, lang) }))
  if (timing.low90 !== null && timing.high90 !== null) {
    lines.push(t(lang, 'analyze_range_line', { low: rupiah(timing.low90), high: rupiah(timing.high90) }))
  }
  if (r.cheaperThanPct !== null) lines.push(t(lang, 'digest_cheaper', { pct: pct(r.cheaperThanPct, lang, 0), days: r.sampleDays }))
  if (r.trend) lines.push(t(lang, `digest_trend_${r.trend}` as const))
  if (timing.dropFromHigh14Pct !== null && timing.dropFromHigh14Pct >= 0.05) {
    lines.push(t(lang, 'analyze_off_high', { drop: pct(timing.dropFromHigh14Pct, lang) }))
  }
  if (spot) {
    lines.push(t(lang, 'analyze_world', {
      gold: '$' + Math.round(spot.goldUsd).toLocaleString('en-US'),
      fx: rupiah(spot.usdidr),
    }))
  }
  if (r.driver) lines.push(driverLine(lang, r.driver.goldChangePct, r.driver.fxChangePct))
  const blocks = [lines.join('\n')]

  if (timing.timing !== null) {
    const checklist = [t(lang, 'analyze_signals_title', { score: timing.score, max: timing.maxScore })]
    for (const s of timing.signals) checklist.push(`${s.pass ? '✅' : '⬜'} ${t(lang, SIGNAL_KEY[s.key])}`)
    blocks.push(checklist.join('\n'))
  }
  if (timing.timing === 'good') blocks.push(t(lang, 'analyze_verdict_good'))
  else if (timing.timing === 'ok') blocks.push(t(lang, 'analyze_verdict_ok'))
  else if (timing.timing === 'wait') blocks.push(t(lang, 'analyze_verdict_wait'))
  else blocks.push(t(lang, 'analyze_no_history'))

  blocks.push(`${sourceLine(lang, [source])}\n${t(lang, 'analyze_footnote')}`)
  return blocks.join('\n\n')
}

export function priceMessage(lang: Lang, market: Market, combos: Array<{ brand: Brand; gramasi: number }>): string {
  const lines = [t(lang, 'price_title', { date: wibDateLabel(lang, market.fetchedAt) })]
  const sources: PriceSource[] = []
  for (const combo of combos) {
    const bp = market.brands.find((b) => b.brand === combo.brand)
    const s = bp?.sizes.find((x) => x.gramasi === combo.gramasi)
    if (!bp || !s) continue
    if (!sources.includes(bp.source)) sources.push(bp.source)
    lines.push(t(lang, 'price_line', { size: comboLabel(combo.brand, combo.gramasi), price: rupiah(s.price), buyback: rupiah(s.buybackPrice) }))
  }
  lines.push('', sourceLine(lang, sources))
  lines.push('', t(lang, 'price_hint'))
  return lines.join('\n')
}

/** The full board: every size of every brand the market fetch returned. */
export function allPricesMessage(lang: Lang, market: Market): string {
  const blocks = [t(lang, 'price_all_title', { date: wibDateLabel(lang, market.fetchedAt) })]
  for (const bp of market.brands) {
    const lines = [`<b>${BRAND_LABEL[bp.brand]}</b> · ${sourceName(bp.source)}`]
    for (const s of [...bp.sizes].sort((a, b) => a.gramasi - b.gramasi)) {
      lines.push(t(lang, 'price_line', { size: gram(s.gramasi), price: rupiah(s.price), buyback: rupiah(s.buybackPrice) }))
    }
    blocks.push(lines.join('\n'))
  }
  return blocks.join('\n\n')
}

export function targetsMessage(lang: Lang, watches: WatchRow[]): { text: string; keyboard: InlineButton[][] } {
  const list = watches
    .map((w) => `${w.firedAt ? '🔕' : '🟢'} ${comboLabel(w.brand, w.gramasi)} · ${rupiah(w.target)}`)
    .join('\n')
  const keyboard = watches.map((w) => [
    { text: `🗑 ${comboLabel(w.brand, w.gramasi)} ${rupiah(w.target)}`, callback_data: `del:${w.id}` },
  ])
  return { text: t(lang, 'targets_header', { list }), keyboard }
}
