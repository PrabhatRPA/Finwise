// On-device document → holdings extraction for the iOS build.
//
// The uploaded file (photo / screenshot / PDF / CSV / TXT) is sent straight to
// the user's configured AI provider (Claude or OpenAI) via extractHoldingsFromDocument
// in ai.ts — no backend, no separate OCR step. The model returns a JSON array of
// holdings which we store on the document row; the documents page then shows an
// editable review list and imports the chosen rows into holdings.
//
// Bytes are persisted to the app's Data directory so "reprocess" can re-run and
// the file is retained.

import { all, get, run } from './db'
import { requireSessionUserId } from './session'
import { extractHoldingsFromDocument, type DocInput } from './ai'
import { nativeHoldingsApi } from './holdings'

const DOC_DIR = 'documents'

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectKind(name: string, mime?: string): { kind: DocInput['kind']; mediaType: string } {
  const ext = (name.split('.').pop() || '').toLowerCase()
  const m = (mime || '').toLowerCase()
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    const mediaType = m.startsWith('image/')
      ? m
      : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
    return { kind: 'image', mediaType }
  }
  if (m === 'application/pdf' || ext === 'pdf') return { kind: 'pdf', mediaType: 'application/pdf' }
  return { kind: 'text', mediaType: 'text/plain' }  // csv, txt, and anything else
}

// ArrayBuffer → base64, chunked so large statements don't blow the call stack.
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

function okResult(id: number, message: string, status = 'completed') {
  return { data: { document_id: id, id, status, message } }
}

async function markFailed(id: number, userId: number, message: string) {
  await run(
    `UPDATE documents SET extraction_status = 'failed', error_message = ? WHERE id = ? AND user_id = ?`,
    [message, id, userId],
  )
}

async function runExtraction(
  id: number,
  userId: number,
  input: DocInput,
): Promise<{ data: { document_id: number; id: number; status: string; message: string } }> {
  try {
    const { investments } = await extractHoldingsFromDocument(input)
    await run(
      `UPDATE documents SET extraction_status = 'completed', extracted_data = ?, error_message = NULL
       WHERE id = ? AND user_id = ?`,
      [JSON.stringify({ investments }), id, userId],
    )
    const msg = investments.length > 0
      ? `Extracted ${investments.length} holding(s). Review and import below.`
      : 'No holdings were found in this document. You can add them manually from the Dashboard.'
    return okResult(id, msg)
  } catch (e: any) {
    const msg = e?.response?.data?.detail || e?.message || 'AI extraction failed. Please try again.'
    await markFailed(id, userId, msg)
    return okResult(id, msg, 'failed')
  }
}

// ── Public API (matches the FastAPI documentsApi shape) ──────────────────────

export const nativeDocumentsApi = {
  upload: async (file: File, type: string, accountId?: number) => {
    const userId = await requireSessionUserId()
    const { kind, mediaType } = detectKind(file.name, file.type)

    const ins = await run(
      `INSERT INTO documents (
         user_id, account_id, document_type, document_name,
         file_size_bytes, extraction_status
       ) VALUES (?, ?, ?, ?, ?, 'processing')`,
      [userId, accountId ?? null, type, file.name, file.size ?? 0],
    )
    const docId = ins.lastId

    // Read bytes / text.
    let base64: string | undefined
    let text: string | undefined
    try {
      if (kind === 'text') text = await file.text()
      else base64 = await fileToBase64(file)
    } catch {
      await markFailed(docId, userId, 'Could not read the selected file.')
      return okResult(docId, 'Could not read the selected file.', 'failed')
    }

    // Persist for reprocess / retention (best-effort).
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      try { await Filesystem.mkdir({ path: DOC_DIR, directory: Directory.Data, recursive: true }) } catch {}
      const path = `${DOC_DIR}/${docId}_${file.name}`
      if (kind === 'text') {
        await Filesystem.writeFile({ path, data: text ?? '', directory: Directory.Data, encoding: Encoding.UTF8 })
      } else {
        await Filesystem.writeFile({ path, data: base64 ?? '', directory: Directory.Data })  // base64 bytes
      }
      await run(`UPDATE documents SET document_path = ? WHERE id = ? AND user_id = ?`, [path, docId, userId])
    } catch { /* persistence is best-effort; extraction can still proceed */ }

    return runExtraction(docId, userId, { kind, base64, mediaType, text })
  },

  getAll: async () => {
    const userId = await requireSessionUserId()
    const rows = await all(
      `SELECT * FROM documents WHERE user_id = ? ORDER BY upload_date DESC, id DESC`,
      [userId],
    )
    return { data: { documents: rows } }
  },

  getById: async (id: number) => {
    const userId = await requireSessionUserId()
    const row = await get<any>(`SELECT * FROM documents WHERE id = ? AND user_id = ?`, [id, userId])
    if (!row) throw notFound()
    return {
      data: {
        ...row,
        extracted_data: row.extracted_data ? safeParse(row.extracted_data) : null,
      },
    }
  },

  delete: async (id: number) => {
    const userId = await requireSessionUserId()
    const row = await get<any>(`SELECT document_path FROM documents WHERE id = ? AND user_id = ?`, [id, userId])
    if (row?.document_path) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        await Filesystem.deleteFile({ path: row.document_path, directory: Directory.Data })
      } catch { /* file may already be gone */ }
    }
    await run(`DELETE FROM documents WHERE id = ? AND user_id = ?`, [id, userId])
    return { data: { success: true } }
  },

  // Retry: re-read the persisted file and run extraction again.
  process: async (id: number) => {
    const userId = await requireSessionUserId()
    const row = await get<any>(`SELECT * FROM documents WHERE id = ? AND user_id = ?`, [id, userId])
    if (!row) throw notFound()
    await run(`UPDATE documents SET extraction_status = 'processing' WHERE id = ? AND user_id = ?`, [id, userId])

    if (!row.document_path) {
      const msg = 'The original file is no longer on this device. Please upload it again.'
      await markFailed(id, userId, msg)
      return okResult(id, msg, 'failed')
    }

    const { kind, mediaType } = detectKind(row.document_name, undefined)
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
      let base64: string | undefined
      let text: string | undefined
      if (kind === 'text') {
        const r = await Filesystem.readFile({ path: row.document_path, directory: Directory.Data, encoding: Encoding.UTF8 })
        text = typeof r.data === 'string' ? r.data : ''
      } else {
        const r = await Filesystem.readFile({ path: row.document_path, directory: Directory.Data })
        base64 = typeof r.data === 'string' ? r.data : ''
      }
      return runExtraction(id, userId, { kind, base64, mediaType, text })
    } catch (e: any) {
      const msg = e?.message || 'Could not re-read the file.'
      await markFailed(id, userId, msg)
      return okResult(id, msg, 'failed')
    }
  },

  // Insert the user-reviewed holdings into the portfolio.
  importHoldings: async (_id: number, holdings: any[]) => {
    let count = 0
    for (const h of holdings || []) {
      try { await nativeHoldingsApi.create(h); count++ } catch { /* skip bad rows */ }
    }
    return { data: { message: `Imported ${count} holding(s).`, imported: count } }
  },
}

function safeParse(s: string) {
  try { return JSON.parse(s) } catch { return null }
}

function notFound() {
  const err = new Error('Not found') as any
  err.response = { status: 404, data: { detail: 'Not found' } }
  return err
}
