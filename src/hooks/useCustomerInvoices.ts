// src/hooks/useCustomerInvoices.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ArInvoice } from '@/types/invoice'

export type { ArInvoice }

export type ArFilters = {
  search?: string
  doc_status?: ArInvoice['doc_status'] | ''
  payment_status?: ArInvoice['payment_status'] | ''
}

export function useCustomerInvoices(filters?: ArFilters) {
  return useQuery({
    queryKey: ['customer-invoices', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('customer_invoices')   // queries the VIEW
        .select('*, invoice_line_items(*), customers(name), sale_orders(so_number)')
        .order('created_at', { ascending: false })
      if (filters?.doc_status) q = q.eq('doc_status', filters.doc_status)
      if (filters?.payment_status) q = q.eq('payment_status', filters.payment_status)
      if (filters?.search) q = q.ilike('invoice_id', `%${filters.search}%`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((inv: any) => ({
        ...inv,
        customer_name: inv.customers?.name ?? null,
        so_number: inv.sale_orders?.so_number ?? null,
      })) as ArInvoice[]
    },
  })
}

export function useCustomerInvoice(id: string | null) {
  return useQuery({
    queryKey: ['customer-invoice', id],
    enabled: !!id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('customer_invoices')
        .select('*, invoice_line_items(*), customers(name), sale_orders(so_number)')
        .eq('id', id)
        .single()
      if (error) throw error
      return {
        ...data,
        customer_name: data.customers?.name ?? null,
        so_number: data.sale_orders?.so_number ?? null,
      } as ArInvoice
    },
  })
}

export function useSendInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('invoices')
        .update({ doc_status: 'sent' })
        .eq('id', id)
        .eq('direction', 'ar')
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-invoices'] }),
  })
}

export function useInvoicesBySO(soId: string | null) {
  return useQuery({
    queryKey: ['invoices-by-so', soId],
    enabled: !!soId,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select('*, invoice_line_items(*), customers(name), sale_orders(so_number)')
        .eq('sale_order_id', soId!)
        .eq('direction', 'ar')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        ...data,
        customer_name: data.customers?.name ?? null,
        so_number:     data.sale_orders?.so_number ?? null,
      } as ArInvoice
    },
  })
}

export function useGenerateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (soId: string) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .rpc('generate_invoice_from_so', { p_so_id: soId })
      if (error) throw error
      return data as { id: string; invoice_id: string; invoice_type: string }
    },
    onSuccess: (_data, soId) => {
      queryClient.invalidateQueries({ queryKey: ['invoices-by-so', soId] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', soId] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
    },
  })
}

export function useDismissRefresh() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('invoices')
        .update({ needs_refresh: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-invoices'] }),
  })
}
