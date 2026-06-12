'use client'

import { useEffect, useRef, useState } from 'react'

export interface LiveInboundCall {
  callId:        number
  customerPhone: string
  startedAt:     string
}

const POLL_INTERVAL_MS = 2_000

export function useLivePolledInboundCalls(): LiveInboundCall[] {
  const [calls, setCalls] = useState<LiveInboundCall[]>([])
  // Use refs (not state) for liveness + timer so the effect doesn't re-run on
  // every tick — the effect runs once per mount.
  const aliveRef   = useRef(true)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    aliveRef.current = true

    // Recursive setTimeout (NOT setInterval): the next poll is only scheduled
    // after the previous one settles. Prevents overlapping in-flight requests
    // when /api/3cx/active-calls is slow (cold start, network blip).
    async function poll(): Promise<void> {
      if (!aliveRef.current) return
      try {
        const res = await fetch('/api/3cx/active-calls', { cache: 'no-store' })
        if (!res.ok) {
          // 401 / 502 — log and keep polling. Don't blank the banner on a
          // transient failure; a stale-but-recent ring is better than nothing.
          console.warn('[useLivePolledInboundCalls] status', res.status)
        } else {
          const body = await res.json() as { calls: LiveInboundCall[] }
          if (aliveRef.current) setCalls(body.calls)
        }
      } catch (e) {
        console.warn('[useLivePolledInboundCalls] error', e)
      } finally {
        if (aliveRef.current) {
          timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS)
        }
      }
    }

    poll()  // immediate first tick

    return () => {
      aliveRef.current = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return calls
}
