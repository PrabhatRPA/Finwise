// Platform-aware notification firing.
// • iOS / Android (Capacitor)  → @capacitor/local-notifications (OS push)
// • Web / Tauri desktop         → window.Notification API
//
// We request permission lazily on the first call rather than at app start —
// less intrusive, and skips users who never set a target price.

import { Capacitor } from '@capacitor/core'

interface AlertArgs {
  id: number
  ticker: string
  companyName?: string
  currentPrice: number | null
  targetPrice: number
  direction: string  // 'above' | 'below'
}

function isNative(): boolean {
  try { return Capacitor.isNativePlatform() } catch { return false }
}

async function fireNative(args: AlertArgs): Promise<void> {
  // Import lazily so web builds don't have to resolve the iOS-only plugin.
  const { LocalNotifications } = await import('@capacitor/local-notifications')

  // Permission check / request.
  const perm = await LocalNotifications.checkPermissions()
  if (perm.display !== 'granted') {
    const req = await LocalNotifications.requestPermissions()
    if (req.display !== 'granted') return
  }

  const priceStr = args.currentPrice != null ? `$${args.currentPrice.toFixed(2)}` : 'live price unavailable'
  await LocalNotifications.schedule({
    notifications: [
      {
        // Capacitor requires a 32-bit signed int id — use the watchlist row
        // id (small int) so re-scheduling overwrites a prior pending alert.
        id: args.id,
        title: `${args.ticker} price alert`,
        body: `${args.ticker}${args.companyName ? ` (${args.companyName})` : ''} is ${priceStr} — ${args.direction} your target of $${args.targetPrice.toFixed(2)}`,
        sound: undefined,
        schedule: { at: new Date(Date.now() + 500) },  // fire ~immediately
      },
    ],
  })
}

function fireWeb(args: AlertArgs): void {
  if (typeof Notification === 'undefined') return
  const priceStr = args.currentPrice != null ? `$${args.currentPrice.toFixed(2)}` : 'live price unavailable'
  const body = `${args.ticker}${args.companyName ? ` (${args.companyName})` : ''} is ${priceStr} — ${args.direction} your target of $${args.targetPrice.toFixed(2)}`
  const show = () => {
    new Notification(`${args.ticker} price alert`, { body, icon: '/favicon.ico' })
  }
  if (Notification.permission === 'granted') show()
  else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => { if (p === 'granted') show() })
  }
}

export async function firePriceAlert(args: AlertArgs): Promise<void> {
  // App-level kill switch (Settings → Notifications). iOS permission can't
  // be revoked programmatically, so "off" is enforced here: alerts are
  // simply never scheduled while disabled.
  if (!(await getNotificationsEnabled())) return
  if (isNative()) {
    await fireNative(args)
  } else {
    fireWeb(args)
  }
}

// ── App-level enable/disable (independent of the OS permission) ────────────
const ENABLED_KEY = 'notifications_enabled'

export async function getNotificationsEnabled(): Promise<boolean> {
  try {
    const { Preferences } = await import('@capacitor/preferences')
    const v = (await Preferences.get({ key: ENABLED_KEY })).value
    return v !== 'false'   // default ON
  } catch {
    return true
  }
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  try {
    const { Preferences } = await import('@capacitor/preferences')
    await Preferences.set({ key: ENABLED_KEY, value: enabled ? 'true' : 'false' })
  } catch { /* ignore */ }
}

// ── Settings-page helpers ────────────────────────────────────────────────────

export type NotifStatus = 'granted' | 'denied' | 'prompt' | 'unavailable'

export async function getNotificationStatus(): Promise<NotifStatus> {
  if (!isNative()) return 'unavailable'
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display === 'granted') return 'granted'
    if (perm.display === 'denied') return 'denied'
    return 'prompt'
  } catch {
    return 'unavailable'
  }
}

// Ask iOS for permission (shows the system prompt the first time; after a
// hard denial iOS won't re-prompt — the user must flip it in iOS Settings).
export async function requestNotificationPermission(): Promise<NotifStatus> {
  if (!isNative()) return 'unavailable'
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const req = await LocalNotifications.requestPermissions()
    return req.display === 'granted' ? 'granted' : 'denied'
  } catch {
    return 'unavailable'
  }
}

// Schedule a test alert 5 s out so the user can background the app and watch
// the banner arrive — proves the watchlist alert path end-to-end.
export async function sendTestNotification(): Promise<boolean> {
  if (!isNative()) return false
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions()
      if (req.display !== 'granted') return false
    }
    await LocalNotifications.schedule({
      notifications: [{
        id: 999901,
        title: 'Nworth test notification',
        body: 'Price alerts are working — this is how a watchlist alert will look.',
        schedule: { at: new Date(Date.now() + 5000) },
      }],
    })
    return true
  } catch {
    return false
  }
}
