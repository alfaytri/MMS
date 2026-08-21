import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { humanizeDbError } from '@/lib/dbErrors'

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
  /** Units still under warranty = qty − Σ(claim_qty of claims not void/rejected). */
  remaining_qty: number
}

type PgError = { code?: string; message?: string; details?: string; hint?: string }

// Read from the `warranty_records_remaining` view (Stage 4) so every record row
// carries live remaining coverage. The view is security_invoker (RLS on the
// underlying warranty_records still applies) and is not in the generated types,
// so the `as never` / `as unknown as` cast mirrors the not-yet-typed-relation
// pattern used elsewhere (e.g. useWarrantyClaims.ts).
const RECORD_COLUMNS =
  'id, warranty_number, item_name, sku, qty, customer_id, division_id, policy_name_snapshot, coverage_type_snapshot, start_date, end_date, origin_name_snapshot, source_type, sale_order_id, sale_delivery_line_id, created_at, remaining_qty'

export function useWarrantyRecords(filters: { search?: string; divisionId?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.warranty.records(filters),
    queryFn: async (): Promise<WarrantyRecordRow[]> => {
      const supabase = createClient()
      let q = supabase
        .from('warranty_records_remaining' as never)
        .select(RECORD_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.divisionId) q = q.eq('division_id', filters.divisionId)
      if (filters.search) {
        const s = `%${filters.search}%`
        q = q.or(`warranty_number.ilike.${s},item_name.ilike.${s},sku.ilike.${s}`)
      }
      const { data, error } = (await q) as unknown as {
        data: WarrantyRecordRow[] | null
        error: PgError | null
      }
      if (error) throw new Error(humanizeDbError(error, 'load warranty records'))
      return (data ?? []) as WarrantyRecordRow[]
    },
    staleTime: 60_000,
  })
}
