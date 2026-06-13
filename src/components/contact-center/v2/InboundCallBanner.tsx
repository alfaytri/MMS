'use client'

import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, X } from 'lucide-react'
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

interface BannerRowProps {
  call:           LiveInboundCall
  connectedSince: number | null
  onOpen:         (phone: string) => void
  onDismiss:      (callId: number) => void
}

function BannerRow({ call, connectedSince, onOpen, onDismiss }: BannerRowProps) {
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

  // Deps are primitives on purpose — `calls` gets a new identity on every poll tick;
  // depending on `call` directly would re-fire the Supabase lookup every 2s.
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
          console.warn('[InboundCallBanner] customer lookup failed:', error.message)
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

  const headline = customerName ?? (isAnonymous ? 'Anonymous caller' : 'Unknown caller')
  // Amber pulse for incoming ring, solid green for live call — conventional phone-UI semantics.
  const phoneIconTint = isConnected ? 'text-green-600' : 'text-amber-500 animate-pulse'

  return (
    <div className="w-80 max-w-[calc(100vw-1rem)] rounded-md border border-border bg-background shadow-lg p-3 min-h-[100px]">
      <div className="flex items-start gap-2">
        <Phone className={`h-4 w-4 mt-0.5 ${phoneIconTint}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{headline}</div>
          <div className="text-xs text-muted-foreground truncate">
            {isAnonymous ? 'Number withheld' : call.customerPhone}
          </div>
          {isRinging && (
            <div className="mt-2 flex gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => onOpen(call.customerPhone)}
                className="h-11 sm:h-8"
                disabled={isAnonymous}
              >
                Open chat
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-11 sm:h-9"
                onClick={() => void runAction('decline')}
                disabled={pending === 'decline'}
              >
                <PhoneOff className="h-4 w-4 mr-1" /> {pending === 'decline' ? 'Declining…' : 'Decline'}
              </Button>
            </div>
          )}
          {isConnected && (
            <div className="mt-2 flex items-center gap-3">
              <span className="text-sm font-mono tabular-nums text-green-700">
                {formatDuration(duration)}
              </span>
              <Button
                size="sm"
                variant="destructive"
                className="h-11 sm:h-9 ml-auto"
                onClick={() => void runAction('hangup')}
                disabled={pending === 'hangup'}
              >
                <PhoneOff className="h-4 w-4 mr-1" /> {pending === 'hangup' ? 'Ending…' : 'Hangup'}
              </Button>
            </div>
          )}
        </div>
        {/* Hide Dismiss while connected — dismissing a live call you're on is a footgun. */}
        {!isConnected && (
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11 sm:h-6 sm:w-6 sm:-mr-1 sm:-mt-1"
            onClick={() => onDismiss(call.callId)}
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}

export function InboundCallBanner() {
  const calls = useLivePolledInboundCalls()
  const { openCustomerByPhone, setCcSidebar } = useContactCenterContext()

  // Locally-dismissed callIds — purely cosmetic; the call may still be ringing
  // on the softphone. GC'd when the call leaves /callcontrol.
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())

  // Track the first poll-tick when each callid is observed as Connected.
  // Stays stable across re-renders so the duration timer doesn't reset every 2 s.
  // Populated synchronously during render (not in useEffect) so the very first
  // render of a Connected row sees a non-null value — avoids a 1-tick "00:00"
  // flash. Refs are safe to mutate during render when the mutation is
  // idempotent and not based on prior render state in a way that would tear
  // concurrent renders.
  const connectedSinceRef = useRef<Map<number, number>>(new Map())
  const active = new Set(calls.map((c) => c.callId))
  for (const c of calls) {
    if (c.status === 'connected') {
      if (!connectedSinceRef.current.has(c.callId)) {
        connectedSinceRef.current.set(c.callId, Date.now())
      }
    } else {
      // Reset on any non-connected status so a transfer-recall (connected →
      // ringing → connected) restarts the timer from the new pickup time.
      connectedSinceRef.current.delete(c.callId)
    }
  }
  for (const id of Array.from(connectedSinceRef.current.keys())) {
    if (!active.has(id)) connectedSinceRef.current.delete(id)
  }

  // GC dismissed ids that are no longer active. Uses the same `active` set
  // computed above for the connectedSinceRef pass — single source of truth.
  useEffect(() => {
    setDismissed((prev) => {
      const next = new Set<number>()
      prev.forEach((id) => { if (active.has(id)) next.add(id) })
      return next.size === prev.size ? prev : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `active` is derived from `calls` every render; depending on calls is correct.
  }, [calls])

  const visible = calls.filter((c) => !dismissed.has(c.callId))
  if (visible.length === 0) return null

  function handleOpen(phone: string) {
    openCustomerByPhone(phone)
    setCcSidebar('expanded')
  }

  function handleDismiss(callId: number) {
    setDismissed((prev) => new Set(prev).add(callId))
  }

  return (
    <div className="fixed top-2 right-2 z-[80] flex flex-col gap-2">
      {visible.map((c) => (
        <BannerRow
          key={c.callId}
          call={c}
          connectedSince={connectedSinceRef.current.get(c.callId) ?? null}
          onOpen={handleOpen}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  )
}
