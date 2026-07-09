'use client'

// User preference for the home market. Drives the app-wide display currency,
// number formatting locale, exchange-suffix preference for ticker resolution,
// and the default benchmark set. Same localStorage + broadcast pattern as
// bar-style.ts / float-side.ts. Default is US — a user who never opens the
// setting sees exactly the pre-region behavior (USD, en-US, US benchmarks).

import { useEffect, useState } from 'react'

const KEY = 'market_region'
const EVENT = 'region-change'

export interface MarketRegion {
  id: string
  label: string
  currency: string        // ISO 4217 display/base currency
  locale: string          // Intl formatting locale
  suffixes: string[]      // Yahoo exchange suffixes, preferred first ('' = none)
  defaultBenchmarks: { ticker: string; name: string }[]
}

// Only markets Yahoo serves keylessly. The US default benchmark set must stay
// identical to the original hardcoded BenchmarkChart list.
export const MARKETS: MarketRegion[] = [
  {
    id: 'us', label: 'United States', currency: 'USD', locale: 'en-US', suffixes: [''],
    defaultBenchmarks: [
      { ticker: 'SPY', name: 'S&P 500' },
      { ticker: 'VOO', name: 'Vanguard S&P 500' },
      { ticker: 'QQQ', name: 'NASDAQ 100' },
      { ticker: 'VTI', name: 'US Total Market' },
      { ticker: 'VXUS', name: 'Intl ex-US' },
      { ticker: 'IWM', name: 'Russell 2000' },
      { ticker: 'DIA', name: 'Dow Jones' },
    ],
  },
  {
    id: 'in', label: 'India', currency: 'INR', locale: 'en-IN', suffixes: ['.NS', '.BO'],
    defaultBenchmarks: [
      { ticker: '^NSEI', name: 'Nifty 50' },
      { ticker: '^BSESN', name: 'Sensex' },
      { ticker: '^CNXIT', name: 'Nifty IT' },
    ],
  },
  {
    id: 'uk', label: 'United Kingdom', currency: 'GBP', locale: 'en-GB', suffixes: ['.L'],
    defaultBenchmarks: [
      { ticker: '^FTSE', name: 'FTSE 100' },
      { ticker: '^FTMC', name: 'FTSE 250' },
    ],
  },
  {
    id: 'ca', label: 'Canada', currency: 'CAD', locale: 'en-CA', suffixes: ['.TO', '.V'],
    defaultBenchmarks: [
      { ticker: '^GSPTSE', name: 'S&P/TSX' },
    ],
  },
  {
    id: 'eu', label: 'Eurozone', currency: 'EUR', locale: 'de-DE', suffixes: ['.DE', '.PA', '.AS', '.MI', '.MC'],
    defaultBenchmarks: [
      { ticker: '^GDAXI', name: 'DAX' },
      { ticker: '^FCHI', name: 'CAC 40' },
      { ticker: '^STOXX50E', name: 'Euro Stoxx 50' },
    ],
  },
  {
    id: 'jp', label: 'Japan', currency: 'JPY', locale: 'ja-JP', suffixes: ['.T'],
    defaultBenchmarks: [
      { ticker: '^N225', name: 'Nikkei 225' },
    ],
  },
  {
    id: 'au', label: 'Australia', currency: 'AUD', locale: 'en-AU', suffixes: ['.AX'],
    defaultBenchmarks: [
      { ticker: '^AXJO', name: 'ASX 200' },
    ],
  },
  {
    id: 'hk', label: 'Hong Kong', currency: 'HKD', locale: 'zh-HK', suffixes: ['.HK'],
    defaultBenchmarks: [
      { ticker: '^HSI', name: 'Hang Seng' },
    ],
  },
]

const DEFAULT = MARKETS[0]

export function getRegion(): MarketRegion {
  if (typeof window === 'undefined') return DEFAULT
  try {
    const id = window.localStorage.getItem(KEY)
    return MARKETS.find((m) => m.id === id) ?? DEFAULT
  } catch {
    return DEFAULT
  }
}

export function setRegion(id: string): void {
  try {
    window.localStorage.setItem(KEY, id)
    window.dispatchEvent(new Event(EVENT))
  } catch { /* ignore */ }
}

// Bare currency symbol for input-field prefixes/labels ("$", "€", "₹").
// Falls back to the ISO code if the runtime can't produce a symbol.
export function currencySymbol(region?: MarketRegion): string {
  const r = region ?? getRegion()
  return symbolFor(r.currency, r.locale)
}

export function symbolFor(currency: string, locale?: string): string {
  try {
    const parts = new Intl.NumberFormat(locale ?? getRegion().locale, { style: 'currency', currency })
      .formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}

// The currency a ticker actually TRADES in, inferred from its exchange
// suffix (TCS.NS → INR, SAP.DE → EUR, bare/crypto → USD). Used to label the
// Avg Cost field: cost basis is entered in the listing's own currency —
// that's what the gain/loss conversion math assumes — which is not
// necessarily the app's display currency.
export function currencyForTicker(ticker: string): string {
  const t = (ticker || '').toUpperCase().trim()
  if (!t) return getRegion().currency   // nothing typed yet — show the home currency
  if (!t.includes('.')) return 'USD'    // bare symbols + BTC-USD pairs are US listings
  for (const m of MARKETS) {
    for (const s of m.suffixes) {
      if (s && t.endsWith(s)) return m.currency
    }
  }
  return getRegion().currency  // unknown suffix — assume the user's home market
}

export function useRegion(): MarketRegion {
  const [region, setRegionState] = useState<MarketRegion>(DEFAULT)
  useEffect(() => {
    setRegionState(getRegion())
    const on = () => setRegionState(getRegion())
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return region
}
