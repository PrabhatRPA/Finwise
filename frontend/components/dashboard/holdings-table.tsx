'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, formatCurrency } from '@/lib/utils'
import { holdingsApi, accountsApi } from '@/lib/api'
import { usePortfolioStore } from '@/lib/store'

// ── Customizable columns ────────────────────────────────────────────────────
// Every data column the desktop holdings table can show. The actions (edit /
// delete) column is fixed and always rendered last, so it isn't listed here.
type SortField =
  | 'ticker' | 'shares' | 'price' | 'today_pct' | 'today_dollar' | 'day_change'
  | 'avg_cost' | 'gain_dollar' | 'gain' | 'value' | 'allocation' | 'type'

const COLUMN_DEFS: Record<SortField, { label: string; align: 'left' | 'right'; title?: string }> = {
  ticker:       { label: 'Ticker',       align: 'left' },
  shares:       { label: 'Shares',       align: 'right' },
  price:        { label: 'Price',        align: 'right' },
  today_pct:    { label: 'Today %',      align: 'right', title: "Today's % change in position value" },
  today_dollar: { label: 'Today $',      align: 'right', title: "Today's $ change (shares × per-share change)" },
  day_change:   { label: 'Day Δ',        align: 'right', title: "Per-share price change vs. yesterday's close" },
  avg_cost:     { label: 'Avg Cost',     align: 'right' },
  gain_dollar:  { label: 'Total G/L $',  align: 'right', title: 'Total gain/loss $ since purchase' },
  gain:         { label: 'Total G/L %',  align: 'right', title: 'Total gain/loss % since purchase' },
  value:        { label: 'Value',        align: 'right' },
  allocation:   { label: 'Alloc',        align: 'right' },
  type:         { label: 'Type',         align: 'left' },
}

// Default order requested by the user. New columns added to COLUMN_DEFS in
// future are appended automatically by mergeColumnPrefs().
const DEFAULT_COLUMN_ORDER: SortField[] = [
  'ticker', 'shares', 'price', 'today_pct', 'today_dollar', 'day_change',
  'avg_cost', 'gain_dollar', 'gain', 'value', 'allocation', 'type',
]

interface ColPref { id: SortField; visible: boolean }
const DEFAULT_COLS: ColPref[] = DEFAULT_COLUMN_ORDER.map(id => ({ id, visible: true }))
const COLS_STORAGE_KEY = 'holdings_columns_v1'

// Merge a saved preference with the current registry: keep the saved order &
// visibility, drop columns that no longer exist, and append any new ones. This
// keeps the user's layout stable across app updates without losing new columns.
function mergeColumnPrefs(saved: ColPref[]): ColPref[] {
  const known = new Set(DEFAULT_COLUMN_ORDER)
  const seen = new Set<SortField>()
  const merged: ColPref[] = []
  for (const c of saved) {
    if (known.has(c.id) && !seen.has(c.id)) {
      merged.push({ id: c.id, visible: c.visible !== false })
      seen.add(c.id)
    }
  }
  for (const id of DEFAULT_COLUMN_ORDER) {
    if (!seen.has(id)) merged.push({ id, visible: true })
  }
  return merged
}

function loadColumnPrefs(): ColPref[] {
  if (typeof window === 'undefined') return DEFAULT_COLS
  try {
    const raw = window.localStorage.getItem(COLS_STORAGE_KEY)
    if (!raw) return DEFAULT_COLS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_COLS
    return mergeColumnPrefs(parsed)
  } catch {
    return DEFAULT_COLS
  }
}

function saveColumnPrefs(cols: ColPref[]) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(cols)) } catch {}
}

const BROKER_SUGGESTIONS = [
  'Robinhood', 'Fidelity', 'Schwab', 'TD Ameritrade', 'E*TRADE', 'Vanguard',
  'Interactive Brokers', 'Webull', 'M1 Finance', 'Merrill Edge', 'Ally Invest',
  'Coinbase', 'Kraken', 'Gemini', 'Binance', 'SoFi', 'Public', 'Stash',
]

interface HoldingsTableProps {
  holdings: any[]
  // Refreshes data after add/edit/delete. Pass true to do a silent refresh
  // (no big spinner — keeps the table visible while live prices reload).
  onHoldingAdded?: (silent?: boolean) => void
  searchQuery?: string
}

const SECURITY_TYPES = ['stock', 'etf', 'bond', 'crypto', 'reit', 'mutual_fund']

const EMPTY_FORM = {
  ticker: '',
  shares: '',
  average_cost: '',
  account_name: '',
  security_type: 'stock',
}

type FormState = typeof EMPTY_FORM

export function HoldingsTable({ holdings, onHoldingAdded, searchQuery = '' }: HoldingsTableProps) {
  const { accounts, totalValue } = usePortfolioStore()
  const router = useRouter()

  // Open the ticker detail page (price chart + news + AI). Static export means
  // we pass the symbol as a query param rather than a dynamic route segment.
  const openTicker = (t?: string) => {
    const sym = (t || '').trim()
    if (sym) router.push(`/ticker/?symbol=${encodeURIComponent(sym)}`)
  }

  const [sortBy, setSortBy] = useState<SortField>('ticker')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Column layout (order + visibility), persisted to localStorage. Start from
  // defaults so server prerender + first paint match, then hydrate the saved
  // layout on mount to avoid an SSR/CSR mismatch.
  const [cols, setColsState] = useState<ColPref[]>(DEFAULT_COLS)
  const [showColPanel, setShowColPanel] = useState(false)
  useEffect(() => { setColsState(loadColumnPrefs()) }, [])

  const updateCols = (next: ColPref[]) => { setColsState(next); saveColumnPrefs(next) }
  const toggleColVisible = (id: SortField) =>
    updateCols(cols.map(c => c.id === id ? { ...c, visible: !c.visible } : c))
  const moveCol = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= cols.length) return
    const next = cols.slice()
    ;[next[index], next[j]] = [next[j], next[index]]
    updateCols(next)
  }
  const resetCols = () => updateCols(DEFAULT_COLS)

  const visibleCols = cols.filter(c => c.visible).map(c => c.id)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  // Inline confirmation modal — window.confirm() is unreliable in Tauri webview
  // (it sometimes never renders / silently returns false on macOS), which is
  // why "delete" appeared to do nothing.
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  // ── Filter by search query ───────────────────────────────────
  const q = searchQuery.trim().toLowerCase()
  const filtered = q
    ? holdings.filter(h =>
        (h.ticker || '').toLowerCase().includes(q) ||
        (h.company_name || '').toLowerCase().includes(q) ||
        (h.security_type || '').toLowerCase().includes(q)
      )
    : holdings

  // ── Sorting ─────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    let va: any, vb: any
    switch (sortBy) {
      case 'ticker':   va = a.ticker || '';                      vb = b.ticker || ''; break
      case 'type':     va = a.security_type || '';               vb = b.security_type || ''; break
      case 'shares':   va = a.shares ?? 0;                       vb = b.shares ?? 0; break
      case 'avg_cost': va = a.average_cost ?? 0;                 vb = b.average_cost ?? 0; break
      case 'price':    va = a.current_price ?? 0;                vb = b.current_price ?? 0; break
      case 'value':    va = a.current_value ?? 0;                vb = b.current_value ?? 0; break
      case 'today_pct':    va = a.today_gain_loss_percent ?? 0;                            vb = b.today_gain_loss_percent ?? 0; break
      case 'today_dollar': va = a.today_gain_loss ?? 0;                                    vb = b.today_gain_loss ?? 0; break
      case 'day_change':   va = a.day_change ?? 0;                                         vb = b.day_change ?? 0; break
      case 'gain':        va = a.total_gain_loss_percent ?? 0;                             vb = b.total_gain_loss_percent ?? 0; break
      case 'gain_dollar': va = a.total_gain_loss ?? 0;                                    vb = b.total_gain_loss ?? 0; break
      case 'allocation': va = totalValue > 0 ? (a.current_value ?? 0) / totalValue : 0; vb = totalValue > 0 ? (b.current_value ?? 0) / totalValue : 0; break
    }
    if (va < vb) return sortOrder === 'asc' ? -1 : 1
    if (va > vb) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const toggleSort = (field: SortField) => {
    if (sortBy === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortOrder('asc') }
  }

  const sortIcon = (field: SortField) =>
    sortBy === field ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''

  // Single-value cell coloured by the value's sign.
  const signedCell = (value: number, formatter: (v: number) => string) => {
    const colorClass = value > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : value < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground'
    const sign = value > 0 ? '+' : ''
    return (
      <span className={`text-sm font-medium ${colorClass}`}>
        {sign}{formatter(value)}
      </span>
    )
  }
  const pctCell = (pct: number) => signedCell(pct, v => `${v.toFixed(2)}%`)
  const dollarCell = (n: number) => signedCell(n, formatCurrency)

  // Render a single desktop-table cell for the given column + holding.
  const renderCell = (id: SortField, h: any): React.ReactNode => {
    switch (id) {
      case 'ticker':       return (
        <button
          onClick={() => openTicker(h.ticker)}
          className="font-medium text-primary hover:underline"
          title={`View ${h.ticker} chart & news`}
        >
          {h.ticker}
        </button>
      )
      case 'type':         return (
        <span className="capitalize text-xs border border-border rounded-full px-2 py-0.5 text-muted-foreground">
          {h.security_type || 'stock'}
        </span>
      )
      case 'shares':       return h.shares ?? 0
      case 'avg_cost':     return formatCurrency(h.average_cost ?? 0)
      case 'price':        return h.current_price > 0 ? (
        <span className={
          (h.total_gain_loss_percent ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium'
          : (h.total_gain_loss_percent ?? 0) < 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''
        }>{formatCurrency(h.current_price)}</span>
      ) : <span className="text-muted-foreground text-xs">fetching…</span>
      case 'value':        return <span className="font-medium">{formatCurrency(h.current_value ?? 0)}</span>
      case 'today_pct':    return pctCell(h.today_gain_loss_percent ?? 0)
      case 'today_dollar': return dollarCell(h.today_gain_loss ?? 0)
      case 'day_change':   return dollarCell(h.day_change ?? 0)
      case 'gain':         return pctCell(h.total_gain_loss_percent ?? 0)
      case 'gain_dollar':  return dollarCell(h.total_gain_loss ?? 0)
      case 'allocation':   return (
        <span className="text-sm text-muted-foreground">
          {totalValue > 0 ? ((h.current_value ?? 0) / totalValue * 100).toFixed(1) + '%' : '—'}
        </span>
      )
      default:             return null
    }
  }

  // ── Modal open/close ─────────────────────────────────────────
  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  function openEdit(h: any) {
    setEditingId(h.id)
    const acct = accounts.find(a => a.id === h.account_id)
    setForm({
      ticker: h.ticker || '',
      shares: String(h.shares || ''),
      average_cost: String(h.average_cost || ''),
      account_name: acct?.account_name ?? acct?.institution_name ?? '',
      security_type: h.security_type || 'stock',
    })
    setError('')
    setShowModal(true)
  }

  function closeModal() { setShowModal(false); setError(''); setEditingId(null) }

  const setField = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  // ── Submit (add or edit) ─────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const ticker = form.ticker.trim().toUpperCase()
    const shares = Number(form.shares)
    const avgCost = Number(form.average_cost)

    if (!ticker) return setError('Ticker symbol is required.')
    if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker)) return setError('Enter a valid ticker (e.g. AAPL, BTC-USD).')
    if (!shares || shares <= 0) return setError('Shares must be greater than 0.')
    if (isNaN(avgCost) || avgCost < 0) return setError('Average cost must be 0 or more.')

    setIsSubmitting(true)
    try {
      // Resolve broker name → account_id (look up existing or auto-create)
      let resolvedAccountId: number | undefined = undefined
      const brokerName = form.account_name.trim()
      if (brokerName) {
        const existing = accounts.find(a =>
          a.account_name?.toLowerCase() === brokerName.toLowerCase() ||
          (a.institution_name && a.institution_name.toLowerCase() === brokerName.toLowerCase())
        )
        if (existing) {
          resolvedAccountId = existing.id
        } else {
          try {
            const res = await accountsApi.create({
              account_name: brokerName,
              account_type: 'brokerage',
              institution_name: brokerName,
            } as any)
            resolvedAccountId = res.data.id
          } catch { /* submit without account on error */ }
        }
      }

      const payload = {
        ticker,
        shares,
        average_cost: avgCost,
        account_id: resolvedAccountId,
        security_type: form.security_type,
      }

      if (editingId !== null) {
        await holdingsApi.update(editingId, payload)
      } else {
        await holdingsApi.create(payload)
      }

      closeModal()
      onHoldingAdded?.()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(
        Array.isArray(detail)
          ? detail.map((e: any) => e.msg || e.type || JSON.stringify(e)).join('; ')
          : (typeof detail === 'string' ? detail : 'Failed to save. Make sure the backend is running.')
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────
  // Two-step: row × button sets confirmDelete (opens modal), modal's Delete
  // button calls confirmAndDelete. Avoids window.confirm() which is flaky
  // inside Tauri's webview on macOS.
  const confirmAndDelete = async () => {
    const h = confirmDelete
    if (!h) return
    setDeletingId(h.id)
    try {
      await holdingsApi.delete(h.id)
      setConfirmDelete(null)
      // Silent refresh so the user doesn't see the big "Loading…" spinner
      // re-appear right after deleting.
      onHoldingAdded?.(true)
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? 'Failed to delete. Check that the backend is running.'
      setError(typeof detail === 'string' ? detail : 'Failed to delete.')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Today's portfolio P&L summary (computed from all holdings) ──────────
  const todayGainTotal = holdings.reduce((sum, h) => sum + (h.today_gain_loss ?? 0), 0)
  const prevPortfolioValue = holdings.reduce((sum, h) => sum + Math.max(0, (h.current_value ?? 0) - (h.today_gain_loss ?? 0)), 0)
  const todayGainPct = prevPortfolioValue > 0 ? (todayGainTotal / prevPortfolioValue) * 100 : 0
  const hasTodayData = holdings.some(h => (h.today_gain_loss_percent ?? 0) !== 0)

  // ── Render ────────────────────────────────────────────────
  return (
    <>
      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-card text-card-foreground border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold">{editingId ? 'Edit Holding' : 'Add Holding'}</h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground text-2xl leading-none" aria-label="Close">×</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Ticker Symbol <span className="text-red-500">*</span></label>
                <Input
                  placeholder="e.g. AAPL, MSFT, BTC-USD"
                  value={form.ticker}
                  onChange={setField('ticker')}
                  className="uppercase"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {editingId !== null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Changing the ticker re-links this holding; its price refreshes on save.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Shares <span className="text-red-500">*</span></label>
                  <Input
                    type="number"
                    placeholder="e.g. 10"
                    value={form.shares}
                    onChange={setField('shares')}
                    min="0"
                    step="any"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Avg Cost (USD)</label>
                  <Input
                    type="number"
                    placeholder="e.g. 150.00"
                    value={form.average_cost}
                    onChange={setField('average_cost')}
                    min="0"
                    step="any"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={form.security_type}
                  onChange={setField('security_type')}
                  className="border border-input rounded-md p-2 w-full text-sm bg-background text-foreground"
                >
                  {SECURITY_TYPES.map(t => (
                    <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Broker / Account</label>
                <input
                  list="broker-suggestions"
                  placeholder="e.g. Robinhood, Fidelity, Schwab"
                  value={form.account_name}
                  onChange={setField('account_name')}
                  className="border border-input rounded-md px-3 py-2 w-full text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <datalist id="broker-suggestions">
                  {[...BROKER_SUGGESTIONS, ...accounts.map(a => a.account_name)].map(n => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground mt-1">
                  Type a broker name — a new account is created automatically if it doesn&apos;t exist yet.
                </p>
              </div>

              {form.shares && form.average_cost && (
                <div className="text-sm text-muted-foreground bg-muted rounded-md p-3">
                  Cost basis:{' '}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(Number(form.shares) * Number(form.average_cost))}
                  </span>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-md p-2">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <Button type="submit" disabled={isSubmitting} className="flex-1">
                  {isSubmitting ? 'Saving…' : (editingId ? 'Save Changes' : 'Add Holding')}
                </Button>
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1">Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal (replaces window.confirm, flaky in Tauri) ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-card text-card-foreground border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold">Remove holding?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Delete <span className="font-semibold text-foreground">{confirmDelete.ticker}</span>
                {confirmDelete.shares ? <> ({confirmDelete.shares} shares)</> : null} from your holdings.
                This can&apos;t be undone.
              </p>
            </div>
            {error && (
              <p className="text-sm text-red-600 border border-red-200 bg-red-50 dark:bg-red-950/20 rounded-md p-2">{error}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setConfirmDelete(null); setError('') }}
                disabled={deletingId !== null}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={confirmAndDelete}
                disabled={deletingId !== null}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deletingId !== null ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Holdings Table Card ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Holdings</CardTitle>
          <Button onClick={openAdd} size="sm">+ Add Holding</Button>
        </CardHeader>

        {/* ── Today's total P&L banner ── */}
        {hasTodayData && (
          <div className="px-6 pb-3">
            <div className={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm',
              todayGainTotal >= 0
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
            )}>
              <span className="text-muted-foreground font-medium">Today&apos;s Portfolio P&amp;L</span>
              <span className={cn(
                'text-base font-bold',
                todayGainTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              )}>
                {todayGainTotal >= 0 ? '+' : ''}{formatCurrency(todayGainTotal)}
              </span>
              <span className={cn(
                'font-medium',
                todayGainTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              )}>
                ({todayGainTotal >= 0 ? '+' : ''}{todayGainPct.toFixed(2)}%)
              </span>
              <span className="text-xs text-muted-foreground ml-auto">vs. yesterday&apos;s close</span>
            </div>
          </div>
        )}

        <CardContent>
          {/* ── Mobile card list (sm:hidden) ─────────────────────────────
              The 12-column desktop table doesn't fit on a phone screen, so
              under md we render each holding as a stacked card with the key
              numbers up top and a Edit / Delete row at the bottom. */}
          <div className="md:hidden rounded-md border divide-y divide-border">
            {sorted.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                {q ? `No holdings match "${searchQuery}".` : (
                  <>No holdings yet.{' '}
                    <button onClick={openAdd} className="underline text-primary hover:text-primary/80">
                      Add your first holding
                    </button>
                  </>
                )}
              </div>
            ) : (
              sorted.map(h => {
                const gainPct = h.total_gain_loss_percent ?? 0
                const gainColor = gainPct > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : gainPct < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                const todayPct = h.today_gain_loss_percent ?? 0
                const todayColor = todayPct > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : todayPct < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                const alloc = totalValue > 0 ? ((h.current_value ?? 0) / totalValue * 100) : 0
                return (
                  <div key={h.id ?? h.ticker} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openTicker(h.ticker)}
                            className="font-semibold text-base text-primary hover:underline"
                          >
                            {h.ticker}
                          </button>
                          <span className="capitalize text-[10px] border border-border rounded-full px-1.5 py-px text-muted-foreground">
                            {h.security_type || 'stock'}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {h.shares ?? 0} sh · avg {formatCurrency(h.average_cost ?? 0)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold text-base">{formatCurrency(h.current_value ?? 0)}</div>
                        <div className={`text-xs font-medium ${gainColor}`}>
                          {gainPct > 0 ? '+' : ''}{gainPct.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Price</div>
                        <div className="font-medium">
                          {h.current_price && h.current_price > 0
                            ? formatCurrency(h.current_price)
                            : <span className="text-muted-foreground">—</span>}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Today</div>
                        <div className={`font-medium ${todayColor}`}>
                          {todayPct > 0 ? '+' : ''}{todayPct.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Alloc</div>
                        <div className="font-medium">{alloc.toFixed(1)}%</div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => openEdit(h)}
                        className="flex-1 py-1.5 text-xs border border-border rounded-md hover:bg-accent"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDelete(h)}
                        disabled={deletingId === h.id}
                        className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"
                        aria-label={`Delete ${h.ticker}`}
                      >
                        {deletingId === h.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* ── Desktop table (md and up) ────────────────────────────── */}
          <div className="hidden md:block">
            {/* Column customization toolbar — small, right-aligned so it stays
                out of the way until the user wants it. */}
            <div className="relative flex justify-end mb-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowColPanel(s => !s)}
                className="text-xs gap-1.5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                Columns
              </Button>

              {showColPanel && (
                <>
                  {/* click-away backdrop */}
                  <div className="fixed inset-0 z-40" onClick={() => setShowColPanel(false)} />
                  <div className="absolute right-0 top-9 z-50 w-64 rounded-lg border border-border bg-card shadow-xl p-2">
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span className="text-xs font-semibold">Customize columns</span>
                      <button onClick={resetCols} className="text-xs text-primary hover:underline">Reset</button>
                    </div>
                    <p className="px-2 pb-1.5 text-[10px] text-muted-foreground">
                      Toggle visibility · use ↑ ↓ to reorder.
                    </p>
                    <div className="max-h-72 overflow-y-auto">
                      {cols.map((c, i) => (
                        <div key={c.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/50">
                          <input
                            type="checkbox"
                            checked={c.visible}
                            onChange={() => toggleColVisible(c.id)}
                            className="shrink-0"
                            aria-label={`Show ${COLUMN_DEFS[c.id].label}`}
                          />
                          <span className="flex-1 text-xs truncate">{COLUMN_DEFS[c.id].label}</span>
                          <button
                            onClick={() => moveCol(i, -1)}
                            disabled={i === 0}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-25 text-xs px-1"
                            aria-label={`Move ${COLUMN_DEFS[c.id].label} up`}
                          >↑</button>
                          <button
                            onClick={() => moveCol(i, 1)}
                            disabled={i === cols.length - 1}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-25 text-xs px-1"
                            aria-label={`Move ${COLUMN_DEFS[c.id].label} down`}
                          >↓</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-md border">
              {/* Tighter padding via the [&_th]/[&_td] arbitrary descendant selectors
                  keeps the shared <Table> primitive compact. Columns + order are
                  driven by `visibleCols` (user-customizable, persisted). */}
              <Table className="[&_th]:px-2 [&_th]:h-10 [&_th]:text-xs [&_td]:px-2 [&_td]:py-2.5">
                <TableHeader>
                  <TableRow>
                    {visibleCols.map(id => {
                      const def = COLUMN_DEFS[id]
                      return (
                        <TableHead
                          key={id}
                          className={cn('cursor-pointer select-none whitespace-nowrap', def.align === 'right' && 'text-right')}
                          onClick={() => toggleSort(id)}
                          title={def.title}
                        >
                          {def.label}{sortIcon(id)}
                        </TableHead>
                      )
                    })}
                    <TableHead className="w-14" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={visibleCols.length + 1} className="text-center py-10 text-muted-foreground">
                        {q ? `No holdings match "${searchQuery}".` : (
                          <>No holdings yet.{' '}
                            <button onClick={openAdd} className="underline text-primary hover:text-primary/80">
                              Add your first holding
                            </button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map(h => (
                      <TableRow key={h.id ?? h.ticker}>
                        {visibleCols.map(id => (
                          <TableCell
                            key={id}
                            className={cn(COLUMN_DEFS[id].align === 'right' && 'text-right')}
                          >
                            {renderCell(id, h)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => openEdit(h)}
                              className="px-2 py-0.5 text-xs border rounded hover:bg-accent"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setConfirmDelete(h)}
                              disabled={deletingId === h.id}
                              className="text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-40 text-lg leading-none px-1"
                              aria-label={`Delete ${h.ticker}`}
                            >
                              {deletingId === h.id ? '…' : '×'}
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
