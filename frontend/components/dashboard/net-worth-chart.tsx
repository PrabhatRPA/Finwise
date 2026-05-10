'use client'

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { netWorthApi } from '@/lib/api'

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`
}

export function NetWorthTrendChart() {
  const [points, setPoints] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    netWorthApi.getTrends(365)
      .then(r => {
        const data = r.data?.points ?? []
        setPoints(data.map((p: any) => ({ ...p, date: fmtDate(p.date) })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>

  if (points.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        <p>No trend data yet.</p>
        <p className="mt-1">Snapshots are recorded automatically each time you refresh the dashboard.</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={points}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={80} />
        <Tooltip formatter={(v) => fmt(v as number)} />
        <Legend />
        <Line type="monotone" dataKey="net_worth" name="Net Worth" stroke="#6366f1" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="investments" name="Portfolio" stroke="#22c55e" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        <Line type="monotone" dataKey="liabilities" name="Total Debt" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  )
}
