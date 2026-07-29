// On-device properties (real estate) CRUD.
// Mirrors backend/app/api/v1/properties.py.
//
// `current_value` and `equity` are computed columns in the FastAPI response,
// not stored. We compute the same here so the UI sees identical shape:
//   current_value = manual_value (if set) ?? estimated_value ?? 0
//   equity        = current_value - sum(outstanding mortgage loans against this property)
//
// On iOS we don't yet link individual mortgage loans to properties (no
// schema relationship), so equity == current_value. Phase 2.

import { all, get, run } from './db'
import { requireSessionUserId } from './session'

interface PropertyRow {
  id: number
  user_id: number
  property_type: string
  nickname: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  country: string
  manual_value: number | null
  estimated_value: number | null
  last_estimated_at: string | null
  valuation_source: string | null
  purchase_price: number | null
  purchase_date: string | null
  notes: string | null
  is_active: number
  created_at: string | null
  updated_at: string | null
}

function enrich(p: PropertyRow) {
  const current = p.manual_value ?? p.estimated_value ?? 0
  return {
    ...p,
    is_active: !!p.is_active,
    current_value: current,
    equity: current,  // mortgage linkage not implemented yet
  }
}

export const nativePropertiesApi = {
  getAll: async () => {
    const userId = await requireSessionUserId()
    const rows = await all<PropertyRow>(
      `SELECT * FROM properties WHERE user_id = ? AND is_active = 1 ORDER BY id DESC`,
      [userId],
    )
    const enriched = rows.map(enrich)
    const total_value = enriched.reduce((s, p) => s + p.current_value, 0)
    return { data: { properties: enriched, total_value } }
  },

  create: async (data: any) => {
    const userId = await requireSessionUserId()
    const propertyType = data.property_type || 'single_family'
    const res = await run(
      `INSERT INTO properties (
         user_id, property_type, nickname, address, city, state, zip_code, country,
         manual_value, purchase_price, purchase_date, notes, valuation_source
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        propertyType,
        data.nickname ?? null,
        data.address ?? null,
        data.city ?? null,
        data.state ?? null,
        data.zip_code ?? null,
        data.country ?? 'US',
        toNumOrNull(data.manual_value),
        toNumOrNull(data.purchase_price),
        data.purchase_date ?? null,
        data.notes ?? null,
        data.manual_value != null ? 'manual' : null,
      ],
    )
    const row = await get<PropertyRow>(`SELECT * FROM properties WHERE id = ?`, [res.lastId])
    // Seed the value history with the opening value so the trend chart has a
    // starting point immediately (nothing else required of the user).
    if (row && data.manual_value != null && data.manual_value !== '') {
      await upsertSnapshot(userId, res.lastId, Number(data.manual_value), isoToday(), null)
    }
    return { data: row ? enrich(row) : null }
  },

  update: async (id: number, data: any) => {
    const userId = await requireSessionUserId()
    const fields = [
      'property_type', 'nickname', 'address', 'city', 'state', 'zip_code',
      'country', 'manual_value', 'purchase_price', 'purchase_date', 'notes',
    ]
    const sets: string[] = []
    const params: any[] = []
    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(`${f} = ?`)
        params.push(f === 'manual_value' || f === 'purchase_price' ? toNumOrNull(data[f]) : data[f])
      }
    }
    // Setting manual_value flips valuation_source to 'manual'.
    if (data.manual_value !== undefined && data.manual_value !== null) {
      sets.push(`valuation_source = ?`)
      params.push('manual')
    }
    if (sets.length === 0) {
      const row = await get<PropertyRow>(
        `SELECT * FROM properties WHERE id = ? AND user_id = ?`,
        [id, userId],
      )
      return { data: row ? enrich(row) : null }
    }
    sets.push(`updated_at = CURRENT_TIMESTAMP`)
    params.push(id, userId)
    await run(
      `UPDATE properties SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
      params,
    )
    // Editing the value records it in the history too (deduped per day), so the
    // trend chart and the current value never diverge.
    if (data.manual_value !== undefined && data.manual_value !== null && data.manual_value !== '') {
      await upsertSnapshot(userId, id, Number(data.manual_value), isoToday(), null)
    }
    const row = await get<PropertyRow>(
      `SELECT * FROM properties WHERE id = ? AND user_id = ?`,
      [id, userId],
    )
    return { data: row ? enrich(row) : null }
  },

  delete: async (id: number) => {
    const userId = await requireSessionUserId()
    // Soft delete to match FastAPI semantics (preserves historical exports).
    await run(
      `UPDATE properties SET is_active = 0 WHERE id = ? AND user_id = ?`,
      [id, userId],
    )
    return { data: { success: true } }
  },

  // ── Property value snapshots (append-only dated history) ──────────────────
  // The current value stays derived from manual_value (kept in sync with the
  // newest snapshot), so net worth and every existing read are unchanged.

  // Every snapshot for one property, oldest first (for the per-property chart).
  getSnapshots: async (propertyId: number) => {
    const userId = await requireSessionUserId()
    const snapshots = await all<PropertySnapshot>(
      `SELECT * FROM property_value_snapshots WHERE user_id = ? AND property_id = ?
       ORDER BY as_of_date ASC, created_at ASC`,
      [userId, propertyId],
    )
    return { data: { snapshots } }
  },

  // Every snapshot across all of the user's properties (for the combined chart).
  getAllSnapshots: async () => {
    const userId = await requireSessionUserId()
    const snapshots = await all<PropertySnapshot>(
      `SELECT * FROM property_value_snapshots WHERE user_id = ?
       ORDER BY property_id ASC, as_of_date ASC, created_at ASC`,
      [userId],
    )
    return { data: { snapshots } }
  },

  // Add (or replace same-day) a dated value. Backdatable via as_of_date.
  addSnapshot: async (propertyId: number, data: { value: any; as_of_date?: string; note?: string | null }) => {
    const userId = await requireSessionUserId()
    const value = Number(data.value)
    if (!isFinite(value)) throw badRequest('A numeric value is required.')
    await upsertSnapshot(userId, propertyId, value, (data.as_of_date || isoToday()).slice(0, 10), data.note ?? null)
    return { data: { success: true } }
  },

  deleteSnapshot: async (snapshotId: number) => {
    const userId = await requireSessionUserId()
    const snap = await get<{ property_id: number }>(
      `SELECT property_id FROM property_value_snapshots WHERE id = ? AND user_id = ?`,
      [snapshotId, userId],
    )
    if (!snap) return { data: { success: true } }
    const count = await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM property_value_snapshots WHERE user_id = ? AND property_id = ?`,
      [userId, snap.property_id],
    )
    // Never leave a property with no value — that would break net worth.
    if ((count?.n ?? 0) <= 1) throw badRequest('This is the only value on record. Add another before deleting this one.')
    await run(`DELETE FROM property_value_snapshots WHERE id = ? AND user_id = ?`, [snapshotId, userId])
    await syncCurrentValue(userId, snap.property_id)
    return { data: { success: true } }
  },
}

// Insert a snapshot, or update the existing one for the same property + date so
// repeated same-day edits don't spam the history. Then keep the property's
// current value (manual_value) equal to the newest-dated snapshot.
async function upsertSnapshot(userId: number, propertyId: number, value: number, asOfDate: string, note: string | null) {
  const existing = await get<{ id: number }>(
    `SELECT id FROM property_value_snapshots WHERE user_id = ? AND property_id = ? AND as_of_date = ?`,
    [userId, propertyId, asOfDate],
  )
  if (existing) {
    await run(`UPDATE property_value_snapshots SET value = ?, note = COALESCE(?, note) WHERE id = ?`, [value, note, existing.id])
  } else {
    await run(
      `INSERT INTO property_value_snapshots (user_id, property_id, value, as_of_date, source, note)
       VALUES (?, ?, ?, ?, 'manual', ?)`,
      [userId, propertyId, value, asOfDate, note],
    )
  }
  await syncCurrentValue(userId, propertyId)
}

// Point the property's stored value at its newest-dated snapshot.
async function syncCurrentValue(userId: number, propertyId: number) {
  const row = await get<{ value: number }>(
    `SELECT value FROM property_value_snapshots WHERE user_id = ? AND property_id = ?
     ORDER BY as_of_date DESC, created_at DESC LIMIT 1`,
    [userId, propertyId],
  )
  if (row) {
    await run(
      `UPDATE properties SET manual_value = ?, valuation_source = 'manual', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [row.value, propertyId, userId],
    )
  }
}

export interface PropertySnapshot {
  id: number
  user_id: number
  property_id: number
  value: number
  as_of_date: string
  source: string
  note: string | null
  created_at: string
}

const isoToday = () => new Date().toISOString().slice(0, 10)

function badRequest(msg: string) {
  const err = new Error(msg) as any
  err.response = { status: 400, data: { detail: msg } }
  return err
}

function toNumOrNull(v: any): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}
