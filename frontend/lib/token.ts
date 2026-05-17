// JWT token storage that works in three runtimes:
//   • Web / Tauri  → localStorage (sync)
//   • Capacitor iOS/Android → @capacitor/preferences (UserDefaults on iOS),
//     mirrored into localStorage so synchronous code (the axios interceptor,
//     _authDownload) can still read it without async churn.
//
// On native cold start, AuthProvider must await `loadToken()` before issuing
// any authenticated request, so the Preferences→localStorage mirror is in
// place before the request interceptor runs.

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const KEY = 'token'

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export async function loadToken(): Promise<string | null> {
  if (isNative()) {
    const { value } = await Preferences.get({ key: KEY })
    if (value && typeof window !== 'undefined') {
      // Mirror to localStorage so the axios interceptor can read synchronously.
      localStorage.setItem(KEY, value)
    } else if (!value && typeof window !== 'undefined') {
      localStorage.removeItem(KEY)
    }
    return value
  }
  return typeof window !== 'undefined' ? localStorage.getItem(KEY) : null
}

export async function saveToken(value: string): Promise<void> {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, value)
  if (isNative()) {
    await Preferences.set({ key: KEY, value })
  }
}

export async function clearToken(): Promise<void> {
  if (typeof window !== 'undefined') localStorage.removeItem(KEY)
  if (isNative()) {
    await Preferences.remove({ key: KEY })
    // Also clear the on-device session id so a logged-out user can't read data
    // by navigating directly to /dashboard. See lib/native/session.ts.
    await Preferences.remove({ key: 'session_user_id' })
  }
}

// Synchronous read for hot-path consumers (axios interceptor). Native callers
// must have already awaited loadToken() at least once for this to return.
export function getTokenSync(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(KEY) : null
}
