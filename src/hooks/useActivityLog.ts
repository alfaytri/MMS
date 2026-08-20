import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { DBTable, Database } from '@/types/database.types'

export type ActivityLog = DBTable<'activity_log'>
export type AuditSeverity = Database['public']['Enums']['audit_severity']

export const AUDIT_MODULES = [
  'inventory', 'warehouses', 'profiles', 'custom_roles',
  'companies', 'currencies', 'payment_methods', 'country_codes',
  'brand_groups', 'reason_lists', 'approval_settings', 'work_schedules',
  'suppliers', 'customers',
  'purchase_orders', 'po_approvals', 'receivals', 'bills',
  'purchase_returns', 'debit_notes',
  'sale_orders', 'sale_approvals', 'invoices', 'sale_returns',
  'deliveries', 'credit_notes', 'sales',
  // Operational flows — now audited via DB triggers (migration 20260928000000):
  // consumption, warehouse transfers/custody moves, stock adjustments, tools &
  // assets, inventory checks, damaged stock, projects.
  'consumption', 'transfers', 'adjustments', 'damaged_stock',
  'inventory_checks', 'tools_assets', 'projects',
] as const

export const AUDIT_SEVERITIES = ['info', 'warning', 'error', 'critical'] as const satisfies readonly AuditSeverity[]

interface ActivityLogFilters {
  search?: string
  module?: string
  severity?: AuditSeverity
  entity_id?: string
  dateFrom?: string
  dateTo?: string
  allowedModules?: string[]
  page?: number
  pageSize?: number
}

export function useActivityLog(filters: ActivityLogFilters = {}) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = filters.pageSize ?? 50
  return useQuery({
    queryKey: queryKeys.activityLog.list(filters),
    queryFn: async () => {
      const supabase = createClient()
      // `count: 'exact'` gives the filtered total for pagination; `.range()`
      // pulls just the current page (was a flat `.limit(500)` — heavy, since
      // each row carries the wide old_data/new_data JSONB blobs).
      let query = supabase
        .from('activity_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (filters.module) {
        query = query.eq('module', filters.module)
      } else {
        query = query.in('module', AUDIT_MODULES as unknown as string[])
      }
      if (filters.entity_id) {
        query = query.eq('entity_id', filters.entity_id)
      }
      if (filters.severity) {
        query = query.eq('severity', filters.severity)
      }
      if (filters.dateFrom) {
        query = query.gte('created_at', `${filters.dateFrom}T00:00:00`)
      }
      if (filters.dateTo) {
        query = query.lte('created_at', `${filters.dateTo}T23:59:59`)
      }
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%').replace(/,/g, '\\,').replace(/\./g, '\\.')
        query = query.or(`action.ilike.%${safe}%,details.ilike.%${safe}%,performer_name.ilike.%${safe}%`)
      }

      const from = (page - 1) * pageSize
      query = query.range(from, from + pageSize - 1)

      const { data, error, count } = await query
      if (error) throw error
      return { rows: (data ?? []) as ActivityLog[], count: count ?? 0, page, pageSize }
    },
    // No refetchInterval: the audit log is human-paced, and each fetch pulls up
    // to 500 rows *including the wide old_data/new_data JSONB blobs*. Polling that
    // every 60s was pure egress. It now refetches only on remount / filter change
    // / invalidation (window-focus refetch is globally off in QueryProvider).
    // (Follow-up: narrow the list select to display columns + lazy-load the JSONB
    // on row-expand — tracked in docs/performance/2026-08-19-perf-audit.md #2.1.)
    staleTime: 30 * 1000,
  })
}
