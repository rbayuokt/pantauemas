import type { BrandPrices, SizePrice } from '../types.js'

const PAGE_URL = 'https://galeri24.co.id/harga-emas'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/**
 * Galeri 24 (Pegadaian's gold retailer) server-renders one price block per
 * vendor, anchored as `<div id="ANTAM">` etc. With tags stripped, the ANTAM
 * block reads as weight / sell / buyback triples like
 * `1 Rp2.777.000 Rp2.476.000`.
 */
export function parseGaleri24Html(html: string): SizePrice[] {
  const section = html.match(/<div id="ANTAM">([\s\S]*?)<div id="/)?.[1]
  if (!section) throw new Error('Galeri 24: ANTAM section not found on the page')
  const text = section.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const sizes: SizePrice[] = []
  for (const m of text.matchAll(/(\d+(?:\.\d+)?) Rp\s?([\d.]+) Rp\s?([\d.]+)/g)) {
    const gramasi = Number(m[1])
    const price = Number((m[2] ?? '').replace(/\./g, ''))
    const buybackPrice = Number((m[3] ?? '').replace(/\./g, ''))
    if (gramasi > 0 && price > 0 && buybackPrice > 0 && buybackPrice <= price) {
      sizes.push({ gramasi, price, buybackPrice })
    }
  }
  const oneGram = sizes.find((s) => s.gramasi === 1)
  if (!oneGram) throw new Error('Galeri 24: no 1g row parsed, layout probably changed')
  if (oneGram.price < 1_000_000 || oneGram.price > 100_000_000) {
    throw new Error(`Galeri 24: implausible 1g price ${oneGram.price}`)
  }
  return sizes.sort((a, b) => a.gramasi - b.gramasi)
}

export async function fetchGaleri24(): Promise<BrandPrices> {
  const res = await fetch(PAGE_URL, {
    headers: { 'user-agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Galeri 24 returned HTTP ${res.status}`)
  const sizes = parseGaleri24Html(await res.text())
  return { brand: 'antam', source: 'galeri24', createdAt: new Date().toISOString(), sizes }
}
