// On-device loans / debts CRUD. Mirrors backend/app/api/v1/loans.py.

import { all, get, run } from './db'
import { requireSessionUserId } from './session'

export const nativeLoansApi = {
  getAll: async (includePaidOff = false) => {
    const userId = await requireSessionUserId()
    const sql = includePaidOff
      ? `SELECT * FROM loans WHERE user_id = ? ORDER BY id DESC`
      : `SELECT * FROM loans WHERE user_id = ? AND status = 'active' ORDER BY id DESC`
    const rows = await all(sql, [userId])
    return { data: { loans: rows } }
  },

  create: async (data: any) => {
    const userId = await requireSessionUserId()
    if (!data.loan_name) throw badRequest('loan_name is required')
    if (!data.loan_type) throw badRequest('loan_type is required')
    const original = toNum(data.original_balance)
    if (!isFinite(original) || original < 0) throw badRequest('original_balance must be a non-negative number')
    const res = await run(
      `INSERT INTO loans (
         user_id, loan_name, loan_type, original_balance, current_balance,
         interest_rate, monthly_payment, lender_name, due_day, end_date
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        data.loan_name,
        data.loan_type,
        original,
        toNumOrDefault(data.current_balance, original),
        toNumOrNull(data.interest_rate),
        toNumOrNull(data.monthly_payment),
        data.lender_name ?? null,
        data.due_day ?? null,
        data.end_date ?? null,
      ],
    )
    const row = await get(`SELECT * FROM loans WHERE id = ?`, [res.lastId])
    return { data: row }
  },

  update: async (id: number, data: any) => {
    const userId = await requireSessionUserId()
    const fields = [
      'loan_name', 'loan_type', 'original_balance', 'current_balance',
      'interest_rate', 'monthly_payment', 'lender_name', 'due_day', 'end_date', 'status',
    ]
    const sets: string[] = []
    const params: any[] = []
    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(`${f} = ?`)
        params.push(data[f])
      }
    }
    if (sets.length === 0) {
      const row = await get(`SELECT * FROM loans WHERE id = ? AND user_id = ?`, [id, userId])
      return { data: row }
    }
    sets.push(`updated_at = CURRENT_TIMESTAMP`)
    params.push(id, userId)
    await run(`UPDATE loans SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params)
    const row = await get(`SELECT * FROM loans WHERE id = ? AND user_id = ?`, [id, userId])
    return { data: row }
  },

  delete: async (id: number) => {
    const userId = await requireSessionUserId()
    await run(`DELETE FROM loans WHERE id = ? AND user_id = ?`, [id, userId])
    return { data: { success: true } }
  },
}

function toNum(v: any): number {
  const n = Number(v)
  return isFinite(n) ? n : 0
}
function toNumOrNull(v: any): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}
function toNumOrDefault(v: any, def: number): number {
  if (v == null || v === '') return def
  const n = Number(v)
  return isFinite(n) ? n : def
}
function badRequest(msg: string) {
  const err = new Error(msg) as any
  err.response = { status: 400, data: { detail: msg } }
  return err
}
