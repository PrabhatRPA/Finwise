import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'
import { Navbar } from '@/components/layout/navbar'
import { KeyboardManager } from '@/components/keyboard-manager'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

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
            __html: `try{var m=localStorage.getItem('theme');var dark;if(m==='dark'){dark=true}else if(m==='light'){dark=false}else{if(window.matchMedia('(prefers-color-scheme: dark)').matches){dark=true}else if(window.matchMedia('(prefers-color-scheme: light)').matches){dark=false}else{var h=new Date().getHours();dark=(h<7||h>=19)}}if(dark){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <ThemeProvider>
          <AuthProvider>
            <KeyboardManager />
            <Navbar />
            <main className="flex-1">
              {children}
            </main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
