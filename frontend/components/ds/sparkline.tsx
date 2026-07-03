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
}

export function Sparkline({ data, width = 60, height = 24 }: SparklineProps) {
  const gradId = useId()
  const points = (data ?? []).filter((v) => v != null && isFinite(v))
  const flat = points.length < 2

  const up = !flat && points[points.length - 1] >= points[0]
  const stroke = flat
    ? 'hsl(var(--neutral))'
    : up ? 'hsl(var(--positive))' : 'hsl(var(--negative))'

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
