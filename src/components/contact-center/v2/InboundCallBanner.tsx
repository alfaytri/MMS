'use client'

import { useEffect, useState } from 'react'
import { Phone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLivePolledInboundCalls, type LiveInboundCall } from '@/hooks/contact-center/useLivePolledInboundCalls'
import { useContactCenterContext } from '@/contexts/ContactCenterContext'
import { createClient } from '@/lib/supabase/client'

interface BannerRowProps {
  call:      LiveInboundCall
  onOpen:    (phone: string) => void
  onDismiss: (callId: number) => void
}

function BannerRow({ call, onOpen, onDismiss }: BannerRowProps) {
  const [customerName, setCustomerName] = useState<string | null>(null)
  const isAnonymous = call.customerPhone === 'Unknown'

  useEffect(() => {
    if (isAnonymous) return  // no point looking up "Unknown" in service_customer_phones
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
          // Network blip / PostgREST error. Banner still shows the phone number;
          // we just can't enrich it with the customer name. Don't crash.
          console.warn('[InboundCallBanner] customer lookup failed:', error.message)
          return
        }
        const name = (data as unknown as { service_customers: { name: string } | null } | null)
          ?.service_customers?.name
        if (name) setCustomerName(name)
      })
    return () => { cancelled = true }
  }, [call.callId, call.customerPhone, isAnonymous])

  const headline = customerName ?? (isAnonymous ? 'Anonymous caller' : 'Unknown caller')

  return (
    <div className="w-80 max-w-[calc(100vw-1rem)] rounded-md border border-border bg-background shadow-lg p-3 min-h-16">
      <div className="flex items-start gap-2">
        <Phone className="h-4 w-4 mt-0.5 text-green-600 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{headline}</div>
          <div className="text-xs text-muted-foreground truncate">
            {isAnonymous ? 'Number withheld' : call.customerPhone}
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              onClick={() => onOpen(call.customerPhone)}
              className="h-8"
              disabled={isAnonymous}
            >
              Open chat
            </Button>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 -mr-1 -mt-1"
          onClick={() => onDismiss(call.callId)}
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

export function InboundCallBanner() {
  const calls = useLivePolledInboundCalls()
  const { openCustomerByPhone, setCcSidebar } = useContactCenterContext()

  // Locally-dismissed callIds — purely cosmetic; the call may still be ringing
  // on the softphone. Reset when the call disappears from /callcontrol so a
  // dismissed-then-redialed-from-same-customer call re-surfaces.
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())

  // Garbage-collect dismissed ids that are no longer in the active set.
  useEffect(() => {
    setDismissed((prev) => {
      const active = new Set(calls.map((c) => c.callId))
      const next = new Set<number>()
      prev.forEach((id) => { if (active.has(id)) next.add(id) })
      return next.size === prev.size ? prev : next
    })
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
        <BannerRow key={c.callId} call={c} onOpen={handleOpen} onDismiss={handleDismiss} />
      ))}
    </div>
  )
}
