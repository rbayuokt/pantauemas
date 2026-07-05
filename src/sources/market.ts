import type { Brand, BrandPrices, Market, SizePrice } from '../types.js'
import { log } from '../util.js'
import { fetchAntam } from './anekalogam.js'
import { fetchEmaskita } from './emaskita.js'
import { fetchHrta } from './hrta.js'

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

  try {
    brands.push(await fetchAntam())
  } catch (err) {
    log(`Antam via Aneka Logam failed (${err}), continuing without it`)
  }

  if (!brands.length) throw new Error('every price source is down')
  return { fetchedAt: new Date().toISOString(), brands }
}

export function brandPrices(market: Market, brand: Brand): BrandPrices | null {
  return market.brands.find((b) => b.brand === brand) ?? null
}

export function priceOf(market: Market, brand: Brand, gramasi: number): SizePrice | null {
  return brandPrices(market, brand)?.sizes.find((s) => s.gramasi === gramasi) ?? null
}
