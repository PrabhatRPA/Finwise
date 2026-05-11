'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { authApi } from './api'

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
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setIsLoading(false)
      return
    }

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
        localStorage.removeItem('token')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    tryAuth(15)  // retry up to 15 × 2 s = 30 s before giving up
    return () => { cancelled = true }
  }, [])

  const login = async (username: string, password: string) => {
    const res = await authApi.login(username, password)
    localStorage.setItem('token', res.data.access_token)
    setUser({
      user_id: res.data.user_id,
      username: res.data.username,
      full_name: res.data.full_name,
      email: `${res.data.username}@local`,
    })
  }

  const register = async (username: string, password: string, fullName?: string) => {
    const res = await authApi.register(username, password, fullName)
    localStorage.setItem('token', res.data.access_token)
    setUser({
      user_id: res.data.user_id,
      username: res.data.username,
      full_name: res.data.full_name,
      email: `${res.data.username}@local`,
    })
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
