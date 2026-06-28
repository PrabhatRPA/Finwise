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
const AUTO_SYNC_KEY = 'icloud_auto_sync'      // '1' = on, '0' = off (default on)
// exported_at of the snapshot this device last pushed OR pulled. Acts as the
// "common ancestor" version so launch reconciliation can tell whether the
// iCloud snapshot is newer (another device changed it → pull) or not.
const DATA_VERSION_KEY = 'icloud_data_version'

// A snapshot is "empty" when it carries no user-entered records. portfolio_history
// is ignored on purpose — a freshly-initialised DB seeds a default history row,
// and we must NOT treat that as real data (that was the bug: an empty device
// overwriting the master). Used to refuse pushing empty data over a real remote.
function isSnapshotEmpty(payload: any): boolean {
  const arrays = ['holdings', 'accounts', 'transactions', 'watchlist', 'loans', 'properties']
  return arrays.every((k) => !Array.isArray(payload?.[k]) || payload[k].length === 0)
}

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

  // SAFETY: never overwrite a non-empty remote snapshot with empty local data.
  // A device that just launched (only default/seed rows) must not clobber the
  // master before it has reconciled/restored. This is the core guard against
  // the "iPad replaces iCloud file with empty JSON" bug.
  if (isSnapshotEmpty(payload)) {
    const remote = await IcloudSync.read({ fileName: SNAPSHOT_FILE })
    if (remote.exists && remote.contents) {
      try {
        if (!isSnapshotEmpty(JSON.parse(remote.contents))) return false
      } catch { /* unparseable remote — fall through and allow the write */ }
    }
  }

  const res = await IcloudSync.write({
    fileName: SNAPSHOT_FILE,
    contents: JSON.stringify(payload),
  })
  if (res.success) {
    const now = new Date().toISOString()
    await Preferences.set({ key: LAST_SYNC_KEY, value: now })
    // Record the version we just pushed so reconciliation knows this device is
    // current with the remote and shouldn't pull its own write back.
    await Preferences.set({ key: DATA_VERSION_KEY, value: payload.exported_at })
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
  // Mark this device as current with the version we just pulled.
  try {
    const v = JSON.parse(res.contents)?.exported_at
    if (v) await Preferences.set({ key: DATA_VERSION_KEY, value: v })
  } catch { /* ignore */ }
  return { message: out.data?.message ?? 'Restored from iCloud.' }
}

// ── Auto-sync preference ────────────────────────────────────────────────────

export async function isAutoSyncEnabled(): Promise<boolean> {
  const v = await Preferences.get({ key: AUTO_SYNC_KEY })
  // Default ON: when the user has never touched the toggle, auto-sync is
  // enabled so cross-device sync "just works" without manual steps.
  return v.value !== '0'
}

export async function setAutoSync(enabled: boolean): Promise<void> {
  await Preferences.set({ key: AUTO_SYNC_KEY, value: enabled ? '1' : '0' })
}

// Called from the app-background listener AND after every DB write (via
// scheduleAutoSync below). Silent: swallows errors and no-ops when auto-sync
// is off or iCloud is unavailable.
export async function autoSyncIfEnabled(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return
    if (!(await isAutoSyncEnabled())) return
    await syncToICloud()
  } catch {
    // best-effort
  }
}

// Debounced auto-sync triggered after any data write. Batches rapid edits
// (e.g. bulk import) into a single iCloud write 2 s after the last change.
// Silently no-ops when auto-sync is off or iCloud is unavailable.
let _syncTimer: ReturnType<typeof setTimeout> | null = null

// Auto-push is DISARMED until launch reconciliation finishes. This is critical:
// during startup the DB writes default/seed rows, which fire the write-listener.
// If we pushed then, an empty device would overwrite the master before it had a
// chance to pull. armAutoSync() is called once reconciliation completes.
let _armed = false
export function armAutoSync(): void { _armed = true }

export function scheduleAutoSync(delayMs = 2000): void {
  if (!Capacitor.isNativePlatform()) return
  if (!_armed) return
  if (_syncTimer !== null) clearTimeout(_syncTimer)
  _syncTimer = setTimeout(() => {
    _syncTimer = null
    autoSyncIfEnabled().catch(() => {})
  }, delayMs)
}

// Reconcile local data with the iCloud snapshot on launch / foreground, then arm
// auto-push. Last-writer-wins by snapshot timestamp:
//   • remote newer than what we last synced (another device changed it) → pull
//   • no remote yet but we have local data → seed the remote
//   • otherwise → nothing (our local edits auto-push via the write-listener)
// Always arms auto-sync in the end so user edits sync going forward.
export async function reconcileICloud(): Promise<void> {
  // Disarm while reconciling so the DELETE/INSERT churn of an incoming pull
  // (importFullData) can't schedule a push of the data we just pulled. Re-armed
  // in the finally below once reconciliation settles.
  _armed = false
  try {
    if (!Capacitor.isNativePlatform()) return
    if (!(await isAutoSyncEnabled())) return
    const { available } = await IcloudSync.isAvailable()
    if (!available) return

    const remote = await IcloudSync.read({ fileName: SNAPSHOT_FILE })

    if (remote.exists && remote.contents) {
      let payload: any = null
      try { payload = JSON.parse(remote.contents) } catch { return }
      const remoteVersion: string | null = payload?.exported_at ?? null
      if (!remoteVersion) return

      // Don't auto-pull a snapshot that belongs to a different Apple ID.
      const snapshotAppleId = payload?.apple_user_id as string | undefined
      if (snapshotAppleId) {
        const localAppleId = await getAppleUserId().catch(() => null)
        if (localAppleId && localAppleId !== snapshotAppleId) return
      }

      const localVersion = (await Preferences.get({ key: DATA_VERSION_KEY })).value
      // Pull when the remote is newer than the version this device last synced,
      // OR when this device has never synced (localVersion null) — the new-device
      // bootstrap that pulls the master instead of overwriting it.
      if (!localVersion || remoteVersion > localVersion) {
        // GUARD: never let an empty remote (e.g. one that got clobbered) wipe
        // real local data. If the remote is empty but we have data, repair the
        // remote from local instead of pulling. syncToICloud's own empty-guard
        // makes this safe even if both are empty.
        if (isSnapshotEmpty(payload)) {
          const local = await buildSnapshotPayload('icloud')
          if (!isSnapshotEmpty(local)) { await syncToICloud(); return }
          return // both empty — nothing to reconcile
        }
        const file = new File([remote.contents], SNAPSHOT_FILE, { type: 'application/json' })
        await nativeDataApi.importFullData(file, 'replace')
        try { window.localStorage.removeItem('last_net_worth_snapshot') } catch {}
        await Preferences.set({ key: DATA_VERSION_KEY, value: remoteVersion })
      }
    } else {
      // No remote yet — seed it from this device if we actually have data.
      const local = await buildSnapshotPayload('icloud')
      if (!isSnapshotEmpty(local)) await syncToICloud()
    }
  } catch {
    // best-effort — never block launch on sync
  } finally {
    armAutoSync()
  }
}
