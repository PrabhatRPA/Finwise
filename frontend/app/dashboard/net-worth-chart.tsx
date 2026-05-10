'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface NetWorthTrendChartProps {}

export function NetWorthTrendChart({}: NetWorthTrendChartProps) {
  // Mock historical data
  const data = [
    { month: 'Jan', assets: 150000, liabilities: 50000, netWorth: 100000 },
    { month: 'Feb', assets: 152000, liabilities: 49500, netWorth: 102500 },
    { month: 'Mar', assets: 155000, liabilities: 49000, netWorth: 106000 },
    { month: 'Apr', assets: 158000, liabilities: 48500, netWorth: 109500 },
    { month: 'May', assets: 160000, liabilities: 48000, netWorth: 112000 },
    { month: 'Jun', assets: 162000, liabilities: 47500, netWorth: 114500 },
    { month: 'Jul', assets: 165000, liabilities: 47000, netWorth: 118000 },
    { month: 'Aug', assets: 168000, liabilities: 46500, netWorth: 121500 },
    { month: 'Sep', assets: 170000, liabilities: 46000, netWorth: 124000 },
    { month: 'Oct', assets: 172000, liabilities: 45500, netWorth: 126500 },
    { month: 'Nov', assets: 175000, liabilities: 45000, netWorth: 130000 },
    { month: 'Dec', assets: 178000, liabilities: 44500, netWorth: 133500 },
  ]

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis
          tickFormatter={(value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)}
        />
        <Tooltip
          formatter={(value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value as number)}
        />
        <Line type="monotone" dataKey="netWorth" name="Net Worth" stroke="#8884d8" strokeWidth={2} />
        <Line type="monotone" dataKey="assets" name="Assets" stroke="#82ca9d" strokeWidth={1} strokeDasharray="3 3" />
        <Line type="monotone" dataKey="liabilities" name="Liabilities" stroke="#ff8042" strokeWidth={1} strokeDasharray="3 3" />
      </LineChart>
    </ResponsiveContainer>
  )
}
