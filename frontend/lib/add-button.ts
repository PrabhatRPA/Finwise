'use client'

// User preference for the quick-add "+" bubble that floats above the bottom
// tab bar on add-capable dashboard views (holdings / accounts / watchlist /
// debts / properties):
//   'show' — the + bubble is rendered (default)
//   'hide' — no + bubble; each view's own "+ Add" button still works
// Same localStorage + broadcast pattern as bar-style.ts / float-side.ts so
// the bar updates live when the setting changes.

import { useEffect, useState } from 'react'

const KEY = 'add_button'
const EVENT = 'add-button-change'

export type AddButtonPref = 'show' | 'hide'

export function getAddButtonPref(): AddButtonPref {
  if (typeof window === 'undefined') return 'show'
  try {
    return window.localStorage.getItem(KEY) === 'hide' ? 'hide' : 'show'
  } catch {
    return 'show'
  }
}

export function setAddButtonPref(pref: AddButtonPref): void {
  try {
    window.localStorage.setItem(KEY, pref)
    window.dispatchEvent(new Event(EVENT))
  } catch { /* ignore */ }
}

export function useAddButtonPref(): AddButtonPref {
  const [pref, setPref] = useState<AddButtonPref>('show')
  useEffect(() => {
    setPref(getAddButtonPref())
    const on = () => setPref(getAddButtonPref())
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return pref
}
