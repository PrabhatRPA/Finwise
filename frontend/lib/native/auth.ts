// On-device register / login / me. Replaces backend/app/api/v1/auth.py.
// Single-user device — once a user registers, register-again is blocked.

import bcrypt from 'bcryptjs'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { all, get, run, beginTransaction, commitTransaction, rollbackTransaction } from './db'
import { getSessionUserId, setSessionUserId, clearSession, requireSessionUserId } from './session'
import { saveToken, clearToken } from '../token'
import { isPasswordValid, PASSWORD_POLICY_TEXT } from '../password'

// We don't actually need a JWT for on-device auth, but the existing UI
// expects an `access_token` field to drop into the Authorization header.
// We mint an opaque marker token instead — the axios interceptor still
// sets it, but no remote server validates it because there is no server.
// On native the platform router skips axios entirely.
const LOCAL_TOKEN_MARKER = 'local-session'

interface UserRow {
  id: number
  username: string
  email: string
  password_hash: string
  full_name: string | null
}

function userToPublic(u: UserRow) {
  return {
    user_id: u.id,
    username: u.username,
    full_name: u.full_name,
    email: u.email,
  }
}

export const nativeAuthApi = {
  // Mirrors GET /auth/check-setup — FastAPI returns { has_users: boolean }
  // and app/page.tsx reads `res.data.has_users` to decide login vs register.
  // Returning the wrong key sends every cold-launch straight to the
  // "create account" screen even when a user exists.
  checkSetup: async () => {
    const rows = await all<{ count: number }>(
      'SELECT COUNT(*) AS count FROM users WHERE is_active = 1',
    )
    const hasUsers = (rows[0]?.count ?? 0) > 0
    return { data: { has_users: hasUsers } }
  },

  register: async (username: string, password: string, fullName?: string) => {
    // Normalize once at the boundary so a row inserted as "test" can be
    // looked up later regardless of how iOS's auto-capitalize behaves.
    const uname = username.trim().toLowerCase()
    // Enforce the password policy here too — the form gates the button, but
    // this is the real enforcement point on-device.
    if (!isPasswordValid(password)) {
      throw withStatus(400, PASSWORD_POLICY_TEXT)
    }
    const existing = await get<UserRow>(
      'SELECT id FROM users WHERE LOWER(username) = ?',
      [uname],
    )
    if (existing) {
      throw withStatus(409, 'Username already exists')
    }
    const hash = await bcrypt.hash(password, 10)
    const email = `${uname}@local`
    const res = await run(
      `INSERT INTO users (username, email, password_hash, full_name) VALUES (?, ?, ?, ?)`,
      [uname, email, hash, fullName ?? null],
    )
    const userId = res.lastId
    await setSessionUserId(userId)
    await saveToken(LOCAL_TOKEN_MARKER)
    return {
      data: {
        access_token: LOCAL_TOKEN_MARKER,
        user_id: userId,
        username: uname,
        full_name: fullName ?? null,
      },
    }
  },

  login: async (username: string, password: string) => {
    // Case-insensitive lookup as a server-side safety net even if the
    // caller forgot to lowercase. Matches against any existing row whose
    // username equals the input regardless of case.
    const u = await get<UserRow>(
      'SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND is_active = 1',
      [username.trim()],
    )
    if (!u) throw withStatus(401, 'Invalid credentials')
    const ok = await bcrypt.compare(password, u.password_hash)
    if (!ok) throw withStatus(401, 'Invalid credentials')
    await setSessionUserId(u.id)
    await saveToken(LOCAL_TOKEN_MARKER)
    return {
      data: {
        access_token: LOCAL_TOKEN_MARKER,
        user_id: u.id,
        username: u.username,
        full_name: u.full_name,
      },
    }
  },

  me: async () => {
    const userId = await getSessionUserId()
    if (!userId) throw withStatus(401, 'Not authenticated')
    const u = await get<UserRow>('SELECT * FROM users WHERE id = ?', [userId])
    if (!u) {
      await clearSession()
      await clearToken()
      throw withStatus(401, 'Session user no longer exists')
    }
    return { data: userToPublic(u) }
  },

  // Permanent account deletion (App Store Guideline 5.1.1(v)). Hard-deletes
  // the users row and every piece of data tied to it — this is deletion, not
  // deactivation. Steps that touch iCloud / the filesystem are best-effort;
  // the DB wipe is transactional. Scoped to the signed-in user so a second
  // account on the same device is untouched (backups are the documented
  // exception — see deleteAllBackups).
  //
  // opts let the user keep artifacts that exist beyond the account itself
  // (both default to deleted): local backup files and the iCloud snapshot.
  // The account record and all live app data are always removed — that part
  // is what Apple's "complete deletion" requires and is not optional.
  deleteAccount: async (opts?: { backups?: boolean; icloud?: boolean }) => {
    const wipeBackups = opts?.backups !== false
    const wipeICloud = opts?.icloud !== false
    const userId = await requireSessionUserId()

    // Stop iCloud auto-sync BEFORE wiping: the DELETEs below fire the DB
    // write listener, which would otherwise schedule a push mid-deletion.
    const icloud = await import('./icloud')
    const prevAutoSync = await icloud.isAutoSyncEnabled().catch(() => true)
    try { await icloud.setAutoSync(false) } catch { /* best-effort */ }

    // Remove persisted document files (uploaded statements/1099s). Paths are
    // stored per-row; files may already be gone — ignore failures.
    try {
      const docs = await all<{ document_path: string | null }>(
        `SELECT document_path FROM documents WHERE user_id = ? AND document_path IS NOT NULL`,
        [userId],
      )
      if (docs.length > 0) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        for (const d of docs) {
          if (!d.document_path) continue
          await Filesystem.deleteFile({ path: d.document_path, directory: Directory.Data })
            .catch(() => {})
        }
      }
    } catch { /* file cleanup is best-effort */ }

    // The actual deletion — all rows for this user plus the users row itself,
    // atomically. settings includes ai_providers_config (saved API keys).
    // market_prices is a shared cache, cleared to match clearAllData.
    await beginTransaction()
    try {
      await run(`DELETE FROM holdings WHERE user_id = ?`, [userId])
      await run(`DELETE FROM transactions WHERE user_id = ?`, [userId])
      await run(`DELETE FROM watchlist WHERE user_id = ?`, [userId])
      await run(`DELETE FROM accounts WHERE user_id = ?`, [userId])
      await run(`DELETE FROM loans WHERE user_id = ?`, [userId])
      await run(`DELETE FROM properties WHERE user_id = ?`, [userId])
      await run(`DELETE FROM property_value_snapshots WHERE user_id = ?`, [userId])
      await run(`DELETE FROM portfolio_history WHERE user_id = ?`, [userId])
      await run(`DELETE FROM documents WHERE user_id = ?`, [userId])
      await run(`DELETE FROM settings WHERE user_id = ?`, [userId])
      await run(`DELETE FROM market_prices`, [])
      await run(`DELETE FROM users WHERE id = ?`, [userId])
      await commitTransaction()
    } catch (e) {
      await rollbackTransaction().catch(() => {})
      throw e
    }

    // Local backup files hold full data snapshots — remove them all (unless
    // the user chose to keep them for a later re-import).
    if (wipeBackups) {
      try { await (await import('./data')).deleteAllBackups() } catch { /* best-effort */ }
    }

    // Clear the iCloud snapshot regardless of Apple link — a password-only
    // user may still have synced. Tombstone semantics: other devices with
    // real local data re-seed iCloud from their own copy. When the user keeps
    // the snapshot (e.g. to restore on another device later), restore the
    // auto-sync preference we disabled above — safe now: the session is gone
    // by the time any timer fires, so a stray push can't build a payload, and
    // the empty-over-non-empty guard protects the kept snapshot regardless.
    if (wipeICloud) {
      await icloud.clearICloudSnapshot()
    } else {
      try { await icloud.setAutoSync(prevAutoSync) } catch { /* best-effort */ }
    }

    // Forget biometric enrollment so the login screen never offers Face ID
    // for a user id that no longer exists, and drop the App Lock preference.
    try { await (await import('./biometric')).disableBiometric() } catch { /* best-effort */ }
    try { await Preferences.remove({ key: 'app_lock_enabled' }) } catch { /* best-effort */ }

    await clearSession()
    await clearToken()

    // Cached UI state keyed to this user.
    try { window.localStorage.removeItem('last_net_worth_snapshot') } catch {}
    try { window.localStorage.removeItem(`onboarding_seen_${userId}`) } catch {}
    // NOTE: the ai_default_key_usage trial counter (Preferences/Keychain) is
    // intentionally kept — it's device-scoped anti-abuse state, not personal
    // data, and resetting it would grant fresh trials via delete/re-create.

    return { data: { success: true } }
  },
}

// ── Sign in with Apple ────────────────────────────────────────────────────────
// Returns { isNewUser: true } when we created a new account (new device / first
// Apple sign-in), so the caller can offer to restore from iCloud.

export async function signInWithApple(): Promise<{ isNewUser: boolean }> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Sign in with Apple is only available on iOS.')
  }
  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')
  const result = await SignInWithApple.authorize({
    clientId: 'com.prabhat.nworth',
    redirectURI: '',
    scopes: 'name email',
    state: '',
    nonce: '',
  })
  const appleUserId = result.response.user ?? ''
  if (!appleUserId) throw new Error('Apple Sign-In did not return a user identifier.')
  const givenName  = result.response.givenName  ?? ''
  const familyName = result.response.familyName ?? ''
  const fullName   = [givenName, familyName].filter(Boolean).join(' ') || null
  const email      = result.response.email ?? null

  // Look up existing account linked to this Apple ID.
  const existing = await get<UserRow>('SELECT * FROM users WHERE apple_user_id = ?', [appleUserId])
  if (existing) {
    await setSessionUserId(existing.id)
    await saveToken(LOCAL_TOKEN_MARKER)
    return { isNewUser: false }
  }

  // First time on this device — create a local account tied to the Apple sub ID.
  const username = `apple_${appleUserId.slice(-10).toLowerCase()}`
  const derivedEmail = email ?? `${username}@apple`
  const res = await run(
    `INSERT INTO users (username, email, password_hash, full_name, apple_user_id)
     VALUES (?, ?, '', ?, ?)`,
    [username, derivedEmail, fullName, appleUserId],
  )
  await setSessionUserId(res.lastId)
  await saveToken(LOCAL_TOKEN_MARKER)
  return { isNewUser: true }
}

// Update the signed-in user's display name. Apple sign-in accounts keep their
// cryptic apple_… username as the stable primary identifier, but the user can
// set/edit the human name shown across the app.
export async function updateFullName(name: string): Promise<void> {
  const userId = await getSessionUserId()
  if (!userId) throw new Error('Not signed in.')
  const trimmed = name.trim().slice(0, 60)
  await run(
    `UPDATE users SET full_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [trimmed || null, userId],
  )
}

// Helper for other modules to read the current user's apple_user_id.
export async function getAppleUserId(): Promise<string | null> {
  const userId = await getSessionUserId()
  if (!userId) return null
  const u = await get<{ apple_user_id: string | null }>(
    'SELECT apple_user_id FROM users WHERE id = ?', [userId]
  )
  return u?.apple_user_id ?? null
}

// Link an Apple ID to an existing local (password) account from the profile page.
export async function connectAppleId(): Promise<void> {
  if (!Capacitor.isNativePlatform()) throw new Error('Only available on iOS.')
  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')
  const result = await SignInWithApple.authorize({
    clientId: 'com.prabhat.nworth',
    redirectURI: '',
    scopes: '',
    state: '',
    nonce: '',
  })
  const appleUserId = result.response.user
  const userId = await getSessionUserId()
  if (!userId) throw new Error('Not logged in.')
  // Fail clearly if another account already claims this Apple ID.
  const taken = await get<{ id: number }>(
    'SELECT id FROM users WHERE apple_user_id = ? AND id != ?', [appleUserId, userId]
  )
  if (taken) throw new Error('This Apple ID is already linked to a different account.')
  await run('UPDATE users SET apple_user_id = ? WHERE id = ?', [appleUserId, userId])
}

// Unlink the Apple ID from the current account (Settings toggle → off).
// Local data is untouched; only the cross-device identity link is removed,
// so future iCloud snapshots no longer carry this Apple ID and other devices
// can't match this account by it. Sign-in with password still works.
export async function disconnectAppleId(): Promise<void> {
  const userId = await getSessionUserId()
  if (!userId) throw new Error('Not logged in.')
  await run('UPDATE users SET apple_user_id = NULL WHERE id = ?', [userId])
}

// Construct an axios-shaped error so existing catch blocks (which check
// err.response?.status) keep working unchanged.
function withStatus(status: number, message: string) {
  const err = new Error(message) as any
  err.response = { status, data: { detail: message } }
  return err
}
