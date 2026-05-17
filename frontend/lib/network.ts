// Network status detection + a small useNetworkStatus() hook.
//
// Web/Tauri fall back to navigator.onLine + window 'online'/'offline' events.
// Capacitor (iOS/Android) uses @capacitor/network which is more accurate
// (navigator.onLine can be unreliable inside a WebView).

'use client'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Network, type ConnectionStatus } from '@capacitor/network'

export type NetworkStatus = {
  connected: boolean
  // 'wifi' | 'cellular' | 'none' | 'unknown' on native; 'unknown' on web.
  connectionType: ConnectionStatus['connectionType'] | 'unknown'
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export async function getNetworkStatus(): Promise<NetworkStatus> {
  if (isNative()) {
    const s = await Network.getStatus()
    return { connected: s.connected, connectionType: s.connectionType }
  }
  return {
    connected: typeof navigator === 'undefined' ? true : navigator.onLine,
    connectionType: 'unknown',
  }
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    connected: true,
    connectionType: 'unknown',
  })

  useEffect(() => {
    let cancelled = false
    let nativeListener: { remove: () => Promise<void> } | null = null

    ;(async () => {
      const initial = await getNetworkStatus()
      if (!cancelled) setStatus(initial)
    })()

    if (isNative()) {
      Network.addListener('networkStatusChange', (s) => {
        if (!cancelled) setStatus({ connected: s.connected, connectionType: s.connectionType })
      }).then((l) => { nativeListener = l })
    } else if (typeof window !== 'undefined') {
      const update = () => setStatus({ connected: navigator.onLine, connectionType: 'unknown' })
      window.addEventListener('online', update)
      window.addEventListener('offline', update)
      return () => {
        cancelled = true
        window.removeEventListener('online', update)
        window.removeEventListener('offline', update)
      }
    }

    return () => {
      cancelled = true
      nativeListener?.remove()
    }
  }, [])

  return status
}
