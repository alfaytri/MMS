// src/hooks/useRfqs.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type RfqStatus = 'draft' | 'sent' | 'received' | 'cancelled'

export type RfqLineItem = {
  id: string
  rfq_id: string
  item_name: string
  qty: number
  unit: string
  sku: string | null
  target_price: number | null
  created_at: string | null
}

export type RfqQuote = {
  id: string
  rfq_id: string
  supplier_id: string
  supplier_name: string
  currency: string | null
  items: Record<string, unknown>
  total_amount: number | null
  received_date: string | null
  created_at: string | null
}

export type Rfq = {
  id: string
  rfq_number: string
  title: string
  status: RfqStatus | null
  suppliers: string[] | null     // array of supplier name strings
  due_date: string
  created_date: string
  created_at: string | null
  updated_at: string | null
  rfq_line_items?: RfqLineItem[]
  rfq_quotes?: RfqQuote[]
}

export type CreateRfqPayload = {
  title: string
  due_date: string
  suppliers: string[]
  line_items: { item_name: string; qty: number; unit: string; sku: string; target_price: number | null }[]
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useRfqs(filters?: { status?: RfqStatus | '' }) {
  return useQuery({
    queryKey: ['rfqs', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('rfqs')
        .select('*, rfq_line_items(*), rfq_quotes(*)')
        .order('created_at', { ascending: false })
      if (filters?.status) q = q.eq('status', filters.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Rfq[]
    },
  })
}

export function useRfq(id: string | null) {
  return useQuery({
    queryKey: ['rfq', id],
    enabled: !!id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('rfqs')
        .select('*, rfq_line_items(*), rfq_quotes(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Rfq
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateRfq() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateRfqPayload) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('rfqs')
        .select('*', { count: 'exact', head: true })
      const rfq_number = `RFQ-${String((count ?? 0) + 1).padStart(5, '0')}`
      const today = new Date().toISOString().split('T')[0]

      const { data: rfq, error } = await (supabase as any)
        .from('rfqs')
        .insert({
          rfq_number,
          title: payload.title,
          due_date: payload.due_date,
          created_date: today,
          suppliers: payload.suppliers,
          status: 'draft',
        })
        .select()
        .single()
      if (error) throw error

      if (payload.line_items.length > 0) {
        const { error: liErr } = await (supabase as any)
          .from('rfq_line_items')
          .insert(payload.line_items.map((li) => ({ rfq_id: rfq.id, ...li })))
        if (liErr) throw liErr
      }
      return rfq as Rfq
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rfqs'] }),
  })
}

export function useUpdateRfq() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      ...rest
    }: Partial<CreateRfqPayload> & { id: string; status?: RfqStatus }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('rfqs')
        .update({ ...(status ? { status } : {}), ...rest })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rfqs'] }),
  })
}

export function useCreateRfqQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      rfq_id: string
      supplier_id: string
      supplier_name: string
      currency: string
      items: Record<string, unknown>
      total_amount: number
      received_date: string
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any).from('rfq_quotes').insert(payload)
      if (error) throw error
      // Mark RFQ as received when a quote is added
      await (supabase as any)
        .from('rfqs')
        .update({ status: 'received' })
        .eq('id', payload.rfq_id)
    },
    onSuccess: (_data: unknown, vars: { rfq_id: string; supplier_id: string; supplier_name: string; currency: string; items: Record<string, unknown>; total_amount: number; received_date: string }) => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] })
      queryClient.invalidateQueries({ queryKey: ['rfq', vars.rfq_id] })
    },
  })
}

export function useDeleteRfq() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any).from('rfqs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rfqs'] }),
  })
}
