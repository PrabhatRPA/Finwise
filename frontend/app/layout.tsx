import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'
import { KeyboardManager } from '@/components/keyboard-manager'
import { SplashHider } from '@/components/splash-hider'
import { AppLockGate } from '@/components/app-lock-gate'
import { FloatingNav } from '@/components/floating-nav'
import { FloatingTabBar } from '@/components/ds/floating-tab-bar'


export const metadata: Metadata = {
  title: 'Nworth — Track Everything. Share Nothing.',
  description: 'Nworth tracks your full financial picture — investments, holdings, debt, and property — completely offline. Your numbers stay on your device, always.',
  icons: { icon: '/favicon.svg' },
}

// `viewport-fit=cover` is required so iOS exposes safe-area-inset-* env() values.
// `maximumScale=1` + `userScalable=false` mirrors native iOS behavior and avoids
// the "double-tap to zoom" delay; keep both off for non-touch browsers via CSS.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Prevent flash-of-unstyled-content by applying dark class synchronously */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var m=localStorage.getItem('theme');var d=document.documentElement;if(m==='colorful'){d.setAttribute('data-theme','colorful')}else{var dark;if(m==='dark'){dark=true}else if(m==='light'){dark=false}else{if(window.matchMedia('(prefers-color-scheme: dark)').matches){dark=true}else if(window.matchMedia('(prefers-color-scheme: light)').matches){dark=false}else{var h=new Date().getHours();dark=(h<7||h>=19)}}if(dark){d.classList.add('dark')}d.setAttribute('data-theme',dark?'ledger-dark':'paper-light')}}catch(e){}`,
          }}
        />
      </head>
      {/* System font stack — renders SF Pro natively on iOS, no webfont download */}
      <body className="font-sans flex flex-col min-h-screen">
        <ThemeProvider>
          <AuthProvider>
            <SplashHider />
            <KeyboardManager />
            <AppLockGate>
              {/* No top bar — the floating tab bar owns navigation and content
                  runs clean to the top edge (safe-area padded via globals). */}
              <main className="flex-1">
                {children}
              </main>
              <FloatingNav />
              <FloatingTabBar />
            </AppLockGate>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
