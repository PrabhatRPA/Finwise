'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
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
function formatCompactCurrency(n: number): string {
  if (!isFinite(n)) return '$0'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n)
  } catch {
    return `$${Math.round(n).toLocaleString()}`
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
  // Seed from the cached snapshot so the first paint shows the previous net
  // worth (not $0). Hydrated on mount to stay SSR-safe.
  const [netWorthData, setNetWorthData] = useState<any>(null)
  useEffect(() => { setNetWorthData((prev: any) => prev ?? loadNetWorthCache()) }, [])
  // Balance editing now lives in the Accounts tab — the legacy modal was
  // removed when the Cash tile became non-tappable. The Accounts tab
  // handles full CRUD (name / type / institution / balance).
  // Controlled tab state so the mobile <select> and the desktop TabsList stay in sync.
  const [activeTab, setActiveTabState] = useState('holdings')

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
    <div className="mx-auto max-w-screen-xl px-3 sm:px-4 pt-3 pb-6 sm:pt-3 sm:pb-8 space-y-3 sm:space-y-4">

      {showOnboarding && (
        <WelcomeDemoModal
          busy={onboardingBusy}
          onLoadDemo={handleLoadDemoData}
          onSkip={handleSkipOnboarding}
        />
      )}

      {/* ── Page header ── single row: title + search.
          The subtitle moved into the navbar center. Refresh moved next to
          the View dropdown below. Upload Documents moved into the navbar. */}
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight leading-tight shrink-0">Dashboard</h1>
        <Input
          placeholder="Search holdings…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 text-sm w-full max-w-xs"
        />
      </header>

      {/* ── Hero net-worth card ── the top element per the design system:
          oversized rolling numeral + delta + history chart + range pills. */}
      <GrowthChart currentNetWorth={netWorthData?.net_worth ?? displayTotalValue} />

      {/* ── Stat strip ── Portfolio / Cash / Debt / Property / Net Worth.
          Each tile jumps to its tab (the holdings count moved onto the
          Holdings tab itself). */}
      <StatStrip
        items={[
          { label: 'Portfolio', value: formatCompactCurrency(displayTotalValue), tone: 'positive', onTap: () => setActiveTab('holdings') },
          { label: 'Cash', value: formatCompactCurrency(netWorthData?.cash ?? 0), tone: 'default', onTap: () => setActiveTab('accounts') },
          { label: 'Debt', value: formatCompactCurrency(netWorthData?.total_liabilities ?? 0), tone: (netWorthData?.total_liabilities ?? 0) > 0 ? 'negative' : 'neutral', onTap: () => setActiveTab('debts') },
          { label: 'Property', value: formatCompactCurrency(netWorthData?.real_estate ?? 0), tone: 'default', onTap: () => setActiveTab('properties') },
          { label: 'Net Worth', value: formatCompactCurrency(netWorthData?.net_worth ?? 0), tone: 'accent', onTap: () => setActiveTab('performance') },
        ]}
      />

      {/* ── Tabs ──
          The 7-button tab bar wraps horribly on a phone. On mobile we show
          a single <select> dropdown bound to the same Tabs state; on md+
          the original 7-col tab bar renders normally. */}
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
              <option value="holdings">{holdings.length > 0 ? `Holdings (${holdings.length})` : 'Holdings'}</option>
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
            onClick={async () => { await systemApi.forceRefreshPrices().catch(() => {}); fetchData(true, 8, true) }}
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
          <TabsList className="grid grid-cols-9 flex-1">
          <TabsTrigger value="holdings">
            Holdings
            {holdings.length > 0 && (
              <span className="ml-1.5 type-amount text-[10px] font-semibold px-1.5 py-px rounded-full bg-primary/15 text-primary">
                {holdings.length}
              </span>
            )}
          </TabsTrigger>
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
            onClick={async () => { await systemApi.forceRefreshPrices().catch(() => {}); fetchData(true, 8, true) }}
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
        </TabsContent>

        <TabsContent value="properties" className="space-y-4">
          <PropertiesTable onPropertyChanged={fetchData} />
        </TabsContent>

        <TabsContent value="allocation" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Asset Allocation</CardTitle></CardHeader>
              <CardContent><AssetAllocationDonutChart holdings={holdings} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Allocation by Type</CardTitle></CardHeader>
              <CardContent><AssetAllocationChart holdings={holdings} /></CardContent>
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
              <p className="text-sm text-muted-foreground">Historical snapshots recorded each time the dashboard loads</p>
            </CardHeader>
            <CardContent><NetWorthTrendChart /></CardContent>
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
  )
}
