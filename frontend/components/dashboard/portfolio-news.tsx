'use client'

// Portfolio-wide news feed: pulls recent headlines for every ticker in the
// user's holdings (free, keyless Yahoo Finance search via marketApi.getNews),
// merges + dedupes + sorts newest-first, and tags each item with its ticker.
// Headlines open in the in-app browser. No-op-friendly: shows a clear empty
// state when there are no holdings or no news.

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

export function PortfolioNews({ holdings }: { holdings: any[] }) {
  const router = useRouter()

  // Unique tickers from holdings (cap to keep the request fan-out reasonable).
  const tickers = useMemo(() => {
    const seen = new Set<string>()
    for (const h of holdings) {
      const t = (h?.ticker || '').toUpperCase().trim()
      if (t) seen.add(t)
    }
    return Array.from(seen).slice(0, 30)
  }, [holdings])

  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (tickers.length === 0) { setItems([]); setLoading(false); return }
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
        merged.sort((a, b) => (b.published ?? 0) - (a.published ?? 0))
        setItems(merged.slice(0, 60))
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [tickers])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Portfolio News</CardTitle>
        <p className="text-sm text-muted-foreground">
          Latest headlines across your holdings. Tap to read the full article.
        </p>
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
