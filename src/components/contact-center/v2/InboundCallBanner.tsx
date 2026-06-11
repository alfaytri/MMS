'use client'

import { useEffect, useState } from 'react'
import { Phone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useInboundCallAlerts } from '@/hooks/contact-center/useInboundCallAlerts'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { useContactCenterContext } from '@/contexts/ContactCenterContext'
import { createClient } from '@/lib/supabase/client'

const BANNER_TTL_MS = 12_000

export function InboundCallBanner() {
  const { data: profile } = useCurrentUserProfile()
  const alert = useInboundCallAlerts(profile?.id ?? null)
  const { openCustomerByPhone, setCcSidebar } = useContactCenterContext()

  const [visible, setVisible]           = useState(false)
  const [customerName, setCustomerName] = useState<string | null>(null)

  useEffect(() => {
    if (!alert) return
    setVisible(true)
    setCustomerName(null)
    const t = setTimeout(() => setVisible(false), BANNER_TTL_MS)
    return () => clearTimeout(t)
  }, [alert?.id])

  useEffect(() => {
    if (!alert) return
    const supabase = createClient()
    supabase
      .from('service_customer_phones')
      .select('customer_id, service_customers ( name )')
      .eq('phone', alert.caller_phone)
      .maybeSingle()
      .then(({ data }) => {
        const name = (data as any)?.service_customers?.name as string | undefined
        if (name) setCustomerName(name)
      })
  }, [alert?.id, alert?.caller_phone])

  if (!alert || !visible) return null

  function handleOpen() {
    if (!alert) return
    openCustomerByPhone(alert.caller_phone)
    setCcSidebar('expanded')
    setVisible(false)
  }

  return (
    <div className="fixed top-2 right-2 z-[80] w-80 max-w-[calc(100vw-1rem)] rounded-md border border-border bg-background shadow-lg p-3 min-h-16">
      <div className="flex items-start gap-2">
        <Phone className="h-4 w-4 mt-0.5 text-green-600 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {customerName ?? 'Unknown caller'}
          </div>
          <div className="text-xs text-muted-foreground truncate">{alert.caller_phone}</div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={handleOpen} className="h-8">Open chat</Button>
          </div>
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6 -mr-1 -mt-1" onClick={() => setVisible(false)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
