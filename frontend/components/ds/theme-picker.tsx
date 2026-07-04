'use client'

// Appearance picker with LIVE mini-preview thumbnails: each option renders a
// tiny mock dashboard card painted with that theme's literal token colors (not
// CSS vars — a preview must show its own theme regardless of the active one).
// System renders both halves split diagonally. Selection maps onto the
// existing ThemeProvider modes ('light' = Paper Light, 'dark' = Ledger Dark).

import { useTheme } from '@/lib/theme'
import { impactLight } from './haptics'

interface PreviewColors {
  bg: string
  card: string
  text: string
  sub: string
  gradA: string
  gradB: string
  up: string
}

const PAPER: PreviewColors = {
  bg: '#F7F6F2', card: '#FFFFFF', text: '#17191C', sub: '#B9B4A8',
  gradA: '#123B2B', gradB: '#206B4A', up: '#0E8F63',
}
const LEDGER: PreviewColors = {
  bg: '#0C0E10', card: '#15181C', text: '#F2F4F6', sub: '#3A404A',
  gradA: '#12291E', gradB: '#0C0E10', up: '#2FE08C',
}

// Tiny mock dashboard: hero gradient block with a "number" and delta bar,
// then two holding-row skeletons.
function MiniDash({ c }: { c: PreviewColors }) {
  return (
    <div className="w-full h-full p-1.5 flex flex-col gap-1" style={{ backgroundColor: c.bg }}>
      <div
        className="rounded-md p-1.5 flex-1"
        style={{ background: `linear-gradient(140deg, ${c.gradA}, ${c.gradB})` }}
      >
        <div className="h-1 w-6 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.4)' }} />
        <div className="h-2 w-12 rounded-full mt-1" style={{ backgroundColor: '#FFFFFF' }} />
        <div className="h-1 w-8 rounded-full mt-1" style={{ backgroundColor: c.up }} />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="rounded-md px-1.5 py-1 flex items-center gap-1" style={{ backgroundColor: c.card }}>
          <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: c.up, opacity: 0.35 }} />
          <div className="h-1 flex-1 rounded-full" style={{ backgroundColor: c.sub }} />
          <div className="h-1 w-4 rounded-full" style={{ backgroundColor: c.text, opacity: 0.7 }} />
        </div>
      ))}
    </div>
  )
}

// System option: Paper Light and Ledger Dark, split by a diagonal clip.
function MiniSystem() {
  return (
    <div className="relative w-full h-full">
      <div className="absolute inset-0"><MiniDash c={PAPER} /></div>
      <div className="absolute inset-0" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}>
        <MiniDash c={LEDGER} />
      </div>
    </div>
  )
}

const OPTIONS = [
  { mode: 'dark' as const, name: 'Ledger Dark', preview: <MiniDash c={LEDGER} /> },
  { mode: 'light' as const, name: 'Paper Light', preview: <MiniDash c={PAPER} /> },
  { mode: 'system' as const, name: 'System', preview: <MiniSystem /> },
]

export function ThemePicker() {
  const { mode, setMode } = useTheme()

  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map((o) => {
        const active = mode === o.mode
        return (
          <button
            key={o.mode}
            onClick={() => { setMode(o.mode); impactLight() }}
            aria-label={`${o.name} theme`}
            aria-pressed={active}
            className={`rounded-ds-sm overflow-hidden border-2 transition-colors text-left ${
              active ? 'border-primary' : 'border-border hover:border-foreground/30'
            }`}
          >
            <div className="h-20 w-full overflow-hidden">{o.preview}</div>
            <p className={`text-[11px] font-semibold text-center py-1.5 ${active ? 'text-primary' : 'text-muted-foreground'}`}>
              {o.name}
            </p>
          </button>
        )
      })}
    </div>
  )
}
