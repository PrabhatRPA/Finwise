// On-device accounts CRUD. Mirrors backend/app/api/v1/accounts.py.

import { all, get, run } from './db'
import { requireSessionUserId } from './session'

export const nativeAccountsApi = {
  getAll: async () => {
    const userId = await requireSessionUserId()
    const rows = await all(
      `SELECT * FROM accounts WHERE user_id = ? AND is_active = 1 ORDER BY id`,
      [userId],
    )
    // The Python backend wraps responses as { accounts: [...] }; the dashboard
    // does `res.data.accounts ?? []`. Match that shape so we don't fall through.
    return { data: { accounts: rows } }
  },

  getById: async (id: number) => {
    const userId = await requireSessionUserId()
    const row = await get(
      `SELECT * FROM accounts WHERE id = ? AND user_id = ?`,
      [id, userId],
    )
    if (!row) throw notFound()
    return { data: row }
  },

  create: async (data: any) => {
    const userId = await requireSessionUserId()
    const res = await run(
      `INSERT INTO accounts (
         user_id, account_name, account_type, account_number, institution_name,
         institution_type, balance, balance_date, currency
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        data.account_name,
        data.account_type,
        data.account_number ?? null,
        data.institution_name ?? null,
        data.institution_type ?? null,
        data.balance ?? 0,
        data.balance_date ?? null,
        data.currency ?? 'USD',
      ],
    )
    const row = await get(`SELECT * FROM accounts WHERE id = ?`, [res.lastId])
    return { data: row }
  },

  update: async (id: number, data: any) => {
    const userId = await requireSessionUserId()
    const fields = [
      'account_name',
      'account_type',
      'account_number',
      'institution_name',
      'institution_type',
      'balance',
      'balance_date',
      'currency',
      'is_active',
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
      return nativeAccountsApi.getById(id)
    }
    params.push(id, userId)
    await run(
      `UPDATE accounts SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
      params,
    )
    return nativeAccountsApi.getById(id)
  },

  delete: async (id: number) => {
    const userId = await requireSessionUserId()
    await run(
      `UPDATE accounts SET is_active = 0 WHERE id = ? AND user_id = ?`,
      [id, userId],
    )
    return { data: { success: true } }
  },

  getBalances: async () => {
    const userId = await requireSessionUserId()
    const rows = await all(
      `SELECT id, account_name, account_type, balance, currency
       FROM accounts WHERE user_id = ? AND is_active = 1`,
      [userId],
    )
    return { data: { balances: rows } }
  },

  updateBalance: async (id: number, balance: number) => {
    const userId = await requireSessionUserId()
    await run(
      `UPDATE accounts SET balance = ?, balance_date = date('now')
       WHERE id = ? AND user_id = ?`,
      [balance, id, userId],
    )
    return nativeAccountsApi.getById(id)
  },
}

function notFound() {
  const err = new Error('Not found') as any
  err.response = { status: 404, data: { detail: 'Not found' } }
  return err
}
