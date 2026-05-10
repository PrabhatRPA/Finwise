'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { aiApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

interface AIAnalysisCardProps {
  holdings: any[]
}

function AnalysisBox({ text, loading }: { text: string | null; loading: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground animate-pulse">Analysing with AI…</p>
  if (!text) return null
  return (
    <div className="mt-4 p-4 bg-muted rounded-md">
      <p className="text-sm whitespace-pre-wrap">{text}</p>
    </div>
  )
}

export function AIAnalysisCard({ holdings }: AIAnalysisCardProps) {
  const [portfolioResult, setPortfolioResult] = useState<string | null>(null)
  const [portfolioLoading, setPortfolioLoading] = useState(false)

  const [stockTicker, setStockTicker] = useState('')
  const [stockResult, setStockResult] = useState<string | null>(null)
  const [stockLoading, setStockLoading] = useState(false)

  // ── Portfolio analysis ──────────────────────────────────
  const analyzePortfolio = async () => {
    if (holdings.length === 0) {
      setPortfolioResult('Add some holdings first to generate portfolio insights.')
      return
    }
    setPortfolioLoading(true)
    setPortfolioResult(null)
    try {
      const totalValue = holdings.reduce((s, h) => s + (h.current_value || 0), 0)
      const totalGainLoss = holdings.reduce((s, h) => s + (h.total_gain_loss || 0), 0)

      const sectorAlloc: Record<string, number> = {}
      holdings.forEach(h => {
        const sector = h.sector || 'Unknown'
        sectorAlloc[sector] = (sectorAlloc[sector] || 0) + (h.current_value || 0)
      })
      const allocationText = Object.entries(sectorAlloc)
        .map(([s, v]) => `${s}: ${formatCurrency(v)} (${totalValue ? ((v / totalValue) * 100).toFixed(1) : 0}%)`)
        .join(', ')

      const topHoldings = [...holdings]
        .sort((a, b) => (b.current_value || 0) - (a.current_value || 0))
        .slice(0, 5)
        .map(h => `${h.ticker}: ${h.shares} shares @ ${formatCurrency(h.average_cost)}`)
        .join('; ')

      const response = await aiApi.portfolioAnalysis([{
        total_value: totalValue,
        total_gain_loss: totalGainLoss,
        num_holdings: holdings.length,
        sector_allocation: allocationText,
        top_holdings: topHoldings,
      }])
      setPortfolioResult(response.data.analysis || 'No analysis returned.')
    } catch (err: any) {
      const msg = err?.response?.data?.detail
      setPortfolioResult(
        typeof msg === 'string' ? msg : 'Portfolio analysis failed. Check the backend logs.'
      )
    } finally {
      setPortfolioLoading(false)
    }
  }

  // ── Stock analysis ──────────────────────────────────────
  const analyzeStock = async () => {
    const ticker = stockTicker.trim().toUpperCase()
    if (!ticker) return
    setStockLoading(true)
    setStockResult(null)
    try {
      const response = await aiApi.stockAnalysis(ticker)
      setStockResult(response.data.analysis || 'No analysis returned.')
    } catch (err: any) {
      const msg = err?.response?.data?.detail
      setStockResult(
        typeof msg === 'string' ? msg : 'Stock analysis failed. Check the backend logs.'
      )
    } finally {
      setStockLoading(false)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Portfolio Analysis */}
      <Card>
        <CardHeader><CardTitle>Portfolio Analysis</CardTitle></CardHeader>
        <CardContent>
          <Button
            onClick={analyzePortfolio}
            disabled={portfolioLoading}
            className="w-full"
          >
            {portfolioLoading ? 'Analysing…' : 'Generate Portfolio Insights'}
          </Button>
          <AnalysisBox text={portfolioResult} loading={portfolioLoading} />
          {holdings.length === 0 && !portfolioResult && (
            <p className="text-sm text-muted-foreground mt-3">
              Add some holdings to get AI-powered investment insights.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stock Analysis */}
      <Card>
        <CardHeader><CardTitle>Stock Analysis</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium">Enter Ticker Symbol</label>
            <input
              type="text"
              value={stockTicker}
              onChange={e => setStockTicker(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && !stockLoading && stockTicker && analyzeStock()}
              placeholder="e.g. AAPL, MSFT, VTI"
              className="w-full px-3 py-2 border rounded-md mt-1 text-sm"
              disabled={stockLoading}
            />
          </div>
          <Button
            onClick={analyzeStock}
            disabled={stockLoading || !stockTicker.trim()}
            className="w-full"
          >
            {stockLoading ? 'Analysing…' : 'Analyze Stock'}
          </Button>
          <AnalysisBox text={stockResult} loading={stockLoading} />
        </CardContent>
      </Card>
    </div>
  )
}
