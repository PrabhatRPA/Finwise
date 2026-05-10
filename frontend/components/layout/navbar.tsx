'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { APP_NAME, APP_VERSION } from '@/lib/constants'

function AppLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="36" height="36" rx="8" fill="hsl(161 93% 30%)" />
      <rect x="6"    y="24" width="5.5" height="8"  rx="1.5" fill="rgba(255,255,255,0.45)" />
      <rect x="15.25" y="18" width="5.5" height="14" rx="1.5" fill="rgba(255,255,255,0.70)" />
      <rect x="24.5" y="12" width="5.5" height="20" rx="1.5" fill="white" />
      <polyline
        points="9,23 18,17 27.25,11"
        stroke="rgba(255,255,255,0.30)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1"  x2="12" y2="3"  />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"  />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1"  y1="12" x2="3"  y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36" />
      <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"  />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

const NAV_LINKS = [
  { href: '/dashboard',  label: 'Dashboard'  },
  { href: '/documents',  label: 'Documents'  },
]

export function Navbar() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const pathname = usePathname()

  const initials = user
    ? (user.full_name || user.username || '?')[0].toUpperCase()
    : '?'

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto max-w-screen-xl px-4 h-14 flex items-center justify-between gap-4">

        {/* ── Brand ──────────────────────────────────── */}
        <Link href={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2.5 flex-shrink-0 group">
          <AppLogo size={30} />
          <span className="font-bold text-[17px] tracking-tight text-foreground group-hover:text-primary transition-colors">
            {APP_NAME}
          </span>
          <span className="hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold
            bg-primary/10 text-primary border border-primary/20 select-none">
            v{APP_VERSION}
          </span>
        </Link>

        {/* ── Page nav ───────────────────────────────── */}
        {!isLoading && isAuthenticated && (
          <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  pathname?.startsWith(link.href)
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}

        {/* ── Right controls ─────────────────────────── */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle colour theme"
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-border
              text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* User chip */}
          {!isLoading && isAuthenticated && user && (
            <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
              <div className="h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center
                justify-center text-[11px] font-bold flex-shrink-0 select-none">
                {initials}
              </div>
              <span className="hidden sm:block text-muted-foreground max-w-[120px] truncate">
                {user.full_name || user.username}
              </span>
              <button
                onClick={logout}
                className="text-[11px] text-muted-foreground hover:text-destructive transition-colors ml-0.5"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
