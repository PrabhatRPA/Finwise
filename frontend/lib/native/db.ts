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

  // Incremental migrations — safe to re-run (errors mean column already exists).
  const migrations = [
    `ALTER TABLE users ADD COLUMN apple_user_id TEXT UNIQUE`,
  ]
  for (const sql of migrations) {
    try { await conn.run(sql, []) } catch { /* column already exists — skip */ }
  }

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

export async function run(
  sql: string,
  params: any[] = [],
): Promise<{ changes: number; lastId: number }> {
  const conn = await getDb()
  const res = await conn.run(sql, params)
  return {
    changes: res.changes?.changes ?? 0,
    lastId: res.changes?.lastId ?? 0,
  }
}
