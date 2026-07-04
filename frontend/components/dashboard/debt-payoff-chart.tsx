'use client'

// Debt-Free Countdown — projects every payable loan's balance forward with the
// same amortization math the app uses for net worth, and draws total debt
// descending to zero with an estimated debt-free date + per-loan payoff chips.

import { useEffect, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { loansApi } from '@/lib/api'
import { projectDebtSchedule, type DebtProjection } from '@/lib/native/loans'
import { formatCurrency } from '@/lib/utils'

function prettyMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${MONTHS[(m ?? 1) - 1]} ${y}`
}

export function DebtPayoffChart() {
  const [proj, setProj] = useState<DebtProjection | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    loansApi.getAll()
      .then((res: any) => {
        if (cancelled) return
        const loans = res.data?.loans ?? []
        setProj(projectDebtSchedule(loans))
      })
      .catch(() => { if (!cancelled) setProj(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) return null
  if (!proj || (proj.months.length <= 1 && proj.unpayable.length === 0)) return null

  const hasCurve = proj.months.length > 1 && proj.months[0].total > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Debt-Free Countdown</CardTitle>
        {proj.debtFreeDate ? (
          <p className="text-sm text-muted-foreground">
            At current payments you’re debt-free around{' '}
            <span className="font-semibold text-positive">{prettyMonth(proj.debtFreeDate)}</span>.
          </p>
        ) : hasCurve ? (
          <p className="text-sm text-muted-foreground">Projected paydown at current payments.</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {hasCurve && (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={proj.months} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="debt-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--negative))" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(var(--negative))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={48}
                tickFormatter={prettyMonth} />
              <YAxis hide domain={[0, 'auto']} />
              <Tooltip
                labelFormatter={(l: string) => prettyMonth(l)}
                formatter={(v: any) => [formatCurrency(v as number), 'Total debt']}
                contentStyle={{ fontSize: 12, borderRadius: 12 }}
              />
              <Area type="monotone" dataKey="total" stroke="hsl(var(--negative))" strokeWidth={2}
                fill="url(#debt-fill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Per-loan payoff chips */}
        {proj.payoffs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {proj.payoffs.map((p) => (
              <span key={p.loan_name}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-border bg-muted/50 text-[11px]">
                <span className="font-medium truncate max-w-[120px]">{p.loan_name}</span>
                <span className="type-amount text-positive font-semibold">✓ {prettyMonth(p.date)}</span>
              </span>
            ))}
          </div>
        )}

        {proj.unpayable.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Not projected: {proj.unpayable.map(u => `${u.loan_name} (${u.reason})`).join(' · ')}.
          </p>
        )}

        <p className="text-[10px] text-muted-foreground">
          Estimate from current balances, interest rates, and monthly payments — extra payments or rate changes will move the dates.
        </p>
      </CardContent>
    </Card>
  )
}
