'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ServiceBrand } from '@/types/contracts'
import { queryKeys } from '@/lib/queryKeys'

export function useServiceBrands(serviceId: string | null) {
  const supabase = createClient()

  return useQuery<ServiceBrand[]>({
    queryKey: queryKeys.serviceBrands.byService(serviceId),
    queryFn: async () => {
      if (!serviceId) return []
      const { data, error } = await supabase
        .from('service_brands')
        .select('*, brands(name, name_ar)')
        .eq('service_id', serviceId)

      if (error) throw error
      return (data || []).map((sb: any) => ({
        id: sb.id,
        service_id: sb.service_id,
        brand_id: sb.brand_id,
        brand_name: sb.brands?.name ?? '',
        reliability_factor: sb.reliability_factor,
        is_reliable: sb.is_reliable,
      }))
    },
    enabled: !!serviceId,
  })
}
