'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'

interface HoldingsTableProps {
  holdings: any[]
}

export function HoldingsTable({ holdings }: HoldingsTableProps) {
  const [sortBy, setSortBy] = useState<'ticker' | 'value' | 'gain'>('ticker')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const sortedHoldings = [...holdings].sort((a, b) => {
    let valA: any
    let valB: any

    switch (sortBy) {
      case 'ticker':
        valA = a.ticker || ''
        valB = b.ticker || ''
        break
      case 'value':
        valA = a.current_value || 0
        valB = b.current_value || 0
        break
      case 'gain':
        valA = a.total_gain_loss_percent || 0
        valB = b.total_gain_loss_percent || 0
        break
      default:
        valA = 0
        valB = 0
    }

    if (valA < valB) return sortOrder === 'asc' ? -1 : 1
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const getGainBadge = (gainPercent: number) => {
    if (gainPercent > 0) {
      return <Badge variant="outline" className="text-green-600 border-green-600">+{gainPercent.toFixed(2)}%</Badge>
    } else if (gainPercent < 0) {
      return <Badge variant="outline" className="text-red-600 border-red-600">{gainPercent.toFixed(2)}%</Badge>
    }
    return <Badge variant="outline">0%</Badge>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Holdings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer"
                  onClick={() => handleSort('ticker')}
                >
                  Ticker
                  {sortBy === 'ticker' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Avg Cost</TableHead>
                <TableHead className="text-right">Current Price</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Gain/Loss</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedHoldings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No holdings found
                  </TableCell>
                </TableRow>
              ) : (
                sortedHoldings.map((holding) => (
                  <TableRow key={holding.id || holding.ticker}>
                    <TableCell className="font-medium">{holding.ticker}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {holding.security_type || 'stock'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{holding.shares || 0}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(holding.average_cost || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(holding.current_price || 0)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(holding.current_value || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {getGainBadge(holding.total_gain_loss_percent || 0)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
