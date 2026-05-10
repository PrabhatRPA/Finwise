'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { APP_NAME, APP_VERSION } from '@/lib/constants'

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

  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace('/dashboard')
  }, [isAuthenticated, isLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match'); return }
    setSubmitting(true)
    try {
      await register(username, password, fullName || undefined)
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Registration failed. Please try again.')
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
              {isSetup ? 'Set up your private local profile' : 'Create your account'}
            </p>
          </div>
        </div>

        {/* Register card */}
        <Card className="shadow-md border-border/60">
          <CardContent className="pt-6">
            <h2 className="text-base font-semibold mb-4 text-center">
              {isSetup ? 'Welcome! Create your account' : 'Create account'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Full name <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Username <span className="text-destructive">*</span></label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="choose-a-username"
                  autoComplete="username"
                  required minLength={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Password <span className="text-destructive">*</span></label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required minLength={6}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Confirm password <span className="text-destructive">*</span></label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full mt-1" disabled={submitting}>
                {submitting ? 'Creating account…' : 'Create account'}
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
