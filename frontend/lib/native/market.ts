// Direct market-data fetchers. Mirrors backend/app/services/market_data.py
// but slimmed down — same Yahoo → Stooq fallback. Runs over CapacitorHttp
// so WKWebView's CORS sandbox is bypassed.

import { CapacitorHttp } from '@capacitor/core'
import { get as dbGet, run as dbRun } from './db'
import { getRegion } from '@/lib/region'

const PRICE_TTL_MS = 5 * 60 * 1000  // 5-minute cache
const FX_TTL_MS = 60 * 60 * 1000    // FX rates move slowly — 1-hour cache

export interface PriceQuote {
  ticker: string
  price: number
  previous_close: number | null
  day_change: number | null
  day_change_percent: number | null
  source: 'yahoo' | 'stooq' | 'cache'
  currency?: string | null         // currency of `price` (base currency once converted)
  native_currency?: string | null  // listing's own trading currency (e.g. INR)
  native_price?: number | null     // price in the native currency, pre-conversion
}

export async function fetchPrice(ticker: string, useCache = true): Promise<PriceQuote | null> {
  const upper = ticker.toUpperCase()
  if (useCache) {
    const cached = await readCache(upper)
    if (cached) return cached
  }
  let quote = await fetchFromProviders(upper)
  if (quote) {
    quote = await toBaseCurrency(quote)
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
    if (q) q = await toBaseCurrency(q)
    if (!q) q = await readCache(t, true)     // everything failed → stale value
    if (q) {
      if (q.source !== 'cache') await writeCache(q)
      out.push(q)
    }
  }
  return out
}

// ── Currency conversion ────────────────────────────────────────────────
// Quotes come back in each listing's native currency (INR for .NS, GBp for
// .L, …). Everything the app stores/aggregates is in the base currency of
// the market selected in Settings, so convert here — the single choke point
// through which every price flows. Same-currency portfolios (the default:
// US market, US tickers) take the `from === to` early exit and never fetch FX.

// Yahoo reports some markets in minor units; normalise to the major currency.
const MINOR_UNITS: Record<string, string> = { GBp: 'GBP', ZAc: 'ZAR', ILA: 'ILS' }

async function fxRate(from: string, to: string): Promise<number | null> {
  if (!from || from === to) return 1
  const pairTicker = `${from}${to}=X`.toUpperCase()
  // FX rates ride the regular market_prices cache (they're quotes too), with
  // a longer TTL enforced here.
  const row = await dbGet<any>(
    `SELECT price, fetched_at FROM market_prices WHERE ticker = ?`, [pairTicker],
  )
  if (row && row.price > 0 && cacheAgeMs(row.fetched_at) < FX_TTL_MS) return row.price
  for (const host of YAHOO_HOSTS) {
    const q = await yahooChart(pairTicker, host)
    if (q && isFinite(q.price) && q.price > 0) {
      await writeCache({ ...q, ticker: pairTicker, source: 'yahoo', currency: to })
      return q.price
    }
  }
  // Live FX down — serve the stale cached rate if we ever had one.
  return row && row.price > 0 ? row.price : null
}

async function toBaseCurrency(q: PriceQuote): Promise<PriceQuote> {
  const base = getRegion().currency
  const native = q.currency ?? null
  let cur = native
  if (!cur || cur === base) return { ...q, currency: cur ?? base, native_currency: cur ?? base }

  // Minor units (pence, cents): scale to the major currency first.
  let scale = 1
  if (MINOR_UNITS[cur]) { scale = 1 / 100; cur = MINOR_UNITS[cur] }

  if (cur === base) {
    return scaleQuote(q, scale, base, native)
  }
  const rate = await fxRate(cur, base)
  if (rate == null) return { ...q, native_currency: native }  // FX unavailable — leave native, flagged by currency field
  return scaleQuote(q, scale * rate, base, native)
}

function scaleQuote(q: PriceQuote, k: number, base: string, native: string | null): PriceQuote {
  return {
    ...q,
    native_currency: native,
    native_price: q.price,
    price: q.price * k,
    previous_close: q.previous_close != null ? q.previous_close * k : null,
    day_change: q.day_change != null ? q.day_change * k : null,
    // percent change is unit-free — unchanged
    currency: base,
  }
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
    // Native trading currency (e.g. "INR", "GBp"); toBaseCurrency() converts.
    currency: typeof meta?.currency === 'string' ? meta.currency : null,
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
// The holdings-row sparklines show the DAY chart: one batched request pulls
// intraday 5-minute closes for MANY symbols. Symbols that come back sparse
// (<2 intraday points — thin listings, some funds) get one batched fallback
// at 1-month daily so the row still shows a real trend line, never a flat gap.
// Cached in-memory for 10 minutes.
const SPARK_TTL_MS = 10 * 60 * 1000
const _sparkCache = new Map<string, { at: number; closes: number[] }>()

// One spark batch. `lastSessionOnly` slices each series to just the FINAL
// trading day present in the response — that's how "the last available 1-day
// chart" works on weekends/holidays/after-hours (fetch 5d, keep the last day).
async function sparkBatchSeries(
  symbols: string[],
  range: string,
  interval: string,
  lastSessionOnly = false,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>()
  if (symbols.length === 0) return out
  for (const host of YAHOO_HOSTS) {
    try {
      const res = await CapacitorHttp.get({
        url: `https://${host}.finance.yahoo.com/v7/finance/spark`,
        params: { symbols: symbols.join(','), range, interval },
        headers: { 'User-Agent': 'Mozilla/5.0 Nworth/1.0' },
      })
      if (res.status !== 200) continue
      const list = res.data?.spark?.result ?? []
      for (const item of list) {
        const sym = String(item?.symbol ?? '').toUpperCase()
        const resp = item?.response?.[0]
        const stamps: number[] = resp?.timestamp ?? []
        const rawCloses: any[] = resp?.indicators?.quote?.[0]?.close ?? []
        let pairs = rawCloses
          .map((c: any, i: number) => ({ c: Number(c), ts: Number(stamps[i] ?? 0) }))
          .filter((p) => p.c != null && isFinite(p.c) && p.c > 0)
        if (lastSessionOnly && pairs.length > 0) {
          const dayOf = (ts: number) => Math.floor(ts / 86400)
          const lastDay = dayOf(pairs[pairs.length - 1].ts)
          pairs = pairs.filter((p) => dayOf(p.ts) === lastDay)
        }
        if (sym) out.set(sym, pairs.map((p) => p.c))
      }
      return out // one host succeeded
    } catch {
      // try next host
    }
  }
  return out
}

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

  const remember = (t: string, closes: number[]) => {
    out.set(t, closes)
    // Only cache USABLE series. Caching an empty result was the bug that froze
    // rows on flat lines for 10 minutes (a failed first fetch stuck; only
    // newly-added tickers — absent from the cache — ever showed a chart).
    if (closes.length >= 2) _sparkCache.set(t, { at: now, closes })
  }

  // 1) Today's intraday chart (5-minute bars).
  const intraday = await sparkBatchSeries(need, '1d', '5m')
  let sparse: string[] = []
  for (const t of need) {
    const closes = intraday.get(t) ?? []
    if (closes.length >= 2) remember(t, closes)
    else sparse.push(t)
  }

  // 2) Whatever the spark endpoint couldn't serve falls back to the v8 CHART
  //    endpoint — the SAME fetcher the ticker-detail page uses, so if the
  //    detail page can draw a 1D line, the row sparkline can too. Yahoo's v8
  //    chart returns the last available session for range=1d even on
  //    weekends/holidays. Limited concurrency; 1-month daily as last resort.
  if (sparse.length > 0) {
    await mapLimit(sparse, 5, async (t) => {
      try {
        let closes = (await fetchHistory(t, '1d'))
          .map((p) => p.close)
          .filter((c): c is number => c != null && isFinite(c) && c > 0)
        if (closes.length < 2) {
          closes = (await fetchHistory(t, '1mo'))
            .map((p) => p.close)
            .filter((c): c is number => c != null && isFinite(c) && c > 0)
        }
        remember(t, closes)
      } catch {
        remember(t, [])
      }
    })
  }
  return out
}

// Run `fn` over items with at most `limit` in flight.
async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>): Promise<void> {
  const queue = items.slice()
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (item === undefined) break
      await fn(item)
    }
  })
  await Promise.all(workers)
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
      // Suffixless symbols were queried as ".us" → USD. Suffixed ones: unknown.
      currency: ticker.includes('.') ? null : 'USD',
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
  // Weekly candles at 5y keep the payload/chart-point count ~5× smaller —
  // same visual shape, no jank on older phones.
  const interval = range === '1d' ? '5m' : range === '5d' ? '60m' : range === '5y' || range === 'max' ? '1wk' : '1d'
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
      // Convert non-base-currency series with TODAY's FX rate. Approximation:
      // past points ignore historical FX movement — fine for shape/levels; a
      // rate-accurate series would need per-day FX history (out of scope).
      let k = 1
      let cur: string | null = typeof result?.meta?.currency === 'string' ? result.meta.currency : null
      const base = getRegion().currency
      if (cur && cur !== base) {
        if (MINOR_UNITS[cur]) { k = 1 / 100; cur = MINOR_UNITS[cur] }
        if (cur !== base) {
          const rate = await fxRate(cur, base)
          k = rate != null ? k * rate : 1  // FX down → leave native rather than blank
        }
      }
      const out: HistoryPoint[] = []
      for (let i = 0; i < stamps.length; i++) {
        const ts = stamps[i]
        out.push({
          timestamp: ts,
          date: new Date(ts * 1000).toISOString().slice(0, 10),
          close: closes[i] != null ? Number(closes[i]) * k : null,
        })
      }
      return out
    } catch {
      // Try next host.
    }
  }
  return []
}

// ── Symbol search (Yahoo v1 search, keyless) ───────────────────────────
// Powers ticker autocomplete in Add Holding / Watchlist and bare-ticker
// resolution (TCS → TCS.NS). Results ranked with the selected market's
// exchange suffixes first so local users see their home listing on top.
export interface SymbolMatch {
  symbol: string
  name: string
  exchange: string
  quoteType: string
}

const SEARCH_TYPES = new Set(['EQUITY', 'ETF', 'MUTUALFUND', 'CRYPTOCURRENCY', 'INDEX'])

export async function searchSymbols(query: string): Promise<SymbolMatch[]> {
  const q = query.trim()
  if (q.length < 1) return []
  for (const host of YAHOO_HOSTS) {
    try {
      const res = await CapacitorHttp.get({
        url: `https://${host}.finance.yahoo.com/v1/finance/search`,
        params: { q, quotesCount: '8', newsCount: '0', enableFuzzyQuery: 'false' },
        headers: { 'User-Agent': 'Mozilla/5.0 Nworth/1.0' },
      })
      if (res.status !== 200) continue
      const quotes: any[] = res.data?.quotes ?? []
      if (!Array.isArray(quotes)) continue
      const out: SymbolMatch[] = quotes
        .filter((it) => it?.symbol && SEARCH_TYPES.has(String(it?.quoteType ?? '').toUpperCase()))
        .map((it) => ({
          symbol: String(it.symbol).toUpperCase(),
          name: String(it.shortname ?? it.longname ?? ''),
          exchange: String(it.exchDisp ?? it.exchange ?? ''),
          quoteType: String(it.quoteType ?? '').toUpperCase(),
        }))
      // Home-market listings first, then Yahoo's own relevance order.
      const suffixes = getRegion().suffixes.filter(Boolean)
      if (suffixes.length > 0) {
        out.sort((a, b) => {
          const ai = suffixes.some((s) => a.symbol.endsWith(s)) ? 0 : 1
          const bi = suffixes.some((s) => b.symbol.endsWith(s)) ? 0 : 1
          return ai - bi
        })
      }
      if (out.length > 0) return out
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
// SQLite's CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" (UTC, space-separated,
// no zone). iOS JavaScriptCore won't parse that space form, returning NaN —
// and `Date.now() - NaN > TTL` is false, which would mark every cached row
// as permanently fresh and freeze prices after the first fetch. Normalise to
// ISO 8601 ("…THH:MM:SSZ") so TTL checks actually work. Unparseable → Infinity
// (treated as maximally stale) so we re-fetch rather than serve old data.
function cacheAgeMs(fetchedAt: unknown): number {
  const raw = String(fetchedAt ?? '')
  const iso = (raw.includes('T') ? raw : raw.replace(' ', 'T')).replace(/Z?$/, 'Z')
  const fetchedMs = Date.parse(iso)
  return isFinite(fetchedMs) ? Date.now() - fetchedMs : Infinity
}

async function readCache(ticker: string, ignoreTtl = false): Promise<PriceQuote | null> {
  const row = await dbGet<any>(
    `SELECT ticker, price, previous_close, day_change, day_change_percent, currency, fetched_at
     FROM market_prices WHERE ticker = ?`,
    [ticker],
  )
  if (!row) return null
  // Cached prices are stored converted to the base currency in effect when
  // written. If the user changed markets since, the row is in the WRONG
  // currency — treat as a miss so it's re-fetched and re-converted. (Legacy
  // rows with NULL currency predate conversion: they're USD-era values,
  // acceptable for the ignoreTtl last-resort path only.)
  const base = getRegion().currency
  if (row.currency != null && row.currency !== base) return null
  // `ignoreTtl` is the "every live source is down, serve whatever we have"
  // path. Otherwise enforce the freshness window.
  if (!ignoreTtl && cacheAgeMs(row.fetched_at) > PRICE_TTL_MS) return null
  return {
    ticker,
    price: row.price,
    previous_close: row.previous_close,
    day_change: row.day_change,
    day_change_percent: row.day_change_percent,
    source: 'cache',
    currency: row.currency ?? null,
  }
}

async function writeCache(q: PriceQuote): Promise<void> {
  await dbRun(
    `INSERT INTO market_prices (ticker, price, previous_close, day_change, day_change_percent, source, currency, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(ticker) DO UPDATE SET
       price = excluded.price,
       previous_close = excluded.previous_close,
       day_change = excluded.day_change,
       day_change_percent = excluded.day_change_percent,
       source = excluded.source,
       currency = excluded.currency,
       fetched_at = CURRENT_TIMESTAMP`,
    [q.ticker, q.price, q.previous_close, q.day_change, q.day_change_percent, q.source, q.currency ?? null],
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
  search: async (query: string) => {
    const results = await searchSymbols(query)
    return { data: results }
  },
  suggestions: async (query: string) => {
    const results = await searchSymbols(query)
    return { data: results }
  },
}
