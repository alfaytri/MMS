import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type SaleReturn = {
  id: string
  return_number: string
  source_type: 'sale_order'
  source_id: string
  date: string
  reason: string
  items: {
    item_name: string
    sku: string | null
    qty: number
    condition: 'good' | 'damaged'
    brand_variant_id: string | null
  }[]
  restock_warehouse_id: string | null
  notes: string | null
  status: 'pending' | 'received' | 'restocked' | 'closed'
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export function useSaleReturns(filters: { search?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ['sale-returns', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('returns')
        .select('*')
        .eq('source_type', 'sale_order')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filters.status) q = q.eq('status', filters.status)
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        q = q.ilike('return_number', `%${safe}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as SaleReturn[]
    },
    staleTime: 30 * 1000,
  })
}

export function useCreateSaleReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      source_id: string
      date: string
      reason: string
      items: SaleReturn['items']
      restock_warehouse_id: string | null
      notes: string | null
    }) => {
      const supabase = createClient()

      // Generate return number
      const { count } = await (supabase as any)
        .from('returns')
        .select('*', { count: 'exact', head: true })
        .eq('source_type', 'sale_order')
      const return_number = `SR-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data, error } = await (supabase as any)
        .from('returns')
        .insert({
          return_number,
          source_type: 'sale_order',
          source_id: payload.source_id,
          date: payload.date,
          reason: payload.reason,
          items: payload.items,
          restock_warehouse_id: payload.restock_warehouse_id,
          notes: payload.notes,
          status: 'pending',
        })
        .select()
        .single()
      if (error) throw error
      return data as SaleReturn
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns'] })
      queryClient.invalidateQueries({ queryKey: ['sale-returns-by-so'] })
    },
  })
}

export function useUpdateReturnStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SaleReturn['status'] }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('returns')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns'] })
      queryClient.invalidateQueries({ queryKey: ['sale-returns-by-so'] })
    },
  })
}

export function useReturnsBySO(soId: string | null) {
  return useQuery({
    queryKey: ['sale-returns-by-so', soId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('returns')
        .select('*')
        .eq('source_type', 'sale_order')
        .eq('source_id', soId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as SaleReturn[]
    },
    enabled: !!soId,
    staleTime: 30 * 1000,
  })
}
