'use client'

// In-app rating prompt (native-only; no-ops on web/Tauri). Uses Apple's
// SKStoreReviewController via @capawesome/capacitor-app-review. iOS decides
// whether/when to actually show it and rate-limits to ~3/year — we only ask an
// engaged user at a happy moment (net worth loaded and positive), at most once
// every ~90 days. Best-effort; never throws.

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const APP_STORE_ID = '6782134030'
const LAST_ASKED_KEY = 'review_last_asked'
const OPENS_KEY = 'review_open_count'
const MIN_OPENS = 3
const MIN_DAYS = 90

export async function maybeRequestReview(netWorth: number): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform() || !(netWorth > 0)) return
    const opens = Number((await Preferences.get({ key: OPENS_KEY })).value ?? '0') + 1
    await Preferences.set({ key: OPENS_KEY, value: String(opens) })
    if (opens < MIN_OPENS) return
    const last = (await Preferences.get({ key: LAST_ASKED_KEY })).value
    if (last && (Date.now() - new Date(last).getTime()) / 86400000 < MIN_DAYS) return
    await Preferences.set({ key: LAST_ASKED_KEY, value: new Date().toISOString() })
    const { AppReview } = await import('@capawesome/capacitor-app-review')
    await AppReview.requestReview()
  } catch { /* best-effort */ }
}

// Settings "Rate Nworth" → open the App Store review page.
export async function openStoreReview(): Promise<void> {
  try {
    const { AppReview } = await import('@capawesome/capacitor-app-review')
    await AppReview.openAppStore({ appId: APP_STORE_ID })
  } catch { /* ignore */ }
}
