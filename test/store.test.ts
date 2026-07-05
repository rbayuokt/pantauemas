import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openTestDb } from '../src/core/db.js'
import {
  addWatch, allWatches, deleteWatch, ensureUser, fireWatch, getDipState, getUser, listWatches, mergedDaily,
  rearmWatch, replaceBackfill, setDipState, setLang, setNtfyTopic, storeMarket, toggleDigest, watchedCombos,
} from '../src/core/store.js'
import type { Market } from '../src/types.js'

function market(price = 2504000): Market {
  return {
    fetchedAt: '2026-07-05T04:05:00.000Z',
    brands: [
      {
        brand: 'emasku',
        source: 'hrta',
        createdAt: '2026-07-05T11:00:00+07:00',
        sizes: [
          { gramasi: 1, price, buybackPrice: price - 128000 },
          { gramasi: 5, price: price * 5 - 180000, buybackPrice: price * 5 - 500000 },
        ],
      },
      {
        brand: 'antam',
        source: 'anekalogam',
        createdAt: '2026-07-05T04:05:00.000Z',
        sizes: [{ gramasi: 1, price: price + 93000, buybackPrice: price + 46000 }],
      },
    ],
  }
}

test('users are created once and language sticks', () => {
  const db = openTestDb()
  ensureUser(db, '111')
  setLang(db, '111', 'id')
  ensureUser(db, '111')
  assert.equal(getUser(db, '111')!.lang, 'id')
})

test('ntfy topic can be set, read back, and cleared', () => {
  const db = openTestDb()
  ensureUser(db, '111')
  assert.equal(getUser(db, '111')!.ntfyTopic, null)
  setNtfyTopic(db, '111', 'pantauemas-abc123')
  assert.equal(getUser(db, '111')!.ntfyTopic, 'pantauemas-abc123')
  addWatch(db, '111', 'emasku', 1, 2450000)
  assert.equal(allWatches(db)[0]!.ntfyTopic, 'pantauemas-abc123')
  setNtfyTopic(db, '111', null)
  assert.equal(getUser(db, '111')!.ntfyTopic, null)
})

test('digest toggle flips', () => {
  const db = openTestDb()
  ensureUser(db, '111')
  assert.equal(toggleDigest(db, '111'), false)
  assert.equal(toggleDigest(db, '111'), true)
})

test('watches: add, duplicate, delete, isolation between users and brands', () => {
  const db = openTestDb()
  ensureUser(db, '111')
  ensureUser(db, '222')
  assert.equal(addWatch(db, '111', 'emasku', 1, 2450000), 'ok')
  assert.equal(addWatch(db, '111', 'emasku', 1, 2450000), 'duplicate')
  // Same size and target on another brand is a different watch, not a duplicate.
  assert.equal(addWatch(db, '111', 'antam', 1, 2450000), 'ok')
  assert.equal(addWatch(db, '222', 'emasku', 1, 2450000), 'ok')

  const mine = listWatches(db, '111')
  assert.equal(mine.length, 2)
  assert.equal(deleteWatch(db, '222', mine[0]!.id), false)
  assert.equal(deleteWatch(db, '111', mine[0]!.id), true)
  assert.equal(listWatches(db, '222').length, 1)
})

test('fire and re-arm round-trip through the db', () => {
  const db = openTestDb()
  ensureUser(db, '111')
  addWatch(db, '111', 'emasku', 1, 2450000)
  const watch = listWatches(db, '111')[0]!
  fireWatch(db, watch.id, 2448000)
  assert.equal(listWatches(db, '111')[0]!.firedPrice, 2448000)
  rearmWatch(db, watch.id)
  assert.equal(listWatches(db, '111')[0]!.firedAt, null)
})

test('watched combos come from all users combined, keyed by brand and size', () => {
  const db = openTestDb()
  ensureUser(db, '111')
  ensureUser(db, '222')
  addWatch(db, '111', 'emasku', 1, 2450000)
  addWatch(db, '111', 'antam', 1, 2500000)
  addWatch(db, '222', 'emasku', 5, 12000000)
  assert.deepEqual(watchedCombos(db), [
    { brand: 'antam', gramasi: 1 },
    { brand: 'emasku', gramasi: 1 },
    { brand: 'emasku', gramasi: 5 },
  ])
  assert.equal(allWatches(db).length, 3)
})

test('market storage keeps brands separate and merged history prefers real rows', () => {
  const db = openTestDb()
  storeMarket(db, market(2504000))
  storeMarket(db, market(2504000)) // same day again: replace, not duplicate
  replaceBackfill(db, 'emasku', 1, [
    { date: '2026-07-03', price: 2480000 },
    { date: '2026-07-05', price: 9999999 }, // same date as a real row, must lose
  ])
  const daily = mergedDaily(db, 'emasku', 1)
  assert.deepEqual(daily.map((d) => d.date), ['2026-07-03', '2026-07-05'])
  assert.equal(daily[1]!.price, 2504000)
  assert.equal(daily[0]!.synthetic, true)
  // Antam history is its own series.
  const antam = mergedDaily(db, 'antam', 1)
  assert.equal(antam.length, 1)
  assert.equal(antam[0]!.price, 2597000)
})

test('dip state persists and clears per brand and size', () => {
  const db = openTestDb()
  setDipState(db, { brand: 'emasku', gramasi: 1, date: '2026-07-05', price: 2440000, refHigh: 2520000 }, 'emasku', 1)
  assert.equal(getDipState(db, 'emasku', 1)!.refHigh, 2520000)
  assert.equal(getDipState(db, 'antam', 1), null)
  assert.equal(getDipState(db, 'emasku', 5), null)
  setDipState(db, null, 'emasku', 1)
  assert.equal(getDipState(db, 'emasku', 1), null)
})
