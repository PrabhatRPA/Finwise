// Direct market-data fetchers. Mirrors backend/app/services/market_data.py
// but slimmed down — same Yahoo → Stooq fallback. Runs over CapacitorHttp
// so WKWebView's CORS sandbox is bypassed.

import { CapacitorHttp } from '@capacitor/core'
import { get as dbGet, run as dbRun } from './db'

const PRICE_TTL_MS = 5 * 60 * 1000  // 5-minute cache

export interface PriceQuote {
  ticker: string
  price: number
  previous_close: number | null
  day_change: number | null
  day_change_percent: number | null
  source: 'yahoo' | 'stooq' | 'cache'
}

export async function fetchPrice(ticker: string, useCache = true): Promise<PriceQuote | null> {
  const upper = ticker.toUpperCase()
  if (useCache) {
    const cached = await readCache(upper)
    if (cached) return cached
  }
  const quote = (await fromYahoo(upper)) ?? (await fromStooq(upper))
  if (quote) await writeCache(quote)
  return quote
}

export async function fetchPrices(tickers: string[], useCache = true): Promise<PriceQuote[]> {
  // Yahoo supports comma-separated multi-quote, but rate limits at high QPS.
  // For now, just fan out sequentially — calling code rarely asks for >20 tickers.
  const out: PriceQuote[] = []
  for (const t of tickers) {
    const q = await fetchPrice(t, useCache)
    if (q) out.push(q)
  }
  return out
}

// ── Yahoo v7 quote endpoint ────────────────────────────────────────────
async function fromYahoo(ticker: string): Promise<PriceQuote | null> {
  try {
    const res = await CapacitorHttp.get({
      url: `https://query1.finance.yahoo.com/v7/finance/quote`,
      params: { symbols: ticker },
      headers: { 'User-Agent': 'Mozilla/5.0 Nworth/1.0' },
    })
    if (res.status !== 200) return null
    const q = res.data?.quoteResponse?.result?.[0]
    if (!q?.regularMarketPrice) return null
    return {
      ticker,
      price: Number(q.regularMarketPrice),
      previous_close: q.regularMarketPreviousClose != null ? Number(q.regularMarketPreviousClose) : null,
      day_change: q.regularMarketChange != null ? Number(q.regularMarketChange) : null,
      day_change_percent: q.regularMarketChangePercent != null ? Number(q.regularMarketChangePercent) : null,
      source: 'yahoo',
    }
  } catch {
    return null
  }
}

// ── Stooq CSV fallback ─────────────────────────────────────────────────
async function fromStooq(ticker: string): Promise<PriceQuote | null> {
  try {
    // Stooq tickers: US stocks need ".US" suffix.
    const symbol = ticker.includes('.') ? ticker.toLowerCase() : `${ticker.toLowerCase()}.us`
    const res = await CapacitorHttp.get({
      url: 'https://stooq.com/q/l/',
      params: { s: symbol, f: 'sd2t2ohlcv', h: '', e: 'csv' },
    })
    if (res.status !== 200 || typeof res.data !== 'string') return null
    // CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
    const [, dataLine] = res.data.trim().split('\n')
    if (!dataLine) return null
    const cols = dataLine.split(',')
    const close = Number(cols[6])
    const open = Number(cols[3])
    if (!isFinite(close) || close === 0) return null
    return {
      ticker,
      price: close,
      previous_close: isFinite(open) ? open : null,
      day_change: isFinite(open) ? close - open : null,
      day_change_percent: isFinite(open) && open !== 0 ? ((close - open) / open) * 100 : null,
      source: 'stooq',
    }
  } catch {
    return null
  }
}

// ── Cache (SQLite) ─────────────────────────────────────────────────────
async function readCache(ticker: string): Promise<PriceQuote | null> {
  const row = await dbGet<any>(
    `SELECT ticker, price, previous_close, day_change, day_change_percent, fetched_at
     FROM market_prices WHERE ticker = ?`,
    [ticker],
  )
  if (!row) return null
  const fetchedMs = Date.parse(row.fetched_at?.endsWith('Z') ? row.fetched_at : row.fetched_at + 'Z')
  if (Date.now() - fetchedMs > PRICE_TTL_MS) return null
  return {
    ticker,
    price: row.price,
    previous_close: row.previous_close,
    day_change: row.day_change,
    day_change_percent: row.day_change_percent,
    source: 'cache',
  }
}

async function writeCache(q: PriceQuote): Promise<void> {
  await dbRun(
    `INSERT INTO market_prices (ticker, price, previous_close, day_change, day_change_percent, source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(ticker) DO UPDATE SET
       price = excluded.price,
       previous_close = excluded.previous_close,
       day_change = excluded.day_change,
       day_change_percent = excluded.day_change_percent,
       source = excluded.source,
       fetched_at = CURRENT_TIMESTAMP`,
    [q.ticker, q.price, q.previous_close, q.day_change, q.day_change_percent, q.source],
  )
}

// API surface matching the existing marketApi shape in lib/api.ts.
export const nativeMarketApi = {
  getPrice: async (ticker: string) => {
    const q = await fetchPrice(ticker)
    if (!q) {
      const err = new Error('Price not found') as any
      err.response = { status: 404, data: { detail: 'Price not found' } }
      throw err
    }
    return { data: q }
  },
  batchPrices: async (tickers: string[]) => {
    const out = await fetchPrices(tickers)
    return { data: out }
  },
  getHistory: async (_ticker: string, _period = '1y') => {
    // History not yet ported — would need Yahoo's chart endpoint.
    return { data: { ticker: _ticker, period: _period, history: [] } }
  },
  search: async (_query: string) => ({ data: [] }),
  suggestions: async (_query: string) => ({ data: [] }),
}
