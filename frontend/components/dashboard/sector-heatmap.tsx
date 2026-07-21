'use client'

// Sector Heatmap — a market-map of YOUR portfolio: treemap tiles sized by
// position value per sector, colored green/red by the sector's value-weighted
// day change (intensity scales with magnitude, capped at ±3%).

import { useMemo } from 'react'
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { sectorFor } from '@/lib/sectors'

interface SectorTile {
  name: string
  size: number     // Σ current_value
  pct: number      // value-weighted today %
}

function tileColor(pct: number): string {
  const capped = Math.max(-3, Math.min(3, pct))
  const alpha = 0.22 + (Math.abs(capped) / 3) * 0.65   // 0.22 → 0.87
  return capped >= 0
    ? `hsl(var(--positive) / ${alpha.toFixed(2)})`
    : `hsl(var(--negative) / ${alpha.toFixed(2)})`
}

// Custom tile renderer (Recharts passes geometry + our payload).
function Tile(props: any) {
  const { x, y, width, height, name, pct } = props
  if (width <= 0 || height <= 0 || name == null) return null
  const showText = width > 64 && height > 34
  const showPct = width > 64 && height > 50
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={6}
        fill={tileColor(pct ?? 0)} stroke="hsl(var(--background))" strokeWidth={2} />
      {showText && (
        <text x={x + 8} y={y + 18} fill="hsl(var(--foreground))" fontSize={11} fontWeight={600}>
          {String(name).length > Math.floor(width / 8) ? String(name).slice(0, Math.floor(width / 8)) + '…' : name}
        </text>
      )}
      {showPct && (
        <text x={x + 8} y={y + 34} fill="hsl(var(--foreground))" fontSize={10} opacity={0.85}
          fontFamily="ui-monospace, SF Mono, Menlo, monospace">
          {(pct ?? 0) >= 0 ? '+' : ''}{(pct ?? 0).toFixed(2)}%
        </text>
      )}
    </g>
  )
}

export function SectorHeatmap({ holdings }: { holdings: any[] }) {
  const tiles: SectorTile[] = useMemo(() => {
    const bySector = new Map<string, { value: number; weighted: number }>()
    for (const h of holdings) {
      // Prefer a stored sector; otherwise classify from the bundled ticker map
      // (real holdings rarely store one). Unmapped/custom symbols → "Other".
      const sector = ((h.sector || sectorFor(h) || 'Other') as string).trim() || 'Other'
      const value = Number(h.current_value ?? 0)
      if (value <= 0) continue
      const pct = Number(h.today_gain_loss_percent ?? 0)
      const cur = bySector.get(sector) ?? { value: 0, weighted: 0 }
      cur.value += value
      cur.weighted += pct * value
      bySector.set(sector, cur)
    }
    return Array.from(bySector.entries())
      .map(([name, v]) => ({ name, size: v.value, pct: v.value > 0 ? v.weighted / v.value : 0 }))
      .sort((a, b) => b.size - a.size)
  }, [holdings])

  if (tiles.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Add holdings to see your sector map.</p>
  }

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={240}>
        <Treemap
          data={tiles as any}
          dataKey="size"
          nameKey="name"
          content={<Tile />}
          isAnimationActive={false}
        >
          <Tooltip
            formatter={(v: any, _n: any, item: any) => [
              `${formatCurrency(v as number)} · ${(item?.payload?.pct ?? 0) >= 0 ? '+' : ''}${(item?.payload?.pct ?? 0).toFixed(2)}% today`,
              item?.payload?.name,
            ]}
            contentStyle={{ fontSize: 12, borderRadius: 12 }}
          />
        </Treemap>
      </ResponsiveContainer>
      {/* Legend — small tiles can't fit their label, so every sector is
          always identifiable here (name · value · today %). */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {tiles.map((t) => (
          <span key={t.name} className="inline-flex items-center gap-1.5 text-[11px]">
            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: tileColor(t.pct) }} />
            <span className="text-muted-foreground">{t.name}</span>
            <span className={`type-amount font-semibold ${t.pct > 0 ? 'text-positive' : t.pct < 0 ? 'text-negative' : 'text-neutral'}`}>
              {t.pct >= 0 ? '+' : ''}{t.pct.toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Tile size = position value · color = today’s value-weighted move (±3% caps the intensity).
      </p>
    </div>
  )
}
