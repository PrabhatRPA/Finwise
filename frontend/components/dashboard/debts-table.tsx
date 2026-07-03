'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { loansApi, type Loan, type LoanCreate } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

const LOAN_TYPE_LABELS: Record<string, string> = {
  mortgage: 'Home Loan / Mortgage',
  auto: 'Auto / Car Loan',
  credit_card: 'Credit Card',
  student: 'Student Loan',
  personal: 'Personal Loan',
  business: 'Business Loan',
  home_equity: 'Home Equity',
  line_of_credit: 'Line of Credit',
  other: 'Other',
}

const LOAN_TYPE_COLORS: Record<string, string> = {
  mortgage: 'bg-blue-100 text-blue-800',
  auto: 'bg-purple-100 text-purple-800',
  credit_card: 'bg-red-100 text-red-800',
  student: 'bg-yellow-100 text-yellow-800',
  personal: 'bg-orange-100 text-orange-800',
  business: 'bg-indigo-100 text-indigo-800',
  home_equity: 'bg-teal-100 text-teal-800',
  line_of_credit: 'bg-pink-100 text-pink-800',
  other: 'bg-gray-100 text-gray-800',
}

const BLANK_FORM: LoanCreate = {
  loan_name: '',
  loan_type: 'mortgage',
  original_balance: 0,
  current_balance: 0,
  interest_rate: undefined,
  monthly_payment: undefined,
  lender_name: '',
}

interface Props {
  onDebtChanged: () => void
}

export function DebtsTable({ onDebtChanged }: Props) {
  const [loans, setLoans] = useState<Loan[]>([])
  const [totalDebt, setTotalDebt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<LoanCreate>(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchLoans() }, [])

  async function fetchLoans() {
    setLoading(true)
    try {
      const r = await loansApi.getAll()
      setLoans(r.data.loans ?? [])
      setTotalDebt(r.data.total_debt ?? 0)
    } catch {
      setError('Failed to load debts.')
    } finally {
      setLoading(false)
    }
  }

  function openAdd() {
    setEditingId(null)
    setForm(BLANK_FORM)
    setError(null)
    setShowForm(true)
  }

  function openEdit(loan: Loan) {
    setEditingId(loan.id)
    setForm({
      loan_name: loan.loan_name,
      loan_type: loan.loan_type,
      original_balance: loan.original_balance,
      current_balance: loan.current_balance,
      interest_rate: loan.interest_rate ?? undefined,
      monthly_payment: loan.monthly_payment ?? undefined,
      lender_name: loan.lender_name ?? '',
    })
    setError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setError(null)
  }

  function setField(key: keyof LoanCreate, value: any) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.loan_name.trim()) { setError('Debt name is required.'); return }
    if (form.current_balance < 0) { setError('Balance cannot be negative.'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
        original_balance: form.original_balance || form.current_balance,
        interest_rate: form.interest_rate || undefined,
        monthly_payment: form.monthly_payment || undefined,
        lender_name: form.lender_name || undefined,
      }
      if (editingId !== null) {
        await loansApi.update(editingId, payload)
      } else {
        await loansApi.create(payload)
      }
      closeForm()
      await fetchLoans()
      onDebtChanged()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"?`)) return
    try {
      await loansApi.delete(id)
      await fetchLoans()
      onDebtChanged()
    } catch {
      alert('Delete failed.')
    }
  }

  async function handleMarkPaidOff(loan: Loan) {
    try {
      await loansApi.update(loan.id, { status: 'paid_off', current_balance: 0 })
      await fetchLoans()
      onDebtChanged()
    } catch {
      alert('Update failed.')
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Loading debts…</div>
  }

  return (
    <div className="space-y-4">
      {/* Summary + Add button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Total outstanding debt</p>
          <p className="text-2xl font-bold text-destructive">{formatCurrency(totalDebt)}</p>
        </div>
        <Button onClick={openAdd}>+ Add Debt</Button>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">{editingId ? 'Edit Debt' : 'Add New Debt'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium block mb-1">Debt Name *</label>
                <input
                  type="text"
                  value={form.loan_name}
                  onChange={e => setField('loan_name', e.target.value)}
                  placeholder="e.g. Chase Mortgage, Toyota Car Loan"
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Type *</label>
                <select
                  value={form.loan_type}
                  onChange={e => setField('loan_type', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                >
                  {Object.entries(LOAN_TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Current Balance *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.current_balance || ''}
                    onChange={e => setField('current_balance', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 border rounded-md text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Original Balance</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.original_balance || ''}
                    onChange={e => setField('original_balance', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 border rounded-md text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Interest Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.interest_rate ?? ''}
                  onChange={e => setField('interest_rate', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="e.g. 6.75"
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Monthly Payment</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.monthly_payment ?? ''}
                    onChange={e => setField('monthly_payment', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 border rounded-md text-sm"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium block mb-1">Lender</label>
                <input
                  type="text"
                  value={form.lender_name ?? ''}
                  onChange={e => setField('lender_name', e.target.value)}
                  placeholder="e.g. Chase Bank, Wells Fargo"
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : (editingId ? 'Update' : 'Add Debt')}
              </Button>
              <Button variant="outline" onClick={closeForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debt list */}
      {loans.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No debts added yet. Click <strong>+ Add Debt</strong> to track a loan or liability.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-right px-4 py-3 font-medium">Balance</th>
                    <th className="text-right px-4 py-3 font-medium">Rate</th>
                    <th className="text-right px-4 py-3 font-medium">Payment/mo</th>
                    <th className="text-left px-4 py-3 font-medium">Lender</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan, i) => (
                    <tr
                      key={loan.id}
                      className={`border-b last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}
                    >
                      <td className="px-4 py-3 font-medium">{loan.loan_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LOAN_TYPE_COLORS[loan.loan_type] ?? LOAN_TYPE_COLORS.other}`}>
                          {LOAN_TYPE_LABELS[loan.loan_type] ?? loan.loan_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold text-destructive">{formatCurrency(loan.current_balance)}</div>
                        {(loan as any).next_principal > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">
                            next pmt: {formatCurrency((loan as any).next_interest)} int · {formatCurrency((loan as any).next_principal)} prin
                          </div>
                        )}
                        {(loan as any).amortizing && (loan as any).principal_paid_to_date > 0 && (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 whitespace-nowrap">
                            −{formatCurrency((loan as any).principal_paid_to_date)} paid down
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {loan.interest_rate != null ? `${loan.interest_rate}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {loan.monthly_payment != null ? formatCurrency(loan.monthly_payment) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {loan.lender_name || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => openEdit(loan)}
                            className="px-2 py-1 text-xs border rounded hover:bg-accent"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleMarkPaidOff(loan)}
                            className="px-2 py-1 text-xs border rounded hover:bg-accent text-green-700"
                            title="Mark as paid off (removes from debt total)"
                          >
                            Paid Off
                          </button>
                          <button
                            onClick={() => handleDelete(loan.id, loan.loan_name)}
                            className="px-2 py-1 text-xs border rounded hover:bg-destructive/10 text-destructive"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/40 font-semibold">
                    <td className="px-4 py-3" colSpan={2}>Total Debt</td>
                    <td className="px-4 py-3 text-right text-destructive">{formatCurrency(totalDebt)}</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground px-4 py-3 border-t leading-relaxed">
              Installment loans (mortgage, auto, student, personal) show an <span className="font-medium">estimated</span> balance
              that pays down each month from your rate &amp; payment — so your net worth improves over time without re-typing it.
              Credit cards &amp; lines of credit stay at the balance you enter. Edit a debt to reset its balance anytime.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
