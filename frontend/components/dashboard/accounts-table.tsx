'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { accountsApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

// Minimal shape we actually use here. The Zustand store has a slimmer
// Account type than `lib/api.ts` exports — both are valid for our purposes
// (we only need id/name/type/institution/balance) so accept the union.
interface AccountLike {
  id: number
  account_name: string
  account_type: string
  institution_name?: string
  balance?: number
}

interface AccountsTableProps {
  accounts: AccountLike[]
  onAccountChanged?: () => void
}

// Account types the user can pick. The first column is the value stored in
// SQLite; the second is the friendly label shown in the dropdown.
const ACCOUNT_TYPES: { value: string; label: string }[] = [
  { value: 'checking',        label: 'Checking' },
  { value: 'savings',         label: 'Savings' },
  { value: 'cash_management', label: 'Money Market / Cash Mgmt' },
  { value: 'brokerage',       label: 'Brokerage' },
  { value: 'traditional_ira', label: 'Traditional IRA' },
  { value: 'roth_ira',        label: 'Roth IRA' },
  { value: '401k',            label: '401(k)' },
  { value: 'hsa',             label: 'HSA' },
  { value: 'pension',         label: 'Pension' },
  { value: 'other',           label: 'Other' },
]

function typeLabel(v: string): string {
  return ACCOUNT_TYPES.find(t => t.value === v)?.label ?? v
}

const EMPTY_FORM = {
  account_name: '',
  account_type: 'checking',
  institution_name: '',
  balance: '',
}
type FormState = typeof EMPTY_FORM

const CASH_ACCOUNT_TYPES = new Set(['checking', 'savings', 'cash_management'])

export function AccountsTable({ accounts, onAccountChanged }: AccountsTableProps) {
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<AccountLike | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const cashTotal = accounts
    .filter(a => CASH_ACCOUNT_TYPES.has(a.account_type))
    .reduce((s, a) => s + (a.balance ?? 0), 0)
  const investTotal = accounts
    .filter(a => !CASH_ACCOUNT_TYPES.has(a.account_type))
    .reduce((s, a) => s + (a.balance ?? 0), 0)
  const total = cashTotal + investTotal

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  function openEdit(a: AccountLike) {
    setEditingId(a.id)
    setForm({
      account_name: a.account_name ?? '',
      account_type: a.account_type ?? 'checking',
      institution_name: a.institution_name ?? '',
      balance: String(a.balance ?? ''),
    })
    setError('')
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setError('')
    setEditingId(null)
  }

  const setField = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const name = form.account_name.trim()
    if (!name) return setError('Account name is required.')
    const balance = Number(form.balance || 0)
    if (!isFinite(balance)) return setError('Balance must be a number.')

    setSubmitting(true)
    try {
      const payload = {
        account_name: name,
        account_type: form.account_type,
        institution_name: form.institution_name.trim() || undefined,
        balance,
      }
      if (editingId !== null) {
        await accountsApi.update(editingId, payload as any)
      } else {
        await accountsApi.create(payload as any)
      }
      closeModal()
      onAccountChanged?.()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Failed to save the account.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeletingId(confirmDelete.id)
    try {
      await accountsApi.delete(confirmDelete.id)
      setConfirmDelete(null)
      onAccountChanged?.()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Failed to delete the account.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      {/* ── Add / Edit modal ─────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-card text-card-foreground border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold">{editingId ? 'Edit Account' : 'Add Account'}</h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground text-2xl leading-none" aria-label="Close">×</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Account Name <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="e.g. Chase Checking, Fidelity Brokerage"
                  value={form.account_name}
                  onChange={setField('account_name')}
                  autoCapitalize="words"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    value={form.account_type}
                    onChange={setField('account_type')}
                    className="border border-input rounded-md p-2 w-full text-sm bg-background text-foreground"
                  >
                    {ACCOUNT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Balance (USD)</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={form.balance}
                    onChange={setField('balance')}
                    inputMode="decimal"
                    step="any"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Institution <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input
                  placeholder="e.g. Chase, Fidelity, Robinhood"
                  value={form.institution_name}
                  onChange={setField('institution_name')}
                  autoCapitalize="words"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 border border-red-200 bg-red-50 dark:bg-red-950/20 rounded-md p-2">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? 'Saving…' : (editingId ? 'Save Changes' : 'Add Account')}
                </Button>
                <Button type="button" variant="outline" onClick={closeModal} className="flex-1">Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ─────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-card text-card-foreground border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold">Remove account?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Delete <span className="font-semibold text-foreground">{confirmDelete.account_name}</span>?
                Holdings linked to this account will keep their data but become orphaned.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDelete(null)}
                disabled={deletingId !== null}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDelete}
                disabled={deletingId !== null}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deletingId !== null ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Accounts card ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Cash &amp; Accounts</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Liquid cash:{' '}
              <span className="font-semibold text-foreground tabular-nums">{formatCurrency(cashTotal)}</span>
              {investTotal > 0 && (
                <>
                  {' '}·{' '}Investment accounts:{' '}
                  <span className="font-semibold text-foreground tabular-nums">{formatCurrency(investTotal)}</span>
                  {' '}·{' '}Total:{' '}
                  <span className="font-semibold text-foreground tabular-nums">{formatCurrency(total)}</span>
                </>
              )}
            </p>
          </div>
          <Button onClick={openAdd} size="sm">+ Add Account</Button>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No accounts yet.{' '}
              <button onClick={openAdd} className="underline text-primary hover:text-primary/80">
                Add your first account
              </button>
            </div>
          ) : (
            <div className="rounded-md border divide-y divide-border">
              {accounts.map(a => (
                <div key={a.id} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{a.account_name}</span>
                      <span className="text-[10px] capitalize border border-border rounded-full px-1.5 py-px text-muted-foreground">
                        {typeLabel(a.account_type)}
                      </span>
                    </div>
                    {a.institution_name && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.institution_name}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold tabular-nums">{formatCurrency(a.balance ?? 0)}</div>
                    <div className="flex gap-1 justify-end mt-1.5">
                      <button
                        onClick={() => openEdit(a)}
                        className="px-2 py-1 text-[11px] border border-border rounded hover:bg-accent"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDelete(a)}
                        disabled={deletingId === a.id}
                        className="px-2 py-1 text-[11px] border border-border rounded hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"
                      >
                        {deletingId === a.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
