'use client'

import { useEffect, useState } from 'react'
import {
  LineChart, Line,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { netWorthApi, dataApi } from '@/lib/api'
import { getRegion } from '@/lib/region'
import { formatCurrencyWhole } from '@/lib/utils'

type ChartType = 'line' | 'area' | 'bar'
type TimeRange = 7 | 30 | 90 | 365 | 730 | 1825

const fmt = (v: number) =>
  formatCurrencyWhole(v)

// Compact axis labels in the selected market's currency (₹1.2M, $340K, …).
const fmtK = (v: number) => {
  const r = getRegion()
  try {
    return new Intl.NumberFormat(r.locale, {
      style: 'currency', currency: r.currency,
      notation: 'compact', maximumFractionDigits: 1,
    }).format(v)
  } catch {
    return fmt(v)
  }
}

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`
}

const METRICS = {
  net_worth:   { label: 'Net Worth',  color: '#6366f1' },
  investments: { label: 'Portfolio',  color: '#22c55e' },
  liabilities: { label: 'Total Debt', color: '#ef4444' },
} as const

type MetricKey = keyof typeof METRICS

const COMBINED: MetricKey[] = ['net_worth', 'investments', 'liabilities']

function PillBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      }`}
    >
      {children}
    </button>
  )
}

function MiniChart({
  data, keys, type, height = 160,
}: {
  data: any[]
  keys: MetricKey[]
  type: ChartType
  height?: number
}) {
  const single = keys.length === 1
  const yDomain: [any, any] = single ? ['auto', 'auto'] : [0, 'auto']

  const shared = {
    data,
    margin: { top: 4, right: 8, left: 0, bottom: 0 },
  }

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
      <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
      <YAxis tickFormatter={fmtK} tick={{ fontSize: 9 }} width={62} domain={yDomain} />
      <Tooltip
        formatter={(v: any, name: string) => [fmt(v as number), name]}
        contentStyle={{ fontSize: 11 }}
      />
      {!single && <Legend wrapperStyle={{ fontSize: 10 }} />}
    </>
  )

  if (type === 'area') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart {...shared}>
          {axes}
          {keys.map(k => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              name={METRICS[k].label}
              stroke={METRICS[k].color}
              fill={METRICS[k].color}
              fillOpacity={0.12}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart {...shared}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
          <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 9 }} width={62} domain={[0, 'auto']} />
          <Tooltip
            formatter={(v: any, name: string) => [fmt(v as number), name]}
            contentStyle={{ fontSize: 11 }}
          />
          {!single && <Legend wrapperStyle={{ fontSize: 10 }} />}
          {keys.map(k => (
            <Bar key={k} dataKey={k} name={METRICS[k].label} fill={METRICS[k].color} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart {...shared}>
        {axes}
        {keys.map(k => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            name={METRICS[k].label}
            stroke={METRICS[k].color}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export function NetWorthTrendChart() {
  const [allPoints, setAllPoints] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [chartType, setChartType] = useState<ChartType>('line')
  const [days, setDays] = useState<TimeRange>(90)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    // Fetch the full 5-year window once; range pills slice client-side.
    // Snapshots only exist for days the app was opened, so long ranges
    // simply show whatever history is available — no error states.
    netWorthApi.getTrends(1825)
      .then(r => {
        const raw = r.data?.points ?? []
        setAllPoints(raw.map((p: any) => ({ ...p, date: fmtDate(p.date) })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const points = allPoints.slice(-days)

  const doExport = async () => {
    setExporting(true)
    try { await dataApi.exportTrends() } finally { setExporting(false) }
  }

  if (loading) return <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>

  if (allPoints.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        <p>No trend data yet.</p>
        <p className="mt-1">Snapshots are recorded each time you load the dashboard.</p>
      </div>
    )
  }

  const TIME_RANGES: { id: TimeRange; label: string }[] = [
    { id: 7, label: '7D' },
    { id: 30, label: '1M' },
    { id: 90, label: '3M' },
    { id: 365, label: '1Y' },
    { id: 730, label: '2Y' },
    { id: 1825, label: '5Y' },
  ]

  const CHART_TYPES: { id: ChartType; label: string }[] = [
    { id: 'line', label: 'Line' },
    { id: 'area', label: 'Area' },
    { id: 'bar', label: 'Bar' },
  ]

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {TIME_RANGES.map(r => (
            <PillBtn key={r.id} active={days === r.id} onClick={() => setDays(r.id)}>
              {r.label}
            </PillBtn>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1">
            {CHART_TYPES.map(t => (
              <PillBtn key={t.id} active={chartType === t.id} onClick={() => setChartType(t.id)}>
                {t.label}
              </PillBtn>
            ))}
          </div>
          <button
            onClick={doExport}
            disabled={exporting}
            className="ml-1 px-2.5 py-1 text-xs rounded font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : '↓ Export CSV'}
          </button>
        </div>
      </div>

      {/* Combined chart */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Combined Overview
        </p>
        <MiniChart data={points} keys={COMBINED} type={chartType} height={230} />
      </div>

      {/* Individual zoomed charts */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Individual Trends — auto-scaled to show daily changes
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(Object.entries(METRICS) as [MetricKey, typeof METRICS[MetricKey]][]).map(([key, cfg]) => (
            <div key={key} className="rounded-lg border border-border/50 p-3 space-y-1">
              <p className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</p>
              <MiniChart data={points} keys={[key]} type={chartType} height={155} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
