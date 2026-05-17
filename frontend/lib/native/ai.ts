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
} from './settings'
import { fetchPrice } from './market'
import { stockAnalysisPrompt, portfolioAnalysisPrompt } from './prompts'

interface ChatResult { text: string; model: string }

// 8K tokens — the new prompts produce long multi-section reports (portfolio
// analysis especially). 4K was truncating output mid-section.
const MAX_TOKENS = 8000

async function callClaude(prompt: string, apiKey: string, model: string): Promise<ChatResult> {
  const res = await CapacitorHttp.post({
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    data: { model, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] },
  })
  if (res.status >= 400) throw new Error(res.data?.error?.message || `Claude API ${res.status}`)
  return { text: res.data?.content?.[0]?.text ?? '', model: res.data?.model ?? model }
}

async function callOpenAi(prompt: string, apiKey: string, model: string): Promise<ChatResult> {
  const res = await CapacitorHttp.post({
    url: 'https://api.openai.com/v1/chat/completions',
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    data: { model, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] },
  })
  if (res.status >= 400) throw new Error(res.data?.error?.message || `OpenAI API ${res.status}`)
  return { text: res.data?.choices?.[0]?.message?.content ?? '', model: res.data?.model ?? model }
}

async function chat(prompt: string): Promise<ChatResult> {
  const creds = await getActiveProviderCredentials()
  if (!creds) {
    const cfg = await getAiConfig()
    throw withDetail(
      `${cfg.active.toUpperCase()} is not configured. Open AI Insights → AI Provider, paste your key and save.`,
    )
  }
  const { provider, slot } = creds
  if (provider === 'claude') {
    return callClaude(prompt, slot.api_key!, slot.model || 'claude-opus-4-7')
  }
  if (provider === 'openai') {
    return callOpenAi(prompt, slot.api_key!, slot.model || 'gpt-4o')
  }
  // Ollama / LM Studio aren't reachable from inside the iOS WebView (no
  // localhost on the device). Surface a clear error so the user picks a
  // cloud provider instead.
  throw withDetail(
    'Local providers (Ollama, LM Studio) only work on the desktop app. Switch to Claude or OpenAI in AI Provider settings.',
  )
}

function withDetail(detail: string) {
  const err = new Error(detail) as any
  err.response = { status: 400, data: { detail } }
  return err
}

// ── Public surface matching the FastAPI aiApi shape ─────────────────────────

export const nativeAiApi = {
  check: async () => {
    const cfg = await getAiConfig()
    const creds = await getActiveProviderCredentials()
    return {
      data: {
        available: !!creds,
        provider: cfg.active,
        model: cfg[cfg.active].model ?? null,
      },
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
