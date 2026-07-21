'use client'

// Horizontal stat strip — uppercase micro-labels over color-coded tabular
// values (the ASSETS / LIABILITIES / NET CHANGE row from the design brief).

export interface StatItem {
  label: string
  value: string
  tone?: 'positive' | 'negative' | 'neutral' | 'accent' | 'default'
  onTap?: () => void   // optional: tile navigates (e.g. to its dashboard tab)
  // Marks the value as a sensitive figure. The blur itself is driven by an
  // ancestor `.privacy-blur` (see lib/privacy-blur.ts); this only tags the
  // element, so the strip stays unaffected wherever privacy blur isn't used.
  sensitive?: boolean
}

const TONE_CLASS: Record<NonNullable<StatItem['tone']>, string> = {
  positive: 'text-positive',
  negative: 'text-negative',
  neutral: 'text-neutral',
  accent: 'text-primary',
  default: 'text-foreground',
}

export function StatStrip({ items }: { items: StatItem[] }) {
  // Density scales with the column count so a 5-up strip still fits a phone.
  const dense = items.length >= 5
  return (
    <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((s) => (
        // Rendered as a <div> even when tappable so the global 44px button rule
        // doesn't inflate the tiles (same trick as the old SummaryStat).
        <div
          key={s.label}
          onClick={s.onTap}
          role={s.onTap ? 'button' : undefined}
          aria-label={s.onTap ? `${s.label}: ${s.value}. Open ${s.label}.` : undefined}
          className={`rounded-ds-sm border border-border bg-card shadow-card min-w-0 select-none ${
            dense ? 'px-1.5 py-1.5 sm:px-3 sm:py-2.5' : 'px-3 py-2.5'
          } ${s.onTap ? 'cursor-pointer hover:bg-accent/30 active:bg-accent/60 transition-colors' : ''}`}
        >
          <p className={`type-label truncate ${dense ? '!text-[9px] sm:!text-[11px]' : ''}`}>{s.label}</p>
          <p className={`type-amount font-semibold mt-0.5 truncate ${dense ? 'text-xs sm:text-[15px]' : 'text-[15px]'} ${TONE_CLASS[s.tone ?? 'default']} ${s.sensitive ? 'sensitive-amount' : ''}`}>
            {s.value}
          </p>
        </div>
      ))}
    </div>
  )
}
