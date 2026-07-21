// Direct-from-device AI calls. Replaces the Python AIOrchestrator on iOS.
// Supports Claude (Anthropic) + OpenAI. Ollama/LM Studio aren't useful on
// iOS (no localhost reachable inside the WebView) but the slots exist so
// the same Settings UI works on desktop and mobile.

import { CapacitorHttp } from '@capacitor/core'
import {
  getAiConfig,
  getAiSettingsForUI,
  applyAiSettingsUpdate,
  getActiveProviderCredentials,
  getDefaultKeyUsage,
  incrementDefaultKeyUsage,
  DEFAULT_KEY_LIMIT,
} from './settings'
import { fetchPrice } from './market'
import { stockAnalysisPrompt, portfolioAnalysisPrompt, documentExtractionPrompt } from './prompts'

interface ChatResult { text: string; model: string }

// `content` is either a plain string (text chat) or an array of Anthropic /
// OpenAI content blocks (multimodal: text + image / document).
type MessageContent = string | any[]

// 8K tokens — the new prompts produce long multi-section reports (portfolio
// analysis especially). 4K was truncating output mid-section.
const MAX_TOKENS = 8000

// Opus-class models routinely take well over a minute to produce an 8K-token
// report. CapacitorHttp's default timeout (~60s on iOS) would abort those
// mid-flight and surface as an opaque failure — give every provider a generous
// ceiling instead so long analyses complete.
const REQUEST_TIMEOUT_MS = 180000  // 3 minutes

type ProviderId = 'claude' | 'openai' | 'other'
interface ProviderSlot { api_key?: string | null; model?: string | null; host?: string | null }
interface ProviderRequest {
  url: string
  headers: Record<string, string>
  data: any
  pickText: (d: any) => string
  label: string
}

// "Other" provider: any OpenAI-compatible endpoint (Groq, OpenRouter,
// Together, DeepSeek, Mistral, xAI, self-hosted gateways…). The user gives a
// base URL; we normalise it to the standard chat-completions path unless they
// already pasted the full path themselves.
function otherEndpointUrl(host: string): string {
  const base = host.trim().replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(base)) return base
  if (/\/v\d+$/.test(base)) return `${base}/chat/completions`   // e.g. …/openai/v1
  return `${base}/v1/chat/completions`
}

// Describe the HTTP request for a provider. Every provider is defined here so
// they all run through the identical execRequest() path — same timeout, same
// error surfacing, same response shaping — regardless of which one the user
// picked. Only the URL, auth header, and response-text location differ.
function buildProviderRequest(provider: ProviderId, slot: ProviderSlot, content: MessageContent, maxTokens: number): ProviderRequest {
  if (provider === 'claude') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': slot.api_key ?? '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      data: { model: slot.model || 'claude-opus-4-7', max_tokens: maxTokens, messages: [{ role: 'user', content }] },
      pickText: (d) => d?.content?.[0]?.text ?? '',
      label: 'Claude',
    }
  }
  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'authorization': `Bearer ${slot.api_key ?? ''}`, 'content-type': 'application/json' },
      data: { model: slot.model || 'gpt-4o', max_tokens: maxTokens, messages: [{ role: 'user', content }] },
      pickText: (d) => d?.choices?.[0]?.message?.content ?? '',
      label: 'OpenAI',
    }
  }
  // 'other' — custom OpenAI-compatible endpoint
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (slot.api_key) headers['authorization'] = `Bearer ${slot.api_key}`
  return {
    url: otherEndpointUrl(slot.host ?? ''),
    headers,
    data: { model: slot.model, max_tokens: maxTokens, messages: [{ role: 'user', content }] },
    pickText: (d) => d?.choices?.[0]?.message?.content ?? '',
    label: 'AI endpoint',
  }
}

// Single execution path for every provider: applies the timeout, then converts
// a transport failure (no connection / timeout) and an API error (4xx/5xx) into
// a withDetail() error carrying the REAL reason — so the UI shows "model not
// found" / "invalid api key" / "timed out" instead of a generic message.
async function execRequest(req: ProviderRequest): Promise<ChatResult> {
  let res: { status: number; data: any }
  try {
    res = await CapacitorHttp.post({
      url: req.url,
      headers: req.headers,
      data: req.data,
      connectTimeout: REQUEST_TIMEOUT_MS,
      readTimeout: REQUEST_TIMEOUT_MS,
    })
  } catch (e: any) {
    throw withDetail(`Couldn't reach ${req.label}. Check your internet connection and try again${e?.message ? ` (${e.message})` : ''}.`)
  }
  if (res.status >= 400) {
    const apiMsg = res.data?.error?.message || (typeof res.data === 'string' ? res.data : '')
    throw withDetail(`${req.label} request failed (${res.status})${apiMsg ? `: ${apiMsg}` : ''}.`)
  }
  return { text: req.pickText(res.data) ?? '', model: res.data?.model ?? req.data.model }
}

async function chat(prompt: string): Promise<ChatResult> {
  const creds = await getActiveProviderCredentials()
  if (!creds) {
    const cfg = await getAiConfig()
    throw withDetail(
      `${cfg.active.toUpperCase()} is not configured. Open AI Insights → AI Provider, paste your key and save.`,
    )
  }
  const { provider, slot, isDefaultKey } = creds

  // The built-in trial key only covers DEFAULT_KEY_LIMIT requests. Once used up,
  // require the user to add their own key before making any more AI calls.
  if (isDefaultKey && (await getDefaultKeyUsage()) >= DEFAULT_KEY_LIMIT) {
    throw withDetail(
      `You've used all ${DEFAULT_KEY_LIMIT} free AI requests on the built-in key. ` +
      `Open AI Insights → AI Provider and add your own API key to keep using AI features.`,
    )
  }

  if (provider !== 'claude' && provider !== 'openai' && provider !== 'other') {
    // Legacy Ollama / LM Studio configs from older versions — localhost isn't
    // reachable from inside the iOS WebView. Point the user at the current
    // options instead.
    throw withDetail(
      'This provider is no longer supported on iOS. Switch to Claude, OpenAI, or Other (any OpenAI-compatible endpoint) in AI Provider settings.',
    )
  }
  if (provider === 'other' && !slot.model) {
    throw withDetail('Enter the model name for your custom AI endpoint in AI Provider settings (e.g. llama-3.3-70b-versatile).')
  }

  // Same prompt, same execution path for every provider.
  const result = await execRequest(buildProviderRequest(provider, slot, prompt, MAX_TOKENS))

  // Only count successful calls that actually used the owner's trial key.
  if (isDefaultKey) await incrementDefaultKeyUsage()
  return result
}

function withDetail(detail: string) {
  const err = new Error(detail) as any
  err.response = { status: 400, data: { detail } }
  return err
}

// ── Document → holdings extraction (vision / PDF) ───────────────────────────

export interface DocInput {
  kind: 'image' | 'pdf' | 'text'
  base64?: string      // for image / pdf
  mediaType?: string   // e.g. 'image/jpeg', 'application/pdf'
  text?: string        // for csv / txt
}

// Pull a JSON array of holdings out of the model's reply, tolerating code
// fences, surrounding prose, and object-wrapped arrays ({"holdings":[...]}).
function parseHoldingsJson(raw: string): any[] {
  if (!raw) return []
  const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()

  const fromValue = (v: any): any[] | null => {
    if (Array.isArray(v)) return v
    if (v && typeof v === 'object') {
      for (const k of ['investments', 'holdings', 'data', 'rows', 'items', 'positions']) {
        if (Array.isArray(v[k])) return v[k]
      }
    }
    return null
  }
  const tryParse = (t: string): any[] | null => {
    try { return fromValue(JSON.parse(t)) } catch { return null }
  }

  // 1) whole string (array or object).
  let arr = tryParse(s)
  if (arr) return arr
  // 2) first [...] block.
  const a = s.indexOf('['), b = s.lastIndexOf(']')
  if (a !== -1 && b > a) { arr = tryParse(s.slice(a, b + 1)); if (arr) return arr }
  // 3) first {...} block (object-wrapped).
  const c = s.indexOf('{'), d = s.lastIndexOf('}')
  if (c !== -1 && d > c) { arr = tryParse(s.slice(c, d + 1)); if (arr) return arr }
  return []
}

// Send an uploaded document to the user's configured AI provider/model and
// return the extracted holdings. Counts as one AI request (trial-key aware).
// Images work on Claude or OpenAI; PDFs require Claude.
export async function extractHoldingsFromDocument(doc: DocInput): Promise<{ investments: any[]; raw: string }> {
  const creds = await getActiveProviderCredentials()
  if (!creds) {
    throw withDetail('AI is not configured. Open Profile → AI Provider, paste your key and save, then try again.')
  }
  const { provider, slot, isDefaultKey } = creds

  if (provider !== 'claude' && provider !== 'openai' && provider !== 'other') {
    throw withDetail('This provider is no longer supported on iOS. Switch to Claude, OpenAI, or Other in AI Provider settings.')
  }
  if (doc.kind === 'pdf' && provider !== 'claude') {
    throw withDetail('Your current AI provider can read images only. To extract from PDFs, switch to Claude in Profile → AI Provider — or upload a photo/screenshot of the statement instead.')
  }

  // Trial-key cap: one request per document.
  if (isDefaultKey && (await getDefaultKeyUsage()) >= DEFAULT_KEY_LIMIT) {
    throw withDetail(
      `You've used all ${DEFAULT_KEY_LIMIT} free AI requests on the built-in key. ` +
      `Open Profile → AI Provider and add your own API key to use document extraction.`,
    )
  }

  const prompt = documentExtractionPrompt()
  let raw = ''

  if (provider === 'claude') {
    const content: any[] = [{ type: 'text', text: prompt }]
    if (doc.kind === 'image' && doc.base64) {
      content.push({ type: 'image', source: { type: 'base64', media_type: doc.mediaType || 'image/jpeg', data: doc.base64 } })
    } else if (doc.kind === 'pdf' && doc.base64) {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: doc.base64 } })
    } else if (doc.kind === 'text') {
      content.push({ type: 'text', text: `Document contents:\n\n${doc.text ?? ''}` })
    }
    raw = (await execRequest(buildProviderRequest('claude', slot, content, MAX_TOKENS))).text
  } else {
    // openai / other — images + text only (PDF guarded above), both speak
    // the OpenAI content format.
    const content: any[] = [{ type: 'text', text: prompt }]
    if (doc.kind === 'image' && doc.base64) {
      content.push({ type: 'image_url', image_url: { url: `data:${doc.mediaType || 'image/jpeg'};base64,${doc.base64}` } })
    } else if (doc.kind === 'text') {
      content.push({ type: 'text', text: `Document contents:\n\n${doc.text ?? ''}` })
    }
    raw = (await execRequest(buildProviderRequest(provider, slot, content, MAX_TOKENS))).text
  }

  if (isDefaultKey) await incrementDefaultKeyUsage()
  return { investments: parseHoldingsJson(raw), raw }
}

// ── Public surface matching the FastAPI aiApi shape ─────────────────────────

export const nativeAiApi = {
  check: async () => {
    const cfg = await getAiConfig()
    const creds = await getActiveProviderCredentials()
    const model = cfg[cfg.active]?.model ?? null
    if (!creds) {
      return { data: { available: false, provider: cfg.active, model, error: 'No API key saved for this provider yet. Paste a key and tap Save first.' } }
    }
    const { provider, slot } = creds
    if (provider !== 'claude' && provider !== 'openai' && provider !== 'other') {
      return { data: { available: false, provider, model, error: 'This provider is no longer supported on iOS. Choose Claude, OpenAI, or Other.' } }
    }
    if (provider === 'other' && !slot.model) {
      return { data: { available: false, provider, model, error: 'Enter the model name for your custom endpoint before testing.' } }
    }
    // Real connectivity test: a minimal 1-token round-trip validates the key,
    // model, and endpoint for whichever provider is active — the exact path a
    // real analysis uses, so "Connected" actually means it will work. Runs only
    // when the user taps Test (check() is not used to gate any UI).
    try {
      await execRequest(buildProviderRequest(provider, slot, 'ping', 1))
      return { data: { available: true, provider, model: slot.model ?? model } }
    } catch (e: any) {
      return { data: { available: false, provider, model: slot.model ?? model, error: e?.response?.data?.detail ?? e?.message ?? 'Connection test failed.' } }
    }
  },

  getSettings: async () => {
    return { data: await getAiSettingsForUI() }
  },

  saveSettings: async (data: { provider: string; api_key?: string; model?: string; host?: string }) => {
    await applyAiSettingsUpdate({
      provider: data.provider as any,
      api_key: data.api_key,
      model: data.model,
      host: data.host,
    })
    // Return the updated UI-shaped settings so AIProviderSettings can do
    // `setSettings(r.data)` and have correct state without a re-fetch.
    return { data: await getAiSettingsForUI() }
  },

  portfolioAnalysis: async (holdings: any[]) => {
    if (!holdings || holdings.length === 0) {
      return {
        data: {
          analysis:
            '❌ Unable to analyze portfolio. Add holdings on the Dashboard first.',
          model: '(none)',
        },
      }
    }
    const prompt = portfolioAnalysisPrompt(holdings)
    const r = await chat(prompt)
    return { data: { analysis: r.text, model: r.model } }
  },

  stockAnalysis: async (ticker: string, _companyName?: string) => {
    const upper = ticker.trim().toUpperCase()
    // Fetch the live quote first so the prompt can ground its analysis in
    // today's actual price (not whatever the model remembers from training).
    // We pass the full quote payload too — the model can use day_change /
    // previous_close when reasoning about short-term momentum.
    let quote: any = null
    let currentPrice: number | null = null
    try {
      const q = await fetchPrice(upper)
      if (q) {
        quote = q
        currentPrice = q.price
      }
    } catch {
      // Network failure → still try the analysis but flag price as N/A;
      // the prompt's "could not find ticker" branch handles that.
    }

    const prompt = stockAnalysisPrompt({
      ticker: upper,
      current_price: currentPrice,
      quote,
    })
    const r = await chat(prompt)
    return {
      data: {
        ticker: upper,
        current_price: currentPrice,
        analysis: r.text,
        model: r.model,
      },
    }
  },

  riskAssessment: async (data: any) => {
    const prompt = `Assess portfolio risk. Inputs:\n${JSON.stringify(data, null, 2)}\n\nReturn: overall risk level (low/medium/high), top 3 concentration risks, suggested mitigations. Markdown.`
    const r = await chat(prompt)
    return { data: { assessment: r.text, model: r.model } }
  },

  suggestions: async (data: any) => {
    const prompt = `Given this portfolio and goals, suggest 3-5 specific actions (rebalance, add, trim, dividend tilt, etc.). Inputs:\n${JSON.stringify(data, null, 2)}\n\nMarkdown, numbered list.`
    const r = await chat(prompt)
    return { data: { suggestions: r.text, model: r.model } }
  },

  marketInsights: async () => {
    const prompt = `Give a brief market outlook (3 paragraphs): macro backdrop, sector rotation themes, and one risk to watch this quarter. Markdown.`
    const r = await chat(prompt)
    return { data: { insights: r.text, model: r.model } }
  },

  documentExtraction: async (_text: string, _type: string) => {
    return { data: { not_implemented: true } }
  },
}
