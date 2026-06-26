'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { authApi } from './api'
import { loadToken, saveToken, clearToken } from './token'

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

  // Auto-sync to iCloud when the app moves to the background (if the user
  // enabled it in Settings). Only wired while signed in. Dynamically imported
  // so web/Tauri builds don't pull in the native modules.
  useEffect(() => {
    if (!user) return
    let remove: (() => void) | undefined
    ;(async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return
        const { App } = await import('@capacitor/app')
        const { autoSyncIfEnabled } = await import('./native/icloud')
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) autoSyncIfEnabled()
        })
        remove = () => { handle.remove() }
      } catch {
        // native modules unavailable — skip
      }
    })()
    return () => { remove?.() }
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
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
