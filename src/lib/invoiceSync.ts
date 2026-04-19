// src/lib/invoiceSync.ts
import { createClient } from '@/lib/supabase/client'

type SOLine = {
  id: string
  item_name: string
  qty: number
  unit_price: number
  total: number
}

type SORow = {
  id: string
  so_number: string
  status: string
  customer_id: string
  sale_order_lines: SOLine[]
}

/**
 * Syncs (or creates) an AR invoice from a Sale Order.
 * Call after SO confirmation and after any SO line edit.
 * Does NOT create the sale_deliveries record — callers handle that separately.
 */
export async function syncInvoiceToSalesOrder(soId: string): Promise<void> {
  const supabase = createClient()

  // Load SO with lines
  const { data: so, error: soErr } = await (supabase as any)
    .from('sale_orders')
    .select('id, so_number, status, customer_id, sale_order_lines(*)')
    .eq('id', soId)
    .single()
  if (soErr || !so) return

  const totalAmount: number = (so.sale_order_lines ?? []).reduce(
    (sum: number, l: SOLine) => sum + (l.total ?? 0),
    0
  )

  // Find existing unpaid invoice for this SO
  const { data: existing } = await (supabase as any)
    .from('invoices')
    .select('id, doc_status, payment_status')
    .eq('sale_order_id', soId)
    .neq('payment_status', 'paid')
    .limit(1)

  const invoice = existing?.[0]

  if (invoice) {
    const isAlreadySent = invoice.doc_status === 'sent'
    const hasActivity =
      invoice.payment_status === 'partially_paid' ||
      invoice.payment_status === 'overdue'
    const needsRefresh = isAlreadySent || hasActivity

    // Rebuild line items
    await (supabase as any)
      .from('invoice_line_items')
      .delete()
      .eq('invoice_id', invoice.id)

    const lines = (so.sale_order_lines as SOLine[]).map((l) => ({
      invoice_id: invoice.id,
      description: l.item_name,
      qty: l.qty,
      unit_price: l.unit_price,
      total: l.total,
    }))
    if (lines.length > 0) {
      await (supabase as any).from('invoice_line_items').insert(lines)
    }

    await (supabase as any)
      .from('invoices')
      .update({ total_amount: totalAmount, subtotal: totalAmount, needs_refresh: needsRefresh })
      .eq('id', invoice.id)
  } else if ((so as SORow).status === 'confirmed') {
    // Create fresh AR invoice
    const { count } = await (supabase as any)
      .from('invoices')
      .select('*', { count: 'exact', head: true })
    const invoiceIdDisplay = `INV-${String((count ?? 0) + 1).padStart(5, '0')}`
    const today = new Date().toISOString().split('T')[0]
    const due = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data: newInvoice, error: insErr } = await (supabase as any)
      .from('invoices')
      .insert({
        invoice_id: invoiceIdDisplay,
        customer_id: (so as SORow).customer_id,
        direction: 'ar',
        sale_order_id: soId,
        doc_status: 'draft',
        payment_status: 'unpaid',
        needs_refresh: false,
        source: 'order',
        source_id: soId,
        source_label: `SO #${(so as SORow).so_number}`,
        total_amount: totalAmount,
        subtotal: totalAmount,
        tax: 0,
        issued_date: today,
        due_date: due,
        status: 'draft',
      })
      .select()
      .single()
    if (insErr) throw insErr

    const lines = (so.sale_order_lines as SOLine[]).map((l) => ({
      invoice_id: newInvoice.id,
      description: l.item_name,
      qty: l.qty,
      unit_price: l.unit_price,
      total: l.total,
    }))
    if (lines.length > 0) {
      await (supabase as any).from('invoice_line_items').insert(lines)
    }
  }
}
