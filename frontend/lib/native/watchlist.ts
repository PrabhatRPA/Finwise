// On-device watchlist CRUD with live-price enrichment and target-alert logic.
// Replaces the previous stub in stubs.ts.
//
// Alert-firing is handled here: when getAll runs, any item whose current price
// crosses its target gets `alert_active=true` and (if the user picked push)
// a Capacitor LocalNotification is scheduled. The component code in
// watchlist-table.tsx only renders the in-app banner — the OS notification is
// the platform-correct equivalent of the old `window.Notification` call.

import { all, get, run } from './db'
import { requireSessionUserId } from './session'
import { fetchPrice } from './market'
import { firePriceAlert } from './notifications'

interface WatchRow {
  id: number
  user_id: number
  ticker: string
  company_name: string | null
  target_price: number | null
  target_direction: string | null
  notification_method: string
  notes: string | null
  alert_triggered: number
  last_notified_at: string | null
  created_at: string | null
  updated_at: string | null
}

// Enrich each row with the live market price and compute alert state.
async function enrichAndCheckAlerts(rows: WatchRow[]) {
  const out: any[] = []
  for (const r of rows) {
    const quote = await fetchPrice(r.ticker).catch(() => null)
    const currentPrice = quote?.price ?? null
    const dayChangePct = quote?.day_change_percent ?? null
    let pctToTarget: number | null = null
    let alertActive = false
    if (r.target_price && currentPrice != null) {
      pctToTarget = ((currentPrice - r.target_price) / r.target_price) * 100
      if (r.target_direction === 'above') alertActive = currentPrice >= r.target_price
      else if (r.target_direction === 'below') alertActive = currentPrice <= r.target_price
    }

    // Episode model: `alert_triggered` marks "currently in a crossed episode"
    // and `last_notified_at` doubles as the DISMISSED-AT stamp for that
    // episode. Dismissing must NOT clear alert_triggered — alert_active is
    // recomputed from the live price each load, so it would just re-trigger
    // (and re-fire the push) immediately. Instead:
    //   • first crossing  → alert_triggered=1, dismissed stamp cleared, push fired
    //   • Dismiss         → last_notified_at=now (banner hidden, episode kept)
    //   • price un-crosses → episode reset, so a future re-cross alerts again
    if (alertActive && !r.alert_triggered) {
      await run(
        `UPDATE watchlist SET alert_triggered = 1, last_notified_at = NULL WHERE id = ?`,
        [r.id],
      )
      r.alert_triggered = 1
      r.last_notified_at = null

      // Fire the OS-level notification once per crossing if the user wants it.
      if (r.notification_method === 'push' || r.notification_method === 'both') {
        await firePriceAlert({
          id: r.id,
          ticker: r.ticker,
          companyName: r.company_name ?? undefined,
          currentPrice,
          targetPrice: r.target_price!,
          direction: r.target_direction!,
        })
      }
    } else if (!alertActive && r.alert_triggered) {
      // Price moved back across the target — close the episode.
      await run(
        `UPDATE watchlist SET alert_triggered = 0, last_notified_at = NULL WHERE id = ?`,
        [r.id],
      )
      r.alert_triggered = 0
      r.last_notified_at = null
    }

    out.push({
      ...r,
      current_price: currentPrice,
      day_change_percent: dayChangePct,
      pct_to_target: pctToTarget,
      alert_active: alertActive,
      alert_triggered: r.alert_triggered === 1,
      alert_dismissed: r.last_notified_at != null,
    })
  }
  return out
}

export const nativeWatchlistApi = {
  getAll: async () => {
    const userId = await requireSessionUserId()
    const rows = await all<WatchRow>(
      `SELECT * FROM watchlist WHERE user_id = ? ORDER BY id DESC`,
      [userId],
    )
    const enriched = await enrichAndCheckAlerts(rows)
    return { data: { watchlist: enriched } }
  },

  create: async (data: any) => {
    const userId = await requireSessionUserId()
    const ticker = String(data.ticker || '').toUpperCase().trim()
    if (!ticker) throw badRequest('ticker is required')
    const dup = await get<{ id: number }>(
      `SELECT id FROM watchlist WHERE user_id = ? AND ticker = ?`,
      [userId, ticker],
    )
    if (dup) throw badRequest(`${ticker} is already on your watchlist.`)
    const res = await run(
      `INSERT INTO watchlist (
         user_id, ticker, company_name, target_price, target_direction,
         notification_method, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        ticker,
        data.company_name ?? null,
        data.target_price ?? null,
        data.target_direction ?? null,
        data.notification_method ?? 'in_app',
        data.notes ?? null,
      ],
    )
    const row = await get<WatchRow>(`SELECT * FROM watchlist WHERE id = ?`, [res.lastId])
    return { data: row }
  },

  update: async (id: number, data: any) => {
    const userId = await requireSessionUserId()
    const fields = [
      'company_name', 'target_price', 'target_direction',
      'notification_method', 'notes',
    ]
    const sets: string[] = []
    const params: any[] = []
    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(`${f} = ?`)
        params.push(data[f])
      }
    }
    // Reset the triggered flag when the user changes the target — they're
    // effectively asking to be re-notified on the new threshold.
    if (data.target_price !== undefined || data.target_direction !== undefined) {
      sets.push(`alert_triggered = 0`)
    }
    if (sets.length === 0) {
      const row = await get(`SELECT * FROM watchlist WHERE id = ? AND user_id = ?`, [id, userId])
      return { data: row }
    }
    sets.push(`updated_at = CURRENT_TIMESTAMP`)
    params.push(id, userId)
    await run(
      `UPDATE watchlist SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
      params,
    )
    const row = await get(`SELECT * FROM watchlist WHERE id = ? AND user_id = ?`, [id, userId])
    return { data: row }
  },

  delete: async (id: number) => {
    const userId = await requireSessionUserId()
    await run(`DELETE FROM watchlist WHERE id = ? AND user_id = ?`, [id, userId])
    return { data: { success: true } }
  },

  acknowledgeAlert: async (id: number) => {
    const userId = await requireSessionUserId()
    // Dismiss = stamp the current episode, keep alert_triggered so the row
    // still shows 🔔 and, crucially, the push doesn't re-fire while the price
    // stays across the target. (Clearing alert_triggered here was the bug —
    // the next load recomputed alert_active and brought the banner back.)
    await run(
      `UPDATE watchlist SET last_notified_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
      [id, userId],
    )
    return { data: { success: true } }
  },
}

function badRequest(msg: string) {
  const err = new Error(msg) as any
  err.response = { status: 400, data: { detail: msg } }
  return err
}
