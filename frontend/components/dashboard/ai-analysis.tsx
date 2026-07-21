'use client'

import { useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { aiApi } from '@/lib/api'
import { Disclaimer } from '@/components/disclaimer'

interface AIAnalysisCardProps {
  holdings: any[]
}

function ResultBox({ text }: { text: string }) {
  return (
    <div className="mt-4 p-4 bg-muted rounded-md text-sm overflow-auto max-h-[70vh]">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="text-base font-bold mt-4 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold mt-4 mb-1 text-primary">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-3 mb-1">{children}</h3>,
          p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted-foreground/10">{children}</thead>,
          th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
          hr: () => <hr className="my-3 border-border" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary pl-3 italic text-muted-foreground my-2">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-background px-1 py-0.5 rounded text-xs font-mono">{children}</code>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

// Reusable styled input with full dark-mode support
function Field({
  label, type = 'text', value, onChange, placeholder, disabled, onKeyDown,
}: {
  label?: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <div>
      {label && <label className="text-sm font-medium block mb-1">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground
                   placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2
                   focus:ring-ring disabled:opacity-50"
      />
    </div>
  )
}

// AI Provider configuration lives on the Profile page now. We render a thin
// inline reminder so first-time users know where to set their key.

function ProviderHint() {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">AI Provider</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose a provider and paste your API key in Profile → AI Provider.
        </p>
      </div>
      <Link
        href="/profile#ai-provider"
        className="shrink-0 text-xs font-medium text-primary hover:underline"
      >
        Configure →
      </Link>
    </div>
  )
}

// ── Main AI analysis card ─────────────────────────────────────────
export function AIAnalysisCard({ holdings }: AIAnalysisCardProps) {
  const [portfolioResult, setPortfolioResult] = useState<string | null>(null)
  const [portfolioLoading, setPortfolioLoading] = useState(false)

  const [stockTicker, setStockTicker] = useState('')
  const [stockResult, setStockResult] = useState<string | null>(null)
  const [stockLoading, setStockLoading] = useState(false)

  // ── Portfolio ────────────────────────────────────────────
  const analyzePortfolio = async () => {
    if (holdings.length === 0) {
      setPortfolioResult('Add some holdings first to get portfolio insights.')
      return
    }
    setPortfolioLoading(true)
    setPortfolioResult(null)
    try {
      // Send full holdings so the backend can build the detailed prompt
      const payload = holdings.map((h: any) => ({
        ticker: h.ticker,
        security_name: h.security_name,
        security_type: h.security_type,
        shares: h.shares,
        average_cost: h.average_cost,
        current_price: h.current_price,
        current_value: h.current_value,
        total_gain_loss: h.total_gain_loss,
        total_gain_loss_percent: h.total_gain_loss_percent,
        today_gain_loss: h.today_gain_loss,
        today_gain_loss_percent: h.today_gain_loss_percent,
        sector: h.sector,
        industry: h.industry,
        dividend_yield: h.dividend_yield,
      }))

      const response = await aiApi.portfolioAnalysis(payload)
      const text = response.data?.analysis
      setPortfolioResult(
        text ? text : 'AI returned an empty response. Check that your provider has credits or is running.'
      )
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message
      setPortfolioResult(
        typeof detail === 'string' && detail
          ? detail
          : 'Portfolio analysis failed. Open Profile → AI Provider and check your API key, model, and connection.'
      )
    } finally {
      setPortfolioLoading(false)
    }
  }

  // ── Stock ────────────────────────────────────────────────
  const analyzeStock = async () => {
    const ticker = stockTicker.trim().toUpperCase()
    if (!ticker) return
    setStockLoading(true)
    setStockResult(null)
    try {
      const response = await aiApi.stockAnalysis(ticker)
      const text = response.data?.analysis
      setStockResult(
        text ? text : 'AI returned an empty response. Check that your provider has credits or is running.'
      )
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message
      setStockResult(
        typeof detail === 'string' && detail
          ? detail
          : 'Stock analysis failed. Open Profile → AI Provider and check your API key, model, and connection.'
      )
    } finally {
      setStockLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Thin pointer to Profile → AI Provider — full settings live there now. */}
      <ProviderHint />

      {/* Analysis panels */}
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
            {portfolioLoading && (
              <p className="mt-3 text-sm text-muted-foreground animate-pulse">AI is thinking…</p>
            )}
            {portfolioResult && <ResultBox text={portfolioResult} />}
            {holdings.length === 0 && !portfolioResult && !portfolioLoading && (
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
            <Field
              label="Enter Ticker Symbol"
              value={stockTicker}
              onChange={v => setStockTicker(v.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && !stockLoading && stockTicker.trim() && analyzeStock()}
              placeholder="e.g. AAPL, MSFT, VTI"
              disabled={stockLoading}
            />
            <Button
              onClick={analyzeStock}
              disabled={stockLoading || !stockTicker.trim()}
              className="w-full"
            >
              {stockLoading ? 'Analysing…' : 'Analyze Stock'}
            </Button>
            {stockLoading && (
              <p className="text-sm text-muted-foreground animate-pulse">AI is thinking…</p>
            )}
            {stockResult && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">
                  Analysis: {stockTicker}
                </p>
                <ResultBox text={stockResult} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Disclaimer variant="ai" />
    </div>
  )
}
