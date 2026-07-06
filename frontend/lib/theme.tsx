'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

// Theme model:
//   • mode  = what the USER picked: 'light' | 'dark' | 'system' (persisted)
//   • theme = the RESOLVED appearance actually applied: 'light' | 'dark'
//
// Presentation names (design system): 'light' renders the "Paper Light" token
// set, 'dark' renders "Ledger Dark". Stored values stay 'light'/'dark'/'system'
// so no migration is needed and every legacy `dark:` utility keeps working; the
// resolved theme is mirrored onto <html data-theme="paper-light|ledger-dark">
// for DS-level styling hooks.
//
// In 'system' mode we follow the OS (prefers-color-scheme) and update live when
// the OS flips. If the OS reports no preference at all, we fall back to the time
// of day (day = light, night = dark). An explicit choice is saved and always wins.
type Mode = 'light' | 'dark' | 'colorful' | 'glass' | 'system'
type Theme = 'light' | 'dark' | 'colorful' | 'glass'

const DATA_THEME: Record<Theme, string> = {
  light: 'paper-light',
  dark: 'ledger-dark',
  colorful: 'colorful',
  glass: 'liquid-glass',
}

// Apply the resolved theme to the document + native chrome (status bar).
// Only Ledger Dark sets the .dark class (legacy dark: utilities); Paper Light
// and Colorful are light-family themes.
function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
  document.documentElement.setAttribute('data-theme', DATA_THEME[t])
  // Status bar content must adapt per theme (light text on Ledger Dark).
  ;(async () => {
    try {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) return
      const { StatusBar, Style } = await import('@capacitor/status-bar')
      await StatusBar.setStyle({ style: t === 'dark' ? Style.Dark : Style.Light })
    } catch { /* status bar plugin unavailable */ }
  })()
}

const STORAGE_KEY = 'theme'
// Daytime window for the no-OS-preference fallback: 07:00–18:59 = light.
const DAY_START = 7
const DAY_END = 19

function timeOfDayTheme(): Theme {
  const h = new Date().getHours()
  return h >= DAY_START && h < DAY_END ? 'light' : 'dark'
}

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return timeOfDayTheme()
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return timeOfDayTheme() // OS expresses no preference
}

function resolve(mode: Mode): Theme {
  return mode === 'system' ? systemTheme() : mode
}

interface ThemeContextValue {
  theme: Theme            // resolved appearance
  mode: Mode              // user's preference
  setMode: (m: Mode) => void
  setTheme: (t: Theme) => void  // back-compat: sets an explicit Light/Dark mode
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  mode: 'system',
  setMode: () => {},
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>('system')
  const [theme, setThemeResolved] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  // Load the saved preference once on mount.
  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem(STORAGE_KEY)
    const initial: Mode =
      stored === 'light' || stored === 'dark' || stored === 'colorful' || stored === 'glass' || stored === 'system' ? stored : 'system'
    setModeState(initial)
    setThemeResolved(resolve(initial))
  }, [])

  // Apply the class + persist whenever the chosen mode changes.
  useEffect(() => {
    if (!mounted) return
    const t = resolve(mode)
    setThemeResolved(t)
    applyTheme(t)
    localStorage.setItem(STORAGE_KEY, mode)
  }, [mode, mounted])

  // In 'system' mode, react to OS changes live and re-check the time-of-day
  // fallback when the app regains focus or on a slow timer.
  useEffect(() => {
    if (!mounted || mode !== 'system') return
    const apply = () => {
      const t = systemTheme()
      setThemeResolved(t)
      applyTheme(t)
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener?.('change', apply)
    document.addEventListener('visibilitychange', apply)
    const interval = setInterval(apply, 10 * 60 * 1000) // flip at the day/night boundary
    return () => {
      mq.removeEventListener?.('change', apply)
      document.removeEventListener('visibilitychange', apply)
      clearInterval(interval)
    }
  }, [mode, mounted])

  const setMode = useCallback((m: Mode) => setModeState(m), [])
  const setTheme = useCallback((t: Theme) => setModeState(t), [])

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
