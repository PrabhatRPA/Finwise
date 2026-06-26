'use client'

import { Button } from '@/components/ui/button'

// First-run prompt offering to load the bundled sample portfolio so a new user
// can explore every feature, or start with a clean slate. Shown once per user
// (the dashboard tracks a "seen" flag). Presentational only — the dashboard
// owns the actual load/skip side effects.
export function WelcomeDemoModal({
  busy,
  onLoadDemo,
  onSkip,
}: {
  busy: boolean
  onLoadDemo: () => void
  onSkip: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl space-y-4">
        <div className="space-y-1.5 text-center">
          <h2 className="text-lg font-bold">Welcome to Nworth 👋</h2>
          <p className="text-sm text-muted-foreground">
            Want to explore with sample data first? Loading the demo portfolio
            fills the app with example holdings, accounts, debts, properties and
            18 months of history so you can get a feel for every feature.
          </p>
        </div>

        <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            You can remove it anytime with one tap in{' '}
            <span className="font-medium text-foreground">
              Profile → Manage exports &amp; backups → Remove all data
            </span>
            .
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <Button onClick={onLoadDemo} disabled={busy} className="w-full">
            {busy ? 'Loading sample data…' : 'Load demo data'}
          </Button>
          <Button
            variant="outline"
            onClick={onSkip}
            disabled={busy}
            className="w-full"
          >
            Start with a clean slate
          </Button>
        </div>
      </div>
    </div>
  )
}
