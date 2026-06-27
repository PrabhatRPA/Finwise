'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '@/lib/constants'
import { authApi } from '@/lib/api'
import { saveToken } from '@/lib/token'
import {
  isBiometricEnabled,
  promptBiometric,
  getBiometryStatus,
} from '@/lib/native/biometric'
import { setSessionUserId } from '@/lib/native/session'
import { signInWithApple } from '@/lib/native/auth'
import { getICloudStatus, restoreFromICloud } from '@/lib/native/icloud'

// Path shown in the "failed to start" error — matches what lib.rs writes.
const LOG_PATHS = {
  mac: '~/Library/Application Support/com.raotechllc.nworth/sidecar.log',
  win: '%APPDATA%\\com.raotechllc.nworth\\sidecar.log',
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
  const { login, isAuthenticated, isLoading, refreshUser } = useAuth()
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [backendState, setBackendState] = useState<BackendState>('checking')
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Face ID / Touch ID state — only shown if previously enabled in /profile.
  const [bioEnabled, setBioEnabled] = useState(false)
  const [bioKind, setBioKind] = useState<'face_id' | 'touch_id' | 'other'>('face_id')
  const [bioBusy, setBioBusy] = useState(false)

  // Sign in with Apple state
  const [isNative, setIsNative] = useState(false)
  const [appleBusy, setAppleBusy] = useState(false)
  const [appleError, setAppleError] = useState('')
  // After a new Apple account is created, ask if user wants to restore from iCloud
  const [showICloudPrompt, setShowICloudPrompt] = useState(false)
  const [icloudRestoring, setIcloudRestoring] = useState(false)
  const [icloudMsg, setIcloudMsg] = useState('')

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace('/dashboard')
  }, [isAuthenticated, isLoading, router])

  useEffect(() => {
    setIsNative(typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.() === true)
  }, [])

  // Detect if biometric sign-in was enabled previously.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [status, enabled] = await Promise.all([
        getBiometryStatus(),
        isBiometricEnabled(),
      ])
      if (cancelled) return
      setBioEnabled(enabled.enabled && status.available)
      if (status.available) setBioKind(status.kind)
    })()
    return () => { cancelled = true }
  }, [])

  // Sign in via Face ID / Touch ID.
  // On success, we re-establish the session for the saved user_id without
  // going through the username/password flow. This works because the bcrypt
  // check happened at registration time; Face ID is the new auth factor.
  const handleBiometricSignIn = async () => {
    setError('')
    setBioBusy(true)
    try {
      const enabled = await isBiometricEnabled()
      if (!enabled.enabled || !enabled.userId) {
        setError('Biometric sign-in is not enabled. Sign in with your password first.')
        return
      }
      const ok = await promptBiometric(`Sign in to ${APP_NAME}`)
      if (!ok) return
      // Establish the on-device session. setSessionUserId updates BOTH the
      // persisted value and the in-memory cache in session.ts — using raw
      // Preferences.set left the cache stale, so the very next me() lookup
      // failed and the dashboard bounced straight back here.
      await setSessionUserId(enabled.userId)
      await saveToken('local-session')
      // Pull the session into auth state, then SPA-navigate. (A hard
      // window.location to '/dashboard' broke because static export uses
      // trailingSlash, so the file lives at '/dashboard/' and the bare path
      // fell back to the index → login.)
      const established = await refreshUser()
      if (established) {
        router.replace('/dashboard')
      } else {
        setError('Could not start your session. Please sign in with your password.')
      }
    } catch (err: any) {
      setError(err?.message ?? 'Biometric sign-in failed.')
    } finally {
      setBioBusy(false)
    }
  }

  // Poll the backend health endpoint every second.
  // Max 90 attempts = 90 seconds before giving up with a failure message.
  useEffect(() => {
    // On Capacitor (iOS/Android) there is no backend sidecar to wait for —
    // the data layer is on-device SQLite. Skip the polling entirely so the
    // form unlocks immediately.
    const isNative = typeof window !== 'undefined'
      && (window as any).Capacitor?.isNativePlatform?.() === true
    if (isNative) {
      setBackendState('ready')
      return
    }

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

  const handleAppleSignIn = async () => {
    setAppleError('')
    setAppleBusy(true)
    try {
      const { isNewUser } = await signInWithApple()
      await refreshUser()
      if (isNewUser) {
        // Check if there's an iCloud snapshot they might want to restore.
        const status = await getICloudStatus().catch(() => null)
        if (status?.available && status.remoteExists) {
          setShowICloudPrompt(true)
          setAppleBusy(false)
          return
        }
      }
      router.replace('/dashboard')
    } catch (err: any) {
      setAppleError(err?.message ?? 'Sign in with Apple failed.')
    } finally {
      setAppleBusy(false)
    }
  }

  const handleICloudRestore = async () => {
    setIcloudRestoring(true)
    setIcloudMsg('')
    try {
      await restoreFromICloud()
      setIcloudMsg('Restored successfully!')
      setTimeout(() => router.replace('/dashboard'), 1200)
    } catch (err: any) {
      setIcloudMsg(err?.message ?? 'Restore failed.')
      setIcloudRestoring(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      // Always lowercase: registration also lowercases, so this keeps the
      // login lookup case-insensitive regardless of what iOS auto-capitalized.
      await login(username.trim().toLowerCase(), password)
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
            <p className="text-sm text-muted-foreground mt-0.5">{APP_TAGLINE}</p>
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
              When you dragged the new Nworth into Applications, macOS didn&apos;t fully replace the old version&apos;s files. This is a known macOS gotcha &mdash; do a clean reinstall to fix it:
            </p>
            <ol className="text-xs text-amber-700/90 dark:text-amber-300/80 list-decimal list-inside space-y-0.5 ml-1">
              <li>Quit Nworth (⌘Q).</li>
              <li>Drag <span className="font-semibold">Nworth</span> from your Applications folder to the Trash.</li>
              <li><span className="font-semibold">Empty the Trash.</span></li>
              <li>Open the Nworth <span className="font-mono">.dmg</span> again and drag Nworth back into Applications.</li>
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
              The Nworth service did not start. Try quitting and reopening the app.
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

        {/* iCloud restore prompt — shown after a new Apple Sign-In when a snapshot exists */}
        {showICloudPrompt && (
          <Card className="shadow-md border-primary/40">
            <CardContent className="pt-6 space-y-3">
              <h2 className="text-base font-semibold text-center">Data found in iCloud</h2>
              <p className="text-sm text-muted-foreground text-center">
                We found a portfolio snapshot in your iCloud Drive. Restore it now to bring your data to this device.
              </p>
              {icloudMsg && (
                <p className={`text-xs font-medium text-center ${icloudMsg.startsWith('Restored') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {icloudMsg}
                </p>
              )}
              <Button className="w-full" onClick={handleICloudRestore} disabled={icloudRestoring}>
                {icloudRestoring ? 'Restoring…' : 'Restore from iCloud'}
              </Button>
              <button
                type="button"
                className="w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={() => router.replace('/dashboard')}
              >
                Skip — start fresh
              </button>
            </CardContent>
          </Card>
        )}

        {/* Login card */}
        {!showICloudPrompt && <Card className="shadow-md border-border/60">
          <CardContent className="pt-6">
            <h2 className="text-base font-semibold mb-4 text-center">Sign in to your account</h2>

            {/* Sign in with Apple — only on iOS */}
            {isNative && (
              <>
                <button
                  type="button"
                  onClick={handleAppleSignIn}
                  disabled={appleBusy}
                  className="w-full mb-3 inline-flex items-center justify-center gap-2 h-11 rounded-md bg-black text-white font-medium text-sm hover:bg-zinc-800 active:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.42c1.33.07 2.25.73 3.03.75.86-.14 1.7-.8 3.06-.85 1.64-.07 2.88.85 3.68 2.12-3.27 2.03-2.68 6.43.59 7.77-.52 1.38-1.27 2.74-2.36 3.07zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  {appleBusy ? 'Signing in…' : 'Sign in with Apple'}
                </button>
                {appleError && (
                  <p className="text-xs text-destructive text-center mb-3">{appleError}</p>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              </>
            )}

            {/* Biometric sign-in — shown only when previously enabled in Profile */}
            {bioEnabled && (
              <>
                <button
                  type="button"
                  onClick={handleBiometricSignIn}
                  disabled={bioBusy || backendState !== 'ready'}
                  className="w-full mb-3 inline-flex items-center justify-center gap-2 h-11 rounded-md border border-primary/30 bg-primary/5 text-primary font-medium text-sm hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  {bioKind === 'face_id' ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                      strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M3 9V6a3 3 0 0 1 3-3h3M21 9V6a3 3 0 0 0-3-3h-3M3 15v3a3 3 0 0 0 3 3h3M21 15v3a3 3 0 0 1-3 3h-3" />
                      <path d="M8 9v2M16 9v2M9 16s1 1.5 3 1.5S15 16 15 16M12 9v4h-1" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                      strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M12 11v6m-4-9a4 4 0 0 1 8 0v1m-9 4c0-3 1-5 5-5s5 2 5 5v3a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3z" />
                    </svg>
                  )}
                  {bioBusy
                    ? 'Authenticating…'
                    : (bioKind === 'face_id' ? 'Sign in with Face ID'
                      : bioKind === 'touch_id' ? 'Sign in with Touch ID'
                      : 'Sign in with biometrics')}
                </button>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">or password</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Username</label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your-username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  disabled={backendState !== 'ready'}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    disabled={backendState !== 'ready'}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-0 top-0 h-9 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      // eye-off
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      // eye
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
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
        </Card>}

        <p className="text-center text-[11px] text-muted-foreground/60">
          {APP_NAME} v{APP_VERSION} · All data stored locally on your device
        </p>
      </div>
    </div>
  )
}
