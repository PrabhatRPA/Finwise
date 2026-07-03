'use client'

// Wraps the whole app. When App Lock is on (native + biometry available + a
// signed-in session exists), it covers the UI with a lock screen and requires
// Face ID / Touch ID / passcode:
//   • on cold launch, before any authenticated screen is shown, and
//   • when returning to the foreground after >APP_LOCK_GRACE_MS in background.
// No-op on web/desktop and when the user isn't signed in (e.g. the login page).

import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { loadToken, clearToken } from '@/lib/token'
import { getBiometryStatus, promptBiometric } from '@/lib/native/biometric'
import { isAppLockEnabled, APP_LOCK_GRACE_MS } from '@/lib/native/app-lock'
import { APP_NAME } from '@/lib/constants'

// Whether a lock should be enforced right now: native, enabled, biometry
// present, and a persisted session exists.
async function shouldEnforceLock(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  if (!(await isAppLockEnabled())) return false
  const token = await loadToken()
  if (!token) return false                    // not signed in → login flow, no lock
  const bio = await getBiometryStatus()
  return bio.available                         // can't prompt reliably without biometry
}

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform()
  // Start locked on native so nothing sensitive paints before we've decided.
  const [locked, setLocked] = useState(isNative)
  const [decided, setDecided] = useState(!isNative)
  const [prompting, setPrompting] = useState(false)
  const bgSince = useRef<number | null>(null)
  const unlocking = useRef(false)

  const unlock = async () => {
    if (unlocking.current) return
    unlocking.current = true
    setPrompting(true)
    try {
      const ok = await promptBiometric(`Unlock ${APP_NAME}`)
      if (ok) setLocked(false)
    } finally {
      setPrompting(false)
      unlocking.current = false
    }
  }

  // Initial decision on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const enforce = await shouldEnforceLock()
      if (cancelled) return
      setDecided(true)
      if (enforce) {
        setLocked(true)
        unlock()
      } else {
        setLocked(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-lock after a long background stint.
  useEffect(() => {
    if (!isNative) return
    let remove: (() => void) | undefined
    ;(async () => {
      try {
        const { App } = await import('@capacitor/app')
        const handle = await App.addListener('appStateChange', async ({ isActive }) => {
          if (!isActive) {
            bgSince.current = Date.now()
            return
          }
          // Foreground: re-lock if we were away long enough and a lock applies.
          const away = bgSince.current ? Date.now() - bgSince.current : 0
          bgSince.current = null
          if (away > APP_LOCK_GRACE_MS && await shouldEnforceLock()) {
            setLocked(true)
            unlock()
          }
        })
        remove = () => handle.remove()
      } catch { /* native App plugin unavailable */ }
    })()
    return () => { remove?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative])

  const signOut = async () => {
    await clearToken()
    setLocked(false)
    window.location.href = '/login'
  }

  // While deciding on native, render nothing over the (already-showing) splash.
  if (!decided && isNative) return null

  if (locked) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background px-6 text-center">
        <div className="h-16 w-16 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-bold">{APP_NAME} is locked</h1>
          <p className="text-sm text-muted-foreground">
            Unlock with Face ID, Touch ID, or your passcode to continue.
          </p>
        </div>
        <button
          onClick={unlock}
          disabled={prompting}
          className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-60"
        >
          {prompting ? 'Waiting…' : 'Unlock'}
        </button>
        <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground">
          Sign out instead
        </button>
      </div>
    )
  }

  return <>{children}</>
}
