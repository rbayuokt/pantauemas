import type { BrandPrices } from '../types.js'

const PAGE_URL = 'https://www.anekalogam.co.id/id'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export interface AntamQuote {
  sell: number
  buy: number
  /** Production year the quote applies to, when the page states it */
  year: string | null
}

/**
 * Aneka Logam's homepage server-renders current-production LM Antam prices
 * per gram: a "buy-sell-rate" block with Harga Jual and Harga Beli as
 * <span class="tprice">Rp2.597.000</span>, followed by a note like
 * "** Harga berlaku untuk LM Antam produksi tahun 2026". Older-year variants
 * are described on the page but their prices load via JavaScript, so only
 * the current production year is scrapable here.
 */
export function parseAnekalogamHtml(html: string): AntamQuote {
  const prices = [...html.matchAll(/class="tprice">\s*Rp\s?([\d.]{7,})/g)].map((m) =>
    Number((m[1] ?? '').replace(/[^\d]/g, '')),
  )
  const [sell, buy] = prices
  if (!sell || !buy) throw new Error('Aneka Logam: price spans not found on the page')
  if (buy > sell) throw new Error(`Aneka Logam: buyback ${buy} above sell ${sell}, layout probably changed`)
  if (sell < 1_000_000 || sell > 100_000_000) throw new Error(`Aneka Logam: implausible per-gram price ${sell}`)
  const year = html.match(/Harga berlaku untuk LM Antam produksi tahun (\d{4})/)?.[1] ?? null
  return { sell, buy, year }
}

export async function fetchAntam(): Promise<BrandPrices> {
  const res = await fetch(PAGE_URL, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Aneka Logam returned HTTP ${res.status}`)
  const quote = parseAnekalogamHtml(await res.text())
  const now = new Date().toISOString()
  return {
    brand: 'antam',
    source: 'anekalogam',
    createdAt: now,
    // Per-gram quote, so it maps to a single 1g size entry.
    sizes: [{ gramasi: 1, price: quote.sell, buybackPrice: quote.buy }],
  }
}
