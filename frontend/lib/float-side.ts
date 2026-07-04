'use client'

// User preference for which side the floating navigation buttons (scroll-to-top
// + back) sit on — 'left' for left-handed users, 'right' for right-handed.
// Stored in localStorage so it can be read synchronously without an async flash;
// changes broadcast via a window event so the floating buttons reposition live.

import { useEffect, useState } from 'react'

const KEY = 'float_side'
const EVENT = 'float-side-change'

export type FloatSide = 'left' | 'right' | 'hide'

export function getFloatSide(): FloatSide {
  if (typeof window === 'undefined') return 'right'
  try {
    const v = window.localStorage.getItem(KEY)
    return v === 'left' || v === 'hide' ? v : 'right'
  } catch {
    return 'right'
  }
}

export function setFloatSide(side: FloatSide): void {
  try {
    window.localStorage.setItem(KEY, side)
    window.dispatchEvent(new Event(EVENT))
  } catch { /* ignore */ }
}

// Reads the preference and re-renders when it changes anywhere in the app.
// Starts at 'right' (matches SSR) and hydrates the real value on mount to avoid
// a hydration mismatch.
export function useFloatSide(): FloatSide {
  const [side, setSide] = useState<FloatSide>('right')
  useEffect(() => {
    setSide(getFloatSide())
    const on = () => setSide(getFloatSide())
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return side
}
