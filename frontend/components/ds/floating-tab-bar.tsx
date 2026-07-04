'use client'

// Floating bottom navigation — a rounded blur capsule inset from the screen
// edges (content scrolls and blurs beneath it), NOT an opaque full-width bar.
// Items: Home · Insights · ⊕ (add holding, raised accent button) · Accounts ·
// Settings. Home/Insights/Accounts route to dashboard tabs via ?tab=, which
// app/dashboard/page.tsx reads/writes (two-way, so back-gesture stays sane).
// The ⊕ broadcasts "nworth:add-holding", which the holdings table listens for.
// Hidden while signed out. Sits above the home indicator via safe-area inset.

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { impactLight } from './haptics'

type ItemId = 'home' | 'insights' | 'news' | 'settings'

const TABS: { id: ItemId; label: string; tab?: string; href?: string; icon: (active: boolean) => React.ReactNode }[] = [
  {
    id: 'home', label: 'Home', tab: 'holdings',
    icon: (a) => (
      <svg viewBox="0 0 24 24" fill={a ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
        <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    id: 'insights', label: 'Insights', tab: 'performance',
    icon: (a) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.4 : 1.8}
        strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="14 7 21 7 21 14" />
      </svg>
    ),
  },
  {
    id: 'news', label: 'News', tab: 'news',
    icon: (a) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.3 : 1.8}
        strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0V9" />
        <path d="M11 6h6M11 10h6M11 14h6M11 18h3" />
      </svg>
    ),
  },
  {
    id: 'settings', label: 'Settings', href: '/profile',
    icon: (a) => (
      <svg viewBox="0 0 24 24" fill={a ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
      </svg>
    ),
  },
]

function currentTabParam(): string {
  try { return new URLSearchParams(window.location.search).get('tab') ?? 'holdings' } catch { return 'holdings' }
}

export function FloatingTabBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()
  const [tabParam, setTabParam] = useState('holdings')

  // Re-read ?tab= whenever the route changes (avoids useSearchParams' Suspense
  // requirement in a layout-mounted client component under static export).
  useEffect(() => { setTabParam(currentTabParam()) }, [pathname])
  useEffect(() => {
    const on = () => setTabParam(currentTabParam())
    window.addEventListener('nworth:tab-change', on)
    window.addEventListener('popstate', on)
    return () => { window.removeEventListener('nworth:tab-change', on); window.removeEventListener('popstate', on) }
  }, [])

  const isAuthRoute = pathname === '/' || pathname === '' ||
    pathname?.startsWith('/login') || pathname?.startsWith('/register')
  if (isLoading || !isAuthenticated || isAuthRoute) return null

  const onDashboard = pathname?.startsWith('/dashboard')

  const activeId: ItemId | null =
    pathname?.startsWith('/profile') ? 'settings'
    : onDashboard
      ? (tabParam === 'performance' ? 'insights' : tabParam === 'news' ? 'news' : 'home')
      : null

  const go = (t: typeof TABS[number]) => {
    impactLight()
    if (t.href) { router.push(t.href); return }
    router.push(`/dashboard/?tab=${t.tab}`)
    // router.push commits the URL asynchronously — nudge listeners twice so
    // both the bar highlight and the dashboard's tab state settle. The scroll
    // hint lands the user on the section itself (Home returns to the top).
    const scroll = t.id === 'home' ? 'top' : 'tabs'
    const fire = () => window.dispatchEvent(new CustomEvent('nworth:tab-change', { detail: { scroll } }))
    setTimeout(fire, 50)
    setTimeout(fire, 300)
  }

  const addHolding = () => {
    impactLight()
    if (!onDashboard) router.push('/dashboard/?tab=holdings')
    // The holdings table listens and opens its Add modal.
    setTimeout(() => window.dispatchEvent(new Event('nworth:add-holding')), onDashboard ? 0 : 450)
  }

  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)]

  const item = (t: typeof TABS[number]) => {
    const active = activeId === t.id
    return (
      <button
        key={t.id}
        onClick={() => go(t)}
        aria-label={t.label}
        aria-current={active ? 'page' : undefined}
        className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-ds-md transition-colors ${
          active ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        {t.icon(active)}
        {active && <span className="text-[9px] font-semibold tracking-wide">{t.label}</span>}
      </button>
    )
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60
        bg-card/85 backdrop-blur-xl flex items-stretch px-2 h-auto"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch flex-1 h-[60px]">
      {left.map(item)}

      {/* Center add button — slightly raised but discreet, brand mark beneath
          (the Nworth logo moved here from the old top bar). */}
      <div className="relative flex-1 flex items-center justify-center">
        <button
          onClick={addHolding}
          aria-label="Add holding"
          className="absolute -top-2.5 h-11 w-11 rounded-full bg-primary/90 text-primary-foreground
            shadow-md flex items-center justify-center active:scale-95 transition-transform"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" className="h-5 w-5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <span className="absolute bottom-1 flex items-center gap-0.5 pointer-events-none select-none" aria-hidden="true">
          <svg width="9" height="9" viewBox="0 0 36 36">
            <rect width="36" height="36" rx="9" fill="hsl(var(--primary))" opacity="0.9" />
            <rect x="6" y="24" width="5.5" height="8" rx="1.5" fill="rgba(255,255,255,0.5)" />
            <rect x="15.25" y="18" width="5.5" height="14" rx="1.5" fill="rgba(255,255,255,0.75)" />
            <rect x="24.5" y="12" width="5.5" height="20" rx="1.5" fill="#fff" />
          </svg>
          <span className="text-[8px] font-bold tracking-[0.08em] text-muted-foreground">NWORTH</span>
        </span>
      </div>

      {right.map(item)}
      </div>
    </nav>
  )
}
