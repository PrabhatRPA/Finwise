// Tracks who is currently logged in on the device. There's no JWT here —
// this is single-user, on-device only. The session id is just the user_id
// of the logged-in user, persisted in Capacitor Preferences (UserDefaults
// on iOS). bcrypt-hashed password gates registration / re-login.

import { Preferences } from '@capacitor/preferences'

const KEY = 'session_user_id'
let cached: number | null | undefined = undefined

export async function getSessionUserId(): Promise<number | null> {
  if (cached !== undefined) return cached
  const { value } = await Preferences.get({ key: KEY })
  cached = value ? Number(value) : null
  return cached
}

export async function setSessionUserId(id: number): Promise<void> {
  cached = id
  await Preferences.set({ key: KEY, value: String(id) })
}

export async function clearSession(): Promise<void> {
  cached = null
  await Preferences.remove({ key: KEY })
}

export async function requireSessionUserId(): Promise<number> {
  const id = await getSessionUserId()
  if (!id) throw new Error('Not authenticated')
  return id
}
