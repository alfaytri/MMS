/**
 * Generates the AR Invoice PDF for one invoice, uploads it to the
 * `invoice-pdfs` Storage bucket, persists `invoices.pdf_url` via the
 * service-role RPC (which bypasses the cache-invalidation trigger), and
 * returns the URL.
 *
 * Same architecture as generate-quotation-pdf.ts — see that file's header for
 * background on why we're not using @react-pdf/renderer.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildInvoiceHtml,
  type InvoiceLineItem,
  type InvoicePayment,
} from '@/lib/sales/invoice-pdf-html'
import { loadPdfFonts, loadPdfAssets } from '@/lib/pdf/pdf-fonts'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'

function storageKeyFor(invoiceDisplayId: string): string {
  return `${invoiceDisplayId.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`
}

interface InvoiceRow {
  id:              string
  invoice_id:      string
  invoice_type:    'cash' | 'credit'
  issued_date:     string
  due_date:        string
  subtotal:        number | null
  discount_amount: number | null
  total_amount:    number | null
  paid_amount:     number | null
  payment_status:  string | null
  notes:           string | null
  pdf_url:         string | null
  sale_order_id:   string | null
  customers:       { name: string | null; phone: string | null } | null
  invoice_line_items: InvoiceLineItem[] | null
  sale_orders:     { so_number: string; payment_terms: string | null } | null
}

export interface GenerateInvoicePdfResult {
  url:         string
  storageKey:  string
  invoiceId:   string
  bytes:       number
  regenerated: boolean
}

export async function generateInvoicePdf(
  invoiceUuid: string,
  supabase:    SupabaseClient,
  opts?:       { force?: boolean },
): Promise<GenerateInvoicePdfResult> {

  // ── 1. Fetch invoice ─────────────────────────────────────────────────
  const { data: inv, error: fetchErr } = await supabase
    .from('invoices')
    .select(`
      id, invoice_id, invoice_type, issued_date, due_date,
      subtotal, discount_amount, total_amount, paid_amount, payment_status,
      notes, pdf_url, sale_order_id,
      customers(name, phone),
      invoice_line_items(description, qty, unit_price, total),
      sale_orders(so_number, payment_terms)
    `)
    .eq('id', invoiceUuid)
    .eq('direction', 'ar')
    .single<InvoiceRow>()

  if (fetchErr || !inv) {
    throw new Error(`AR Invoice not found: ${invoiceUuid} (${fetchErr?.message ?? 'no row'})`)
  }

  if (!opts?.force && inv.pdf_url) {
    return {
      url:         inv.pdf_url,
      storageKey:  storageKeyFor(inv.invoice_id),
      invoiceId:   inv.invoice_id,
      bytes:       0,
      regenerated: false,
    }
  }

  // ── 2. HTML + PDF ────────────────────────────────────────────────────
  const [assets, fonts] = await Promise.all([loadPdfAssets(), loadPdfFonts()])

  const subtotal    = Number(inv.subtotal        ?? 0)
  const discount    = Number(inv.discount_amount ?? 0)
  const totalAmount = Number(inv.total_amount    ?? 0)
  const paid        = Number(inv.paid_amount     ?? 0)
  const outstanding = Math.max(0, totalAmount - paid)

  const { data: payRows } = await supabase
    .from('payments')
    .select('date, amount, method, reference')
    .eq('invoice_id', inv.id)
    .eq('direction', 'incoming')
    .order('date', { ascending: true })

  const payments: InvoicePayment[] = (payRows ?? []).map((p: any) => ({
    date:      p.date,
    amount:    Number(p.amount ?? 0),
    method:    p.method ?? '—',
    reference: p.reference,
  }))

  const html = buildInvoiceHtml({
    invoice_id:     inv.invoice_id,
    invoice_type:   inv.invoice_type,
    issued_date:    inv.issued_date,
    due_date:       inv.due_date,
    customer_name:  inv.customers?.name  ?? '',
    customer_phone: inv.customers?.phone ?? null,
    so_number:      inv.sale_orders?.so_number ?? null,
    lines:          inv.invoice_line_items ?? [],
    subtotal,
    discount,
    total_amount:   totalAmount,
    amount_paid:    paid,
    outstanding,
    payments,
    payment_terms:  inv.sale_orders?.payment_terms ?? null,
    notes:          inv.notes,
    isPaid:         inv.payment_status === 'paid',
    assets,
    fonts,
  })

  const buffer = await htmlToPdfBuffer(html)

  // ── 4. Upload ────────────────────────────────────────────────────────
  const storageKey = storageKeyFor(inv.invoice_id)
  const { error: uploadErr } = await supabase.storage
    .from('invoice-pdfs')
    .upload(storageKey, buffer, {
      contentType:  'application/pdf',
      upsert:       true,
      cacheControl: '0',           // CDN/browser must revalidate every time —
    })                              // the cache buster below shields us anyway
  if (uploadErr) {
    throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('invoice-pdfs')
    .getPublicUrl(storageKey)
  // Append a per-render cache buster — without it the CDN/browser would keep
  // serving the previous PDF bytes even after we overwrote the storage object.
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

  // ── 5. Persist URL ───────────────────────────────────────────────────
  const { error: rpcErr } = await supabase.rpc('set_invoice_pdf_url', {
    p_id:  inv.id,
    p_url: publicUrl,
  })
  if (rpcErr) {
    console.warn(`[invoice-pdf] uploaded but failed to persist URL on ${inv.invoice_id}: ${rpcErr.message}`)
  }

  return {
    url:         publicUrl,
    storageKey,
    invoiceId:   inv.invoice_id,
    bytes:       buffer.length,
    regenerated: true,
  }
}
