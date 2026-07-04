'use client'

// True Portfolio Performance — the portfolio's value curve over 1M/3M/6M/1Y,
// reconstructed as Σ(current shares × each day's close) across all holdings.
// Unlike the net-worth trend (daily snapshots that only exist since install),
// this draws a full curve from day one. Assumes today's share counts were held
// through the whole period — stated in the small print.

import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { marketApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

const RANGES = [
  { id: '1M', period: '1mo' },
  { id: '3M', period: '3mo' },
  { id: '6M', period: '6mo' },
  { id: '1Y', period: '1y' },
  { id: '2Y', period: '2y' },
  { id: '5Y', period: '5y' },
  { id: 'ALL', period: 'max' },
] as const
type RangeId = typeof RANGES[number]['id']

// (ticker, period) → history rows, cached ~10 min so range flips are instant.
const _histCache = new Map<string, { at: number; rows: { date: string; close: number | null }[] }>()
const HIST_TTL = 10 * 60 * 1000

async function historyFor(ticker: string, period: string) {
  const key = `${ticker}:${period}`
  const hit = _histCache.get(key)
  if (hit && Date.now() - hit.at < HIST_TTL) return hit.rows
  const res: any = await marketApi.getHistory(ticker, period)
  const rows = (res.data?.data ?? res.data?.history ?? []) as { date: string; close: number | null }[]
  if (rows.length > 0) _histCache.set(key, { at: Date.now(), rows })
  return rows
}

// Small concurrency limiter (mirrors market.ts's mapLimit).
async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  const q = items.slice()
  await Promise.all(Array.from({ length: Math.min(limit, q.length) }, async () => {
    while (q.length) { const it = q.shift(); if (it !== undefined) await fn(it) }
  }))
}

export function TruePerformanceChart({ holdings }: { holdings: any[] }) {
  const [range, setRange] = useState<RangeId>('3M')
  const [series, setSeries] = useState<{ date: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)

  // shares per ticker (merge duplicates)
  const shareMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of holdings) {
      const t = (h.ticker || '').toUpperCase()
      if (!t) continue
      m.set(t, (m.get(t) ?? 0) + (Number(h.shares) || 0))
    }
    return m
  }, [holdings])

  useEffect(() => {
    const tickers = Array.from(shareMap.keys())
    if (tickers.length === 0) { setSeries([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const period = RANGES.find(r => r.id === range)!.period

    ;(async () => {
      // date → per-ticker close
      const byTicker = new Map<string, Map<string, number>>()
      const allDates = new Set<string>()
      await mapLimit(tickers, 5, async (t) => {
        try {
          const rows = await historyFor(t, period)
          const m = new Map<string, number>()
          for (const r of rows) {
            if (r.close != null && isFinite(r.close) && r.close > 0) {
              m.set(r.date, r.close)
              allDates.add(r.date)
            }
          }
          if (m.size > 0) byTicker.set(t, m)
        } catch { /* skip ticker */ }
      })
      if (cancelled) return

      const dates = Array.from(allDates).sort()
      // Forward-fill each ticker so one symbol's missing day never zeroes the
      // total, and note the first date where EVERY ticker has reported at
      // least once — leading partial sums would read as a fake cliff.
      const lastClose = new Map<string, number>()
      const out: { date: string; value: number }[] = []
      let firstFullIdx = 0
      let seenFull = false
      for (const d of dates) {
        let total = 0
        for (const [t, closes] of Array.from(byTicker.entries())) {
          const c = closes.get(d)
          if (c != null) lastClose.set(t, c)
          const use = lastClose.get(t)
          if (use != null) total += use * (shareMap.get(t) ?? 0)
        }
        if (!seenFull && lastClose.size === byTicker.size) {
          seenFull = true
          firstFullIdx = out.length
        }
        out.push({ date: d, value: total })
      }
      setSeries(out.slice(firstFullIdx))
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [shareMap, range])

  const start = series[0]?.value ?? 0
  const end = series[series.length - 1]?.value ?? 0
  const delta = end - start
  const pct = start > 0 ? (delta / start) * 100 : 0
  const up = delta >= 0
  const color = up ? 'hsl(var(--positive))' : 'hsl(var(--negative))'

  if (holdings.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Add holdings to see portfolio performance.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className={`type-amount text-lg font-bold ${up ? 'text-positive' : 'text-negative'}`}>
            {up ? '▲ +' : '▼ −'}{formatCurrency(Math.abs(delta))}
            <span className="ml-1.5 text-sm font-semibold">({up ? '+' : ''}{pct.toFixed(2)}%)</span>
          </p>
          <p className="text-xs text-muted-foreground">over {range}</p>
        </div>
        <div className="flex items-center gap-1 flex-1 max-w-[280px] justify-end">
          {RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`flex-1 min-w-0 px-1 py-1 text-[10px] rounded-full type-amount font-semibold transition-colors ${
                range === r.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
              style={{ minHeight: 0, minWidth: 0 }}
            >
              {r.id}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-14 animate-pulse">Reconstructing portfolio…</p>
      ) : series.length < 2 ? (
        <p className="text-sm text-muted-foreground text-center py-14">Not enough price history.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="tp-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={48}
              tickFormatter={(d: string) => (range === '2Y' || range === '5Y' || range === 'ALL') ? d.slice(0, 7) : d.slice(5)} />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              formatter={(v: any) => [formatCurrency(v as number), 'Portfolio']}
              contentStyle={{ fontSize: 12, borderRadius: 12 }}
            />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2}
              fill="url(#tp-fill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}

      <p className="text-[10px] text-muted-foreground">
        Reconstructed from daily closes × your current share counts (assumes today’s
        positions were held through the period). Market data may be delayed.
      </p>
    </div>
  )
}
