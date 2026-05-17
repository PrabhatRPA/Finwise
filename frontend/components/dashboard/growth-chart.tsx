'use client'

import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { netWorthApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

// Lookback windows for the time-range pill row.
const RANGES = [
  { key: '1W',  days: 7      },
  { key: '1M',  days: 30     },
  { key: '3M',  days: 90     },
  { key: '1Y',  days: 365    },
  { key: 'ALL', days: 100000 },
] as const
type RangeKey = typeof RANGES[number]['key']

interface TrendPoint {
  date: string         // YYYY-MM-DD
  net_worth: number
}

export function GrowthChart({ currentNetWorth }: { currentNetWorth: number | null | undefined }) {
  const [range, setRange] = useState<RangeKey>('1M')
  const [trends, setTrends] = useState<TrendPoint[]>([])

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

  const start = data[0]?.net_worth ?? 0
  const end   = data[data.length - 1]?.net_worth ?? 0
  const delta    = end - start
  const deltaPct = start > 0 ? (delta / start) * 100 : 0
  const sparse = data.length < 2

  const startLabel = data[0] ? formatShortDate(data[0].date) : ''
  const endLabel   = data[data.length - 1] ? formatShortDate(data[data.length - 1].date) : ''

  const positive = delta >= 0
  const lineColor = positive ? '#10b981' /* emerald-500 */ : '#ef4444' /* red-500 */
  const gradId = `growth-grad-${positive ? 'up' : 'down'}`

  // Pad Y-axis a touch so the line doesn't sit on the bottom edge.
  const values = data.map(d => d.net_worth)
  const minY = Math.min(...values)
  const maxY = Math.max(...values)
  const pad = (maxY - minY) * 0.15 || Math.max(maxY * 0.05, 100)
  const yDomain: [number, number] = [Math.max(0, minY - pad), maxY + pad]

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Net Worth</p>
        <p className="text-[10px] text-muted-foreground">{startLabel} — {endLabel}</p>
      </div>
      <h2 className="text-3xl sm:text-4xl font-bold tabular-nums mt-0.5">
        {formatCurrency(end)}
      </h2>
      <p className={`text-sm font-medium mt-0.5 ${positive ? 'text-emerald-500' : 'text-red-500'}`}>
        {positive ? '↗' : '↘'} {positive ? '+' : '-'}{formatCurrency(Math.abs(delta))}
        {!sparse && start > 0 && (
          <span className="ml-1">({positive ? '+' : ''}{deltaPct.toFixed(2)}%)</span>
        )}
      </p>

      <div className="h-44 sm:h-56 -mx-1 mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={lineColor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={yDomain} />
            <Tooltip
              cursor={{ stroke: lineColor, strokeOpacity: 0.4 }}
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(label: string) => formatShortDate(label)}
              formatter={(value: number) => [formatCurrency(value), 'Net Worth']}
            />
            <Area
              type="monotone"
              dataKey="net_worth"
              stroke={lineColor}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              isAnimationActive={false}
              dot={sparse ? { r: 3, fill: lineColor, strokeWidth: 0 } : false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {sparse && (
        <p className="text-[11px] text-muted-foreground mt-1 text-center">
          The chart fills in as you use the app — one snapshot per day.
        </p>
      )}

      {/* Range pills */}
      <div className="flex items-center justify-between gap-1 mt-3">
        {RANGES.map(r => {
          const active = r.key === range
          return (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`flex-1 h-8 rounded-md text-xs font-semibold transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
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
