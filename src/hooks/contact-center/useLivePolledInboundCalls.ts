'use client'

import { useEffect, useState } from 'react'

export type CallStatus = 'ringing' | 'connected'

export interface LiveInboundCall {
  callId:        number
  customerPhone: string
  status:        CallStatus
  startedAt:     string
}

const POLL_INTERVAL_MS = 5_000

export function useLivePolledInboundCalls(): LiveInboundCall[] {
  const [calls, setCalls] = useState<LiveInboundCall[]>([])

  useEffect(() => {
    // Scope `alive` and `timeoutId` to THIS effect run, not shared refs.
    // A shared ref leaks zombie pollers when React unmounts and remounts the
    // component (StrictMode in dev, context re-renders in prod): an in-flight
    // fetch from the first mount can read `aliveRef.current === true` (set by
    // the second mount) and re-schedule itself, leaving an orphaned timer that
    // never gets cleared.
    let alive = true
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    // Recursive setTimeout (NOT setInterval): the next poll is only scheduled
    // after the previous one settles. Prevents overlapping in-flight requests
    // when /api/3cx/active-calls is slow (cold start, network blip).
    async function poll(): Promise<void> {
      if (!alive) return
      // Pause network calls when tab is hidden — the agent isn't watching.
      // Reschedule so we resume on the next tick after focus return; the
      // visibilitychange handler below also triggers an immediate poll.
      if (document.hidden) {
        timeoutId = setTimeout(poll, POLL_INTERVAL_MS)
        return
      }
      try {
        const res = await fetch('/api/3cx/active-calls', { cache: 'no-store' })
        if (!res.ok) {
          // 401 / 502 — log and keep polling. Don't blank the banner on a
          // transient failure; a stale-but-recent ring is better than nothing.
          console.warn('[useLivePolledInboundCalls] status', res.status)
        } else {
          const body = await res.json() as { calls: LiveInboundCall[] }
          if (alive) setCalls(body.calls)
        }
      } catch (e) {
        console.warn('[useLivePolledInboundCalls] error', e)
      } finally {
        if (alive) {
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS)
        }
      }
    }

    poll()  // immediate first tick

    // Immediate poll on tab focus return so the banner refreshes within ~1 s
    // instead of waiting for the next scheduled tick.
    function handleVisibility() {
      if (!document.hidden && alive) {
        if (timeoutId) clearTimeout(timeoutId)
        poll()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      alive = false
      if (timeoutId) clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return calls
}
