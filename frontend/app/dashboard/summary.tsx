'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatNumber } from '@/lib/utils'

interface SummaryCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  icon?: React.ReactNode
}

export function SummaryCard({ title, value, subtitle, trend, trendValue, icon }: SummaryCardProps) {
  const trendColors = {
    up: 'text-green-500',
    down: 'text-red-500',
    neutral: 'text-muted-foreground',
  }

  const trendIcons = {
    up: '↑',
    down: '↓',
    neutral: '-',
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2 mt-1">
          {trend && (
            <Badge
              variant="outline"
              className={`${trendColors[trend]} border-${trend === 'up' ? 'green' : trend === 'down' ? 'red' : 'gray'}-500`}
            >
              {trendIcons[trend]} {trendValue}
            </Badge>
          )}
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

interface PortfolioSummaryProps {
  totalValue: number
  totalGainLoss: number
  totalGainLossPercent: number
  cashPosition: number
  accountCount: number
}

export function PortfolioSummary({ totalValue, totalGainLoss, totalGainLossPercent, cashPosition, accountCount }: PortfolioSummaryProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        title="Total Value"
        value={formatCurrency(totalValue)}
        trend={totalGainLossPercent > 0 ? 'up' : totalGainLossPercent < 0 ? 'down' : 'neutral'}
        trendValue={`${totalGainLossPercent > 0 ? '+' : ''}${totalGainLossPercent}%`}
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-muted-foreground"
          >
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        }
      />
      <SummaryCard
        title="Total Gain/Loss"
        value={formatCurrency(totalGainLoss)}
        subtitle={`${formatCurrency(Math.abs(totalGainLoss))} (${Math.abs(totalGainLossPercent)}%)`}
        trend={totalGainLossPercent > 0 ? 'up' : totalGainLossPercent < 0 ? 'down' : 'neutral'}
        trendValue={`${totalGainLossPercent > 0 ? '+' : ''}${totalGainLossPercent}%`}
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-muted-foreground"
          >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        }
      />
      <SummaryCard
        title="Cash Position"
        value={formatCurrency(cashPosition)}
        subtitle={`${(cashPosition / totalValue * 100).toFixed(1)}% of portfolio`}
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-muted-foreground"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" x2="22" y1="10" y2="10" />
          </svg>
        }
      />
      <SummaryCard
        title="Active Accounts"
        value={accountCount}
        subtitle="Investment accounts"
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-muted-foreground"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" x2="8" y1="13" y2="13" />
            <line x1="16" x2="8" y1="17" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        }
      />
    </div>
  )
}
