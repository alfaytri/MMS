'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface InboundCallAlert {
  id:              string
  conversation_id: string
  caller_phone:    string
  customer_name:   string | null
  created_at:      string
}

function parseCallerPhone(text: string | null): string | null {
  if (!text) return null
  const m = text.match(/Inbound call from (\+\d+)/i)
  return m ? m[1] : null
}

export function useInboundCallAlerts(myProfileId: string | null): InboundCallAlert | null {
  const [alert, setAlert] = useState<InboundCallAlert | null>(null)

  useEffect(() => {
    if (!myProfileId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`inbound-calls-${myProfileId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'chat_messages',
          filter: `sent_by_profile_id=eq.${myProfileId}`,
        },
        (payload) => {
          const row = payload.new as {
            id:              string
            conversation_id: string
            source:          string | null
            message_kind:    string | null
            from_type:       string | null
            text:            string | null
            created_at:      string
          }
          if (row.source !== '3cx_call')           return
          if (row.message_kind !== 'event')        return
          if (row.from_type !== 'customer')         return
          const caller = parseCallerPhone(row.text)
          if (!caller)                             return
          setAlert({
            id:              row.id,
            conversation_id: row.conversation_id,
            caller_phone:    caller,
            customer_name:   null,
            created_at:      row.created_at,
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [myProfileId])

  return alert
}
