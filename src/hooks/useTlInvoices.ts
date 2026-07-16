import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'
import type { DBInsert } from '@/types/database.types'

const PAGE_SIZE = 50

export type TlInvoiceStatus = 'unpaid' | 'partial' | 'paid'

export type TlInvoiceFilters = {
  status?: TlInvoiceStatus
  invoiceSearch?: string
  customerSearch?: string
  issuedFrom?: string
  issuedTo?: string
  agent?: string
  sortField?: 'created_at' | 'total_amount'
  sortAsc?: boolean
}

export type TlInvoice = {
  id: string
  invoice_number: string
  order_id: string | null
  visit_id: string
  customer_name: string
  customer_phone: string | null
  subtotal: number
  discount_amount: number
  total_amount: number
  paid_amount: number
  payment_status: TlInvoiceStatus
  payment_method_id: string | null
  payment_method_name: string | null
  notes: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
  lines: {
    id: string
    name: string
    qty: number
    unit_price: number
    total: number
  }[]
  payments: {
    id: string
    amount: number
    method_slug: string | null
    paid_at: string
    registered_by_name: string | null
    notes: string | null
  }[]
}

// Small tolerance for floating-point display rounding (0.005 QAR).
const EPS = 0.005

export function validateTlPaymentAmount(args: {
  total: number
  alreadyPaid: number
  newAmount: number
}): string | null {
  if (!Number.isFinite(args.newAmount) || args.newAmount <= 0) {
    return 'Amount must be greater than zero'
  }
  const remaining = args.total - args.alreadyPaid
  if (args.newAmount - remaining > EPS) {
    return `Amount exceeds remaining balance (${remaining.toFixed(2)})`
  }
  return null
}

export function useTlInvoices(filters: TlInvoiceFilters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.tlInvoices.list(filters),
    queryFn: async ({ pageParam = 0 }) => {
      const supabase = createClient()
      let q = supabase
        .from('tl_invoices')
        .select(`
          id, invoice_number, order_id, visit_id,
          customer_name, customer_phone,
          subtotal, discount_amount, total_amount, paid_amount,
          payment_status, payment_method_id, notes,
          created_by, created_at,
          payment_methods:payment_method_id(name),
          profiles:created_by(full_name),
          tl_invoice_lines(id, name, qty, unit_price, total),
          tl_invoice_payments(id, amount, method_slug, paid_at, registered_by_name, notes)
        `)
        .order(filters.sortField ?? 'created_at', { ascending: filters.sortAsc ?? false })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1)
        .limit(PAGE_SIZE)

      if (filters.status)         q = q.eq('payment_status', filters.status)
      if (filters.issuedFrom)     q = q.gte('created_at', filters.issuedFrom)
      if (filters.issuedTo)       q = q.lte('created_at', filters.issuedTo + 'T23:59:59')
      if (filters.invoiceSearch) {
        const safe = filters.invoiceSearch.replace(/%/g, '\\%')
        q = q.ilike('invoice_number', `%${safe}%`)
      }
      if (filters.customerSearch) {
        const safe = filters.customerSearch.replace(/%/g, '\\%')
        q = q.ilike('customer_name', `%${safe}%`)
      }
      if (filters.agent) {
        // filter client-side after fetch — created_by_name lives in profiles join
      }

      const { data, error } = await q
      if (error) throw error

      const mapped: TlInvoice[] = (data ?? []).map((row: any) => ({
        id:                  row.id,
        invoice_number:      row.invoice_number,
        order_id:            row.order_id,
        visit_id:            row.visit_id,
        customer_name:       row.customer_name,
        customer_phone:      row.customer_phone,
        subtotal:            Number(row.subtotal ?? 0),
        discount_amount:     Number(row.discount_amount ?? 0),
        total_amount:        Number(row.total_amount ?? 0),
        paid_amount:         Number(row.paid_amount ?? 0),
        payment_status:      row.payment_status,
        payment_method_id:   row.payment_method_id,
        payment_method_name: row.payment_methods?.name ?? null,
        notes:               row.notes,
        created_by:          row.created_by,
        created_by_name:     row.profiles?.full_name ?? null,
        created_at:          row.created_at,
        lines:               (row.tl_invoice_lines ?? []).map((l: any) => ({
          id: l.id, name: l.name, qty: Number(l.qty), unit_price: Number(l.unit_price), total: Number(l.total),
        })),
        payments:            (row.tl_invoice_payments ?? []).map((p: any) => ({
          id: p.id, amount: Number(p.amount), method_slug: p.method_slug,
          paid_at: p.paid_at, registered_by_name: p.registered_by_name, notes: p.notes,
        })),
      }))

      const filtered = filters.agent
        ? mapped.filter((inv) => inv.created_by_name === filters.agent)
        : mapped

      return {
        items:    filtered,
        nextPage: mapped.length === PAGE_SIZE ? pageParam + 1 : undefined,
      }
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage,
    staleTime: 30_000,
  })
}

export function useTlInvoiceSummary() {
  return useQuery({
    queryKey: queryKeys.tlInvoices.summary,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tl_invoices')
        .select('payment_status, total_amount, paid_amount')
        .limit(10_000)
      if (error) throw error

      const counts: Record<TlInvoiceStatus, number> = { unpaid: 0, partial: 0, paid: 0 }
      let outstanding = 0
      for (const row of data ?? []) {
        const s = row.payment_status as TlInvoiceStatus
        counts[s] = (counts[s] ?? 0) + 1
        outstanding += Math.max(0, Number(row.total_amount ?? 0) - Number(row.paid_amount ?? 0))
      }
      return { status_counts: counts, outstanding }
    },
    staleTime: 30_000,
  })
}

export function useRegisterTlInvoicePayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      tlInvoiceId: string
      invoiceNumber: string
      customerName: string
      amount: number
      paymentMethodId: string | null
      methodSlug: string | null
      notes: string | null
      registeredBy: string | null
      registeredByName: string | null
    }) => {
      const supabase = createClient()

      // Server-side overpayment guard: re-fetch total + sum of existing payments,
      // reject if this insert would exceed the total. The trigger caps
      // payment_status but does NOT block overpayment on its own.
      const { data: inv, error: invErr } = await supabase
        .from('tl_invoices')
        .select('total_amount, paid_amount')
        .eq('id', payload.tlInvoiceId)
        .single()
      if (invErr) throw invErr

      const violation = validateTlPaymentAmount({
        total:       Number(inv.total_amount ?? 0),
        alreadyPaid: Number(inv.paid_amount ?? 0),
        newAmount:   payload.amount,
      })
      if (violation) throw new Error(violation)

      const { data: row, error } = await supabase
        .from('tl_invoice_payments')
        .insert({
          tl_invoice_id:      payload.tlInvoiceId,
          amount:             payload.amount,
          payment_method_id:  payload.paymentMethodId,
          method_slug:        payload.methodSlug,
          registered_by:      payload.registeredBy,
          registered_by_name: payload.registeredByName,
          notes:              payload.notes,
        } as unknown as DBInsert<'tl_invoice_payments'>)
        .select('id')
        .single()
      if (error) throw error

      return { paymentId: (row as { id: string }).id }
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tlInvoices.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.tlInvoices.summary })
      logActivity({
        action:    'Orders Payment Registered',
        module:    'orders-invoices',
        entity_id: vars.tlInvoiceId,
        details:   `${vars.methodSlug ?? 'payment'} ${vars.amount} recorded against ${vars.invoiceNumber} (${vars.customerName}) by ${vars.registeredByName ?? '—'}`,
        severity:  'info',
      })
      return result
    },
  })
}
