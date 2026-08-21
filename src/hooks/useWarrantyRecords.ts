import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type WarrantyRecordRow = {
  id: string
  warranty_number: string
  item_name: string
  sku: string | null
  qty: number
  customer_id: string | null
  division_id: string | null
  policy_name_snapshot: string | null
  coverage_type_snapshot: string | null
  start_date: string | null
  end_date: string | null
  origin_name_snapshot: string | null
  source_type: string
  sale_order_id: string | null
  sale_delivery_line_id: string | null
  created_at: string | null
}

export function useWarrantyRecords(filters: { search?: string; divisionId?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.warranty.records(filters),
    queryFn: async (): Promise<WarrantyRecordRow[]> => {
      const supabase = createClient()
      let q = supabase
        .from('warranty_records')
        .select('id, warranty_number, item_name, sku, qty, customer_id, division_id, policy_name_snapshot, coverage_type_snapshot, start_date, end_date, origin_name_snapshot, source_type, sale_order_id, sale_delivery_line_id, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.divisionId) q = q.eq('division_id', filters.divisionId)
      if (filters.search) {
        const s = `%${filters.search}%`
        q = q.or(`warranty_number.ilike.${s},item_name.ilike.${s},sku.ilike.${s}`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as WarrantyRecordRow[]
    },
    staleTime: 60_000,
  })
}
