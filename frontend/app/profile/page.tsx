'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
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
import { connectAppleId, getAppleUserId, updateFullName } from '@/lib/native/auth'
import { isAppLockEnabled, setAppLockEnabled } from '@/lib/native/app-lock'
import { getFloatSide, setFloatSide, type FloatSide } from '@/lib/float-side'
import { ThemePicker } from '@/components/ds/theme-picker'

export default function ProfilePage() {
  const router = useRouter()
  const { user, isLoading, logout, refreshUser } = useAuth()

  // Inline display-name editing (Apple accounts especially — their username is
  // a cryptic stable id; the visible name is user-editable).
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [nameMsg, setNameMsg] = useState('')

  const saveName = async () => {
    setNameBusy(true)
    setNameMsg('')
    try {
      await updateFullName(nameDraft)
      await refreshUser()
      setEditingName(false)
      setNameMsg('Name updated.')
    } catch (e: any) {
      setNameMsg(e?.message ?? 'Could not update name.')
    } finally {
      setNameBusy(false)
    }
  }

  const [biometryStatus, setBiometryStatus] = useState<BiometryStatus | null>(null)
  const [biometricOn, setBiometricOn] = useState(false)
  const [biometricBusy, setBiometricBusy] = useState(false)
  const [biometricMsg, setBiometricMsg] = useState('')
  const [appLockOn, setAppLockOn] = useState(true)
  const [floatSide, setFloatSideState] = useState<FloatSide>('right')

  const [appleLinked, setAppleLinked] = useState<boolean | null>(null)
  const [appleBusy, setAppleBusy] = useState(false)
  const [appleMsg, setAppleMsg] = useState('')
  const [isNative, setIsNative] = useState(false)

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
  }, [isLoading, user, router])

  useEffect(() => {
    let cancelled = false
    const native = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.() === true
    setIsNative(native)
    setFloatSideState(getFloatSide())
    Promise.all([getBiometryStatus(), isBiometricEnabled()]).then(([s, e]) => {
      if (cancelled) return
      setBiometryStatus(s)
      setBiometricOn(e.enabled)
    })
    if (native) {
      isAppLockEnabled().then(v => { if (!cancelled) setAppLockOn(v) }).catch(() => {})
    }
    if (native) {
      getAppleUserId().then(id => { if (!cancelled) setAppleLinked(!!id) }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [])

  const handleToggleAppLock = async () => {
    const next = !appLockOn
    setAppLockOn(next)
    try { await setAppLockEnabled(next) } catch { setAppLockOn(!next) }
  }

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
    // Keep the biometric-enabled flag across sign-out — otherwise the
    // "Sign in with Face ID" button never appears on the login screen
    // (signing out is the only way to reach it), so Face ID login could
    // never actually be used. Face ID itself is the security factor: the
    // saved flag only records "this device may use Face ID for user X"; a
    // successful face/passcode match is still required to restore the
    // session. To turn it off entirely, use the toggle above before signing
    // out.
    await logout()
  }

  if (isLoading || !user) return null

  const initials = (user.full_name || user.email || user.username || '?')[0].toUpperCase()
  const biometryAvailable = biometryStatus?.available === true
  const biometryKind = biometryAvailable
    ? (biometryStatus.kind === 'face_id' ? 'Face ID'
       : biometryStatus.kind === 'touch_id' ? 'Touch ID'
       : 'Biometrics')
    : 'Biometrics'

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8 space-y-5">

      {/* Header — display name is editable (Apple accounts keep their cryptic
          id as the stable key; the visible name is the user's to set). */}
      <header className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xl font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                placeholder="Your name"
                autoFocus
                maxLength={60}
                className="flex-1 min-w-0 px-3 py-2 rounded-md border border-input bg-background text-foreground
                  text-base font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={saveName}
                disabled={nameBusy}
                className="shrink-0 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                {nameBusy ? '…' : 'Save'}
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="shrink-0 px-2 py-2 rounded-md border border-border text-sm text-muted-foreground"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold truncate">
                {user.full_name || user.email || user.username}
              </h1>
              <button
                onClick={() => { setNameDraft(user.full_name ?? ''); setEditingName(true) }}
                aria-label="Edit name"
                className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md border border-border
                  text-muted-foreground hover:text-foreground hover:bg-accent"
                style={{ minHeight: 0, minWidth: 0 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
            </div>
          )}
          {/* Always show the underlying account id: Apple users see their
              stable Apple-derived id (correlates their synced devices);
              password users see their @username. */}
          <p className="text-[11px] sm:text-xs text-muted-foreground type-amount truncate">
            {user.username.startsWith('apple_')
              ? `Apple ID · ${user.username}`
              : `@${user.username}`}
          </p>
          {nameMsg && <p className="text-xs text-muted-foreground mt-0.5">{nameMsg}</p>}
        </div>
      </header>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Theme picker — live mini-preview per theme, not text labels. */}
          <ThemePicker />
          <p className="text-xs text-muted-foreground mt-2">
            <span className="font-medium">System</span> follows your device&apos;s
            appearance; if the device has no preference it switches by time of day.
          </p>

          {/* Floating buttons side — left for left-handed, right for right-handed */}
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium mb-1">Floating buttons</p>
            <p className="text-xs text-muted-foreground mb-2">
              Which side the floating back / scroll-to-top buttons sit on — or hide them
              and use the bottom bar to get around.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['left', 'right', 'hide'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { setFloatSide(s); setFloatSideState(s) }}
                  className={`h-10 rounded-md border text-sm font-medium capitalize transition-colors ${
                    floatSide === s
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
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

          {/* App Lock — require Face ID / passcode on launch & after backgrounding */}
          {isNative && (
            <div className="flex items-center justify-between gap-3 pt-2 border-t">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Require {biometryKind} to open</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {biometryAvailable
                    ? 'Lock the app on launch and after it’s been in the background, so your finances stay private on an unlocked phone.'
                    : `Set up ${biometryKind} on this device to use App Lock.`}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={appLockOn}
                onClick={handleToggleAppLock}
                disabled={!biometryAvailable}
                className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full
                  border-2 border-transparent transition-colors duration-200 ease-in-out
                  focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${appLockOn && biometryAvailable ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-[27px] w-[27px] transform rounded-full
                    bg-white shadow-md ring-0 transition duration-200 ease-in-out
                    ${appLockOn && biometryAvailable ? 'translate-x-[20px]' : 'translate-x-0'}`}
                />
              </button>
            </div>
          )}

          {/* Connect Apple ID — shown on iOS only */}
          {isNative && (
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Apple ID</p>
                  <p className="text-xs text-muted-foreground">
                    {appleLinked
                      ? 'Connected — your data syncs across all your Apple devices.'
                      : 'Link your Apple ID to enable cross-device iCloud sync.'}
                  </p>
                </div>
                {!appleLinked && (
                  <button
                    type="button"
                    onClick={async () => {
                      setAppleBusy(true)
                      setAppleMsg('')
                      try {
                        await connectAppleId()
                        setAppleLinked(true)
                        setAppleMsg('Apple ID connected.')
                      } catch (e: any) {
                        setAppleMsg(e?.message ?? 'Failed to connect Apple ID.')
                      } finally {
                        setAppleBusy(false)
                      }
                    }}
                    disabled={appleBusy}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-black text-white text-xs font-medium hover:bg-zinc-800 disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.42c1.33.07 2.25.73 3.03.75.86-.14 1.7-.8 3.06-.85 1.64-.07 2.88.85 3.68 2.12-3.27 2.03-2.68 6.43.59 7.77-.52 1.38-1.27 2.74-2.36 3.07zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                    {appleBusy ? 'Connecting…' : 'Connect'}
                  </button>
                )}
                {appleLinked && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Linked</span>
                )}
              </div>
              {appleMsg && (
                <p className={`text-xs mt-1 ${appleMsg.includes('connected') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {appleMsg}
                </p>
              )}
            </div>
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
            label="Know your app"
            sub="How to add holdings, import/export, backups, AI keys & more."
            onClick={() => router.push('/help')}
          />
          <Row
            label="Import data"
            sub="Upload a photo/PDF of a statement — AI extracts your holdings."
            onClick={() => router.push('/documents?focus=upload')}
          />
          <Row
            label="Manage exports & backups"
            sub="Download CSV/JSON, restore from a snapshot."
            onClick={() => router.push('/documents?focus=export')}
          />
          <Row
            label="Data management"
            sub="iCloud sync, imports, backups."
            onClick={() => router.push('/documents?focus=manage')}
          />
          <Row
            label="Automatic backups"
            sub="Scheduled on-device snapshots you can restore anytime."
            onClick={() => router.push('/documents?focus=backups')}
          />
          <Row
            label="Remove demo / all data"
            sub="Clear the sample portfolio (or everything) and start fresh."
            onClick={() => router.push('/documents?focus=demo')}
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
