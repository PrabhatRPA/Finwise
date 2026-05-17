// On-device document upload — metadata only.
//
// Phase 1 (now): store the filename / type / account_id row in SQLite so the
//   user can see what they uploaded. Mark the row immediately as
//   `failed` with a clear message — the upload polling loop in
//   app/documents/page.tsx watches for that status and stops.
// Phase 2 (later): actually persist the file bytes via @capacitor/filesystem,
//   run on-device OCR (iOS Vision framework via a Capacitor plugin), then
//   feed the extracted text into nativeAiApi.documentExtraction.

import { all, get, run } from './db'
import { requireSessionUserId } from './session'

const PENDING_MESSAGE =
  'Document saved on your device. Automatic data extraction (OCR + AI parsing) ' +
  'is not yet available on iOS — coming in a future update. You can still add ' +
  'holdings manually from the Dashboard.'

export const nativeDocumentsApi = {
  upload: async (file: File, type: string, accountId?: number) => {
    const userId = await requireSessionUserId()
    const res = await run(
      `INSERT INTO documents (
         user_id, account_id, document_type, document_name,
         file_size_bytes, extraction_status, error_message
       ) VALUES (?, ?, ?, ?, ?, 'failed', ?)`,
      [
        userId,
        accountId ?? null,
        type,
        file.name,
        file.size ?? 0,
        PENDING_MESSAGE,
      ],
    )
    // Match the FastAPI response: { document_id, status, message } so the
    // upload UI's `res.data.document_id ?? res.data.id` works either way.
    return {
      data: {
        document_id: res.lastId,
        id: res.lastId,
        status: 'failed',
        message: PENDING_MESSAGE,
      },
    }
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
    const row = await get<any>(
      `SELECT * FROM documents WHERE id = ? AND user_id = ?`,
      [id, userId],
    )
    if (!row) throw notFound()
    // The upload poller reads .data.extraction_status and .data.extracted_data
    // directly; FastAPI returns them at the top level so we do too.
    return {
      data: {
        ...row,
        extracted_data: row.extracted_data ? safeParse(row.extracted_data) : null,
      },
    }
  },

  delete: async (id: number) => {
    const userId = await requireSessionUserId()
    await run(`DELETE FROM documents WHERE id = ? AND user_id = ?`, [id, userId])
    return { data: { success: true } }
  },

  process: async (id: number) => {
    // No-op retry — same Phase 2 limitation.
    const userId = await requireSessionUserId()
    await run(
      `UPDATE documents SET extraction_status = 'failed', error_message = ?
       WHERE id = ? AND user_id = ?`,
      [PENDING_MESSAGE, id, userId],
    )
    return { data: { status: 'failed', message: PENDING_MESSAGE } }
  },

  importHoldings: async (_id: number, _holdings: any[]) => {
    throw notImplemented('Document-driven import')
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
function notImplemented(name: string) {
  const err = new Error(`${name} not yet available on iOS`) as any
  err.response = { status: 501, data: { detail: `${name} not yet available on iOS` } }
  return err
}
