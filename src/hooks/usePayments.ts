// src/hooks/usePayments.ts
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'

const PAGE_SIZE = 50

export type PaymentFilters = {
  status?: string
  method?: string
  search?: string
  dateFrom?: string
  dateTo?: string
  invoiceSearch?: string
  customerSearch?: string
  refSearch?: string
  agent?: string
  sortField?: 'date' | 'amount'
  sortAsc?: boolean
}

export type FinancePayment = {
  id: string
  payment_id: string | null
  invoice_id: string | null
  customer_id: string | null
  source_type: string | null
  source_id: string | null
  amount: number
  method: string
  date: string
  reference: string | null
  transaction_id: string | null
  cheque_number: string | null
  cheque_date: string | null
  bank_name: string | null
  notes: string | null
  direction: 'incoming'
  status: string | null
  qb_synced: boolean
  created_at: string | null
  agent_name: string | null
  // resolved from joins
  invoice_display: string | null
  invoice_total: number | null
  invoice_paid: number | null
  invoice_source_type: string | null
  customer_name: string | null
  phone: string | null
}

export function usePayments(filters: PaymentFilters = {}) {
  return useInfiniteQuery({
    queryKey: ['payments', filters],
    queryFn: async ({ pageParam = 0 }) => {
      const supabase = createClient()

      // 1. Fetch payments page with joined relations — all filtering at DB level
      let q = (supabase as any)
        .from('payments')
        .select(`
          *,
          invoices(invoice_id, total_amount, paid_amount, source_type, customer_id),
          customers!payments_customer_id_fkey(name, customer_phones(phone, is_primary))
        `)
        .eq('direction', 'incoming')
        .is('deleted_at', null)
        .order(filters.sortField ?? 'created_at', {
          ascending: filters.sortAsc ?? false,
        })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1)

      if (filters.status) q = q.eq('status', filters.status)
      if (filters.method) q = q.eq('method', filters.method)
      if (filters.agent) q = q.eq('agent_name', filters.agent)
      if (filters.dateFrom) q = q.gte('date', filters.dateFrom)
      if (filters.dateTo) q = q.lte('date', filters.dateTo)
      if (filters.refSearch) {
        const safe = filters.refSearch.replace(/%/g, '\\%')
        q = q.or(
          `reference.ilike.%${safe}%,transaction_id.ilike.%${safe}%,cheque_number.ilike.%${safe}%`
        )
      }

      // DB-level filtering on joined tables — no client-side filtering needed
      if (filters.invoiceSearch) {
        const safe = filters.invoiceSearch.replace(/%/g, '\\%')
        q = q.ilike('invoices.invoice_id', `%${safe}%`)
      }
      if (filters.customerSearch) {
        const safe = filters.customerSearch.replace(/%/g, '\\%')
        q = q.ilike('customers.name', `%${safe}%`)
      }

      const { data: rawPayments, error } = await q
      if (error) throw error
      const payments = rawPayments ?? []

      // 2. Map joined data to FinancePayment — no batch lookups needed
      const mapped: FinancePayment[] = payments.map((p: any) => {
        const inv = p.invoices
        const cust = p.customers
        const primaryPhone = cust?.customer_phones?.find(
          (ph: any) => ph.is_primary
        )
        return {
          ...p,
          invoices: undefined, // remove nested join objects
          customers: undefined,
          invoice_display: inv?.invoice_id ?? null,
          invoice_total: inv?.total_amount ?? null,
          invoice_paid: inv?.paid_amount ?? null,
          invoice_source_type: inv?.source_type ?? null,
          customer_name: cust?.name ?? null,
          phone: primaryPhone?.phone ?? null,
        }
      })

      return {
        items: mapped,
        nextPage: mapped.length === PAGE_SIZE ? pageParam + 1 : undefined,
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: 30_000,
  })
}

// ── Server-side aggregates (not affected by pagination) ─────────────────

export type PaymentSummary = {
  status_counts: Record<string, number>
  collected: number
  method_totals: Record<string, number>
}

export function usePaymentSummary() {
  return useQuery({
    queryKey: ['payment-summary'],
    queryFn: async (): Promise<PaymentSummary> => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('get_payment_summary')
      if (error) throw error
      return data as PaymentSummary
    },
    staleTime: 30_000,
  })
}

// ── Mutations ───────────────────────────────────────────────────────────

export function useBulkQbSyncPayments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (paymentIds: string[]) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('payments')
        .update({ qb_synced: true })
        .in('id', paymentIds)
      if (error) throw error
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['payment-summary'] })
      logActivity({
        action: 'Payments QB Synced',
        module: 'payments',
        entity_id: ids[0],
        details: `${ids.length} payment(s) marked as transferred to QuickBooks`,
        severity: 'info',
      })
    },
  })
}
