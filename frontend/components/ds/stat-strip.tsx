'use client'

// Horizontal stat strip — uppercase micro-labels over color-coded tabular
// values (the ASSETS / LIABILITIES / NET CHANGE row from the design brief).

export interface StatItem {
  label: string
  value: string
  tone?: 'positive' | 'negative' | 'neutral' | 'default'
}

const TONE_CLASS: Record<NonNullable<StatItem['tone']>, string> = {
  positive: 'text-positive',
  negative: 'text-negative',
  neutral: 'text-neutral',
  default: 'text-foreground',
}

export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((s) => (
        <div
          key={s.label}
          className="rounded-ds-sm border border-border bg-card px-3 py-2.5 shadow-card min-w-0"
        >
          <p className="type-label truncate">{s.label}</p>
          <p className={`type-amount text-[15px] font-semibold mt-0.5 truncate ${TONE_CLASS[s.tone ?? 'default']}`}>
            {s.value}
          </p>
        </div>
      ))}
    </div>
  )
}
