'use client'

// Makes the iOS software keyboard behave like a native app's:
//
//   1. resize: 'native' (capacitor.config.ts) shrinks the WebView above the
//      keyboard so centered / full-height layouts reflow up on their own.
//   2. This manager then scrolls the focused field into the visible area — both
//      when the keyboard opens and when the user taps a different field while
//      it's already up (covers long forms and in-card modals).
//   3. Exposes the keyboard height as a CSS var (--keyboard-height) for any
//      component that wants to pad itself.
//   4. Shows the native accessory bar so there's a "Done" button to dismiss.
//
// No-op on web / desktop.

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

export function KeyboardManager() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const root = document.documentElement
    const listeners: { remove: () => void }[] = []
    let cancelled = false

    // Bring the focused input into view once layout has settled. rAF + a short
    // timeout lets the native resize + reflow finish first, otherwise we'd
    // scroll against the pre-resize geometry.
    const scrollFocusedIntoView = () => {
      const el = document.activeElement as HTMLElement | null
      if (!el || typeof el.scrollIntoView !== 'function') return
      const tag = el.tagName
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return
      requestAnimationFrame(() => {
        setTimeout(() => {
          try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch {}
        }, 60)
      })
    }

    // Re-focus into view when tapping another field while the keyboard is up.
    const onFocusIn = () => scrollFocusedIntoView()
    document.addEventListener('focusin', onFocusIn)

    ;(async () => {
      const { Keyboard } = await import('@capacitor/keyboard')
      if (cancelled) return

      // "Done" / prev-next accessory bar (hidden by default on iPhone).
      try { await Keyboard.setAccessoryBarVisible({ isVisible: true }) } catch {}

      listeners.push(
        await Keyboard.addListener('keyboardWillShow', (info) => {
          root.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`)
          root.classList.add('keyboard-open')
          scrollFocusedIntoView()
        }),
        // keyboardDidShow fires after the keyboard is fully up — a second scroll
        // here catches cases where the first ran too early.
        await Keyboard.addListener('keyboardDidShow', () => scrollFocusedIntoView()),
        await Keyboard.addListener('keyboardWillHide', () => {
          root.style.setProperty('--keyboard-height', '0px')
          root.classList.remove('keyboard-open')
        }),
      )
    })()

    return () => {
      cancelled = true
      document.removeEventListener('focusin', onFocusIn)
      listeners.forEach((l) => l.remove())
      root.style.removeProperty('--keyboard-height')
      root.classList.remove('keyboard-open')
    }
  }, [])

  return null
}
