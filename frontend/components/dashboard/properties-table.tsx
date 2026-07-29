'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { propertiesApi, PropertyItem } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { currencySymbol, useRegion } from '@/lib/region'

const PROPERTY_TYPES = [
  { value: 'single_family', label: 'Single-Family Home' },
  { value: 'condo',         label: 'Condo' },
  { value: 'apartment',     label: 'Apartment' },
  { value: 'townhouse',     label: 'Townhouse' },
  { value: 'multi_family',  label: 'Multi-Family' },
  { value: 'land',          label: 'Land / Lot' },
  { value: 'commercial',    label: 'Commercial' },
  { value: 'mobile_home',   label: 'Mobile Home' },
  { value: 'other',         label: 'Other' },
]

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]

function typeLabel(t: string) {
  return PROPERTY_TYPES.find(x => x.value === t)?.label ?? t
}

function sourceChip(src?: string) {
  if (!src) return null
  return (
    <Badge variant="outline" className="text-xs font-normal">Manual</Badge>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  initial?: PropertyItem
  onSave: (data: any) => Promise<void>
  onClose: () => void
}

function PropertyModal({ initial, onSave, onClose }: ModalProps) {
  useRegion()  // re-render currency symbols when the market setting changes
  const isEdit = !!initial
  const [form, setForm] = useState({
    property_type: initial?.property_type ?? 'single_family',
    nickname:       initial?.nickname ?? '',
    address:        initial?.address ?? '',
    city:           initial?.city ?? '',
    state:          initial?.state ?? '',
    zip_code:       initial?.zip_code ?? '',
    manual_value:   initial?.manual_value != null ? String(initial.manual_value) : '',
    purchase_price: initial?.purchase_price != null ? String(initial.purchase_price) : '',
    purchase_date:  initial?.purchase_date ?? '',
    notes:          initial?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.property_type) { setError('Property type is required'); return }

    const payload: any = {
      property_type: form.property_type,
      nickname:      form.nickname.trim() || undefined,
      address:       form.address.trim() || undefined,
      city:          form.city.trim() || undefined,
      state:         form.state.trim() || undefined,
      zip_code:      form.zip_code.trim() || undefined,
      notes:         form.notes.trim() || undefined,
    }
    if (form.manual_value !== '') {
      const v = Number(form.manual_value)
      if (isNaN(v) || v < 0) { setError('Manual value must be a positive number'); return }
      payload.manual_value = v
    } else {
      payload.manual_value = null
    }
    if (form.purchase_price !== '') {
      const v = Number(form.purchase_price)
      if (!isNaN(v) && v >= 0) payload.purchase_price = v
    }
    if (form.purchase_date) payload.purchase_date = form.purchase_date

    setSaving(true)
    try {
      await onSave(payload)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    // z-[60] keeps the sheet above the z-50 floating tab bar; the 80vh cap
    // keeps the Save/Cancel row clear of it.
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card text-card-foreground border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">{isEdit ? 'Edit Property' : 'Add Property'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type + Nickname */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Property type <span className="text-destructive">*</span></label>
              <select value={form.property_type} onChange={set('property_type')}
                className="border rounded-md px-3 py-2 text-sm w-full bg-background">
                {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nickname <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input value={form.nickname} onChange={set('nickname')} placeholder="e.g. Main Home" />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Street address <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </label>
            <Input value={form.address} onChange={set('address')} placeholder="123 Main St" />
          </div>

          {/* City / State / ZIP */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-sm font-medium mb-1">City</label>
              <Input value={form.city} onChange={set('city')} placeholder="Austin" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">State</label>
              <select value={form.state} onChange={set('state')}
                className="border rounded-md px-3 py-2 text-sm w-full bg-background">
                <option value="">—</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ZIP</label>
              <Input value={form.zip_code} onChange={set('zip_code')} placeholder="78701" maxLength={10} />
            </div>
          </div>

          {/* Values */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Current value</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{currencySymbol()}</span>
                <Input type="number" min="0" step="1000" value={form.manual_value}
                  onChange={set('manual_value')} placeholder="e.g. 450000" className="pl-6" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Purchase price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{currencySymbol()}</span>
                <Input type="number" min="0" step="1000" value={form.purchase_price}
                  onChange={set('purchase_price')} placeholder="0" className="pl-6" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Purchase date</label>
            <Input type="date" value={form.purchase_date} onChange={set('purchase_date')} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={2}
              placeholder="Rental income, renovation notes…"
              className="border rounded-md px-3 py-2 text-sm w-full resize-none bg-background"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add property'}
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

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { onPropertyChanged?: () => void }

export function PropertiesTable({ onPropertyChanged }: Props) {
  const [properties, setProperties] = useState<PropertyItem[]>([])
  const [totalValue, setTotalValue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<PropertyItem | undefined>()
  const [valueItem, setValueItem] = useState<PropertyItem | undefined>()  // "Update value" sheet target

  const load = useCallback(async () => {
    try {
      const res = await propertiesApi.getAll()
      setProperties(res.data.properties ?? [])
      setTotalValue(res.data.total_value ?? 0)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Tab bar ⊕ (only this table is mounted when the Properties tab is active).
  useEffect(() => {
    const onAdd = () => setShowModal(true)
    window.addEventListener('nworth:add-item', onAdd)
    return () => window.removeEventListener('nworth:add-item', onAdd)
  }, [])

  const handleAdd = async (data: any) => {
    await propertiesApi.create(data)
    setShowModal(false)
    await load()
    onPropertyChanged?.()
    try { window.dispatchEvent(new Event('nworth:properties-changed')) } catch {}
  }

  const handleEdit = async (data: any) => {
    if (!editItem) return
    await propertiesApi.update(editItem.id, data)
    setEditItem(undefined)
    await load()
    onPropertyChanged?.()
    try { window.dispatchEvent(new Event('nworth:properties-changed')) } catch {}
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this property from your portfolio?')) return
    await propertiesApi.delete(id)
    await load()
    onPropertyChanged?.()
    try { window.dispatchEvent(new Event('nworth:properties-changed')) } catch {}
  }

  const handleAddSnapshot = async (propertyId: number, data: { value: number; as_of_date?: string; note?: string | null }) => {
    await propertiesApi.addSnapshot(propertyId, data)
    setValueItem(undefined)
    await load()
    onPropertyChanged?.()
    try { window.dispatchEvent(new Event('nworth:properties-changed')) } catch {}
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )

  return (
    <>
      {showModal && (
        <PropertyModal
          onSave={handleAdd}
          onClose={() => setShowModal(false)}
        />
      )}
      {editItem && (
        <PropertyModal
          initial={editItem}
          onSave={handleEdit}
          onClose={() => setEditItem(undefined)}
        />
      )}
      {valueItem && (
        <UpdateValueSheet
          property={valueItem}
          onSave={(data) => handleAddSnapshot(valueItem.id, data)}
          onClose={() => setValueItem(undefined)}
        />
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Real Estate</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Total value: <span className="font-semibold text-foreground sensitive-amount">{formatCurrency(totalValue)}</span>
            </p>
          </div>
          <Button onClick={() => setShowModal(true)}>+ Add property</Button>
        </CardHeader>

        <CardContent>
          {properties.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg mb-1">No properties added yet</p>
              <p className="text-sm">Click &quot;+ Add property&quot; to track your real estate.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {properties.map(p => {
                const gain = p.purchase_price ? p.current_value - p.purchase_price : null
                const gainPct = gain != null && p.purchase_price ? (gain / p.purchase_price) * 100 : null

                return (
                  <div key={p.id} className="border rounded-lg p-4 space-y-2">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-base">
                            {p.nickname || p.address || typeLabel(p.property_type)}
                          </span>
                          <Badge variant="outline" className="capitalize text-xs">
                            {typeLabel(p.property_type)}
                          </Badge>
                          {sourceChip(p.valuation_source)}
                        </div>
                        {/* Address line */}
                        {(p.address || p.city) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {[p.address, p.city, p.state, p.zip_code].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm" variant="outline"
                          className="text-xs h-7 px-2"
                          onClick={() => setValueItem(p)}
                          title="Record a new value with a date"
                        >
                          Update value
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                          onClick={() => setEditItem(p)}>Edit</Button>
                        <Button size="sm" variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleDelete(p.id)}>Remove</Button>
                      </div>
                    </div>

                    {/* Value grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      <div>
                        <p className="text-xs text-muted-foreground">Current Value</p>
                        <p className="font-semibold sensitive-amount">{formatCurrency(p.current_value)}</p>
                        {p.manual_value != null && p.estimated_value != null && (
                          <p className="text-xs text-muted-foreground">
                            API: <span className="sensitive-amount">{formatCurrency(p.estimated_value)}</span>
                          </p>
                        )}
                      </div>
                      {p.purchase_price != null && (
                        <div>
                          <p className="text-xs text-muted-foreground">Purchase Price</p>
                          <p className="font-medium">{formatCurrency(p.purchase_price)}</p>
                          {p.purchase_date && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(p.purchase_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      )}
                      {gain != null && (
                        <div>
                          <p className="text-xs text-muted-foreground">Unrealised Gain</p>
                          <p className={`font-medium sensitive-amount ${gain >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {gain >= 0 ? '+' : ''}{formatCurrency(gain)}
                          </p>
                          {gainPct != null && (
                            <p className={`text-xs ${gainPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
                            </p>
                          )}
                        </div>
                      )}
                      {p.last_estimated_at && (
                        <div>
                          <p className="text-xs text-muted-foreground">Last Updated</p>
                          <p className="text-xs">{new Date(p.last_estimated_at).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>

                    {p.notes && (
                      <p className="text-xs text-muted-foreground border-t pt-2 mt-1">{p.notes}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// ─── Update-value sheet: add a dated value + browse/delete history ──────────────
function UpdateValueSheet({ property, onSave, onClose }: {
  property: PropertyItem
  onSave: (data: { value: number; as_of_date?: string; note?: string | null }) => Promise<void>
  onClose: () => void
}) {
  useRegion()
  const [value, setValue] = useState('')
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const loadSnaps = useCallback(async () => {
    try { const r = await propertiesApi.getSnapshots(property.id); setSnapshots(r.data.snapshots ?? []) } catch {}
  }, [property.id])
  useEffect(() => { loadSnaps() }, [loadSnaps])

  const sorted = [...snapshots].sort((a, b) =>
    (b.as_of_date).localeCompare(a.as_of_date) || (b.created_at || '').localeCompare(a.created_at || ''))
  const latest = sorted[0]
  const prev = sorted[1]
  const change = latest && prev ? latest.value - prev.value : null
  const changePct = change != null && prev && prev.value ? (change / prev.value) * 100 : null

  const save = async () => {
    const v = parseFloat(value)
    if (!isFinite(v) || v < 0) { setErr('Enter a valid value.'); return }
    setSaving(true); setErr('')
    try { await onSave({ value: v, as_of_date: asOf, note: note.trim() || null }) }
    catch (e: any) { setErr(e?.response?.data?.detail ?? e?.message ?? 'Could not save.'); setSaving(false) }
  }
  const del = async (id: number) => {
    setErr('')
    try { await propertiesApi.deleteSnapshot(id); await loadSnaps() }
    catch (e: any) { setErr(e?.response?.data?.detail ?? 'Could not delete.') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-md sm:rounded-lg rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Update value — {property.nickname || property.address || 'Property'}</h3>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none" aria-label="Close">×</button>
          </div>

          {latest && (
            <div>
              <p className="text-xs text-muted-foreground">Current value</p>
              <p className="text-2xl font-bold sensitive-amount">{formatCurrency(latest.value)}</p>
              {change != null && prev && (
                <p className={`text-xs ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {change >= 0 ? '+' : ''}{formatCurrency(change)}{changePct != null ? ` (${change >= 0 ? '+' : ''}${changePct.toFixed(1)}%)` : ''}
                  {' '}since {new Date(prev.as_of_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium block mb-1 text-muted-foreground">New value</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{currencySymbol()}</span>
                <input type="number" min="0" step="1000" value={value} onChange={e => setValue(e.target.value)} placeholder="0" className="w-full h-10 pl-7 pr-3 rounded-md border border-input bg-background text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1 text-muted-foreground">As of</label>
              <input type="date" value={asOf} max={new Date().toISOString().slice(0, 10)} onChange={e => setAsOf(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1 text-muted-foreground">Note (optional)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. appraisal" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" />
            </div>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <Button onClick={save} disabled={saving || !value} className="w-full">{saving ? 'Saving…' : 'Save value'}</Button>

          {sorted.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">History</p>
              <div className="divide-y divide-border rounded-md border max-h-48 overflow-y-auto">
                {sorted.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="type-amount sensitive-amount">{formatCurrency(s.value)}</span>
                      <span className="text-xs text-muted-foreground ml-2">{new Date(s.as_of_date).toLocaleDateString()}</span>
                      {s.note && <span className="text-xs text-muted-foreground ml-1 truncate">· {s.note}</span>}
                    </div>
                    <button onClick={() => del(s.id)} className="text-xs text-destructive/80 hover:text-destructive shrink-0 ml-2">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
