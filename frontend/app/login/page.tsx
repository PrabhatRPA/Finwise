'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { APP_NAME, APP_VERSION } from '@/lib/constants'
import { authApi } from '@/lib/api'

function AppMark() {
  return (
    <svg width="48" height="48" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="36" height="36" rx="9" fill="hsl(161 93% 30%)" />
      <rect x="6"    y="24" width="5.5" height="8"  rx="1.5" fill="rgba(255,255,255,0.45)" />
      <rect x="15.25" y="18" width="5.5" height="14" rx="1.5" fill="rgba(255,255,255,0.70)" />
      <rect x="24.5" y="12" width="5.5" height="20" rx="1.5" fill="white" />
      <polyline points="9,23 18,17 27.25,11" stroke="rgba(255,255,255,0.30)"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Backend startup state: null = unknown, true = ready, false = still starting
  const [backendReady, setBackendReady] = useState<boolean | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace('/dashboard')
  }, [isAuthenticated, isLoading, router])

  // Poll the backend health endpoint until it responds, then allow login.
  useEffect(() => {
    let attempts = 0
    const MAX_ATTEMPTS = 60 // 60 × 1 s = 1 minute

    const check = async () => {
      try {
        await authApi.checkSetup()
        setBackendReady(true)
        if (pollingRef.current) clearInterval(pollingRef.current)
      } catch (err: any) {
        attempts++
        // A network error (no response) means backend not ready yet.
        // An HTTP response (even 4xx) means the backend IS running.
        if (err?.response || attempts >= MAX_ATTEMPTS) {
          setBackendReady(true)
          if (pollingRef.current) clearInterval(pollingRef.current)
        } else {
          setBackendReady(false)
        }
      }
    }

    check() // immediate first check
    pollingRef.current = setInterval(check, 1000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username, password)
      router.replace('/dashboard')
    } catch (err: any) {
      if (!err?.response) {
        setError('Backend service is not responding. Please wait a moment and try again.')
      } else {
        setError(err?.response?.data?.detail ?? 'Login failed. Check your username and password.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) return null

  return (
    <div className="flex-1 flex items-center justify-center p-4
      bg-gradient-to-br from-emerald-50 via-background to-slate-100
      dark:from-emerald-950/20 dark:via-background dark:to-slate-900">

      <div className="w-full max-w-sm space-y-6">

        {/* Brand header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <AppMark />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{APP_NAME}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Your private finance dashboard
            </p>
          </div>
        </div>

        {/* Backend starting banner */}
        {backendReady === false && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3">
            <span className="animate-spin h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Starting services…</p>
              <p className="text-xs text-amber-600/80 dark:text-amber-500/80">The backend is loading. Login will enable automatically.</p>
            </div>
          </div>
        )}

        {/* Login card */}
        <Card className="shadow-md border-border/60">
          <CardContent className="pt-6">
            <h2 className="text-base font-semibold mb-4 text-center">Sign in to your account</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Username</label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your-username"
                  autoComplete="username"
                  required
                  disabled={backendReady === false}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  disabled={backendReady === false}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full mt-1"
                disabled={submitting || backendReady === false}
              >
                {backendReady === false
                  ? 'Waiting for services…'
                  : submitting
                  ? 'Signing in…'
                  : 'Sign in'}
              </Button>
            </form>
            <p className="text-center text-xs text-muted-foreground mt-4">
              No account?{' '}
              <Link href="/register" className="text-primary hover:underline font-medium">
                Create one
              </Link>
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground/60">
          {APP_NAME} v{APP_VERSION} · All data stored locally on your device
        </p>
      </div>
    </div>
  )
}
