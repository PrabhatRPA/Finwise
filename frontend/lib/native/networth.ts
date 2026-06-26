// On-device net-worth aggregation + daily snapshot history.
//
// • getCurrent  → sums holdings.current_value + accounts.balance right now.
// • createRecord → UPSERT today's snapshot (one row per day per user) so
//   the growth chart has data points. Called from the dashboard load
//   so just opening the app keeps the series populated.
// • getHistory / getTrends → return the daily series for the growth chart.

import { all, get, run } from './db'
import { requireSessionUserId } from './session'

function todayIso(): string {
  // Format: YYYY-MM-DD using local time.
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Bank/cash account types. Everything else (brokerage, traditional_ira,
// roth_ira, 401k, hsa, pension, other) is treated as an investment account so
// its balance rolls into the Portfolio tile alongside holdings — not into Cash.
const CASH_ACCOUNT_TYPES = new Set(['checking', 'savings', 'cash_management'])

async function computeNetWorth(userId: number) {
  const [holdings, accounts, loans, properties] = await Promise.all([
    all<{ current_value: number | null }>(
      `SELECT current_value FROM holdings WHERE user_id = ? AND is_active = 1`,
      [userId],
    ),
    all<{ balance: number | null; account_type: string }>(
      `SELECT balance, account_type FROM accounts WHERE user_id = ? AND is_active = 1`,
      [userId],
    ),
    all<{ current_balance: number | null; loan_type: string }>(
      `SELECT current_balance, loan_type FROM loans WHERE user_id = ? AND status = 'active'`,
      [userId],
    ),
    all<{ manual_value: number | null; estimated_value: number | null }>(
      `SELECT manual_value, estimated_value FROM properties WHERE user_id = ? AND is_active = 1`,
      [userId],
    ),
  ])
  // Holdings are always investments. Account balances split by type: cash
  // accounts feed the Cash tile, all other account balances feed Portfolio.
  const holdings_value = holdings.reduce((s, h) => s + (h.current_value ?? 0), 0)
  let cash = 0
  let investment_accounts = 0
  for (const a of accounts) {
    const bal = a.balance ?? 0
    if (CASH_ACCOUNT_TYPES.has(a.account_type)) cash += bal
    else investment_accounts += bal
  }
  const investments = holdings_value + investment_accounts
  const real_estate = properties.reduce(
    (s, p) => s + (p.manual_value ?? p.estimated_value ?? 0),
    0,
  )

  // Liabilities: roll up by loan type so the dashboard can break it out
  // (mortgage vs credit_card vs auto vs everything else).
  const liability_breakdown: Record<string, number> = {}
  let total_liabilities = 0
  for (const l of loans) {
    const amt = l.current_balance ?? 0
    total_liabilities += amt
    liability_breakdown[l.loan_type] = (liability_breakdown[l.loan_type] ?? 0) + amt
  }

  const total_assets = investments + cash + real_estate
  return {
    total_assets,
    total_liabilities,
    net_worth: total_assets - total_liabilities,
    cash,
    investments,
    real_estate,
    asset_breakdown: { investments, cash, real_estate },
    liability_breakdown,
  }
}

export const nativeNetWorthApi = {
  getCurrent: async () => {
    const userId = await requireSessionUserId()
    return { data: await computeNetWorth(userId) }
  },

  // UPSERT today's row. Repeated calls on the same day just refresh the
  // values without inserting duplicates (UNIQUE(user_id, history_date)).
  createRecord: async () => {
    const userId = await requireSessionUserId()
    const nw = await computeNetWorth(userId)
    await run(
      `INSERT INTO portfolio_history (
         user_id, history_date,
         total_assets, total_liabilities, total_net_worth,
         total_investments, total_cash
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, history_date) DO UPDATE SET
         total_assets       = excluded.total_assets,
         total_liabilities  = excluded.total_liabilities,
         total_net_worth    = excluded.total_net_worth,
         total_investments  = excluded.total_investments,
         total_cash         = excluded.total_cash`,
      [
        userId, todayIso(),
        nw.total_assets, nw.total_liabilities, nw.net_worth,
        nw.investments, nw.cash,
      ],
    )
    return { data: { success: true, snapshot: nw } }
  },

  getHistory: async (start?: string, end?: string) => {
    const userId = await requireSessionUserId()
    let sql = `SELECT history_date, total_assets, total_liabilities, total_net_worth,
                      total_investments, total_cash
               FROM portfolio_history WHERE user_id = ?`
    const params: any[] = [userId]
    if (start) { sql += ` AND history_date >= ?`; params.push(start) }
    if (end)   { sql += ` AND history_date <= ?`; params.push(end) }
    sql += ` ORDER BY history_date ASC`
    const rows = await all(sql, params)
    return { data: { history: rows } }
  },

  // Used by the growth chart. `days` is the lookback window from today.
  // Returns one row per day, oldest first.
  getTrends: async (days: number = 365) => {
    const userId = await requireSessionUserId()
    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceIso =
      `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`
    const rows = await all<any>(
      `SELECT history_date AS date,
              total_net_worth AS net_worth,
              total_assets, total_liabilities,
              total_investments, total_cash,
              -- NetWorthTrendChart keys on investments / liabilities / assets;
              -- alias the total_* columns to those names so the Portfolio and
              -- Total Debt lines actually plot (they were empty because the
              -- field names did not match).
              total_investments AS investments,
              total_liabilities AS liabilities,
              total_assets       AS assets,
              total_cash         AS cash
       FROM portfolio_history
       WHERE user_id = ? AND history_date >= ?
       ORDER BY history_date ASC`,
      [userId, sinceIso],
    )
    // `trends` for GrowthChart / NetWorthTrendChart; `points` alias for
    // BenchmarkChart which reads `res.data.points`.
    return { data: { trends: rows, points: rows } }
  },

  getAllocations: async () => {
    const userId = await requireSessionUserId()
    const rows = await all<any>(
      `SELECT security_type, sector, current_value
       FROM holdings WHERE user_id = ? AND is_active = 1`,
      [userId],
    )
    const byType: Record<string, number> = {}
    const bySector: Record<string, number> = {}
    for (const r of rows) {
      const t = r.security_type || 'other'
      const s = r.sector || 'Unknown'
      byType[t] = (byType[t] ?? 0) + (r.current_value ?? 0)
      bySector[s] = (bySector[s] ?? 0) + (r.current_value ?? 0)
    }
    return { data: { by_type: byType, by_sector: bySector } }
  },
}
