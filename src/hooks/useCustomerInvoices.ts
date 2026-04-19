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
