'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '@/lib/constants'
import { AIProviderSettings } from '@/components/dashboard/ai-provider-settings'
import {
  getBiometryStatus,
  isBiometricEnabled,
  enableBiometricForUser,
  disableBiometric,
  promptBiometric,
  type BiometryStatus,
} from '@/lib/native/biometric'

export default function ProfilePage() {
  const router = useRouter()
  const { user, isLoading, logout } = useAuth()
  const { theme, setTheme } = useTheme()

  const [biometryStatus, setBiometryStatus] = useState<BiometryStatus | null>(null)
  const [biometricOn, setBiometricOn] = useState(false)
  const [biometricBusy, setBiometricBusy] = useState(false)
  const [biometricMsg, setBiometricMsg] = useState('')

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
  }, [isLoading, user, router])

  useEffect(() => {
    let cancelled = false
    Promise.all([getBiometryStatus(), isBiometricEnabled()]).then(([s, e]) => {
      if (cancelled) return
      setBiometryStatus(s)
      setBiometricOn(e.enabled)
    })
    return () => { cancelled = true }
  }, [])

  const handleToggleBiometric = async () => {
    if (!user) return
    setBiometricBusy(true)
    setBiometricMsg('')
    try {
      if (biometricOn) {
        // Turning off — no biometric prompt needed.
        await disableBiometric()
        setBiometricOn(false)
        setBiometricMsg('Biometric sign-in disabled.')
      } else {
        // Turning on — verify the user has Face ID enrolled by prompting once.
        const ok = await promptBiometric('Confirm Face ID to enable quick sign-in.')
        if (!ok) {
          setBiometricMsg('Cancelled. Biometric sign-in is still off.')
          return
        }
        await enableBiometricForUser(user.user_id)
        setBiometricOn(true)
        setBiometricMsg('Biometric sign-in enabled. Next time, you can sign in with Face ID.')
      }
    } catch (err: any) {
      setBiometricMsg(err?.message ?? 'Could not change biometric settings.')
    } finally {
      setBiometricBusy(false)
    }
  }

  const handleSignOut = async () => {
    // Disabling biometric is intentional on sign out — protects against
    // someone else hitting "Sign in with Face ID" after you log out.
    await disableBiometric()
    await logout()
  }

  if (isLoading || !user) return null

  const initials = (user.full_name || user.username || '?')[0].toUpperCase()
  const biometryAvailable = biometryStatus?.available === true
  const biometryKind = biometryAvailable
    ? (biometryStatus.kind === 'face_id' ? 'Face ID'
       : biometryStatus.kind === 'touch_id' ? 'Touch ID'
       : 'Biometrics')
    : 'Biometrics'

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8 space-y-5">

      {/* Back link */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back
      </button>

      {/* Header */}
      <header className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xl font-bold">
          {initials}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">{user.full_name || user.username}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">@{user.username}</p>
        </div>
      </header>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {(['light', 'dark'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`h-10 rounded-md border text-sm font-medium capitalize transition-colors ${
                  theme === t
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-accent'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{biometryKind} sign-in</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {biometryAvailable
                  ? 'Skip the password on next launch. Your biometric data never leaves the device.'
                  : biometryStatus?.available === false
                    ? biometryStatus.reason
                    : 'Checking biometric hardware…'}
              </p>
            </div>
            {/* iOS-style switch — proper 51×31 dimensions, clear two-tone track,
                visible white thumb that slides on toggle. */}
            <button
              type="button"
              role="switch"
              aria-checked={biometricOn}
              onClick={handleToggleBiometric}
              disabled={!biometryAvailable || biometricBusy}
              className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full
                border-2 border-transparent transition-colors duration-200 ease-in-out
                focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                disabled:opacity-40 disabled:cursor-not-allowed
                ${biometricOn
                  ? 'bg-emerald-500'
                  : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-[27px] w-[27px] transform rounded-full
                  bg-white shadow-md ring-0 transition duration-200 ease-in-out
                  ${biometricOn ? 'translate-x-[20px]' : 'translate-x-0'}`}
              />
            </button>
          </div>

          {/* Enrollment hint: shown when hardware is present but no Face ID/
              fingerprint is set up, OR when running on the iOS Simulator. */}
          {biometryStatus?.available === false && !/only works/i.test(biometryStatus.reason ?? '') && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Set up Face ID on this device first
              </p>
              <p className="text-[11px] text-amber-700/90 dark:text-amber-300/80 mt-1 leading-relaxed">
                Open <span className="font-mono">iOS Settings → Face ID &amp; Passcode</span> and enroll your face. On the
                Xcode Simulator: <span className="font-mono">Features → Face ID → Enrolled</span>. Then come back and toggle this on.
              </p>
            </div>
          )}

          {biometricMsg && (
            <p className="text-xs text-muted-foreground">{biometricMsg}</p>
          )}
        </CardContent>
      </Card>

      {/* AI Provider — full settings, moved here from the AI Insights tab */}
      <AIProviderSettings />

      {/* Data & privacy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data &amp; Privacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row
            label="Manage exports & backups"
            sub="Download CSV/JSON, restore from a snapshot."
            onClick={() => router.push('/documents')}
          />
          <Row
            label="About Nworth"
            sub={APP_TAGLINE}
            onClick={() => router.push('/about')}
          />
        </CardContent>
      </Card>

      {/* Sign out */}
      <Card>
        <CardContent className="py-4">
          <Button
            variant="outline"
            className="w-full text-red-600 hover:bg-red-50 hover:border-red-300 dark:hover:bg-red-950/30 border-red-300"
            onClick={handleSignOut}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="text-center text-[11px] text-muted-foreground">
        {APP_NAME} v{APP_VERSION}
      </p>
    </div>
  )
}

function Row({
  label, sub, onClick,
}: { label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-accent transition-colors"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground shrink-0">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  )
}
