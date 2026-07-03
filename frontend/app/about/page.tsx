'use client'

import { APP_NAME, APP_TAGLINE, APP_VERSION } from '@/lib/constants'
import { Disclaimer } from '@/components/disclaimer'

function BrandMark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="36" height="36" rx="9" fill="hsl(161 93% 30%)" />
      <rect x="6"     y="24" width="5.5" height="8"  rx="1.5" fill="rgba(255,255,255,0.45)" />
      <rect x="15.25" y="18" width="5.5" height="14" rx="1.5" fill="rgba(255,255,255,0.70)" />
      <rect x="24.5"  y="12" width="5.5" height="20" rx="1.5" fill="white" />
      <polyline points="9,23 18,17 27.25,11" stroke="rgba(255,255,255,0.30)"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

// Inline SVG so the About page works without any icon library.
function FeatureIcon({ kind }: { kind: 'invest' | 'cash' | 'debt' | 'property' | 'privacy' | 'ai' }) {
  const common = {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className: 'h-5 w-5',
    'aria-hidden': true,
  }
  switch (kind) {
    case 'invest':
      return (
        <svg {...common}>
          <polyline points="3 17 9 11 13 15 21 7" />
          <polyline points="14 7 21 7 21 14" />
        </svg>
      )
    case 'cash':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <circle cx="12" cy="12.5" r="2.5" />
          <path d="M3 10h18M3 15h18" />
        </svg>
      )
    case 'debt':
      return (
        <svg {...common}>
          <path d="M3 21h18M5 21V10l7-5 7 5v11" />
          <path d="M9 21v-6h6v6" />
        </svg>
      )
    case 'property':
      return (
        <svg {...common}>
          <path d="M4 22V11l8-7 8 7v11z" />
          <path d="M9 22v-7h6v7" />
        </svg>
      )
    case 'privacy':
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      )
    case 'ai':
      return (
        <svg {...common}>
          <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      )
  }
}

interface Feature {
  kind: Parameters<typeof FeatureIcon>[0]['kind']
  title: string
  body: string
  status?: 'shipping' | 'coming'
}

const FEATURES: Feature[] = [
  {
    kind: 'invest',
    title: 'Investments',
    body: 'Holdings across stocks, ETFs, mutual funds, and crypto. Live prices from Yahoo Finance with Stooq as backup. Sector + type allocations, gain/loss, today’s P&L.',
    status: 'shipping',
  },
  {
    kind: 'cash',
    title: 'Cash & Banks',
    body: 'Add any number of checking, savings, brokerage, IRA, or 401(k) accounts with your own names. Balance edits feed the Net Worth tile in real time.',
    status: 'shipping',
  },
  {
    kind: 'ai',
    title: 'AI Insights (optional)',
    body: 'Bring your own Claude or OpenAI key. Generate portfolio-wide health reports or per-ticker buy/sell/hold analysis. Your key stays on the device.',
    status: 'shipping',
  },
  {
    kind: 'debt',
    title: 'Debt',
    body: 'Loans, mortgages, credit cards — tracked alongside assets so net worth reflects what you actually own.',
    status: 'shipping',
  },
  {
    kind: 'property',
    title: 'Property',
    body: 'Real estate with manual valuations, folded into your net worth alongside investments and cash.',
    status: 'shipping',
  },
  {
    kind: 'privacy',
    title: 'Private by design',
    body: 'No accounts, no cloud sync, no telemetry. The database lives in your app sandbox — nothing leaves the device unless you tap Export.',
    status: 'shipping',
  },
]

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10 space-y-8">


      {/* Hero */}
      <section className="text-center space-y-3">
        <div className="inline-flex">
          <BrandMark size={64} />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{APP_NAME}</h1>
        <p className="text-base sm:text-lg font-semibold text-emerald-600 dark:text-emerald-400">
          {APP_TAGLINE}
        </p>
        <p className="text-sm text-muted-foreground">
          Finally, a finance app that minds its own business.
        </p>
      </section>

      {/* Lead paragraph */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <p className="text-sm sm:text-base leading-relaxed text-foreground">
          <span className="font-semibold">{APP_NAME}</span> tracks your full
          financial picture &mdash; investments, holdings, debt, and property
          &mdash; completely offline. Your numbers stay on your device, always.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">Private by design</p>
            <p className="text-muted-foreground mt-0.5">On-device SQLite. No cloud. No accounts.</p>
          </div>
          <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-3 py-2">
            <p className="font-semibold text-blue-700 dark:text-blue-400">Powerful by nature</p>
            <p className="text-muted-foreground mt-0.5">Live prices, AI analysis, instant exports.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          What you can track
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {FEATURES.map(f => (
            <div key={f.title} className="rounded-lg border border-border bg-card p-4 flex gap-3">
              <div className="shrink-0 h-9 w-9 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <FeatureIcon kind={f.kind} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">{f.title}</h3>
                  {f.status === 'coming' && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy commitment */}
      <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 sm:p-6">
        <h2 className="font-semibold text-base sm:text-lg flex items-center gap-2">
          <span className="text-emerald-600 dark:text-emerald-400">🔒</span> Your data, your device
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground leading-relaxed">
          <li className="flex gap-2"><span className="text-emerald-600 dark:text-emerald-400 mt-0.5">•</span><span>The database lives inside the {APP_NAME} app sandbox. We can&apos;t see it. Nobody can.</span></li>
          <li className="flex gap-2"><span className="text-emerald-600 dark:text-emerald-400 mt-0.5">•</span><span>Market prices are fetched from Yahoo Finance / Stooq. Only ticker symbols leave the device.</span></li>
          <li className="flex gap-2"><span className="text-emerald-600 dark:text-emerald-400 mt-0.5">•</span><span>AI calls go directly from your device to Claude or OpenAI using <em>your</em> API key. We never see the prompt or the response.</span></li>
          <li className="flex gap-2"><span className="text-emerald-600 dark:text-emerald-400 mt-0.5">•</span><span>No analytics, no telemetry, no &ldquo;helpful&rdquo; background pings.</span></li>
          <li className="flex gap-2"><span className="text-emerald-600 dark:text-emerald-400 mt-0.5">•</span><span>Export your data any time as JSON or CSV — you own it.</span></li>
        </ul>
      </section>

      {/* Disclaimer & Terms */}
      <Disclaimer variant="full" />

      {/* Footer */}
      <footer className="text-center text-xs text-muted-foreground space-y-1 pt-2">
        <p>{APP_NAME} v{APP_VERSION}</p>
        <p>Made with care. Track everything. Share nothing.</p>
      </footer>
    </div>
  )
}
