import type { BrandPrices, SizePrice } from '../types.js'

const PAGE_URL = 'https://www.indogold.id/harga-emas-hari-ini'
const PRICELIST_URL = 'https://www.indogold.id/home/get_data_pricelist'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

interface IndogoldVariantQuote {
  harga: string
  harga_buyback: string
}

interface IndogoldPricelist {
  status: boolean
  error?: string
  data?: {
    list_variant: string[]
    /** Keyed by weight ("0.5", "1.0", ...), then by variant ("Tahun 2026"). */
    data_denom: Record<string, Record<string, IndogoldVariantQuote | null>>
  }
}

function toNumber(rp: string): number {
  return Number(rp.replace(/[^\d]/g, ''))
}

/** Picks the newest production year ("Tahun 2026" over "Tahun 2025"). */
export function parseIndogoldPricelist(json: IndogoldPricelist): SizePrice[] {
  if (!json.status || !json.data) throw new Error(`IndoGold: pricelist rejected (${json.error ?? 'no data'})`)
  const variant = [...json.data.list_variant].sort().pop()
  if (!variant) throw new Error('IndoGold: no production-year variants in pricelist')
  const sizes: SizePrice[] = []
  for (const [weight, byVariant] of Object.entries(json.data.data_denom)) {
    const quote = byVariant[variant]
    if (!quote) continue
    const gramasi = Number(weight.replace(',', ''))
    const price = toNumber(quote.harga)
    const buybackPrice = toNumber(quote.harga_buyback)
    if (gramasi > 0 && price > 0 && buybackPrice > 0 && buybackPrice <= price) {
      sizes.push({ gramasi, price, buybackPrice })
    }
  }
  if (!sizes.some((s) => s.gramasi === 1)) throw new Error('IndoGold: no valid 1g row, layout probably changed')
  return sizes.sort((a, b) => a.gramasi - b.gramasi)
}

/**
 * The price table loads via an AJAX endpoint guarded by a per-session token,
 * so this takes two requests: GET the page for the cookie and the
 * `simulasi-token` in its inline script, then POST the pricelist form for
 * the LM Antam product.
 */
export async function fetchIndogold(): Promise<BrandPrices> {
  const page = await fetch(PAGE_URL, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  })
  if (!page.ok) throw new Error(`IndoGold page returned HTTP ${page.status}`)
  const cookies = page.headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!)
    .join('; ')
  const token = (await page.text()).match(/simulasi-token"\s*,\s*"([0-9a-f]{32})"/)?.[1]
  if (!token) throw new Error('IndoGold: simulasi-token not found on the page')

  const form = new FormData()
  form.append('form', JSON.stringify({ product: 'LM_1' }))
  form.append('simulasi-token', token)
  const res = await fetch(PRICELIST_URL, {
    method: 'POST',
    body: form,
    headers: { 'user-agent': USER_AGENT, referer: PAGE_URL, ...(cookies ? { cookie: cookies } : {}) },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`IndoGold pricelist returned HTTP ${res.status}`)
  const sizes = parseIndogoldPricelist((await res.json()) as IndogoldPricelist)
  return { brand: 'antam', source: 'indogold', createdAt: new Date().toISOString(), sizes }
}
