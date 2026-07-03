'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import ReactMarkdown from 'react-markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { marketApi, aiApi } from '@/lib/api'
import { usePortfolioStore } from '@/lib/store'
import { formatCurrency } from '@/lib/utils'
import { Disclaimer } from '@/components/disclaimer'

// Time-range buttons → Yahoo period + a tick formatter appropriate to the span.
const RANGES = [
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
  if (range === '1W') return `${MONTHS[d.getMonth()]} ${d.getDate()}`
  if (range === '1M' || range === '3M' || range === '6M') return `${MONTHS[d.getMonth()]} ${d.getDate()}`
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
  const { holdings } = usePortfolioStore()

  // Company name from the user's holdings, if this ticker is one of them.
  const companyName: string | undefined = useMemo(() => {
    const h = holdings.find((x: any) => (x.ticker || '').toUpperCase() === ticker) as any
    return h?.security_name || h?.company_name || undefined
  }, [holdings, ticker])

  const [range, setRange] = useState<RangeId>('1Y')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [series, setSeries] = useState<{ ts: number; close: number }[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  const [news, setNews] = useState<NewsItem[]>([])
  const [newsLoading, setNewsLoading] = useState(true)

  const [aiResult, setAiResult] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

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
  const periodChangePct = series.length >= 2 && series[0].close > 0
    ? ((series[series.length - 1].close - series[0].close) / series[0].close) * 100
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
        <h1 className="text-2xl font-bold tracking-tight">{ticker}</h1>
        {companyName && <p className="text-sm text-muted-foreground truncate">{companyName}</p>}
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-3xl font-bold">
            {quote ? formatCurrency(quote.price) : '—'}
          </span>
          {quote && (
            <span className={`text-sm font-medium ${dayColor}`}>
              {dayChange >= 0 ? '+' : ''}{formatCurrency(dayChange)} ({dayChange >= 0 ? '+' : ''}{dayPct.toFixed(2)}%) today
            </span>
          )}
        </div>
      </header>

      {/* Chart */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          {/* Range buttons */}
          <div className="flex items-center gap-1 flex-wrap">
            {RANGES.map(r => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  range === r.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
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
                <span className={`text-sm font-semibold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {up ? '+' : ''}{periodChangePct.toFixed(2)}%
                </span>
                <span className="text-xs text-muted-foreground">over {range}</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
                    contentStyle={{ fontSize: 12 }}
                    labelStyle={{ fontSize: 11, color: '#9ca3af' }}
                  />
                  <Line type="monotone" dataKey="close" stroke={lineColor} strokeWidth={2} dot={false} connectNulls />
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
    </div>
  )
}
