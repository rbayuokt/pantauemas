import type { Db } from './db.js'
import type { Brand, DayPrice, DipStateRow, Lang, Market, UserRow, WatchRow } from '../types.js'
import { wibDate } from '../util.js'

function asBrand(value: unknown): Brand {
  return value === 'antam' ? 'antam' : 'emasku'
}

// ---- users ----

function toUser(row: Record<string, unknown>): UserRow {
  return {
    chatId: String(row.chat_id),
    lang: row.lang === 'id' ? 'id' : 'en',
    digestEnabled: Boolean(row.digest_enabled),
    ntfyTopic: row.ntfy_topic ? String(row.ntfy_topic) : null,
    createdAt: String(row.created_at),
  }
}

export function getUser(db: Db, chatId: string): UserRow | null {
  const row = db.prepare('SELECT * FROM users WHERE chat_id = ?').get(chatId)
  return row ? toUser(row as Record<string, unknown>) : null
}

export function ensureUser(db: Db, chatId: string): UserRow {
  const existing = getUser(db, chatId)
  if (existing) return existing
  db.prepare('INSERT INTO users (chat_id, lang, digest_enabled, created_at) VALUES (?, ?, 1, ?)')
    .run(chatId, 'en', new Date().toISOString())
  return getUser(db, chatId)!
}

export function setLang(db: Db, chatId: string, lang: Lang): void {
  ensureUser(db, chatId)
  db.prepare('UPDATE users SET lang = ? WHERE chat_id = ?').run(lang, chatId)
}

export function setNtfyTopic(db: Db, chatId: string, topic: string | null): void {
  ensureUser(db, chatId)
  db.prepare('UPDATE users SET ntfy_topic = ? WHERE chat_id = ?').run(topic, chatId)
}

export function toggleDigest(db: Db, chatId: string): boolean {
  const user = ensureUser(db, chatId)
  const next = user.digestEnabled ? 0 : 1
  db.prepare('UPDATE users SET digest_enabled = ? WHERE chat_id = ?').run(next, chatId)
  return Boolean(next)
}

export function digestUsers(db: Db): UserRow[] {
  return (db.prepare('SELECT * FROM users WHERE digest_enabled = 1').all() as Record<string, unknown>[]).map(toUser)
}

// ---- watches ----

function toWatch(row: Record<string, unknown>): WatchRow {
  return {
    id: Number(row.id),
    chatId: String(row.chat_id),
    brand: asBrand(row.brand),
    gramasi: Number(row.gramasi),
    target: Number(row.target),
    firedAt: row.fired_at ? String(row.fired_at) : null,
    firedPrice: row.fired_price === null || row.fired_price === undefined ? null : Number(row.fired_price),
  }
}

export const MAX_WATCHES_PER_USER = 15

export function addWatch(db: Db, chatId: string, brand: Brand, gramasi: number, target: number): 'ok' | 'duplicate' | 'limit' {
  const count = db.prepare('SELECT COUNT(*) AS n FROM watches WHERE chat_id = ?').get(chatId) as { n: number }
  if (count.n >= MAX_WATCHES_PER_USER) return 'limit'
  try {
    db.prepare('INSERT INTO watches (chat_id, brand, gramasi, target, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(chatId, brand, gramasi, target, new Date().toISOString())
    return 'ok'
  } catch {
    return 'duplicate'
  }
}

export function listWatches(db: Db, chatId: string): WatchRow[] {
  const rows = db.prepare('SELECT * FROM watches WHERE chat_id = ? ORDER BY brand, gramasi, target DESC').all(chatId)
  return (rows as Record<string, unknown>[]).map(toWatch)
}

export function deleteWatch(db: Db, chatId: string, id: number): boolean {
  const before = db.prepare('SELECT COUNT(*) AS n FROM watches WHERE id = ? AND chat_id = ?').get(id, chatId) as { n: number }
  db.prepare('DELETE FROM watches WHERE id = ? AND chat_id = ?').run(id, chatId)
  return before.n > 0
}

export function allWatches(db: Db): Array<WatchRow & { lang: Lang; ntfyTopic: string | null }> {
  const rows = db.prepare(
    'SELECT w.*, u.lang AS lang, u.ntfy_topic AS ntfy_topic FROM watches w JOIN users u ON u.chat_id = w.chat_id ORDER BY w.chat_id, w.brand, w.gramasi, w.target DESC',
  ).all()
  return (rows as Record<string, unknown>[]).map((r) => ({
    ...toWatch(r),
    lang: r.lang === 'id' ? ('id' as const) : ('en' as const),
    ntfyTopic: r.ntfy_topic ? String(r.ntfy_topic) : null,
  }))
}

export interface WatchedCombo {
  brand: Brand
  gramasi: number
}

export function watchedCombos(db: Db): WatchedCombo[] {
  const rows = db.prepare('SELECT DISTINCT brand, gramasi FROM watches ORDER BY brand, gramasi').all() as Array<{
    brand: string
    gramasi: number
  }>
  return rows.map((r) => ({ brand: asBrand(r.brand), gramasi: Number(r.gramasi) }))
}

export function fireWatch(db: Db, id: number, price: number): void {
  db.prepare('UPDATE watches SET fired_at = ?, fired_price = ? WHERE id = ?').run(new Date().toISOString(), price, id)
}

export function rearmWatch(db: Db, id: number): void {
  db.prepare('UPDATE watches SET fired_at = NULL, fired_price = NULL WHERE id = ?').run(id)
}

// ---- prices ----

export function storeMarket(db: Db, market: Market): void {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO prices (date, brand, gramasi, price, buyback, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  for (const bp of market.brands) {
    const date = wibDate(bp.createdAt)
    for (const s of bp.sizes) stmt.run(date, bp.brand, s.gramasi, s.price, s.buybackPrice, bp.source, bp.createdAt)
  }
}

/** Real history for one brand and size, oldest first. */
export function realDaily(db: Db, brand: Brand, gramasi: number): DayPrice[] {
  const rows = db.prepare('SELECT date, price, buyback FROM prices WHERE brand = ? AND gramasi = ? ORDER BY date').all(brand, gramasi)
  return (rows as Array<{ date: string; price: number; buyback: number }>).map((r) => ({
    date: r.date,
    price: Number(r.price),
    buybackPrice: Number(r.buyback),
  }))
}

/** Backfill plus real history merged into one daily series. Real data wins on overlap. */
export function mergedDaily(db: Db, brand: Brand, gramasi: number): DayPrice[] {
  const byDate = new Map<string, DayPrice>()
  const bf = db.prepare('SELECT date, price FROM backfill WHERE brand = ? AND gramasi = ? ORDER BY date').all(brand, gramasi)
  for (const r of bf as Array<{ date: string; price: number }>) {
    byDate.set(r.date, { date: r.date, price: Number(r.price), synthetic: true })
  }
  for (const row of realDaily(db, brand, gramasi)) byDate.set(row.date, row)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function replaceBackfill(db: Db, brand: Brand, gramasi: number, rows: Array<{ date: string; price: number }>): void {
  db.prepare('DELETE FROM backfill WHERE brand = ? AND gramasi = ?').run(brand, gramasi)
  const stmt = db.prepare('INSERT INTO backfill (date, brand, gramasi, price) VALUES (?, ?, ?, ?)')
  for (const r of rows) stmt.run(r.date, brand, gramasi, Math.round(r.price))
}

// ---- dip state ----

export function getDipState(db: Db, brand: Brand, gramasi: number): DipStateRow | null {
  const row = db.prepare('SELECT * FROM dip_state WHERE brand = ? AND gramasi = ?').get(brand, gramasi) as
    | { brand: string; gramasi: number; date: string; price: number; ref_high: number }
    | undefined
  return row
    ? { brand: asBrand(row.brand), gramasi: Number(row.gramasi), date: row.date, price: Number(row.price), refHigh: Number(row.ref_high) }
    : null
}

export function setDipState(db: Db, state: DipStateRow | null, brand: Brand, gramasi: number): void {
  if (state === null) {
    db.prepare('DELETE FROM dip_state WHERE brand = ? AND gramasi = ?').run(brand, gramasi)
  } else {
    db.prepare('INSERT OR REPLACE INTO dip_state (brand, gramasi, date, price, ref_high) VALUES (?, ?, ?, ?, ?)')
      .run(brand, gramasi, state.date, state.price, state.refHigh)
  }
}
