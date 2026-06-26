'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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

function UploadIcon() {
  // Document with an up-arrow — reads clearly as "upload a document" rather
  // than the iOS share glyph (tray + arrow) the old icon resembled.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <polyline points="9 15 12 12 15 15" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

function ProfileChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 opacity-70" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export function Navbar() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const { theme, setTheme } = useTheme()
  const pathname = usePathname()
  const router = useRouter()

  const initials = user
    ? (user.full_name || user.username || '?')[0].toUpperCase()
    : '?'

  return (
    <nav
      className="sticky top-0 z-40 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      // Extend background behind the iOS status bar without bloating the brand row.
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* h-12 instead of h-14 — denser on mobile while still meeting Apple's
          44pt touch target since the buttons inside are h-9. */}
      <div className="mx-auto max-w-screen-xl px-3 sm:px-4 h-12 flex items-center justify-between gap-2">

        {/* ── Brand ──────────────────────────────────── */}
        <Link href={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2 flex-shrink-0 group min-w-0">
          <AppLogo size={26} />
          <span className="font-bold text-base sm:text-[17px] tracking-tight text-foreground group-hover:text-primary transition-colors">
            {APP_NAME}
          </span>
          <span className="hidden md:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold
            bg-primary/10 text-primary border border-primary/20 select-none">
            v{APP_VERSION}
          </span>
        </Link>

        {/* ── Center tagline (tablet+ only) ───────────────
            On the dashboard, surface the "Your investment portfolio and
            net worth" subtitle here so the page header below can be a
            single dense row (title + search). Hidden on phone where the
            navbar is already crowded. */}
        {!isLoading && isAuthenticated && pathname?.startsWith('/dashboard') && (
          <div className="hidden md:flex flex-1 justify-center px-4">
            <p className="text-sm text-muted-foreground truncate">
              Your investment portfolio and net worth
            </p>
          </div>
        )}

        {/* ── Right cluster — uniform h-9 / w-9 icon buttons ── */}
        <div className="flex items-center gap-1.5 flex-shrink-0">

          {/* About */}
          <button
            onClick={() => router.push('/about')}
            title="About Nworth"
            aria-label="About"
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-border
              text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <InfoIcon />
          </button>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle colour theme"
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-border
              text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Upload Documents — icon button (mobile) / icon+label (tablet+) */}
          {!isLoading && isAuthenticated && (
            <button
              onClick={() => router.push('/documents')}
              title="Upload documents"
              aria-label="Upload documents"
              className="h-9 inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 rounded-lg border border-border
                text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <UploadIcon />
              <span className="hidden sm:inline text-sm font-medium">Documents</span>
            </button>
          )}

          {/* Profile chip — same h-9, initial + chevron on mobile, full label on tablet+.
              Replaces the old "Sign out" shortcut. The Profile page houses
              sign-out plus all per-user settings (theme, Face ID, etc). */}
          {!isLoading && isAuthenticated && user && (
            <button
              onClick={() => router.push('/profile')}
              title="Profile"
              aria-label="Profile"
              className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-border px-1.5 sm:px-2.5 text-sm
                text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <span className="h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center
                justify-center text-[11px] font-bold flex-shrink-0 select-none">
                {initials}
              </span>
              <span className="hidden sm:inline">Profile</span>
              <span className="sm:hidden"><ProfileChevronIcon /></span>
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
