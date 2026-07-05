import type { Brand, BrandPrices, Market, SizePrice } from '../types.js'
import { log } from '../util.js'
import { fetchAntam } from './anekalogam.js'
import { fetchEmaskita } from './emaskita.js'
import { fetchGaleri24 } from './galeri24.js'
import { fetchHrta } from './hrta.js'
import { fetchIndogold } from './indogold.js'
import { fetchLogammulia } from './logammulia.js'

// Shop sources for Antam. All three quote sell and buyback; the order sets
// buyback priority for the merged quote, Aneka Logam last since it only
// quotes 1g.
const ANTAM_SHOPS: Array<{ name: string; fetch: () => Promise<BrandPrices> }> = [
  { name: 'IndoGold', fetch: fetchIndogold },
  { name: 'Galeri 24', fetch: fetchGaleri24 },
  { name: 'Aneka Logam', fetch: fetchAntam },
]

/**
 * All Antam sources are fetched in parallel. The merged quote drives alerts
 * and storage: official Logam Mulia sell prices, buyback from the highest-
 * priority shop that responded (credited via buybackSource). Official down
 * -> the shop quote is used wholesale. Every shop down -> no merged quote,
 * since messages need a buyback figure. The raw per-source quotes are kept
 * alongside for the /price board and the /analyze comparison.
 */
async function fetchAntamPrices(): Promise<{ merged: BrandPrices | null; quotes: BrandPrices[] }> {
  const now = new Date().toISOString()
  const [officialResult, ...shopResults] = await Promise.allSettled([
    fetchLogammulia(),
    ...ANTAM_SHOPS.map((s) => s.fetch()),
  ])

  const quotes: BrandPrices[] = []
  let official: Awaited<ReturnType<typeof fetchLogammulia>> | null = null
  if (officialResult.status === 'fulfilled') {
    official = officialResult.value
    quotes.push({
      brand: 'antam',
      source: 'logammulia',
      createdAt: now,
      sizes: official.map((q) => ({ gramasi: q.gramasi, price: q.price, buybackPrice: 0 })),
    })
  } else {
    log(`Logam Mulia (official) failed (${officialResult.reason}), falling back to shop prices`)
  }

  const shops: BrandPrices[] = []
  shopResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      shops.push(r.value)
      quotes.push(r.value)
    } else {
      log(`${ANTAM_SHOPS[i]!.name} failed (${r.reason})`)
    }
  })
  const shop = shops[0] ?? null

  if (official && shop) {
    const buybackBySize = new Map(shop.sizes.map((s) => [s.gramasi, s.buybackPrice]))
    const sizes = official
      .filter((q) => (buybackBySize.get(q.gramasi) ?? Infinity) <= q.price)
      .map((q) => ({ gramasi: q.gramasi, price: q.price, buybackPrice: buybackBySize.get(q.gramasi)! }))
    if (sizes.length) {
      return { merged: { brand: 'antam', source: 'logammulia', buybackSource: shop.source, createdAt: now, sizes }, quotes }
    }
  }
  if (shop) return { merged: shop, quotes }
  if (official) log('Antam skipped: official prices came in but no shop provided a buyback figure')
  return { merged: null, quotes }
}

/**
 * One market fetch covers every brand. A brand whose sources are all down is
 * simply absent from the result so the others keep working; only a fully
 * empty market throws.
 */
export async function fetchMarket(): Promise<Market> {
  const brands: BrandPrices[] = []
  const sourceQuotes: BrandPrices[] = []

  try {
    const emasku = await fetchHrta()
    brands.push(emasku)
    sourceQuotes.push(emasku)
  } catch (err) {
    log(`HRTA failed (${err}), falling back to EmasKITA`)
    try {
      const emasku = await fetchEmaskita()
      brands.push(emasku)
      sourceQuotes.push(emasku)
    } catch (err2) {
      log(`EmasKITA fallback failed too (${err2})`)
    }
  }

  const antam = await fetchAntamPrices()
  if (antam.merged) brands.push(antam.merged)
  else log('every Antam source is down, continuing without the brand')
  sourceQuotes.push(...antam.quotes)

  if (!brands.length) throw new Error('every price source is down')
  return { fetchedAt: new Date().toISOString(), brands, sourceQuotes }
}

export function brandPrices(market: Market, brand: Brand): BrandPrices | null {
  return market.brands.find((b) => b.brand === brand) ?? null
}

export function priceOf(market: Market, brand: Brand, gramasi: number): SizePrice | null {
  return brandPrices(market, brand)?.sizes.find((s) => s.gramasi === gramasi) ?? null
}
