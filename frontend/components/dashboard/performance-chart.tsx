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

interface PortfolioPerformanceChartProps {
  holdings: any[]
}

export function PortfolioPerformanceChart({ holdings }: PortfolioPerformanceChartProps) {
  const data = [
    { name: 'Stocks', value: 0, gain: 0 },
    { name: 'Bonds', value: 0, gain: 0 },
    { name: 'ETFs', value: 0, gain: 0 },
    { name: 'Cash', value: 0, gain: 0 },
  ]

  holdings.forEach((holding) => {
    const type = holding.security_type || 'stock'
    const value = holding.current_value || 0
    const gain = holding.total_gain_loss || 0

    if (type === 'stock') {
      data[0].value += value
      data[0].gain += gain
    } else if (type === 'bond') {
      data[1].value += value
      data[1].gain += gain
    } else if (type === 'etf') {
      data[2].value += value
      data[2].gain += gain
    } else if (type === 'cash' || type === 'other') {
      data[3].value += value
      data[3].gain += gain
    }
  })

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip
          formatter={(value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value as number)}
        />
        <Bar dataKey="value" name="Value" fill="#8884d8" />
        <Bar dataKey="gain" name="Gain/Loss" fill="#82ca9d" />
      </BarChart>
    </ResponsiveContainer>
  )
}
