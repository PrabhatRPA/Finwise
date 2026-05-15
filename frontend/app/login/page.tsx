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

// Path shown in the "failed to start" error — matches what lib.rs writes.
const LOG_PATHS = {
  mac: '~/Library/Application Support/com.raotechllc.finwise/sidecar.log',
  win: '%APPDATA%\\com.raotechllc.finwise\\sidecar.log',
}

type BackendState = 'checking' | 'ready' | 'failed' | 'stale-install'

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
  const [backendState, setBackendState] = useState<BackendState>('checking')
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace('/dashboard')
  }, [isAuthenticated, isLoading, router])

  // Poll the backend health endpoint every second.
  // Max 90 attempts = 90 seconds before giving up with a failure message.
  useEffect(() => {
    let attempts = 0
    const MAX_ATTEMPTS = 90

    // Check if lib.rs already signalled a startup failure via a JS global.
    // __staleInstall takes priority — it's set when the bundle's
    // Contents/Frameworks/ is missing (drag-replace partial-overwrite).
    if (typeof window !== 'undefined' && (window as any).__staleInstall) {
      setBackendState('stale-install')
      return
    }
    if (typeof window !== 'undefined' && (window as any).__backendStartFailed) {
      setBackendState('failed')
      return
    }

    const check = async () => {
      // Re-check Rust-side flags on each poll.
      if (typeof window !== 'undefined' && (window as any).__staleInstall) {
        setBackendState('stale-install')
        if (pollingRef.current) clearInterval(pollingRef.current)
        return
      }
      if (typeof window !== 'undefined' && (window as any).__backendStartFailed) {
        setBackendState('failed')
        if (pollingRef.current) clearInterval(pollingRef.current)
        return
      }

      try {
        await authApi.checkSetup()
        setBackendState('ready')
        if (pollingRef.current) clearInterval(pollingRef.current)
      } catch (err: any) {
        attempts++
        if (err?.response) {
          // Backend is up — it returned an HTTP error (e.g. 404, 200 etc.)
          setBackendState('ready')
          if (pollingRef.current) clearInterval(pollingRef.current)
        } else if (attempts >= MAX_ATTEMPTS) {
          // Network error after 90 s — backend never started.
          setBackendState('failed')
          if (pollingRef.current) clearInterval(pollingRef.current)
        }
        // Otherwise keep polling — state remains 'checking'.
      }
    }

    check()
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
        setError('Cannot reach the backend. Please restart the app.')
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
            <p className="text-sm text-muted-foreground mt-0.5">Your private finance dashboard</p>
          </div>
        </div>

        {/* Backend status banners — shown above the card */}
        {backendState === 'checking' && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3">
            <span className="animate-spin h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Starting services…</p>
              <p className="text-xs text-amber-600/70 dark:text-amber-500/70">
                The backend is loading. Login will enable automatically.
              </p>
            </div>
          </div>
        )}

        {backendState === 'stale-install' && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-4 py-3 space-y-2">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Incomplete install detected
            </p>
            <p className="text-xs text-amber-700/90 dark:text-amber-300/80">
              When you dragged the new Finwise into Applications, macOS didn&apos;t fully replace the old version&apos;s files. This is a known macOS gotcha &mdash; do a clean reinstall to fix it:
            </p>
            <ol className="text-xs text-amber-700/90 dark:text-amber-300/80 list-decimal list-inside space-y-0.5 ml-1">
              <li>Quit Finwise (⌘Q).</li>
              <li>Drag <span className="font-semibold">Finwise</span> from your Applications folder to the Trash.</li>
              <li><span className="font-semibold">Empty the Trash.</span></li>
              <li>Open the Finwise <span className="font-mono">.dmg</span> again and drag Finwise back into Applications.</li>
            </ol>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 italic">
              Your data is safe &mdash; it lives outside the app bundle and is never touched by reinstall.
            </p>
          </div>
        )}

        {backendState === 'failed' && (
          <div className="rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 space-y-1.5">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Backend failed to start</p>
            <p className="text-xs text-red-600/80 dark:text-red-400/80">
              The Finwise service did not start. Try quitting and reopening the app.
              If the problem persists, check the log file:
            </p>
            <p className="text-[11px] font-mono text-red-500 dark:text-red-400 break-all">
              {LOG_PATHS.mac}
            </p>
            <p className="text-[11px] font-mono text-red-500 dark:text-red-400 break-all">
              {LOG_PATHS.win}
            </p>
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
                  disabled={backendState !== 'ready'}
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
                  disabled={backendState !== 'ready'}
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
                disabled={submitting || backendState !== 'ready'}
              >
                {backendState === 'checking'
                  ? 'Waiting for services…'
                  : backendState === 'stale-install'
                  ? 'Reinstall required'
                  : backendState === 'failed'
                  ? 'Backend unavailable'
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
