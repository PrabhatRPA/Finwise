'use client'

// App-wide floating navigation: a vertical stack of round buttons anchored to
// the bottom-left or bottom-right (user's choice, for left/right-handed use).
//   • Top button  = scroll to top (up arrow) — appears once the page is scrolled.
//   • Bottom button = back (back arrow) — on drill-in pages (not home/auth).
// Buttons are always stacked vertically (up on top, back below), never side by
// side. No-op on the auth/splash routes.

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useFloatSide } from '@/lib/float-side'

export function FloatingNav() {
  const pathname = usePathname()
  const router = useRouter()
  const side = useFloatSide()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 300)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // No floaters on the splash/auth routes, or when the user chose Hide.
  const isAuth = pathname === '/' || pathname === '' ||
    pathname?.startsWith('/login') || pathname?.startsWith('/register')
  if (isAuth || side === 'hide') return null

  // "Back" only where it's meaningful — not on the home dashboard.
  const isHome = pathname?.startsWith('/dashboard')
  const showBack = !isHome
  const showTop = scrolled

  if (!showBack && !showTop) return null

  const sideClass = side === 'left' ? 'left-4 items-start' : 'right-4 items-end'
  const btn =
    'h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center ' +
    'justify-center hover:opacity-90 active:scale-95 transition'

  return (
    <div
      className={`fixed z-40 flex flex-col gap-2 ${sideClass}`}
      /* Sit above the floating tab bar (64px bar + 12px inset + 12px gap). */
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 88px)' }}
    >
      {/* Top button — scroll to top */}
      {showTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Scroll to top"
          className={btn}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      )}

      {/* Bottom button — back */}
      {showBack && (
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className={btn}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
      )}
    </div>
  )
}
