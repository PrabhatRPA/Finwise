'use client'
import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface AssetAllocationChartProps {
  holdings: any[]
}

export function AssetAllocationChart({ holdings }: AssetAllocationChartProps) {
  // Calculate allocation by sector
  const allocation: Record<string, number> = {}
  let totalValue = 0

  holdings.forEach((holding) => {
    const sector = holding.sector || 'Other'
    const value = holding.current_value || 0
    allocation[sector] = (allocation[sector] || 0) + value
    totalValue += value
  })

  const data = Object.entries(allocation)
    .map(([name, value]) => ({
      name,
      value,
      percentage: totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No data available
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis dataKey="name" type="category" width={100} />
        <Tooltip
          formatter={(value) => [
            new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value as number),
            'Value',
          ]}
        />
        <Bar dataKey="value" fill="#8884d8" barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  )
}
