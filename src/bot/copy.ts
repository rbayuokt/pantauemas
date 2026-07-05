import type { AnalysisReport, Brand, BrandPrices, DipEvent, Lang, Market, PriceSource, SizePrice, TimingReport, TimingSignal, WatchRow } from '../types.js'
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
  if (source === 'logammulia') return 'Logam Mulia (resmi)'
  if (source === 'indogold') return 'IndoGold'
  if (source === 'galeri24') return 'Galeri 24'
  return 'EmasKITA'
}

/** Every source behind a quote: the sell-price source plus, when it differs, the buyback one. */
export function brandSources(bp: Pick<BrandPrices, 'source' | 'buybackSource'>): PriceSource[] {
  return bp.buybackSource && bp.buybackSource !== bp.source ? [bp.source, bp.buybackSource] : [bp.source]
}

/** The official source gets a badge so it's recognizable at a glance. */
function decoratedSource(source: PriceSource): string {
  return source === 'logammulia' ? `<b>🏛 ${sourceName(source)}</b>` : sourceName(source)
}

/** Sort for source lists: official pinned first, the rest cheapest first. */
function byOfficialThenPrice(a: { source: PriceSource; price: number }, b: { source: PriceSource; price: number }): number {
  return (a.source === 'logammulia' ? 0 : 1) - (b.source === 'logammulia' ? 0 : 1) || a.price - b.price
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
  sources: PriceSource[],
): string {
  const lines = [t(lang, 'alert_hit_title')]
  for (const target of hitTargets) {
    lines.push(t(lang, 'alert_hit_line', { size: comboLabel(brand, size.gramasi), price: rupiah(size.price), target: rupiah(target) }))
  }
  const spread = ((size.price - size.buybackPrice) / size.price) * 100
  lines.push(t(lang, 'alert_hit_footer', { buyback: rupiah(size.buybackPrice), spread: pct(spread, lang) }))
  const below = remainingArmed.filter((r) => r < Math.min(...hitTargets))
  if (below.length) lines.push(t(lang, 'alert_next_rung', { target: rupiah(Math.max(...below)) }))
  lines.push('', sourceLine(lang, sources))
  return lines.join('\n')
}

export function dipMessage(
  lang: Lang,
  brand: Brand,
  size: SizePrice,
  event: DipEvent,
  lookbackDays: number,
  sources: PriceSource[],
): string {
  const body = t(lang, 'alert_dip', {
    size: comboLabel(brand, size.gramasi),
    price: rupiah(size.price),
    drop: pct(event.dropPct, lang),
    days: lookbackDays,
    high: rupiah(event.refHigh),
  })
  return `${body}\n\n${sourceLine(lang, sources)}`
}

function changeLabel(lang: Lang, current: number, previous: number | null): string | null {
  if (!previous || previous <= 0) return null
  const change = ((current - previous) / previous) * 100
  const sign = change >= 0 ? '+' : ''
  return `${sign}${pct(change, lang)}`
}

export interface DigestSection {
  brand: Brand
  sources: PriceSource[]
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
  blocks.push(sourceLine(lang, sections.flatMap((s) => s.sources)))
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

/** 10-segment gauge of where today sits in the 90-day range (left = cheap). */
function rangeGauge(posPct: number): string {
  const filled = Math.round(Math.min(100, Math.max(0, posPct)) / 10)
  return '▓'.repeat(filled) + '░'.repeat(10 - filled)
}

/** One source's quote for the size being analyzed, for the by-source comparison. */
export interface SourceQuote {
  source: PriceSource
  price: number
  /** 0 when the source publishes no buyback (official Logam Mulia). */
  buybackPrice: number
}

export function analyzeMessage(
  lang: Lang,
  brand: Brand,
  sources: PriceSource[],
  size: SizePrice,
  timing: TimingReport,
  spot?: { goldUsd: number; usdidr: number } | null,
  bySource?: SourceQuote[],
): string {
  const r = timing.report
  // Answer first: title, verdict, then the sections for whoever wants detail.
  const blocks = [t(lang, 'analyze_title', { size: comboLabel(brand, size.gramasi), date: wibDateLabel(lang) })]

  const verdictKey =
    timing.timing === 'good' ? ('analyze_verdict_good' as const)
    : timing.timing === 'ok' ? ('analyze_verdict_ok' as const)
    : timing.timing === 'wait' ? ('analyze_verdict_wait' as const)
    : null
  if (verdictKey) {
    const verdict = [t(lang, verdictKey)]
    if (timing.confidencePct !== null) {
      verdict.push(t(lang, 'analyze_confidence', {
        pct: pct(timing.confidencePct, lang, 0),
        bar: rangeGauge(timing.confidencePct),
      }))
    }
    blocks.push(verdict.join('\n'))
  } else {
    blocks.push(t(lang, 'analyze_no_history'))
  }

  blocks.push([
    t(lang, 'analyze_sec_price'),
    t(lang, 'analyze_price_line', { price: rupiah(size.price), buyback: rupiah(size.buybackPrice), spread: pct(r.spreadPct, lang) }),
  ].join('\n'))

  // Where to actually buy today: only worth a block when sources disagree.
  if (bySource && bySource.length >= 2) {
    const sorted = [...bySource].sort(byOfficialThenPrice)
    const cheapest = sorted.reduce((min, q) => (q.price < min.price ? q : min))
    const lines = [t(lang, 'analyze_sec_sources')]
    for (const q of sorted) {
      lines.push(
        q === cheapest
          ? t(lang, 'analyze_src_line_cheapest', { source: decoratedSource(q.source), price: rupiah(q.price) })
          : t(lang, 'analyze_src_line', {
              source: decoratedSource(q.source),
              price: rupiah(q.price),
              diff: pct(((q.price - cheapest.price) / cheapest.price) * 100, lang),
            }),
      )
    }
    const bestBuyback = bySource.filter((q) => q.buybackPrice > 0).sort((a, b) => b.buybackPrice - a.buybackPrice)[0]
    if (bestBuyback) {
      lines.push(t(lang, 'analyze_best_buyback', { source: sourceName(bestBuyback.source), price: rupiah(bestBuyback.buybackPrice) }))
    }
    blocks.push(lines.join('\n'))
  }

  const range: string[] = []
  if (timing.low90 !== null && timing.high90 !== null) {
    range.push(t(lang, 'analyze_range_line', { low: rupiah(timing.low90), high: rupiah(timing.high90) }))
    if (timing.rangePosPct !== null) range.push('  ' + t(lang, 'analyze_range_gauge', { bar: rangeGauge(timing.rangePosPct) }))
  }
  if (r.cheaperThanPct !== null) range.push('• ' + t(lang, 'digest_cheaper', { pct: pct(r.cheaperThanPct, lang, 0), days: r.sampleDays }))
  if (r.trend) range.push('• ' + t(lang, `digest_trend_${r.trend}` as const))
  if (timing.dropFromHigh14Pct !== null && timing.dropFromHigh14Pct >= 0.05) {
    range.push('• ' + t(lang, 'analyze_off_high', { drop: pct(timing.dropFromHigh14Pct, lang) }))
  }
  if (range.length) blocks.push([t(lang, 'analyze_sec_range'), ...range].join('\n'))

  const world: string[] = []
  if (spot) {
    world.push('• ' + t(lang, 'analyze_world', {
      gold: '$' + Math.round(spot.goldUsd).toLocaleString('en-US'),
      fx: rupiah(spot.usdidr),
    }))
  }
  if (r.driver) world.push('• ' + driverLine(lang, r.driver.goldChangePct, r.driver.fxChangePct))
  if (world.length) blocks.push([t(lang, 'analyze_sec_world'), ...world].join('\n'))

  if (timing.timing !== null) {
    const checklist = [t(lang, 'analyze_signals_title', { score: timing.score, max: timing.maxScore })]
    for (const s of timing.signals) checklist.push(`${s.pass ? '✅' : '⬜'} ${t(lang, SIGNAL_KEY[s.key])}`)
    blocks.push(checklist.join('\n'))
  }

  blocks.push(`${sourceLine(lang, sources)}\n${t(lang, 'analyze_footnote')}`)
  return blocks.join('\n\n')
}

/**
 * The compact view. A combo quoted by 2+ live sources (Antam) gets its own
 * block: official first, the rest cheapest first, cheapest tagged.
 * Single-source combos stay one line; the footer lists every source shown.
 */
export function priceMessage(lang: Lang, market: Market, combos: Array<{ brand: Brand; gramasi: number }>): string {
  const singles: string[] = []
  const blocks: string[] = []
  const footerSources: PriceSource[] = []
  for (const combo of combos) {
    const bp = market.brands.find((b) => b.brand === combo.brand)
    const s = bp?.sizes.find((x) => x.gramasi === combo.gramasi)
    if (!bp || !s) continue
    const quotes = (market.sourceQuotes ?? [])
      .filter((q) => q.brand === combo.brand)
      .flatMap((q) => {
        const x = q.sizes.find((z) => z.gramasi === combo.gramasi)
        return x ? [{ source: q.source, price: x.price, buybackPrice: x.buybackPrice }] : []
      })
    if (quotes.length >= 2) {
      const sorted = [...quotes].sort(byOfficialThenPrice)
      const cheapest = sorted.reduce((min, q) => (q.price < min.price ? q : min))
      const block = [t(lang, 'price_combo_sources', { size: comboLabel(combo.brand, combo.gramasi) })]
      for (const q of sorted) {
        const line =
          q.buybackPrice > 0
            ? t(lang, 'price_src_line', { source: decoratedSource(q.source), price: rupiah(q.price), buyback: rupiah(q.buybackPrice) })
            : t(lang, 'price_src_line_nobb', { source: decoratedSource(q.source), price: rupiah(q.price) })
        block.push(q === cheapest ? `${line} ${t(lang, 'price_cheapest_tag')}` : line)
      }
      blocks.push(block.join('\n'))
      for (const q of sorted) if (!footerSources.includes(q.source)) footerSources.push(q.source)
    } else {
      for (const src of brandSources(bp)) if (!footerSources.includes(src)) footerSources.push(src)
      singles.push(t(lang, 'price_line', { size: comboLabel(combo.brand, combo.gramasi), price: rupiah(s.price), buyback: rupiah(s.buybackPrice) }))
    }
  }
  const parts = [t(lang, 'price_title', { date: wibDateLabel(lang, market.fetchedAt) })]
  if (singles.length) parts.push(singles.join('\n'))
  parts.push(...blocks)
  if (footerSources.length) parts.push(sourceLine(lang, footerSources))
  parts.push(t(lang, 'price_hint'))
  return parts.join('\n\n')
}

/**
 * The full board: every size of every source the market fetch returned, one
 * block per source so Antam's price differences stay visible instead of
 * being merged away. Sell-only quotes (official Logam Mulia) drop the
 * buyback part of the line.
 */
export function allPricesMessage(lang: Lang, market: Market): string {
  const blocks = [t(lang, 'price_all_title', { date: wibDateLabel(lang, market.fetchedAt) })]
  const quotes = market.sourceQuotes?.length ? market.sourceQuotes : market.brands
  for (const bp of quotes) {
    const lines = [`<b>${BRAND_LABEL[bp.brand]}</b> · ${decoratedSource(bp.source)}`]
    for (const s of [...bp.sizes].sort((a, b) => a.gramasi - b.gramasi)) {
      lines.push(
        s.buybackPrice > 0
          ? t(lang, 'price_line', { size: gram(s.gramasi), price: rupiah(s.price), buyback: rupiah(s.buybackPrice) })
          : t(lang, 'price_line_nobb', { size: gram(s.gramasi), price: rupiah(s.price) }),
      )
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
