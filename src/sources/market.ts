import type { Brand, BrandPrices, Market, SizePrice } from '../types.js'
import { log } from '../util.js'
import { fetchAntam } from './anekalogam.js'
import { fetchEmaskita } from './emaskita.js'
import { fetchGaleri24 } from './galeri24.js'
import { fetchHrta } from './hrta.js'
import { fetchIndogold } from './indogold.js'
import { fetchLogammulia } from './logammulia.js'

// Shop sources for Antam, tried in order. All three quote sell and buyback;
// Aneka Logam comes last because it only quotes 1g.
const ANTAM_SHOPS: Array<{ name: string; fetch: () => Promise<BrandPrices> }> = [
  { name: 'IndoGold', fetch: fetchIndogold },
  { name: 'Galeri 24', fetch: fetchGaleri24 },
  { name: 'Aneka Logam', fetch: fetchAntam },
]

/**
 * The official Logam Mulia table is the sell-price reference but publishes
 * no buyback, so the first shop that responds fills that in (credited via
 * buybackSource). Official down -> the shop quote is used wholesale. Every
 * shop down -> Antam skips this fetch, since messages need a buyback figure.
 */
async function fetchAntamPrices(): Promise<BrandPrices | null> {
  let official: Awaited<ReturnType<typeof fetchLogammulia>> | null = null
  try {
    official = await fetchLogammulia()
  } catch (err) {
    log(`Logam Mulia (official) failed (${err}), falling back to shop prices`)
  }

  let shop: BrandPrices | null = null
  for (const s of ANTAM_SHOPS) {
    try {
      shop = await s.fetch()
      break
    } catch (err) {
      log(`${s.name} failed (${err}), trying the next Antam source`)
    }
  }

  if (official && shop) {
    const buybackBySize = new Map(shop.sizes.map((s) => [s.gramasi, s.buybackPrice]))
    const sizes = official
      .filter((q) => (buybackBySize.get(q.gramasi) ?? Infinity) <= q.price)
      .map((q) => ({ gramasi: q.gramasi, price: q.price, buybackPrice: buybackBySize.get(q.gramasi)! }))
    if (sizes.length) {
      return { brand: 'antam', source: 'logammulia', buybackSource: shop.source, createdAt: new Date().toISOString(), sizes }
    }
  }
  if (shop) return shop
  if (official) log('Antam skipped: official prices came in but no shop provided a buyback figure')
  return null
}

/**
 * One market fetch covers every brand. A brand whose sources are all down is
 * simply absent from the result so the others keep working; only a fully
 * empty market throws.
 */
export async function fetchMarket(): Promise<Market> {
  const brands: BrandPrices[] = []

  try {
    brands.push(await fetchHrta())
  } catch (err) {
    log(`HRTA failed (${err}), falling back to EmasKITA`)
    try {
      brands.push(await fetchEmaskita())
    } catch (err2) {
      log(`EmasKITA fallback failed too (${err2})`)
    }
  }

  const antam = await fetchAntamPrices()
  if (antam) brands.push(antam)
  else log('every Antam source is down, continuing without the brand')

  if (!brands.length) throw new Error('every price source is down')
  return { fetchedAt: new Date().toISOString(), brands }
}

export function brandPrices(market: Market, brand: Brand): BrandPrices | null {
  return market.brands.find((b) => b.brand === brand) ?? null
}

export function priceOf(market: Market, brand: Brand, gramasi: number): SizePrice | null {
  return brandPrices(market, brand)?.sizes.find((s) => s.gramasi === gramasi) ?? null
}
