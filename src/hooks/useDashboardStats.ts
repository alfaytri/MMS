import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type DashboardStats = {
  openPOs: number
  pendingPOs: number
  openSOs: number
  pendingSOs: number
  receivalsThisWeek: number
  upcomingDeliveries: number
}

function startOfWeek(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: async (): Promise<DashboardStats> => {
      const supabase = createClient()

      const [openPOs, pendingPOs, openSOs, pendingSOs, receivalsWeek, deliveries] =
        await Promise.all([
          supabase
            .from('purchase_orders')
            .select('*', { count: 'exact', head: true })
            .in('status', ['draft', 'approved', 'partially_received'])
            .is('deleted_at', null),
          supabase
            .from('purchase_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending_approval')
            .is('deleted_at', null),
          supabase
            .from('sale_orders')
            .select('*', { count: 'exact', head: true })
            .in('status', ['confirmed', 'partial_delivery'])
            .is('deleted_at', null),
          supabase
            .from('sale_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending_approval')
            .is('deleted_at', null),
          supabase
            .from('receivals')
            .select('*', { count: 'exact', head: true })
            .gte('date', startOfWeek()),
          supabase
            .from('sale_deliveries')
            .select('*', { count: 'exact', head: true })
            .in('status', ['pending', 'in_progress']),
        ])

      return {
        openPOs: openPOs.count ?? 0,
        pendingPOs: pendingPOs.count ?? 0,
        openSOs: openSOs.count ?? 0,
        pendingSOs: pendingSOs.count ?? 0,
        receivalsThisWeek: receivalsWeek.count ?? 0,
        upcomingDeliveries: deliveries.count ?? 0,
      }
    },
    staleTime: 2 * 60 * 1000,
  })
}
