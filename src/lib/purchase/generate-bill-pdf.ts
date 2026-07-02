import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPdfFonts, loadPdfAssets } from '@/lib/pdf/pdf-fonts'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { buildBillHtml, type BillPaymentRow } from '@/lib/purchase/bill-pdf-html'

export interface GenerateBillPdfResult {
  url:         string
  storageKey:  string
  filename:    string
  bytes:       number
}

function safeKey(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_')
}

export async function generateBillPdf(
  billUuid: string,
  supabase:  SupabaseClient,
): Promise<GenerateBillPdfResult> {
  const { data: bill, error: billErr } = await supabase
    .from('invoices')
    .select(`
      id, invoice_id, direction, supplier_id, purchase_order_id,
      doc_status, payment_status, total_amount, subtotal,
      discount_amount, discount_label, source_label,
      issued_date, due_date, notes,
      invoice_line_items(id, description, qty, unit_price, total),
      suppliers(name, contact_name, phone, email, address),
      purchase_orders(po_number, created_date, currency)
    `)
    .eq('id', billUuid)
    .eq('direction', 'ap')
    .single()
  if (billErr || !bill) {
    throw new Error(`Bill not found: ${billUuid} (${billErr?.message ?? 'no row'})`)
  }

  const { data: allocations, error: allocErr } = await supabase
    .from('payment_bill_allocations')
    .select(`
      amount,
      payments(date, method, reference)
    `)
    .eq('bill_id', billUuid)
    .order('created_at', { ascending: true })
  if (allocErr) {
    throw new Error(`Failed to fetch payment allocations: ${allocErr.message}`)
  }

  const supplier = (bill as any).suppliers as { name: string; contact_name: string | null; phone: string | null; email: string | null; address: string | null } | null
  const po = (bill as any).purchase_orders as { po_number: string; created_date: string; currency: string } | null
  const lineItems = ((bill as any).invoice_line_items ?? []) as { description: string; qty: number | null; unit_price: number; total: number }[]
  const currency = po?.currency ?? 'QAR'

  const payments: BillPaymentRow[] = (allocations ?? []).map((a: any) => ({
    date:      a.payments?.date ?? '',
    amount:    a.amount,
    method:    a.payments?.method ?? '',
    reference: a.payments?.reference ?? null,
  }))

  const amountPaid = payments.reduce((s, p) => s + p.amount, 0)
  const totalAmount = (bill as any).total_amount ?? 0
  const outstanding = Math.max(0, totalAmount - amountPaid)
  const isPaid = (bill as any).payment_status === 'paid'

  const [fonts, assets] = await Promise.all([loadPdfFonts(), loadPdfAssets()])

  const html = buildBillHtml({
    billId:          (bill as any).invoice_id,
    poNumber:        po?.po_number ?? null,
    poDate:          po?.created_date ?? null,
    supplierName:    supplier?.name ?? '—',
    supplierPhone:   supplier?.phone ?? null,
    supplierEmail:   supplier?.email ?? null,
    supplierAddress: supplier?.address ?? null,
    supplierRef:     (bill as any).source_label ?? null,
    dueDate:         (bill as any).due_date,
    lines:           lineItems,
    subtotal:        (bill as any).subtotal ?? totalAmount,
    discountAmount:  (bill as any).discount_amount ?? 0,
    discountLabel:   (bill as any).discount_label ?? null,
    totalAmount,
    currency,
    payments,
    amountPaid,
    outstanding,
    isPaid,
    notes:           (bill as any).notes ?? null,
    assets,
    fonts,
  })

  const buffer = await htmlToPdfBuffer(html)

  const storageKey = `${safeKey((bill as any).invoice_id)}.pdf`

  const { error: uploadErr } = await supabase.storage
    .from('bill-pdfs')
    .upload(storageKey, buffer, {
      contentType:  'application/pdf',
      upsert:       true,
      cacheControl: '0',
    })
  if (uploadErr) {
    throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('bill-pdfs')
    .getPublicUrl(storageKey)
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

  return {
    url:        publicUrl,
    storageKey,
    filename:   `Bill-${(bill as any).invoice_id}.pdf`,
    bytes:      buffer.length,
  }
}
