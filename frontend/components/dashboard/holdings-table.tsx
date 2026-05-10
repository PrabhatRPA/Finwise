'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { holdingsApi } from '@/lib/api'
import { usePortfolioStore } from '@/lib/store'

interface HoldingsTableProps {
  holdings: any[]
  onHoldingAdded?: () => void
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

export function HoldingsTable({ holdings, onHoldingAdded }: HoldingsTableProps) {
  const { accounts, totalValue } = usePortfolioStore()

  type SortField = 'ticker' | 'type' | 'shares' | 'avg_cost' | 'price' | 'value' | 'gain' | 'allocation'
  const [sortBy, setSortBy] = useState<SortField>('ticker')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  // ── Sorting ─────────────────────────────────────────────────
  const sorted = [...holdings].sort((a, b) => {
    let va: any, vb: any
    switch (sortBy) {
      case 'ticker':   va = a.ticker || '';                      vb = b.ticker || ''; break
      case 'type':     va = a.security_type || '';               vb = b.security_type || ''; break
      case 'shares':   va = a.shares ?? 0;                       vb = b.shares ?? 0; break
      case 'avg_cost': va = a.average_cost ?? 0;                 vb = b.average_cost ?? 0; break
      case 'price':    va = a.current_price ?? 0;                vb = b.current_price ?? 0; break
      case 'value':    va = a.current_value ?? 0;                vb = b.current_value ?? 0; break
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

  const gainBadge = (pct: number) => {
    if (pct > 0) return <Badge variant="outline" className="text-green-600 border-green-600">+{pct.toFixed(2)}%</Badge>
    if (pct < 0) return <Badge variant="outline" className="text-red-600 border-red-600">{pct.toFixed(2)}%</Badge>
    return <Badge variant="outline">0%</Badge>
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

  // ── Render ────────────────────────────────────────────────
  return (
    <>
      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold">{editingId ? 'Edit Holding' : 'Add Holding'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none" aria-label="Close">×</button>
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
                  className="border rounded-md p-2 w-full text-sm"
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
                  className="border rounded-md p-2 w-full text-sm"
                >
                  <option value="">N/A — no account</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.account_name} ({a.account_type})</option>
                  ))}
                </select>
              </div>

              {form.shares && form.average_cost && (
                <div className="text-sm text-muted-foreground bg-gray-50 rounded-md p-3">
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
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('gain')}>
                    Gain/Loss{sortIcon('gain')}
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
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      No holdings yet.{' '}
                      <button onClick={openAdd} className="underline text-primary hover:text-primary/80">
                        Add your first holding
                      </button>
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map(h => (
                    <TableRow key={h.id ?? h.ticker}>
                      <TableCell className="font-medium">{h.ticker}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{h.security_type || 'stock'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{h.shares ?? 0}</TableCell>
                      <TableCell className="text-right">{formatCurrency(h.average_cost ?? 0)}</TableCell>
                      <TableCell className="text-right">
                        {h.current_price > 0
                          ? formatCurrency(h.current_price)
                          : <span className="text-muted-foreground text-xs">fetching…</span>}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(h.current_value ?? 0)}</TableCell>
                      <TableCell className="text-right">{gainBadge(h.total_gain_loss_percent ?? 0)}</TableCell>
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
                            className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40 text-lg leading-none px-1"
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
