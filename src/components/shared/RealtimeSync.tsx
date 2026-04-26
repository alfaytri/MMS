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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, (payload: any) => {
        const id = payload.new?.id ?? payload.old?.id
        if (id) queryClient.invalidateQueries({ queryKey: ['purchase-order', id] })
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'], refetchType: 'active' })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'po_approvals' }, (payload: any) => {
        const poId = payload.new?.po_id ?? payload.old?.po_id
        if (poId) {
          queryClient.invalidateQueries({ queryKey: ['purchase-order', poId] })
          queryClient.invalidateQueries({ queryKey: ['po-approvals', poId], refetchType: 'active' })
        }
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'], refetchType: 'active' })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receivals' }, (payload: any) => {
        const id = payload.new?.id ?? payload.old?.id
        const poId = payload.new?.po_id ?? payload.old?.po_id
        if (id) queryClient.invalidateQueries({ queryKey: ['receival', id] })
        if (poId) {
          queryClient.invalidateQueries({ queryKey: ['po-receivals', poId], refetchType: 'active' })
          queryClient.invalidateQueries({ queryKey: ['purchase-order', poId] })
        }
        queryClient.invalidateQueries({ queryKey: ['receivals'], refetchType: 'active' })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'], refetchType: 'active' })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])

  return null
}
