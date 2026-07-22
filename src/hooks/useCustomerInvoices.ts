// src/hooks/useCustomerInvoices.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ArInvoice } from '@/types/invoice'
import { queryKeys } from '@/lib/queryKeys'

export type { ArInvoice }

export type ArFilters = {
  search?: string
  payment_status?: ArInvoice['payment_status'] | ''
}

export function useCustomerInvoices(filters?: ArFilters) {
  return useQuery({
    queryKey: queryKeys.customerInvoices.list(filters),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('customer_invoices')   // queries the VIEW
        .select('*, invoice_line_items(*), customers(name), sale_orders(so_number)')
        .order('created_at', { ascending: false })
      if (filters?.payment_status) q = q.eq('payment_status', filters.payment_status)
      if (filters?.search) q = q.ilike('invoice_id', `%${filters.search}%`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((inv) => ({
        ...inv,
        customer_name: inv.customers?.name ?? null,
        so_number: inv.sale_orders?.so_number ?? null,
      })) as ArInvoice[]
    },
  })
}

export function useCustomerInvoice(id: string | null) {
  return useQuery({
    queryKey: queryKeys.customerInvoices.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('customer_invoices')
        .select('*, invoice_line_items(*), customers(name), sale_orders(so_number)')
        .eq('id', id!)
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

export function useInvoicesBySO(soId: string | null) {
  return useQuery({
    queryKey: queryKeys.customerInvoices.bySo(soId),
    enabled: !!soId,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('so_invoices')
        .select('*, invoice_line_items(*), customers(name), sale_orders(so_number)')
        .eq('sale_order_id', soId!)
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
      const { data, error } = await supabase
        .rpc('generate_invoice_from_so', { p_so_id: soId })
      if (error) throw error
      return data as { id: string; invoice_id: string; invoice_type: string }
    },
    onSuccess: (_data, soId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerInvoices.bySo(soId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.customerInvoices.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.detail(soId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.activityLog.all })
    },
  })
}

export function useDismissRefresh() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('so_invoices')
        .update({ needs_refresh: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.customerInvoices.all }),
  })
}
