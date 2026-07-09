'use client'

import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import { formatCurrencyWhole } from '@/lib/utils'

interface PortfolioPerformanceChartProps {
  holdings: any[]
}

type View = 'by-type' | 'by-ticker'
type Variant = 'grouped' | 'stacked'

const fmt = (v: number) =>
  formatCurrencyWhole(v)

const fmtK = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return fmt(v)
}

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

export function PortfolioPerformanceChart({ holdings }: PortfolioPerformanceChartProps) {
  const [view, setView] = React.useState<View>('by-type')
  const [variant, setVariant] = React.useState<Variant>('grouped')

  // Aggregate by security type, skip zero-value categories
  const typeMap: Record<string, { name: string; value: number; gain: number }> = {
    stock:  { name: 'Stocks',    value: 0, gain: 0 },
    etf:    { name: 'ETFs',      value: 0, gain: 0 },
    bond:   { name: 'Bonds',     value: 0, gain: 0 },
    other:  { name: 'Cash/Other', value: 0, gain: 0 },
  }

  holdings.forEach(h => {
    const t = h.security_type || 'stock'
    const key = ['stock', 'etf', 'bond'].includes(t) ? t : 'other'
    typeMap[key].value += h.current_value || 0
    typeMap[key].gain  += h.total_gain_loss || 0
  })

  const byTypeData = Object.values(typeMap).filter(d => d.value > 0 || Math.abs(d.gain) > 0)

  // Per-ticker P&L: top 20 by absolute gain, sorted high→low
  const byTickerData = [...holdings]
    .filter(h => h.total_gain_loss !== 0 || h.current_value > 0)
    .sort((a, b) => Math.abs(b.total_gain_loss || 0) - Math.abs(a.total_gain_loss || 0))
    .slice(0, 20)
    .map(h => ({ name: h.ticker, gain_loss: h.total_gain_loss || 0 }))
    .sort((a, b) => b.gain_loss - a.gain_loss)

  const tickerChartHeight = Math.max(280, byTickerData.length * 28)

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <PillBtn active={view === 'by-type'} onClick={() => setView('by-type')}>By Type</PillBtn>
          <PillBtn active={view === 'by-ticker'} onClick={() => setView('by-ticker')}>By Ticker</PillBtn>
        </div>
        {view === 'by-type' && (
          <div className="flex items-center gap-1 pl-3 border-l border-border">
            <PillBtn active={variant === 'grouped'} onClick={() => setVariant('grouped')}>Grouped</PillBtn>
            <PillBtn active={variant === 'stacked'} onClick={() => setVariant('stacked')}>Stacked</PillBtn>
          </div>
        )}
        {view === 'by-ticker' && (
          <span className="text-[10px] text-muted-foreground pl-3 border-l border-border">
            Top 20 by gain/loss · green = profit · red = loss
          </span>
        )}
      </div>

      {/* By-Type chart */}
      {view === 'by-type' && (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={byTypeData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={72} />
            <Tooltip formatter={(v: any) => fmt(v as number)} contentStyle={{ fontSize: 12 }} />
            <Legend />
            <Bar
              dataKey="value"
              name="Value"
              fill="#8884d8"
              stackId={variant === 'stacked' ? 'a' : undefined}
            />
            <Bar
              dataKey="gain"
              name="Gain / Loss"
              fill="#22c55e"
              stackId={variant === 'stacked' ? 'a' : undefined}
            />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* By-Ticker P&L chart (horizontal) */}
      {view === 'by-ticker' && (
        <ResponsiveContainer width="100%" height={tickerChartHeight}>
          <BarChart
            data={byTickerData}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={false} />
            <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={44} />
            <Tooltip
              formatter={(v: any) => [fmt(v as number), 'Gain / Loss']}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="gain_loss" name="Gain / Loss" radius={[0, 3, 3, 0]}>
              {byTickerData.map((entry, i) => (
                <Cell key={i} fill={entry.gain_loss >= 0 ? '#22c55e' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
