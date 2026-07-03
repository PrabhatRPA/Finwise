'use client'

// Thin, native-gated wrappers around @capacitor/haptics. Every function is
// fire-and-forget and silently no-ops on web/desktop. Usage per the design
// brief: light impact on tab switch, selection ticks while scrubbing a chart,
// success notification when an asset is added.

async function plugin() {
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) return null
  return import('@capacitor/haptics')
}

export function impactLight(): void {
  plugin().then(m => m && m.Haptics.impact({ style: m.ImpactStyle.Light })).catch(() => {})
}

export function notifySuccess(): void {
  plugin().then(m => m && m.Haptics.notification({ type: m.NotificationType.Success })).catch(() => {})
}

// Throttled selection tick for chart scrubbing — call as often as you like;
// it fires at most every 60 ms so fast drags feel like a detent wheel, not a buzz.
let _lastTick = 0
export function selectionTick(): void {
  const now = Date.now()
  if (now - _lastTick < 60) return
  _lastTick = now
  plugin().then(m => m && m.Haptics.selectionChanged()).catch(() => {})
}

export function selectionStart(): void {
  plugin().then(m => m && m.Haptics.selectionStart()).catch(() => {})
}
export function selectionEnd(): void {
  plugin().then(m => m && m.Haptics.selectionEnd()).catch(() => {})
}
