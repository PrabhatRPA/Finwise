'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

// Theme model:
//   • mode  = what the USER picked: 'light' | 'dark' | 'system' (persisted)
//   • theme = the RESOLVED appearance actually applied: 'light' | 'dark'
//
// In 'system' mode we follow the OS (prefers-color-scheme) and update live when
// the OS flips. If the OS reports no preference at all, we fall back to the time
// of day (day = light, night = dark). An explicit Light/Dark choice is saved and
// always wins.
type Mode = 'light' | 'dark' | 'system'
type Theme = 'light' | 'dark'

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
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
    setModeState(initial)
    setThemeResolved(resolve(initial))
  }, [])

  // Apply the class + persist whenever the chosen mode changes.
  useEffect(() => {
    if (!mounted) return
    const t = resolve(mode)
    setThemeResolved(t)
    document.documentElement.classList.toggle('dark', t === 'dark')
    localStorage.setItem(STORAGE_KEY, mode)
  }, [mode, mounted])

  // In 'system' mode, react to OS changes live and re-check the time-of-day
  // fallback when the app regains focus or on a slow timer.
  useEffect(() => {
    if (!mounted || mode !== 'system') return
    const apply = () => {
      const t = systemTheme()
      setThemeResolved(t)
      document.documentElement.classList.toggle('dark', t === 'dark')
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
