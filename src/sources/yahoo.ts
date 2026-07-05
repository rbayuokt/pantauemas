const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'

// COMEX gold futures, USD per troy ounce. Not exactly spot, but close enough
// to explain direction and to backfill history. XAUUSD=X is gone from Yahoo.
export const GOLD_SYMBOL = 'GC=F'
export const USDIDR_SYMBOL = 'IDR=X'
export const GRAMS_PER_TROY_OZ = 31.1034768

export interface DailyClose {
  /** UTC date, YYYY-MM-DD */
  date: string
  close: number
}

export async function fetchDailyCloses(symbol: string, range = '1y'): Promise<DailyClose[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Yahoo ${symbol} returned HTTP ${res.status}`)
  const json = (await res.json()) as {
    chart: {
      result: Array<{ timestamp?: number[]; indicators: { quote: Array<{ close?: Array<number | null> }> } }> | null
      error: { description?: string } | null
    }
  }
  const result = json.chart.result?.[0]
  if (!result) throw new Error(`Yahoo ${symbol}: ${json.chart.error?.description ?? 'empty result'}`)
  const timestamps = result.timestamp ?? []
  const closes = result.indicators.quote[0]?.close ?? []
  const out: DailyClose[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i]
    const close = closes[i]
    if (ts === undefined || close === null || close === undefined) continue
    out.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), close })
  }
  return out
}
