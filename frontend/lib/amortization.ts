// Pure amortization engine. No React, no formatting, no I/O, no dependencies.
//
// Every baseline and what-if scenario in the Debt tab comes from this one
// function so a comparison can never be produced by two implementations that
// drifted. See the Debt spec, Part 0, for the definitional math.
//
// Money is INTEGER CENTS throughout; rates are decimals (0.065 = 6.5%). Round
// only at display — except per-period interest, which is rounded to the nearest
// cent each month (as real servicers do) so balances stay whole cents and the
// lifetime interest total doesn't drift over 360 rows. The row loop is the
// source of truth; closed forms are used only for fast term derivation.
//
// Nothing here is mandatory to the app: callers pass whatever a debt actually
// has, and missing/invalid inputs return an empty schedule with a flag rather
// than throwing or looping — the UI then shows what it can.
//
// Out of scope (documented assumptions): prepayment penalties, PMI drop-off,
// escrow shortage/surplus reassessment, interest-only and adjustable-rate loans
// (callers must not feed those in as fixed-rate amortizing).

export type ISODate = string  // 'YYYY-MM-DD'

export type OneTimePayment = { date: ISODate; amount: number }  // amount in cents

export interface ScheduleInput {
  openingBalance: number          // cents, > 0
  annualRate: number              // decimal, >= 0
  termMonths: number              // > 0
  startDate: ISODate
  monthlyEscrow?: number          // cents, default 0
  escrowAnnualGrowth?: number     // decimal, default 0
  extraMonthlyPrincipal?: number  // cents, default 0
  extraOneTimePayments?: OneTimePayment[]
}

export interface AmortizationRow {
  periodIndex: number             // 1-based month number
  date: ISODate                   // date this payment lands (startDate + periodIndex months)
  openingBalance: number
  scheduledPI: number             // P&I due this month (opening+interest on the final partial row)
  interest: number
  principal: number               // scheduled principal (excludes extra)
  extraPrincipal: number
  escrow: number
  totalOutflow: number            // scheduledPI + extraPrincipal + escrow
  closingBalance: number
  cumulativeInterest: number
  cumulativePrincipal: number     // principal + extra, cumulative
  cumulativeEscrow: number
}

export interface ScheduleSummary {
  monthlyPI: number
  monthlyPITI: number             // monthlyPI + first-month escrow
  payoffDate: ISODate
  termMonthsActual: number
  totalPrincipal: number          // invariant: == openingBalance for any valid schedule
  totalInterest: number
  totalEscrow: number
  totalOutOfPocket: number        // principal + interest + escrow
  negativeAmortization: boolean   // scheduled P&I can't cover the monthly interest
  amortizable: boolean            // false when inputs are insufficient/invalid
}

export interface ScheduleResult {
  rows: AmortizationRow[]
  summary: ScheduleSummary
}

// Scheduled monthly principal & interest. Guards the i = 0 branch (0% promo
// balances) which would otherwise divide by zero.
export function computeMonthlyPI(openingBalance: number, annualRate: number, termMonths: number): number {
  if (openingBalance <= 0 || termMonths <= 0) return 0
  const i = (annualRate || 0) / 12
  if (i === 0) return Math.round(openingBalance / termMonths)
  const f = Math.pow(1 + i, termMonths)
  return Math.round((openingBalance * i * f) / (f - 1))
}

// Remaining term implied by a balance, rate, and scheduled payment. Used when a
// loan stores a payment amount rather than a term. Returns null when the
// payment can't cover the interest (loan never amortizes) or inputs are bad.
export function deriveTermMonths(openingBalance: number, annualRate: number, monthlyPI: number): number | null {
  if (openingBalance <= 0 || monthlyPI <= 0) return null
  const i = (annualRate || 0) / 12
  if (i === 0) return Math.ceil(openingBalance / monthlyPI)
  const iB = i * openingBalance
  if (monthlyPI <= iB) return null  // M ≤ i·B → never pays down
  return Math.max(1, Math.ceil(-Math.log(1 - iB / monthlyPI) / Math.log(1 + i)))
}

// Add whole months to an ISO date, clamping the day to the target month's last
// day (e.g. Jan 31 + 1mo → Feb 28/29). UTC to avoid tz drift.
export function addMonths(iso: ISODate, k: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number)
  const total = y * 12 + (m - 1) + k
  const ny = Math.floor(total / 12)
  const nm = ((total % 12) + 12) % 12  // 0-based month, normalized for negatives
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  const nd = Math.min(d, lastDay)
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`
}

function sameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

function emptyResult(startDate: ISODate, monthlyPI: number, monthlyEscrow: number, negAmort: boolean): ScheduleResult {
  return {
    rows: [],
    summary: {
      monthlyPI,
      monthlyPITI: monthlyPI + monthlyEscrow,
      payoffDate: startDate,
      termMonthsActual: 0,
      totalPrincipal: 0,
      totalInterest: 0,
      totalEscrow: 0,
      totalOutOfPocket: 0,
      negativeAmortization: negAmort,
      amortizable: false,
    },
  }
}

// Build the full month-by-month schedule. Interest accrues on the opening
// balance BEFORE any payment is applied. Extra payments reduce principal only —
// never escrow, never M — and simply shorten the term. The final payment is
// clamped so the balance lands exactly on zero (never negative).
export function generateAmortizationSchedule(input: ScheduleInput): ScheduleResult {
  const openingBalance = Math.round(input.openingBalance || 0)
  const annualRate = Math.max(0, input.annualRate || 0)
  const termMonths = Math.floor(input.termMonths || 0)
  const startDate = input.startDate
  const escrow0 = Math.max(0, Math.round(input.monthlyEscrow || 0))
  const escrowGrowth = Math.max(0, input.escrowAnnualGrowth || 0)
  const extraMonthly = Math.max(0, Math.round(input.extraMonthlyPrincipal || 0))
  const oneTimes = (input.extraOneTimePayments || [])
    .map((p) => ({ date: p.date, amount: Math.max(0, Math.round(p.amount || 0)) }))
    .filter((p) => p.amount > 0)

  const i = annualRate / 12
  const M = computeMonthlyPI(openingBalance, annualRate, termMonths)

  if (openingBalance <= 0 || M <= 0) return emptyResult(startDate, M, escrow0, false)

  // Negative amortization: the scheduled payment can't even cover the first
  // month's interest, so the balance would rise forever. Detect and bail with a
  // flag; the UI shows a warning instead of a line climbing to infinity.
  if (i > 0 && M <= Math.round(openingBalance * i)) return emptyResult(startDate, M, escrow0, true)

  const rows: AmortizationRow[] = []
  let balance = openingBalance
  let cumI = 0
  let cumP = 0
  let cumE = 0
  const MAX_PERIODS = termMonths + 1200  // safety cap; extra payments only shorten

  for (let k = 1; balance > 0 && k <= MAX_PERIODS; k++) {
    const opening = balance
    const interest = Math.round(opening * i)
    const date = addMonths(startDate, k)

    // Escrow is a pass-through: no interest, no principal effect. Optional annual
    // growth models tax/premium creep; flat by default. (Assumption noted: real
    // escrow is re-assessed at bill time — expensing it monthly smooths the
    // series and matches perceived cash flow; do not track it as an asset.)
    const yearsElapsed = Math.floor((k - 1) / 12)
    const escrow = escrowGrowth > 0
      ? Math.round(escrow0 * Math.pow(1 + escrowGrowth, yearsElapsed))
      : escrow0

    let oneTime = 0
    for (const p of oneTimes) if (sameMonth(p.date, date)) oneTime += p.amount
    let extra = extraMonthly + oneTime

    let scheduledPI: number
    let principal: number
    let closing: number

    if (opening + interest <= M + extra || k >= termMonths) {
      // Final payment: retire the balance exactly. This fires either when the
      // remaining balance is small enough to clear (early payoff via extra), or
      // when we reach the scheduled term — the last scheduled payment absorbs
      // the cent-rounding residual so a 30-year loan pays off in exactly 360
      // months (as servicers do), not a stray 361st cleanup payment.
      scheduledPI = opening + interest
      principal = opening
      extra = 0
      closing = 0
    } else {
      scheduledPI = M
      principal = M - interest
      if (opening - principal - extra <= 0) {
        // Extra clears the remainder this month.
        extra = opening - principal
        closing = 0
      } else {
        closing = opening - principal - extra
      }
    }

    cumI += interest
    cumP += principal + extra
    cumE += escrow

    rows.push({
      periodIndex: k,
      date,
      openingBalance: opening,
      scheduledPI,
      interest,
      principal,
      extraPrincipal: extra,
      escrow,
      totalOutflow: scheduledPI + extra + escrow,
      closingBalance: closing,
      cumulativeInterest: cumI,
      cumulativePrincipal: cumP,
      cumulativeEscrow: cumE,
    })
    balance = closing
  }

  const last = rows[rows.length - 1]
  return {
    rows,
    summary: {
      monthlyPI: M,
      monthlyPITI: M + escrow0,
      payoffDate: last ? last.date : startDate,
      termMonthsActual: rows.length,
      totalPrincipal: cumP,       // == openingBalance (asserted in tests)
      totalInterest: cumI,
      totalEscrow: cumE,
      totalOutOfPocket: cumP + cumI + cumE,
      negativeAmortization: false,
      amortizable: true,
    },
  }
}
