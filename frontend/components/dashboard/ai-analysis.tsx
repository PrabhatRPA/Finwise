'use client'

import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { aiApi } from '@/lib/api'

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

// ── Provider labels / metadata ────────────────────────────────────
const PROVIDERS = [
  { id: 'claude',    label: 'Claude',    kind: 'cloud', placeholder: 'claude-opus-4-7' },
  { id: 'openai',   label: 'OpenAI',    kind: 'cloud', placeholder: 'gpt-4o' },
  { id: 'ollama',   label: 'Ollama',    kind: 'local', placeholder: 'qwen3:4b' },
  { id: 'lmstudio', label: 'LM Studio', kind: 'local', placeholder: 'local-model' },
] as const

type ProviderId = typeof PROVIDERS[number]['id']

// ── AI Provider Settings card ─────────────────────────────────────
function AIProviderSettings() {
  const [settings, setSettings] = useState<any>(null)
  const [selected, setSelected] = useState<ProviderId>('claude')

  // per-provider form state
  const [apiKey, setApiKey]   = useState('')
  const [model, setModel]     = useState('')
  const [host, setHost]       = useState('')

  const [saving, setSaving]   = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus]   = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    aiApi.getSettings()
      .then(r => {
        const s = r.data
        setSettings(s)
        setSelected(s.provider as ProviderId)
        prefillForm(s, s.provider as ProviderId)
      })
      .catch(() => {})
  }, [])

  function prefillForm(s: any, provider: ProviderId) {
    if (provider === 'claude') {
      setModel(s.claude_model ?? '')
      setApiKey('')   // never pre-fill key
      setHost('')
    } else if (provider === 'openai') {
      setModel(s.openai_model ?? '')
      setApiKey('')
      setHost('')
    } else if (provider === 'ollama') {
      setHost(s.ollama_host ?? '')
      setModel(s.ollama_model ?? '')
      setApiKey('')
    } else if (provider === 'lmstudio') {
      setHost(s.lmstudio_host ?? '')
      setModel(s.lmstudio_model ?? '')
      setApiKey('')
    }
    setStatus(null)
  }

  function selectProvider(p: ProviderId) {
    setSelected(p)
    if (settings) prefillForm(settings, p)
  }

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      const meta = PROVIDERS.find(p => p.id === selected)!
      const payload: any = { provider: selected, model: model || undefined }
      if (meta.kind === 'cloud') {
        if (apiKey) payload.api_key = apiKey
      } else {
        if (host) payload.host = host
      }
      const r = await aiApi.saveSettings(payload)
      setSettings(r.data)
      setStatus({ ok: true, msg: 'Settings saved and applied.' })
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setStatus({ ok: false, msg: typeof detail === 'string' ? detail : 'Save failed.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setStatus(null)
    try {
      const r = await aiApi.check()
      const { available, provider, model: m } = r.data
      setStatus({
        ok: available,
        msg: available
          ? `Connected — ${provider} / ${m}`
          : `Provider not reachable (${provider}).`,
      })
    } catch {
      setStatus({ ok: false, msg: 'Could not reach the backend.' })
    } finally {
      setTesting(false)
    }
  }

  const meta = PROVIDERS.find(p => p.id === selected)!
  const isCloud = meta.kind === 'cloud'
  const keySet = settings
    ? (selected === 'claude' ? settings.claude_api_key_set : settings.openai_api_key_set)
    : false

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>AI Provider</span>
          {settings && (
            <span className="text-xs font-normal text-muted-foreground">
              Active: <span className="font-medium text-foreground capitalize">{settings.provider}</span>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider selector */}
        <div className="flex gap-2 flex-wrap">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => selectProvider(p.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selected === p.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-accent'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Credential fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          {isCloud ? (
            <Field
              label="API Key"
              type="password"
              value={apiKey}
              onChange={setApiKey}
              placeholder={keySet ? '••••••••  (already set)' : 'sk-…'}
            />
          ) : (
            <Field
              label="Host URL"
              value={host}
              onChange={setHost}
              placeholder={selected === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234'}
            />
          )}
          <Field
            label="Model"
            value={model}
            onChange={setModel}
            placeholder={meta.placeholder}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 items-center flex-wrap">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button onClick={handleTest} disabled={testing} variant="outline" size="sm">
            {testing ? 'Testing…' : 'Test Connection'}
          </Button>
          {status && (
            <span className={`text-sm ${status.ok ? 'text-green-600' : 'text-destructive'}`}>
              {status.msg}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
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
      const detail = err?.response?.data?.detail
      setPortfolioResult(
        typeof detail === 'string'
          ? detail
          : 'Portfolio analysis failed. Check that the backend is running and your AI provider is configured.'
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
      const detail = err?.response?.data?.detail
      setStockResult(
        typeof detail === 'string'
          ? detail
          : 'Stock analysis failed. Check that the backend is running and your AI provider is configured.'
      )
    } finally {
      setStockLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Provider settings — full width at top */}
      <AIProviderSettings />

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
    </div>
  )
}
