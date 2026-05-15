'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { usePortfolioStore } from '@/lib/store'
import { holdingsApi, accountsApi, netWorthApi, systemApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { HoldingsTable } from '@/components/dashboard/holdings-table'
import { AssetAllocationChart } from '@/components/dashboard/allocation-chart'
import { PortfolioPerformanceChart } from '@/components/dashboard/performance-chart'
import { NetWorthTrendChart } from '@/components/dashboard/net-worth-chart'
import { AIAnalysisCard } from '@/components/dashboard/ai-analysis'
import { AssetAllocationDonutChart } from '@/components/dashboard/allocation-donut-chart'
import { TopHoldingsChart, CostBasisChart, ConcentrationChart } from '@/components/dashboard/allocation-extra-charts'
import { BenchmarkChart } from '@/components/dashboard/benchmark-chart'
import { DebtsTable } from '@/components/dashboard/debts-table'
import { WatchlistTable } from '@/components/dashboard/watchlist-table'
import { PropertiesTable } from '@/components/dashboard/properties-table'

export default function DashboardPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { holdings, accounts, totalValue, setHoldings, calculatePortfolio } = usePortfolioStore()

  // Only block the page on the very first load (store is empty).
  // On subsequent visits (e.g. returning from /documents) the store has data,
  // so we show it immediately and refresh prices silently in the background.
  const [isLoading, setIsLoading] = useState(holdings.length === 0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [netWorthData, setNetWorthData] = useState<any>(null)
  const [showBalanceModal, setShowBalanceModal] = useState(false)
  const [balanceEdits, setBalanceEdits] = useState<Record<number, string>>({})
  const [savingBalances, setSavingBalances] = useState(false)

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
  //   2. Render the table immediately, then in the background fire another
  //      holdings call with refresh_prices=true to update live prices.
  //   3. Accounts + net worth are fetched in parallel with the cached read.
  // forceRefresh=true (e.g. the user clicked the Refresh button) skips the
  // cached pre-fetch and goes straight to the live call.
  const fetchData = async (silent = false, _retries = 8, forceRefresh = false) => {
    if (silent) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    try {
      // 1. Cached holdings — instant render path. Drop the big spinner as
      //    soon as anything (even 0 rows) comes back so the user sees the
      //    table layout immediately.
      let renderedSomething = false
      if (!forceRefresh) {
        try {
          const cachedResp = await holdingsApi.getAll(false)
          setHoldings(cachedResp.data.holdings ?? [])
          renderedSomething = true
          setIsLoading(false)
          // Live fetch is now a background refresh.
          if (!silent) setIsRefreshing(true)
        } catch {
          // If the cached read fails (network glitch, cold backend), fall
          // through to the live call which has its own retry loop.
        }
      }

      // Accounts can load in parallel — they don't depend on the price fetch.
      const accountsPromise = accountsApi.getAll().then(r => {
        if (r.data.accounts) usePortfolioStore.getState().setAccounts(r.data.accounts)
      }).catch(() => {})

      // 2. Live holdings — replaces cached values when prices arrive.
      const liveResp = await holdingsApi.getAll(true)
      setHoldings(liveResp.data.holdings ?? [])
      if (!renderedSomething) setIsLoading(false)

      await accountsPromise
      calculatePortfolio()

      const netWorthResp = await netWorthApi.getCurrent()
      setNetWorthData(netWorthResp.data)

      netWorthApi.createRecord().catch(() => {})
    } catch (error: any) {
      // On desktop the sidecar backend may still be warming up — retry on
      // network errors so the user never has to click Refresh manually.
      if (!error.response && _retries > 0) {
        setTimeout(() => fetchData(silent, _retries - 1, forceRefresh), 2500)
        return
      }
      console.error('Error fetching data:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  const openBalanceModal = () => {
    const initial: Record<number, string> = {}
    accounts.forEach(a => { initial[a.id] = String(a.balance ?? 0) })
    setBalanceEdits(initial)
    setShowBalanceModal(true)
  }

  const saveBalances = async () => {
    setSavingBalances(true)
    try {
      await Promise.all(
        accounts.map(a =>
          accountsApi.updateBalance(a.id, Number(balanceEdits[a.id] ?? a.balance))
        )
      )
      setShowBalanceModal(false)
      await fetchData()
    } catch {
      alert('Failed to save balances. Check the backend is running.')
    } finally {
      setSavingBalances(false)
    }
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

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-6">

      {/* ── Balance Edit Modal ── */}
      {showBalanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowBalanceModal(false)} />
          <div className="relative bg-card rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 border border-border">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Edit Account Balances</h2>
              <button onClick={() => setShowBalanceModal(false)} className="text-muted-foreground hover:text-foreground text-2xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              {accounts.map(a => (
                <div key={a.id}>
                  <label className="block text-sm font-medium mb-1">
                    {a.account_name}{' '}
                    <span className="text-muted-foreground font-normal">({a.account_type})</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={balanceEdits[a.id] ?? ''}
                      onChange={e => setBalanceEdits(prev => ({ ...prev, [a.id]: e.target.value }))}
                      className="border border-input rounded-md px-3 py-2 w-full text-sm bg-background"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={saveBalances} disabled={savingBalances}
                className="flex-1 bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {savingBalances ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setShowBalanceModal(false)}
                className="flex-1 border border-border rounded-md py-2 text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your investment portfolio and net worth</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Search holdings…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-52 h-8 text-sm"
          />
          <Button variant="outline" size="sm" onClick={() => router.push('/documents')}>
            Upload Documents
          </Button>
          <Button size="sm" onClick={async () => { await systemApi.forceRefreshPrices().catch(() => {}); fetchData(true, 8, true) }} disabled={isRefreshing}>
            {isRefreshing ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full inline-block" />
                Updating…
              </span>
            ) : 'Refresh'}
          </Button>
        </div>
      </header>

      {/* ── Summary cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Portfolio Value */}
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Portfolio Value</CardTitle>
            <div className="h-7 w-7 rounded-md bg-emerald-500/10 flex items-center justify-center">
              <svg className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Market value of holdings</p>
          </CardContent>
        </Card>

        {/* Net Worth */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Net Worth</CardTitle>
            <div className="h-7 w-7 rounded-md bg-blue-500/10 flex items-center justify-center">
              <svg className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{formatCurrency(netWorthData?.net_worth ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatCurrency(netWorthData?.total_assets ?? 0)} assets − {formatCurrency(netWorthData?.total_liabilities ?? 0)} debt
            </p>
          </CardContent>
        </Card>

        {/* Total Debt */}
        <Card className="border-l-4 border-l-rose-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Debt</CardTitle>
            <div className="h-7 w-7 rounded-md bg-rose-500/10 flex items-center justify-center">
              <svg className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2v20M5 12h14" />
              </svg>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className={`text-2xl font-bold ${(netWorthData?.total_liabilities ?? 0) > 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>
              {formatCurrency(netWorthData?.total_liabilities ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Loans, credit &amp; mortgages</p>
          </CardContent>
        </Card>

        {/* Holdings count */}
        <Card className="border-l-4 border-l-violet-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Holdings</CardTitle>
            <div className="h-7 w-7 rounded-md bg-violet-500/10 flex items-center justify-center">
              <svg className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
              </svg>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{holdings.length}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Active positions</p>
          </CardContent>
        </Card>

        {/* Cash & Banks */}
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <div className="flex items-center justify-between w-full">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cash &amp; Banks</CardTitle>
              <button
                onClick={openBalanceModal}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                Edit
              </button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">{formatCurrency(netWorthData?.cash ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Checking &amp; savings</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="holdings">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
          <TabsTrigger value="debts">Debts</TabsTrigger>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="allocation">Allocation</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="ai">AI Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings" className="space-y-4">
          <HoldingsTable holdings={holdings} onHoldingAdded={fetchData} searchQuery={searchQuery} />
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

        <TabsContent value="ai" className="space-y-4">
          <AIAnalysisCard holdings={holdings} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
