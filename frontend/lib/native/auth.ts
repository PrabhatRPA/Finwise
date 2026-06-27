// On-device register / login / me. Replaces backend/app/api/v1/auth.py.
// Single-user device — once a user registers, register-again is blocked.

import bcrypt from 'bcryptjs'
import { Capacitor } from '@capacitor/core'
import { all, get, run } from './db'
import { getSessionUserId, setSessionUserId, clearSession } from './session'
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

// Construct an axios-shaped error so existing catch blocks (which check
// err.response?.status) keep working unchanged.
function withStatus(status: number, message: string) {
  const err = new Error(message) as any
  err.response = { status, data: { detail: message } }
  return err
}
