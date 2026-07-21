'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { getRegion, useRegion } from '@/lib/region'
import { usePrivacyBlur, setPrivacyBlur } from '@/lib/privacy-blur'
import { usePortfolioStore } from '@/lib/store'
import { holdingsApi, accountsApi, netWorthApi, systemApi, dataApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { WelcomeDemoModal } from '@/components/onboarding/welcome-demo-modal'
import { HoldingsTable } from '@/components/dashboard/holdings-table'
import { AssetAllocationChart } from '@/components/dashboard/allocation-chart'
import { PortfolioPerformanceChart } from '@/components/dashboard/performance-chart'
import { NetWorthTrendChart } from '@/components/dashboard/net-worth-chart'
import { AIAnalysisCard } from '@/components/dashboard/ai-analysis'
import { GrowthChart } from '@/components/dashboard/growth-chart'
import { AccountsTable } from '@/components/dashboard/accounts-table'
import { AssetAllocationDonutChart } from '@/components/dashboard/allocation-donut-chart'
import { TopHoldingsChart, CostBasisChart, ConcentrationChart } from '@/components/dashboard/allocation-extra-charts'
import { BenchmarkChart } from '@/components/dashboard/benchmark-chart'
import { DebtsTable } from '@/components/dashboard/debts-table'
import { WatchlistTable } from '@/components/dashboard/watchlist-table'
import { PropertiesTable } from '@/components/dashboard/properties-table'
import { PortfolioNews } from '@/components/dashboard/portfolio-news'
import { StatStrip } from '@/components/ds/stat-strip'
import { TruePerformanceChart } from '@/components/dashboard/true-performance-chart'
import { MoversChart } from '@/components/dashboard/movers-chart'
import { SectorHeatmap } from '@/components/dashboard/sector-heatmap'
import { DebtPayoffChart } from '@/components/dashboard/debt-payoff-chart'

// (The old 5-up SummaryStat tile row was replaced by the design-system
// StatStrip — ASSETS / LIABILITIES / NET CHANGE — under the hero card.)

// Last-known net-worth snapshot, cached so the dashboard shows real numbers on
// load instead of flashing $0 (which made the growth chart briefly render a
// red plunge-to-zero). Refreshed every time live data resolves.
const NET_WORTH_CACHE_KEY = 'last_net_worth_snapshot'

function loadNetWorthCache(): any {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(NET_WORTH_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveNetWorthCache(data: any) {
  if (typeof window === 'undefined' || !data) return
  try { window.localStorage.setItem(NET_WORTH_CACHE_KEY, JSON.stringify(data)) } catch {}
}

// Compact currency: 7221.5 → "$7.2K", 936558 → "$936.6K", 1500000 → "$1.5M".
// Keeps the summary row readable on a narrow phone (5 cells across).
// Currency/locale follow the market selected in Settings.
function formatCompactCurrency(n: number): string {
  const r = getRegion()
  if (!isFinite(n)) n = 0
  try {
    return new Intl.NumberFormat(r.locale, {
      style: 'currency',
      currency: r.currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n)
  } catch {
    return `${Math.round(n).toLocaleString()}`
  }
}

// First-run onboarding flag — per user so each account is prompted once.
function onboardingSeenKey(userId: number | string) {
  return `onboarding_seen_${userId}`
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const { holdings, accounts, totalValue, setHoldings, calculatePortfolio } = usePortfolioStore()

  // Only block the page on the very first load (store is empty).
  // On subsequent visits (e.g. returning from /documents) the store has data,
  // so we show it immediately and refresh prices silently in the background.
  const [isLoading, setIsLoading] = useState(holdings.length === 0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // Ref so the clear ("✕") button can return focus to the field after wiping it.
  const searchRef = useRef<HTMLInputElement>(null)
  // Privacy blur for sensitive figures (net worth + balances). See lib/privacy-blur.ts.
  const blurValues = usePrivacyBlur()
  // Seed from the cached snapshot so the first paint shows the previous net
  // worth (not $0). Hydrated on mount to stay SSR-safe.
  const [netWorthData, setNetWorthData] = useState<any>(null)
  useEffect(() => { setNetWorthData((prev: any) => prev ?? loadNetWorthCache()) }, [])
  // Balance editing now lives in the Accounts tab — the legacy modal was
  // removed when the Cash tile became non-tappable. The Accounts tab
  // handles full CRUD (name / type / institution / balance).
  // Controlled tab state so the mobile <select> and the desktop TabsList stay in sync.
  const [activeTab, setActiveTabState] = useState('holdings')
  // Subscribe to the market/currency setting so all money on screen reformats
  // live when the user changes it (formatters read the region themselves).
  useRegion()

  // Two-way ?tab= sync with the floating tab bar: URL param is the source of
  // truth. In-page tab changes write it back (replaceState — no history spam)
  // and broadcast so the bar's active state updates.
  const setActiveTab = (t: string) => {
    setActiveTabState(t)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', t)
      window.history.replaceState(null, '', url.toString())
      window.dispatchEvent(new Event('nworth:tab-change'))
    } catch { /* ignore */ }
  }
  // When an iCloud pull lands (background sync), silently refetch so the
  // synced data appears on screen without any user action.
  useEffect(() => {
    const onSynced = () => fetchData(true)
    window.addEventListener('nworth:data-synced', onSynced)
    return () => window.removeEventListener('nworth:data-synced', onSynced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const read = () => {
      try {
        const t = new URLSearchParams(window.location.search).get('tab')
        if (t) setActiveTabState(t)
      } catch { /* ignore */ }
    }
    read()
    window.addEventListener('nworth:tab-change', read)
    window.addEventListener('popstate', read)
    return () => { window.removeEventListener('nworth:tab-change', read); window.removeEventListener('popstate', read) }
  }, [])

  // Scroll to the tabs region whenever activeTab changes — driven by state
  // (not by guessing when router.push/URL sync has settled), so it's a
  // single smooth scroll per switch, identical for every tab. Skipped on
  // the very first render so opening the dashboard doesn't auto-scroll,
  // and skipped entirely on tablet/desktop (md+) where everything is
  // already on screen and auto-scrolling just feels like the page jumping.
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    if (window.matchMedia('(min-width: 768px)').matches) return
    // iPad mini portrait is 744pt — under the md breakpoint — so also
    // detect iPad directly (iPadOS reports "Macintosh" + multitouch).
    const ua = navigator.userAgent
    if (/iPad/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) return
    if (activeTab === 'holdings') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    document.getElementById('dashboard-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [activeTab])


  // First-run onboarding: offer to load the demo dataset. Shown once per user,
  // only when their account is still empty (so a returning user whose flag was
  // lost isn't prompted over real data).
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingBusy, setOnboardingBusy] = useState(false)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login')
      return
    }
    if (!authLoading && isAuthenticated) {
      // silent=true → don't show full-page spinner when store already has data
      fetchData(holdings.length > 0)
    }
  }, [authLoading, isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cached-first load:
  //   1. Pull holdings with refresh_prices=false (instant — uses persisted values).
  //   2. If that returned non-empty data, render the table immediately and
  //      dismiss the big spinner. Otherwise keep the spinner up — showing
  //      an empty dashboard while we wait for live data is worse UX than
  //      a spinner.
  //   3. Fire a second holdings call with refresh_prices=true to get fresh
  //      prices. Accounts load in parallel.
  // forceRefresh=true skips the cached pre-fetch.
  const fetchData = async (silent = false, _retries = 8, forceRefresh = false) => {
    if (silent) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }

    // When we schedule a retry, we must NOT dismiss isLoading in the finally
    // block — otherwise the dashboard flashes from spinner → empty dashboard →
    // spinner each retry cycle. This flag tracks that.
    let willRetry = false

    try {
      // Phase 1: cached holdings — instant.
      if (!forceRefresh) {
        try {
          const cachedResp = await holdingsApi.getAll(false)
          const cached = cachedResp.data.holdings ?? []
          if (cached.length > 0) {
            setHoldings(cached)
            setIsLoading(false)
            if (!silent) setIsRefreshing(true)
          }
        } catch {
          // Network glitch — fall through to the live call which has its
          // own retry loop.
        }
      }

      // Phase 2: accounts load in parallel — independent of the price fetch.
      const accountsPromise = accountsApi.getAll().then(r => {
        if (r.data.accounts) usePortfolioStore.getState().setAccounts(r.data.accounts)
      }).catch(() => {})

      // Phase 3: live holdings — replaces cached values when prices arrive.
      const liveResp = await holdingsApi.getAll(true)
      setHoldings(liveResp.data.holdings ?? [])

      await accountsPromise
      calculatePortfolio()

      const netWorthResp = await netWorthApi.getCurrent()
      // Stash the live portfolio value alongside the net-worth figures so the
      // next cold start can paint both tiles + the growth chart from cache.
      const snapshot = { ...netWorthResp.data, totalValue: usePortfolioStore.getState().totalValue }
      setNetWorthData(snapshot)
      saveNetWorthCache(snapshot)

      netWorthApi.createRecord().catch(() => {})
    } catch (error: any) {
      // Network errors during initial load (sidecar still warming up): retry
      // quietly. Pass silent=true so subsequent attempts don't flip isLoading
      // on/off — that's what was causing the flash between spinner and
      // empty dashboard.
      if (!error.response && _retries > 0) {
        willRetry = true
        setTimeout(() => fetchData(true, _retries - 1, forceRefresh), 2500)
        return
      }
      console.error('Error fetching data:', error)
    } finally {
      setIsRefreshing(false)
      if (!willRetry) setIsLoading(false)
    }
  }

  // Decide whether to surface the first-run onboarding popup. Runs once the
  // initial load settles: prompt only if this user hasn't seen it and has no
  // holdings or accounts yet.
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return
    if (typeof window === 'undefined') return
    const seen = window.localStorage.getItem(onboardingSeenKey(user.user_id))
    if (!seen && holdings.length === 0 && accounts.length === 0) {
      setShowOnboarding(true)
    }
  }, [isLoading, isAuthenticated, user, holdings.length, accounts.length])

  const markOnboardingSeen = () => {
    if (typeof window !== 'undefined' && user) {
      window.localStorage.setItem(onboardingSeenKey(user.user_id), '1')
    }
  }

  const handleLoadDemoData = async () => {
    setOnboardingBusy(true)
    try {
      const res = await fetch('/demo-data.json', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Could not load demo file (HTTP ${res.status}).`)
      const text = await res.text()
      const file = new File([text], 'demo-data.json', { type: 'application/json' })
      await dataApi.importFullData(file, 'replace')
      markOnboardingSeen()
      setShowOnboarding(false)
      await fetchData(false, 8, true)
    } catch {
      // Leave the popup open on failure so the user can retry or skip.
    } finally {
      setOnboardingBusy(false)
    }
  }

  const handleSkipOnboarding = () => {
    markOnboardingSeen()
    setShowOnboarding(false)
  }

  if (authLoading || (isLoading && isAuthenticated)) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading your portfolio…</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  // Portfolio = holdings + investment-account balances (brokerage / IRA / 401k
  // / HSA / pension). That figure is computed by the net-worth engine as
  // `investments`, so prefer it; the store's `totalValue` is holdings-only and
  // would otherwise understate the tile. Fall back to it (then the cached
  // snapshot) only so a cold start never momentarily reads $0.
  const displayTotalValue =
    netWorthData?.investments ?? (totalValue || netWorthData?.totalValue || 0)

  return (
    <div className={`mx-auto max-w-screen-xl px-3 sm:px-4 pt-1 pb-6 sm:pb-8 space-y-3 sm:space-y-4 ${blurValues ? 'privacy-blur' : ''}`}>

      {showOnboarding && (
        <WelcomeDemoModal
          busy={onboardingBusy}
          onLoadDemo={handleLoadDemoData}
          onSkip={handleSkipOnboarding}
        />
      )}

      {/* ── Page header ── brand + compact search on one line (the old top
          navbar is gone; this row is the app's masthead now). */}
      <header className="flex items-center gap-2.5">
        <div className="flex items-center gap-2 shrink-0">
          <svg width="24" height="24" viewBox="0 0 36 36" aria-hidden="true">
            <rect width="36" height="36" rx="9" fill="hsl(var(--primary))" />
            <rect x="6" y="24" width="5.5" height="8" rx="1.5" fill="rgba(255,255,255,0.45)" />
            <rect x="15.25" y="18" width="5.5" height="14" rx="1.5" fill="rgba(255,255,255,0.70)" />
            <rect x="24.5" y="12" width="5.5" height="20" rx="1.5" fill="#fff" />
          </svg>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight leading-tight">Nworth</h1>
        </div>
        <div className="relative flex-1 min-w-0 max-w-xs ml-auto">
          <Input
            ref={searchRef}
            placeholder="Search holdings"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`h-9 text-sm w-full ${searchQuery ? 'pr-10' : ''}`}
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => { setSearchQuery(''); searchRef.current?.focus() }}
              className="absolute right-0 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center
                text-muted-foreground hover:text-foreground"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        {/* Privacy toggle: blur/unblur net worth + balance figures for viewing
            in public. State persists via lib/privacy-blur.ts. */}
        <button
          type="button"
          role="switch"
          aria-checked={blurValues}
          aria-label={blurValues ? 'Show balances' : 'Hide balances'}
          title={blurValues ? 'Show balances' : 'Hide balances'}
          onClick={() => setPrivacyBlur(!blurValues)}
          className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md border border-border
            text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          {blurValues ? (
            // eye-off
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <path d="M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          ) : (
            // eye
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </header>

      {/* ── Hero net-worth card ── the top element per the design system:
          oversized rolling numeral + delta + history chart + range pills. */}
      <div className="blur-chart-money">
        <GrowthChart currentNetWorth={netWorthData?.net_worth ?? displayTotalValue} />
      </div>

      {/* ── Stat strip ── Portfolio / Cash / Debt / Property / Net Worth.
          Each tile jumps to its tab (the holdings count moved onto the
          Holdings tab itself). */}
      <StatStrip
        items={[
          { label: 'Portfolio', value: formatCompactCurrency(displayTotalValue), tone: 'positive', sensitive: true, onTap: () => setActiveTab('holdings') },
          { label: 'Cash', value: formatCompactCurrency(netWorthData?.cash ?? 0), tone: 'default', sensitive: true, onTap: () => setActiveTab('accounts') },
          { label: 'Debt', value: formatCompactCurrency(netWorthData?.total_liabilities ?? 0), tone: (netWorthData?.total_liabilities ?? 0) > 0 ? 'negative' : 'neutral', sensitive: true, onTap: () => setActiveTab('debts') },
          { label: 'Property', value: formatCompactCurrency(netWorthData?.real_estate ?? 0), tone: 'default', sensitive: true, onTap: () => setActiveTab('properties') },
          { label: 'Net Worth', value: formatCompactCurrency(netWorthData?.net_worth ?? 0), tone: 'accent', sensitive: true, onTap: () => setActiveTab('performance') },
        ]}
      />

      {/* ── Tabs ──
          The 7-button tab bar wraps horribly on a phone. On mobile we show
          a single <select> dropdown bound to the same Tabs state; on md+
          the original 7-col tab bar renders normally. */}
      {/* min-h on phones: short tabs (debts / watchlist / properties…) must
          still leave enough page height for the tab-switch scroll to land
          fully, matching the taller tabs' behavior. */}
      <div id="dashboard-tabs" className="min-h-[85vh] md:min-h-0" style={{ scrollMarginTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Mobile: View dropdown + Refresh button side-by-side */}
        <div className="md:hidden mb-3 flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium block mb-1">
              View
            </label>
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background text-foreground px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="holdings">Holdings</option>
              <option value="accounts">Cash &amp; Accounts</option>
              <option value="watchlist">Watchlist</option>
              <option value="debts">Debts</option>
              <option value="properties">Properties</option>
              <option value="allocation">Allocation</option>
              <option value="performance">Performance</option>
              <option value="news">News</option>
              <option value="ai">AI Insights</option>
            </select>
          </div>
          <Button
            size="sm"
            onClick={async () => { import('@/lib/native/icloud').then(m => m.reconcileICloud()).catch(() => {}); await systemApi.forceRefreshPrices().catch(() => {}); fetchData(true, 8, true) }}
            disabled={isRefreshing}
            className="h-10 shrink-0"
          >
            {isRefreshing ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full inline-block" />
                <span className="sr-only">Refreshing</span>
              </span>
            ) : 'Refresh'}
          </Button>
        </div>

        {/* Tablet + desktop: tab bar + refresh button */}
        <div className="hidden md:flex items-center gap-2 mb-3">
          {/* Scrollable flex row (was grid-cols-9, which squeezed labels into
              each other at landscape/tablet widths). Triggers keep natural
              width and never wrap; the list scrolls if space runs out. */}
          <TabsList className="flex flex-1 overflow-x-auto justify-start [&>button]:shrink-0 [&>button]:whitespace-nowrap">
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="accounts">Cash</TabsTrigger>
          <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
          <TabsTrigger value="debts">Debts</TabsTrigger>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="allocation">Allocation</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="news">News</TabsTrigger>
          <TabsTrigger value="ai">AI Insights</TabsTrigger>
        </TabsList>
          <Button
            size="sm"
            onClick={async () => { import('@/lib/native/icloud').then(m => m.reconcileICloud()).catch(() => {}); await systemApi.forceRefreshPrices().catch(() => {}); fetchData(true, 8, true) }}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full inline-block" />
                Updating…
              </span>
            ) : 'Refresh'}
          </Button>
        </div>

        <TabsContent value="holdings" className="space-y-4">
          <HoldingsTable holdings={holdings} onHoldingAdded={fetchData} searchQuery={searchQuery} />
        </TabsContent>

        <TabsContent value="accounts" className="space-y-4">
          <AccountsTable accounts={accounts} onAccountChanged={fetchData} />
        </TabsContent>

        <TabsContent value="watchlist" className="space-y-4">
          <WatchlistTable />
        </TabsContent>

        <TabsContent value="debts" className="space-y-4">
          <DebtsTable onDebtChanged={fetchData} />
          <div className="blur-chart-money">
            <DebtPayoffChart />
          </div>
        </TabsContent>

        <TabsContent value="properties" className="space-y-4">
          <PropertiesTable onPropertyChanged={fetchData} />
        </TabsContent>

        <TabsContent value="allocation" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Asset Allocation</CardTitle></CardHeader>
              <CardContent className="blur-chart-money"><AssetAllocationDonutChart holdings={holdings} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Allocation by Sector</CardTitle></CardHeader>
              <CardContent className="blur-chart-money"><AssetAllocationChart holdings={holdings} /></CardContent>
            </Card>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Holdings</CardTitle>
                <p className="text-sm text-muted-foreground">Largest positions by market value</p>
              </CardHeader>
              <CardContent><TopHoldingsChart holdings={holdings} /></CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Concentration Risk</CardTitle>
                <p className="text-sm text-muted-foreground">Weight per holding — red = top contributors</p>
              </CardHeader>
              <CardContent><ConcentrationChart holdings={holdings} /></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Cost Basis vs Current Value</CardTitle>
              <p className="text-sm text-muted-foreground">Unrealized gain/loss by security type</p>
            </CardHeader>
            <CardContent><CostBasisChart holdings={holdings} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Portfolio Performance</CardTitle>
              <p className="text-sm text-muted-foreground">Your portfolio&apos;s value over time, rebuilt from each holding&apos;s price history</p>
            </CardHeader>
            <CardContent className="blur-chart-money"><TruePerformanceChart holdings={holdings} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Today&apos;s Movers</CardTitle></CardHeader>
            <CardContent><MoversChart holdings={holdings} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Sector Map</CardTitle></CardHeader>
            <CardContent className="blur-chart-money"><SectorHeatmap holdings={holdings} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Holdings Gain / Loss</CardTitle></CardHeader>
            <CardContent><PortfolioPerformanceChart holdings={holdings} /></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Portfolio vs Market Benchmarks</CardTitle>
              <p className="text-sm text-muted-foreground">% return comparison — your portfolio vs S&P 500, US market, international stocks, and NASDAQ 100</p>
            </CardHeader>
            <CardContent><BenchmarkChart /></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Portfolio · Debt · Net Worth Trends</CardTitle>
              <p className="text-sm text-muted-foreground">A snapshot is saved each day you open the app — open it daily to keep this history complete (missed days can&apos;t be backfilled)</p>
            </CardHeader>
            <CardContent className="blur-chart-money"><NetWorthTrendChart /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="news" className="space-y-4">
          <PortfolioNews holdings={holdings} />
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <AIAnalysisCard holdings={holdings} />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  )
}
