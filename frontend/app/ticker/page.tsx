'use client'

// Single static route (`/ticker/?symbol=AAPL`). The app is a static export
// (next.config.js `output: 'export'`), so a dynamic `[symbol]` route can't be
// pre-rendered for arbitrary tickers — we read the symbol from the query string
// instead. useSearchParams requires a Suspense boundary in Next's App Router.

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { TickerDetail } from '@/components/ticker/ticker-detail'

function TickerPageInner() {
  const params = useSearchParams()
  const router = useRouter()
  const symbol = (params.get('symbol') || '').trim()
  // Optional: the specific holding tapped, so the detail page resolves the right
  // position when the same ticker is held in more than one account.
  const holdingIdRaw = params.get('holdingId')
  const holdingId = holdingIdRaw && /^\d+$/.test(holdingIdRaw) ? Number(holdingIdRaw) : undefined

  // No symbol → nothing to show; send the user back to the dashboard.
  useEffect(() => {
    if (!symbol) router.replace('/dashboard')
  }, [symbol, router])

  if (!symbol) return null
  return <TickerDetail symbol={symbol} holdingId={holdingId} />
}

export default function TickerPage() {
  return (
    <Suspense>
      <TickerPageInner />
    </Suspense>
  )
}
