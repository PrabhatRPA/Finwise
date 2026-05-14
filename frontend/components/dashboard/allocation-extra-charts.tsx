'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts'

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const fmtK = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return fmt(v)
}

const PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#10b981', '#3b82f6',
]

// ── Top 10 Holdings by portfolio weight ──────────────────────────────────────
export function TopHoldingsChart({ holdings }: { holdings: any[] }) {
  const total = holdings.reduce((s, h) => s + (h.current_value || 0), 0)
  const data = [...holdings]
    .filter(h => (h.current_value || 0) > 0)
    .sort((a, b) => (b.current_value || 0) - (a.current_value || 0))
    .slice(0, 10)
    .map(h => ({
      name: h.ticker,
      value: h.current_value || 0,
      pct: total > 0 ? ((h.current_value || 0) / total) * 100 : 0,
    }))

  if (data.length === 0)
    return <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No holdings</div>

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} horizontal={false} />
        <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={44} />
        <Tooltip
          formatter={(v: any, _: any, props: any) => [
            `${fmt(v)}  (${props.payload.pct.toFixed(1)}%)`,
            'Value',
          ]}
          contentStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="value" name="Value" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Cost Basis vs Current Value by type ──────────────────────────────────────
export function CostBasisChart({ holdings }: { holdings: any[] }) {
  const map: Record<string, { cost: number; value: number }> = {}

  holdings.forEach(h => {
    const t = (h.security_type || 'other').toUpperCase()
    if (!map[t]) map[t] = { cost: 0, value: 0 }
    map[t].cost  += (h.shares || 0) * (h.average_cost || 0)
    map[t].value += h.current_value || 0
  })

  const data = Object.entries(map)
    .filter(([, v]) => v.value > 0)
    .map(([name, v]) => ({
      name,
      cost: Math.round(v.cost),
      value: Math.round(v.value),
      gain: Math.round(v.value - v.cost),
    }))
    .sort((a, b) => b.value - a.value)

  if (data.length === 0)
    return <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} width={64} />
        <Tooltip
          formatter={(v: any, name: string) => [fmt(v as number), name]}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar dataKey="cost"  name="Cost Basis"     fill="#6366f1" radius={[3,3,0,0]} />
        <Bar dataKey="value" name="Current Value"  fill="#22c55e" radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Estimated Annual Dividend Income ─────────────────────────────────────────
export function DividendIncomeChart({ holdings }: { holdings: any[] }) {
  // Only holdings with a non-zero dividend_yield contribute
  const withDiv = holdings.filter(h => (h.dividend_yield || 0) > 0 && (h.current_value || 0) > 0)

  if (withDiv.length === 0)
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm text-center px-4">
        No dividend data available.<br/>Dividend yields are populated when prices refresh.
      </div>
    )

  // Group by security type
  const map: Record<string, number> = {}
  withDiv.forEach(h => {
    const t = (h.security_type || 'other').toUpperCase()
    // dividend_yield is a decimal (e.g. 0.015 = 1.5%)
    const annualDiv = (h.current_value || 0) * (h.dividend_yield || 0)
    map[t] = (map[t] || 0) + annualDiv
  })

  const total = Object.values(map).reduce((s, v) => s + v, 0)
  const data = Object.entries(map)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Estimated annual dividend income: <span className="font-semibold text-foreground">{fmt(total)}</span>
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={75}
            dataKey="value"
            label={({ name, value }) => `${name} ${fmt(value)}`}
            labelLine={false}
          >
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip formatter={(v: any) => [fmt(v as number), 'Annual Dividend']} contentStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Concentration Risk: how many holdings make up 80% of portfolio ────────────
export function ConcentrationChart({ holdings }: { holdings: any[] }) {
  const total = holdings.reduce((s, h) => s + (h.current_value || 0), 0)
  if (total === 0)
    return <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>

  const sorted = [...holdings]
    .filter(h => (h.current_value || 0) > 0)
    .sort((a, b) => (b.current_value || 0) - (a.current_value || 0))

  // Cumulative weight
  let cumPct = 0
  const data: { name: string; pct: number; cumPct: number }[] = []
  for (const h of sorted.slice(0, 15)) {
    const pct = ((h.current_value || 0) / total) * 100
    cumPct += pct
    data.push({ name: h.ticker, pct: +pct.toFixed(1), cumPct: +cumPct.toFixed(1) })
  }

  const top5pct = data.slice(0, 5).reduce((s, d) => s + d.pct, 0)

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Top 5 holdings account for{' '}
        <span className={`font-semibold ${top5pct > 60 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {top5pct.toFixed(1)}%
        </span>{' '}
        of portfolio{top5pct > 60 ? ' — high concentration risk' : ''}
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
          <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={36} />
          <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} width={36} />
          <Tooltip
            formatter={(v: any, name: string) => [`${v}%`, name === 'pct' ? 'Weight' : 'Cumulative']}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="pct" name="Weight" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.cumPct <= 50 ? '#ef4444' : d.cumPct <= 75 ? '#f59e0b' : '#6366f1'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
