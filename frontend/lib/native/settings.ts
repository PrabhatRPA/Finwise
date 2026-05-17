// Per-user AI provider configuration.
//
// Stores ALL providers' credentials in a single SQLite settings row so
// switching the active provider doesn't lose your other keys. The shape
// returned by getAiSettingsForUI matches what AIProviderSettings on the
// dashboard expects (claude_api_key_set, openai_model, etc.) so the same
// Settings card works identically against FastAPI on desktop and against
// SQLite on iOS.
//
// Default API key: if backend/.env was present at build time, its
// OPENAI_API_KEY is baked into NEXT_PUBLIC_DEFAULT_OPENAI_KEY and used as
// the initial active config. This is a personal-device convenience for the
// app owner — anyone who downloads the IPA could extract the key from the
// bundle, so do NOT distribute a build that has this var populated to
// users who shouldn't see your key.

import { all, get, run } from './db'
import { requireSessionUserId } from './session'

const KEY = 'ai_providers_config'

export type ProviderId = 'claude' | 'openai' | 'ollama' | 'lmstudio'

export interface ProviderSlot {
  api_key?: string  // cloud providers only
  model?: string
  host?: string     // local providers only
}

export interface AiProvidersConfig {
  active: ProviderId
  claude: ProviderSlot
  openai: ProviderSlot
  ollama: ProviderSlot
  lmstudio: ProviderSlot
}

const DEFAULT_CONFIG: AiProvidersConfig = {
  active: 'openai',
  claude: {},
  openai: {},
  ollama: { host: 'http://localhost:11434' },
  lmstudio: { host: 'http://localhost:1234' },
}

function seedFromBuildEnv(): AiProvidersConfig {
  const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AiProvidersConfig
  // process.env.* are inlined by Next at build time.
  const openaiKey = process.env.NEXT_PUBLIC_DEFAULT_OPENAI_KEY
  const claudeKey = process.env.NEXT_PUBLIC_DEFAULT_CLAUDE_KEY
  if (openaiKey) {
    cfg.openai.api_key = openaiKey
    cfg.openai.model = 'gpt-4o'
    cfg.active = 'openai'
  }
  if (claudeKey) {
    cfg.claude.api_key = claudeKey
    cfg.claude.model = 'claude-opus-4-7'
    if (!openaiKey) cfg.active = 'claude'
  }
  return cfg
}

export async function getAiConfig(): Promise<AiProvidersConfig> {
  const userId = await requireSessionUserId()
  const row = await get<{ setting_value: string }>(
    `SELECT setting_value FROM settings WHERE user_id = ? AND setting_key = ?`,
    [userId, KEY],
  )
  if (!row?.setting_value) {
    const seeded = seedFromBuildEnv()
    await saveAiConfig(seeded)
    return seeded
  }
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(row.setting_value) }
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function saveAiConfig(cfg: AiProvidersConfig): Promise<void> {
  const userId = await requireSessionUserId()
  await run(
    `INSERT INTO settings (user_id, setting_key, setting_value)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, setting_key) DO UPDATE SET
       setting_value = excluded.setting_value,
       updated_at = CURRENT_TIMESTAMP`,
    [userId, KEY, JSON.stringify(cfg)],
  )
}

// Shape that AIProviderSettings (components/dashboard/ai-analysis.tsx) reads.
// "*_api_key_set" booleans are returned instead of the raw keys to avoid
// shipping them back to the UI unnecessarily.
export async function getAiSettingsForUI() {
  const c = await getAiConfig()
  return {
    provider: c.active,
    claude_api_key_set: !!c.claude.api_key,
    claude_model: c.claude.model ?? '',
    openai_api_key_set: !!c.openai.api_key,
    openai_model: c.openai.model ?? '',
    ollama_host: c.ollama.host ?? '',
    ollama_model: c.ollama.model ?? '',
    lmstudio_host: c.lmstudio.host ?? '',
    lmstudio_model: c.lmstudio.model ?? '',
  }
}

// Update the active provider's slot and switch `active` to it.
export async function applyAiSettingsUpdate(payload: {
  provider: ProviderId
  api_key?: string
  model?: string
  host?: string
}) {
  const c = await getAiConfig()
  const slot = c[payload.provider]
  if (payload.api_key !== undefined && payload.api_key !== '') slot.api_key = payload.api_key
  if (payload.model !== undefined) slot.model = payload.model
  if (payload.host !== undefined) slot.host = payload.host
  c.active = payload.provider
  await saveAiConfig(c)
  return c
}

// Used by ai.ts to pick the active provider's credentials when sending a
// request. Returns null if the active provider isn't configured.
export async function getActiveProviderCredentials(): Promise<
  { provider: ProviderId; slot: ProviderSlot } | null
> {
  const c = await getAiConfig()
  const slot = c[c.active]
  const cloudConfigured = (c.active === 'claude' || c.active === 'openai') && !!slot.api_key
  const localConfigured = (c.active === 'ollama' || c.active === 'lmstudio') && !!slot.host
  if (!cloudConfigured && !localConfigured) return null
  return { provider: c.active, slot }
}
