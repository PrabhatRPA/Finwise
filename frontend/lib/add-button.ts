'use client'

// User preference for the quick-add "+" bubble that floats above the bottom
// tab bar on add-capable dashboard views (holdings / accounts / watchlist /
// debts / properties):
//   'show' — the + bubble is rendered
//   'hide' — no + bubble; each view's own "+ Add" button still works (default)
// Same localStorage + broadcast pattern as bar-style.ts / float-side.ts so
// the bar updates live when the setting changes.

import { useEffect, useState } from 'react'

const KEY = 'add_button'
const EVENT = 'add-button-change'

export type AddButtonPref = 'show' | 'hide'

export function getAddButtonPref(): AddButtonPref {
  if (typeof window === 'undefined') return 'hide'
  try {
    return window.localStorage.getItem(KEY) === 'show' ? 'show' : 'hide'
  } catch {
    return 'hide'
  }
}

export function setAddButtonPref(pref: AddButtonPref): void {
  try {
    window.localStorage.setItem(KEY, pref)
    window.dispatchEvent(new Event(EVENT))
  } catch { /* ignore */ }
}

export function useAddButtonPref(): AddButtonPref {
  const [pref, setPref] = useState<AddButtonPref>('hide')
  useEffect(() => {
    setPref(getAddButtonPref())
    const on = () => setPref(getAddButtonPref())
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return pref
}
