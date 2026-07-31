'use client'

// Hero net-worth card ("HeroCard" in the design system): green-ink gradient
// surface with grain, oversized tabular numeral that rolls up on mount /
// refresh (the app's one signature motion moment), ▲/▼ delta line, an area
// chart of net-worth history, and compact time-range pills.
//
// The gradient is dark in BOTH themes (pine→viridian on Paper Light,
// green-black on Ledger Dark), so on-gradient text uses fixed light tints
// rather than theme tokens.

import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { netWorthApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { useCountUp, useReducedMotion } from '@/components/ds/motion'
import { impactLight } from '@/components/ds/haptics'

// Lookback windows for the time-range pill row.
const RANGES = [
  { key: '1D',  days: 1      },
  { key: '1W',  days: 7      },
  { key: '1M',  days: 30     },
  { key: '3M',  days: 90     },
  { key: '6M',  days: 180    },
  { key: '1Y',  days: 365    },
  { key: 'ALL', days: 100000 },
] as const
type RangeKey = typeof RANGES[number]['key']

interface TrendPoint {
  date: string         // YYYY-MM-DD
  net_worth: number
}

// On-gradient accent tints (fixed — the gradient is dark in both themes).
const UP_TINT = 'hsl(152 73% 66%)'
const DOWN_TINT = 'hsl(0 100% 76%)'

export function GrowthChart({ currentNetWorth, todayChange, todayBreakdown }: {
  currentNetWorth: number | null | undefined
  // Sum of holdings' today $ P&L (vs yesterday's close). Used to anchor the 1D
  // baseline to yesterday's close instead of a mid-day snapshot.
  todayChange?: number
  // Today's other net-worth contributors, so the 1D delta also reflects
  // same-day changes to cash / property / debt (not just holdings).
  todayBreakdown?: { cash: number; realEstate: number; debt: number }
}) {
  const [range, setRange] = useState<RangeKey>('1M')
  const [trends, setTrends] = useState<TrendPoint[]>([])
  const reducedMotion = useReducedMotion()

  // Refetch when the range pill changes. Server returns rows oldest-first
  // already; we just slice by the window count if needed.
  useEffect(() => {
    let cancelled = false
    const r = RANGES.find(x => x.key === range)!
    netWorthApi.getTrends(r.days)
      .then(res => {
        const list: TrendPoint[] = res.data?.trends ?? []
        if (!cancelled) setTrends(list)
      })
      .catch(() => { if (!cancelled) setTrends([]) })
    return () => { cancelled = true }
  }, [range])

  // Synthesize "today" point from currentNetWorth so the line touches the
  // present value even if today's snapshot hasn't been written yet on this
  // app launch. If today's row exists, we override its value with the
  // live computation (which is fresher than whatever was persisted).
  const data = useMemo<TrendPoint[]>(() => {
    const today = new Date().toISOString().slice(0, 10)
    const liveValue = currentNetWorth ?? 0
    let rows = trends.slice()
    if (rows.length === 0) {
      return [{ date: today, net_worth: liveValue }]
    }
    const last = rows[rows.length - 1]
    if (last.date === today) {
      rows[rows.length - 1] = { ...last, net_worth: liveValue }
    } else {
      rows.push({ date: today, net_worth: liveValue })
    }
    return rows
  }, [trends, currentNetWorth])

  // For the 1D window, anchor the baseline to YESTERDAY'S CLOSE rather than the
  // mid-day snapshot stored yesterday. The portfolio is the only thing that
  // moves intraday, so start = now − today's portfolio P&L; this makes the hero
  // 1D change agree with the Holdings "Today's P&L" figure instead of also
  // absorbing yesterday afternoon's drift baked into the snapshot. Longer ranges
  // keep the stored daily snapshots unchanged.
  const chart = useMemo<TrendPoint[]>(() => {
    if (range === '1D' && todayChange != null && currentNetWorth != null) {
      const now = new Date()
      const ymd = (dt: Date) =>
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      const todayIso = ymd(now)
      const yst = new Date(now); yst.setDate(now.getDate() - 1)

      // Holdings are the only intraday market mover, so reprice them to
      // yesterday's close: baseline = now − today's holdings P&L.
      let baseline = currentNetWorth - todayChange

      // Net worth also changes when the user edits cash / property / debt today.
      // Fold those in by comparing today's balances against the most recent
      // snapshot BEFORE today (its cash/property/debt columns don't suffer the
      // holdings mid-day mispricing). Net worth = assets − debt, so a rise in
      // cash/property lowers the baseline while a rise in debt raises it.
      const prior = (trends as any[]).filter(r => r?.date && r.date < todayIso).pop()
      if (prior && todayBreakdown) {
        const cashY = prior.total_cash ?? 0
        const debtY = prior.total_liabilities ?? 0
        const reY = (prior.total_assets ?? 0) - (prior.total_investments ?? 0) - (prior.total_cash ?? 0)
        baseline -= (todayBreakdown.cash - cashY)          // Δ cash
        baseline -= (todayBreakdown.realEstate - reY)      // Δ property
        baseline += (todayBreakdown.debt - debtY)          // Δ debt
      }

      return [
        { date: ymd(yst), net_worth: baseline },
        { date: todayIso, net_worth: currentNetWorth },
      ]
    }
    return data
  }, [range, todayChange, currentNetWorth, todayBreakdown, trends, data])

  const start = chart[0]?.net_worth ?? 0
  const end   = chart[chart.length - 1]?.net_worth ?? 0
  const delta    = end - start
  const deltaPct = start > 0 ? (delta / start) * 100 : 0
  const sparse = chart.length < 2

  const startLabel = chart[0] ? formatShortDate(chart[0].date) : ''
  const endLabel   = chart[chart.length - 1] ? formatShortDate(chart[chart.length - 1].date) : ''

  const positive = delta >= 0
  const tint = positive ? UP_TINT : DOWN_TINT

  // Signature moment: the hero number rolls up (600 ms) on mount and whenever
  // the recomputed total changes (e.g. after Refresh). Reduce Motion → snap.
  const rolled = useCountUp(end, 600, reducedMotion)

  // Pad Y-axis a touch so the line doesn't sit on the bottom edge.
  const values = chart.map(d => d.net_worth)
  const minY = Math.min(...values)
  const maxY = Math.max(...values)
  const pad = (maxY - minY) * 0.15 || Math.max(maxY * 0.05, 100)
  const yDomain: [number, number] = [Math.max(0, minY - pad), maxY + pad]

  return (
    <div
      className="rounded-ds-lg bg-hero-gradient grain shadow-card p-4 sm:p-6 relative overflow-hidden"
      aria-label={`Net worth ${formatCurrency(end)}, ${positive ? 'up' : 'down'} ${formatCurrency(Math.abs(delta))} over ${range === 'ALL' ? 'all time' : range}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="type-label !text-white/60">Net Worth</p>
        <p className="text-[10px] text-white/45 type-amount">{startLabel} — {endLabel}</p>
      </div>

      <h2 className="type-hero text-[40px] sm:text-5xl leading-tight text-white mt-1 sensitive-amount">
        {formatCurrency(rolled)}
      </h2>

      <p className="text-sm font-semibold mt-0.5 type-amount" style={{ color: tint }}>
        {positive ? '▲' : '▼'} <span className="sensitive-amount">{positive ? '+' : '−'}{formatCurrency(Math.abs(delta))}</span>
        {!sparse && start > 0 && (
          <span className="ml-1.5 opacity-90">({positive ? '+' : ''}{deltaPct.toFixed(2)}%)</span>
        )}
        <span className="ml-1.5 text-white/40 font-normal normal-case">
          {range === 'ALL' ? 'all time' : range}
        </span>
      </p>

      <div className="h-40 sm:h-52 -mx-1 mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={yDomain} />
            <Tooltip
              cursor={{ stroke: '#FFFFFF', strokeOpacity: 0.35 }}
              contentStyle={{
                background: 'rgba(10, 14, 12, 0.9)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                fontSize: 12,
                color: '#F2F4F6',
              }}
              labelFormatter={(label: string) => formatShortDate(label)}
              formatter={(value: number) => [formatCurrency(value), 'Net Worth']}
            />
            <Area
              type="monotone"
              dataKey="net_worth"
              stroke="#FFFFFF"
              strokeOpacity={0.9}
              strokeWidth={2}
              fill="url(#hero-fill)"
              isAnimationActive={false}
              dot={sparse ? { r: 3, fill: '#FFFFFF', strokeWidth: 0 } : false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {sparse && (
        <p className="text-[11px] text-white/50 mt-1 text-center">
          The chart fills in as you use the app — one snapshot per day.
        </p>
      )}

      {/* Range pills */}
      <div className="flex items-center justify-between gap-1 mt-3 relative z-10">
        {RANGES.map(r => {
          const active = r.key === range
          return (
            <button
              key={r.key}
              onClick={() => { setRange(r.key); impactLight() }}
              className={`flex-1 h-8 rounded-full text-xs font-semibold type-amount transition-colors ${
                active
                  ? 'bg-white/18 text-white'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {r.key}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function formatShortDate(iso: string): string {
  if (!iso) return ''
  // YYYY-MM-DD → "Mon DD, YYYY"
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
