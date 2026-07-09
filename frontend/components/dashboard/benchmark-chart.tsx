'use client'

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { netWorthApi, marketApi } from '@/lib/api'
import { useRegion } from '@/lib/region'
import { TickerSearchInput } from '@/components/ds/ticker-search'

type TimeRange = 30 | 90 | 180 | 365 | 730 | 1825

// The benchmark set is user-editable (max 7): defaults come from the selected
// market (Settings → Market & Currency); customizations persist locally.
const BENCH_KEY = 'benchmark_tickers'
const MAX_BENCHMARKS = 7

interface Benchmark { ticker: string; label: string }

// Line/chip colors assigned by position — stable within a session and
// independent of which tickers the user picked.
const PALETTE = ['#f97316', '#eab308', '#06b6d4', '#22c55e', '#8b5cf6', '#ec4899', '#a78bfa']
const PORTFOLIO_COLOR = '#6366f1'

function loadSavedBenchmarks(): Benchmark[] | null {
  try {
    const raw = window.localStorage.getItem(BENCH_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (Array.isArray(v) && v.length > 0 && v.every((b: any) => b?.ticker)) {
      return v.slice(0, MAX_BENCHMARKS).map((b: any) => ({
        ticker: String(b.ticker).toUpperCase(),
        label: String(b.label ?? b.ticker),
      }))
    }
  } catch { /* fall through to defaults */ }
  return null
}

function saveBenchmarks(list: Benchmark[] | null) {
  try {
    if (list == null) window.localStorage.removeItem(BENCH_KEY)
    else window.localStorage.setItem(BENCH_KEY, JSON.stringify(list))
  } catch { /* ignore */ }
}

interface BenchmarkResult {
  ticker: string
  label: string
  color: string
  periodReturn: number   // % from start of period
  dayReturn: number      // % last day
  dataMap: Record<string, number>  // date → % return
}

interface PortfolioStats {
  periodReturn: number
  dayReturn: number
}

const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const fmtPctAxis = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

function toDateStr(iso: string) {
  // handles both "2024-05-09" and "2024-05-09T00:00:00.000Z"
  return String(iso).slice(0, 10)
}

function fmtAxisDate(dateStr: string) {
  // dateStr is "2024-05-09"
  const [y, m, d] = dateStr.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[m - 1]} ${d}`
}

const RANGE_LABEL: Record<TimeRange, string> = {
  30: '30D', 90: '90D', 180: '6M', 365: '1Y', 730: '2Y', 1825: '5Y',
}

// ── Stat card shown above the chart ──────────────────────────────────────────
function StatCard({
  label, color, periodReturn, dayReturn, days,
}: {
  label: string; color: string; periodReturn: number; dayReturn: number; days: TimeRange
}) {
  const pos = (v: number) => v >= 0 ? 'text-emerald-400' : 'text-red-400'
  return (
    <div
      className="flex-1 min-w-[140px] rounded-lg p-3 border"
      style={{ borderLeftWidth: 3, borderLeftColor: color, borderColor: `${color}30` }}
    >
      <p className="text-xs font-semibold text-foreground/70 mb-1.5">{label}</p>
      <div className="flex items-baseline gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground">{RANGE_LABEL[days]} return</p>
          <p className={`text-lg font-bold ${pos(periodReturn)}`}>{fmtPct(periodReturn)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">1-day</p>
          <p className={`text-sm font-semibold ${pos(dayReturn)}`}>{fmtPct(dayReturn)}</p>
        </div>
      </div>
    </div>
  )
}

export function BenchmarkChart() {
  const region = useRegion()
  const [days, setDays] = useState<TimeRange>(90)
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<any[]>([])
  const [portfolioStats, setPortfolioStats] = useState<PortfolioStats | null>(null)
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResult[]>([])
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([])
  const [activeTickers, setActiveTickers] = useState<string[]>([])
  const [noHistory, setNoHistory] = useState(false)
  const [editing, setEditing] = useState(false)
  const [addQuery, setAddQuery] = useState('')

  // Hydrate the benchmark set: user's saved list, else the market's defaults.
  useEffect(() => {
    const list = loadSavedBenchmarks()
      ?? region.defaultBenchmarks.map(b => ({ ticker: b.ticker, label: b.name }))
    setBenchmarks(list)
    setActiveTickers(prev => {
      const valid = prev.filter(t => list.some(b => b.ticker === t))
      return valid.length > 0 ? valid : list.slice(0, 2).map(b => b.ticker)
    })
    // MarketRegion entries are stable module constants, so depending on the
    // object is equivalent to depending on region.id.
  }, [region])

  const colorOf = (ticker: string) => {
    const i = benchmarks.findIndex(b => b.ticker === ticker)
    return PALETTE[(i >= 0 ? i : 0) % PALETTE.length]
  }

  const toggleTicker = (ticker: string) => {
    setActiveTickers(prev =>
      prev.includes(ticker)
        ? prev.length > 1 ? prev.filter(t => t !== ticker) : prev
        : [...prev, ticker]
    )
  }

  const addBenchmark = (symbol: string, label: string) => {
    const t = symbol.toUpperCase()
    if (!t || benchmarks.some(b => b.ticker === t) || benchmarks.length >= MAX_BENCHMARKS) return
    const next = [...benchmarks, { ticker: t, label: label || t }]
    setBenchmarks(next)
    saveBenchmarks(next)
    setActiveTickers(prev => [...prev, t])
    setAddQuery('')
  }

  const removeBenchmark = (ticker: string) => {
    if (benchmarks.length <= 1) return
    const next = benchmarks.filter(b => b.ticker !== ticker)
    setBenchmarks(next)
    saveBenchmarks(next)
    setActiveTickers(prev => {
      const v = prev.filter(t => t !== ticker)
      return v.length > 0 ? v : next.slice(0, 1).map(b => b.ticker)
    })
  }

  const resetBenchmarks = () => {
    saveBenchmarks(null)
    const list = region.defaultBenchmarks.map(b => ({ ticker: b.ticker, label: b.name }))
    setBenchmarks(list)
    setActiveTickers(list.slice(0, 2).map(b => b.ticker))
  }

  useEffect(() => {
    if (benchmarks.length === 0) return
    setLoading(true)
    setNoHistory(false)

    const period =
      days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo'
      : days <= 365 ? '1y' : days <= 730 ? '2y' : '5y'

    // Use Promise.allSettled so individual benchmark failures don't crash the chart
    Promise.allSettled([
      netWorthApi.getTrends(days),
      ...benchmarks.map(b => marketApi.getHistory(b.ticker, period)),
    ]).then(results => {
      const [trendResult, ...benchResults] = results

      // ── Portfolio data ──────────────────────────────────────────────────────
      if (trendResult.status === 'rejected') {
        setNoHistory(true)
        setLoading(false)
        return
      }

      const portfolioPoints: { date: string; net_worth: number }[] =
        (trendResult.value.data?.points ?? []).slice(-days)

      if (portfolioPoints.length < 2) {
        setNoHistory(true)
        setLoading(false)
        return
      }

      const baseNW = portfolioPoints[0].net_worth
      const lastNW = portfolioPoints[portfolioPoints.length - 1].net_worth
      const prevNW = portfolioPoints[portfolioPoints.length - 2].net_worth

      const pStats: PortfolioStats = {
        periodReturn: baseNW > 0 ? ((lastNW - baseNW) / baseNW) * 100 : 0,
        dayReturn:    prevNW > 0 ? ((lastNW - prevNW) / prevNW) * 100 : 0,
      }
      setPortfolioStats(pStats)

      const portfolioMap: Record<string, number> = {}
      portfolioPoints.forEach(p => {
        const d = toDateStr(p.date)
        portfolioMap[d] = baseNW > 0 ? ((p.net_worth - baseNW) / baseNW) * 100 : 0
      })

      // ── Benchmark data (only fulfilled) ────────────────────────────────────
      const loadedBenchmarks: BenchmarkResult[] = []
      benchmarks.forEach((b, i) => {
        const res = benchResults[i]
        if (res.status !== 'fulfilled') return
        const hist: any[] = res.value.data?.data ?? []
        if (hist.length < 2) return

        const base = hist[0].close
        if (!base || base <= 0) return

        const dataMap: Record<string, number> = {}
        hist.forEach((row: any) => {
          if (row.close !== null && row.close !== undefined) {
            // Native getHistory returns `date` (YYYY-MM-DD) + numeric `timestamp`;
            // the FastAPI backend returns an ISO `timestamp`. Prefer `date` so the
            // keys line up with the portfolio's YYYY-MM-DD snapshot dates — using
            // the numeric timestamp here produced keys like "1734…" that never
            // matched, so benchmark lines silently dropped out.
            dataMap[toDateStr(row.date ?? row.timestamp)] = ((row.close - base) / base) * 100
          }
        })

        const lastClose = hist[hist.length - 1].close
        const prevClose = hist[hist.length - 2].close

        loadedBenchmarks.push({
          ticker: b.ticker,
          label:  b.label,
          color:  PALETTE[i % PALETTE.length],
          periodReturn: ((lastClose - base) / base) * 100,
          dayReturn:    prevClose > 0 ? ((lastClose - prevClose) / prevClose) * 100 : 0,
          dataMap,
        })
      })
      setBenchmarkResults(loadedBenchmarks)

      // ── Build unified time series ──────────────────────────────────────────
      const allDates = new Set<string>()
      loadedBenchmarks.forEach(b => Object.keys(b.dataMap).forEach(d => allDates.add(d)))
      Object.keys(portfolioMap).forEach(d => allDates.add(d))

      const startDate = toDateStr(portfolioPoints[0].date)
      const sortedDates = Array.from(allDates).sort().filter(d => d >= startDate)

      // Forward-fill portfolio between snapshot dates
      let lastPortfolio: number | null = null
      const rows = sortedDates.map(d => {
        if (portfolioMap[d] !== undefined) lastPortfolio = portfolioMap[d]
        const row: any = { _date: d, date: fmtAxisDate(d), portfolio: lastPortfolio }
        loadedBenchmarks.forEach(b => { row[b.ticker] = b.dataMap[d] ?? null })
        return row
      })

      setChartData(rows)
    }).finally(() => setLoading(false))
  }, [days, benchmarks])

  const TIME_RANGES: { id: TimeRange; label: string }[] = [
    { id: 30,   label: '1M' },
    { id: 90,   label: '3M' },
    { id: 180,  label: '6M' },
    { id: 365,  label: '1Y' },
    { id: 730,  label: '2Y' },
    { id: 1825, label: '5Y' },
  ]

  // Stat cards to show: portfolio + active benchmarks that loaded
  const activeResults = benchmarkResults.filter(b => activeTickers.includes(b.ticker))

  if (loading) return <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>

  if (noHistory)
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        <p>Not enough portfolio history to compare.</p>
        <p className="mt-1">Open the dashboard on a few different days to build up trend data.</p>
      </div>
    )

  return (
    <div className="space-y-4">
      {/* ── Stat cards ── */}
      {portfolioStats && (
        <div className="flex flex-wrap gap-3">
          <StatCard
            label="My Portfolio"
            color={PORTFOLIO_COLOR}
            periodReturn={portfolioStats.periodReturn}
            dayReturn={portfolioStats.dayReturn}
            days={days}
          />
          {activeResults.map(b => (
            <StatCard
              key={b.ticker}
              label={b.label}
              color={b.color}
              periodReturn={b.periodReturn}
              dayReturn={b.dayReturn}
              days={days}
            />
          ))}
        </div>
      )}

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Time range */}
        <div className="flex items-center gap-1 flex-wrap">
          {TIME_RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => setDays(r.id)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                days === r.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Benchmark toggles + edit */}
        <div className="flex items-center gap-1 flex-wrap">
          {benchmarks.map(b => {
            const loaded = benchmarkResults.find(r => r.ticker === b.ticker)
            const active = activeTickers.includes(b.ticker)
            const color = colorOf(b.ticker)
            return (
              <span key={b.ticker} className="inline-flex items-center">
                <button
                  onClick={() => toggleTicker(b.ticker)}
                  disabled={!loaded}
                  title={loaded ? b.label : `${b.label} — data unavailable`}
                  className={`px-2.5 py-1 text-xs font-medium transition-all border ${
                    editing ? 'rounded-l' : 'rounded'
                  } ${
                    !loaded
                      ? 'opacity-30 cursor-not-allowed border-border text-muted-foreground'
                      : active
                        ? 'text-white border-transparent'
                        : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'
                  }`}
                  style={loaded && active ? { backgroundColor: color, borderColor: color } : {}}
                >
                  {b.ticker}
                </button>
                {editing && (
                  <button
                    onClick={() => removeBenchmark(b.ticker)}
                    aria-label={`Remove ${b.ticker}`}
                    className="px-1.5 py-1 text-xs rounded-r border border-l-0 border-border text-muted-foreground hover:text-red-500"
                    style={{ minHeight: 0, minWidth: 0 }}
                  >
                    ×
                  </button>
                )}
              </span>
            )
          })}
          <button
            onClick={() => setEditing(e => !e)}
            className={`px-2 py-1 text-xs rounded font-medium border transition-colors ${
              editing ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground/30'
            }`}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      {/* ── Benchmark editor ── */}
      {editing && (
        <div className="rounded-md border border-dashed border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Compare against any ticker or index — up to {MAX_BENCHMARKS}.
              {benchmarks.length >= MAX_BENCHMARKS && ' Limit reached — remove one to add another.'}
            </p>
            <button
              onClick={resetBenchmarks}
              className="text-xs text-primary font-medium shrink-0"
              style={{ minHeight: 0, minWidth: 0 }}
            >
              Reset to defaults
            </button>
          </div>
          {benchmarks.length < MAX_BENCHMARKS && (
            <TickerSearchInput
              value={addQuery}
              onChange={setAddQuery}
              onSelect={(m) => addBenchmark(m.symbol, m.name)}
              placeholder="Search ticker or index (e.g. ^NSEI, SPY)"
            />
          )}
        </div>
      )}

      {/* ── Chart ── */}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={fmtPctAxis}
            tick={{ fontSize: 10 }}
            width={54}
          />
          <Tooltip
            formatter={(v: any, name: string) => [
              v !== null ? fmtPct(v as number) : '—',
              name,
            ]}
            contentStyle={{ fontSize: 12 }}
            labelStyle={{ fontSize: 11, color: '#9ca3af' }}
          />
          <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1.5} />

          {/* Portfolio — always shown, solid, thicker */}
          <Line
            type="monotone"
            dataKey="portfolio"
            name="My Portfolio"
            stroke={PORTFOLIO_COLOR}
            strokeWidth={2.5}
            dot={false}
            connectNulls
          />

          {/* Active benchmark lines */}
          {activeResults.map(b => (
            <Line
              key={b.ticker}
              type="monotone"
              dataKey={b.ticker}
              name={b.label}
              stroke={b.color}
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="5 3"
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-muted-foreground text-right">
        All lines show % return from the start of the selected period · data from third-party market sources
      </p>
    </div>
  )
}
