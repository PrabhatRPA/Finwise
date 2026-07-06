'use client'

// Bottom navigation bar. Two user-selectable placements (Settings →
// Appearance): "floating" — a rounded blur capsule inset above the home
// indicator — or "attached" — full-width, flush with the bottom edge.
//
// Items: Home · Insights · [center] · News · Settings.
// The CENTER slot is context-aware:
//   • On dashboard tabs where adding makes sense (holdings / accounts /
//     watchlist / debts / properties), it's the raised ⊕ button, which
//     broadcasts "nworth:add-item" — the active table opens its own Add
//     modal. A compact AI-Insights pill sits beneath the ⊕.
//   • Everywhere else (news, performance, allocation, AI, other pages),
//     there is nothing to add, so AI Insights takes the center as a
//     regular full-size tab item.
// Hidden while signed out.

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useBarStyle } from '@/lib/bar-style'
import { impactLight } from './haptics'

type ItemId = 'home' | 'insights' | 'news' | 'settings' | 'ai'

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

// AI-Insights center item (sparkle icon) — full tab when ⊕ isn't shown.
const AI_TAB: typeof TABS[number] = {
  id: 'ai', label: 'AI', tab: 'ai',
  icon: (a) => (
    <svg viewBox="0 0 24 24" fill={a ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
    </svg>
  ),
}

// Dashboard tabs where the ⊕ can add something (label used for a11y).
const ADD_TABS: Record<string, string> = {
  holdings: 'holding',
  accounts: 'account',
  watchlist: 'watchlist ticker',
  debts: 'debt',
  properties: 'property',
}

function currentTabParam(): string {
  try { return new URLSearchParams(window.location.search).get('tab') ?? 'holdings' } catch { return 'holdings' }
}

export function FloatingTabBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()
  const barStyle = useBarStyle()
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
  const addKind = onDashboard ? ADD_TABS[tabParam] : undefined   // e.g. 'holding' | undefined

  const activeId: ItemId | null =
    pathname?.startsWith('/profile') ? 'settings'
    : onDashboard
      ? (tabParam === 'performance' ? 'insights'
        : tabParam === 'news' ? 'news'
        : tabParam === 'ai' ? 'ai'
        : 'home')
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

  // ⊕ — only rendered on add-capable tabs; the ACTIVE table listens and opens
  // its own Add modal (inactive tabs are unmounted, so one event suffices).
  const addItem = () => {
    impactLight()
    window.dispatchEvent(new Event('nworth:add-item'))
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

  // Placement variants (user preference, Settings → Appearance).
  const floating = barStyle === 'floating'
  const navClass = floating
    ? 'fixed left-4 right-4 z-50 rounded-ds-lg border border-white/10 bg-card/75 backdrop-blur-xl shadow-card flex items-stretch px-2'
    : 'fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-card/85 backdrop-blur-xl flex items-stretch px-2'
  const navStyle = floating
    ? { bottom: 'calc(env(safe-area-inset-bottom) + 12px)' }
    : { paddingBottom: 'env(safe-area-inset-bottom)' }

  return (
    <nav aria-label="Primary" className={navClass} style={navStyle}>
      <div className="flex items-stretch flex-1 h-[60px]">
        {left.map(item)}

        {/* Context-aware center slot */}
        {addKind ? (
          <div className="relative flex-1 flex items-center justify-center">
            {/* Raised ⊕ — adds whatever the current tab holds */}
            <button
              onClick={addItem}
              aria-label={`Add ${addKind}`}
              className="absolute -top-2.5 h-11 w-11 rounded-full bg-primary/90 text-primary-foreground
                shadow-md flex items-center justify-center active:scale-95 transition-transform"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" className="h-5 w-5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            {/* Compact AI pill tucked beneath the ⊕ — still tappable */}
            <button
              onClick={() => go(AI_TAB)}
              aria-label="AI Insights"
              className={`absolute bottom-0.5 flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors ${
                activeId === 'ai' ? 'text-primary' : 'text-muted-foreground'
              }`}
              style={{ minHeight: 0, minWidth: 0 }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
              </svg>
              <span className="text-[8px] font-bold tracking-[0.08em]">AI</span>
            </button>
          </div>
        ) : (
          // Nothing to add here → AI Insights takes the center as a full item.
          item(AI_TAB)
        )}

        {right.map(item)}
      </div>
    </nav>
  )
}
