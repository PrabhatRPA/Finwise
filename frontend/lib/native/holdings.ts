// On-device holdings CRUD + portfolio summary.
// Mirrors backend/app/api/v1/holdings.py + the slice of PortfolioEngine that
// the dashboard actually consumes (total value, gain/loss, allocation by
// security_type, top holdings).

import { all, get, run } from './db'
import { requireSessionUserId } from './session'
import { fetchPrices } from './market'

interface HoldingRow {
  id: number
  account_id: number
  user_id: number
  ticker: string
  security_name: string | null
  security_type: string | null
  shares: number
  average_cost: number | null
  current_price: number | null
  current_value: number | null
  total_gain_loss: number | null
  total_gain_loss_percent: number | null
  day_change: number | null
  day_change_percent: number | null
  sector: string | null
  industry: string | null
  is_active: number
  purchase_date: string | null
  last_updated: string | null
  created_at: string | null
}

async function refreshPricesFor(holdings: HoldingRow[]): Promise<HoldingRow[]> {
  const tickers = Array.from(new Set(holdings.map((h) => h.ticker).filter(Boolean)))
  if (tickers.length === 0) return holdings
  const quotes = await fetchPrices(tickers)
  const byTicker = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]))
  const updated: HoldingRow[] = []
  for (const h of holdings) {
    const q = byTicker.get(h.ticker.toUpperCase())
    if (!q) {
      updated.push(h)
      continue
    }
    const price = q.price
    const value = (h.shares ?? 0) * price
    const cost = (h.shares ?? 0) * (h.average_cost ?? 0)
    const gain = value - cost
    const gainPct = cost > 0 ? (gain / cost) * 100 : 0
    await run(
      `UPDATE holdings SET
         current_price = ?, current_value = ?,
         total_gain_loss = ?, total_gain_loss_percent = ?,
         day_change = ?, day_change_percent = ?,
         last_updated = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [price, value, gain, gainPct, q.day_change, q.day_change_percent, h.id],
    )
    updated.push({
      ...h,
      current_price: price,
      current_value: value,
      total_gain_loss: gain,
      total_gain_loss_percent: gainPct,
      day_change: q.day_change,
      day_change_percent: q.day_change_percent,
    })
  }
  return updated
}

export const nativeHoldingsApi = {
  getAll: async (refreshPrices = true) => {
    const userId = await requireSessionUserId()
    // Plain ORDER BY current_value DESC, id — older SQLite builds don't grok
    // `NULLS LAST`. SQLite sorts NULLs first by default; we want them last,
    // so coalesce to -1 to push them to the bottom.
    const rows = await all<HoldingRow>(
      `SELECT * FROM holdings WHERE user_id = ? AND is_active = 1
       ORDER BY COALESCE(current_value, -1) DESC, id`,
      [userId],
    )
    const finalRows = refreshPrices ? await refreshPricesFor(rows) : rows
    // Match FastAPI shape: { holdings: [...] }.
    return { data: { holdings: finalRows } }
  },

  getById: async (id: number) => {
    const userId = await requireSessionUserId()
    const row = await get<HoldingRow>(
      `SELECT * FROM holdings WHERE id = ? AND user_id = ?`,
      [id, userId],
    )
    if (!row) throw notFound()
    return { data: row }
  },

  create: async (data: any) => {
    const userId = await requireSessionUserId()
    const ticker = String(data.ticker || '').toUpperCase().trim()
    if (!ticker) throw badRequest('ticker is required')

    // The HoldingsTable add form lets the user leave the broker blank. In
    // that case auto-create (or reuse) a single fallback account so we never
    // fail on the NOT NULL account_id constraint. Mirrors what the Python
    // backend used to do implicitly via the default user/account seed.
    let accountId = data.account_id
    if (!accountId) {
      const existing = await get<{ id: number }>(
        `SELECT id FROM accounts WHERE user_id = ? AND account_name = ? LIMIT 1`,
        [userId, 'Brokerage'],
      )
      if (existing) {
        accountId = existing.id
      } else {
        const res = await run(
          `INSERT INTO accounts (user_id, account_name, account_type, currency)
           VALUES (?, 'Brokerage', 'brokerage', 'USD')`,
          [userId],
        )
        accountId = res.lastId
      }
    }

    const shares = Number(data.shares ?? 0)
    const avgCost = data.average_cost != null ? Number(data.average_cost) : null
    const currentPrice = data.current_price != null ? Number(data.current_price) : null
    const currentValue = currentPrice != null ? shares * currentPrice : null
    const res = await run(
      `INSERT INTO holdings (
         account_id, user_id, ticker, security_name, security_type,
         shares, average_cost, purchase_date, current_price, current_value,
         sector, industry
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        accountId,
        userId,
        ticker,
        data.security_name ?? null,
        data.security_type ?? 'stock',
        shares,
        avgCost,
        data.purchase_date ?? null,
        currentPrice,
        currentValue,
        data.sector ?? null,
        data.industry ?? null,
      ],
    )
    const row = await get<HoldingRow>(`SELECT * FROM holdings WHERE id = ?`, [res.lastId])
    return { data: row }
  },

  update: async (id: number, data: any) => {
    const userId = await requireSessionUserId()
    const fields = [
      'account_id', 'ticker', 'security_name', 'security_type',
      'shares', 'average_cost', 'purchase_date', 'current_price',
      'sector', 'industry', 'is_active',
    ]
    const sets: string[] = []
    const params: any[] = []
    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(`${f} = ?`)
        params.push(f === 'ticker' ? String(data[f]).toUpperCase() : data[f])
      }
    }
    if (sets.length === 0) return nativeHoldingsApi.getById(id)
    params.push(id, userId)
    await run(
      `UPDATE holdings SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
      params,
    )
    // Recompute current_value if shares or price changed
    await run(
      `UPDATE holdings SET current_value = COALESCE(shares,0) * COALESCE(current_price,0)
       WHERE id = ? AND user_id = ?`,
      [id, userId],
    )
    return nativeHoldingsApi.getById(id)
  },

  delete: async (id: number) => {
    const userId = await requireSessionUserId()
    await run(
      `UPDATE holdings SET is_active = 0 WHERE id = ? AND user_id = ?`,
      [id, userId],
    )
    return { data: { success: true } }
  },

  portfolioSummary: async () => {
    const userId = await requireSessionUserId()
    const rows = await all<HoldingRow>(
      `SELECT * FROM holdings WHERE user_id = ? AND is_active = 1`,
      [userId],
    )
    let totalValue = 0
    let totalCost = 0
    const byType = new Map<string, number>()
    const bySector = new Map<string, number>()
    for (const h of rows) {
      const value = h.current_value ?? 0
      const cost = (h.shares ?? 0) * (h.average_cost ?? 0)
      totalValue += value
      totalCost += cost
      const t = h.security_type || 'other'
      byType.set(t, (byType.get(t) ?? 0) + value)
      const s = h.sector || 'Unknown'
      bySector.set(s, (bySector.get(s) ?? 0) + value)
    }
    const gain = totalValue - totalCost
    const gainPct = totalCost > 0 ? (gain / totalCost) * 100 : 0
    const top = [...rows]
      .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))
      .slice(0, 10)
    return {
      data: {
        total_value: totalValue,
        total_cost: totalCost,
        total_gain_loss: gain,
        total_gain_loss_percent: gainPct,
        holding_count: rows.length,
        allocation_by_type: Object.fromEntries(byType),
        allocation_by_sector: Object.fromEntries(bySector),
        top_holdings: top,
      },
    }
  },

  analyze: async (_ticker: string) => {
    // Stock analysis is part of the AI suite — see nativeAiApi.stockAnalysis.
    return { data: { not_implemented: true } }
  },

  batchAdd: async (holdings: any[]) => {
    const results = []
    for (const h of holdings) {
      results.push((await nativeHoldingsApi.create(h)).data)
    }
    return { data: results }
  },
}

function notFound() {
  const err = new Error('Not found') as any
  err.response = { status: 404, data: { detail: 'Not found' } }
  return err
}
function badRequest(msg: string) {
  const err = new Error(msg) as any
  err.response = { status: 400, data: { detail: msg } }
  return err
}
