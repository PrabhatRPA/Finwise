'use client'

// User preference for the bottom tab bar's placement:
//   'floating' — inset capsule hovering above the home indicator (default)
//   'attached' — full-width bar flush with the bottom edge
// Same localStorage + broadcast pattern as float-side.ts so the bar and the
// back/top floaters reposition live when the setting changes.

import { useEffect, useState } from 'react'

const KEY = 'tab_bar_style'
const EVENT = 'bar-style-change'

export type BarStyle = 'floating' | 'attached'

export function getBarStyle(): BarStyle {
  if (typeof window === 'undefined') return 'floating'
  try {
    return window.localStorage.getItem(KEY) === 'attached' ? 'attached' : 'floating'
  } catch {
    return 'floating'
  }
}

export function setBarStyle(style: BarStyle): void {
  try {
    window.localStorage.setItem(KEY, style)
    window.dispatchEvent(new Event(EVENT))
  } catch { /* ignore */ }
}

export function useBarStyle(): BarStyle {
  const [style, setStyle] = useState<BarStyle>('floating')
  useEffect(() => {
    setStyle(getBarStyle())
    const on = () => setStyle(getBarStyle())
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return style
}
