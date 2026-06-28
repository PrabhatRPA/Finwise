'use client'

// Hides the native splash screen the moment the web app has actually painted,
// instead of relying on a blind timeout. capacitor.config.ts sets
// launchAutoHide: false so the branded splash (#1a1a2e) stays up through the
// whole cold-start — native launch + WebView spawn + first React paint — with
// no black gap in between. Without this, the splash auto-hid after a fixed
// 2 s while the WebView was often still booting, leaving a black screen until
// React mounted. No-op on web / desktop.

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

export function SplashHider() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false

    const hide = async () => {
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        if (!cancelled) await SplashScreen.hide()
      } catch {
        // best-effort — never let a splash failure block the app
      }
    }

    // Two rAFs guarantee the browser has committed at least one painted frame
    // of real content before we pull the splash, so the hand-off is seamless.
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => { hide() })
      // store on a ref-like closure so cleanup can cancel the inner frame too
      ;(hide as any)._raf2 = raf2
    })

    // Safety net: if something stalls the paint, force-hide after 8 s so the
    // splash can never get stuck on screen forever.
    const safety = setTimeout(hide, 8000)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      if ((hide as any)._raf2) cancelAnimationFrame((hide as any)._raf2)
      clearTimeout(safety)
    }
  }, [])

  return null
}
