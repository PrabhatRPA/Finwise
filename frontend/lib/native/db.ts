// SQLite connection manager for the iOS/Android build.
// Uses @capacitor-community/sqlite, which talks to the native sqlite3
// available on the device. The same code path won't work on web; callers
// should gate via Capacitor.isNativePlatform() before reaching this module.

import { Capacitor } from '@capacitor/core'
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite'

import { SCHEMA_SQL, SCHEMA_VERSION } from './schema'

const DB_NAME = 'finwise'
let connection: SQLiteConnection | null = null
let db: SQLiteDBConnection | null = null
let initPromise: Promise<SQLiteDBConnection> | null = null

export async function getDb(): Promise<SQLiteDBConnection> {
  if (db) return db
  if (!initPromise) initPromise = init()
  return initPromise
}

async function init(): Promise<SQLiteDBConnection> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('SQLite is only available on native (iOS/Android).')
  }
  if (!connection) connection = new SQLiteConnection(CapacitorSQLite)

  // createConnection is idempotent — re-using an existing one is fine.
  const isConn = (await connection.isConnection(DB_NAME, false)).result
  const conn = isConn
    ? await connection.retrieveConnection(DB_NAME, false)
    : await connection.createConnection(DB_NAME, false, 'no-encryption', 1, false)

  await conn.open()
  await conn.execute(SCHEMA_SQL)

  // Record schema version (idempotent upsert).
  await conn.run(
    `INSERT INTO schema_meta(key, value) VALUES('version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(SCHEMA_VERSION)],
  )

  // Incremental migrations — each statement is safe to re-run.
  // ALTER TABLE ADD COLUMN must NOT include UNIQUE (unsupported in older SQLite).
  // Uniqueness is enforced via a separate partial index instead.
  const migrations = [
    `ALTER TABLE users ADD COLUMN apple_user_id TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_user_id ON users(apple_user_id) WHERE apple_user_id IS NOT NULL`,
    // International markets: native trading currency per holding + per cached quote.
    `ALTER TABLE holdings ADD COLUMN currency TEXT`,
    `ALTER TABLE market_prices ADD COLUMN currency TEXT`,
    // Property-secured debts: monthly escrow (tax + insurance) + optional growth.
    // Optional — existing loans default to 0, so PITI == P&I unless the user sets it.
    `ALTER TABLE loans ADD COLUMN monthly_escrow REAL DEFAULT 0`,
    `ALTER TABLE loans ADD COLUMN escrow_annual_growth REAL DEFAULT 0`,
    // Append-only property value history (replaces reliance on a single mutable
    // value). Existing properties are backfilled to one snapshot in db.ts below.
    `CREATE TABLE IF NOT EXISTS property_value_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      value REAL NOT NULL,
      as_of_date TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_prop_snap_user ON property_value_snapshots(user_id, property_id, as_of_date)`,
  ]
  for (const sql of migrations) {
    try { await conn.run(sql, []) } catch { /* already applied — skip */ }
  }

  // One-time backfill: seed each existing property with an opening value snapshot
  // (dated to its creation) so the value-trend chart has history immediately.
  // Idempotent — only touches properties that have a value and no snapshot yet.
  try {
    await conn.run(
      `INSERT INTO property_value_snapshots (user_id, property_id, value, as_of_date, source, note)
       SELECT user_id, id, COALESCE(manual_value, estimated_value),
              COALESCE(substr(created_at, 1, 10), date('now')), 'manual', NULL
       FROM properties
       WHERE COALESCE(manual_value, estimated_value) IS NOT NULL
         AND id NOT IN (SELECT DISTINCT property_id FROM property_value_snapshots)`,
      [],
    )
  } catch { /* fresh/empty DB — nothing to backfill */ }

  db = conn
  return db
}

// Convenience helpers — type-safe enough for our needs without pulling in a
// query builder. The result shape from @capacitor-community/sqlite is
// { values?: any[] } for queries and { changes: { changes, lastId } } for mutations.

export async function all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const conn = await getDb()
  const res = await conn.query(sql, params)
  return (res.values ?? []) as T[]
}

export async function get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await all<T>(sql, params)
  return rows[0] ?? null
}

// Write-listener registry — notified after any INSERT / UPDATE / DELETE.
// Used by the auto-sync wiring in api.ts to trigger iCloud sync on data changes.
const _writeListeners: Array<() => void> = []
export function onDbWrite(listener: () => void): void {
  _writeListeners.push(listener)
}

const WRITE_SQL = /^\s*(INSERT|UPDATE|DELETE)/i

export async function run(
  sql: string,
  params: any[] = [],
): Promise<{ changes: number; lastId: number }> {
  const conn = await getDb()
  // Pass transaction=false so the plugin does NOT auto-wrap in BEGIN/COMMIT.
  // This prevents "cannot start a transaction within a transaction" when run()
  // is called inside an explicit beginTransaction()/commitTransaction() block.
  // Outside a transaction, SQLite auto-commits each statement anyway.
  const res = await conn.run(sql, params, false)
  if (WRITE_SQL.test(sql) && _writeListeners.length > 0) {
    for (const l of _writeListeners) l()
  }
  return {
    changes: res.changes?.changes ?? 0,
    lastId: res.changes?.lastId ?? 0,
  }
}

export async function beginTransaction(): Promise<void> {
  const conn = await getDb()
  await conn.beginTransaction()
}

export async function commitTransaction(): Promise<void> {
  const conn = await getDb()
  await conn.commitTransaction()
}

export async function rollbackTransaction(): Promise<void> {
  const conn = await getDb()
  await conn.rollbackTransaction()
}
