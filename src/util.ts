import type { Lang } from './types.js'

const WIB_OFFSET_MS = 7 * 3600 * 1000

/** WIB date (YYYY-MM-DD) for an ISO string, or now. */
export function wibDate(iso?: string): string {
  const ms = iso ? new Date(iso).getTime() : Date.now()
  return new Date(ms + WIB_OFFSET_MS).toISOString().slice(0, 10)
}

/** Epoch ms of the next "HH:MM" WIB after nowMs. WIB has no DST, so a fixed offset is safe. */
export function nextWibOccurrence(hhmm: string, nowMs: number): number {
  const [hh = 0, mm = 0] = hhmm.split(':').map(Number)
  const nowWib = new Date(nowMs + WIB_OFFSET_MS)
  const candidate =
    Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate(), hh, mm) - WIB_OFFSET_MS
  return candidate > nowMs ? candidate : candidate + 24 * 3600 * 1000
}

/** Rupiah always uses Indonesian digit grouping, whatever the chat language. */
export function rupiah(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

export function pct(n: number, lang: Lang = 'en', digits = 1): string {
  const locale = lang === 'id' ? 'id-ID' : 'en-US'
  return n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }) + '%'
}

/** Bar size label: 1 → "1g", 0.5 → "0.5g" */
export function gram(g: number): string {
  return `${g}g`
}

export function wibDateLabel(lang: Lang, iso?: string): string {
  const ms = iso ? new Date(iso).getTime() : Date.now()
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(ms))
}

/**
 * Parse a typed price like "2450000", "2.450.000", "2,450,000" or "Rp 2450000".
 * Anything that isn't digits and separators is rejected.
 */
export function parsePriceInput(text: string): number | null {
  const cleaned = text.trim()
  if (!/^(rp\.?\s*)?[\d][\d.,\s]*$/i.test(cleaned)) return null
  const digits = cleaned.replace(/[^\d]/g, '')
  if (!digits) return null
  const value = Number(digits)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}
