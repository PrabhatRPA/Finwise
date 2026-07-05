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

// ── Sync state (per device, in Preferences) ─────────────────────────────────
// The sync model is whole-snapshot last-writer-wins, made robust with:
//   • revision: a MONOTONIC integer carried in the snapshot. Ordering is by
//     revision, NOT wall-clock, so device clock skew can't pick the wrong
//     winner. Each push sets revision = max(localSynced, remote) + 1.
//   • dirty flag: set only when the USER modifies data (after launch
//     reconciliation arms writes). A device that didn't modify anything never
//     pushes — this is what stops a passively-opened device from clobbering
//     the master. "You become the source by actually editing", as intended.
//   • modifiedAt: wall-clock, used ONLY as a tiebreaker for true concurrent
//     conflicts (both devices edited offline since the last common revision).
const SYNCED_REV_KEY = 'icloud_synced_rev'    // revision this device last pushed/pulled
// File mtime (epoch ms) of the remote snapshot we last acted on — the cheap
// fast-path: if the current version's mtime hasn't moved and we're not dirty,
// reconcile can return without downloading/parsing anything.
const REMOTE_MTIME_KEY = 'icloud_remote_mtime'
// KV doorbell key — a tiny beacon that propagates in seconds and wakes other
// running devices ("device X pushed revision N at T — check now").
const BEACON_KEY = 'nworth_sync_beacon'
const DIRTY_KEY = 'icloud_dirty'              // '1' = unsynced local user edits
const LOCAL_MODIFIED_KEY = 'icloud_local_modified' // ISO of last local user edit
const DEVICE_ID_KEY = 'icloud_device_id'      // stable per-install id (diagnostics + tiebreak)

async function getSyncedRevision(): Promise<number> {
  const v = (await Preferences.get({ key: SYNCED_REV_KEY })).value
  const n = v ? parseInt(v, 10) : 0
  return Number.isFinite(n) ? n : 0
}
async function setSyncedRevision(n: number): Promise<void> {
  await Preferences.set({ key: SYNCED_REV_KEY, value: String(n) })
}
async function isDirty(): Promise<boolean> {
  return (await Preferences.get({ key: DIRTY_KEY })).value === '1'
}
async function setDirty(dirty: boolean): Promise<void> {
  await Preferences.set({ key: DIRTY_KEY, value: dirty ? '1' : '0' })
  if (dirty) await Preferences.set({ key: LOCAL_MODIFIED_KEY, value: new Date().toISOString() })
}
async function getLocalModifiedAt(): Promise<string> {
  return (await Preferences.get({ key: LOCAL_MODIFIED_KEY })).value ?? ''
}
async function getDeviceId(): Promise<string> {
  const existing = (await Preferences.get({ key: DEVICE_ID_KEY })).value
  if (existing) return existing
  const id = (globalThis.crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await Preferences.set({ key: DEVICE_ID_KEY, value: id })
  return id
}

// Parsed view of the remote snapshot's sync metadata.
interface RemoteMeta {
  exists: boolean; contents: string; payload: any | null; revision: number
  modifiedAt: string   // in-payload wall-clock (conflict tiebreak)
  fileMtime: number    // iCloud file mtime (fast-path marker)
}
async function readRemote(): Promise<RemoteMeta> {
  const res = await IcloudSync.read({ fileName: SNAPSHOT_FILE })
  const fileMtime = res.modifiedAt ?? 0
  if (!res.exists || !res.contents) return { exists: false, contents: '', payload: null, revision: 0, modifiedAt: '', fileMtime }
  try {
    const payload = JSON.parse(res.contents)
    const revision = Number.isFinite(payload?.revision) ? payload.revision : 0
    const modifiedAt = payload?.sync_modified_at ?? payload?.exported_at ?? ''
    return { exists: true, contents: res.contents, payload, revision, modifiedAt, fileMtime }
  } catch {
    return { exists: true, contents: res.contents, payload: null, revision: 0, modifiedAt: '', fileMtime }
  }
}

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
  read(opts: { fileName: string }): Promise<{ exists: boolean; contents?: string; modifiedAt?: number; stale?: boolean }>
  info(opts: { fileName: string }): Promise<{ available: boolean; exists: boolean; modifiedAt?: number; deviceName?: string; stale?: boolean }>
  kvSet(opts: { key: string; value: string }): Promise<{ success: boolean }>
  kvGet(opts: { key: string }): Promise<{ value: string }>
  addListener?(event: string, cb: (data: any) => void): Promise<{ remove: () => void }>
}

// On web/Tauri there is no native plugin — every method degrades to
// "unavailable" so callers (and the build) work everywhere.
const webFallback: IcloudSyncPlugin = {
  isAvailable: async () => ({ available: false }),
  write: async () => ({ success: false }),
  read: async () => ({ exists: false }),
  info: async () => ({ available: false, exists: false }),
  kvSet: async () => ({ success: false }),
  kvGet: async () => ({ value: '' }),
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

// Upload a fresh full-data snapshot to iCloud, stamped with the next revision.
// Returns true on success. Used by both the manual "Sync now" button and the
// automatic push path.
export async function syncToICloud(): Promise<boolean> {
  const { available } = await IcloudSync.isAvailable()
  if (!available) return false
  const payload: any = await buildSnapshotPayload('icloud')

  const remote = await readRemote()

  // SAFETY: never overwrite a non-empty remote snapshot with empty local data.
  // A device that just launched (only default/seed rows) must not clobber the
  // master. This is the core guard against the "empty JSON overwrite" bug.
  if (isSnapshotEmpty(payload) && remote.exists && remote.payload && !isSnapshotEmpty(remote.payload)) {
    return false
  }

  // Monotonic revision: strictly greater than both what we last synced and
  // whatever is currently in iCloud, so ordering never depends on wall clocks.
  const nextRevision = Math.max(await getSyncedRevision(), remote.revision) + 1
  payload.revision = nextRevision
  payload.sync_modified_at = new Date().toISOString()
  payload.device_id = await getDeviceId()

  const res = await IcloudSync.write({
    fileName: SNAPSHOT_FILE,
    contents: JSON.stringify(payload),
  })
  if (res.success) {
    await Preferences.set({ key: LAST_SYNC_KEY, value: new Date().toISOString() })
    await setSyncedRevision(nextRevision)
    await setDirty(false)   // our local edits are now safely in iCloud
    // Fast-path marker: this device is current with the version it just wrote.
    if (res.modifiedAt) {
      await Preferences.set({ key: REMOTE_MTIME_KEY, value: String(res.modifiedAt) })
    }
    // Ring the doorbell so other RUNNING devices pull within seconds.
    try {
      await IcloudSync.kvSet({
        key: BEACON_KEY,
        value: JSON.stringify({
          rev: nextRevision,
          mtime: res.modifiedAt ?? Date.now(),
          device: await getDeviceId(),
        }),
      })
    } catch { /* beacon is best-effort */ }
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
  // Mark this device as current with the revision we just pulled, and clear the
  // dirty flag — local data now equals the remote snapshot.
  try {
    const v = JSON.parse(res.contents)
    const rev = Number.isFinite(v?.revision) ? v.revision : 0
    await setSyncedRevision(rev)
    await setDirty(false)
    if (res.modifiedAt) await Preferences.set({ key: REMOTE_MTIME_KEY, value: String(res.modifiedAt) })
  } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('nworth:data-synced')) } catch {}
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

// Called from the app-background listener AND after every user DB write (via
// scheduleAutoSync). Pushes only when this device is dirty (has unsynced local
// edits) so we don't needlessly bump the revision and make other devices pull
// identical data. Silent: swallows errors and no-ops when off / unavailable.
export async function autoSyncIfEnabled(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return
    if (!(await isAutoSyncEnabled())) return
    if (!(await isDirty())) return
    await syncToICloud()
  } catch {
    // best-effort
  }
}

// Debounced auto-sync triggered after any USER data write. Marks this device
// dirty (it now holds unsynced edits → it's allowed to become the source) and
// batches rapid edits into a single iCloud push 2 s after the last change.
let _syncTimer: ReturnType<typeof setTimeout> | null = null

// Auto-push is DISARMED until launch reconciliation finishes. This is critical:
// during startup the DB writes default/seed rows, which fire the write-listener.
// While disarmed those writes neither mark the device dirty nor push — so a
// passively-opened device can't clobber the master. armAutoSync() is called
// once reconciliation completes; only writes AFTER that count as user edits.
let _armed = false
export function armAutoSync(): void { _armed = true }

export function scheduleAutoSync(delayMs = 800): void {
  if (!Capacitor.isNativePlatform()) return
  if (!_armed) return
  // A write after reconciliation = a real user modification. Mark dirty so this
  // device is recognised as having changes to push (and to win ties).
  setDirty(true).catch(() => {})
  if (_syncTimer !== null) clearTimeout(_syncTimer)
  _syncTimer = setTimeout(() => {
    _syncTimer = null
    autoSyncIfEnabled().catch(() => {})
  }, delayMs)
}

// Apply a remote snapshot to local storage (a pull) and record its revision.
async function applyRemotePull(remote: RemoteMeta): Promise<void> {
  const file = new File([remote.contents], SNAPSHOT_FILE, { type: 'application/json' })
  await nativeDataApi.importFullData(file, 'replace')
  try { window.localStorage.removeItem('last_net_worth_snapshot') } catch {}
  await setSyncedRevision(remote.revision)
  await setDirty(false)
  if (remote.fileMtime) {
    await Preferences.set({ key: REMOTE_MTIME_KEY, value: String(remote.fileMtime) })
  }
  // Tell mounted screens fresh data just landed so it appears without any
  // user action (dashboard listens and silently refetches).
  try { window.dispatchEvent(new Event('nworth:data-synced')) } catch {}
}

// Reconcile local data with the iCloud snapshot on launch / foreground, then arm
// auto-push. Robust whole-snapshot sync (see the sync-state comment at top):
//
//   remote.revision > our lastSyncedRevision   → someone else pushed since we
//                                                 last synced:
//        • we're NOT dirty                → pull (no local work to lose)
//        • we ARE dirty (concurrent edit) → CONFLICT, newest modifiedAt wins
//        • remote is empty but we have data → repair remote from local
//   remote.revision <= lastSyncedRevision     → remote isn't ahead of us:
//        • we're dirty                    → push our pending edits
//        • else                           → already in sync, do nothing
//   no remote yet                              → seed it from local if we have data
//
// Ordering is by the monotonic revision, never the wall clock; modifiedAt is
// only the conflict tiebreaker. Always arms auto-sync at the end.
let _reconciling = false
export async function reconcileICloud(): Promise<void> {
  // Guard against overlapping runs — the 45s foreground poll and an
  // appStateChange event can both fire, and a pull's importFullData shouldn't
  // race a second reconcile.
  if (_reconciling) return
  _reconciling = true
  // Disarm while reconciling so the DELETE/INSERT churn of an incoming pull
  // can't mark us dirty or schedule a push. Re-armed in finally.
  _armed = false
  try {
    if (!Capacitor.isNativePlatform()) return
    if (!(await isAutoSyncEnabled())) return
    const { available } = await IcloudSync.isAvailable()
    if (!available) return

    // FAST-PATH: when we have no local edits pending, a cheap metadata probe
    // decides whether anything changed at all. info() guarantees the mtime is
    // the CURRENT iCloud version's (the Swift layer force-refreshes); if it
    // matches the version we last acted on, there is nothing to do — no
    // download, no JSON parse, no DB churn. This is what makes the 30s poll
    // and every-refresh triggers essentially free.
    if (!(await isDirty())) {
      try {
        const probe = await IcloudSync.info({ fileName: SNAPSHOT_FILE })
        const marker = (await Preferences.get({ key: REMOTE_MTIME_KEY })).value
        if (
          probe.exists && !probe.stale && probe.modifiedAt &&
          marker && String(probe.modifiedAt) === marker
        ) {
          return
        }
      } catch { /* probe failed — fall through to the full path */ }
    }

    const remote = await readRemote()
    const localPayload = await buildSnapshotPayload('icloud')
    const localEmpty = isSnapshotEmpty(localPayload)

    // No remote yet — seed it from this device if we actually have data.
    if (!remote.exists) {
      if (!localEmpty) await syncToICloud()
      return
    }

    // Don't auto-pull a snapshot that belongs to a different Apple ID.
    const snapshotAppleId = remote.payload?.apple_user_id as string | undefined
    if (snapshotAppleId) {
      const localAppleId = await getAppleUserId().catch(() => null)
      if (localAppleId && localAppleId !== snapshotAppleId) return
    }

    const syncedRev = await getSyncedRevision()
    const dirty = await isDirty()
    const remoteEmpty = !remote.payload || isSnapshotEmpty(remote.payload)

    if (remote.revision > syncedRev) {
      // Remote advanced since we last synced.
      if (remoteEmpty && !localEmpty) {
        // Empty/clobbered remote must never wipe real local data → repair it.
        await syncToICloud()
        return
      }
      if (!dirty) {
        // No unsynced local edits → safe to take the remote.
        if (!remoteEmpty) await applyRemotePull(remote)
        else await setSyncedRevision(remote.revision) // both empty — just catch up
      } else {
        // CONFLICT: both sides changed since the last common revision.
        // Newest last-modified wins (last-writer-wins tiebreaker).
        const localMod = await getLocalModifiedAt()
        if (remote.modifiedAt && remote.modifiedAt > localMod) {
          if (!remoteEmpty) await applyRemotePull(remote)
        } else {
          await syncToICloud() // our edit is newer → push over the remote
        }
      }
    } else {
      // Remote is not ahead of us. Push only if we have pending local edits.
      if (dirty && !localEmpty) await syncToICloud()
      // Already in sync — remember this version's mtime so the fast-path can
      // short-circuit the next checks.
      else if (remote.fileMtime) {
        await Preferences.set({ key: REMOTE_MTIME_KEY, value: String(remote.fileMtime) })
      }
    }
  } catch {
    // best-effort — never block launch on sync
  } finally {
    armAutoSync()
    _reconciling = false
  }
}

// ── Doorbell listener ────────────────────────────────────────────────────────
// Another device's push writes a beacon into the iCloud Key-Value store, which
// propagates in seconds and fires natively while this app is running. On a
// foreign beacon with a newer revision, pull immediately — this is what makes
// "edit on iPhone → appears on iPad within seconds" work without polling.
export async function initSyncListeners(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {}
  try {
    const handle = await (IcloudSync as any).addListener?.('kvChanged', async (data: any) => {
      try {
        const raw = data?.[BEACON_KEY]
        if (!raw) return
        const beacon = JSON.parse(raw)
        const myDevice = await getDeviceId()
        if (beacon?.device && beacon.device !== myDevice) {
          const syncedRev = await getSyncedRevision()
          if (!Number.isFinite(beacon.rev) || beacon.rev > syncedRev) {
            reconcileICloud()
          }
        }
      } catch { /* malformed beacon — ignore */ }
    })
    return () => { handle?.remove?.() }
  } catch {
    return () => {}
  }
}
