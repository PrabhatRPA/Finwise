'use client'

// Privacy blur: hides sensitive monetary values (net worth + key balances) so
// the app can be viewed in public without exposing figures. Display-only — the
// underlying stored values are never changed. Persisted locally and broadcast
// with the same localStorage + Event pattern as bar-style.ts / float-side.ts,
// so the toggle button and every blurred figure stay in sync and survive a
// relaunch, consistent with the privacy-first, local-only model.

import { useEffect, useState } from 'react'

const KEY = 'privacy_blur'
const EVENT = 'privacy-blur-change'

export function getPrivacyBlur(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setPrivacyBlur(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0')
    window.dispatchEvent(new Event(EVENT))
  } catch { /* ignore */ }
}

export function togglePrivacyBlur(): void {
  setPrivacyBlur(!getPrivacyBlur())
}

export function usePrivacyBlur(): boolean {
  // Always start false so SSR/first paint match; hydrate the saved value on
  // mount and re-read whenever any component toggles it.
  const [on, setOn] = useState(false)
  useEffect(() => {
    setOn(getPrivacyBlur())
    const handler = () => setOn(getPrivacyBlur())
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [])
  return on
}
