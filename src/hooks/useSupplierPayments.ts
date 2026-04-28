// src/hooks/useSupplierPayments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type SupplierPayment = {
  id: string
  payment_id: string | null
  invoice_id: string | null       // null for PO-direct payments
  supplier_id?: string | null     // set on PO-direct payments
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  direction: 'outgoing'
  status: string | null
  created_at: string | null
  // joined / resolved
  invoice_display?: string | null
  supplier_name?: string | null
  po_id?: string | null
  po_number?: string | null
}

export function useSupplierPayments(billId?: string) {
  return useQuery({
    queryKey: ['supplier-payments', billId],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('payments')
        .select(`
          *,
          invoices(invoice_id, purchase_order_id, purchase_orders(id, po_number), suppliers(name)),
          suppliers(name)
        `)
        .eq('direction', 'outgoing')
        .order('date', { ascending: false })
      if (billId) q = q.eq('invoice_id', billId)
      const { data, error } = await q
      if (error) throw error

      // Batch-fetch POs for direct PO payments (source_type = 'purchase_order')
      const poIds: string[] = (data ?? [])
        .filter((p: any) => p.source_type === 'purchase_order' && p.source_id)
        .map((p: any) => p.source_id as string)

      const poMap: Record<string, { po_number: string; supplier_name: string | null }> = {}
      if (poIds.length > 0) {
        // purchase_orders.supplier_id is TEXT (no FK to suppliers), so we use
        // the denormalized supplier_name column on purchase_orders directly.
        const { data: pos, error: poError } = await (supabase as any)
          .from('purchase_orders')
          .select('id, po_number, supplier_name')
          .in('id', poIds)
        if (poError) throw poError
        for (const po of pos ?? []) {
          poMap[po.id] = {
            po_number: po.po_number,
            supplier_name: po.supplier_name ?? null,
          }
        }
      }

      return (data ?? []).map((p: any) => {
        const poInfo = p.source_type === 'purchase_order' && p.source_id ? poMap[p.source_id] : null
        return {
          ...p,
          invoice_display:  p.invoices?.invoice_id ?? null,
          supplier_name:    p.invoices?.suppliers?.name
                            ?? p.suppliers?.name
                            ?? poInfo?.supplier_name
                            ?? null,
          po_id:            p.invoices?.purchase_orders?.id
                            ?? (p.source_type === 'purchase_order' ? p.source_id : null)
                            ?? null,
          po_number:        p.invoices?.purchase_orders?.po_number
                            ?? poInfo?.po_number
                            ?? null,
        } as SupplierPayment
      })
    },
  })
}

export function useCreateSupplierPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      invoice_id: string        // UUID (invoices.id)
      amount: number
      method: 'bank_transfer' | 'cash' | 'cheque' | 'online_transfer'
      date: string
      reference: string | null
      notes: string | null
    }) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'outgoing')
      const payment_id = `SPAY-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data, error } = await (supabase as any)
        .from('payments')
        .insert({
          payment_id,
          invoice_id: payload.invoice_id,
          amount: payload.amount,
          method: payload.method,
          date: payload.date,
          reference: payload.reference,
          notes: payload.notes,
          direction: 'outgoing',
          status: 'completed',
        })
        .select()
        .single()
      if (error) throw error

      // Recompute bill payment_status
      const { data: allPayments } = await (supabase as any)
        .from('payments')
        .select('amount')
        .eq('invoice_id', payload.invoice_id)
        .eq('direction', 'outgoing')
      const totalPaid = (allPayments ?? []).reduce((s: number, p: any) => s + p.amount, 0)

      const { data: bill } = await (supabase as any)
        .from('invoices')
        .select('total_amount')
        .eq('id', payload.invoice_id)
        .single()
      const newStatus =
        totalPaid >= (bill?.total_amount ?? Infinity)
          ? 'paid'
          : totalPaid > 0
          ? 'partially_paid'
          : 'unpaid'

      await (supabase as any)
        .from('invoices')
        .update({ payment_status: newStatus })
        .eq('id', payload.invoice_id)

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-bills'] })
    },
  })
}

export type UnlinkedPayment = {
  id: string
  payment_id: string | null
  amount: number
  method: string
  date: string
}

export function useUnlinkedOutgoingPayments(supplierId: string | null | undefined) {
  return useQuery({
    queryKey: ['unlinked-outgoing-payments', supplierId ?? null],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('payments')
        .select('id, payment_id, amount, method, date')
        .eq('direction', 'outgoing')
        .is('invoice_id', null)
        .order('date', { ascending: false })
      if (supplierId) q = q.eq('supplier_id', supplierId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as UnlinkedPayment[]
    },
  })
}
