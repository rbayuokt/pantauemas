import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseGaleri24Html } from '../src/sources/galeri24.js'
import { parseIndogoldPricelist } from '../src/sources/indogold.js'
import { parseLogammuliaMarkdown } from '../src/sources/logammulia.js'

// Trimmed from real Jina Reader output for logammulia.com/id/harga-emas-hari-ini.
const LM_MARKDOWN = `## Harga Emas Hari Ini, 05 Jul 2026

Harga di-update setiap hari pkl. 08.30 WIB

| Berat | Harga Dasar | Harga (+Pajak PPh 0.25%) |
| --- | --- | --- |
| Emas Batangan |
| 0.5 gr | 1,385,000 | 1,388,463 |
| 1 gr | 2,670,000 | 2,676,675 |
| 5 gr | 13,125,000 | 13,157,813 |
| 100 gr | 261,212,000 | 261,865,030 |
| 1000 gr | 2,610,600,000 | 2,617,126,500 |
| Emas Batangan Gift Series |
| 0.5 gr | 1,455,000 | 1,458,638 |
| 1 gr | 2,820,000 | 2,827,050 |
`

test('logammulia: parses the plain bar section, harga dasar column', () => {
  const quotes = parseLogammuliaMarkdown(LM_MARKDOWN)
  assert.deepEqual(quotes.map((q) => q.gramasi), [0.5, 1, 5, 100, 1000])
  assert.equal(quotes.find((q) => q.gramasi === 1)!.price, 2_670_000)
  assert.equal(quotes.find((q) => q.gramasi === 1000)!.price, 2_610_600_000)
})

test('logammulia: stops before themed sections so gift prices never leak in', () => {
  const quotes = parseLogammuliaMarkdown(LM_MARKDOWN)
  // The Gift Series repeats 0.5g at a premium; only the plain row must win.
  assert.equal(quotes.filter((q) => q.gramasi === 0.5).length, 1)
  assert.equal(quotes.find((q) => q.gramasi === 0.5)!.price, 1_385_000)
})

test('logammulia: refuses output without the bar section', () => {
  assert.throws(() => parseLogammuliaMarkdown('Warning: target URL returned error 451'), /section not found/)
})

// Shape of indogold.id/home/get_data_pricelist for product LM_1, trimmed.
const INDOGOLD_JSON = {
  status: true,
  data: {
    list_variant: ['Tahun 2026', 'Tahun 2025', 'Tahun 2024'],
    data_denom: {
      '0.5': {
        'Tahun 2026': { harga: 'Rp. 1,436,500', harga_buyback: 'Rp. 1,270,000' },
        'Tahun 2024': { harga: 'Rp. 1,410,500', harga_buyback: 'Rp. 1,220,000' },
      },
      '1.0': {
        'Tahun 2026': { harga: 'Rp. 2,738,000', harga_buyback: 'Rp. 2,540,000' },
        'Tahun 2025': { harga: 'Rp. 2,716,000', harga_buyback: 'Rp. 2,470,000' },
      },
      '100.0': {
        'Tahun 2026': { harga: 'Rp. 260,800,000', harga_buyback: 'Rp. 254,000,000' },
      },
    },
  },
}

test('indogold: picks the newest production year and parses Rp strings', () => {
  const sizes = parseIndogoldPricelist(INDOGOLD_JSON)
  assert.deepEqual(sizes.map((s) => s.gramasi), [0.5, 1, 100])
  const oneGram = sizes.find((s) => s.gramasi === 1)!
  assert.equal(oneGram.price, 2_738_000)
  assert.equal(oneGram.buybackPrice, 2_540_000)
})

test('indogold: rejects an expired-session response', () => {
  assert.throws(
    () => parseIndogoldPricelist({ status: false, error: 'Form session expired, Mohon reload halaman.' }),
    /pricelist rejected/,
  )
})

// Trimmed from the server-rendered ANTAM block on galeri24.co.id/harga-emas.
const GALERI24_HTML = `
<div id="ANTAM"><div class="grid"><div class="text-lg"> Diperbarui Minggu, 5 Juli 2026</div>
<div>Harga ANTAM</div><div>Berat</div><div>Harga Jual</div><div>Harga Buyback</div>
<div>0.5</div><div>Rp1.441.000</div><div>Rp1.238.000</div>
<div>1</div><div>Rp2.777.000</div><div>Rp2.476.000</div>
<div>100</div><div>Rp271.661.000</div><div>Rp246.418.000</div>
</div></div><div id="ANTAM MULIA RETRO"><div>1</div><div>Rp2.600.000</div><div>Rp2.400.000</div></div>
`

test('galeri24: parses the ANTAM block only', () => {
  const sizes = parseGaleri24Html(GALERI24_HTML)
  assert.deepEqual(sizes.map((s) => s.gramasi), [0.5, 1, 100])
  const oneGram = sizes.find((s) => s.gramasi === 1)!
  assert.equal(oneGram.price, 2_777_000)
  assert.equal(oneGram.buybackPrice, 2_476_000)
})

test('galeri24: refuses a page without the ANTAM block', () => {
  assert.throws(() => parseGaleri24Html('<html><body>maintenance</body></html>'), /ANTAM section not found/)
})
