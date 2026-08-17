import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type TransferSource = {
  warehouse_id: string
  warehouse_name: string
  sub_container_id: string
  sub_container_name: string
}

/**
 * The (warehouse, sub-container) pairs the current user may send FROM in
 * Picture Transfer — derived from BOTH warehouse-level RP assignment and
 * sub-container-level RP (`warehouse_sub_containers.responsible_person_profile_id`).
 * Backed by the SECURITY DEFINER RPC `get_my_transfer_sources`.
 */
export function useMyTransferSources() {
  return useQuery({
    queryKey: ['my-transfer-sources'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TransferSource[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_my_transfer_sources' as never)
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as TransferSource[]
    },
  })
}
