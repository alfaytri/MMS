import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type ActivityLog = {
  id: string
  action: string
  module: string | null
  severity: string | null
  performer_name: string | null
  details: string | null
  old_data: unknown
  new_data: unknown
  ip_address: string | null
  created_at: string
  entity_type: string
  entity_id: string
}

interface ActivityLogFilters {
  search?: string
  module?: string
  severity?: string
  entity_id?: string
}

export function useActivityLog(filters: ActivityLogFilters = {}) {
  return useQuery({
    queryKey: ['activity-log', filters],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from('activity_log') as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

      if (filters.module) {
        query = query.eq('module', filters.module)
      }
      if (filters.entity_id) {
        query = query.eq('entity_id', filters.entity_id)
      }
      if (filters.severity) {
        query = query.eq('severity', filters.severity)
      }
      if (filters.search) {
        // Escape % and special PostgREST characters to prevent filter injection
        const safe = filters.search.replace(/%/g, '\\%').replace(/,/g, '\\,').replace(/\./g, '\\.')
        query = query.or(`action.ilike.%${safe}%,details.ilike.%${safe}%,performer_name.ilike.%${safe}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data as ActivityLog[]
    },
    enabled: !!(filters.module || filters.entity_id || filters.search),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  })
}

export const AUDIT_MODULES = [
  'companies', 'divisions', 'warehouses', 'inventory', 'suppliers',
  'profiles', 'custom_roles', 'purchase_orders', 'po_approvals',
  'receivals', 'shipments', 'landed_costs', 'sale_orders',
  'deliveries', 'payments', 'stock_adjustments', 'warehouse_transfers',
  'inventory_checks', 'settings',
] as const

export const AUDIT_SEVERITIES = ['info', 'warning', 'critical'] as const
