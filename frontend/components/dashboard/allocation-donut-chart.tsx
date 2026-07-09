'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts'
import { formatCurrency, formatCurrencyWhole } from '@/lib/utils'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#A4DE6C', '#D0ED57']

interface AllocationData {
  name: string
  value: number
  percentage: number
}

interface AssetAllocationDonutChartProps {
  holdings: any[]
}

export function AssetAllocationDonutChart({ holdings }: AssetAllocationDonutChartProps) {
  // Calculate allocation by security type
  const allocation: Record<string, number> = {}
  let totalValue = 0

  holdings.forEach((holding) => {
    const type = holding.security_type || 'stock'
    const value = holding.current_value || 0
    allocation[type] = (allocation[type] || 0) + value
    totalValue += value
  })

  const data = Object.entries(allocation).map(([name, value]) => ({
    name,
    value,
    percentage: totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : 0,
  }))

  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No data available
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={5}
          dataKey="value"
          label={(entry) => `${entry.name} (${entry.percentage}%)`}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => [
            formatCurrency(value as number),
            'Value',
          ]}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

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
    .slice(0, 8) // Top 8 sectors

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
            formatCurrency(value as number),
            'Value',
          ]}
        />
        <Bar dataKey="value" fill="#8884d8" barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  )
}

interface PortfolioPerformanceChartProps {
  holdings: any[]
}

export function PortfolioPerformanceChart({ holdings }: PortfolioPerformanceChartProps) {
  // Group holdings by type for comparison
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
          formatter={(value) => formatCurrency(value as number)}
        />
        <Bar dataKey="value" name="Value" fill="#8884d8" />
        <Bar dataKey="gain" name="Gain/Loss" fill="#82ca9d" />
      </BarChart>
    </ResponsiveContainer>
  )
}

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
          tickFormatter={(value) => formatCurrencyWhole(value)}
        />
        <Tooltip
          formatter={(value) => formatCurrency(value as number)}
        />
        <Line type="monotone" dataKey="netWorth" name="Net Worth" stroke="#8884d8" strokeWidth={2} />
        <Line type="monotone" dataKey="assets" name="Assets" stroke="#82ca9d" strokeWidth={1} strokeDasharray="3 3" />
        <Line type="monotone" dataKey="liabilities" name="Liabilities" stroke="#ff8042" strokeWidth={1} strokeDasharray="3 3" />
      </LineChart>
    </ResponsiveContainer>
  )
}
