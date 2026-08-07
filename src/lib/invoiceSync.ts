// src/lib/invoiceSync.ts
import { createClient } from '@/lib/supabase/client'

export type InvoiceSyncResult = {
  action: 'created' | 'updated' | 'noop'
  invoice_id?: string
  invoice_display?: string
  reason?: string
}

/**
 * Syncs (or creates) an AR invoice from a Sale Order.
 * Call after SO confirmation and after any SO line edit.
 *
 * Runs entirely via rpc_sync_invoice_from_so (server-side, atomic under
 * FOR UPDATE + advisory lock). The previous client-side flow was three
 * separate auto-committed calls (delete lines → insert lines → update
 * totals) with COUNT(*)+1 numbering, so a failure between calls left
 * an invoice with no lines and concurrent SO confirms produced
 * duplicate INV-XXXXX ids.
 *
 * Does NOT create the sale_deliveries record — callers handle that
 * separately.
 */
export async function syncInvoiceToSalesOrder(soId: string): Promise<InvoiceSyncResult> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('rpc_sync_invoice_from_so', {
    p_so_id: soId,
  })
  if (error) {
    throw new Error(
      `Invoice sync failed: ${error.code} ${error.message}` +
      `${error.details ? ' — ' + error.details : ''}` +
      `${error.hint ? ' (' + error.hint + ')' : ''}`,
    )
  }
  return (data ?? { action: 'noop' }) as InvoiceSyncResult
}
