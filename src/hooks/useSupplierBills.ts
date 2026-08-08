// src/hooks/useSupplierBills.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Bill, BillLineItem, PaymentPlan } from '@/types/invoice'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'
import type { DBTable } from '@/types/database.types'

export type BillAttachment = DBTable<'bill_attachments'>

export type { Bill }

export type BillFilters = {
  search?: string
  payment_status?: Bill['payment_status'] | ''
  supplier_id?: string
}

export function useSupplierBills(filters?: BillFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.supplierBills.list(filters),
    enabled: options?.enabled !== false,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('bills')
        .select(`
          *,
          bill_line_items(*),
          suppliers(name),
          purchase_orders(po_number)
        `)
        .order('created_at', { ascending: false })
      if (filters?.payment_status) q = q.eq('payment_status', filters.payment_status)
      if (filters?.search) {
        q = q.or(`bill_number.ilike.%${filters.search}%`)
      }
      if (filters?.supplier_id) q = q.eq('supplier_id', filters.supplier_id)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((b) => ({
        ...b,
        supplier_name: b.suppliers?.name ?? null,
        po_number: b.purchase_orders?.po_number ?? null,
      })) as Bill[]
    },
  })
}

export function useSupplierBill(id: string | null) {
  return useQuery({
    queryKey: queryKeys.supplierBills.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('bills')
        .select('*, bill_line_items(*), suppliers(name), purchase_orders(po_number, po_line_items(*))')
        .eq('id', id!)
        .single()
      if (error) throw error
      return {
        ...data,
        supplier_name: (data as unknown as { suppliers?: { name: string } | null }).suppliers?.name ?? null,
        po_number: (data as unknown as { purchase_orders?: { po_number: string } | null }).purchase_orders?.po_number ?? null,
      } as unknown as Bill
    },
  })
}

export type POBillRow = {
  id: string
  bill_number: string
  payment_status: string
  total_amount: number
  paid_amount: number
  due_date: string | null
  issued_date: string | null
  created_at: string
}

export function useBillsByPO(poId: string | null) {
  return useQuery({
    queryKey: queryKeys.supplierBills.byPo(poId),
    enabled: !!poId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('bills')
        .select('id, bill_number, payment_status, total_amount, paid_amount, due_date, issued_date, created_at')
        .eq('purchase_order_id', poId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as POBillRow[]
    },
  })
}

/** Lightweight lookup: returns the Set of purchase_order_ids that have at
 * least one bill. Used by the PO list to hide the "Create Bill" action on
 * rows that are already billed, without one query per row. */
export function useBilledPoIds() {
  return useQuery({
    queryKey: [...queryKeys.supplierBills.all, 'po-id-set'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('bills')
        .select('purchase_order_id')
        .not('purchase_order_id', 'is', null)
      if (error) throw error
      const set = new Set<string>()
      for (const r of data ?? []) {
        if (r.purchase_order_id) set.add(r.purchase_order_id)
      }
      return set
    },
    staleTime: 30 * 1000,
  })
}

export function useCreateBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      supplier_id: string
      purchase_order_id: string
      po_number: string
      discount_amount: number
      discount_label: string | null
      receival_id: string | null
      due_date: string
      source_label?: string | null
      notes: string
      line_items: {
        description: string
        qty: number
        unit_price: number
        total: number
        match_status: BillLineItem['match_status']
        match_note: string | null
      }[]
    }) => {
      const supabase = createClient()

      // rpc_create_purchase_bill runs the header + lines insert
      // atomically and enforces 0 ≤ discount ≤ subtotal server-side.
      // See migration 20260806160000.
      const { data: billJson, error: rpcErr } = await supabase.rpc(
        'rpc_create_purchase_bill',
        { p_payload: payload as unknown as import('@/types/database.types').Json },
      )
      if (rpcErr) {
        throw new Error(
          `Create bill failed: ${rpcErr.code} ${rpcErr.message}` +
          `${rpcErr.details ? ' — ' + rpcErr.details : ''}` +
          `${rpcErr.hint ? ' (' + rpcErr.hint + ')' : ''}`,
        )
      }
      const bill = billJson as unknown as Bill
      void logActivity({
        action: 'Bill Created',
        module: 'bills',
        entity_id: bill.id,
        entity_type: 'bill',
        new_data: bill as unknown as Record<string, unknown>,
      })
      return bill
    },
    onSuccess: (_bill, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierBills.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierBills.byPo(vars.purchase_order_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(vars.purchase_order_id) })
    },
  })
}

export type BillPayment = {
  /** payment_bill_allocations.id (this row's id — kept for backwards-compat) */
  id: string
  /** payments.id (the actual payment UUID — pass this to edit/delete RPCs) */
  payment_uuid: string
  payment_id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  status: string
  full_amount?: number
  currency: string
  exchange_rate: number
}

export type BillReceival = {
  id: string
  receival_number: string
  date: string
  status: string
  receival_items: {
    id: string
    item_name: string
    sku: string | null
    qty_received: number
    is_free: boolean
  }[]
}

export type BillViewModel = {
  bill: Bill & {
    paid_amount: number | null
    suppliers: {
      name: string
      contact_name: string | null
      phone: string | null
      email: string | null
      address: string | null
    } | null
    purchase_orders: {
      po_number: string
      created_date: string
      currency: string
    } | null
  }
  payments: BillPayment[]
  paymentPlan: PaymentPlan | null
  receival: BillReceival | null
}

export function useBillViewModel(id: string | null) {
  return useQuery({
    queryKey: queryKeys.supplierBills.viewModelById(id),
    enabled: !!id,
    queryFn: async (): Promise<BillViewModel> => {
      const supabase = createClient()

      const [billResult, paymentsResult, planResult] = await Promise.all([
        supabase
          .from('bills')
          .select(`
            *,
            bill_line_items(*),
            suppliers(name, contact_name, phone, email, address),
            purchase_orders(po_number, created_date, currency)
          `)
          .eq('id', id!)
          .single(),
        supabase
          .from('payment_bill_allocations')
          .select(`
            id,
            amount,
            payments (
              id,
              payment_id,
              method,
              date,
              reference,
              notes,
              status,
              amount,
              currency,
              exchange_rate
            )
          `)
          .eq('bill_id', id!)
          .order('created_at', { ascending: false }),
        supabase
          .from('payment_plans')
          .select('*, payment_installments(*)')
          .eq('bill_id', id!)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (billResult.error) throw billResult.error
      if (paymentsResult.error) throw paymentsResult.error

      let receival: BillReceival | null = null
      if (billResult.data?.receival_id) {
        const { data } = await supabase
          .from('receivals')
          .select('id, receival_number, date, status, receival_items(id, item_name, sku, qty_received, is_free)')
          .eq('id', billResult.data.receival_id)
          .single()
        receival = data as unknown as BillReceival | null
      }

      return {
        bill: billResult.data as unknown as BillViewModel['bill'],
        payments: (paymentsResult.data ?? [] as { id: string; amount: number; payments: { id: string; payment_id: string; method: string; date: string; reference: string | null; notes: string | null; status: string; amount: number; currency: string; exchange_rate: number } | null }[]).map((alloc) => ({
          id:            alloc.id,
          payment_uuid:  alloc.payments?.id ?? '',
          payment_id:    alloc.payments?.payment_id ?? '—',
          amount:        alloc.amount,
          method:        alloc.payments?.method ?? '',
          date:          alloc.payments?.date ?? '',
          reference:     alloc.payments?.reference ?? null,
          notes:         alloc.payments?.notes ?? null,
          status:        alloc.payments?.status ?? '',
          full_amount:   alloc.payments?.amount ?? 0,
          currency:      alloc.payments?.currency ?? 'QAR',
          exchange_rate: alloc.payments?.exchange_rate ?? 1,
        })),
        paymentPlan: planResult.data as unknown as PaymentPlan | null,
        receival,
      }
    },
  })
}

// ─── Attachments ─────────────────────────────────────────────────────────────
// Bill attachments live in the private `bill-attachments` bucket. The app
// uploads on file selection (cancel-sweep pattern from landed-costs) and
// records the storage_key in `bill_attachments` only when the parent bill
// is created — so a cancelled dialog leaves nothing dangling in the DB.

export function useBillAttachments(billId: string | null) {
  return useQuery({
    queryKey: queryKeys.supplierBills.attachments(billId),
    enabled: !!billId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('bill_attachments')
        .select('*')
        .eq('bill_id', billId!)
        .order('uploaded_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as BillAttachment[]
    },
  })
}

/**
 * Mint a short-lived signed URL for viewing a bill attachment.
 * The bucket is private; the URL expires in 5 minutes.
 */
export async function getBillAttachmentSignedUrl(storageKey: string): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from('bill-attachments')
    .createSignedUrl(storageKey, 300)
  if (error) throw error
  return data.signedUrl
}

export function useDeleteBillAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, storage_key, bill_id }: { id: string; storage_key: string; bill_id: string }) => {
      const supabase = createClient()
      // Delete storage first — if that fails the row stays and we can retry.
      // If storage succeeds but the row delete fails, the orphan is caught by
      // a follow-up sweep; we log a warning here.
      const { error: storageErr } = await supabase.storage
        .from('bill-attachments')
        .remove([storage_key])
      if (storageErr) throw new Error(`Storage delete failed: ${storageErr.message}`)

      const { error: rowErr } = await supabase
        .from('bill_attachments')
        .delete()
        .eq('id', id)
      if (rowErr) {
        throw new Error(
          `Row delete failed after storage removed: ${rowErr.code} ${rowErr.message}` +
          `${rowErr.details ? ' — ' + rowErr.details : ''}`,
        )
      }
      return { bill_id }
    },
    onSuccess: ({ bill_id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.supplierBills.attachments(bill_id) })
    },
  })
}

/**
 * Persist a list of already-uploaded storage keys as bill_attachments rows.
 * Called from the create-bill flow after `useCreateBill` returns the new
 * bill id. Kept as a plain async function (not a mutation) because it runs
 * inline in the create flow.
 */
export async function persistBillAttachments(
  billId: string,
  uploads: Array<{ storage_key: string; file_name: string; mime_type: string | null; size_bytes: number }>,
): Promise<void> {
  if (uploads.length === 0) return
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let uploaderId: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('user_data').select('id').eq('auth_user_id', user.id).maybeSingle()
    uploaderId = profile?.id ?? null
  }
  const rows = uploads.map((u) => ({
    bill_id: billId,
    storage_key: u.storage_key,
    file_name: u.file_name,
    mime_type: u.mime_type,
    size_bytes: u.size_bytes,
    uploaded_by: uploaderId,
  }))
  const { error } = await supabase.from('bill_attachments').insert(rows)
  if (error) {
    throw new Error(
      `Attach files failed: ${error.code} ${error.message}` +
      `${error.details ? ' — ' + error.details : ''}`,
    )
  }
}

