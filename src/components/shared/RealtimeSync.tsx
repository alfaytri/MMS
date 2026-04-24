'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function RealtimeSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
        queryClient.invalidateQueries({ queryKey: ['purchase-order'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'po_approvals' }, () => {
        queryClient.invalidateQueries({ queryKey: ['po-approvals'] })
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
        queryClient.invalidateQueries({ queryKey: ['purchase-order'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receivals' }, (payload: any) => {
        queryClient.invalidateQueries({ queryKey: ['receivals'] })
        if (payload.new?.po_id || payload.old?.po_id) {
          const poId = payload.new?.po_id ?? payload.old?.po_id
          queryClient.invalidateQueries({ queryKey: ['po-receivals', poId] })
          queryClient.invalidateQueries({ queryKey: ['purchase-order', poId] })
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])

  return null
}
