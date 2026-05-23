// src/hooks/useInvoices.ts
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import type { ArInvoice, InvoiceLineItem } from '@/types/invoice'

const PAGE_SIZE = 50

export type InvoiceFilters = {
  status?: string
  invoiceSearch?: string
  customerSearch?: string
  issuedFrom?: string
  issuedTo?: string
  dueFrom?: string
  dueTo?: string
  source?: string
  agent?: string
  sortField?: 'due_date' | 'total_amount'
  sortAsc?: boolean
}

export type FinanceInvoice = ArInvoice & {
  qb_synced: boolean
  phone?: string | null
  payments?: {
    id: string
    payment_id: string | null
    amount: number
    method: string
    date: string
    reference: string | null
    status: string | null
  }[]
}

export function useInvoices(filters: InvoiceFilters = {}) {
  return useInfiniteQuery({
    queryKey: ['invoices', filters],
    queryFn: async ({ pageParam = 0 }) => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('invoices')
        .select(`
          *,
          customers!inner(name, customer_phones(phone, is_primary)),
          payments(id, payment_id, amount, method, date, reference, status, deleted_at),
          invoice_line_items(*)
        `)
        .eq('direction', 'ar')
        .order(filters.sortField ?? 'created_at', {
          ascending: filters.sortAsc ?? false,
        })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1)

      // Status filter
      if (filters.status) q = q.eq('payment_status', filters.status)

      // Date filters
      if (filters.issuedFrom) q = q.gte('issued_date', filters.issuedFrom)
      if (filters.issuedTo) q = q.lte('issued_date', filters.issuedTo)
      if (filters.dueFrom) q = q.gte('due_date', filters.dueFrom)
      if (filters.dueTo) q = q.lte('due_date', filters.dueTo)

      // Search — separate invoice and customer filters
      if (filters.invoiceSearch) {
        const safe = filters.invoiceSearch.replace(/%/g, '\\%')
        q = q.ilike('invoice_id', `%${safe}%`)
      }
      if (filters.customerSearch) {
        const safe = filters.customerSearch.replace(/%/g, '\\%')
        q = q.ilike('customers.name', `%${safe}%`)
      }

      // Source filter
      if (filters.source) q = q.eq('source_type', filters.source)

      // Agent filter
      if (filters.agent) q = q.eq('agent_name', filters.agent)

      const { data, error } = await q
      if (error) throw error

      const mapped = (data ?? []).map((inv: any) => {
        const primaryPhone = inv.customers?.customer_phones?.find(
          (p: any) => p.is_primary
        )
        // Normalize payment_status: lifecycle states (void/cancelled) override payment tracking
        const effectivePaymentStatus =
          inv.status === 'void' || inv.status === 'cancelled'
            ? inv.status
            : inv.payment_status
        return {
          ...inv,
          payment_status: effectivePaymentStatus,
          customer_name: inv.customers?.name ?? null,
          phone: primaryPhone?.phone ?? null,
          payments: (inv.payments ?? []).filter(
            (p: any) => p.deleted_at == null
          ),
          invoice_line_items: inv.invoice_line_items ?? [],
        } as FinanceInvoice
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

export type InvoiceSummary = {
  status_counts: Record<string, number>
  outstanding: number
}

export function useInvoiceSummary() {
  return useQuery({
    queryKey: ['invoice-summary'],
    queryFn: async (): Promise<InvoiceSummary> => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('get_invoice_summary')
      if (error) throw error
      return data as InvoiceSummary
    },
    staleTime: 30_000,
  })
}

// ── Mutations ───────────────────────────────────────────────────────────

export function useVoidInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      invoiceId: string
      invoiceDisplay: string
      customerName: string
      reason: string
      notes: string | null
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('invoices')
        .update({
          status: 'void',
          notes: [payload.reason, payload.notes].filter(Boolean).join(' — '),
        })
        .eq('id', payload.invoiceId)
        .eq('direction', 'ar')
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice-summary'] })
      queryClient.invalidateQueries({ queryKey: ['pending-payments'] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
      logActivity({
        action: 'Invoice Voided',
        module: 'invoices',
        entity_id: vars.invoiceId,
        details: `${vars.invoiceDisplay} voided for ${vars.customerName} — ${vars.reason}`,
        severity: 'critical',
      })
    },
  })
}

export function useIssueCreditNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      invoiceId: string
      invoiceDisplay: string
      customerName: string
      type: 'full' | 'partial'
      amount: number
      reason: string
      lineItems: InvoiceLineItem[]
    }) => {
      const supabase = createClient()
      const creditNoteId = `CN-${crypto.randomUUID().slice(0, 8)}`

      // Fetch invoice for customer info
      const { data: inv } = await (supabase as any)
        .from('invoices')
        .select('customer_id, total_amount')
        .eq('id', payload.invoiceId)
        .single()

      // Insert credit note
      const { data: cn, error: cnErr } = await (supabase as any)
        .from('credit_notes')
        .insert({
          credit_note_id: creditNoteId,
          invoice_id: payload.invoiceId,
          customer_name: payload.customerName,
          note_type: 'credit',
          amount: payload.type === 'full'
            ? inv?.total_amount ?? payload.amount
            : payload.amount,
          reason: payload.reason,
          original_total: inv?.total_amount,
        })
        .select('id')
        .single()
      if (cnErr) throw cnErr

      // Insert credit note lines
      if (payload.type === 'full') {
        const lines = payload.lineItems.map((li) => ({
          credit_note_id: cn.id,
          invoice_line_id: li.id,
          description: li.description,
          qty: li.qty,
          unit_price: li.unit_price,
        }))
        if (lines.length > 0) {
          const { error: lineErr } = await (supabase as any)
            .from('credit_note_lines')
            .insert(lines)
          if (lineErr) throw lineErr
        }
      } else {
        const { error: lineErr } = await (supabase as any)
          .from('credit_note_lines')
          .insert({
            credit_note_id: cn.id,
            description: `Partial refund — ${payload.reason}`,
            qty: 1,
            unit_price: payload.amount,
          })
        if (lineErr) throw lineErr
      }

      return { creditNoteId }
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
      logActivity({
        action: 'Credit Note Issued',
        module: 'invoices',
        entity_id: vars.invoiceId,
        details: `${result.creditNoteId} (${vars.type}) against ${vars.invoiceDisplay} — ${vars.reason}`,
        severity: 'critical',
      })
    },
  })
}

export function useBulkQbSyncInvoices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('invoices')
        .update({ qb_synced: true })
        .in('id', invoiceIds)
      if (error) throw error
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      logActivity({
        action: 'Invoices QB Synced',
        module: 'invoices',
        entity_id: ids[0],
        details: `${ids.length} invoice(s) marked as transferred to QuickBooks`,
        severity: 'info',
      })
    },
  })
}
