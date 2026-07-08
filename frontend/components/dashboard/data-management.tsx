'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { dataApi } from '@/lib/api'
import {
  getICloudStatus,
  restoreFromICloud,
  reconcileICloud,
  isAutoSyncEnabled,
  setAutoSync,
  type ICloudStatus,
} from '@/lib/native/icloud'

// "2 minutes ago" style relative time for the last-synced indicator.
function relativeTime(iso?: string): string | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (!isFinite(then)) return null
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

interface BackupRecord {
  filename: string
  size_bytes: number
  created_at: string
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

// ── Auto-backup frequency (per-device preference) ──────────────────────────
// 0 = off. Stored in localStorage so it survives relaunch without needing a DB
// round-trip on every dashboard load.
const BACKUP_INTERVAL_KEY = 'auto_backup_interval_days'
const BACKUP_INTERVAL_OPTIONS = [
  { days: 1,  label: 'Daily' },
  { days: 7,  label: 'Weekly' },
  { days: 30, label: 'Monthly' },
  { days: 0,  label: 'Off' },
] as const

function loadBackupIntervalDays(): number {
  if (typeof window === 'undefined') return 7
  const raw = window.localStorage.getItem(BACKUP_INTERVAL_KEY)
  const n = raw == null ? 7 : Number(raw)
  return [0, 1, 7, 30].includes(n) ? n : 7
}

type ImportResult = {
  message: string
  /** Real per-row errors (shown red). */
  errors?: string[]
  /** Per-section summary lines (shown neutral, never truncated). */
  details?: string[]
}

function ImportRow({
  label,
  onImport,
  accept = '.csv',
}: {
  label: string
  onImport: (file: File) => Promise<ImportResult>
  accept?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean } & ImportResult | null>(null)

  const handle = async (file: File) => {
    setLoading(true)
    setResult(null)
    try {
      const res = await onImport(file)
      setResult({ ok: true, ...res })
    } catch (err: any) {
      setResult({ ok: false, message: err?.response?.data?.detail ?? 'Import failed' })
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <span className="text-sm w-28 shrink-0">{label}</span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handle(f) }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
          className="text-xs"
        >
          {loading ? 'Importing…' : `Choose ${accept.replace('.', '').toUpperCase()}…`}
        </Button>
      </div>
      {result && (
        <div className="pl-32 space-y-1">
          <p className={`text-xs ${result.ok ? 'text-green-700' : 'text-red-600'}`}>
            {result.message}
          </p>
          {/* Per-section summary lines — informational, not errors. Show ALL. */}
          {result.details && result.details.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {result.details.map((line, i) => (
                <li key={i} className="font-mono">{line}</li>
              ))}
            </ul>
          )}
          {/* Real errors (e.g. row 5 missing ticker). Show first 5 in red. */}
          {result.errors && result.errors.length > 0 && (
            <p className="text-xs text-red-500">{result.errors.slice(0, 5).join(' | ')}</p>
          )}
        </div>
      )}
    </div>
  )
}

export function DataManagement({ onDataChanged }: { onDataChanged?: () => void }) {
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [loadingBackups, setLoadingBackups] = useState(true)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')
  const [exportBusy, setExportBusy] = useState<string | null>(null)
  const [importMode, setImportMode] = useState<'add' | 'update' | 'replace'>('update')
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoMsg, setDemoMsg] = useState('')
  const [clearBusy, setClearBusy] = useState(false)

  // ── iCloud sync ──
  const [icloud, setIcloud] = useState<ICloudStatus | null>(null)
  const [icloudBusy, setIcloudBusy] = useState<'sync' | 'restore' | null>(null)
  const [icloudMsg, setIcloudMsg] = useState('')
  const [icloudMsgType, setIcloudMsgType] = useState<'success' | 'error'>('success')
  const [autoSync, setAutoSyncState] = useState(false)

  const refreshICloud = useCallback(async () => {
    try { setIcloud(await getICloudStatus()) } catch { setIcloud(null) }
  }, [])

  useEffect(() => {
    refreshICloud()
    isAutoSyncEnabled().then(setAutoSyncState).catch(() => {})
    // Keep "Last synced" live when a background pull lands.
    const onSynced = () => refreshICloud()
    window.addEventListener('nworth:data-synced', onSynced)
    return () => window.removeEventListener('nworth:data-synced', onSynced)
  }, [refreshICloud])

  const handleICloudSync = async () => {
    setIcloudBusy('sync')
    setIcloudMsg('')
    try {
      const status = await getICloudStatus()
      if (!status.available) {
        setIcloudMsgType('error')
        setIcloudMsg('iCloud is not available. In iOS Settings → [Your Name] → iCloud, turn on iCloud Drive, then tap iCloud Drive and make sure Nworth is enabled.')
        return
      }
      // Two-way: push local edits if any, else pull the latest from another
      // device. reconcileICloud handles both directions and the conflict rules
      // (never clobbers a newer remote; never lets empty wipe real data).
      await reconcileICloud()
      onDataChanged?.()
      setIcloudMsgType('success')
      setIcloudMsg('Synced with iCloud.')
      await refreshICloud()
    } catch (e: any) {
      setIcloudMsgType('error')
      setIcloudMsg(e?.message ?? 'iCloud sync failed.')
    } finally {
      setIcloudBusy(null)
    }
  }

  const handleICloudRestore = async () => {
    if (typeof window !== 'undefined' && !window.confirm(
      'Restore from iCloud?\n\nThis REPLACES all current holdings, accounts, transactions, ' +
      'watchlist, loans, properties, and trend history with the snapshot stored in iCloud. ' +
      'Your login is preserved. This cannot be undone.'
    )) return
    setIcloudBusy('restore')
    setIcloudMsg('')
    try {
      const out = await restoreFromICloud()
      onDataChanged?.()
      setIcloudMsgType('success')
      setIcloudMsg(out.message)
    } catch (e: any) {
      setIcloudMsgType('error')
      setIcloudMsg(e?.message ?? 'iCloud restore failed.')
    } finally {
      setIcloudBusy(null)
    }
  }

  const toggleAutoSync = async () => {
    const next = !autoSync
    setAutoSyncState(next)
    try { await setAutoSync(next) } catch {}
  }

  // Wipe all data (demo or real) so the user can start fresh. Keeps the login.
  const handleClearAll = async () => {
    if (typeof window !== 'undefined' && !window.confirm(
      'Remove ALL data and start fresh?\n\nThis deletes every holding, account, ' +
      'transaction, watchlist entry, loan, property, and all trend history. ' +
      'Your user account and login are preserved. This cannot be undone.'
    )) return
    setClearBusy(true)
    setDemoMsg('')
    try {
      await dataApi.clearAllData()
      // Drop the dashboard's cached net-worth snapshot so it doesn't show
      // stale numbers after the wipe (see app/dashboard/page.tsx).
      try { window.localStorage.removeItem('last_net_worth_snapshot') } catch {}
      onDataChanged?.()
      await loadBackups()
      setDemoMsg('All data removed. You can start fresh.')
    } catch (e: any) {
      setDemoMsg(e?.response?.data?.detail ?? e?.message ?? 'Failed to remove data.')
    } finally {
      setClearBusy(false)
    }
  }
  const [backupIntervalDays, setBackupIntervalDays] = useState<number>(7)

  // Load the saved auto-backup frequency on mount (localStorage is client-only).
  useEffect(() => { setBackupIntervalDays(loadBackupIntervalDays()) }, [])

  const changeBackupInterval = (days: number) => {
    setBackupIntervalDays(days)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(BACKUP_INTERVAL_KEY, String(days))
    }
  }

  // One-tap loader for the bundled sample dataset (frontend/public/demo-data.json):
  // 24 holdings across every asset type/sector, accounts, debts, properties,
  // watchlist, transactions, and ~18 months of daily net-worth history so all
  // charts (1W / 1M / 1Y ranges included) have data. Always a clean 'replace'.
  const handleLoadDemo = async () => {
    if (typeof window !== 'undefined' && !window.confirm(
      'Load the demo dataset?\n\nThis REPLACES all current holdings, accounts, transactions, ' +
      'watchlist, loans, properties, and trend history with sample data for testing. ' +
      'Your user account and login are preserved. This cannot be undone.'
    )) return
    setDemoBusy(true)
    setDemoMsg('')
    try {
      const res = await fetch('/demo-data.json', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Could not load demo file (HTTP ${res.status}).`)
      const text = await res.text()
      const file = new File([text], 'demo-data.json', { type: 'application/json' })
      const out = await dataApi.importFullData(file, 'replace')
      onDataChanged?.()
      setDemoMsg(out.data.message ?? 'Demo data loaded.')
    } catch (e: any) {
      setDemoMsg(e?.response?.data?.detail ?? e?.message ?? 'Failed to load demo data.')
    } finally {
      setDemoBusy(false)
    }
  }

  const loadBackups = useCallback(async () => {
    try {
      const res = await dataApi.listBackups()
      setBackups(res.data.backups ?? [])
    } catch {
      setBackups([])
    } finally {
      setLoadingBackups(false)
    }
  }, [])

  useEffect(() => {
    loadBackups()
    // Auto-backup honoring the user's chosen frequency (0 = off): create a
    // fresh snapshot if the newest one is older than the configured interval.
    const intervalDays = loadBackupIntervalDays()
    if (intervalDays <= 0) return
    dataApi.listBackups().then(res => {
      const list: BackupRecord[] = res.data.backups ?? []
      const newest = list[0]
      const cutoff = Date.now() - intervalDays * 24 * 60 * 60 * 1000
      if (!newest || new Date(newest.created_at).getTime() < cutoff) {
        dataApi.createBackup().catch(() => {})
      }
    }).catch(() => {})
  }, [loadBackups])

  const handleCreateBackup = async () => {
    setCreatingBackup(true)
    setBackupMsg('')
    try {
      const res = await dataApi.createBackup()
      setBackupMsg(`Backup created: ${res.data.filename}`)
      await loadBackups()
    } catch {
      setBackupMsg('Backup failed — check that the backend is running.')
    } finally {
      setCreatingBackup(false)
    }
  }

  const handleExport = async (label: string, fn: () => Promise<void>) => {
    setExportBusy(label)
    try { await fn() } catch { /* download errors surface in browser */ }
    finally { setExportBusy(null) }
  }

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Delete backup "${filename}"?`)) return
    try {
      await dataApi.deleteBackup(filename)
      setBackups(b => b.filter(x => x.filename !== filename))
    } catch {}
  }

  const handleRestoreBackup = async (filename: string) => {
    if (!confirm(
      `Restore from "${filename}"?\n\n` +
      `This will REPLACE all your current holdings, accounts, transactions, ` +
      `watchlist, loans, properties, and trend history with the contents of ` +
      `this backup. Your login is preserved. This can't be undone.\n\nProceed?`
    )) return
    setBackupMsg('Restoring…')
    try {
      const res = await dataApi.restoreBackup(filename, 'replace')
      const msg = res?.data?.message ?? 'Restored from backup.'
      setBackupMsg(msg)
      onDataChanged?.()
    } catch (err: any) {
      setBackupMsg(`Restore failed: ${err?.response?.data?.detail ?? err?.message ?? 'unknown error'}`)
    }
  }

  const handleImport = async (
    fn: (f: File) => ReturnType<typeof dataApi.importHoldings>,
    file: File
  ) => {
    const res = await fn(file)
    onDataChanged?.()
    return res.data as { message: string; errors?: string[] }
  }

  return (
    <div className="space-y-6">
      {/* ── iCloud Sync ── */}
      <Card id="icloud-sync" className="scroll-mt-4" style={{ scrollMarginTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <CardHeader>
          <CardTitle className="text-base">iCloud Sync</CardTitle>
          <p className="text-sm text-muted-foreground">
            Keep your portfolio in sync across your iPhone and iPad. A complete
            snapshot is stored in your private iCloud Drive — nothing is sent to
            any third-party server. Restore on another device to copy everything
            over (this replaces that device&apos;s data).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {icloud && !icloud.available && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                iCloud isn&apos;t available. In{' '}
                <span className="font-mono">iOS Settings → [Your Name] → iCloud</span>,
                make sure iCloud Drive is on. Then tap iCloud Drive and confirm
                <span className="font-semibold"> Nworth</span> is enabled in the app list.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={icloudBusy !== null || (icloud ? !icloud.available : false)}
              onClick={handleICloudSync}
              className="text-xs"
            >
              {icloudBusy === 'sync' ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={icloudBusy !== null || (icloud ? !icloud.available : false)}
              onClick={handleICloudRestore}
              className="text-xs"
            >
              {icloudBusy === 'restore' ? 'Restoring…' : 'Restore from iCloud'}
            </Button>
          </div>

          {/* Last-synced status */}
          {icloud?.available && (
            <p className="text-xs text-muted-foreground">
              {icloudBusy === 'sync'
                ? 'Syncing…'
                : icloud.lastSyncAt
                  ? <>Last synced <span className="font-medium text-foreground">{relativeTime(icloud.lastSyncAt)}</span>.</>
                  : 'Not synced yet on this device.'}
            </p>
          )}

          {/* Auto-sync toggle */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="min-w-0">
              <p className="text-sm font-medium">Auto-sync</p>
              <p className="text-xs text-muted-foreground">
                Push changes to iCloud within seconds of every edit — including
                when the app is closed or killed.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoSync}
              onClick={toggleAutoSync}
              className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full
                border-2 border-transparent transition-colors duration-200 ease-in-out
                ${autoSync ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-[27px] w-[27px] transform rounded-full
                  bg-white shadow-md transition duration-200 ease-in-out
                  ${autoSync ? 'translate-x-[20px]' : 'translate-x-0'}`}
              />
            </button>
          </div>

          {(icloud?.lastSyncAt || icloud?.remoteModifiedAt) && (
            <p className="text-xs text-muted-foreground">
              {icloud?.lastSyncAt && <>Last synced from this device: {new Date(icloud.lastSyncAt).toLocaleString()}. </>}
              {icloud?.remoteModifiedAt && <>iCloud snapshot updated: {new Date(icloud.remoteModifiedAt).toLocaleString()}.</>}
            </p>
          )}
          {icloudMsg && (
            <p className={`text-xs font-medium ${icloudMsgType === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {icloudMsgType === 'error' ? '⚠ ' : '✓ '}{icloudMsg}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Export ── */}
      <Card id="export-data" className="scroll-mt-4" style={{ scrollMarginTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <CardHeader>
          <CardTitle className="text-base">Export Data</CardTitle>
          <p className="text-sm text-muted-foreground">
            Download your data as CSV files or a complete JSON snapshot.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'All Data JSON', fn: dataApi.exportFullData },
              { label: 'Holdings CSV', fn: dataApi.exportHoldings },
              { label: 'Watchlist CSV', fn: dataApi.exportWatchlist },
              { label: 'Debts CSV', fn: dataApi.exportDebts },
              { label: 'Trends CSV', fn: dataApi.exportTrends },
            ].map(({ label, fn }) => (
              <Button
                key={label}
                variant="outline"
                size="sm"
                disabled={exportBusy === label}
                onClick={() => handleExport(label, fn)}
                className="text-xs gap-1.5"
              >
                {exportBusy === label ? (
                  <span className="animate-spin">⟳</span>
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                {exportBusy === label ? 'Preparing…' : label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Import ── */}
      <Card id="import-data" className="scroll-mt-4" style={{ scrollMarginTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <CardHeader>
          <CardTitle className="text-base">Import Data</CardTitle>
          <p className="text-sm text-muted-foreground">
            Restore from a full JSON export or upload individual CSV files. Duplicates are skipped automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
            <p className="text-xs font-semibold text-primary">Full Restore (recommended)</p>

            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium mb-1">Conflict mode</legend>
              {([
                ['update', 'Update existing + add new', 'Existing rows are overwritten with values from the file; new rows are created. Use this to revert recent edits back to a snapshot.'],
                ['add',    'Add new only',              'Existing rows are kept unchanged; only rows that don\'t already exist are added.'],
                ['replace','Replace everything',        'Wipe ALL my current holdings, accounts, transactions, watchlist, loans, properties, and trend history before importing. True bit-for-bit restore. User account is preserved.'],
              ] as const).map(([value, label, help]) => (
                <label key={value} className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="import-mode"
                    value={value}
                    checked={importMode === value}
                    onChange={() => setImportMode(value)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className={value === 'replace' ? 'font-medium text-red-600 dark:text-red-400' : 'font-medium'}>
                      {label}
                    </span>{' '}
                    <span className="text-muted-foreground">&mdash; {help}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <ImportRow
              label="All Data JSON"
              accept=".json"
              onImport={async f => {
                if (importMode === 'replace' && !confirm(
                  'This will DELETE all your current holdings, accounts, transactions, watchlist, loans, properties, and trend history, then import everything from the JSON file.\n\nUser account and login are preserved. This cannot be undone.\n\nProceed?'
                )) {
                  return { message: 'Replace cancelled.' }
                }
                const res = await dataApi.importFullData(f, importMode)
                onDataChanged?.()
                const s = res.data.summary ?? {}
                const details = Object.entries(s).map(([k, v]: [string, any]) => {
                  const parts = [`${k}: +${v.created ?? 0}`]
                  if (v.skipped) parts.push(`${v.skipped} skipped`)
                  if (v.updated) parts.push(`${v.updated} updated`)
                  if (v.deleted) parts.push(`${v.deleted} replaced`)
                  return parts.join(' / ')
                })
                return { message: res.data.message, details }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Pick a conflict mode above, then choose your <strong>nworth_full_export.json</strong>.
              All sections (holdings, accounts, transactions, watchlist, loans,
              properties, portfolio history) are restored together.
            </p>

            {/* Demo / sample data — one tap, no file picker needed */}
            <div id="demo-data" className="rounded-md border border-dashed border-border p-3 space-y-2 scroll-mt-20" style={{ scrollMarginTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Load demo data</p>
                  <p className="text-xs text-muted-foreground">
                    24 sample holdings + accounts, debts, properties, watchlist &amp;
                    18 months of history. Replaces current data.
                  </p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={demoBusy || clearBusy}
                    onClick={handleLoadDemo}
                    className="text-xs"
                  >
                    {demoBusy ? 'Loading…' : 'Load demo data'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={demoBusy || clearBusy}
                    onClick={handleClearAll}
                    className="text-xs text-red-600 hover:text-red-700 hover:border-red-300 dark:hover:bg-red-950/30"
                  >
                    {clearBusy ? 'Removing…' : 'Remove all data'}
                  </Button>
                </div>
              </div>
              {demoMsg && <p className="text-xs text-muted-foreground">{demoMsg}</p>}
            </div>
          </div>

          <p className="text-xs font-semibold text-muted-foreground pt-1">Individual CSV import</p>
          <ImportRow
            label="Holdings"
            onImport={f => handleImport(dataApi.importHoldings, f)}
          />
          <ImportRow
            label="Watchlist"
            onImport={f => handleImport(dataApi.importWatchlist, f)}
          />
          <ImportRow
            label="Debts"
            onImport={f => handleImport(dataApi.importDebts, f)}
          />
          <p className="text-xs text-muted-foreground pt-1">
            Required columns — Holdings: <code>ticker, shares</code> · Watchlist: <code>ticker</code> · Debts: <code>loan_name, loan_type, original_balance, current_balance</code>
          </p>
        </CardContent>
      </Card>

      {/* ── Automatic Backups ── */}
      <Card id="auto-backups" className="scroll-mt-4" style={{ scrollMarginTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Automatic Backups</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              A complete JSON snapshot — holdings, accounts, debts, properties,
              watchlist, transactions and net-worth history — is saved on your
              device {backupIntervalDays > 0 ? `every ${backupIntervalDays === 1 ? 'day' : backupIntervalDays === 7 ? 'week' : 'month'}` : 'only when you tap Backup now'}. Up to 10 backups are kept.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={creatingBackup}
            onClick={handleCreateBackup}
            className="shrink-0 text-xs"
          >
            {creatingBackup ? 'Creating…' : '+ Backup now'}
          </Button>
        </CardHeader>
        <CardContent>
          {/* Frequency selector */}
          <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground">Backup frequency</span>
            <div className="flex items-center gap-1">
              {BACKUP_INTERVAL_OPTIONS.map(opt => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => changeBackupInterval(opt.days)}
                  className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                    backupIntervalDays === opt.days
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {backupMsg && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">
              {backupMsg}
            </p>
          )}
          {loadingBackups ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No backups yet. Click &quot;Backup now&quot; to create one.</p>
          ) : (
            <div className="divide-y rounded-md border text-sm">
              {backups.map(b => (
                <div key={b.filename} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{b.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(b.created_at).toLocaleString()} · {formatBytes(b.size_bytes)}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2"
                      onClick={() => handleRestoreBackup(b.filename)}
                    >
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2"
                      onClick={() => dataApi.downloadBackup(b.filename)}
                    >
                      Download
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2 text-red-500 hover:text-red-700"
                      onClick={() => handleDeleteBackup(b.filename)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
