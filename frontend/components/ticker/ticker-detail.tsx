'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import ReactMarkdown from 'react-markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { marketApi, aiApi, watchlistApi, holdingsApi } from '@/lib/api'
import { usePortfolioStore } from '@/lib/store'
import { formatCurrency } from '@/lib/utils'
import { Disclaimer } from '@/components/disclaimer'
import { StatStrip } from '@/components/ds/stat-strip'
import { selectionTick } from '@/components/ds/haptics'
import { useRef } from 'react'

// Time-range buttons → Yahoo period + a tick formatter appropriate to the span.
// 1D is intraday (5-minute bars) — the closest thing to a live view.
const RANGES = [
  { id: '1D', period: '1d' },
  { id: '1W', period: '5d' },
  { id: '1M', period: '1mo' },
  { id: '3M', period: '3mo' },
  { id: '6M', period: '6mo' },
  { id: '1Y', period: '1y' },
  { id: '2Y', period: '2y' },
  { id: '5Y', period: '5y' },
] as const
type RangeId = typeof RANGES[number]['id']

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtTick(ts: number, range: RangeId): string {
  const d = new Date(ts * 1000)
  if (range === '1D') {
    // Intraday → local time (e.g. "9:30", "14:05").
    const h = d.getHours()
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
  if (range === '1W' || range === '1M' || range === '3M' || range === '6M') return `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
}

function relTime(unixSecs: number | null): string {
  if (!unixSecs) return ''
  const secs = Math.max(0, Math.round(Date.now() / 1000 - unixSecs))
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

async function openLink(url: string) {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url })
      return
    }
  } catch { /* fall through to window.open */ }
  try { window.open(url, '_blank', 'noopener') } catch { /* ignore */ }
}

interface Quote {
  price: number
  day_change: number | null
  day_change_percent: number | null
}
interface NewsItem { title: string; publisher: string; link: string; published: number | null }

export function TickerDetail({ symbol }: { symbol: string }) {
  const ticker = symbol.toUpperCase()
  const { holdings, setHoldings } = usePortfolioStore() as any

  // The user's holding for this ticker (if held) — powers the company name
  // and the COST BASIS / SHARES / TYPE metadata cards.
  const held: any = useMemo(
    () => holdings.find((x: any) => (x.ticker || '').toUpperCase() === ticker) as any,
    [holdings, ticker],
  )
  const companyName: string | undefined = held?.security_name || held?.company_name || undefined

  // Haptic detent when the scrubbed datapoint changes.
  const scrubIndex = useRef<number | null>(null)
  const onScrub = (st: any) => {
    const i = st?.isTooltipActive ? st?.activeTooltipIndex : null
    if (i != null && i !== scrubIndex.current) {
      scrubIndex.current = i
      selectionTick()
    }
  }

  const [range, setRange] = useState<RangeId>('1W')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [series, setSeries] = useState<{ ts: number; close: number }[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  const [news, setNews] = useState<NewsItem[]>([])
  const [newsLoading, setNewsLoading] = useState(true)

  const [aiResult, setAiResult] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const [watchBusy, setWatchBusy] = useState(false)
  const [watchMsg, setWatchMsg] = useState('')

  // Inline edit for the held position (shares / avg cost) right on this page.
  const [editOpen, setEditOpen] = useState(false)
  const [editShares, setEditShares] = useState('')
  const [editCost, setEditCost] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editErr, setEditErr] = useState('')

  const openEdit = () => {
    if (!held) return
    setEditShares(String(held.shares ?? ''))
    setEditCost(String(held.average_cost ?? ''))
    setEditErr('')
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!held) return
    const shares = Number(editShares)
    const avgCost = Number(editCost)
    if (!shares || shares <= 0) { setEditErr('Shares must be greater than 0.'); return }
    if (isNaN(avgCost) || avgCost < 0) { setEditErr('Average cost must be 0 or more.'); return }
    setEditBusy(true)
    setEditErr('')
    try {
      await holdingsApi.update(held.id, {
        ticker,
        shares,
        average_cost: avgCost,
        security_type: held.security_type || 'stock',
      })
      // Refresh the store so this page (and the dashboard) reflect the edit.
      const res = await holdingsApi.getAll(false)
      setHoldings(res.data.holdings ?? [])
      setEditOpen(false)
    } catch (e: any) {
      setEditErr(e?.response?.data?.detail || e?.message || 'Failed to save.')
    } finally {
      setEditBusy(false)
    }
  }

  const addToWatchlist = async () => {
    setWatchBusy(true)
    setWatchMsg('')
    try {
      await watchlistApi.create({ ticker, company_name: companyName ?? null })
      setWatchMsg('Added to your watchlist.')
    } catch (e: any) {
      setWatchMsg(e?.response?.data?.detail || e?.message || 'Could not add to watchlist.')
    } finally {
      setWatchBusy(false)
    }
  }

  // Current price (independent of the chart range).
  useEffect(() => {
    let cancelled = false
    marketApi.getPrice(ticker)
      .then((r: any) => { if (!cancelled) setQuote(r.data) })
      .catch(() => { if (!cancelled) setQuote(null) })
    return () => { cancelled = true }
  }, [ticker])

  // Price history for the selected range.
  useEffect(() => {
    let cancelled = false
    setChartLoading(true)
    const period = RANGES.find(r => r.id === range)!.period
    marketApi.getHistory(ticker, period)
      .then((r: any) => {
        if (cancelled) return
        const rows: any[] = r.data?.data ?? r.data?.history ?? []
        const pts = rows
          .filter((p) => p && p.close != null && p.timestamp != null)
          .map((p) => ({ ts: Number(p.timestamp), close: Number(p.close) }))
        setSeries(pts)
      })
      .catch(() => { if (!cancelled) setSeries([]) })
      .finally(() => { if (!cancelled) setChartLoading(false) })
    return () => { cancelled = true }
  }, [ticker, range])

  // News (independent of range).
  useEffect(() => {
    let cancelled = false
    setNewsLoading(true)
    marketApi.getNews(ticker)
      .then((r: any) => { if (!cancelled) setNews(r.data?.news ?? []) })
      .catch(() => { if (!cancelled) setNews([]) })
      .finally(() => { if (!cancelled) setNewsLoading(false) })
    return () => { cancelled = true }
  }, [ticker])

  const analyze = async () => {
    setAiLoading(true)
    setAiError('')
    setAiResult('')
    try {
      const r = await aiApi.stockAnalysis(ticker, companyName)
      setAiResult(r.data?.analysis ?? '')
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      setAiError(typeof detail === 'string' ? detail : (e?.message ?? 'AI analysis failed.'))
    } finally {
      setAiLoading(false)
    }
  }

  // Period return (first → last close) drives the line + header colour.
  const periodChangeDollar = series.length >= 2
    ? series[series.length - 1].close - series[0].close
    : 0
  const periodChangePct = series.length >= 2 && series[0].close > 0
    ? (periodChangeDollar / series[0].close) * 100
    : 0
  const up = periodChangePct >= 0
  const lineColor = up ? '#10b981' : '#ef4444'

  const dayChange = quote?.day_change ?? 0
  const dayPct = quote?.day_change_percent ?? 0
  const dayColor = dayChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'

  const chartData = series.map((p) => ({ x: fmtTick(p.ts, range), close: p.close }))

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8 space-y-5">
      {/* Header: ticker + price (back is handled by the global floating nav) */}
      <header>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="type-amount text-2xl font-bold tracking-tight">{ticker}</h1>
            {/* Company + security type as small print under the ticker */}
            <p className="text-xs text-muted-foreground truncate">
              {companyName ? `${companyName} · ` : ''}
              <span className="uppercase tracking-wide">{String(held?.security_type || 'stock').replace('_', ' ')}</span>
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            {held && (
              <button
                onClick={openEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border
                  text-sm font-medium text-foreground hover:bg-accent"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Edit
              </button>
            )}
            <button
              onClick={addToWatchlist}
              disabled={watchBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border
                text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {watchBusy ? 'Adding…' : 'Watch'}
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-3 flex-wrap">
          <span className="type-hero text-4xl">
            {quote ? formatCurrency(quote.price) : '—'}
          </span>
          {quote && (
            <span className={`type-amount text-sm font-medium ${dayColor}`}>
              {dayChange >= 0 ? '▲ +' : '▼ −'}{formatCurrency(Math.abs(dayChange))} ({dayChange >= 0 ? '+' : ''}{dayPct.toFixed(2)}%) today
            </span>
          )}
        </div>
        {watchMsg && <p className="text-xs text-muted-foreground mt-1">{watchMsg}</p>}
      </header>

      {/* Metadata cards — only when this ticker is one of the user's holdings.
          VALUE = the position's current worth, colored by total gain/loss with
          the % since purchase alongside (type moved up under the ticker). */}
      {held && (() => {
        const gainPct = held.total_gain_loss_percent ?? 0
        const tone = gainPct > 0 ? 'positive' as const : gainPct < 0 ? 'negative' as const : 'default' as const
        return (
          <StatStrip
            items={[
              { label: 'Cost Basis', value: formatCurrency((held.average_cost ?? 0) * (held.shares ?? 0)), tone: 'default' },
              { label: 'Shares', value: String(held.shares ?? 0), tone: 'default' },
              {
                label: 'Value',
                value: `${formatCurrency(held.current_value ?? 0)} (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)`,
                tone,
              },
            ]}
          />
        )
      })()}

      {/* Chart */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          {/* Range buttons — compact equal-width pills so all 8 fit one line */}
          <div className="flex items-center gap-1">
            {RANGES.map(r => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`flex-1 min-w-0 px-0 py-1.5 text-[10px] rounded-full type-amount font-semibold transition-colors ${
                  range === r.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
                style={{ minHeight: 0, minWidth: 0 }}
              >
                {r.id}
              </button>
            ))}
          </div>

          {chartLoading ? (
            <p className="text-sm text-muted-foreground text-center py-16">Loading chart…</p>
          ) : chartData.length < 2 ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              No price history available for {ticker}.
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className={`type-amount text-sm font-semibold ${up ? 'text-positive' : 'text-negative'}`}>
                  {up ? '▲ +' : '▼ −'}{formatCurrency(Math.abs(periodChangeDollar))}
                  <span className="ml-1">({up ? '+' : ''}{periodChangePct.toFixed(2)}%)</span>
                </span>
                <span className="text-xs text-muted-foreground">over {range}</span>
              </div>
              {/* Interactive scrub: drag shows the value/date lollipop; each new
                  datapoint under the finger fires a light haptic detent. */}
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  onMouseMove={onScrub}
                >
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="x" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={40} />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10 }}
                    width={58}
                    tickFormatter={(v: number) => formatCurrency(v)}
                  />
                  <Tooltip
                    formatter={(v: any) => [formatCurrency(v as number), 'Close']}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                    labelStyle={{ fontSize: 11, color: '#9ca3af' }}
                    cursor={{ stroke: lineColor, strokeOpacity: 0.5, strokeDasharray: '2 3' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke={lineColor}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </CardContent>
      </Card>

      {/* AI analysis */}
      <Card>
        <CardHeader><CardTitle className="text-base">AI Analysis</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={analyze} disabled={aiLoading} className="w-full" size="sm">
            {aiLoading ? 'Analysing…' : `Analyze ${ticker} with AI`}
          </Button>
          {aiLoading && <p className="text-sm text-muted-foreground animate-pulse">AI is thinking…</p>}
          {aiError && (
            <p className="text-sm text-red-600 border border-red-200 bg-red-50 dark:bg-red-950/20 rounded-md p-2">
              {aiError}
            </p>
          )}
          {aiResult && (
            <div className="p-4 bg-muted rounded-md text-sm overflow-auto max-h-[70vh]">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-base font-bold mt-4 mb-1">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-sm font-bold mt-4 mb-1 text-primary">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold mt-3 mb-1">{children}</h3>,
                  p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                }}
              >
                {aiResult}
              </ReactMarkdown>
            </div>
          )}
          <Disclaimer variant="ai" />
        </CardContent>
      </Card>

      {/* News */}
      <Card>
        <CardHeader><CardTitle className="text-base">Latest News</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {newsLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading news…</p>
          ) : news.length === 0 ? (
            <button
              onClick={() => openLink(`https://news.google.com/search?q=${encodeURIComponent(ticker + ' stock')}`)}
              className="text-sm text-primary hover:underline"
            >
              Search Google News for {ticker} →
            </button>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {news.map((n, i) => (
                  <li key={i}>
                    <button
                      onClick={() => openLink(n.link)}
                      className="w-full text-left py-2.5 group"
                    >
                      <p className="text-sm font-medium leading-snug group-hover:text-primary group-hover:underline">
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {n.publisher}{n.published ? ` · ${relTime(n.published)}` : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => openLink(`https://news.google.com/search?q=${encodeURIComponent(ticker + ' stock')}`)}
                className="text-xs text-primary hover:underline pt-1"
              >
                More on Google News →
              </button>
            </>
          )}
        </CardContent>
      </Card>

      <Disclaimer variant="market" />

      {/* Edit-holding modal (shares / avg cost) — same update path as the
          Holdings tab, refreshed into the shared store on save. */}
      {editOpen && held && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditOpen(false)} />
          <div className="relative bg-card text-card-foreground border border-border rounded-ds-md shadow-2xl w-full max-w-sm mx-4 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Edit {ticker}</h2>
              <button onClick={() => setEditOpen(false)} className="text-muted-foreground hover:text-foreground text-2xl leading-none" aria-label="Close">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Shares</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editShares}
                  onChange={e => setEditShares(e.target.value)}
                  min="0"
                  step="any"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm
                    focus:outline-none focus:ring-2 focus:ring-ring type-amount"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Avg Cost (USD)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editCost}
                  onChange={e => setEditCost(e.target.value)}
                  min="0"
                  step="any"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm
                    focus:outline-none focus:ring-2 focus:ring-ring type-amount"
                />
              </div>
            </div>
            {editErr && (
              <p className="text-sm text-negative border border-negative/30 bg-negative/10 rounded-md p-2">{editErr}</p>
            )}
            <div className="flex gap-2">
              <Button onClick={saveEdit} disabled={editBusy} className="flex-1" size="sm">
                {editBusy ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={() => setEditOpen(false)} className="flex-1" size="sm">Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
