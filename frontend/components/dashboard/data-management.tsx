'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { dataApi } from '@/lib/api'

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
    // Weekly auto-backup: check if the newest backup is older than 7 days
    dataApi.listBackups().then(res => {
      const list: BackupRecord[] = res.data.backups ?? []
      const newest = list[0]
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      if (!newest || new Date(newest.created_at).getTime() < sevenDaysAgo) {
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
      {/* ── Export ── */}
      <Card>
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
      <Card>
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
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Automatic Backups</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              A complete JSON snapshot is saved on your device every 7 days. Up to 10 backups are kept.
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
