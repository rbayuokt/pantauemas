import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type Db = DatabaseSync

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  chat_id TEXT PRIMARY KEY,
  lang TEXT NOT NULL DEFAULT 'en',
  digest_enabled INTEGER NOT NULL DEFAULT 1,
  ntfy_topic TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL REFERENCES users(chat_id),
  brand TEXT NOT NULL DEFAULT 'emasku',
  gramasi REAL NOT NULL,
  target INTEGER NOT NULL,
  fired_at TEXT,
  fired_price INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (chat_id, brand, gramasi, target)
);

CREATE TABLE IF NOT EXISTS prices (
  date TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'emasku',
  gramasi REAL NOT NULL,
  price INTEGER NOT NULL,
  buyback INTEGER NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (date, brand, gramasi)
);

CREATE TABLE IF NOT EXISTS backfill (
  date TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'emasku',
  gramasi REAL NOT NULL,
  price INTEGER NOT NULL,
  PRIMARY KEY (date, brand, gramasi)
);

CREATE TABLE IF NOT EXISTS spot (
  date TEXT PRIMARY KEY,
  gold_usd REAL NOT NULL,
  usdidr REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spot_calls (
  month TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dip_state (
  brand TEXT NOT NULL DEFAULT 'emasku',
  gramasi REAL NOT NULL,
  date TEXT NOT NULL,
  price INTEGER NOT NULL,
  ref_high INTEGER NOT NULL,
  PRIMARY KEY (brand, gramasi)
);
`

function columns(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as Array<{ name: string }>).map(
    (c) => c.name,
  )
}

function migrate(db: DatabaseSync): void {
  // Additive migrations for databases created before a column existed.
  if (!columns(db, 'users').includes('ntfy_topic')) db.exec('ALTER TABLE users ADD COLUMN ntfy_topic TEXT')

  // Brand support: watches/prices/backfill/dip_state gained a brand key. SQLite
  // can't alter primary keys or unique constraints, so pre-brand tables get
  // rebuilt with existing rows marked as EMASKU (the only brand back then).
  if (!columns(db, 'watches').includes('brand')) {
    db.exec(`
      CREATE TABLE watches_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL REFERENCES users(chat_id),
        brand TEXT NOT NULL DEFAULT 'emasku',
        gramasi REAL NOT NULL,
        target INTEGER NOT NULL,
        fired_at TEXT,
        fired_price INTEGER,
        created_at TEXT NOT NULL,
        UNIQUE (chat_id, brand, gramasi, target)
      );
      INSERT INTO watches_new (id, chat_id, brand, gramasi, target, fired_at, fired_price, created_at)
        SELECT id, chat_id, 'emasku', gramasi, target, fired_at, fired_price, created_at FROM watches;
      DROP TABLE watches;
      ALTER TABLE watches_new RENAME TO watches;
    `)
  }
  if (!columns(db, 'prices').includes('brand')) {
    db.exec(`
      CREATE TABLE prices_new (
        date TEXT NOT NULL,
        brand TEXT NOT NULL DEFAULT 'emasku',
        gramasi REAL NOT NULL,
        price INTEGER NOT NULL,
        buyback INTEGER NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (date, brand, gramasi)
      );
      INSERT INTO prices_new (date, brand, gramasi, price, buyback, source, created_at)
        SELECT date, 'emasku', gramasi, price, buyback, source, created_at FROM prices;
      DROP TABLE prices;
      ALTER TABLE prices_new RENAME TO prices;
    `)
  }
  if (!columns(db, 'backfill').includes('brand')) {
    db.exec(`
      CREATE TABLE backfill_new (
        date TEXT NOT NULL,
        brand TEXT NOT NULL DEFAULT 'emasku',
        gramasi REAL NOT NULL,
        price INTEGER NOT NULL,
        PRIMARY KEY (date, brand, gramasi)
      );
      INSERT INTO backfill_new (date, brand, gramasi, price)
        SELECT date, 'emasku', gramasi, price FROM backfill;
      DROP TABLE backfill;
      ALTER TABLE backfill_new RENAME TO backfill;
    `)
  }
  if (!columns(db, 'dip_state').includes('brand')) {
    db.exec(`
      CREATE TABLE dip_state_new (
        brand TEXT NOT NULL DEFAULT 'emasku',
        gramasi REAL NOT NULL,
        date TEXT NOT NULL,
        price INTEGER NOT NULL,
        ref_high INTEGER NOT NULL,
        PRIMARY KEY (brand, gramasi)
      );
      INSERT INTO dip_state_new (brand, gramasi, date, price, ref_high)
        SELECT 'emasku', gramasi, date, price, ref_high FROM dip_state;
      DROP TABLE dip_state;
      ALTER TABLE dip_state_new RENAME TO dip_state;
    `)
  }
}

export function openDb(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(join(dataDir, 'pantauemas.db'))
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(SCHEMA)
  migrate(db)
  return db
}

/** In-memory database for tests. */
export function openTestDb(): Db {
  const db = new DatabaseSync(':memory:')
  db.exec(SCHEMA)
  return db
}
