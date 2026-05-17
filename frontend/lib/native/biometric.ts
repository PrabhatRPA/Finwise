// Biometric (Face ID / Touch ID) helper.
//
// Lives on top of @aparajita/capacitor-biometric-auth. We only persist a
// minimal "biometric is enabled for user X" flag in Capacitor Preferences;
// no password is ever stored. Face ID success is the authentication factor —
// on success we re-establish the session for that user_id directly.

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const ENABLED_KEY = 'biometric_enabled'    // '1' or absent
const USER_KEY    = 'biometric_user_id'    // string of user id

export type BiometryStatus =
  | { available: true; kind: 'face_id' | 'touch_id' | 'other' }
  | { available: false; reason: string }

async function plugin() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Biometric authentication is only available on iOS / Android.')
  }
  const mod = await import('@aparajita/capacitor-biometric-auth')
  return mod
}

export async function getBiometryStatus(): Promise<BiometryStatus> {
  if (!Capacitor.isNativePlatform()) {
    return { available: false, reason: 'Biometric login only works on iOS / Android.' }
  }
  try {
    const { BiometricAuth } = await plugin()
    const info = await BiometricAuth.checkBiometry()
    if (info.isAvailable) {
      // BiometryType: 0=none, 1=touchId, 2=faceId, 3=fingerprint, 4=face, 5=iris (per plugin)
      const t = info.biometryType
      const kind: 'face_id' | 'touch_id' | 'other' =
        t === 2 || t === 4 ? 'face_id'
        : t === 1 || t === 3 ? 'touch_id'
        : 'other'
      return { available: true, kind }
    }
    return { available: false, reason: info.reason || 'Biometric hardware not available.' }
  } catch (e: any) {
    return { available: false, reason: e?.message ?? 'Biometric check failed.' }
  }
}

// Prompt iOS for Face ID / Touch ID. Returns true on success.
export async function promptBiometric(reason: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { BiometricAuth } = await plugin()
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Cancel',
      allowDeviceCredential: true,         // fall back to passcode if Face ID isn't enrolled
      iosFallbackTitle: 'Use Passcode',
      androidTitle: 'Sign in to Nworth',
      androidSubtitle: reason,
      androidConfirmationRequired: false,
    })
    return true
  } catch {
    // Plugin throws on cancel / failure. Caller treats false as "not authenticated".
    return false
  }
}

export async function isBiometricEnabled(): Promise<{ enabled: boolean; userId: number | null }> {
  if (!Capacitor.isNativePlatform()) return { enabled: false, userId: null }
  const [enabledFlag, userIdStr] = await Promise.all([
    Preferences.get({ key: ENABLED_KEY }),
    Preferences.get({ key: USER_KEY }),
  ])
  const enabled = enabledFlag.value === '1'
  const userId = userIdStr.value ? Number(userIdStr.value) : null
  return { enabled: enabled && !!userId, userId }
}

export async function enableBiometricForUser(userId: number): Promise<void> {
  await Promise.all([
    Preferences.set({ key: ENABLED_KEY, value: '1' }),
    Preferences.set({ key: USER_KEY, value: String(userId) }),
  ])
}

export async function disableBiometric(): Promise<void> {
  await Promise.all([
    Preferences.remove({ key: ENABLED_KEY }),
    Preferences.remove({ key: USER_KEY }),
  ])
}
