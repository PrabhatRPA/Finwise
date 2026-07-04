'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { documentsApi, accountsApi } from '@/lib/api'
import type { Account } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { DataManagement } from '@/components/dashboard/data-management'

const DOCUMENT_TYPES = [
  { value: '1099_b', label: '1099-B (Stock Sales / Capital Gains)' },
  { value: '1099_div', label: '1099-DIV (Dividends)' },
  { value: '1099_int', label: '1099-INT (Interest Income)' },
  { value: '1099_rmd', label: '1099-R (Retirement / 401k / IRA Distribution)' },
  { value: 'brokerage_statement', label: 'Brokerage Statement' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'tax_return', label: 'Tax Return' },
  { value: 'other', label: 'Other' },
]

const SECURITY_TYPES = ['stock', 'etf', 'bond', 'crypto', 'reit', 'mutual_fund']

interface ExtractedRow {
  ticker: string
  shares: number | string
  average_cost: number | string
  security_type: string
  purchase_date: string
  account_id: string   // '' = N/A
}

interface DocumentRecord {
  id: number
  document_type: string
  document_name: string
  file_size_bytes: number
  upload_date: string
  extraction_status: string
  extracted_data?: { investments?: any[] }
  error_message?: string
}

function statusBadge(status: string) {
  if (status === 'completed') return <Badge className="bg-green-100 text-green-800">Extracted</Badge>
  if (status === 'failed') return <Badge className="bg-red-100 text-red-800">Failed</Badge>
  if (status === 'processing') return <Badge className="bg-yellow-100 text-yellow-800">Processing…</Badge>
  return <Badge className="bg-gray-100 text-gray-600">Pending</Badge>
}

function formatBytes(bytes: number) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function investmentsToRows(investments: any[]): ExtractedRow[] {
  return investments.map(inv => ({
    ticker: String(inv.ticker || '').toUpperCase(),
    shares: inv.shares ?? '',
    average_cost: inv.average_cost ?? inv.purchase_price ?? '',
    security_type: inv.security_type || 'stock',
    purchase_date: inv.purchase_date || '',
    account_id: '',
  }))
}

export default function DocumentsPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dragging, setDragging] = useState(false)
  const [docType, setDocType] = useState('brokerage_statement')
  const [accountId, setAccountId] = useState<string>('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  // Expanded doc + editable rows
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editRows, setEditRows] = useState<ExtractedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string>('')

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login')
      return
    }
    if (!authLoading && isAuthenticated) {
      fetchAccounts()
      fetchDocuments()
    }
  }, [authLoading, isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Deep links from Settings: ?focus=<area> scrolls straight to that section
  // so the user never has to hunt. upload → the AI upload card, export → the
  // Export Data card, manage → the Data Management area, demo → demo/clear.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const focus = new URLSearchParams(window.location.search).get('focus')
    if (!focus) return
    const target: Record<string, string> = {
      upload: 'upload-section',
      export: 'export-data',
      manage: 'data-management-section',
      backups: 'auto-backups',
      demo: 'demo-data',
    }
    const id = target[focus] ?? 'upload-section'
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 350)
    return () => clearTimeout(t)
  }, [])

  const fetchAccounts = async () => {
    try {
      const res = await accountsApi.getAll()
      if (res.data.accounts) setAccounts(res.data.accounts)
    } catch {}
  }

  const fetchDocuments = async () => {
    try {
      const res = await documentsApi.getAll()
      if (res.data.documents) setDocuments(res.data.documents)
    } catch {}
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  const isImageFile = (file: File) =>
    file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)

  // Capacitor Camera — opens iOS camera UI, converts the resulting photo
  // into a File, then routes it through the same uploadFile() pipeline.
  // Returns silently if the user cancels or the platform isn't native.
  const takePhoto = async () => {
    try {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) {
        // Fall back to the file picker on web — the browser will offer the
        // OS camera as one of its options.
        fileInputRef.current?.click()
        return
      }
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
      const photo = await Camera.getPhoto({
        quality: 88,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        saveToGallery: false,
      })
      if (!photo.webPath) return
      const blob = await (await fetch(photo.webPath)).blob()
      const ext = photo.format || 'jpg'
      const file = new File([blob], `statement_${Date.now()}.${ext}`, {
        type: blob.type || `image/${ext}`,
      })
      uploadFile(file)
    } catch (err: any) {
      // User-cancelled camera throws a "User cancelled photos app" — swallow.
      if (!/cancel/i.test(err?.message ?? '')) {
        setUploadError(err?.message || 'Could not open the camera.')
      }
    }
  }

  const uploadFile = async (file: File) => {
    const allowedPattern = /\.(pdf|csv|txt|png|jpe?g|webp)$/i
    const allowedMime = ['application/pdf', 'text/csv', 'text/plain', 'image/png', 'image/jpeg', 'image/webp']
    if (!allowedMime.includes(file.type) && !allowedPattern.test(file.name)) {
      setUploadError('Supported file types: PDF, CSV, TXT, PNG, JPG, JPEG, WEBP.')
      return
    }

    // Show image preview before uploading
    if (isImageFile(file)) {
      const reader = new FileReader()
      reader.onload = e => setImagePreview(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setImagePreview(null)
    }

    setUploading(true)
    setUploadError('')
    setUploadSuccess('')
    try {
      const res = await documentsApi.upload(file, docType, accountId ? Number(accountId) : undefined)
      setUploadSuccess(`"${file.name}" uploaded — AI is extracting investment data…`)
      await fetchDocuments()
      const docId = res.data.document_id ?? res.data.id
      if (docId) {
        let tries = 0
        const poll = setInterval(async () => {
          tries++
          const detail = await documentsApi.getById(docId)
          const status = detail.data.extraction_status || detail.data.document?.extraction_status
          if (status === 'completed' || status === 'failed' || tries > 20) {
            clearInterval(poll)
            await fetchDocuments()
            setUploadSuccess('')
            setImagePreview(null)
            // Auto-expand newly uploaded doc
            setExpandedId(docId)
            const investments = detail.data.extracted_data?.investments ?? []
            setEditRows(investmentsToRows(investments))
            setImportResult('')
          }
        }, 2000)
      }
    } catch (err: any) {
      setUploadError(err?.response?.data?.detail || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteDoc = async (id: number) => {
    try {
      await documentsApi.delete(id)
      setDocuments(d => d.filter(doc => doc.id !== id))
      if (expandedId === id) { setExpandedId(null); setEditRows([]) }
    } catch {}
  }

  const handleReprocess = async (id: number) => {
    try {
      await documentsApi.process(id)
      setDocuments(d => d.map(doc => doc.id === id ? { ...doc, extraction_status: 'processing' } : doc))
      setTimeout(async () => {
        await fetchDocuments()
        const detail = await documentsApi.getById(id)
        const investments = detail.data.extracted_data?.investments ?? []
        if (expandedId === id) setEditRows(investmentsToRows(investments))
      }, 4000)
    } catch {}
  }

  const toggleExpand = (doc: DocumentRecord) => {
    if (expandedId === doc.id) {
      setExpandedId(null)
      setEditRows([])
      setImportResult('')
      return
    }
    setExpandedId(doc.id)
    setImportResult('')
    const investments = doc.extracted_data?.investments ?? []
    setEditRows(investmentsToRows(investments))
  }

  // ── Edit helpers ─────────────────────────────────────────
  const updateRow = (i: number, field: keyof ExtractedRow, value: string) => {
    setEditRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  const deleteRow = (i: number) => {
    setEditRows(rows => rows.filter((_, idx) => idx !== i))
  }

  const addRow = () => {
    setEditRows(rows => [...rows, { ticker: '', shares: '', average_cost: '', security_type: 'stock', purchase_date: '', account_id: '' }])
  }

  // ── Import ────────────────────────────────────────────────
  const handleImport = async () => {
    if (!expandedId) return
    const valid = editRows.filter(r => r.ticker.trim() && Number(r.shares) > 0)
    if (valid.length === 0) {
      setImportResult('No valid rows to import. Make sure each row has a ticker and shares > 0.')
      return
    }
    setImporting(true)
    setImportResult('')
    try {
      const payload = valid.map(r => ({
        ticker: r.ticker.trim().toUpperCase(),
        shares: Number(r.shares),
        average_cost: Number(r.average_cost) || 0,
        security_type: r.security_type || 'stock',
        account_id: r.account_id ? Number(r.account_id) : null,
      }))
      const res = await documentsApi.importHoldings(expandedId, payload)
      setImportResult(res.data.message || `Imported ${payload.length} holding(s) successfully.`)
    } catch (err: any) {
      setImportResult(err?.response?.data?.detail || 'Import failed — check backend logs.')
    } finally {
      setImporting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6 max-w-5xl">
      {/* Back is handled by the global floating nav button. */}
      <header>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight">Upload Documents</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Upload tax forms, 401(k), Roth IRA, or brokerage statements — AI extracts tickers, shares, and costs automatically.
          </p>
        </div>
      </header>

      {/* Upload Card */}
      <Card id="upload-section" className="scroll-mt-4">
        <CardHeader><CardTitle>Upload a Document</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Document Type</label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                {DOCUMENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Link to Account (optional)</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">N/A — no account</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.account_name} ({a.account_type})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Take Photo — primary action on mobile, secondary on desktop */}
          <Button
            type="button"
            variant="outline"
            onClick={takePhoto}
            disabled={uploading}
            className="w-full h-11 flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Take Photo of Statement
          </Button>

          {/* Drop Zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-4 sm:p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/60'
            } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.csv,.txt,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={handleFileChange}
            />

            {imagePreview && !uploading ? (
              // Thumbnail preview while waiting for upload to start
              <div className="flex flex-col items-center gap-3 pointer-events-none">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-h-48 max-w-full rounded border object-contain shadow-sm"
                />
                <p className="text-xs text-muted-foreground">Click or drop to choose a different file</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 pointer-events-none">
                {/* Icon row: document + image */}
                <div className="flex items-center gap-3 text-muted-foreground">
                  <svg className="h-9 w-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-2xl text-muted-foreground/40">|</span>
                  <svg className="h-9 w-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                {uploading ? (
                  <p className="text-sm font-medium">Uploading &amp; extracting with AI… this can take a few seconds.</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      <span className="hidden sm:inline">Drag &amp; drop your file here, or click to browse</span>
                      <span className="sm:hidden">Tap to upload a document or photo</span>
                    </p>
                    <div className="hidden sm:block text-xs text-muted-foreground space-y-1">
                      <p><span className="font-medium">Documents:</span> PDF, CSV, TXT — 1099-B, 1099-DIV, brokerage &amp; bank statements</p>
                      <p><span className="font-medium">Images:</span> PNG, JPG, JPEG, WEBP — screenshots or photos of statements — AI extracts holdings automatically</p>
                      <p className="text-[11px] pt-0.5">Uses your configured AI provider. PDFs require Claude; on OpenAI, upload a photo/screenshot instead.</p>
                    </div>
                    <p className="sm:hidden text-[11px] text-muted-foreground">
                      PDF, CSV, TXT, PNG, JPG — AI extracts holdings automatically. PDFs require Claude.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {uploadSuccess && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{uploadSuccess}</p>
          )}
          {uploadError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{uploadError}</p>
          )}
        </CardContent>
      </Card>

      {/* Documents List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Uploaded Documents</CardTitle>
          <Button variant="outline" size="sm" onClick={fetchDocuments}>Refresh</Button>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {documents.map(doc => (
                <div key={doc.id} className="border rounded-lg overflow-hidden">
                  {/* Row header */}
                  <div
                    className="flex items-center justify-between gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleExpand(doc)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/\.(png|jpe?g|webp)$/i.test(doc.document_name) ? (
                        <svg className="h-5 w-5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.document_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {DOCUMENT_TYPES.find(t => t.value === doc.document_type)?.label || doc.document_type}
                          {' · '}{formatBytes(doc.file_size_bytes)}
                          {' · '}{doc.upload_date ? new Date(doc.upload_date).toLocaleDateString() : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {statusBadge(doc.extraction_status)}
                      <Button
                        variant="ghost" size="sm"
                        onClick={e => { e.stopPropagation(); handleReprocess(doc.id) }}
                        title="Re-extract with AI"
                      >↺</Button>
                      <Button
                        variant="ghost" size="sm"
                        onClick={e => { e.stopPropagation(); handleDeleteDoc(doc.id) }}
                        className="text-red-500 hover:text-red-700"
                        title="Delete document"
                      >✕</Button>
                      <span className="text-muted-foreground text-xs">{expandedId === doc.id ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded panel */}
                  {expandedId === doc.id && (
                    <div className="border-t bg-muted/10 p-4 space-y-4">
                      {doc.extraction_status === 'failed' && (
                        <p className="text-sm text-red-600">{doc.error_message || 'Extraction failed. Try re-extracting.'}</p>
                      )}
                      {doc.extraction_status === 'processing' && (
                        <p className="text-sm text-yellow-700">Still processing… Refresh in a moment.</p>
                      )}
                      {doc.extraction_status === 'pending' && (
                        <p className="text-sm text-muted-foreground">Not yet processed. Click ↺ to extract.</p>
                      )}

                      {(doc.extraction_status === 'completed' || editRows.length > 0) && (
                        <>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">
                              {editRows.length > 0
                                ? `${editRows.length} holding${editRows.length !== 1 ? 's' : ''} extracted — review and edit before importing`
                                : 'No holdings extracted — add rows manually below'}
                            </p>
                            <Button size="sm" variant="outline" onClick={addRow}>+ Add row</Button>
                          </div>

                          {/* When nothing was parsed, show the model's raw reply so
                              it's clear what the AI saw (bad read, refusal, etc.). */}
                          {editRows.length === 0 && doc.error_message && (
                            <div className="rounded-md border border-border bg-muted/40 p-2">
                              <p className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
                                {doc.error_message}
                              </p>
                            </div>
                          )}

                          {/* Editable table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                              <thead>
                                <tr className="bg-muted/50 text-left text-xs text-muted-foreground uppercase tracking-wide">
                                  <th className="px-2 py-2 font-medium">Ticker</th>
                                  <th className="px-2 py-2 font-medium">Shares</th>
                                  <th className="px-2 py-2 font-medium">Avg Cost ($)</th>
                                  <th className="px-2 py-2 font-medium">Type</th>
                                  <th className="px-2 py-2 font-medium">Account</th>
                                  <th className="px-2 py-2 font-medium">Purchase Date</th>
                                  <th className="px-2 py-2" />
                                </tr>
                              </thead>
                              <tbody>
                                {editRows.map((row, i) => (
                                  <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                                    <td className="px-2 py-1">
                                      <input
                                        type="text"
                                        value={row.ticker}
                                        onChange={e => updateRow(i, 'ticker', e.target.value.toUpperCase())}
                                        placeholder="AAPL"
                                        className="border rounded px-2 py-1 w-24 text-sm uppercase"
                                      />
                                    </td>
                                    <td className="px-2 py-1">
                                      <input
                                        type="number"
                                        value={row.shares}
                                        onChange={e => updateRow(i, 'shares', e.target.value)}
                                        placeholder="0"
                                        min="0"
                                        step="any"
                                        className="border rounded px-2 py-1 w-24 text-sm"
                                      />
                                    </td>
                                    <td className="px-2 py-1">
                                      <input
                                        type="number"
                                        value={row.average_cost}
                                        onChange={e => updateRow(i, 'average_cost', e.target.value)}
                                        placeholder="0.00"
                                        min="0"
                                        step="any"
                                        className="border rounded px-2 py-1 w-28 text-sm"
                                      />
                                    </td>
                                    <td className="px-2 py-1">
                                      <select
                                        value={row.security_type}
                                        onChange={e => updateRow(i, 'security_type', e.target.value)}
                                        className="border rounded px-2 py-1 text-sm"
                                      >
                                        {SECURITY_TYPES.map(t => (
                                          <option key={t} value={t}>{t.replace('_', ' ')}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-2 py-1">
                                      <select
                                        value={row.account_id}
                                        onChange={e => updateRow(i, 'account_id', e.target.value)}
                                        className="border rounded px-2 py-1 text-sm"
                                      >
                                        <option value="">N/A</option>
                                        {accounts.map(a => (
                                          <option key={a.id} value={a.id}>{a.account_name}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-2 py-1">
                                      <input
                                        type="date"
                                        value={row.purchase_date}
                                        onChange={e => updateRow(i, 'purchase_date', e.target.value)}
                                        className="border rounded px-2 py-1 text-sm"
                                      />
                                    </td>
                                    <td className="px-2 py-1 text-center">
                                      <button
                                        onClick={() => deleteRow(i)}
                                        className="text-gray-400 hover:text-red-500 text-lg leading-none px-1"
                                        title="Remove row"
                                      >×</button>
                                    </td>
                                  </tr>
                                ))}
                                {editRows.length === 0 && (
                                  <tr>
                                    <td colSpan={7} className="px-2 py-4 text-center text-sm text-muted-foreground">
                                      No rows &mdash; click &quot;+ Add row&quot; to add manually.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          {/* Import button + result */}
                          <div className="flex items-center gap-4">
                            <Button
                              onClick={handleImport}
                              disabled={importing || editRows.length === 0}
                            >
                              {importing ? 'Importing…' : `Import ${editRows.filter(r => r.ticker.trim() && Number(r.shares) > 0).length} holding(s) to Dashboard`}
                            </Button>
                            {importResult && (
                              <p className={`text-sm ${importResult.includes('failed') || importResult.includes('No valid') ? 'text-red-600' : 'text-green-700'}`}>
                                {importResult}
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Management — export, import, backups */}
      <div id="data-management-section" className="scroll-mt-4">
        <h2 className="text-xl font-semibold tracking-tight mb-4">Data Management</h2>
        <DataManagement onDataChanged={() => {}} />
      </div>
    </div>
  )
}
