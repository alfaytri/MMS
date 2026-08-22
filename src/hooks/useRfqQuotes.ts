import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RfqQuoteItem = {
  id: string
  po_line_item_id: string
  quoted_price: number
  quoted_qty: number | null
  notes: string | null
}

export type RfqQuote = {
  id: string
  po_id: string
  supplier_id: string
  currency: string
  total_amount: number
  status: 'pending' | 'received' | 'awarded' | 'rejected'
  received_date: string | null
  notes: string | null
  created_at: string
  suppliers: { name: string; phone: string | null } | null
  po_rfq_quote_items: RfqQuoteItem[]
}

export type SaveQuoteInput = {
  quoteId: string
  items: {
    po_line_item_id: string
    quoted_price: number
    quoted_qty?: number | null
    notes?: string | null
  }[]
  notes?: string | null
}

export type AwardQuoteInput = {
  quoteId: string
  poId: string
  supplierId: string
  supplierName: string
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch all RFQ quotes for a purchase order, including supplier info and
 * per-line-item quoted prices.
 */
export function useRfqQuotes(poId: string | null) {
  return useQuery({
    queryKey: ['rfq-quotes', poId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('po_rfq_quotes')
        .select(
          `id, po_id, supplier_id, currency, total_amount, status,
           received_date, notes, created_at,
           suppliers(name, phone),
           po_rfq_quote_items(id, po_line_item_id, quoted_price, quoted_qty, notes)`
        )
        .eq('po_id', poId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as RfqQuote[]
    },
    enabled: !!poId,
  })
}

/**
 * Save (or re-save) a supplier's quoted prices on an RFQ quote.
 *
 * Replaces existing quote items, recalculates the total, and marks
 * the quote as "received".
 */
export function useSaveQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SaveQuoteInput) => {
      const supabase = createClient()

      // 1. Delete existing quote items
      const { error: delErr } = await supabase
        .from('po_rfq_quote_items')
        .delete()
        .eq('quote_id', input.quoteId)
      if (delErr) throw delErr

      // 2. Insert new items
      if (input.items.length > 0) {
        const rows = input.items.map((item) => ({
          quote_id: input.quoteId,
          po_line_item_id: item.po_line_item_id,
          quoted_price: item.quoted_price,
          quoted_qty: item.quoted_qty ?? null,
          notes: item.notes ?? null,
        }))
        const { error: insErr } = await supabase
          .from('po_rfq_quote_items')
          .insert(rows)
        if (insErr) throw insErr
      }

      // 3. Calculate total_amount
      const totalAmount = input.items.reduce((sum, item) => {
        const qty = item.quoted_qty && item.quoted_qty > 0 ? item.quoted_qty : 1
        return sum + item.quoted_price * qty
      }, 0)

      // 4. Update the quote row
      const today = new Date().toISOString().split('T')[0]
      const { error: updErr } = await supabase
        .from('po_rfq_quotes')
        .update({
          status: 'received',
          received_date: today,
          total_amount: totalAmount,
          notes: input.notes ?? null,
        })
        .eq('id', input.quoteId)
      if (updErr) throw updErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfq-quotes'] })
    },
  })
}

/**
 * Award a winning quote: copy quoted prices into PO line items, recalculate
 * the PO totals, assign the supplier, promote the PO to draft, and mark
 * all other quotes as rejected.
 */
export function useAwardQuote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: AwardQuoteInput) => {
      const supabase = createClient()

      // 1. Fetch winning quote items
      const { data: quoteItems, error: qiErr } = await supabase
        .from('po_rfq_quote_items')
        .select('po_line_item_id, quoted_price, quoted_qty')
        .eq('quote_id', input.quoteId)
      if (qiErr) throw qiErr
      if (!quoteItems || quoteItems.length === 0) {
        throw new Error('No quote items found for the winning quote')
      }

      // 2. Update each PO line item with the quoted price (and qty if set)
      for (const qi of quoteItems) {
        // Fetch current line item to get its qty for total_price calc
        const { data: lineItem, error: liErr } = await supabase
          .from('po_line_items')
          .select('id, qty')
          .eq('id', qi.po_line_item_id)
          .single()
        if (liErr) throw liErr

        const newQty = qi.quoted_qty && qi.quoted_qty > 0 ? qi.quoted_qty : lineItem.qty
        const totalPrice = qi.quoted_price * newQty

        const updatePayload: { unit_price: number; total_price: number; qty?: number } = {
          unit_price: qi.quoted_price,
          total_price: totalPrice,
        }
        if (qi.quoted_qty && qi.quoted_qty > 0) {
          updatePayload.qty = qi.quoted_qty
        }

        const { error: upErr } = await supabase
          .from('po_line_items')
          .update(updatePayload)
          .eq('id', qi.po_line_item_id)
        if (upErr) throw upErr
      }

      // 3. Recalculate PO subtotal
      const { data: allLineItems, error: allLiErr } = await supabase
        .from('po_line_items')
        .select('total_price')
        .eq('po_id', input.poId)
      if (allLiErr) throw allLiErr

      const subtotal = (allLineItems ?? []).reduce(
        (sum, li) => sum + (li.total_price ?? 0),
        0
      )

      // 4. Fetch PO discount and exchange rate
      const { data: po, error: poErr } = await supabase
        .from('purchase_orders')
        .select('discount_amount, exchange_rate')
        .eq('id', input.poId)
        .single()
      if (poErr) throw poErr

      const discount = po.discount_amount ?? 0
      const exchangeRate = po.exchange_rate ?? 1
      const totalQar = (subtotal - discount) * exchangeRate

      // 5. Update the purchase order
      const { error: poUpdErr } = await supabase
        .from('purchase_orders')
        .update({
          supplier_id: input.supplierId,
          supplier_name: input.supplierName,
          po_type: 'draft',
          subtotal,
          total_qar: totalQar,
        })
        .eq('id', input.poId)
      if (poUpdErr) throw poUpdErr

      // 6. Mark winning quote as awarded
      const { error: awardErr } = await supabase
        .from('po_rfq_quotes')
        .update({ status: 'awarded' })
        .eq('id', input.quoteId)
      if (awardErr) throw awardErr

      // 7. Reject all other quotes for this PO
      const { error: rejectErr } = await supabase
        .from('po_rfq_quotes')
        .update({ status: 'rejected' })
        .eq('po_id', input.poId)
        .neq('id', input.quoteId)
      if (rejectErr) throw rejectErr
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rfq-quotes'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.poId) })
    },
  })
}
