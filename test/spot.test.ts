import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openTestDb } from '../src/core/db.js'
import { latestSpot, refreshSpot, spotDriver } from '../src/core/spot.js'
import { countSpotCalls, storeSpot } from '../src/core/store.js'
import { wibDate } from '../src/util.js'

function fakeFetcher(counter: { calls: number }, goldUsdPerOz = 3300, usdidr = 16200) {
  return async () => {
    counter.calls++
    return { goldUsdPerOz, usdidr }
  }
}

test('refreshSpot calls the API at most once per day', async () => {
  const db = openTestDb()
  const counter = { calls: 0 }
  await refreshSpot(db, 'key', fakeFetcher(counter))
  await refreshSpot(db, 'key', fakeFetcher(counter))
  await refreshSpot(db, 'key', fakeFetcher(counter))
  assert.equal(counter.calls, 1)
  assert.ok(latestSpot(db))
})

test('refreshSpot without an API key never calls out', async () => {
  const db = openTestDb()
  const counter = { calls: 0 }
  await refreshSpot(db, null, fakeFetcher(counter))
  assert.equal(counter.calls, 0)
  assert.equal(latestSpot(db), null)
})

test('refreshSpot refuses once the monthly attempt budget is spent', async () => {
  const db = openTestDb()
  const month = wibDate().slice(0, 7)
  db.prepare('INSERT INTO spot_calls (month, calls) VALUES (?, 80)').run(month)
  const counter = { calls: 0 }
  await refreshSpot(db, 'key', fakeFetcher(counter))
  assert.equal(counter.calls, 0)
})

test('failed attempts spend budget so retry storms cannot pile up', async () => {
  const db = openTestDb()
  const month = wibDate().slice(0, 7)
  const failing = async () => {
    throw new Error('api down')
  }
  await assert.rejects(() => refreshSpot(db, 'key', failing))
  await assert.rejects(() => refreshSpot(db, 'key', failing))
  assert.equal(countSpotCalls(db, month), 2)
})

test('spotDriver needs two days and reports day-over-day changes', () => {
  const db = openTestDb()
  assert.equal(spotDriver(db), null)
  storeSpot(db, { date: '2026-07-04', goldUsd: 3300, usdidr: 16200 })
  assert.equal(spotDriver(db), null)
  storeSpot(db, { date: '2026-07-05', goldUsd: 3267, usdidr: 16216.2 })
  const driver = spotDriver(db)
  assert.ok(driver)
  assert.ok(Math.abs(driver.goldChangePct - -1) < 0.01)
  assert.ok(Math.abs(driver.fxChangePct - 0.1) < 0.01)
})

test('latestSpot hides snapshots older than the freshness window', () => {
  const db = openTestDb()
  storeSpot(db, { date: '2020-01-01', goldUsd: 1550, usdidr: 13900 })
  assert.equal(latestSpot(db), null)
  storeSpot(db, { date: wibDate(), goldUsd: 3300, usdidr: 16200 })
  assert.ok(latestSpot(db))
})
