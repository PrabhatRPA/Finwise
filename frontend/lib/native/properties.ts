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
    return { data: { properties: enriched, total_value, rentcast_configured: false } }
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

  // Rentcast valuation lives behind a paid API + key the user doesn't have
  // configured on iOS. Surface a clear no-op rather than throwing so the
  // refresh button doesn't blow up the page.
  refreshValue: async (id: number) => {
    const err = new Error(
      'Automated property valuation (Rentcast) requires a server-side API key. ' +
      'Enter a manual value via the Edit button instead.',
    ) as any
    err.response = { status: 501, data: { detail: err.message } }
    throw err
  },
}

function toNumOrNull(v: any): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}
