'use client'

// Premium holdings row: leading rounded-square category glyph on a tinted
// background · ticker + shares secondary line · inline mini sparkline ·
// trailing current value + % change stacked (colored by direction).
// Tap anywhere on the row opens the ticker detail page; Edit/Delete stay in
// the little trailing actions column supplied by the parent.

import { useState } from 'react'
import { Sparkline } from './sparkline'
import { formatCurrency } from '@/lib/utils'

const TYPE_GLYPH: Record<string, { glyph: string; tint: string }> = {
  stock:       { glyph: '▲', tint: 'hsl(var(--positive) / 0.14)' },
  etf:         { glyph: '◆', tint: 'hsl(210 80% 55% / 0.14)' },
  mutual_fund: { glyph: '◈', tint: 'hsl(260 60% 60% / 0.14)' },
  bond:        { glyph: '▤', tint: 'hsl(40 80% 50% / 0.16)' },
  crypto:      { glyph: '◎', tint: 'hsl(30 95% 55% / 0.16)' },
  reit:        { glyph: '⌂', tint: 'hsl(180 55% 45% / 0.16)' },
}

// Free, keyless logo CDNs, tried in order. Failures are remembered for the
// session so a 404 never re-fires on re-render; when every source fails the
// tile falls back to the category glyph.
function logoSources(ticker: string): string[] {
  const t = encodeURIComponent(ticker.toUpperCase())
  return [
    `https://assets.parqet.com/logos/symbol/${t}?format=png&size=64`,
    `https://financialmodelingprep.com/image-stock/${t}.png`,
  ]
}
const _logoFailed = new Set<string>()   // "TICKER:idx" that 404'd this session

export function TickerLogo({ ticker, glyph, tint, size = 'md' }: {
  ticker: string; glyph: string; tint: string; size?: 'sm' | 'md'
}) {
  const srcs = logoSources(ticker)
  const firstAlive = srcs.findIndex((_, i) => !_logoFailed.has(`${ticker}:${i}`))
  const [idx, setIdx] = useState(firstAlive === -1 ? srcs.length : firstAlive)
  const box = size === 'sm' ? 'h-7 w-7 rounded-md' : 'h-10 w-10 rounded-ds-sm'

  if (idx >= srcs.length) {
    return (
      <span
        className={`${box} flex items-center justify-center ${size === 'sm' ? 'text-xs' : 'text-base'} shrink-0 text-foreground/80`}
        style={{ backgroundColor: tint }}
        aria-hidden="true"
      >
        {glyph}
      </span>
    )
  }
  return (
    <span
      className={`${box} overflow-hidden shrink-0 flex items-center justify-center bg-white`}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={srcs[idx]}
        alt=""
        loading="lazy"
        className="h-full w-full object-contain p-1"
        onError={() => {
          _logoFailed.add(`${ticker}:${idx}`)
          setIdx(i => i + 1)
        }}
      />
    </span>
  )
}

// Category glyph lookup, exported so the desktop table can reuse the same
// logo-with-fallback tile.
export function typeGlyph(securityType?: string) {
  return TYPE_GLYPH[securityType as string] ?? TYPE_GLYPH.stock
}

export interface HoldingRowProps {
  holding: any
  spark?: number[]                 // close series for the sparkline
  onOpen?: (ticker: string) => void
  actions?: React.ReactNode        // Edit/Delete cluster from the parent
  display?: 'value' | 'price'      // trailing figure: position value or share price
}

export function HoldingRow({ holding: h, spark, onOpen, actions, display = 'value' }: HoldingRowProps) {
  const t = TYPE_GLYPH[h.security_type as string] ?? TYPE_GLYPH.stock
  const pct = h.today_gain_loss_percent ?? 0
  const pctClass = pct > 0 ? 'text-positive' : pct < 0 ? 'text-negative' : 'text-neutral'
  const value = display === 'price' ? (h.current_price ?? 0) : (h.current_value ?? 0)

  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <button
        onClick={() => onOpen?.(h.ticker)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
        aria-label={`${h.ticker}, ${formatCurrency(value)}, ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(2)} percent today`}
      >
        {/* Real ticker logo (free CDNs) with glyph-tile fallback */}
        <TickerLogo ticker={(h.ticker || '').toUpperCase()} glyph={t.glyph} tint={t.tint} />

        {/* Name + shares */}
        <span className="min-w-0 flex-1">
          <span className="block type-amount font-semibold text-[15px] truncate">{h.ticker}</span>
          <span className="block text-xs text-muted-foreground truncate">
            {h.shares ?? 0} sh · avg {formatCurrency(h.average_cost ?? 0)}
          </span>
        </span>

        {/* Mini sparkline */}
        <Sparkline data={spark ?? []} />

        {/* Value + today % stacked */}
        <span className="text-right shrink-0 w-[92px]">
          <span className="block type-amount font-semibold text-[15px]">{formatCurrency(value)}</span>
          <span className={`block type-amount text-xs font-medium ${pctClass}`}>
            {pct > 0 ? '+' : ''}{pct.toFixed(2)}%
          </span>
        </span>
      </button>

      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}
