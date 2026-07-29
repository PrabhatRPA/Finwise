// On-device loans / debts CRUD. Mirrors backend/app/api/v1/loans.py.
//
// Amortization: installment loans (mortgage, auto, student, personal,
// home_equity, business) are paid down over time. Given the entered balance,
// interest rate, and monthly payment, we estimate the balance TODAY by applying
// each month's payment (interest first, remainder to principal) forward from
// when the balance was last entered (updated_at). This makes net worth improve
// realistically as debts are paid, without the user re-typing the balance each
// month. Revolving debts (credit cards, lines of credit) are NOT amortized —
// their balance depends on spending, so we keep whatever the user entered.

import { all, get, run } from './db'
import { requireSessionUserId } from './session'
import { generateAmortizationSchedule, deriveTermMonths, type ScheduleInput } from '../amortization'

const AMORTIZING_TYPES = new Set(['mortgage', 'auto', 'student', 'personal', 'home_equity', 'business'])
// Property-secured debts — the only ones that carry an escrow (tax + insurance).
export const ESCROW_TYPES = new Set(['mortgage', 'home_equity'])

const toCents = (dollars: any) => Math.round((Number(dollars) || 0) * 100)
const isoToday = () => new Date().toISOString().slice(0, 10)

// Map a loan record to the amortization engine's input (integer cents), deriving
// the remaining term from balance + rate + payment. Returns null when the loan
// can't be amortized (revolving type, no positive payment, or payment ≤ interest)
// so callers render what they have rather than a fabricated schedule. Nothing
// here is required of the user beyond a balance, rate, and payment they already
// enter; escrow/extras default to 0.
export function loanScheduleInput(loan: any, opts?: {
  extraMonthlyPrincipal?: number                       // dollars
  extraOneTimePayments?: { date: string; amount: number }[]  // amount in dollars
  startDate?: string
}): ScheduleInput | null {
  const balance = toCents(loan.current_balance ?? loan.entered_balance ?? 0)
  const annualRate = (Number(loan.interest_rate ?? 0) || 0) / 100   // stored as percent
  const pmt = toCents(loan.monthly_payment ?? 0)
  const type = String(loan.loan_type || '')
  if (balance <= 0 || pmt <= 0 || !AMORTIZING_TYPES.has(type)) return null
  const term = deriveTermMonths(balance, annualRate, pmt)
  if (term == null) return null
  return {
    openingBalance: balance,
    annualRate,
    termMonths: term,
    startDate: opts?.startDate ?? isoToday(),
    monthlyEscrow: toCents(loan.monthly_escrow ?? 0),
    escrowAnnualGrowth: Number(loan.escrow_annual_growth ?? 0) || 0,
    extraMonthlyPrincipal: toCents(opts?.extraMonthlyPrincipal ?? 0),
    extraOneTimePayments: (opts?.extraOneTimePayments ?? []).map((p) => ({ date: p.date, amount: toCents(p.amount) })),
  }
}

// Full schedule for a loan via the shared engine. null when not amortizable.
export function loanSchedule(loan: any, opts?: Parameters<typeof loanScheduleInput>[1]) {
  const input = loanScheduleInput(loan, opts)
  return input ? generateAmortizationSchedule(input) : null
}

// PITI breakdown (dollars) for display. Escrow defaults to 0, so PITI == P&I for
// existing and non-property debts — the identical code path, no special-casing.
export function loanPITI(loan: any): {
  pi: number; escrow: number; piti: number; nextPrincipal: number; nextInterest: number
} | null {
  const pmt = loan.monthly_payment == null || loan.monthly_payment === '' ? null : Number(loan.monthly_payment)
  if (pmt == null || !(pmt > 0)) return null
  const escrow = Number(loan.monthly_escrow ?? 0) || 0
  const a = amortizeLoan(loan)
  return { pi: pmt, escrow, piti: pmt + escrow, nextPrincipal: a.next_principal, nextInterest: a.next_interest }
}

// Whole calendar months elapsed from an ISO/SQL datetime to `asOf`.
function monthsElapsed(fromRaw: string | null | undefined, asOf: Date): number {
  if (!fromRaw) return 0
  const s = String(fromRaw)
  const from = new Date((s.includes('T') ? s : s.replace(' ', 'T')).replace(/Z?$/, 'Z'))
  if (isNaN(from.getTime())) return 0
  let m = (asOf.getFullYear() - from.getFullYear()) * 12 + (asOf.getMonth() - from.getMonth())
  if (asOf.getDate() < from.getDate()) m -= 1  // not a full month yet
  return Math.max(0, m)
}

export interface LoanAmortization {
  effective_balance: number   // estimated balance today after payments applied
  entered_balance: number     // what the user last entered (the anchor)
  amortizing: boolean         // whether amortization was applied
  months_elapsed: number
  principal_paid: number      // principal paid since the anchor date
  interest_paid: number       // interest paid since the anchor date
  next_interest: number       // interest portion of the next scheduled payment
  next_principal: number      // principal portion of the next scheduled payment
}

// Estimate a loan's amortized state. Pure/synchronous — safe to reuse anywhere.
export function amortizeLoan(loan: any, asOf: Date = new Date()): LoanAmortization {
  const entered = Number(loan.current_balance ?? 0) || 0
  const rate = loan.interest_rate == null || loan.interest_rate === '' ? null : Number(loan.interest_rate)
  const pmt = loan.monthly_payment == null || loan.monthly_payment === '' ? null : Number(loan.monthly_payment)
  const type = String(loan.loan_type || '')
  const anchor = loan.updated_at || loan.created_at || loan.start_date

  const out: LoanAmortization = {
    effective_balance: Math.max(0, entered),
    entered_balance: entered,
    amortizing: false,
    months_elapsed: 0,
    principal_paid: 0,
    interest_paid: 0,
    next_interest: 0,
    next_principal: 0,
  }
  if (entered <= 0) return out

  const r = rate != null && rate > 0 ? (rate / 100) / 12 : 0
  if (pmt != null && pmt > 0) {
    const interest = entered * r
    out.next_interest = Math.min(pmt, Math.max(0, interest))
    out.next_principal = Math.max(0, pmt - out.next_interest)
  }

  if (!AMORTIZING_TYPES.has(type) || pmt == null || pmt <= 0) return out

  const months = monthsElapsed(anchor, asOf)
  out.months_elapsed = months
  if (months <= 0) return out

  let b = entered
  for (let i = 0; i < months; i++) {
    const interest = b * r
    const principal = pmt - interest
    if (principal <= 0) break            // payment doesn't cover interest → stop (no negative amort)
    const applied = Math.min(principal, b)
    b -= applied
    out.principal_paid += applied
    out.interest_paid += interest
    if (b <= 0) { b = 0; break }
  }
  out.effective_balance = Math.max(0, b)
  out.amortizing = true
  return out
}

// Convenience: just the estimated balance today (used by net-worth aggregation).
export function effectiveLoanBalance(loan: any, asOf: Date = new Date()): number {
  return amortizeLoan(loan, asOf).effective_balance
}

// ── Debt payoff projection (Debt-Free Countdown chart) ──────────────────────
// Walks every payable loan's balance forward month-by-month from its current
// (amortized) balance until zero. Returns the monthly total-debt series plus
// each loan's estimated payoff date. Loans without a positive monthly payment
// (or whose payment doesn't cover interest) can never reach zero — they're
// returned in `unpayable` so the UI can call them out instead of projecting
// a lie.
export interface DebtProjection {
  months: { date: string; total: number }[]        // YYYY-MM, starting this month
  payoffs: { loan_name: string; date: string; months: number }[]
  unpayable: { loan_name: string; reason: string }[]
  debtFreeDate: string | null                      // YYYY-MM when total first hits 0
}

export function projectDebtSchedule(loans: any[], maxMonths = 480): DebtProjection {
  const now = new Date()
  const monthLabel = (i: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  interface Track { name: string; bal: number; r: number; pmt: number; paidOffAt: number | null }
  const tracks: Track[] = []
  const unpayable: DebtProjection['unpayable'] = []

  for (const l of loans) {
    if (l.status && l.status !== 'active') continue
    const bal = effectiveLoanBalance(l)
    if (bal <= 0) continue
    const pmt = Number(l.monthly_payment ?? 0)
    const r = (Number(l.interest_rate ?? 0) / 100) / 12
    if (!(pmt > 0)) {
      unpayable.push({ loan_name: l.loan_name, reason: 'no monthly payment set' })
      continue
    }
    if (pmt <= bal * r) {
      unpayable.push({ loan_name: l.loan_name, reason: 'payment doesn’t cover interest' })
      continue
    }
    tracks.push({ name: l.loan_name, bal, r, pmt, paidOffAt: null })
  }

  const months: DebtProjection['months'] = []
  const total0 = tracks.reduce((s, t) => s + t.bal, 0)
  months.push({ date: monthLabel(0), total: total0 })

  let i = 0
  while (i < maxMonths && tracks.some((t) => t.bal > 0)) {
    i++
    for (const t of tracks) {
      if (t.bal <= 0) continue
      const interest = t.bal * t.r
      const principal = Math.min(t.pmt - interest, t.bal)
      t.bal = Math.max(0, t.bal - principal)
      if (t.bal === 0 && t.paidOffAt === null) t.paidOffAt = i
    }
    months.push({ date: monthLabel(i), total: tracks.reduce((s, t) => s + t.bal, 0) })
  }

  const payoffs = tracks
    .filter((t) => t.paidOffAt !== null)
    .map((t) => ({ loan_name: t.name, date: monthLabel(t.paidOffAt!), months: t.paidOffAt! }))
    .sort((a, b) => a.months - b.months)

  const debtFree = months.find((m) => m.total <= 0)
  return {
    months,
    payoffs,
    unpayable,
    debtFreeDate: debtFree && tracks.length > 0 ? debtFree.date : null,
  }
}

export const nativeLoansApi = {
  getAll: async (includePaidOff = false) => {
    const userId = await requireSessionUserId()
    const sql = includePaidOff
      ? `SELECT * FROM loans WHERE user_id = ? ORDER BY id DESC`
      : `SELECT * FROM loans WHERE user_id = ? AND status = 'active' ORDER BY id DESC`
    const rows = await all<any>(sql, [userId])
    const now = new Date()
    // Enrich each loan with its amortized state. current_balance becomes the
    // estimated balance today (so the debts table and net worth agree); the
    // originally entered value is preserved as entered_balance.
    const loans = rows.map((r) => {
      const a = amortizeLoan(r, now)
      return {
        ...r,
        current_balance: a.effective_balance,
        entered_balance: a.entered_balance,
        principal_paid_to_date: a.principal_paid,
        interest_paid_to_date: a.interest_paid,
        next_interest: a.next_interest,
        next_principal: a.next_principal,
        amortizing: a.amortizing,
      }
    })
    const total_debt = loans.reduce((s: number, r: any) => s + (r.current_balance ?? 0), 0)
    return { data: { loans, total_debt } }
  },

  create: async (data: any) => {
    const userId = await requireSessionUserId()
    if (!data.loan_name) throw badRequest('loan_name is required')
    if (!data.loan_type) throw badRequest('loan_type is required')
    const original = toNum(data.original_balance)
    if (!isFinite(original) || original < 0) throw badRequest('original_balance must be a non-negative number')
    const res = await run(
      `INSERT INTO loans (
         user_id, loan_name, loan_type, original_balance, current_balance,
         interest_rate, monthly_payment, monthly_escrow, escrow_annual_growth,
         lender_name, due_day, end_date
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        data.loan_name,
        data.loan_type,
        original,
        toNumOrDefault(data.current_balance, original),
        toNumOrNull(data.interest_rate),
        toNumOrNull(data.monthly_payment),
        toNumOrDefault(data.monthly_escrow, 0),
        toNumOrDefault(data.escrow_annual_growth, 0),
        data.lender_name ?? null,
        data.due_day ?? null,
        data.end_date ?? null,
      ],
    )
    const row = await get(`SELECT * FROM loans WHERE id = ?`, [res.lastId])
    return { data: row }
  },

  update: async (id: number, data: any) => {
    const userId = await requireSessionUserId()
    const fields = [
      'loan_name', 'loan_type', 'original_balance', 'current_balance',
      'interest_rate', 'monthly_payment', 'monthly_escrow', 'escrow_annual_growth',
      'lender_name', 'due_day', 'end_date', 'status',
    ]
    const sets: string[] = []
    const params: any[] = []
    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(`${f} = ?`)
        params.push(data[f])
      }
    }
    if (sets.length === 0) {
      const row = await get(`SELECT * FROM loans WHERE id = ? AND user_id = ?`, [id, userId])
      return { data: row }
    }
    sets.push(`updated_at = CURRENT_TIMESTAMP`)
    params.push(id, userId)
    await run(`UPDATE loans SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params)
    const row = await get(`SELECT * FROM loans WHERE id = ? AND user_id = ?`, [id, userId])
    return { data: row }
  },

  delete: async (id: number) => {
    const userId = await requireSessionUserId()
    await run(`DELETE FROM loans WHERE id = ? AND user_id = ?`, [id, userId])
    return { data: { success: true } }
  },
}

function toNum(v: any): number {
  const n = Number(v)
  return isFinite(n) ? n : 0
}
function toNumOrNull(v: any): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}
function toNumOrDefault(v: any, def: number): number {
  if (v == null || v === '') return def
  const n = Number(v)
  return isFinite(n) ? n : def
}
function badRequest(msg: string) {
  const err = new Error(msg) as any
  err.response = { status: 400, data: { detail: msg } }
  return err
}
