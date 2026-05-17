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
  if (isNative()) {
    await fireNative(args)
  } else {
    fireWeb(args)
  }
}
