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
import { connectAppleId, disconnectAppleId, getAppleUserId, updateFullName } from '@/lib/native/auth'
import { isAppLockEnabled, setAppLockEnabled } from '@/lib/native/app-lock'
import { getFloatSide, setFloatSide, type FloatSide } from '@/lib/float-side'
import { getBarStyle, setBarStyle, type BarStyle } from '@/lib/bar-style'
import { getAddButtonPref, setAddButtonPref, type AddButtonPref } from '@/lib/add-button'
import { MARKETS, getRegion, setRegion } from '@/lib/region'
import { ThemePicker } from '@/components/ds/theme-picker'
import {
  getNotificationStatus,
  requestNotificationPermission,
  sendTestNotification,
  getNotificationsEnabled,
  setNotificationsEnabled,
  type NotifStatus,
} from '@/lib/native/notifications'

export default function ProfilePage() {
  const router = useRouter()
  const { user, isLoading, logout, deleteAccount, refreshUser } = useAuth()

  // Inline display-name editing (Apple accounts especially — their username is
  // a cryptic stable id; the visible name is user-editable).
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [nameMsg, setNameMsg] = useState('')

  // Watchlist push-notification permission state.
  const [notifStatus, setNotifStatus] = useState<NotifStatus | null>(null)
  const [notifBusy, setNotifBusy] = useState(false)
  const [notifMsg, setNotifMsg] = useState('')
  // App-level alert switch — independent of the iOS permission (which can't
  // be revoked programmatically once granted).
  const [notifOn, setNotifOn] = useState(true)

  const handleToggleNotifications = async () => {
    const next = !notifOn
    setNotifOn(next)
    try { await setNotificationsEnabled(next) } catch { setNotifOn(!next) }
  }

  const handleEnableNotifications = async () => {
    setNotifBusy(true)
    setNotifMsg('')
    try {
      const s = await requestNotificationPermission()
      setNotifStatus(s)
      if (s === 'granted') setNotifMsg('Notifications enabled.')
      else if (s === 'denied') setNotifMsg('iOS blocked the prompt — enable Nworth in iOS Settings → Notifications.')
    } finally {
      setNotifBusy(false)
    }
  }

  const handleTestNotification = async () => {
    setNotifBusy(true)
    setNotifMsg('')
    try {
      const ok = await sendTestNotification()
      setNotifMsg(ok
        ? 'Test scheduled — lock or background the app; the banner arrives in ~5 seconds.'
        : 'Could not schedule. Check that notifications are allowed for Nworth in iOS Settings.')
    } finally {
      setNotifBusy(false)
    }
  }

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
  const [barStyle, setBarStyleState] = useState<BarStyle>('floating')
  const [addButton, setAddButtonState] = useState<AddButtonPref>('hide')
  const [regionId, setRegionIdState] = useState('us')

  const [appleLinked, setAppleLinked] = useState<boolean | null>(null)
  const [appleBusy, setAppleBusy] = useState(false)
  const [appleMsg, setAppleMsg] = useState('')
  const [isNative, setIsNative] = useState(false)

  // Permanent account deletion (App Store 5.1.1(v)): type-to-confirm panel
  // in the Data & Privacy card. The account record + live data always go;
  // the user chooses what else to erase — everything checked by default.
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteMsg, setDeleteMsg] = useState('')
  const [deleteBackupsOpt, setDeleteBackupsOpt] = useState(true)
  const [deleteICloudOpt, setDeleteICloudOpt] = useState(true)

  const toggleDeletePanel = () => {
    if (deleteOpen) { setDeleteOpen(false); return }
    setDeleteOpen(true)
    setDeleteText('')
    setDeleteMsg('')
    setDeleteBackupsOpt(true)
    setDeleteICloudOpt(true)
  }

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
  }, [isLoading, user, router])

  useEffect(() => {
    let cancelled = false
    const native = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.() === true
    setIsNative(native)
    setFloatSideState(getFloatSide())
    setBarStyleState(getBarStyle())
    setAddButtonState(getAddButtonPref())
    setRegionIdState(getRegion().id)
    Promise.all([getBiometryStatus(), isBiometricEnabled()]).then(([s, e]) => {
      if (cancelled) return
      setBiometryStatus(s)
      setBiometricOn(e.enabled)
    })
    if (native) {
      isAppLockEnabled().then(v => { if (!cancelled) setAppLockOn(v) }).catch(() => {})
      getNotificationStatus().then(s => { if (!cancelled) setNotifStatus(s) }).catch(() => {})
      getNotificationsEnabled().then(v => { if (!cancelled) setNotifOn(v) }).catch(() => {})
    }
    if (native) {
      getAppleUserId().then(id => { if (!cancelled) setAppleLinked(!!id) }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [])

  // Deep-link support: /profile#ai-provider (the "Configure →" link in AI
  // Insights) scrolls straight to the AI Provider section once the page is
  // ready. The static-export hash isn't reliably honored on first paint, so we
  // scroll it into view ourselves after the content mounts.
  useEffect(() => {
    if (isLoading || !user) return
    if (typeof window === 'undefined' || window.location.hash !== '#ai-provider') return
    const t = setTimeout(() => {
      document.getElementById('ai-provider')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
    return () => clearTimeout(t)
  }, [isLoading, user])

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

  const handleDeleteAccount = async () => {
    if (deleteText.trim() !== 'DELETE') return
    // One last gate on top of type-to-confirm — deletion is irreversible.
    if (!window.confirm('Delete your account and all data? This cannot be undone.')) return
    setDeleteBusy(true)
    setDeleteMsg('')
    try {
      await deleteAccount({ backups: deleteBackupsOpt, icloud: deleteICloudOpt })
      // deleteAccount navigates away on success; nothing to do here.
    } catch (e: any) {
      setDeleteMsg(e?.response?.data?.detail ?? e?.message ?? 'Could not delete the account. Please try again.')
      setDeleteBusy(false)
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

          {/* Bottom bar placement — floating capsule or attached to the edge */}
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium mb-1">Bottom bar</p>
            <p className="text-xs text-muted-foreground mb-2">
              Floating hovers above the home indicator; Attached sits flush with the bottom edge.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['floating', 'attached'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { setBarStyle(s); setBarStyleState(s) }}
                  className={`h-10 rounded-md border text-sm font-medium capitalize transition-colors ${
                    barStyle === s
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

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

          {/* Quick-add “+” bubble on the bottom bar — show or hide */}
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium mb-1">Quick-add “+” button</p>
            <p className="text-xs text-muted-foreground mb-2">
              The small “+” above the bottom bar for adding holdings, accounts, and more.
              Hide it if you prefer the “+ Add” buttons inside each view.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['show', 'hide'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { setAddButtonPref(s); setAddButtonState(s) }}
                  className={`h-10 rounded-md border text-sm font-medium capitalize transition-colors ${
                    addButton === s
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

          {/* Apple ID link — shown on iOS only; toggle on = connect (Apple
              sign-in sheet), toggle off = unlink (confirm first). */}
          {isNative && (
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Apple ID</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {appleLinked
                      ? 'Connected — your data syncs across all your Apple devices.'
                      : 'Link your Apple ID to enable cross-device iCloud sync.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!appleLinked}
                  disabled={appleBusy || appleLinked === null}
                  onClick={async () => {
                    setAppleBusy(true)
                    setAppleMsg('')
                    try {
                      if (appleLinked) {
                        const ok = window.confirm(
                          'Disconnect Apple ID?\n\nYour data stays on this device, but it will no longer be recognized as the same account on your other Apple devices for iCloud sync. You can reconnect anytime.'
                        )
                        if (ok) {
                          await disconnectAppleId()
                          setAppleLinked(false)
                          setAppleMsg('Apple ID disconnected.')
                        }
                      } else {
                        await connectAppleId()
                        setAppleLinked(true)
                        setAppleMsg('Apple ID connected.')
                      }
                    } catch (e: any) {
                      setAppleMsg(e?.message ?? 'Failed to update Apple ID link.')
                    } finally {
                      setAppleBusy(false)
                    }
                  }}
                  className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full
                    border-2 border-transparent transition-colors duration-200 ease-in-out
                    focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                    disabled:opacity-40 disabled:cursor-not-allowed
                    ${appleLinked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-[27px] w-[27px] transform rounded-full
                      bg-white shadow-md ring-0 transition duration-200 ease-in-out
                      ${appleLinked ? 'translate-x-[20px]' : 'translate-x-0'}`}
                  />
                </button>
              </div>
              {appleMsg && (
                <p className={`text-xs mt-1 ${appleMsg.includes('connected') ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                  {appleMsg}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications — watchlist price alerts arrive as OS notifications */}
      {isNative && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Watchlist price alerts</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {notifStatus === 'granted' && (notifOn
                    ? 'On — you’ll get an alert when a watchlist ticker crosses its target price.'
                    : 'Off — price alerts are paused. Turn back on anytime.')}
                  {notifStatus === 'prompt' && 'Not enabled yet. Allow notifications so price alerts can reach you.'}
                  {notifStatus === 'denied' && 'Blocked. Open iOS Settings → Notifications → Nworth and allow notifications.'}
                  {notifStatus === null && 'Checking…'}
                </p>
              </div>
              {notifStatus === 'prompt' && (
                <Button size="sm" onClick={handleEnableNotifications} disabled={notifBusy}>
                  {notifBusy ? '…' : 'Enable'}
                </Button>
              )}
              {notifStatus === 'granted' && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifOn}
                  onClick={handleToggleNotifications}
                  className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full
                    border-2 border-transparent transition-colors duration-200 ease-in-out
                    focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                    ${notifOn ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-[27px] w-[27px] transform rounded-full
                      bg-white shadow-md ring-0 transition duration-200 ease-in-out
                      ${notifOn ? 'translate-x-[20px]' : 'translate-x-0'}`}
                  />
                </button>
              )}
            </div>

            {notifStatus === 'granted' && notifOn && (
              <Button size="sm" variant="outline" onClick={handleTestNotification} disabled={notifBusy} className="text-xs">
                {notifBusy ? 'Scheduling…' : 'Send test notification (5s)'}
              </Button>
            )}
            {notifMsg && <p className="text-xs text-muted-foreground">{notifMsg}</p>}
          </CardContent>
        </Card>
      )}

      {/* Market & Currency — home market drives the app-wide display currency,
          default benchmarks, and ticker-search preference. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Market &amp; Currency</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            Your home market sets the currency the whole app displays, the default
            benchmarks, and which exchange tickers resolve to first.
          </p>
          <select
            value={regionId}
            onChange={(e) => { setRegion(e.target.value); setRegionIdState(e.target.value) }}
            className="w-full h-10 rounded-md border border-input bg-background text-foreground px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {MARKETS.map(m => (
              <option key={m.id} value={m.id}>{m.label} ({m.currency})</option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            Holdings priced in other currencies are converted automatically using live
            exchange rates. Amounts you entered by hand (cash balances, debts, property
            values, average costs) are <span className="font-medium">not</span> converted
            when you switch markets.
          </p>
        </CardContent>
      </Card>

      {/* AI Provider — full settings, moved here from the AI Insights tab.
          #ai-provider is the deep-link target for "Configure →" in AI Insights. */}
      <div id="ai-provider" style={{ scrollMarginTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <AIProviderSettings />
      </div>

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
            label="Auto import tickers"
            sub="Upload a photo/PDF of a statement — AI extracts your holdings."
            onClick={() => router.push('/documents?focus=upload')}
          />
          <Row
            label="Manage exports & backups"
            sub="Download CSV/JSON, restore from a snapshot."
            onClick={() => router.push('/documents?focus=export')}
          />
          <Row
            label="iCloud sync"
            sub="Sync your portfolio across your iPhone and iPad."
            onClick={() => router.push('/documents?focus=icloud')}
          />
          <Row
            label="Data management"
            sub="Import your data from JSON or CSV files."
            onClick={() => router.push('/documents?focus=import')}
          />
          <Row
            label="Automatic backups"
            sub="Scheduled on-device snapshots you can restore anytime."
            onClick={() => router.push('/documents?focus=backups')}
          />
          <Row
            label="Add / remove demo or all data"
            sub="Load the sample portfolio to explore, or clear everything and start fresh."
            onClick={() => router.push('/documents?focus=demo')}
          />
          <Row
            label="About Nworth"
            sub={APP_TAGLINE}
            onClick={() => router.push('/about')}
          />

          {/* Delete account — App Store 5.1.1(v). Same layout as Row, danger-colored. */}
          <button
            id="delete-account"
            onClick={toggleDeletePanel}
            className="w-full text-left flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-600">Delete account</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                Permanently erase your account. Choose what else to remove.
              </p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              className={`h-4 w-4 text-red-400 shrink-0 transition-transform ${deleteOpen ? 'rotate-90' : ''}`}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {deleteOpen && (
            <div className="rounded-md border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-3 py-3 space-y-3">
              <p className="text-xs font-semibold text-red-800 dark:text-red-300">
                This cannot be undone
              </p>
              <p className="text-[11px] text-red-700/90 dark:text-red-300/80 leading-relaxed">
                If you might need your data again, export or back it up first
                (Manage exports &amp; backups above) before deleting.
              </p>

              <div className="space-y-2">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked disabled className="mt-0.5 accent-red-600" />
                  <span className="text-[11px] text-red-700/90 dark:text-red-300/80 leading-relaxed">
                    <span className="font-semibold">Account &amp; all app data</span> (always removed) —
                    holdings, accounts, transactions, watchlist, loans, properties, net-worth
                    history, imported documents, settings, and your saved AI keys.
                  </span>
                </label>
                {isNative && (
                  <>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteBackupsOpt}
                        onChange={e => setDeleteBackupsOpt(e.target.checked)}
                        className="mt-0.5 accent-red-600"
                      />
                      <span className="text-[11px] text-red-700/90 dark:text-red-300/80 leading-relaxed">
                        <span className="font-semibold">Local backup files</span> — snapshots saved on
                        this device. Uncheck to keep them for a later re-import.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteICloudOpt}
                        onChange={e => setDeleteICloudOpt(e.target.checked)}
                        className="mt-0.5 accent-red-600"
                      />
                      <span className="text-[11px] text-red-700/90 dark:text-red-300/80 leading-relaxed">
                        <span className="font-semibold">iCloud snapshot</span> — the synced copy of this
                        account. Data already on your other devices is not modified.
                      </span>
                    </label>
                  </>
                )}
              </div>

              {appleLinked && (
                <p className="text-[11px] text-red-700/90 dark:text-red-300/80 leading-relaxed">
                  Your Sign in with Apple link is removed too. You can also stop using
                  Apple ID with {APP_NAME} in{' '}
                  <span className="font-mono">iOS Settings → Sign-In &amp; Security</span>.
                </p>
              )}
              <input
                value={deleteText}
                onChange={e => setDeleteText(e.target.value)}
                placeholder="Type DELETE to confirm"
                autoCapitalize="characters"
                autoCorrect="off"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground
                  text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                className="w-full bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                disabled={deleteText.trim() !== 'DELETE' || deleteBusy}
                onClick={handleDeleteAccount}
              >
                {deleteBusy ? 'Deleting…' : 'Permanently delete my account'}
              </Button>
              {deleteMsg && (
                <p className="text-xs text-red-700 dark:text-red-300">{deleteMsg}</p>
              )}
            </div>
          )}
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
