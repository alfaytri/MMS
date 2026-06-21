'use client'

import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useLivePolledInboundCalls, type LiveInboundCall } from '@/hooks/contact-center/useLivePolledInboundCalls'
import { useContactCenterContext } from '@/contexts/ContactCenterContext'
import { createClient } from '@/lib/supabase/client'

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

async function callAction(verb: 'decline' | 'hangup', callId: number): Promise<boolean> {
  try {
    const res = await fetch(`/api/3cx/call/${verb}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ callId }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
    return true
  } catch (e) {
    const label = verb === 'decline' ? 'Decline' : 'Hangup'
    toast.error(`${label} failed: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

interface CallRowProps {
  call:           LiveInboundCall
  connectedSince: number | null
  onOpen:         (phone: string) => void
}

function CallRow({ call, connectedSince, onOpen }: CallRowProps) {
  const [customerName, setCustomerName] = useState<string | null>(null)
  const [pending, setPending] = useState<'decline' | 'hangup' | null>(null)
  const isAnonymous = call.customerPhone === 'Unknown'
  const isRinging   = call.status === 'ringing'
  const isConnected = call.status === 'connected'

  async function runAction(verb: 'decline' | 'hangup') {
    if (pending) return
    setPending(verb)
    try { await callAction(verb, call.callId) } finally { setPending(null) }
  }

  // Deps are primitives on purpose — `calls` gets a new identity on every poll
  // tick; depending on `call` directly would re-fire the Supabase lookup every 5s.
  useEffect(() => {
    if (isAnonymous) return
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('service_customer_phones')
      .select('customer_id, service_customers ( name )')
      .eq('phone', call.customerPhone)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.warn('[InboundCallStrip] customer lookup failed:', error.message)
          return
        }
        const name = (data as unknown as { service_customers: { name: string } | null } | null)
          ?.service_customers?.name
        if (name) setCustomerName(name)
      })
    return () => { cancelled = true }
  }, [call.callId, call.customerPhone, isAnonymous])

  // Live duration ticker — only runs while connected.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isConnected) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isConnected])
  const duration = isConnected && connectedSince ? Math.floor((now - connectedSince) / 1000) : 0

  const headline = customerName ?? (isAnonymous ? 'Anonymous' : 'Unknown')
  // Visual semantics: amber for incoming ring (attention), green for live call (in-progress).
  const accent = isConnected
    ? { row: 'bg-gradient-to-r from-green-50 to-transparent', border: 'border-l-green-500', iconBg: 'bg-green-100', iconText: 'text-green-700' }
    : { row: 'bg-gradient-to-r from-amber-50 to-transparent', border: 'border-l-amber-500', iconBg: 'bg-amber-100', iconText: 'text-amber-700' }

  return (
    <div className={`relative flex items-center gap-2.5 px-3 py-2 border-b border-border border-l-2 ${accent.row} ${accent.border}`}>
      {/* Phone icon — pulsing ring for incoming, solid for connected. */}
      <div className="relative flex-shrink-0">
        <div className={`flex items-center justify-center h-8 w-8 rounded-full ${accent.iconBg}`}>
          <Phone className={`h-3.5 w-3.5 ${accent.iconText}`} />
        </div>
        {isRinging && (
          <span className="absolute inset-0 rounded-full border-2 border-amber-400 animate-ping pointer-events-none" />
        )}
      </div>

      {/* Name on top, number/duration below — stacked for readability. */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold truncate leading-tight" title={headline}>
          {headline}
        </div>
        <div
          className={`text-[11px] font-mono truncate leading-tight tabular-nums ${
            isConnected ? 'text-green-700 font-semibold' : 'text-muted-foreground'
          }`}
        >
          {isConnected
            ? `${formatDuration(duration)}${isAnonymous ? '' : ` · ${call.customerPhone}`}`
            : (isAnonymous ? 'Number withheld' : call.customerPhone)}
        </div>
      </div>

      {/* Actions — pill buttons, right-aligned. */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {isRinging && (
          <>
            <Button
              size="sm"
              onClick={() => onOpen(call.customerPhone)}
              className="h-7 px-3 text-[11px] rounded-full shadow-sm font-medium"
              disabled={isAnonymous}
            >
              Open chat
            </Button>
            <Button
              size="icon"
              variant="destructive"
              className="h-7 w-7 rounded-full shadow-sm"
              onClick={() => void runAction('decline')}
              disabled={pending === 'decline'}
              aria-label="Decline call"
              title="Decline"
            >
              <PhoneOff className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {isConnected && (
          <Button
            size="icon"
            variant="destructive"
            className="h-7 w-7 rounded-full shadow-sm"
            onClick={() => void runAction('hangup')}
            disabled={pending === 'hangup'}
            aria-label="Hangup call"
            title="Hangup"
          >
            <PhoneOff className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

interface InboundCallStripProps {
  calls: LiveInboundCall[]
}

export function InboundCallStrip({ calls }: InboundCallStripProps) {
  const { openCustomerByPhone, setCcSidebar } = useContactCenterContext()

  // Track the first poll-tick when each callid is observed as Connected so the
  // duration timer doesn't reset on every 5s poll. Populated synchronously
  // during render (idempotent ref mutation) so the first Connected render
  // already has a non-null value — avoids a 1-tick "00:00" flash.
  const connectedSinceRef = useRef<Map<number, number>>(new Map())
  const active = new Set(calls.map((c) => c.callId))
  for (const c of calls) {
    if (c.status === 'connected') {
      if (!connectedSinceRef.current.has(c.callId)) {
        connectedSinceRef.current.set(c.callId, Date.now())
      }
    } else {
      connectedSinceRef.current.delete(c.callId)
    }
  }
  for (const id of Array.from(connectedSinceRef.current.keys())) {
    if (!active.has(id)) connectedSinceRef.current.delete(id)
  }

  if (calls.length === 0) return null

  function handleOpen(phone: string) {
    openCustomerByPhone(phone)
    setCcSidebar('expanded')
  }

  return (
    <div className="flex-shrink-0">
      {calls.map((c) => (
        <CallRow
          key={c.callId}
          call={c}
          connectedSince={connectedSinceRef.current.get(c.callId) ?? null}
          onOpen={handleOpen}
        />
      ))}
    </div>
  )
}

// Re-export the poll hook so the sidebar can share a single polling instance
// across the strip + the auto-expand effect (avoids duplicate /active-calls polls).
export { useLivePolledInboundCalls }
