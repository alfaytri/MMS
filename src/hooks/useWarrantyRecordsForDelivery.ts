// src/hooks/useWarrantyRecordsForDelivery.ts
//
// Returns every warranty_records row created by the given delivery.
// Feeds:
//   - "Print Warranty Certificate" button state (visible when >0 rows,
//     matching plan §UI 5)
//   - The certificate PDF payload itself

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { DBTable } from '@/types/database.types'

export type WarrantyRecord = DBTable<'warranty_records'>

export function useWarrantyRecordsForDelivery(deliveryId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.warranty.recordsForDelivery(deliveryId ?? null),
    queryFn: async (): Promise<WarrantyRecord[]> => {
      if (!deliveryId) return []
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warranty_records')
        .select(`
          *,
          sale_delivery_lines!inner(sale_delivery_id)
        `)
        .eq('sale_delivery_lines.sale_delivery_id', deliveryId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as WarrantyRecord[]
    },
    enabled: !!deliveryId,
    staleTime: 60 * 1000,
  })
}
