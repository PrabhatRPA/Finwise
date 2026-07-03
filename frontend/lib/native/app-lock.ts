// App Lock — requires Face ID / Touch ID (with device-passcode fallback) to
// open the app on cold launch and when returning to the foreground after being
// backgrounded beyond a short grace period. The login *session* still persists
// (no username/password re-entry), but a biometric gate protects access so a
// finance dashboard isn't exposed on an unlocked phone.
//
// Enforced only when biometry is actually available on the device; otherwise we
// can't reliably prompt, so the lock is a no-op. Defaults ON.

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const APP_LOCK_KEY = 'app_lock_enabled'   // '0' = off; anything else (incl. unset) = on

// Re-lock when the app was in the background longer than this. Short enough to
// protect the data, long enough that a quick app-switch (e.g. to copy a value)
// doesn't force a re-auth.
export const APP_LOCK_GRACE_MS = 90_000

export async function isAppLockEnabled(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const v = await Preferences.get({ key: APP_LOCK_KEY })
  return v.value !== '0'   // default ON
}

export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  await Preferences.set({ key: APP_LOCK_KEY, value: enabled ? '1' : '0' })
}
