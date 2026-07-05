const PAGE_URL = 'https://www.logammulia.com/id/harga-emas-hari-ini'
// Akamai rejects non-browser clients at the TLS level, so the page goes
// through r.jina.ai, a free proxy that renders it as markdown. An optional
// JINA_API_KEY raises the rate limit; a few calls a day don't need one.
const READER_URL = `https://r.jina.ai/${PAGE_URL}`

export interface OfficialQuote {
  gramasi: number
  /** Harga dasar (before the 0.25% PPh 22 the shop adds for non-NPWP buyers). */
  price: number
}

/**
 * The reader turns the official table into markdown rows like
 * `| 1 gr | 2,670,000 | 2,676,675 |` (weight, harga dasar, with-tax) under
 * an "Emas Batangan" header. Themed sections below it (Gift Series, Imlek,
 * Batik) repeat weights at premium prices, so parsing stops there. The page
 * has sell prices only; buyback sits behind a login.
 */
export function parseLogammuliaMarkdown(markdown: string): OfficialQuote[] {
  const start = markdown.search(/^\|\s*Emas Batangan\s*\|?\s*$/m)
  if (start === -1) throw new Error('Logam Mulia: "Emas Batangan" section not found in reader output')
  const quotes: OfficialQuote[] = []
  for (const line of markdown.slice(start).split('\n').slice(1)) {
    if (!line.trim().startsWith('|')) break
    const row = line.match(/^\|\s*([\d.]+)\s*gr\s*\|\s*([\d,.]+)\s*\|/)
    if (!row) break // a themed section header like "| Emas Batangan Gift Series |"
    const gramasi = Number(row[1])
    const price = Number((row[2] ?? '').replace(/[^\d]/g, ''))
    if (gramasi > 0 && price > 0) quotes.push({ gramasi, price })
  }
  const oneGram = quotes.find((q) => q.gramasi === 1)
  if (!oneGram) throw new Error('Logam Mulia: no 1g row parsed, layout probably changed')
  if (oneGram.price < 1_000_000 || oneGram.price > 100_000_000) {
    throw new Error(`Logam Mulia: implausible 1g price ${oneGram.price}`)
  }
  return quotes
}

/** Official LM Antam sell prices (harga dasar) per denomination, no buyback. */
export async function fetchLogammulia(): Promise<OfficialQuote[]> {
  const headers: Record<string, string> = {
    accept: 'text/plain',
    // skip image rendering, it just burns reader quota
    'x-retain-images': 'none',
  }
  const key = process.env.JINA_API_KEY
  if (key) headers.authorization = `Bearer ${key}`
  const res = await fetch(READER_URL, { headers, signal: AbortSignal.timeout(45_000) })
  if (!res.ok) throw new Error(`Jina Reader returned HTTP ${res.status} for logammulia.com`)
  return parseLogammuliaMarkdown(await res.text())
}
