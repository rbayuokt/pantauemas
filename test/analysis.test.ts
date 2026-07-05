import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildReport, buildTimingReport, computeDriver } from '../src/core/analysis.js'
import { parseAnekalogamHtml } from '../src/sources/anekalogam.js'
import { parseEmaskitaHtml } from '../src/sources/emaskita.js'
import type { DayPrice, SizePrice } from '../src/types.js'

function sizeAt(price: number): SizePrice {
  return { gramasi: 1, price, buybackPrice: price * 0.95 }
}

function rampSeries(days: number, from: number, to: number): DayPrice[] {
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    price: from + ((to - from) * i) / (days - 1),
  }))
}

test('price at the bottom of the range reads as CHEAP', () => {
  const report = buildReport(rampSeries(90, 2400000, 2600000), sizeAt(2410000))
  assert.ok(report.cheaperThanPct !== null && report.cheaperThanPct > 90)
  assert.equal(report.verdict, 'CHEAP')
})

test('price at the top reads as EXPENSIVE, and spread is computed', () => {
  const report = buildReport(rampSeries(90, 2400000, 2600000), sizeAt(2590000))
  assert.equal(report.verdict, 'EXPENSIVE')
  assert.ok(Math.abs(report.spreadPct - 5) < 0.01)
})

test('rising series shows an up trend', () => {
  const report = buildReport(rampSeries(90, 2400000, 2600000), sizeAt(2500000))
  assert.equal(report.trend, 'up')
})

test('short history gives no percentile or verdict', () => {
  const report = buildReport(rampSeries(10, 2400000, 2450000), sizeAt(2420000))
  assert.equal(report.cheaperThanPct, null)
  assert.equal(report.verdict, null)
})

test('timing report calls the bottom of a falling series a good buy', () => {
  const timing = buildTimingReport(rampSeries(90, 2600000, 2400000), sizeAt(2400000))
  assert.equal(timing.low90, 2400000)
  assert.equal(timing.high90, 2600000)
  assert.equal(timing.maxScore, 4)
  assert.equal(timing.score, 4)
  assert.equal(timing.timing, 'good')
})

test('timing report says wait at the top of a rising series', () => {
  const timing = buildTimingReport(rampSeries(90, 2400000, 2600000), sizeAt(2600000))
  assert.ok(timing.rangePosPct !== null && timing.rangePosPct > 99)
  assert.equal(timing.score, 0)
  assert.equal(timing.timing, 'wait')
})

test('timing report gives no verdict on short history', () => {
  const timing = buildTimingReport(rampSeries(6, 2400000, 2450000), sizeAt(2420000))
  assert.ok(timing.maxScore < 3)
  assert.equal(timing.timing, null)
  assert.equal(timing.low90, null)
})

test('driver returns raw changes for the copy layer to render', () => {
  const gold = [
    { date: '2026-07-03', close: 3300 },
    { date: '2026-07-04', close: 3267 },
  ]
  const fx = [
    { date: '2026-07-03', close: 17900 },
    { date: '2026-07-04', close: 17905 },
  ]
  const driver = computeDriver(gold, fx)
  assert.ok(driver)
  assert.ok(driver.goldChangePct < -0.9)
  assert.ok(Math.abs(driver.fxChangePct) < 0.1)
  assert.equal(computeDriver([gold[0]!], fx), null)
})

test('emaskita parser reads weights and prices, skipping non-EMASKITA sections', () => {
  const html = `
    <table><thead><tr><th colspan="7" class="text-center">KENCANA GOLD</th></tr></thead>
    <tbody><tr>
      <td class="column1 text-center">1 gr</td>
      <td class="column2"><div style="margin-left: 75%">Rp.</div><div>2,925,100</div></td>
      <td class="column2"><div>Rp.</div><div>2,527,000</div></td>
    </tr></tbody></table>
    <table><thead><tr><th colspan="8" class="text-center">EMASKITA SMALL BAR</th></tr></thead>
    <tbody>
      <tr>
        <td class="column1 text-center">0.5 gr</td>
        <td class="column2"><div style="margin-left: 75%">Rp.</div><div>1,395,900</div></td>
        <td class="column2"><div>Rp.</div><div>1,402,100</div></td>
        <td class="column2"><div>Rp.</div><div>1,408,400</div></td>
        <td class="column2"><div>Rp.</div><div>1,263,500</div></td>
      </tr>
      <tr>
        <td class="column1 text-center">1 gr</td>
        <td class="column2"><div>Rp.</div><div>2,504,000</div></td>
        <td class="column2"><div>Rp.</div><div>2,515,200</div></td>
        <td class="column2"><div>Rp.</div><div>2,526,500</div></td>
        <td class="column2"><div>Rp.</div><div>2,376,000</div></td>
      </tr>
    </tbody></table>`
  const rows = parseEmaskitaHtml(html)
  assert.deepEqual(rows, [
    { gramasi: 0.5, price: 1395900, buybackPrice: 1263500 },
    { gramasi: 1, price: 2504000, buybackPrice: 2376000 },
  ])
})

test('anekalogam parser reads the Antam per-gram quote and production year', () => {
  const html = `
    <div class="buy-sell-rate">
      <div class="item"><h2 class="ngc-title">Harga Jual</h2>
        <p class="today-price"><span class="tprice">Rp2.597.000</span></p></div>
      <div class="item"><h2 class="ngc-title">Harga Beli</h2>
        <p class="today-price"><span class="tprice">Rp2.550.000</span></p></div>
    </div>
    <p class="n-smaller">** Harga berlaku untuk LM Antam produksi tahun 2026</p>`
  const quote = parseAnekalogamHtml(html)
  assert.deepEqual(quote, { sell: 2597000, buy: 2550000, year: '2026' })
})

test('anekalogam parser rejects a page with buyback above sell', () => {
  const html = `
    <span class="tprice">Rp2.500.000</span>
    <span class="tprice">Rp2.600.000</span>`
  assert.throws(() => parseAnekalogamHtml(html))
})
