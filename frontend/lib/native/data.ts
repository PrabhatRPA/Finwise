// On-device data export / import for iOS.
//
// Each export writes a file to the Cache directory then opens the iOS share
// sheet via @capacitor/share — the user can save to Files, send via Mail,
// AirDrop to another device, etc. Cache is fine because the file only needs
// to live long enough for the share sheet to read it; iOS may purge it after.

import { Capacitor } from '@capacitor/core'
import { all, get, run } from './db'
import { requireSessionUserId } from './session'

// ── CSV helpers ────────────────────────────────────────────────────────────

function csvEscape(v: any): string {
  if (v == null) return ''
  const s = String(v)
  // RFC 4180: wrap in quotes if value contains comma, quote, or newline.
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(rows: any[], columns: string[]): string {
  const header = columns.join(',')
  const body = rows.map(r => columns.map(c => csvEscape(r[c])).join(',')).join('\n')
  return header + '\n' + body + (body ? '\n' : '')
}

// ── Native share path ──────────────────────────────────────────────────────

async function saveAndShare(
  filename: string,
  content: string,
  mimeType: string,
): Promise<void> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')

  const write = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })

  // canShare returns false in some simulator builds — wrap in try/catch so a
  // missing share sheet doesn't trash the export (file is still in Cache).
  try {
    await Share.share({
      title: filename,
      url: write.uri,
      dialogTitle: 'Save or share',
    })
  } catch (err: any) {
    // User-cancelled share is normal. Anything else: surface so caller can
    // tell the user the file is at write.uri.
    if (!/cancel/i.test(err?.message ?? '')) {
      throw new Error(
        `File written to ${write.uri} but the share sheet failed: ${err?.message ?? err}`,
      )
    }
  }
}

// Same on web/Tauri: download via a hidden <a>. Capacitor's Share plugin has
// a Web Share API fallback but `url` for a local file doesn't work in
// browsers — easier to just trigger a normal download.
function saveAndDownload(filename: string, content: string, mimeType: string): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function exportFile(filename: string, content: string, mimeType: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await saveAndShare(filename, content, mimeType)
  } else {
    saveAndDownload(filename, content, mimeType)
  }
}

// ── Data fetchers ──────────────────────────────────────────────────────────

async function fetchHoldings() {
  const userId = await requireSessionUserId()
  return all<any>(
    `SELECT h.ticker, h.security_name, h.security_type, h.shares, h.average_cost,
            h.current_price, h.current_value, h.total_gain_loss, h.total_gain_loss_percent,
            h.sector, h.industry, h.purchase_date, a.account_name
     FROM holdings h
     LEFT JOIN accounts a ON h.account_id = a.id
     WHERE h.user_id = ? AND h.is_active = 1
     ORDER BY h.id`,
    [userId],
  )
}

async function fetchAccounts() {
  const userId = await requireSessionUserId()
  return all<any>(
    `SELECT account_name, account_type, institution_name, balance, currency, is_active
     FROM accounts WHERE user_id = ? ORDER BY id`,
    [userId],
  )
}

async function fetchTransactions() {
  const userId = await requireSessionUserId()
  return all<any>(
    `SELECT transaction_type, transaction_date, ticker, shares, price_per_share,
            total_amount, commission, fees, description, reference_number
     FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC, id DESC`,
    [userId],
  )
}

async function fetchLoans() {
  const userId = await requireSessionUserId()
  return all<any>(
    `SELECT loan_name, loan_type, original_balance, current_balance, interest_rate,
            monthly_payment, lender_name, due_day, end_date, status
     FROM loans WHERE user_id = ? ORDER BY id`,
    [userId],
  )
}

async function fetchProperties() {
  const userId = await requireSessionUserId()
  return all<any>(
    `SELECT property_type, nickname, address, city, state, zip_code, country,
            manual_value, estimated_value, valuation_source, purchase_price,
            purchase_date, notes
     FROM properties WHERE user_id = ? AND is_active = 1 ORDER BY id`,
    [userId],
  )
}

async function fetchPortfolioHistory() {
  const userId = await requireSessionUserId()
  return all<any>(
    `SELECT history_date, total_assets, total_liabilities, total_net_worth,
            total_investments, total_cash
     FROM portfolio_history WHERE user_id = ? ORDER BY history_date ASC`,
    [userId],
  )
}

async function fetchWatchlist() {
  const userId = await requireSessionUserId()
  return all<any>(
    `SELECT ticker, company_name, target_price, target_direction, notification_method,
            notes, alert_triggered, last_notified_at, created_at
     FROM watchlist WHERE user_id = ? ORDER BY id DESC`,
    [userId],
  )
}

// ── Public export surface ──────────────────────────────────────────────────

export const nativeDataApi = {
  exportHoldings: async () => {
    const rows = await fetchHoldings()
    const csv = toCsv(rows, [
      'ticker', 'security_name', 'security_type', 'shares', 'average_cost',
      'current_price', 'current_value', 'total_gain_loss', 'total_gain_loss_percent',
      'sector', 'industry', 'purchase_date', 'account_name',
    ])
    await exportFile('holdings.csv', csv, 'text/csv')
  },

  exportWatchlist: async () => {
    const rows = await fetchWatchlist()
    const csv = toCsv(rows, [
      'ticker', 'company_name', 'target_price', 'target_direction',
      'notification_method', 'notes', 'alert_triggered', 'last_notified_at', 'created_at',
    ])
    await exportFile('watchlist.csv', csv, 'text/csv')
  },

  exportDebts: async () => {
    const rows = await fetchLoans()
    const csv = toCsv(rows, [
      'loan_name', 'loan_type', 'original_balance', 'current_balance',
      'interest_rate', 'monthly_payment', 'lender_name', 'due_day', 'end_date', 'status',
    ])
    await exportFile('debts.csv', csv, 'text/csv')
  },

  // Net-worth trend history (daily snapshots) → CSV for the Trends export.
  exportTrends: async () => {
    const rows = await fetchPortfolioHistory()
    const csv = toCsv(rows, [
      'history_date', 'total_assets', 'total_liabilities', 'total_net_worth',
      'total_investments', 'total_cash',
    ])
    await exportFile('net_worth_trends.csv', csv, 'text/csv')
  },

  exportFullData: async () => {
    const [holdings, accounts, transactions, watchlist, loans, properties, portfolio_history] = await Promise.all([
      fetchHoldings(),
      fetchAccounts(),
      fetchTransactions(),
      fetchWatchlist(),
      fetchLoans(),
      fetchProperties(),
      fetchPortfolioHistory(),
    ])
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      source: 'nworth-ios',
      holdings,
      accounts,
      transactions,
      watchlist,
      loans,
      properties,
      portfolio_history,
    }
    await exportFile('nworth_full_export.json', JSON.stringify(payload, null, 2), 'application/json')
  },

  // Full backup is JSON only on iOS — zipping requires a third-party JS
  // library + binary I/O through Filesystem. The JSON already round-trips
  // all the same data; we just reuse it.
  exportFullBackup: async () => {
    await nativeDataApi.exportFullData()
  },

  // ── Imports ──────────────────────────────────────────────────────────
  importHoldings: async (file: File) => {
    const text = await file.text()
    const { header, rows } = parseCsv(text)
    if (rows.length === 0) return importEmpty()
    const userId = await requireSessionUserId()
    const accountId = await ensureDefaultAccount(userId)
    let added = 0, skipped = 0
    for (const r of rows) {
      const o = rowToObject(header, r)
      const ticker = (o.ticker || '').toString().toUpperCase().trim()
      if (!ticker) { skipped++; continue }
      // Skip duplicates (same ticker for this user).
      const existing = await get<{ id: number }>(
        `SELECT id FROM holdings WHERE user_id = ? AND ticker = ? AND is_active = 1`,
        [userId, ticker],
      )
      if (existing) { skipped++; continue }
      await run(
        `INSERT INTO holdings (
           account_id, user_id, ticker, security_name, security_type,
           shares, average_cost, purchase_date, current_price, current_value,
           sector, industry
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          accountId,
          userId,
          ticker,
          o.security_name ?? null,
          o.security_type ?? 'stock',
          toNum(o.shares),
          toNumOrNull(o.average_cost),
          o.purchase_date || null,
          toNumOrNull(o.current_price),
          toNumOrNull(o.current_value),
          o.sector || null,
          o.industry || null,
        ],
      )
      added++
    }
    return importDone({ added, skipped, scope: 'holdings' })
  },

  importWatchlist: async (file: File) => {
    const text = await file.text()
    const { header, rows } = parseCsv(text)
    if (rows.length === 0) return importEmpty()
    const userId = await requireSessionUserId()
    let added = 0, skipped = 0
    for (const r of rows) {
      const o = rowToObject(header, r)
      const ticker = (o.ticker || '').toString().toUpperCase().trim()
      if (!ticker) { skipped++; continue }
      const existing = await get<{ id: number }>(
        `SELECT id FROM watchlist WHERE user_id = ? AND ticker = ?`,
        [userId, ticker],
      )
      if (existing) { skipped++; continue }
      await run(
        `INSERT INTO watchlist (
           user_id, ticker, company_name, target_price, target_direction,
           notification_method, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          ticker,
          o.company_name || null,
          toNumOrNull(o.target_price),
          o.target_direction || null,
          o.notification_method || 'in_app',
          o.notes || null,
        ],
      )
      added++
    }
    return importDone({ added, skipped, scope: 'watchlist' })
  },

  importDebts: async (file: File) => {
    const text = await file.text()
    const { header, rows } = parseCsv(text)
    if (rows.length === 0) return importEmpty()
    const userId = await requireSessionUserId()
    let added = 0, skipped = 0
    for (const r of rows) {
      const o = rowToObject(header, r)
      const name = (o.loan_name || '').trim()
      if (!name) { skipped++; continue }
      const dup = await get<{ id: number }>(
        `SELECT id FROM loans WHERE user_id = ? AND loan_name = ?`,
        [userId, name],
      )
      if (dup) { skipped++; continue }
      const original = toNum(o.original_balance)
      await run(
        `INSERT INTO loans (
           user_id, loan_name, loan_type, original_balance, current_balance,
           interest_rate, monthly_payment, lender_name, due_day, end_date, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, name,
          o.loan_type || 'other',
          original,
          toNumOrNull(o.current_balance) ?? original,
          toNumOrNull(o.interest_rate),
          toNumOrNull(o.monthly_payment),
          o.lender_name || null,
          toNumOrNull(o.due_day),
          o.end_date || null,
          o.status || 'active',
        ],
      )
      added++
    }
    return importDone({ added, skipped, scope: 'debts' })
  },

  importFullData: async (file: File, mode: 'add' | 'update' | 'replace' = 'add') => {
    const text = await file.text()
    let payload: any
    try { payload = JSON.parse(text) }
    catch { throw badRequest('File is not valid JSON.') }

    const userId = await requireSessionUserId()
    const holdings   = Array.isArray(payload.holdings)     ? payload.holdings     : []
    const accounts   = Array.isArray(payload.accounts)     ? payload.accounts     : []
    const txns       = Array.isArray(payload.transactions) ? payload.transactions : []
    const watchlist  = Array.isArray(payload.watchlist)    ? payload.watchlist    : []
    const loans      = Array.isArray(payload.loans)        ? payload.loans        : []
    const properties = Array.isArray(payload.properties)   ? payload.properties   : []
    const history    = Array.isArray(payload.portfolio_history) ? payload.portfolio_history : []

    if (mode === 'replace') {
      // True restore: wipe the user's data first. User account is preserved.
      await run(`DELETE FROM holdings WHERE user_id = ?`, [userId])
      await run(`DELETE FROM transactions WHERE user_id = ?`, [userId])
      await run(`DELETE FROM watchlist WHERE user_id = ?`, [userId])
      await run(`DELETE FROM accounts WHERE user_id = ?`, [userId])
      await run(`DELETE FROM loans WHERE user_id = ?`, [userId])
      await run(`DELETE FROM properties WHERE user_id = ?`, [userId])
      await run(`DELETE FROM portfolio_history WHERE user_id = ?`, [userId])
    }

    // ── accounts: rebuild a name→id map so child rows can be re-linked ──
    const accountIdMap = new Map<string, number>()  // key = account_name (lowercased)
    for (const a of accounts) {
      const name = (a.account_name || '').toString().trim()
      if (!name) continue
      const key = name.toLowerCase()
      const existing = await get<{ id: number }>(
        `SELECT id FROM accounts WHERE user_id = ? AND LOWER(account_name) = ?`,
        [userId, key],
      )
      if (existing) {
        if (mode === 'update') {
          await run(
            `UPDATE accounts SET account_type = ?, institution_name = ?, balance = ?, currency = ?
             WHERE id = ?`,
            [
              a.account_type || 'brokerage',
              a.institution_name || null,
              toNum(a.balance),
              a.currency || 'USD',
              existing.id,
            ],
          )
        }
        accountIdMap.set(key, existing.id)
      } else {
        const res = await run(
          `INSERT INTO accounts (user_id, account_name, account_type, institution_name, balance, currency)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            userId,
            name,
            a.account_type || 'brokerage',
            a.institution_name || null,
            toNum(a.balance),
            a.currency || 'USD',
          ],
        )
        accountIdMap.set(key, res.lastId)
      }
    }
    const fallbackAccountId = await ensureDefaultAccount(userId)

    let counts = { holdings: 0, transactions: 0, watchlist: 0, loans: 0, properties: 0, skipped: 0 }

    // ── holdings ────────────────────────────────────────────────────────
    for (const h of holdings) {
      const ticker = (h.ticker || '').toString().toUpperCase().trim()
      if (!ticker) { counts.skipped++; continue }
      const acctKey = (h.account_name || '').toString().toLowerCase()
      const acctId = accountIdMap.get(acctKey) ?? fallbackAccountId
      const existing = await get<{ id: number }>(
        `SELECT id FROM holdings WHERE user_id = ? AND ticker = ? AND is_active = 1`,
        [userId, ticker],
      )
      if (existing && mode === 'add') { counts.skipped++; continue }
      if (existing && mode === 'update') {
        await run(
          `UPDATE holdings SET
             shares = ?, average_cost = ?, purchase_date = ?,
             current_price = ?, current_value = ?,
             security_type = ?, security_name = ?, sector = ?, industry = ?
           WHERE id = ?`,
          [
            toNum(h.shares),
            toNumOrNull(h.average_cost),
            h.purchase_date || null,
            toNumOrNull(h.current_price),
            toNumOrNull(h.current_value),
            h.security_type || 'stock',
            h.security_name || null,
            h.sector || null,
            h.industry || null,
            existing.id,
          ],
        )
        counts.holdings++
        continue
      }
      await run(
        `INSERT INTO holdings (
           account_id, user_id, ticker, security_name, security_type,
           shares, average_cost, purchase_date, current_price, current_value,
           sector, industry
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          acctId, userId, ticker,
          h.security_name || null,
          h.security_type || 'stock',
          toNum(h.shares),
          toNumOrNull(h.average_cost),
          h.purchase_date || null,
          toNumOrNull(h.current_price),
          toNumOrNull(h.current_value),
          h.sector || null,
          h.industry || null,
        ],
      )
      counts.holdings++
    }

    // ── transactions ────────────────────────────────────────────────────
    // No natural uniqueness key, so add-mode just appends. Replace-mode
    // already wiped them; update-mode also just appends (FastAPI behavior).
    for (const t of txns) {
      if (!t.transaction_type || !t.transaction_date) { counts.skipped++; continue }
      const acctKey = (t.account_name || '').toString().toLowerCase()
      const acctId = accountIdMap.get(acctKey) ?? fallbackAccountId
      await run(
        `INSERT INTO transactions (
           user_id, account_id, transaction_type, transaction_date,
           ticker, shares, price_per_share, total_amount, commission, fees, description
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, acctId,
          t.transaction_type,
          t.transaction_date,
          t.ticker || null,
          toNumOrNull(t.shares),
          toNumOrNull(t.price_per_share),
          toNumOrNull(t.total_amount),
          toNum(t.commission),
          toNum(t.fees),
          t.description || null,
        ],
      )
      counts.transactions++
    }

    // ── watchlist ───────────────────────────────────────────────────────
    for (const w of watchlist) {
      const ticker = (w.ticker || '').toString().toUpperCase().trim()
      if (!ticker) { counts.skipped++; continue }
      const existing = await get<{ id: number }>(
        `SELECT id FROM watchlist WHERE user_id = ? AND ticker = ?`,
        [userId, ticker],
      )
      if (existing && mode === 'add') { counts.skipped++; continue }
      if (existing && mode === 'update') {
        await run(
          `UPDATE watchlist SET
             company_name = ?, target_price = ?, target_direction = ?,
             notification_method = ?, notes = ?
           WHERE id = ?`,
          [
            w.company_name || null,
            toNumOrNull(w.target_price),
            w.target_direction || null,
            w.notification_method || 'in_app',
            w.notes || null,
            existing.id,
          ],
        )
        counts.watchlist++
        continue
      }
      await run(
        `INSERT INTO watchlist (
           user_id, ticker, company_name, target_price, target_direction,
           notification_method, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, ticker,
          w.company_name || null,
          toNumOrNull(w.target_price),
          w.target_direction || null,
          w.notification_method || 'in_app',
          w.notes || null,
        ],
      )
      counts.watchlist++
    }

    // ── loans ───────────────────────────────────────────────────────────
    for (const l of loans) {
      const name = (l.loan_name || '').toString().trim()
      if (!name) { counts.skipped++; continue }
      const existing = await get<{ id: number }>(
        `SELECT id FROM loans WHERE user_id = ? AND loan_name = ?`,
        [userId, name],
      )
      if (existing && mode === 'add') { counts.skipped++; continue }
      const original = toNum(l.original_balance)
      if (existing && mode === 'update') {
        await run(
          `UPDATE loans SET loan_type = ?, original_balance = ?, current_balance = ?,
             interest_rate = ?, monthly_payment = ?, lender_name = ?,
             due_day = ?, end_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            l.loan_type || 'other',
            original,
            toNumOrNull(l.current_balance) ?? original,
            toNumOrNull(l.interest_rate),
            toNumOrNull(l.monthly_payment),
            l.lender_name || null,
            toNumOrNull(l.due_day),
            l.end_date || null,
            l.status || 'active',
            existing.id,
          ],
        )
        counts.loans++
        continue
      }
      await run(
        `INSERT INTO loans (
           user_id, loan_name, loan_type, original_balance, current_balance,
           interest_rate, monthly_payment, lender_name, due_day, end_date, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, name,
          l.loan_type || 'other',
          original,
          toNumOrNull(l.current_balance) ?? original,
          toNumOrNull(l.interest_rate),
          toNumOrNull(l.monthly_payment),
          l.lender_name || null,
          toNumOrNull(l.due_day),
          l.end_date || null,
          l.status || 'active',
        ],
      )
      counts.loans++
    }

    // ── properties ─────────────────────────────────────────────────────
    // No natural unique key — use nickname+address fallback to dedupe.
    for (const p of properties) {
      const nick = (p.nickname || '').toString().trim()
      const addr = (p.address || '').toString().trim()
      let existing: { id: number } | null = null
      if (nick) {
        existing = await get<{ id: number }>(
          `SELECT id FROM properties WHERE user_id = ? AND nickname = ?`,
          [userId, nick],
        )
      }
      if (!existing && addr) {
        existing = await get<{ id: number }>(
          `SELECT id FROM properties WHERE user_id = ? AND address = ?`,
          [userId, addr],
        )
      }
      if (existing && mode === 'add') { counts.skipped++; continue }
      if (existing && mode === 'update') {
        await run(
          `UPDATE properties SET property_type = ?, nickname = ?, address = ?, city = ?,
             state = ?, zip_code = ?, country = ?, manual_value = ?, purchase_price = ?,
             purchase_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP, is_active = 1
           WHERE id = ?`,
          [
            p.property_type || 'single_family',
            nick || null, addr || null, p.city || null, p.state || null,
            p.zip_code || null, p.country || 'US',
            toNumOrNull(p.manual_value),
            toNumOrNull(p.purchase_price),
            p.purchase_date || null,
            p.notes || null,
            existing.id,
          ],
        )
        counts.properties++
        continue
      }
      await run(
        `INSERT INTO properties (
           user_id, property_type, nickname, address, city, state, zip_code, country,
           manual_value, purchase_price, purchase_date, notes, valuation_source
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          p.property_type || 'single_family',
          nick || null, addr || null, p.city || null, p.state || null,
          p.zip_code || null, p.country || 'US',
          toNumOrNull(p.manual_value),
          toNumOrNull(p.purchase_price),
          p.purchase_date || null,
          p.notes || null,
          p.manual_value != null ? 'manual' : null,
        ],
      )
      counts.properties++
    }

    // ── portfolio_history (net-worth snapshots) ─────────────────────────
    // Powers the Growth chart and the Net Worth Trend chart. UPSERT on the
    // (user_id, history_date) unique key so re-imports refresh in place.
    let historyCount = 0
    for (const s of history) {
      const date = (s.history_date || s.date || '').toString().trim()
      if (!date) { counts.skipped++; continue }
      await run(
        `INSERT INTO portfolio_history (
           user_id, history_date, total_assets, total_liabilities,
           total_net_worth, total_investments, total_cash
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, history_date) DO UPDATE SET
           total_assets      = excluded.total_assets,
           total_liabilities = excluded.total_liabilities,
           total_net_worth   = excluded.total_net_worth,
           total_investments = excluded.total_investments,
           total_cash        = excluded.total_cash`,
        [
          userId, date,
          toNum(s.total_assets),
          toNum(s.total_liabilities),
          toNum(s.total_net_worth ?? s.net_worth),
          toNum(s.total_investments),
          toNum(s.total_cash),
        ],
      )
      historyCount++
    }

    // Summary shape the data-management UI expects (per-section created/skipped).
    const summary: Record<string, { created: number; skipped?: number }> = {
      holdings:        { created: counts.holdings },
      transactions:    { created: counts.transactions },
      watchlist:       { created: counts.watchlist },
      loans:           { created: counts.loans },
      properties:      { created: counts.properties },
      portfolio_history: { created: historyCount },
    }
    if (counts.skipped > 0) summary.skipped = { created: 0, skipped: counts.skipped }

    return {
      data: {
        message:
          `Imported ${counts.holdings} holdings, ${counts.transactions} transactions, ` +
          `${counts.watchlist} watchlist, ${counts.loans} loans, ${counts.properties} properties, ` +
          `${historyCount} history snapshots. Skipped: ${counts.skipped}.`,
        summary,
        ...counts,
        portfolio_history: historyCount,
      },
    }
  },

  // ── Start fresh ──────────────────────────────────────────────────────
  // Wipe every data table for the current user (holdings, accounts, txns,
  // watchlist, loans, properties, trend history) while preserving the user
  // account/login. Used by the "Remove all data" button so a user can clear
  // the demo dataset and start from scratch. Also clears the shared price
  // cache so stale quotes don't linger.
  clearAllData: async () => {
    const userId = await requireSessionUserId()
    await run(`DELETE FROM holdings WHERE user_id = ?`, [userId])
    await run(`DELETE FROM transactions WHERE user_id = ?`, [userId])
    await run(`DELETE FROM watchlist WHERE user_id = ?`, [userId])
    await run(`DELETE FROM accounts WHERE user_id = ?`, [userId])
    await run(`DELETE FROM loans WHERE user_id = ?`, [userId])
    await run(`DELETE FROM properties WHERE user_id = ?`, [userId])
    await run(`DELETE FROM portfolio_history WHERE user_id = ?`, [userId])
    await run(`DELETE FROM market_prices`, [])
    return { data: { success: true, message: 'All data cleared. You can start fresh.' } }
  },

  // ── Backups ────────────────────────────────────────────────────────────
  // Persistent: each backup is a JSON snapshot written to
  // Documents/<BACKUPS_DIR>/nworth_backup_<iso>.json in the app sandbox.
  // listBackups enumerates that directory. Restore reads the chosen file
  // and feeds it through importFullData with mode='replace'.
  //
  // Backup files are NOT shared automatically — that's the auto-backup
  // bug we hit earlier (Documents tab opened iOS Save-to-Files on every
  // visit). The user explicitly taps Download on a row to share it.

  createBackup: async () => {
    const [holdings, accounts, transactions, watchlist, loans, properties, portfolio_history] = await Promise.all([
      fetchHoldings(),
      fetchAccounts(),
      fetchTransactions(),
      fetchWatchlist(),
      fetchLoans(),
      fetchProperties(),
      fetchPortfolioHistory(),
    ])
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      source: 'nworth-ios',
      kind: 'auto-backup',
      holdings, accounts, transactions, watchlist, loans, properties, portfolio_history,
    }
    const json = JSON.stringify(payload, null, 2)
    const filename = `nworth_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`

    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      // Ensure the backups subdir exists. mkdir throws if it already does;
      // swallow that case.
      try {
        await Filesystem.mkdir({
          path: BACKUPS_DIR,
          directory: Directory.Data,
          recursive: true,
        })
      } catch (e: any) {
        if (!/exist/i.test(e?.message ?? '')) throw e
      }
      await Filesystem.writeFile({
        path: `${BACKUPS_DIR}/${filename}`,
        data: json,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      })
      // Trim old backups — keep the most recent BACKUP_RETENTION.
      await pruneOldBackups()
    } else {
      // Web/Tauri fall-back: trigger a download since there's no sandbox.
      saveAndDownload(filename, json, 'application/json')
    }
    return {
      data: {
        success: true,
        filename,
        size_bytes: json.length,
        created_at: new Date().toISOString(),
      },
    }
  },

  listBackups: async () => {
    if (!Capacitor.isNativePlatform()) return { data: { backups: [] } }
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const result = await Filesystem.readdir({
        path: BACKUPS_DIR,
        directory: Directory.Data,
      })
      const backups = result.files
        .filter((f: any) => f.name.endsWith('.json'))
        .map((f: any) => ({
          filename: f.name,
          size_bytes: f.size ?? 0,
          created_at: new Date(f.mtime ?? Date.now()).toISOString(),
        }))
        .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))
      return { data: { backups } }
    } catch {
      return { data: { backups: [] } }
    }
  },

  downloadBackup: async (filename: string) => {
    if (!Capacitor.isNativePlatform()) throw notImplemented('Backup download')
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const file = await Filesystem.readFile({
      path: `${BACKUPS_DIR}/${filename}`,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })
    const text = typeof file.data === 'string' ? file.data : ''
    await saveAndShare(filename, text, 'application/json')
  },

  deleteBackup: async (filename: string) => {
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      try {
        await Filesystem.deleteFile({
          path: `${BACKUPS_DIR}/${filename}`,
          directory: Directory.Data,
        })
      } catch {
        // Ignore — file already gone is fine.
      }
    }
    return { data: { success: true } }
  },

  // Restore a previously-saved backup by feeding it back through importFullData.
  // Defaults to 'replace' since "restore" implies overwriting current state.
  restoreBackup: async (filename: string, mode: 'add' | 'update' | 'replace' = 'replace') => {
    if (!Capacitor.isNativePlatform()) throw notImplemented('Restore')
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const file = await Filesystem.readFile({
      path: `${BACKUPS_DIR}/${filename}`,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })
    const text = typeof file.data === 'string' ? file.data : ''
    const blob = new Blob([text], { type: 'application/json' })
    const fileObj = new File([blob], filename, { type: 'application/json' })
    return nativeDataApi.importFullData(fileObj, mode)
  },
}

// ── Backup helpers ──────────────────────────────────────────────────────────

const BACKUPS_DIR = 'backups'
const BACKUP_RETENTION = 10

async function pruneOldBackups() {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const result = await Filesystem.readdir({ path: BACKUPS_DIR, directory: Directory.Data })
    const all = result.files
      .filter((f: any) => f.name.endsWith('.json'))
      .sort((a: any, b: any) => (b.mtime ?? 0) - (a.mtime ?? 0))
    const excess = all.slice(BACKUP_RETENTION)
    for (const f of excess) {
      await Filesystem.deleteFile({
        path: `${BACKUPS_DIR}/${f.name}`,
        directory: Directory.Data,
      }).catch(() => {})
    }
  } catch { /* readdir fails if dir missing — harmless */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/^﻿/, '')  // strip BOM
  const lines = cleaned.split('\n').filter(l => l.length > 0)
  if (lines.length === 0) return { header: [], rows: [] }
  return { header: parseCsvRow(lines[0]), rows: lines.slice(1).map(parseCsvRow) }
}

// RFC 4180 row parser — handles quoted fields with embedded commas, escaped
// quotes (""), but not multiline cells (rare in our exports).
function parseCsvRow(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cur += c
    } else {
      if (c === ',') { out.push(cur); cur = '' }
      else if (c === '"' && cur === '') inQuotes = true
      else cur += c
    }
  }
  out.push(cur)
  return out
}

function rowToObject(header: string[], row: string[]): Record<string, string> {
  const o: Record<string, string> = {}
  header.forEach((h, i) => { o[h.trim()] = (row[i] ?? '').trim() })
  return o
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

async function ensureDefaultAccount(userId: number): Promise<number> {
  const existing = await get<{ id: number }>(
    `SELECT id FROM accounts WHERE user_id = ? AND account_name = ? LIMIT 1`,
    [userId, 'Brokerage'],
  )
  if (existing) return existing.id
  const res = await run(
    `INSERT INTO accounts (user_id, account_name, account_type, currency)
     VALUES (?, 'Brokerage', 'brokerage', 'USD')`,
    [userId],
  )
  return res.lastId
}

function importDone(meta: { added: number; skipped: number; scope: string }) {
  return {
    data: {
      message: `Imported ${meta.added} ${meta.scope} (skipped ${meta.skipped} duplicate${meta.skipped === 1 ? '' : 's'}).`,
      ...meta,
    },
  }
}

function importEmpty() {
  return { data: { message: 'File was empty — nothing imported.', added: 0, skipped: 0 } }
}

function badRequest(msg: string) {
  const err = new Error(msg) as any
  err.response = { status: 400, data: { detail: msg } }
  return err
}

function notImplemented(name: string) {
  const err = new Error(`${name} not yet available on iOS`) as any
  err.response = { status: 501, data: { detail: `${name} not yet available on iOS` } }
  return err
}
