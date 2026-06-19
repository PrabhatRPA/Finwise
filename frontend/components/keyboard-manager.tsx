'use client'

// Fixes the iOS keyboard UX in the Capacitor build:
//
//   1. The software keyboard slides up but the WebView doesn't scroll the
//      focused field into view, so you can't see what you're typing.
//   2. Capacitor hides the native input accessory bar on iPhone by default,
//      so there's no "Done" button to dismiss the keyboard.
//
// This component (mounted once in the root layout) registers global keyboard
// listeners on native only — it's a no-op on web/desktop.

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

export function KeyboardManager() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let listeners: { remove: () => void }[] = []
    let cancelled = false

    ;(async () => {
      const { Keyboard } = await import('@capacitor/keyboard')
      if (cancelled) return

      // Show the native accessory bar so the keyboard has a "Done" button.
      try { await Keyboard.setAccessoryBarVisible({ isVisible: true }) } catch {}

      // When the keyboard is about to show, scroll the focused element into
      // the centre of the (now shorter) viewport so it isn't hidden behind
      // the keyboard. A short delay lets the body resize settle first.
      const onShow = await Keyboard.addListener('keyboardWillShow', () => {
        setTimeout(() => {
          const el = document.activeElement as HTMLElement | null
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }
        }, 100)
      })
      listeners.push(onShow)
    })()

    return () => {
      cancelled = true
      listeners.forEach((l) => l.remove())
    }
  }, [])

  return null
}
