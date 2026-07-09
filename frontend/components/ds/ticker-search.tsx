'use client'

// Ticker input with debounced symbol autocomplete (Add Holding / Watchlist).
// Suggestions come from marketApi.search — exchange-aware, so typing "TCS"
// offers "TCS.NS · Tata Consultancy Services · NSE" and international users
// never need to know Yahoo's suffix conventions. Free-typing still works:
// the field is a normal input; the dropdown is purely additive.

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { marketApi } from '@/lib/api'

export interface TickerMatch {
  symbol: string
  name: string
  exchange: string
  quoteType: string
}

export function TickerSearchInput({
  value,
  onChange,
  onSelect,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onSelect?: (m: TickerMatch) => void
  placeholder?: string
}) {
  const [matches, setMatches] = useState<TickerMatch[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef = useRef(0)          // drop out-of-order responses
  const pickedRef = useRef(false)   // suppress the search triggered by selecting

  useEffect(() => {
    if (pickedRef.current) { pickedRef.current = false; return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = value.trim()
    if (q.length < 2) { setMatches([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current
      try {
        const res = await marketApi.search(q)
        if (seq !== seqRef.current) return
        const list: TickerMatch[] = Array.isArray(res?.data) ? res.data : []
        setMatches(list)
        setOpen(list.length > 0)
      } catch {
        if (seq === seqRef.current) { setMatches([]); setOpen(false) }
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value])

  const pick = (m: TickerMatch) => {
    pickedRef.current = true
    onChange(m.symbol)
    onSelect?.(m)
    setOpen(false)
    setMatches([])
  }

  return (
    <div className="relative">
      <Input
        placeholder={placeholder ?? 'e.g. AAPL, TCS.NS, BTC-USD'}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="uppercase"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
      />
      {open && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 rounded-md border border-border bg-card shadow-lg max-h-56 overflow-y-auto">
          {matches.map((m) => (
            <li key={m.symbol}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(m) }}
                className="w-full text-left px-3 py-2 hover:bg-accent flex items-baseline gap-2"
                style={{ minHeight: 0, minWidth: 0 }}
              >
                <span className="text-sm font-semibold shrink-0">{m.symbol}</span>
                <span className="text-xs text-muted-foreground truncate flex-1">{m.name}</span>
                {m.exchange && (
                  <span className="text-[10px] text-muted-foreground/80 shrink-0">{m.exchange}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
