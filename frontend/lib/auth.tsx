'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { authApi } from './api'
import { loadToken, saveToken, clearToken } from './token'

// Foreground fallback cadence for the iCloud reconcile poll. Deliberately slow:
// launch/foreground reconcile + the KV beacon handle real-time sync, so this is
// only a safety net for a device left open. (Was 30s, which visibly refreshed
// the dashboard's today-driven charts every tick.)
const ICLOUD_POLL_MS = 5 * 60 * 1000  // 5 minutes

interface AuthUser {
  user_id: number
  username: string
  full_name?: string | null
  email: string
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, fullName?: string) => Promise<void>
  logout: () => Promise<void>
  // Permanently deletes the signed-in account and all its data, then reloads
  // to the entry route (register if it was the last account, login otherwise).
  // opts choose whether local backups / the iCloud snapshot go too (default yes).
  deleteAccount: (opts?: { backups?: boolean; icloud?: boolean }) => Promise<void>
  // Re-reads the current on-device session (used after Face ID / Touch ID
  // sign-in, which establishes the session outside the password flow).
  refreshUser: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    // The packaged desktop app spawns the backend sidecar on launch; it can
    // take up to ~20 s to extract and start.  Retry on network errors rather
    // than invalidating a perfectly good token just because the server isn't
    // listening yet.
    const tryAuth = async (attemptsLeft: number) => {
      try {
        const res = await authApi.me()
        if (!cancelled) setUser(res.data)
      } catch (err: any) {
        if (cancelled) return
        const isNetworkError = !err.response          // no HTTP response = server unreachable
        if (isNetworkError && attemptsLeft > 0) {
          await new Promise(r => setTimeout(r, 2000))
          return tryAuth(attemptsLeft - 1)
        }
        // Actual auth failure (401/403) or retries exhausted → clear token
        await clearToken()
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    ;(async () => {
      // On iOS, loadToken mirrors Preferences → localStorage so the synchronous
      // axios interceptor can find the token on the first request.
      const token = await loadToken()
      if (cancelled) return
      if (!token) {
        setIsLoading(false)
        return
      }
      tryAuth(15)  // retry up to 15 × 2 s = 30 s before giving up
    })()

    return () => { cancelled = true }
  }, [])

  // Bidirectional iCloud auto-sync, wired while signed in (native only).
  //   • On launch + every foreground: reconcile — pull the master if another
  //     device has a newer snapshot. This is also what arms auto-push, so seed
  //     writes during startup can't clobber the master.
  //   • A slow fallback poll while foregrounded, so a device left open still
  //     picks up another device's edits without a foreground event. Real-time
  //     cross-device propagation comes from the KV beacon (seconds), not this
  //     poll — so it only needs to be a safety net, not frequent. Kept slow (5
  //     min) on purpose: a local-first app has no reason to reconcile holdings
  //     every few seconds, and the frequent tick was visibly refreshing the
  //     dashboard's today-driven charts. Cheap when nothing changed —
  //     reconcileICloud fast-paths out unless the remote revision advanced.
  //   • On background: push local changes up.
  // Dynamically imported so web/Tauri builds don't pull in the native modules.
  useEffect(() => {
    if (!user) return
    let remove: (() => void) | undefined
    let poll: ReturnType<typeof setInterval> | undefined
    ;(async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return
        const { App } = await import('@capacitor/app')
        const { autoSyncIfEnabled, reconcileICloud, initSyncListeners } = await import('./native/icloud')
        // Initial launch reconciliation (pull master if newer; arm auto-push).
        reconcileICloud()
        // Doorbell: other devices' pushes wake us within seconds via the
        // iCloud Key-Value beacon (no waiting for the next poll tick).
        const stopBeacon = await initSyncListeners()
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            reconcileICloud()                 // foreground → pull if remote newer
            if (!poll) poll = setInterval(() => { reconcileICloud() }, ICLOUD_POLL_MS)
          } else {
            autoSyncIfEnabled()               // background → push local changes
            if (poll) { clearInterval(poll); poll = undefined }  // pause polling in background
          }
        })
        // Start the slow fallback poll for the current (foreground) session.
        poll = setInterval(() => { reconcileICloud() }, ICLOUD_POLL_MS)
        remove = () => { handle.remove(); stopBeacon() }
      } catch {
        // native modules unavailable — skip
      }
    })()
    return () => { remove?.(); if (poll) clearInterval(poll) }
  }, [user])

  const login = async (username: string, password: string) => {
    const res = await authApi.login(username, password)
    await saveToken(res.data.access_token)
    setUser({
      user_id: res.data.user_id,
      username: res.data.username,
      full_name: res.data.full_name,
      email: `${res.data.username}@local`,
    })
  }

  const register = async (username: string, password: string, fullName?: string) => {
    const res = await authApi.register(username, password, fullName)
    await saveToken(res.data.access_token)
    setUser({
      user_id: res.data.user_id,
      username: res.data.username,
      full_name: res.data.full_name,
      email: `${res.data.username}@local`,
    })
  }

  const logout = async () => {
    await clearToken()
    setUser(null)
    window.location.href = '/login'
  }

  const deleteAccount = async (opts?: { backups?: boolean; icloud?: boolean }) => {
    await authApi.deleteAccount(opts)
    await clearToken()
    setUser(null)
    // Full navigation (not router.push): unmounts the iCloud poll/listeners
    // and aborts in-flight fetches against the now-wiped database. The root
    // route re-runs checkSetup and lands on register (no users left) or login.
    window.location.href = '/'
  }

  // Pull the active session into state without a full reload. Returns false if
  // there's no valid session (so callers can show an error instead of bouncing).
  const refreshUser = async (): Promise<boolean> => {
    try {
      const res = await authApi.me()
      setUser(res.data)
      return true
    } catch {
      return false
    }
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, register, logout, deleteAccount, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
