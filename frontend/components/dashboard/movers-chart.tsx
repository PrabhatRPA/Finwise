'use client'

// Today's Movers — sorted horizontal bars of each holding's TODAY dollar P&L,
// answering "who moved my portfolio today". Top 10 by magnitude; green gains,
// red losses; header shows the portfolio's total day P&L.

import { useMemo } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'
import { formatCurrency } from '@/lib/utils'

export function MoversChart({ holdings }: { holdings: any[] }) {
  const rows = useMemo(() => {
    return holdings
      .map((h: any) => ({ ticker: h.ticker, change: Number(h.today_gain_loss ?? 0) }))
      .filter((r) => r.ticker && r.change !== 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 10)
      .sort((a, b) => b.change - a.change)   // display: biggest gain → biggest loss
  }, [holdings])

  const total = useMemo(
    () => holdings.reduce((s: number, h: any) => s + (Number(h.today_gain_loss) || 0), 0),
    [holdings],
  )
  const up = total >= 0

  if (holdings.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Add holdings to see today’s movers.</p>
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No price movement yet today (or market data still loading).</p>
  }

  return (
    <div className="space-y-2">
      <p className={`type-amount text-sm font-bold ${up ? 'text-positive' : 'text-negative'}`}>
        Total today: <span className="sensitive-amount">{up ? '+' : '−'}{formatCurrency(Math.abs(total))}</span>
      </p>
      <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 30 + 24)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v: number) => formatCurrency(v)} />
          <YAxis
            type="category"
            dataKey="ticker"
            width={54}
            tick={{ fontSize: 11, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}
          />
          <Tooltip
            formatter={(v: any) => [`${(v as number) >= 0 ? '+' : '−'}${formatCurrency(Math.abs(v as number))}`, 'Today']}
            contentStyle={{ fontSize: 12, borderRadius: 12 }}
          />
          <ReferenceLine x={0} stroke="hsl(var(--border))" />
          <Bar dataKey="change" radius={[3, 3, 3, 3]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.ticker} fill={r.change >= 0 ? 'hsl(var(--positive))' : 'hsl(var(--negative))'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
