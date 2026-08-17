import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type MyWarehouse = { id: string; name: string; warehouse_kind: string | null }

/**
 * The REAL warehouses the current user is a Responsible Person of — the
 * "source" set for Picture Transfer (the worker never picks a source; it is
 * derived from his RP assignment). Backed by the SECURITY DEFINER RPC
 * `get_my_responsible_warehouses` (bypasses warehouse_responsible_persons RLS).
 */
export function useMyResponsibleWarehouses() {
  return useQuery({
    queryKey: ['my-responsible-warehouses'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MyWarehouse[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_my_responsible_warehouses' as never)
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as MyWarehouse[]
    },
  })
}
