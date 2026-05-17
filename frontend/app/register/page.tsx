'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '@/lib/constants'

// Username and password rules (kept in sync with backend/app/api/v1/auth.py)
const USERNAME_MIN   = 3
const USERNAME_MAX   = 30
const USERNAME_REGEX = /^[a-z0-9_-]+$/
const PASSWORD_MIN   = 6

function validate(field: 'username' | 'password', value: string): string {
  if (field === 'username') {
    if (value.length === 0) return ''
    if (value.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters`
    if (value.length > USERNAME_MAX) return `Max ${USERNAME_MAX} characters`
    if (!USERNAME_REGEX.test(value.toLowerCase()))
      return 'Only letters, numbers, hyphens and underscores'
    return 'ok'
  }
  if (field === 'password') {
    if (value.length === 0) return ''
    if (value.length < PASSWORD_MIN) return `At least ${PASSWORD_MIN} characters`
    return 'ok'
  }
  return ''
}

function HintRow({ status, msg }: { status: string; msg: string }) {
  if (!status) return null
  const ok = status === 'ok'
  return (
    <p className={`text-xs mt-1 flex items-center gap-1 ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
      {ok ? '✓' : '⚠'} {ok ? 'Looks good' : msg}
    </p>
  )
}

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

function RegisterForm() {
  const { register, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isSetup = searchParams.get('setup') === 'true'

  const [username, setUsername]   = useState('')
  const [fullName, setFullName]   = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  // Single toggle controls both password fields — common UX pattern that
  // saves the user the second tap.
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]         = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Backend readiness — poll health until the sidecar is up
  const [backendReady, setBackendReady] = useState(false)
  const cancelRef = useRef(false)

  useEffect(() => {
    // On Capacitor (iOS/Android) there is no backend sidecar — skip the
    // localhost health check, which would hang forever on a device.
    const isNative = typeof window !== 'undefined'
      && (window as any).Capacitor?.isNativePlatform?.() === true
    if (isNative) {
      setBackendReady(true)
      return
    }

    cancelRef.current = false
    const check = async () => {
      try {
        await fetch('http://localhost:8000/health', { signal: AbortSignal.timeout(2000) })
        if (!cancelRef.current) setBackendReady(true)
      } catch {
        if (!cancelRef.current) setTimeout(check, 2000)
      }
    }
    check()
    return () => { cancelRef.current = true }
  }, [])

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace('/dashboard')
  }, [isAuthenticated, isLoading, router])

  const userStatus = validate('username', username)
  const passStatus = validate('password', password)
  const confirmOk  = confirm.length > 0 && password === confirm
  const canSubmit  = backendReady && !submitting
    && userStatus === 'ok'
    && passStatus === 'ok'
    && confirmOk

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSubmitting(true)
    try {
      await register(username.toLowerCase(), password, fullName || undefined)
      router.replace('/dashboard')
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (!err.response) {
        // Network error — backend still warming up, retry once after 3 s
        setError('Backend is still starting. Retrying in 3 seconds…')
        setTimeout(async () => {
          try {
            await register(username.toLowerCase(), password, fullName || undefined)
            router.replace('/dashboard')
          } catch (err2: any) {
            setError(err2?.response?.data?.detail ?? 'Registration failed. Please try again.')
          } finally {
            setSubmitting(false)
          }
        }, 3000)
        return
      }
      setError(typeof detail === 'string' ? detail : 'Registration failed. Please try again.')
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
              {APP_TAGLINE}
            </p>
          </div>
        </div>

        {/* Register card */}
        <Card className="shadow-md border-border/60">
          <CardContent className="pt-6">
            <h2 className="text-base font-semibold mb-4 text-center">
              {isSetup ? 'Welcome! Create your account' : 'Create account'}
            </h2>

            {/* Backend warming up notice */}
            {!backendReady && (
              <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
                <span className="animate-spin">⏳</span>
                Starting up… the form will unlock in a moment.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Full name */}
              <div>
                <label className="text-sm font-medium block mb-1">
                  Full name <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>

              {/* Username */}
              <div>
                <label className="text-sm font-medium block mb-1">
                  Username <span className="text-destructive">*</span>
                </label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="e.g. john_doe"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
                <HintRow status={userStatus} msg={
                  username.length > 0 && username.length < USERNAME_MIN
                    ? `At least ${USERNAME_MIN} characters (${username.length}/${USERNAME_MIN})`
                    : username.length > USERNAME_MAX
                    ? `Too long — max ${USERNAME_MAX} characters`
                    : 'Only letters, numbers, hyphens ( - ) and underscores ( _ )'
                } />
                {!username && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {USERNAME_MIN}–{USERNAME_MAX} chars · letters, numbers, - and _ only · lowercase
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="text-sm font-medium block mb-1">
                  Password <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                    className="absolute right-0 top-0 h-9 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                <HintRow status={passStatus} msg={`At least ${PASSWORD_MIN} characters (${password.length}/${PASSWORD_MIN})`} />
                {!password && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Minimum {PASSWORD_MIN} characters
                  </p>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="text-sm font-medium block mb-1">
                  Confirm password <span className="text-destructive">*</span>
                </label>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
                {confirm.length > 0 && (
                  <p className={`text-xs mt-1 flex items-center gap-1 ${confirmOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {confirmOk ? '✓ Passwords match' : '⚠ Passwords do not match'}
                  </p>
                )}
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full mt-1" disabled={!canSubmit}>
                {submitting ? 'Creating account…' : !backendReady ? 'Starting up…' : 'Create account'}
              </Button>
            </form>

            {!isSetup && (
              <p className="text-center text-xs text-muted-foreground mt-4">
                Already have an account?{' '}
                <Link href="/login" className="text-primary hover:underline font-medium">
                  Sign in
                </Link>
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground/60">
          {APP_NAME} v{APP_VERSION} · All data stored locally on your device
        </p>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  )
}
