'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, formatCurrency } from '@/lib/utils'
import { holdingsApi } from '@/lib/api'
import { usePortfolioStore } from '@/lib/store'

interface HoldingsTableProps {
  holdings: any[]
  onHoldingAdded?: () => void
  searchQuery?: string
}

const SECURITY_TYPES = ['stock', 'etf', 'bond', 'crypto', 'reit', 'mutual_fund']

const EMPTY_FORM = {
  ticker: '',
  shares: '',
  average_cost: '',
  account_id: '',
  security_type: 'stock',
}

type FormState = typeof EMPTY_FORM

export function HoldingsTable({ holdings, onHoldingAdded, searchQuery = '' }: HoldingsTableProps) {
  const { accounts, totalValue } = usePortfolioStore()

  type SortField = 'ticker' | 'type' | 'shares' | 'avg_cost' | 'price' | 'value' | 'today_gain' | 'gain' | 'allocation'
  const [sortBy, setSortBy] = useState<SortField>('ticker')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
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
      case 'today_gain': va = a.today_gain_loss_percent ?? 0;                             vb = b.today_gain_loss_percent ?? 0; break
      case 'gain':       va = a.total_gain_loss_percent ?? 0;                              vb = b.total_gain_loss_percent ?? 0; break
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

  const gainCell = (pct: number, dollar: number) => {
    const colorClass = pct > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : pct < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground'
    const sign = pct > 0 ? '+' : ''
    return (
      <div className={`text-right ${colorClass}`}>
        <div className="text-sm font-medium">{sign}{pct.toFixed(2)}%</div>
        <div className="text-xs opacity-75">{sign}{formatCurrency(dollar)}</div>
      </div>
    )
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
    setForm({
      ticker: h.ticker || '',
      shares: String(h.shares || ''),
      average_cost: String(h.average_cost || ''),
      account_id: h.account_id ? String(h.account_id) : '',
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
    const accountId = form.account_id ? Number(form.account_id) : null

    if (!ticker) return setError('Ticker symbol is required.')
    if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker)) return setError('Enter a valid ticker (e.g. AAPL, BTC-USD).')
    if (!shares || shares <= 0) return setError('Shares must be greater than 0.')
    if (isNaN(avgCost) || avgCost < 0) return setError('Average cost must be 0 or more.')

    setIsSubmitting(true)
    try {
      const payload = {
        ticker,
        shares,
        average_cost: avgCost,
        account_id: accountId ?? undefined,
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
  const handleDelete = async (h: any) => {
    if (!window.confirm(`Remove ${h.ticker} from your holdings?`)) return
    setDeletingId(h.id)
    try {
      await holdingsApi.delete(h.id)
      onHoldingAdded?.()
    } catch {
      alert('Failed to delete. Check that the backend is running.')
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
                  disabled={editingId !== null}
                />
                {editingId !== null && (
                  <p className="text-xs text-muted-foreground mt-1">Ticker cannot be changed. Delete and re-add if needed.</p>
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
                <label className="block text-sm font-medium mb-1">Account</label>
                <select
                  value={form.account_id}
                  onChange={setField('account_id')}
                  className="border border-input rounded-md p-2 w-full text-sm bg-background text-foreground"
                >
                  <option value="">N/A — no account</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.account_name} ({a.account_type})</option>
                  ))}
                </select>
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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('ticker')}>
                    Ticker{sortIcon('ticker')}
                  </TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('type')}>
                    Type{sortIcon('type')}
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('shares')}>
                    Shares{sortIcon('shares')}
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('avg_cost')}>
                    Avg Cost{sortIcon('avg_cost')}
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('price')}>
                    Current Price{sortIcon('price')}
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('value')}>
                    Value{sortIcon('value')}
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('today_gain')}>
                    Today{sortIcon('today_gain')}
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('gain')}>
                    Total Gain/Loss{sortIcon('gain')}
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('allocation')}>
                    Allocation{sortIcon('allocation')}
                  </TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
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
                      <TableCell className="font-medium">{h.ticker}</TableCell>
                      <TableCell>
                        <span className="capitalize text-xs border border-border rounded-full px-2 py-0.5 text-muted-foreground">
                          {h.security_type || 'stock'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{h.shares ?? 0}</TableCell>
                      <TableCell className="text-right">{formatCurrency(h.average_cost ?? 0)}</TableCell>
                      <TableCell className="text-right">
                        {h.current_price > 0 ? (
                          <span className={
                            (h.total_gain_loss_percent ?? 0) > 0
                              ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                              : (h.total_gain_loss_percent ?? 0) < 0
                                ? 'text-red-600 dark:text-red-400 font-medium'
                                : ''
                          }>
                            {formatCurrency(h.current_price)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">fetching…</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(h.current_value ?? 0)}</TableCell>
                      <TableCell className="text-right">{gainCell(h.today_gain_loss_percent ?? 0, h.today_gain_loss ?? 0)}</TableCell>
                      <TableCell className="text-right">{gainCell(h.total_gain_loss_percent ?? 0, h.total_gain_loss ?? 0)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {totalValue > 0 ? ((h.current_value ?? 0) / totalValue * 100).toFixed(1) + '%' : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => openEdit(h)}
                            className="px-2 py-0.5 text-xs border rounded hover:bg-accent"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(h)}
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
        </CardContent>
      </Card>
    </>
  )
}
