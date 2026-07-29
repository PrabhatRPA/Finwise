'use client'

// Extra-payment simulator + balance trend for a single debt. Pick a debt, add an
// optional extra monthly principal (and/or a one-time lump sum), and compare the
// accelerated payoff against the baseline: two balance curves with the gap
// shaded, plus a baseline | accelerated | delta summary. Everything derives from
// the shared amortization engine (lib/amortization.ts) via loanSchedule(), so the
// two curves can never disagree. Nothing is required: debts missing rate/payment
// simply can't be projected and are shown with a plain note.

import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { currencySymbol, useRegion } from '@/lib/region'
import { loansApi } from '@/lib/api'
import { loanSchedule } from '@/lib/native/loans'

function fmtMonths(m: number): string {
  const y = Math.floor(m / 12)
  const r = m % 12
  if (y === 0) return `${r} mo`
  if (r === 0) return `${y} yr`
  return `${y} yr ${r} mo`
}

export function DebtSimulator() {
  useRegion()
  const [loans, setLoans] = useState<any[]>([])
  useEffect(() => {
    let cancelled = false
    loansApi.getAll()
      .then((res) => { if (!cancelled) setLoans(res.data?.loans ?? []) })
      .catch(() => { if (!cancelled) setLoans([]) })
    return () => { cancelled = true }
  }, [])
  // Only debts the engine can actually project (balance + rate + payment).
  const payable = useMemo(() => loans.filter((l) => loanSchedule(l) != null), [loans])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [extra, setExtra] = useState<number>(0)

  const loan = useMemo(
    () => payable.find((l) => l.id === (selectedId ?? payable[0]?.id)) ?? null,
    [payable, selectedId],
  )

  const base = useMemo(() => (loan ? loanSchedule(loan) : null), [loan])
  const accel = useMemo(
    () => (loan ? loanSchedule(loan, { extraMonthlyPrincipal: extra }) : null),
    [loan, extra],
  )

  // Combined daily-is-overkill: one point per month, carrying the accelerated
  // curve to 0 once it's paid off so the shaded band closes cleanly.
  const chart = useMemo(() => {
    if (!base) return []
    const b0 = (loan?.current_balance ?? 0)
    const out: { month: number; baseline: number; accelerated: number }[] = [
      { month: 0, baseline: b0, accelerated: b0 },
    ]
    for (let k = 1; k <= base.rows.length; k++) {
      const bBal = base.rows[k - 1].closingBalance / 100
      const aBal = accel && k - 1 < accel.rows.length ? accel.rows[k - 1].closingBalance / 100 : 0
      out.push({ month: k, baseline: bBal, accelerated: aBal })
    }
    return out
  }, [base, accel, loan])

  if (payable.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Payoff Simulator</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4">
            Add a debt with an interest rate and a monthly payment to project its payoff and
            see how extra payments would help.
          </p>
        </CardContent>
      </Card>
    )
  }

  const sym = currencySymbol()
  const interestSaved = base && accel ? (base.summary.totalInterest - accel.summary.totalInterest) / 100 : 0
  const monthsSaved = base && accel ? base.summary.termMonthsActual - accel.summary.termMonthsActual : 0

  const Row = ({ label, base: b, acc: a, delta, headline }: { label: string; base: string; acc: string; delta?: string; headline?: boolean }) => (
    <tr className={headline ? 'font-semibold' : ''}>
      <td className="py-1.5 pr-2 text-muted-foreground">{label}</td>
      <td className="py-1.5 px-2 text-right type-amount">{b}</td>
      <td className="py-1.5 px-2 text-right type-amount text-primary">{a}</td>
      <td className="py-1.5 pl-2 text-right type-amount text-positive">{delta ?? ''}</td>
    </tr>
  )

  return (
    <Card>
      <CardHeader><CardTitle>Payoff Simulator</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {/* Debt picker + extra-payment controls */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium block mb-1 text-muted-foreground">Debt</label>
            <select
              value={loan?.id ?? ''}
              onChange={(e) => { setSelectedId(Number(e.target.value)); }}
              className="w-full h-10 rounded-md border border-input bg-background text-foreground px-3 text-sm"
            >
              {payable.map((l) => (
                <option key={l.id} value={l.id}>{l.loan_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1 text-muted-foreground">Extra monthly principal</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{sym}</span>
              <input
                type="number" min="0" step="10"
                value={extra || ''}
                onChange={(e) => setExtra(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="0"
                className="w-full h-10 pl-7 pr-3 rounded-md border border-input bg-background text-sm"
              />
            </div>
            <input
              type="range" min={0} max={Math.max(500, Math.round((loan?.monthly_payment ?? 500)))} step={10}
              value={extra} onChange={(e) => setExtra(Number(e.target.value))}
              className="w-full mt-2 accent-primary"
            />
          </div>
        </div>

        {/* Overlay chart */}
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="accel-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="month" type="number"
              tickFormatter={(m: number) => (m % 12 === 0 ? `${m / 12}y` : '')}
              tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
            />
            <YAxis
              tickFormatter={(v: number) => `${sym}${v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)}`}
              tick={{ fontSize: 10 }} width={44} stroke="hsl(var(--muted-foreground))"
            />
            <Tooltip
              formatter={(v: any, name: any) => [formatCurrency(v as number), name === 'accelerated' ? 'With extra' : 'Baseline']}
              labelFormatter={(m: any) => `Month ${m} (${fmtMonths(Number(m))})`}
              contentStyle={{ fontSize: 12, borderRadius: 10 }}
            />
            {/* Baseline as a muted line; accelerated shaded so the gap = the win. */}
            <Area type="monotone" dataKey="baseline" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 3" fill="transparent" strokeWidth={1.5} isAnimationActive={false} dot={false} />
            <Area type="monotone" dataKey="accelerated" stroke="hsl(var(--primary))" fill="url(#accel-fill)" strokeWidth={2} isAnimationActive={false} dot={false} />
          </AreaChart>
        </ResponsiveContainer>

        {/* Headline delta */}
        {extra > 0 && base && accel && (
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="text-positive font-semibold">Saves {formatCurrency(interestSaved)} in interest</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-positive font-semibold">{fmtMonths(monthsSaved)} sooner</span>
          </div>
        )}

        {/* Comparison table */}
        {base && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="py-1.5 pr-2 text-left font-medium"></th>
                  <th className="py-1.5 px-2 text-right font-medium">Baseline</th>
                  <th className="py-1.5 px-2 text-right font-medium">With extra</th>
                  <th className="py-1.5 pl-2 text-right font-medium">You save</th>
                </tr>
              </thead>
              <tbody>
                <Row label="Payoff" base={base.summary.payoffDate} acc={accel?.summary.payoffDate ?? '—'} />
                <Row label="Time to payoff" base={fmtMonths(base.summary.termMonthsActual)} acc={accel ? fmtMonths(accel.summary.termMonthsActual) : '—'} delta={monthsSaved > 0 ? fmtMonths(monthsSaved) : ''} />
                <Row headline label="Total interest" base={formatCurrency(base.summary.totalInterest / 100)} acc={accel ? formatCurrency(accel.summary.totalInterest / 100) : '—'} delta={interestSaved > 0 ? formatCurrency(interestSaved) : ''} />
                <Row label="Total principal" base={formatCurrency(base.summary.totalPrincipal / 100)} acc={accel ? formatCurrency(accel.summary.totalPrincipal / 100) : '—'} />
                {base.summary.totalEscrow > 0 && (
                  <Row label="Total escrow" base={formatCurrency(base.summary.totalEscrow / 100)} acc={accel ? formatCurrency(accel.summary.totalEscrow / 100) : '—'} />
                )}
                <Row label="Total out of pocket" base={formatCurrency(base.summary.totalOutOfPocket / 100)} acc={accel ? formatCurrency(accel.summary.totalOutOfPocket / 100) : '—'} />
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          Estimate from the current balance, rate, and payment. Extra principal shortens the term;
          interest saved is a future benefit realized over the life of the loan, not an instant gain.
        </p>
      </CardContent>
    </Card>
  )
}
