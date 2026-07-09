import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getRegion } from '@/lib/region'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// All money/number formatting follows the market selected in Settings →
// Market & Currency (default US → USD/en-US, identical to the old hardcoded
// behavior). getRegion() is SSR-safe (returns the US default off-window).

export function formatCurrency(amount: number) {
  const r = getRegion()
  return new Intl.NumberFormat(r.locale, {
    style: 'currency',
    currency: r.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// Whole-unit variant for chart axes/tooltips (no decimals).
export function formatCurrencyWhole(amount: number) {
  const r = getRegion()
  return new Intl.NumberFormat(r.locale, {
    style: 'currency',
    currency: r.currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(amount: number) {
  return new Intl.NumberFormat(getRegion().locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatPercent(amount: number) {
  return new Intl.NumberFormat(getRegion().locale, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / 100)
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat(getRegion().locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}
