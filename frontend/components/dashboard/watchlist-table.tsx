'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { watchlistApi, WatchlistItem } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

// ─── helpers ─────────────────────────────────────────────────────────────────

function pctColor(pct: number | undefined) {
  if (pct === undefined || pct === null) return ''
  return pct >= 0 ? 'text-green-600' : 'text-red-500'
}

function dirLabel(dir?: string) {
  if (dir === 'above') return '↑ above'
  if (dir === 'below') return '↓ below'
  return '—'
}

function notifyLabel(method: string) {
  if (method === 'browser') return 'Browser'
  if (method === 'both') return 'In-app + Browser'
  return 'In-app'
}

// ─── modal ───────────────────────────────────────────────────────────────────

interface ModalProps {
  initial?: WatchlistItem
  onSave: (data: {
    ticker: string
    company_name?: string
    target_price?: number
    target_direction?: 'above' | 'below'
    notification_method: string
    notes?: string
  }) => Promise<void>
  onClose: () => void
}

function WatchlistModal({ initial, onSave, onClose }: ModalProps) {
  const isEdit = !!initial
  const [ticker, setTicker] = useState(initial?.ticker ?? '')
  const [companyName, setCompanyName] = useState(initial?.company_name ?? '')
  const [targetPrice, setTargetPrice] = useState(
    initial?.target_price != null ? String(initial.target_price) : ''
  )
  const [targetDirection, setTargetDirection] = useState<'above' | 'below' | ''>(
    (initial?.target_direction as 'above' | 'below') ?? ''
  )
  const [notifyMethod, setNotifyMethod] = useState(initial?.notification_method ?? 'in_app')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!ticker.trim()) { setError('Ticker is required'); return }
    if (targetPrice && isNaN(Number(targetPrice))) { setError('Target price must be a number'); return }
    if (targetPrice && Number(targetPrice) <= 0) { setError('Target price must be positive'); return }
    if (targetPrice && !targetDirection) { setError('Select a direction (above / below) when setting a target price'); return }

    setSaving(true)
    try {
      await onSave({
        ticker: ticker.toUpperCase().trim(),
        company_name: companyName.trim() || undefined,
        target_price: targetPrice ? Number(targetPrice) : undefined,
        target_direction: (targetDirection as 'above' | 'below') || undefined,
        notification_method: notifyMethod,
        notes: notes.trim() || undefined,
      })
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">{isEdit ? 'Edit Watchlist Item' : 'Add to Watchlist'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Ticker */}
          <div>
            <label className="block text-sm font-medium mb-1">Ticker symbol <span className="text-destructive">*</span></label>
            <Input
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
              disabled={isEdit}
              required
            />
          </div>

          {/* Company name */}
          <div>
            <label className="block text-sm font-medium mb-1">Company name <span className="text-muted-foreground font-normal">(optional, auto-filled)</span></label>
            <Input
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="Apple Inc."
            />
          </div>

          {/* Target price */}
          <div>
            <label className="block text-sm font-medium mb-1">Target price <span className="text-muted-foreground font-normal">(optional)</span></label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={targetPrice}
                  onChange={e => setTargetPrice(e.target.value)}
                  placeholder="0.00"
                  className="pl-6"
                />
              </div>
              <select
                value={targetDirection}
                onChange={e => setTargetDirection(e.target.value as 'above' | 'below' | '')}
                className="border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">— direction —</option>
                <option value="above">Alert when above ↑</option>
                <option value="below">Alert when below ↓</option>
              </select>
            </div>
          </div>

          {/* Notification method */}
          <div>
            <label className="block text-sm font-medium mb-1">Notification method</label>
            <select
              value={notifyMethod}
              onChange={e => setNotifyMethod(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm w-full bg-background"
            >
              <option value="in_app">In-app alert only</option>
              <option value="browser">Browser / desktop notification</option>
              <option value="both">Both in-app and browser</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Browser notifications require permission when an alert first fires.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Why you&apos;re watching this…"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add to watchlist'}
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export function WatchlistTable() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<WatchlistItem | undefined>()
  const [alerts, setAlerts] = useState<WatchlistItem[]>([])

  const load = useCallback(async () => {
    try {
      const res = await watchlistApi.getAll()
      const list: WatchlistItem[] = res.data.watchlist ?? []
      setItems(list)

      // Collect items that need browser notifications
      const active = list.filter(i => i.alert_active)
      setAlerts(active)

      // Fire browser notifications for items that want it
      const browserItems = active.filter(
        i => i.notification_method === 'browser' || i.notification_method === 'both'
      )
      if (browserItems.length > 0 && typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          browserItems.forEach(i => {
            new Notification(`${i.ticker} price alert`, {
              body: `${i.ticker} (${i.company_name}) is now ${formatCurrency(i.current_price ?? 0)} — ${i.target_direction} your target of ${formatCurrency(i.target_price ?? 0)}`,
              icon: '/favicon.ico',
            })
          })
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
              browserItems.forEach(i => {
                new Notification(`${i.ticker} price alert`, {
                  body: `${i.ticker} hit your target of ${formatCurrency(i.target_price ?? 0)}`,
                  icon: '/favicon.ico',
                })
              })
            }
          })
        }
      }
    } catch {
      // silently ignore — backend may not be running
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = async (data: Parameters<ModalProps['onSave']>[0]) => {
    await watchlistApi.create(data)
    setShowModal(false)
    await load()
  }

  const handleEdit = async (data: Parameters<ModalProps['onSave']>[0]) => {
    if (!editItem) return
    await watchlistApi.update(editItem.id, data)
    setEditItem(undefined)
    await load()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this stock from your watchlist?')) return
    await watchlistApi.delete(id)
    await load()
  }

  const handleAcknowledge = async (id: number) => {
    await watchlistApi.acknowledgeAlert(id)
    await load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <>
      {/* Modals */}
      {showModal && (
        <WatchlistModal onSave={handleAdd} onClose={() => setShowModal(false)} />
      )}
      {editItem && (
        <WatchlistModal
          initial={editItem}
          onSave={handleEdit}
          onClose={() => setEditItem(undefined)}
        />
      )}

      {/* In-app alert banner */}
      {alerts.filter(i => i.notification_method === 'in_app' || i.notification_method === 'both').map(item => (
        <div
          key={item.id}
          className="flex items-center justify-between bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-3 text-sm"
        >
          <span className="font-medium text-yellow-900">
            🔔 {item.ticker} hit your target — now {formatCurrency(item.current_price ?? 0)}
            {item.target_direction === 'above' ? ' (above' : ' (below'} {formatCurrency(item.target_price ?? 0)})
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-4 text-xs"
            onClick={() => handleAcknowledge(item.id)}
          >
            Dismiss
          </Button>
        </div>
      ))}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Watchlist</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Follow stocks and get alerted when they hit your target price
            </p>
          </div>
          <Button onClick={() => setShowModal(true)}>+ Add stock</Button>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg mb-1">No stocks on your watchlist yet</p>
              <p className="text-sm">Click &quot;+ Add stock&quot; to start tracking.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Ticker</th>
                    <th className="text-left py-2 pr-4 font-medium hidden md:table-cell">Company</th>
                    <th className="text-right py-2 pr-4 font-medium">Price</th>
                    <th className="text-right py-2 pr-4 font-medium hidden sm:table-cell">Day %</th>
                    <th className="text-right py-2 pr-4 font-medium">Target</th>
                    <th className="text-right py-2 pr-4 font-medium hidden sm:table-cell">% Away</th>
                    <th className="text-left py-2 pr-4 font-medium hidden lg:table-cell">Notify</th>
                    <th className="text-left py-2 pr-4 font-medium hidden lg:table-cell">Notes</th>
                    <th className="text-right py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map(item => (
                    <tr key={item.id} className={item.alert_active ? 'bg-yellow-50' : ''}>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{item.ticker}</span>
                          {item.alert_active && (
                            <span title="Alert active" className="text-yellow-500">🔔</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 hidden md:table-cell text-muted-foreground">
                        {item.company_name ?? '—'}
                      </td>
                      <td className="py-3 pr-4 text-right font-medium">
                        {item.current_price != null ? formatCurrency(item.current_price) : '—'}
                      </td>
                      <td className={`py-3 pr-4 text-right hidden sm:table-cell ${pctColor(item.day_change_percent)}`}>
                        {item.day_change_percent != null
                          ? `${item.day_change_percent >= 0 ? '+' : ''}${item.day_change_percent.toFixed(2)}%`
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {item.target_price != null ? (
                          <span className="inline-flex flex-col items-end gap-0.5">
                            <span>{formatCurrency(item.target_price)}</span>
                            <Badge variant="outline" className="text-xs font-normal">
                              {dirLabel(item.target_direction)}
                            </Badge>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={`py-3 pr-4 text-right hidden sm:table-cell ${item.pct_to_target != null ? pctColor(-item.pct_to_target) : ''}`}>
                        {item.pct_to_target != null
                          ? `${item.pct_to_target >= 0 ? '+' : ''}${item.pct_to_target.toFixed(1)}%`
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 hidden lg:table-cell text-muted-foreground text-xs">
                        {notifyLabel(item.notification_method)}
                      </td>
                      <td className="py-3 pr-4 hidden lg:table-cell text-muted-foreground text-xs max-w-[140px] truncate">
                        {item.notes || '—'}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setEditItem(item)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => handleDelete(item.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
