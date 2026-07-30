'use client'

// Property value trend. Combined across all properties by default (sum of each
// property's carried-forward value at each date), with a per-property drill.
//
// Carry-forward rules (what makes this render as a line, not scattered dots):
//   • A value holds flat from its snapshot until the next one replaces it —
//     step interpolation (stepAfter), never a smooth slope, since the app has
//     no basis for the in-between values.
//   • Carry forward to today. One snapshot in March → a flat line March→today.
//   • Never carry backward: before a property's first snapshot it contributes
//     nothing (0 to the combined sum), so the series starts at the first value.
//   • Never extrapolate past today (no projected appreciation).
// Nothing is required of the user: with one snapshot it's a flat line; the card
// simply doesn't render when there are no properties.

import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { currencySymbol, useRegion } from '@/lib/region'
import { propertiesApi } from '@/lib/api'

interface RangeDef { id: string; days?: number; months?: number; all?: boolean }
const RANGES: RangeDef[] = [
  { id: '1D', days: 1 },
  { id: '1W', days: 7 },
  { id: '1M', months: 1 },
  { id: '3M', months: 3 },
  { id: '6M', months: 6 },
  { id: '1Y', months: 12 },
  { id: '2Y', months: 24 },
  { id: '5Y', months: 60 },
  { id: 'All', all: true },
]
type RangeId = string

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = 86400000
const toEpoch = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime()
const isoOf = (epoch: number) => new Date(epoch).toISOString().slice(0, 10)
const addMonthsIso = (iso: string, k: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + k)
  return d.toISOString().slice(0, 10)
}
// Window start for a range: day-based, month-based, or the earliest snapshot (All).
function rangeStartIso(range: RangeId, today: string, earliest: string): string {
  const r = RANGES.find((x) => x.id === range) ?? RANGES[5]
  if (r.all) return earliest
  if (r.days) return isoOf(toEpoch(today) - r.days * DAY)
  return addMonthsIso(today, -(r.months ?? 12))
}

export function PropertyValueTrend() {
  useRegion()
  const [snaps, setSnaps] = useState<any[]>([])
  const [props, setProps] = useState<any[]>([])
  const [range, setRange] = useState<RangeId>('1M')
  const [propId, setPropId] = useState<number | 'all'>('all')

  // Refetch on mount AND whenever a property/value changes elsewhere (the
  // "Update value" sheet lives in PropertiesTable, a sibling component), so the
  // trend reflects a new value immediately instead of showing stale data.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [s, p] = await Promise.all([propertiesApi.getAllSnapshots(), propertiesApi.getAll()])
        if (!cancelled) { setSnaps(s.data.snapshots ?? []); setProps(p.data.properties ?? []) }
      } catch {}
    }
    load()
    const on = () => load()
    window.addEventListener('nworth:properties-changed', on)
    window.addEventListener('nworth:data-synced', on)  // iCloud pulled new data
    return () => {
      cancelled = true
      window.removeEventListener('nworth:properties-changed', on)
      window.removeEventListener('nworth:data-synced', on)
    }
  }, [])

  // snapshots grouped per property, oldest first
  const byProp = useMemo(() => {
    const m = new Map<number, any[]>()
    for (const s of snaps) {
      if (!m.has(s.property_id)) m.set(s.property_id, [])
      m.get(s.property_id)!.push({ as_of_date: s.as_of_date, value: s.value })
    }
    // Seed each property with its purchase price at the purchase date, so a
    // property with one recorded value still shows appreciation (purchase →
    // now) instead of a flat line. Only when it predates the earliest recorded
    // value, and only if it differs, so we never override the user's own entry.
    for (const p of props) {
      const pd = (p.purchase_date || '').toString().slice(0, 10)
      const pp = p.purchase_price
      if (!pd || pp == null || pp === '') continue
      const arr = m.get(p.id)
      const firstDate = arr && arr.length ? arr[0].as_of_date : null
      if (!firstDate || (pd < firstDate && Number(pp) !== arr![0].value)) {
        const next = arr ? arr.slice() : []
        next.push({ as_of_date: pd, value: Number(pp) })
        m.set(p.id, next)
      }
    }
    m.forEach((arr) => {
      arr.sort((a: any, b: any) => a.as_of_date.localeCompare(b.as_of_date))
    })
    return m
  }, [snaps, props])

  const inView = useMemo<number[]>(() => {
    if (propId === 'all') return Array.from(byProp.keys())
    return byProp.has(propId) ? [propId] : []
  }, [byProp, propId])

  const { data, domain } = useMemo(() => {
    if (inView.length === 0) return { data: [] as any[], domain: null as [number, number] | null }
    const today = new Date().toISOString().slice(0, 10)

    let earliest = today
    for (const pid of inView) {
      const first = byProp.get(pid)![0]
      if (first && first.as_of_date < earliest) earliest = first.as_of_date
    }
    const isAll = (RANGES.find((r) => r.id === range) ?? {}).all === true
    const rangeStart = rangeStartIso(range, today, earliest)
    // Series starts at whichever is later — the property's first value or the
    // window start — so we never carry a value backward before it existed.
    const seriesStart = earliest > rangeStart ? earliest : rangeStart

    // value of a property carried forward to `date` (null before its first snapshot)
    const valueAsOf = (pid: number, date: string): number | null => {
      let v: number | null = null
      for (const s of byProp.get(pid)!) {
        if (s.as_of_date <= date) v = s.value
        else break
      }
      return v
    }

    // change points = the snapshot dates (where the step happens) + endpoints
    const dateSet = new Set<string>([seriesStart, today])
    for (const pid of inView) {
      for (const s of byProp.get(pid)!) {
        if (s.as_of_date >= seriesStart && s.as_of_date <= today) dateSet.add(s.as_of_date)
      }
    }
    const dates = Array.from(dateSet).sort()
    const series = dates.map((date) => {
      let total = 0
      let contributors = 0
      for (const pid of inView) {
        const v = valueAsOf(pid, date)
        if (v != null) { total += v; contributors++ }
      }
      return { t: toEpoch(date), value: total, contributors }
    })

    const todayE = toEpoch(today)
    // Explicit ranges (1D…5Y) show exactly their window. "All" spans the first
    // value to today, padded to ~6 months so a single/clustered snapshot doesn't
    // collapse the axis. The line itself still begins at the first value.
    let domStart: number
    if (isAll) {
      domStart = toEpoch(earliest)
      // Modest pad only so a single recent value doesn't collapse the axis —
      // not months of empty flat line.
      if (todayE - domStart < 30 * DAY) domStart = todayE - 30 * DAY
    } else {
      domStart = toEpoch(rangeStart)
    }

    // Degenerate single point (e.g. one value dated today): draw a short flat
    // segment ending at the point so the card reads as a chart, not a lone dot —
    // kept short so it doesn't imply a value existed long before it was entered.
    if (series.length === 1) {
      series.unshift({ t: Math.min(series[0].t - 14 * DAY, domStart), value: series[0].value, contributors: series[0].contributors })
    }

    return { data: series, domain: [domStart, todayE] as [number, number] }
  }, [byProp, inView, range])

  if (props.length === 0) return null  // no properties → no card

  const sym = currencySymbol()
  const combined = propId === 'all'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Property Value Trend</CardTitle>
        {props.length > 1 && (
          <select
            value={String(propId)}
            onChange={(e) => setPropId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-background text-foreground px-2 text-xs max-w-[45%]"
          >
            <option value="all">All properties</option>
            {props.map((p) => (
              <option key={p.id} value={p.id}>{p.nickname || p.address || `Property ${p.id}`}</option>
            ))}
          </select>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Add a value to a property to see how it’s changed over time.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="prop-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="t" type="number" domain={domain ?? ['auto', 'auto']} scale="time"
                  tickFormatter={(t: number) => {
                    const spanDays = domain ? (domain[1] - domain[0]) / DAY : 365
                    const d = new Date(t)
                    if (spanDays <= 31) return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`
                    if (spanDays <= 730) return `${MON[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`
                    return String(d.getUTCFullYear())
                  }}
                  tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  tickFormatter={(v: number) => `${sym}${v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)}`}
                  tick={{ fontSize: 10 }} width={46} stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  formatter={(v: any, _n: any, item: any) => [
                    formatCurrency(v as number),
                    combined ? `Value · ${item?.payload?.contributors ?? 0} propert${(item?.payload?.contributors ?? 0) === 1 ? 'y' : 'ies'}` : 'Value',
                  ]}
                  labelFormatter={(t: any) => new Date(Number(t)).toLocaleDateString()}
                  contentStyle={{ fontSize: 12, borderRadius: 10 }}
                />
                {/* stepAfter = flat until the next value, then a step. Dots mark
                    each actual value so a change is always visible. */}
                <Area type="stepAfter" dataKey="value" stroke="hsl(var(--primary))" fill="url(#prop-fill)" strokeWidth={2} isAnimationActive={false} dot={{ r: 2, strokeWidth: 0, fill: 'hsl(var(--primary))' }} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
            {/* Compact equal-width pills so all ranges fit on one line. */}
            <div className="flex items-center gap-1">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRange(r.id)}
                  className={`flex-1 min-w-0 px-0 py-1.5 text-[10px] rounded-full type-amount font-semibold transition-colors ${range === r.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  {r.id}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Values you’ve entered, held flat until the next update. No forecast — this shows what’s known.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
