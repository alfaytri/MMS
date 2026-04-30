import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'

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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns'] })
      queryClient.invalidateQueries({ queryKey: ['sale-returns-by-so'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      const damagedCount = data.items.filter((i) => i.condition === 'damaged').reduce((s, i) => s + i.qty, 0)
      const goodCount    = data.items.filter((i) => i.condition === 'good').reduce((s, i) => s + i.qty, 0)
      const parts = []
      if (goodCount > 0)    parts.push(`${goodCount} good`)
      if (damagedCount > 0) parts.push(`${damagedCount} damaged`)
      logActivity({
        action:    'Return Created',
        module:    'sale_orders',
        entity_id: data.source_id,
        details:   `${data.return_number} · ${parts.join(', ')} item(s) · ${data.reason}`,
        severity:  damagedCount > 0 ? 'warning' : 'info',
      })
    },
  })
}

export function useUpdateReturnStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SaleReturn['status'] }) => {
      const supabase = createClient()

      const { data: ret, error: fetchErr } = await (supabase as any)
        .from('returns')
        .select('source_id, return_number')
        .eq('id', id)
        .single()
      if (fetchErr) throw fetchErr

      const { error } = await (supabase as any)
        .from('returns')
        .update({ status })
        .eq('id', id)
      if (error) throw error

      if (status === 'restocked') {
        const { error: rpcError } = await (supabase as any)
          .rpc('rpc_process_return_restock', { p_return_id: id })
        if (rpcError) throw rpcError
      }

      return ret as { source_id: string; return_number: string }
    },
    onSuccess: (ret, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns'] })
      queryClient.invalidateQueries({ queryKey: ['sale-returns-by-so'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      if (variables.status === 'restocked') {
        queryClient.invalidateQueries({ queryKey: ['brand-variants-v2'] })
      }
      const label: Record<SaleReturn['status'], string> = {
        pending:   'Return Marked Pending',
        received:  'Return Received',
        restocked: 'Return Restocked',
        closed:    'Return Closed',
      }
      logActivity({
        action:    label[variables.status],
        module:    'sale_orders',
        entity_id: ret.source_id,
        details:   ret.return_number,
        severity:  variables.status === 'restocked' ? 'info' : 'info',
      })
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
