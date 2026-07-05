import type { BrandPrices } from '../types.js'

const API_URL = 'https://hrtagold.id/api/v1/brandings/price/daily'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

interface HrtaPrice {
  gramasi: number
  price: number
  buyback_price: number
}

interface HrtaSeries {
  series: string
  is_origin: boolean
  created_at: string
  prices: HrtaPrice[]
}

/** One call returns every bar size, so multi-user costs the same as single-user. */
export async function fetchHrta(): Promise<BrandPrices> {
  const res = await fetch(API_URL, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`HRTA API returned HTTP ${res.status}`)
  const json = (await res.json()) as { code: number; data: HrtaSeries[] }
  const series = json.data?.find((s) => s.series === 'Gold' && s.is_origin) ?? json.data?.[0]
  if (!series?.prices?.length) throw new Error('HRTA API: no Gold series in response')
  return {
    brand: 'emasku',
    source: 'hrta',
    createdAt: series.created_at,
    sizes: series.prices
      .filter((p) => p.price > 0)
      .map((p) => ({ gramasi: p.gramasi, price: p.price, buybackPrice: p.buyback_price })),
  }
}
