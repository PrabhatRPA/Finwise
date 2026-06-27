// iCloud backup + restore for the iOS build.
//
// The app stays local-first: data lives in on-device SQLite. This module
// mirrors a full-data JSON snapshot — the exact format importFullData accepts —
// into the app's iCloud Drive ubiquity container via the native `IcloudSync`
// plugin (ios/App/App/IcloudSync.swift), so the same portfolio can be restored
// on another device (iPhone ↔ iPad). Last-writer-wins: a restore replaces local
// data with whatever snapshot is currently in iCloud.

import { registerPlugin, Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { buildSnapshotPayload, nativeDataApi } from './data'
import { getAppleUserId } from './auth'

const SNAPSHOT_FILE = 'nworth-icloud-snapshot.json'
const LAST_SYNC_KEY = 'last_icloud_sync'      // ISO timestamp of our last upload
const AUTO_SYNC_KEY = 'icloud_auto_sync'      // '1' = sync on app background

interface IcloudSyncPlugin {
  isAvailable(): Promise<{ available: boolean }>
  write(opts: { fileName: string; contents: string }): Promise<{ success: boolean; modifiedAt?: number }>
  read(opts: { fileName: string }): Promise<{ exists: boolean; contents?: string; modifiedAt?: number }>
  info(opts: { fileName: string }): Promise<{ available: boolean; exists: boolean; modifiedAt?: number; deviceName?: string }>
}

// On web/Tauri there is no native plugin — every method degrades to
// "unavailable" so callers (and the build) work everywhere.
const webFallback: IcloudSyncPlugin = {
  isAvailable: async () => ({ available: false }),
  write: async () => ({ success: false }),
  read: async () => ({ exists: false }),
  info: async () => ({ available: false, exists: false }),
}

const IcloudSync = Capacitor.isNativePlatform()
  ? registerPlugin<IcloudSyncPlugin>('IcloudSync', { web: webFallback })
  : webFallback

export interface ICloudStatus {
  available: boolean       // user signed into iCloud + capability provisioned
  remoteExists: boolean    // a snapshot is present in iCloud
  remoteModifiedAt?: string // ISO of the iCloud snapshot's mtime
  lastSyncAt?: string      // ISO of our last upload from this device
}

export async function getICloudStatus(): Promise<ICloudStatus> {
  try {
    const info = await IcloudSync.info({ fileName: SNAPSHOT_FILE })
    const last = await Preferences.get({ key: LAST_SYNC_KEY })
    return {
      available: info.available,
      remoteExists: info.exists,
      remoteModifiedAt: info.modifiedAt ? new Date(info.modifiedAt).toISOString() : undefined,
      lastSyncAt: last.value ?? undefined,
    }
  } catch {
    return { available: false, remoteExists: false }
  }
}

// Upload a fresh full-data snapshot to iCloud. Returns true on success.
export async function syncToICloud(): Promise<boolean> {
  const { available } = await IcloudSync.isAvailable()
  if (!available) return false
  const payload = await buildSnapshotPayload('icloud')
  const res = await IcloudSync.write({
    fileName: SNAPSHOT_FILE,
    contents: JSON.stringify(payload),
  })
  if (res.success) {
    await Preferences.set({ key: LAST_SYNC_KEY, value: new Date().toISOString() })
    return true
  }
  return false
}

// Pull the iCloud snapshot and replace local data with it. Throws if iCloud is
// unavailable or no snapshot exists so the UI can surface a clear message.
export async function restoreFromICloud(): Promise<{ message: string }> {
  const { available } = await IcloudSync.isAvailable()
  if (!available) throw new Error('iCloud is not available. Sign in to iCloud in iOS Settings.')
  const res = await IcloudSync.read({ fileName: SNAPSHOT_FILE })
  if (!res.exists || !res.contents) {
    throw new Error('No iCloud snapshot found yet. Sync from another device first.')
  }

  // Warn if the snapshot was created by a different Apple ID, so the user
  // doesn't accidentally overwrite their own data with someone else's.
  try {
    const payload = JSON.parse(res.contents)
    const snapshotAppleId = payload?.apple_user_id as string | undefined
    if (snapshotAppleId) {
      const localAppleId = await getAppleUserId()
      if (localAppleId && localAppleId !== snapshotAppleId) {
        throw new Error(
          'This iCloud snapshot belongs to a different Apple ID. ' +
          'Sign in with the correct Apple ID first, or use "Restore" to import anyway.'
        )
      }
    }
  } catch (e: any) {
    // Re-throw Apple ID mismatch errors; swallow JSON parse issues.
    if (e.message?.includes('Apple ID')) throw e
  }

  const file = new File([res.contents], SNAPSHOT_FILE, { type: 'application/json' })
  const out = await nativeDataApi.importFullData(file, 'replace')
  // Drop the dashboard's cached net-worth snapshot so it doesn't show stale
  // numbers after the restore (mirrors data-management's clear-all behaviour).
  try { window.localStorage.removeItem('last_net_worth_snapshot') } catch {}
  return { message: out.data?.message ?? 'Restored from iCloud.' }
}

// ── Auto-sync preference ────────────────────────────────────────────────────

export async function isAutoSyncEnabled(): Promise<boolean> {
  const v = await Preferences.get({ key: AUTO_SYNC_KEY })
  return v.value === '1'
}

export async function setAutoSync(enabled: boolean): Promise<void> {
  await Preferences.set({ key: AUTO_SYNC_KEY, value: enabled ? '1' : '0' })
}

// Called from the app-background listener. Silent: swallows errors and no-ops
// when auto-sync is off or iCloud is unavailable.
export async function autoSyncIfEnabled(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return
    if (!(await isAutoSyncEnabled())) return
    await syncToICloud()
  } catch {
    // best-effort
  }
}
