'use client'

// Tiny inline sparkline for holdings rows: ~60×24pt, no axes/gridlines/labels,
// stroke tinted by trend with a subtle gradient fill under the line. Plain SVG
// path (not Recharts) so 30 rows cost nothing. With <2 usable points it renders
// a flat neutral line — never an empty gap.

import { useId } from 'react'

interface SparklineProps {
  data: number[]           // close prices, oldest → newest
  width?: number
  height?: number
  trend?: number           // signed change (e.g. today's %) — colors the line to
                           // match the row's figure. Omit to color by first→last.
}

export function Sparkline({ data, width = 60, height = 24, trend }: SparklineProps) {
  const gradId = useId()
  const points = (data ?? []).filter((v) => v != null && isFinite(v))
  const flat = points.length < 2

  // Direction drives the colour. Prefer the caller's trend (the same value the
  // row shows — today's % vs the previous close) so the tint always agrees with
  // the printed change; on a gap day the intraday shape can rise while the day
  // is down, so first→last is only a fallback when no trend is provided.
  const dir = (trend != null && isFinite(trend))
    ? (trend > 0 ? 1 : trend < 0 ? -1 : 0)
    : (flat ? 0 : (points[points.length - 1] >= points[0] ? 1 : -1))
  const stroke = dir > 0 ? 'hsl(var(--positive))'
    : dir < 0 ? 'hsl(var(--negative))'
    : 'hsl(var(--neutral))'

  let path = `M 0 ${height / 2} L ${width} ${height / 2}` // flat fallback
  let area = ''
  if (!flat) {
    const min = Math.min(...points)
    const max = Math.max(...points)
    const span = max - min || 1
    const pad = 2 // keep the stroke inside the box
    const stepX = width / (points.length - 1)
    const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2)
    path = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
    area = `${path} L ${width} ${height} L 0 ${height} Z`
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="shrink-0"
    >
      {!flat && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} />
        </>
      )}
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
