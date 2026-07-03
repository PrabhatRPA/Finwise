'use client'

// Motion primitives for the design system.
// ALL decorative animation is gated behind the OS Reduce Motion setting.

import { useEffect, useRef, useState } from 'react'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

// rAF count-up toward `value` — the web equivalent of SwiftUI's
// .contentTransition(.numericText()). The signature moment: the hero number
// rolls up on dashboard mount and re-rolls after a refresh. With Reduce
// Motion on (or disabled), it snaps instantly.
export function useCountUp(value: number, durationMs = 600, disabled = false): number {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (disabled || durationMs <= 0) {
      fromRef.current = value
      setDisplay(value)
      return
    }
    const from = fromRef.current
    if (from === value) return
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3) // ease-out cubic
      setDisplay(from + (value - from) * eased)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, durationMs, disabled])

  return display
}
