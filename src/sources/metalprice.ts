const BASE_URL = 'https://api.metalpriceapi.com/v1'

export interface MetalSpot {
  /** World gold, USD per troy ounce. */
  goldUsdPerOz: number
  /** Rupiah per US dollar. */
  usdidr: number
}

/**
 * One /latest call returns both world gold and USD/IDR. The free plan allows
 * only 100 calls a month, so this must never be wired to a user command:
 * refreshSpot (core/spot.ts) is the only caller, from scheduled jobs, at most
 * once per WIB day and hard-capped by a monthly ledger.
 */
export async function fetchMetalSpot(apiKey: string): Promise<MetalSpot> {
  const url = `${BASE_URL}/latest?api_key=${encodeURIComponent(apiKey)}&base=USD&currencies=IDR,XAU`
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`metalpriceapi returned HTTP ${res.status}`)
  const json = (await res.json()) as {
    success: boolean
    error?: { code?: number; info?: string }
    rates?: Record<string, number>
  }
  if (!json.success || !json.rates) throw new Error(`metalpriceapi error: ${json.error?.info ?? 'unknown'}`)
  // rates.XAU is troy ounces per USD; USDXAU is the reciprocal the docs also send.
  const goldUsdPerOz = json.rates.USDXAU ?? (json.rates.XAU ? 1 / json.rates.XAU : Number.NaN)
  const usdidr = json.rates.IDR ?? Number.NaN
  if (!Number.isFinite(goldUsdPerOz) || goldUsdPerOz <= 0 || !Number.isFinite(usdidr) || usdidr <= 0) {
    throw new Error('metalpriceapi response missing XAU or IDR rate')
  }
  return { goldUsdPerOz, usdidr }
}
