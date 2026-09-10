'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'
import type { ContractInvoice } from '@/types/contracts'

// Wrap a Supabase/PostgREST error into a real Error carrying the full server
// message (code/message/details/hint) — PostgrestError is not an Error subclass,
// so a bare throw would surface as a generic "[object Object]".
function toError(e: { message?: string; details?: string; hint?: string; code?: string } | null, fallback: string): Error {
  if (!e) return new Error(fallback)
  const msg = [e.code, e.message, e.details, e.hint].filter(Boolean).join(' — ')
  return new Error(msg || fallback)
}

// Minimal chainable shape for the loosely-typed contract_invoices read (the
// tables are not yet in the generated database.types.ts — see the query below).
type PgResult = {
  data: Record<string, unknown>[] | null
  error: { message?: string; details?: string; hint?: string; code?: string } | null
}
type PgBuilder = {
  select: (q: string) => PgBuilder
  eq: (col: string, val: unknown) => PgBuilder
  order: (col: string, opts: { ascending: boolean }) => Promise<PgResult>
}

/** All contract invoices for a contract (with lines + payments), due-date order. */
export function useContractInvoices(contractId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.contractInvoices.byContract(contractId ?? null),
    enabled: !!contractId,
    staleTime: 30_000,
    queryFn: async (): Promise<ContractInvoice[]> => {
      if (!contractId) return []
      const supabase = createClient()
      // contract_invoices/_lines/_payments are new on the full-build Dev DB and
      // are not yet in the generated database.types.ts (a full types regen is
      // deferred to avoid whole-file churn mid-feature); the builder is loosely
      // typed to bypass the stale table union. Rows are mapped explicitly below.
      const db = supabase as unknown as { from: (t: string) => PgBuilder }
      const { data, error } = await db.from('contract_invoices')
        .select(`
          id, invoice_number, contract_id, contract_payment_id, customer_name, customer_phone,
          due_date, subtotal, discount_amount, total_amount, paid_amount, payment_status,
          pdf_url, sent_at, created_at,
          contract_invoice_lines(id, name, qty, unit_price, total, sort_order),
          contract_invoice_payments(id, amount, method_slug, paid_at, registered_by_name, notes,
                                    payment_methods:payment_method_id(name))
        `)
        .eq('contract_id', contractId)
        .order('due_date', { ascending: true })
      if (error) throw toError(error, 'Failed to load contract invoices')

      return (data ?? []).map((row: Record<string, unknown>) => {
        const lines = ((row.contract_invoice_lines as Record<string, unknown>[]) ?? [])
          .map((l) => ({
            id: l.id as string,
            name: l.name as string,
            qty: Number(l.qty ?? 0),
            unit_price: Number(l.unit_price ?? 0),
            total: Number(l.total ?? 0),
            sort_order: Number(l.sort_order ?? 0),
          }))
          .sort((a, b) => a.sort_order - b.sort_order)
        const payments = ((row.contract_invoice_payments as Record<string, unknown>[]) ?? []).map((p) => ({
          id: p.id as string,
          amount: Number(p.amount ?? 0),
          method_slug: (p.method_slug as string) ?? null,
          method_name: ((p.payment_methods as { name?: string } | null)?.name) ?? null,
          paid_at: p.paid_at as string,
          registered_by_name: (p.registered_by_name as string) ?? null,
          notes: (p.notes as string) ?? null,
        }))
        return {
          id: row.id as string,
          invoice_number: row.invoice_number as string,
          contract_id: row.contract_id as string,
          contract_payment_id: row.contract_payment_id as string,
          customer_name: (row.customer_name as string) ?? '',
          customer_phone: (row.customer_phone as string) ?? null,
          due_date: (row.due_date as string) ?? null,
          subtotal: Number(row.subtotal ?? 0),
          discount_amount: Number(row.discount_amount ?? 0),
          total_amount: Number(row.total_amount ?? 0),
          paid_amount: Number(row.paid_amount ?? 0),
          payment_status: row.payment_status as ContractInvoice['payment_status'],
          pdf_url: (row.pdf_url as string) ?? null,
          sent_at: (row.sent_at as string) ?? null,
          created_at: row.created_at as string,
          lines,
          payments,
        }
      })
    },
  })
}

/** Backfill/regenerate invoices for a contract (idempotent server-side). */
export function useGenerateContractInvoices(contractId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('generate_contract_invoices' as never, {
        p_contract_id: contractId,
      } as never)
      if (error) throw toError(error, 'Failed to generate contract invoices')
      return Number(data ?? 0)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.contractInvoices.byContract(contractId ?? null) })
      qc.invalidateQueries({ queryKey: queryKeys.contracts.detail(contractId ?? null) })
    },
  })
}

/** Record a collection against a contract invoice (server guards overpayment). */
export function useRecordContractInvoicePayment(contractId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      invoiceId: string
      amount: number
      methodSlug?: string | null
      notes?: string | null
      userId?: string | null
      userName?: string | null
    }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_record_contract_invoice_payment' as never, {
        p_invoice_id: args.invoiceId,
        p_amount: args.amount,
        p_method_slug: args.methodSlug ?? null,
        p_notes: args.notes ?? null,
        p_user_id: args.userId ?? null,
        p_user_name: args.userName ?? null,
      } as never)
      if (error) throw toError(error, 'Failed to record payment')
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.contractInvoices.byContract(contractId ?? null) })
      qc.invalidateQueries({ queryKey: queryKeys.contracts.detail(contractId ?? null) })
      qc.invalidateQueries({ queryKey: queryKeys.contracts.all })
      logActivity({
        action: 'contract_invoice_payment_recorded',
        module: 'contracts',
        entity_id: vars.invoiceId,
        details: `Payment ${vars.amount} recorded against contract invoice`,
      })
    },
  })
}
