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
  const quote = await fetchFromProviders(upper)
  if (quote) {
    await writeCache(quote)
    return quote
  }
  // Last resort: serve the last value we ever stored, even past its TTL — a
  // slightly stale price beats a blank cell when every live source is down.
  return readCache(upper, true)
}

export async function fetchPrices(tickers: string[], useCache = true): Promise<PriceQuote[]> {
  const uppers = Array.from(new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean)))
  const out: PriceQuote[] = []
  const need: string[] = []

  // Cache pass first so we don't hit the network for anything still fresh.
  for (const t of uppers) {
    const cached = useCache ? await readCache(t) : null
    if (cached) out.push(cached)
    else need.push(t)
  }
  if (need.length === 0) return out

  // Fast path: a single Yahoo "spark" call quotes many symbols at once.
  const batch = await yahooSparkBatch(need)
  for (const t of need) {
    let q: PriceQuote | null = batch.get(t) ?? null
    if (!q) q = await fetchFromProviders(t)  // batch missed it → full chain
    if (!q) q = await readCache(t, true)     // everything failed → stale value
    if (q) {
      if (q.source !== 'cache') await writeCache(q)
      out.push(q)
    }
  }
  return out
}

// ── Provider chain ─────────────────────────────────────────────────────
// Prices come from an ordered list of independent sources; the first that
// returns a usable quote wins and the rest are fallbacks. The chain is
// data-driven on purpose: to add/remove a source (e.g. a keyed provider the
// user configures later) you edit PROVIDERS only — no call-site changes. This
// is what makes the strategy robust enough to ship without frequent updates.
//
// The old v7 `/finance/quote` endpoint now 401s without a crumb handshake, so
// we use Yahoo's v8 chart + v7 spark endpoints (both still keyless) across two
// hosts, then Stooq as a geo-dependent last-ditch.
const YAHOO_HOSTS = ['query1', 'query2'] as const
type YahooHost = (typeof YAHOO_HOSTS)[number]

interface PriceProvider {
  name: string
  quote: (ticker: string) => Promise<PriceQuote | null>
}

const PROVIDERS: PriceProvider[] = [
  { name: 'yahoo-chart-q1', quote: (t) => yahooChart(t, 'query1') },
  { name: 'yahoo-chart-q2', quote: (t) => yahooChart(t, 'query2') },
  { name: 'yahoo-spark-q1', quote: (t) => yahooSparkOne(t, 'query1') },
  { name: 'yahoo-spark-q2', quote: (t) => yahooSparkOne(t, 'query2') },
  { name: 'stooq',          quote: (t) => stooq(t) },
]

async function fetchFromProviders(ticker: string): Promise<PriceQuote | null> {
  for (const p of PROVIDERS) {
    try {
      const q = await p.quote(ticker)
      if (q && isFinite(q.price) && q.price > 0) return q
    } catch {
      // Provider threw — move on to the next.
    }
  }
  return null
}

// Shared parser for Yahoo's chart/spark `meta` block.
function quoteFromMeta(ticker: string, meta: any): PriceQuote | null {
  const price = meta?.regularMarketPrice
  if (price == null) return null
  // Yahoo exposes the prior session's close as `chartPreviousClose`; some
  // symbols also carry `previousClose`. Either yields the day change.
  const prevRaw = meta?.chartPreviousClose ?? meta?.previousClose
  const prev = prevRaw != null ? Number(prevRaw) : null
  const change = prev != null ? Number(price) - prev : null
  const changePct = prev != null && prev !== 0 ? ((Number(price) - prev) / prev) * 100 : null
  return {
    ticker: ticker.toUpperCase(),
    price: Number(price),
    previous_close: prev,
    day_change: change,
    day_change_percent: changePct,
    source: 'yahoo',
  }
}

// ── Yahoo v8 chart (single ticker, full meta) ──────────────────────────
async function yahooChart(ticker: string, host: YahooHost): Promise<PriceQuote | null> {
  try {
    const res = await CapacitorHttp.get({
      url: `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
      params: { range: '1d', interval: '1d' },
      headers: { 'User-Agent': 'Mozilla/5.0 Nworth/1.0' },
    })
    if (res.status !== 200) return null
    return quoteFromMeta(ticker, res.data?.chart?.result?.[0]?.meta)
  } catch {
    return null
  }
}

// ── Yahoo v7 spark (single + batch) ────────────────────────────────────
async function yahooSparkOne(ticker: string, host: YahooHost): Promise<PriceQuote | null> {
  const m = await yahooSparkBatch([ticker], host)
  return m.get(ticker.toUpperCase()) ?? null
}

// One request can quote many symbols — used as the bulk fast-path in
// fetchPrices(). Returns a ticker→quote map (missing symbols simply absent).
async function yahooSparkBatch(
  tickers: string[],
  host: YahooHost = 'query1',
): Promise<Map<string, PriceQuote>> {
  const result = new Map<string, PriceQuote>()
  if (tickers.length === 0) return result
  try {
    const res = await CapacitorHttp.get({
      url: `https://${host}.finance.yahoo.com/v7/finance/spark`,
      params: { symbols: tickers.join(','), range: '1d', interval: '1d' },
      headers: { 'User-Agent': 'Mozilla/5.0 Nworth/1.0' },
    })
    if (res.status !== 200) return result
    const list = res.data?.spark?.result ?? []
    for (const item of list) {
      const meta = item?.response?.[0]?.meta
      const q = quoteFromMeta(String(item?.symbol ?? ''), meta)
      if (q && isFinite(q.price) && q.price > 0) result.set(q.ticker, q)
    }
  } catch {
    // Whole batch failed — caller falls back to the per-ticker chain.
  }
  return result
}

// ── Spark series (batched close-price history for sparklines) ───────────
// One request returns a ~1-month daily close series for MANY symbols — powers
// the holdings-row sparklines without an N+1 history call per ticker.
// Cached in-memory for 10 minutes; missing/sparse symbols yield [] and the
// Sparkline component renders a flat neutral line.
const SPARK_TTL_MS = 10 * 60 * 1000
const _sparkCache = new Map<string, { at: number; closes: number[] }>()

export async function fetchSparkSeries(tickers: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>()
  const now = Date.now()
  const need: string[] = []
  for (const t of Array.from(new Set(tickers.map((x) => x.toUpperCase()).filter(Boolean)))) {
    const hit = _sparkCache.get(t)
    if (hit && now - hit.at < SPARK_TTL_MS) out.set(t, hit.closes)
    else need.push(t)
  }
  if (need.length === 0) return out

  for (const host of YAHOO_HOSTS) {
    try {
      const res = await CapacitorHttp.get({
        url: `https://${host}.finance.yahoo.com/v7/finance/spark`,
        params: { symbols: need.join(','), range: '1mo', interval: '1d' },
        headers: { 'User-Agent': 'Mozilla/5.0 Nworth/1.0' },
      })
      if (res.status !== 200) continue
      const list = res.data?.spark?.result ?? []
      for (const item of list) {
        const sym = String(item?.symbol ?? '').toUpperCase()
        const resp = item?.response?.[0]
        const closes: number[] = (resp?.indicators?.quote?.[0]?.close ?? [])
          .filter((c: any) => c != null && isFinite(Number(c)))
          .map(Number)
        if (sym) {
          out.set(sym, closes)
          _sparkCache.set(sym, { at: now, closes })
        }
      }
      break // one host succeeded
    } catch {
      // try next host
    }
  }
  return out
}

// ── Stooq CSV (last-ditch; frequently geo-blocked / challenge-walled) ───
async function stooq(ticker: string): Promise<PriceQuote | null> {
  try {
    // Stooq tickers: US stocks need a ".US" suffix.
    const symbol = ticker.includes('.') ? ticker.toLowerCase() : `${ticker.toLowerCase()}.us`
    const res = await CapacitorHttp.get({
      url: 'https://stooq.com/q/l/',
      params: { s: symbol, f: 'sd2t2ohlcv', h: '', e: 'csv' },
    })
    if (res.status !== 200 || typeof res.data !== 'string') return null
    // A challenge/error page is HTML, not CSV — bail if it doesn't look like data.
    if (!res.data.includes(',') || /</.test(res.data.slice(0, 1))) return null
    // CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
    const [, dataLine] = res.data.trim().split('\n')
    if (!dataLine) return null
    const cols = dataLine.split(',')
    const close = Number(cols[6])
    const open = Number(cols[3])
    if (!isFinite(close) || close === 0) return null
    return {
      ticker: ticker.toUpperCase(),
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

// ── Historical series (Yahoo v8 chart) ─────────────────────────────────
// Returns one row per period with { date, timestamp, close } — the shape the
// BenchmarkChart consumes (`res.data.data[].close` / `.timestamp`).
const PERIOD_RANGE: Record<string, string> = {
  '1d': '1d', '5d': '5d', '1mo': '1mo', '3mo': '3mo', '6mo': '6mo',
  '1y': '1y', '2y': '2y', '5y': '5y', 'ytd': 'ytd', 'max': 'max',
}

export interface HistoryPoint {
  date: string        // YYYY-MM-DD
  timestamp: number   // unix seconds
  close: number | null
}

async function fetchHistory(ticker: string, period = '1y'): Promise<HistoryPoint[]> {
  const range = PERIOD_RANGE[period] ?? '1y'
  const interval = range === '1d' ? '5m' : range === '5d' ? '60m' : '1d'
  for (const host of YAHOO_HOSTS) {
    try {
      const res = await CapacitorHttp.get({
        url: `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
        params: { range, interval },
        headers: { 'User-Agent': 'Mozilla/5.0 Nworth/1.0' },
      })
      if (res.status !== 200) continue
      const result = res.data?.chart?.result?.[0]
      const stamps: number[] | undefined = result?.timestamp
      const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close
      if (!stamps || !closes) continue
      const out: HistoryPoint[] = []
      for (let i = 0; i < stamps.length; i++) {
        const ts = stamps[i]
        out.push({
          timestamp: ts,
          date: new Date(ts * 1000).toISOString().slice(0, 10),
          close: closes[i] != null ? Number(closes[i]) : null,
        })
      }
      return out
    } catch {
      // Try next host.
    }
  }
  return []
}

// ── News (Yahoo Finance search, keyless) ───────────────────────────────
export interface NewsItem {
  title: string
  publisher: string
  link: string
  published: number | null   // unix seconds
}

// Yahoo's public search endpoint returns a `news` array alongside quote
// matches — free and keyless, same hosts as the price/history fetchers.
async function fetchNews(ticker: string): Promise<NewsItem[]> {
  const upper = ticker.toUpperCase()
  for (const host of YAHOO_HOSTS) {
    try {
      const res = await CapacitorHttp.get({
        url: `https://${host}.finance.yahoo.com/v1/finance/search`,
        params: { q: upper, newsCount: '12', quotesCount: '0', enableFuzzyQuery: 'false' },
        headers: { 'User-Agent': 'Mozilla/5.0 Nworth/1.0' },
      })
      if (res.status !== 200) continue
      const news: any[] = res.data?.news ?? []
      if (!Array.isArray(news)) continue
      const out: NewsItem[] = news
        .filter((n) => n?.link && n?.title)
        .map((n) => ({
          title: String(n.title),
          publisher: String(n.publisher ?? ''),
          link: String(n.link),
          published: typeof n.providerPublishTime === 'number' ? n.providerPublishTime : null,
        }))
      if (out.length > 0) return out
    } catch {
      // Try next host.
    }
  }
  return []
}

// Second free source: Google News RSS (keyless). Broadens coverage beyond Yahoo
// so the feed isn't single-sourced. Returns items tagged with their real
// publisher (from the RSS <source> element).
function xmlPick(block: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block)
  if (!m) return ''
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
}
function xmlDecode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
}
async function fetchNewsGoogle(ticker: string): Promise<NewsItem[]> {
  try {
    const res = await CapacitorHttp.get({
      url: 'https://news.google.com/rss/search',
      params: { q: `${ticker.toUpperCase()} stock`, hl: 'en-US', gl: 'US', ceid: 'US:en' },
      headers: { 'User-Agent': 'Mozilla/5.0 Nworth/1.0' },
    })
    if (res.status !== 200) return []
    const xml = typeof res.data === 'string' ? res.data : ''
    if (!xml) return []
    const out: NewsItem[] = []
    const itemRe = /<item>([\s\S]*?)<\/item>/g
    let m: RegExpExecArray | null
    while ((m = itemRe.exec(xml)) && out.length < 12) {
      const block = m[1]
      const rawTitle = xmlDecode(xmlPick(block, 'title'))
      const link = xmlPick(block, 'link')
      const source = xmlDecode(xmlPick(block, 'source'))
      const pub = xmlPick(block, 'pubDate')
      if (!rawTitle || !link) continue
      // Google appends " - Publisher" to titles; strip it since we show source.
      const title = source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(source.length + 3))
        : rawTitle
      const ts = pub ? Math.round(Date.parse(pub) / 1000) : NaN
      out.push({
        title,
        publisher: source || 'Google News',
        link,
        published: Number.isFinite(ts) ? ts : null,
      })
    }
    return out
  } catch {
    return []
  }
}

// Merge Yahoo + Google, dedupe by headline, newest first.
async function fetchNewsMerged(ticker: string): Promise<NewsItem[]> {
  const [yahoo, google] = await Promise.allSettled([fetchNews(ticker), fetchNewsGoogle(ticker)])
  const merged: NewsItem[] = []
  const seen = new Set<string>()
  const add = (arr: NewsItem[]) => {
    for (const n of arr) {
      const key = (n.title || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 70)
      if (n.link && key && !seen.has(key)) { seen.add(key); merged.push(n) }
    }
  }
  if (yahoo.status === 'fulfilled') add(yahoo.value)
  if (google.status === 'fulfilled') add(google.value)
  merged.sort((a, b) => (b.published ?? 0) - (a.published ?? 0))
  return merged
}

// ── Cache (SQLite) ─────────────────────────────────────────────────────
async function readCache(ticker: string, ignoreTtl = false): Promise<PriceQuote | null> {
  const row = await dbGet<any>(
    `SELECT ticker, price, previous_close, day_change, day_change_percent, fetched_at
     FROM market_prices WHERE ticker = ?`,
    [ticker],
  )
  if (!row) return null
  // `ignoreTtl` is the "every live source is down, serve whatever we have"
  // path. Otherwise enforce the freshness window below.
  if (!ignoreTtl) {
    // SQLite's CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" (UTC, space-separated,
    // no zone). iOS JavaScriptCore won't parse that space form, returning NaN —
    // and `Date.now() - NaN > TTL` is false, which would mark every cached row
    // as permanently fresh and freeze prices after the first fetch. Normalise to
    // ISO 8601 ("…THH:MM:SSZ") so the TTL check actually works. If parsing still
    // fails, treat the row as stale so we re-fetch rather than serve old data.
    const raw = String(row.fetched_at ?? '')
    const iso = (raw.includes('T') ? raw : raw.replace(' ', 'T')).replace(/Z?$/, 'Z')
    const fetchedMs = Date.parse(iso)
    if (!isFinite(fetchedMs) || Date.now() - fetchedMs > PRICE_TTL_MS) return null
  }
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
  getHistory: async (ticker: string, period = '1y') => {
    const history = await fetchHistory(ticker, period)
    // BenchmarkChart reads `res.data.data`; keep `history` too for any other
    // caller that expects the FastAPI `{ history: [...] }` shape.
    return { data: { ticker, period, data: history, history } }
  },
  getNews: async (ticker: string) => {
    const news = await fetchNewsMerged(ticker)
    return { data: { ticker, news } }
  },
  search: async (_query: string) => ({ data: [] }),
  suggestions: async (_query: string) => ({ data: [] }),
}
