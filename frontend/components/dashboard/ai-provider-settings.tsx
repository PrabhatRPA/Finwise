'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { aiApi } from '@/lib/api'

// Reusable styled input with full dark-mode support.
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
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground
                   placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2
                   focus:ring-ring disabled:opacity-50"
      />
    </div>
  )
}

const PROVIDERS = [
  { id: 'claude',    label: 'Claude',    kind: 'cloud', placeholder: 'claude-opus-4-7' },
  { id: 'openai',   label: 'OpenAI',    kind: 'cloud', placeholder: 'gpt-4o' },
  { id: 'ollama',   label: 'Ollama',    kind: 'local', placeholder: 'qwen3:4b' },
  { id: 'lmstudio', label: 'LM Studio', kind: 'local', placeholder: 'local-model' },
] as const

type ProviderId = typeof PROVIDERS[number]['id']

export function AIProviderSettings() {
  const [settings, setSettings] = useState<any>(null)
  const [selected, setSelected] = useState<ProviderId>('claude')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [host, setHost] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)

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
      setApiKey('')
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
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span>AI Provider</span>
          {settings && (
            <span className="text-xs font-normal text-muted-foreground">
              Active: <span className="font-medium text-foreground capitalize">{settings.provider}</span>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings?.using_default_key && (
          <div className={`rounded-md border px-3 py-2 text-xs ${
            settings.default_key_remaining > 0
              ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
              : 'border-destructive bg-destructive/10 text-destructive'
          }`}>
            {settings.default_key_remaining > 0 ? (
              <>
                You&apos;re using the built-in trial key —{' '}
                <span className="font-semibold">
                  {settings.default_key_remaining} of {settings.default_key_limit} free AI requests left
                </span>
                . Add your own API key below to keep using AI features after that.
              </>
            ) : (
              <>
                <span className="font-semibold">Free AI requests used up.</span> Add your own
                API key below (Claude or OpenAI) and tap Save to continue using AI features.
              </>
            )}
          </div>
        )}
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
