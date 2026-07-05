import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectDip } from '../src/core/dip.js'
import { evaluateRung, nearestTargetBelowPrice, nextTargetBelow } from '../src/core/targets.js'
import { parsePriceInput } from '../src/util.js'
import type { DayPrice } from '../src/types.js'

test('rung fires below target, stays quiet once fired', () => {
  assert.equal(evaluateRung(2445000, 2450000, false, 0.5), 'fire')
  assert.equal(evaluateRung(2445000, 2450000, true, 0.5), 'none')
})

test('rung re-arms only after clearing the buffer', () => {
  // Back above target but inside the 0.5% buffer: still off.
  assert.equal(evaluateRung(2455000, 2450000, true, 0.5), 'none')
  assert.equal(evaluateRung(2465000, 2450000, true, 0.5), 'rearm')
  // Re-armed rung fires again on the next drop.
  assert.equal(evaluateRung(2449000, 2450000, false, 0.5), 'fire')
})

test('target helpers pick the right rungs', () => {
  const targets = [2450000, 2400000, 2350000]
  assert.equal(nextTargetBelow(2450000, targets), 2400000)
  assert.equal(nextTargetBelow(2350000, targets), null)
  assert.equal(nearestTargetBelowPrice(2500000, targets), 2450000)
  assert.equal(nearestTargetBelowPrice(2300000, targets), null)
})

function series(prices: number[]): DayPrice[] {
  return prices.map((price, i) => ({ date: `2026-06-${String(i + 1).padStart(2, '0')}`, price }))
}

test('dip fires on a real drop and not on noise', () => {
  const daily = series([2500000, 2510000, 2520000, 2515000, 2505000])

  const calm = detectDip(2500000, daily, 14, 2, null, '2026-06-06', 'emasku', 1)
  assert.equal(calm.event, null)

  const dip = detectDip(2460000, daily, 14, 2, null, '2026-06-06', 'emasku', 1)
  assert.ok(dip.event)
  assert.equal(dip.event.refHigh, 2520000)
  assert.ok(dip.event.dropPct > 2.3 && dip.event.dropPct < 2.5)
  assert.ok(dip.next)
})

test('dip does not re-alert until the drop deepens by 1%', () => {
  const daily = series([2500000, 2510000, 2520000, 2515000, 2505000])

  const first = detectDip(2460000, daily, 14, 2, null, '2026-06-06', 'emasku', 1)
  assert.ok(first.event)

  const shallow = detectDip(2458000, daily, 14, 2, first.next, '2026-06-07', 'emasku', 1)
  assert.equal(shallow.event, null)

  const deeper = detectDip(2430000, daily, 14, 2, first.next, '2026-06-08', 'emasku', 1)
  assert.ok(deeper.event)
})

test('dip episode clears once the price recovers past half the threshold', () => {
  const daily = series([2500000, 2510000, 2520000, 2515000, 2505000])
  const first = detectDip(2460000, daily, 14, 2, null, '2026-06-06', 'emasku', 1)
  const recovered = detectDip(2515000, daily, 14, 2, first.next, '2026-06-09', 'emasku', 1)
  assert.equal(recovered.event, null)
  assert.equal(recovered.next, null)
})

test('price input parsing is forgiving but not gullible', () => {
  assert.equal(parsePriceInput('2450000'), 2450000)
  assert.equal(parsePriceInput('2.450.000'), 2450000)
  assert.equal(parsePriceInput('2,450,000'), 2450000)
  assert.equal(parsePriceInput('Rp 2450000'), 2450000)
  assert.equal(parsePriceInput('rp. 2.450.000'), 2450000)
  assert.equal(parsePriceInput('cheap pls'), null)
  assert.equal(parsePriceInput('2450000 tomorrow'), null)
  assert.equal(parsePriceInput(''), null)
})
