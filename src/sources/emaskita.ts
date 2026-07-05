import type { BrandPrices, SizePrice } from '../types.js'

const PAGE_URL = 'https://emaskita.id/Harga_emas'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/**
 * The EmasKITA price page is server-rendered HTML, one table per section
 * (KENCANA GOLD, EMASKITA MICRO, EMASKITA SMALL BAR). Each row has a weight
 * cell like "1 gr" followed by price cells rendered as
 * <div>Rp.</div><div>2,504,000</div> for basic, NPWP, non-NPWP and buyback.
 * We only read the EMASKITA sections; KENCANA GOLD repeats the same weights
 * with different prices and would collide. First number is the basic price,
 * last one is buyback.
 */
export function parseEmaskitaHtml(html: string): SizePrice[] {
  const rows: SizePrice[] = []
  const sections = html.split(/<th[^>]*colspan[^>]*>([^<]+)<\/th>/i)
  for (let i = 1; i < sections.length; i += 2) {
    const title = (sections[i] ?? '').trim().toUpperCase()
    const body = sections[i + 1] ?? ''
    if (!title.startsWith('EMASKITA')) continue
    for (const tr of body.split(/<tr[\s>]/i).slice(1)) {
      const weightMatch = tr.match(/([\d.]+)\s*gr\b/i)
      if (!weightMatch) continue
      const numbers = [...tr.matchAll(/<div[^>]*>\s*([\d][\d.,]*)\s*<\/div>/g)]
        .map((m) => Number((m[1] ?? '').replace(/[^\d]/g, '')))
        .filter((n) => Number.isFinite(n) && n > 1000)
      if (numbers.length < 2) continue
      const gramasi = Number(weightMatch[1])
      const price = numbers[0]!
      const buybackPrice = numbers[numbers.length - 1]!
      if (price && buybackPrice) rows.push({ gramasi, price, buybackPrice })
    }
  }
  return rows
}

export async function fetchEmaskita(): Promise<BrandPrices> {
  const res = await fetch(PAGE_URL, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`EmasKITA returned HTTP ${res.status}`)
  const sizes = parseEmaskitaHtml(await res.text())
  if (!sizes.length) throw new Error('EmasKITA: no price rows parsed from the page')
  const now = new Date().toISOString()
  return { brand: 'emasku', source: 'emaskita', createdAt: now, sizes }
}
