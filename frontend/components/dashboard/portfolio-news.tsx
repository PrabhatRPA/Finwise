'use client'

// Portfolio-wide news feed: pulls recent headlines for every ticker in the
// user's holdings (free, keyless Yahoo Finance search via marketApi.getNews),
// merges + dedupes, and tags each item with its ticker. Default order ("By
// Value") round-robins across tickers ordered by portfolio value so one
// chatty ticker can't crowd out the rest; "Most Recent" is a flat
// newest-first fallback. Headlines open in the in-app browser. No-op-
// friendly: shows a clear empty state when there are no holdings or no news.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { marketApi } from '@/lib/api'
import { Disclaimer } from '@/components/disclaimer'

interface FeedItem {
  ticker: string
  title: string
  publisher: string
  link: string
  published: number | null
}

function relTime(unixSecs: number | null): string {
  if (!unixSecs) return ''
  const secs = Math.max(0, Math.round(Date.now() / 1000 - unixSecs))
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

async function openLink(url: string) {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url })
      return
    }
  } catch { /* fall through */ }
  try { window.open(url, '_blank', 'noopener') } catch { /* ignore */ }
}

type SortMode = 'value' | 'recent'

export function PortfolioNews({ holdings }: { holdings: any[] }) {
  const router = useRouter()

  // Unique tickers from holdings (cap to keep the request fan-out reasonable).
  const tickers = useMemo(() => {
    const seen = new Set<string>()
    for (const h of holdings) {
      const t = (h?.ticker || '').toUpperCase().trim()
      if (t) seen.add(t)
    }
    return Array.from(seen).slice(0, 50)
  }, [holdings])

  // ticker -> portfolio value, so news can be weighted by how much of the
  // portfolio it represents (biggest holding's news first, by default).
  const valueByTicker = useMemo(() => {
    const map = new Map<string, number>()
    for (const h of holdings) {
      const t = (h?.ticker || '').toUpperCase().trim()
      if (!t) continue
      const v = Number(h?.current_value) || 0
      map.set(t, (map.get(t) ?? 0) + v)
    }
    return map
  }, [holdings])

  const [rawItems, setRawItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('value')

  useEffect(() => {
    let cancelled = false
    if (tickers.length === 0) { setRawItems([]); setLoading(false); return }
    setLoading(true)

    Promise.allSettled(tickers.map(t => marketApi.getNews(t)))
      .then(results => {
        if (cancelled) return
        const merged: FeedItem[] = []
        const seenLinks = new Set<string>()
        results.forEach((r, i) => {
          if (r.status !== 'fulfilled') return
          const news: any[] = r.value?.data?.news ?? []
          for (const n of news) {
            if (!n?.link || !n?.title || seenLinks.has(n.link)) continue
            seenLinks.add(n.link)
            merged.push({
              ticker: tickers[i],
              title: String(n.title),
              publisher: String(n.publisher ?? ''),
              link: String(n.link),
              published: typeof n.published === 'number' ? n.published : (typeof n.providerPublishTime === 'number' ? n.providerPublishTime : null),
            })
          }
        })
        setRawItems(merged)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [tickers])

  // "Most recent": flat newest-first, same as before.
  // "By Value": round-robin across tickers (ordered by portfolio value,
  // biggest first) so one chatty ticker can't bury the others — each
  // ticker gets a turn, cycling, contributing its own newest-first queue.
  const items = useMemo(() => {
    if (sortMode === 'recent') {
      return [...rawItems].sort((a, b) => (b.published ?? 0) - (a.published ?? 0)).slice(0, 60)
    }
    const byTicker = new Map<string, FeedItem[]>()
    for (const item of rawItems) {
      const list = byTicker.get(item.ticker) ?? []
      list.push(item)
      byTicker.set(item.ticker, list)
    }
    Array.from(byTicker.values()).forEach(list => list.sort((a, b) => (b.published ?? 0) - (a.published ?? 0)))

    const tickerOrder = Array.from(byTicker.keys()).sort(
      (a, b) => (valueByTicker.get(b) ?? 0) - (valueByTicker.get(a) ?? 0)
    )

    const merged: FeedItem[] = []
    let remaining = true
    while (remaining) {
      remaining = false
      for (const t of tickerOrder) {
        const list = byTicker.get(t)
        if (list && list.length > 0) {
          merged.push(list.shift()!)
          remaining = true
        }
      }
    }
    return merged.slice(0, 60)
  }, [rawItems, sortMode, valueByTicker])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Portfolio News</CardTitle>
            <p className="text-sm text-muted-foreground">
              Latest headlines across your holdings. Tap to read the full article.
            </p>
          </div>
          <div className="flex shrink-0 rounded-full border border-border p-0.5 text-[11px] font-medium">
            <button
              onClick={() => setSortMode('value')}
              className={`px-2.5 py-1 rounded-full transition-colors ${
                sortMode === 'value' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              By Value
            </button>
            <button
              onClick={() => setSortMode('recent')}
              className={`px-2.5 py-1 rounded-full transition-colors ${
                sortMode === 'recent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              Most Recent
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {holdings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Add holdings to see news for your portfolio.
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center animate-pulse">Loading news…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No recent news found for your holdings right now.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n, i) => (
              <li key={i} className="py-2.5">
                <button onClick={() => openLink(n.link)} className="w-full text-left group">
                  <p className="text-sm font-medium leading-snug group-hover:text-primary group-hover:underline">
                    {n.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/ticker/?symbol=${encodeURIComponent(n.ticker)}`) }}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-border text-primary hover:bg-accent"
                    >
                      {n.ticker}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {n.publisher}{n.published ? ` · ${relTime(n.published)}` : ''}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="pt-2">
          <Disclaimer variant="market" />
        </div>
      </CardContent>
    </Card>
  )
}
