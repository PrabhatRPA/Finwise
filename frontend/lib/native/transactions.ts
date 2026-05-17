// On-device transactions CRUD. Mirrors backend/app/api/v1/transactions.py.

import { all, get, run } from './db'
import { requireSessionUserId } from './session'

export const nativeTransactionsApi = {
  getAll: async () => {
    const userId = await requireSessionUserId()
    const rows = await all(
      `SELECT * FROM transactions WHERE user_id = ?
       ORDER BY transaction_date DESC, id DESC`,
      [userId],
    )
    return { data: { transactions: rows } }
  },

  create: async (data: any) => {
    const userId = await requireSessionUserId()
    const res = await run(
      `INSERT INTO transactions (
         user_id, account_id, holding_id, transaction_type, transaction_date,
         settlement_date, ticker, shares, price_per_share, total_amount,
         commission, fees, description, reference_number, is_reconciled
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        data.account_id,
        data.holding_id ?? null,
        data.transaction_type,
        data.transaction_date,
        data.settlement_date ?? null,
        data.ticker ?? null,
        data.shares ?? null,
        data.price_per_share ?? null,
        data.total_amount ?? null,
        data.commission ?? 0,
        data.fees ?? 0,
        data.description ?? null,
        data.reference_number ?? null,
        data.is_reconciled ?? 0,
      ],
    )
    const row = await get(`SELECT * FROM transactions WHERE id = ?`, [res.lastId])
    return { data: row }
  },

  update: async (id: number, data: any) => {
    const userId = await requireSessionUserId()
    const fields = [
      'account_id', 'holding_id', 'transaction_type', 'transaction_date',
      'settlement_date', 'ticker', 'shares', 'price_per_share', 'total_amount',
      'commission', 'fees', 'description', 'reference_number', 'is_reconciled',
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
      const row = await get(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`, [id, userId])
      return { data: row }
    }
    params.push(id, userId)
    await run(
      `UPDATE transactions SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
      params,
    )
    const row = await get(`SELECT * FROM transactions WHERE id = ? AND user_id = ?`, [id, userId])
    return { data: row }
  },

  delete: async (id: number) => {
    const userId = await requireSessionUserId()
    await run(`DELETE FROM transactions WHERE id = ? AND user_id = ?`, [id, userId])
    return { data: { success: true } }
  },

  summary: async () => {
    const userId = await requireSessionUserId()
    const rows = await all<any>(
      `SELECT transaction_type, COUNT(*) AS count, SUM(total_amount) AS total
       FROM transactions WHERE user_id = ? GROUP BY transaction_type`,
      [userId],
    )
    return { data: { summary: rows } }
  },
}
