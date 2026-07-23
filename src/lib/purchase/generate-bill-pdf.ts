import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { buildBillHtml, type BillLineItem, type BillPaymentRow } from '@/lib/purchase/bill-pdf-html'

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
  supabase:  SupabaseClient<Database>,
  opts?: { divisionId?: string },
): Promise<GenerateBillPdfResult> {
  const { data: bill, error: billErr } = await supabase
    .from('bills')
    .select(`
      id, bill_number, supplier_id, purchase_order_id,
      doc_status, payment_status, total_amount, paid_amount, subtotal,
      discount_amount, discount_label, source_label,
      issued_date, due_date, notes,
      bill_line_items(id, description, qty, unit_price, total),
      suppliers(name, contact_name, phone, email, address),
      purchase_orders(po_number, created_date, currency, division_id)
    `)
    .eq('id', billUuid)
    .single()
  if (billErr || !bill) {
    throw new Error(`Bill not found: ${billUuid} (${billErr?.message ?? 'no row'})`)
  }

  const supplier = bill.suppliers
  const po = bill.purchase_orders
  const lineItems = (bill.bill_line_items ?? []) as BillLineItem[]
  const currency = po?.currency ?? 'QAR'

  // Bill payments come from three sources:
  //   1. payment_bill_allocations rows explicitly split to this bill
  //   2. payments with source_type='bill' or bill_id=<this bill>
  //   3. payments recorded against the parent PO (source_type='purchase_order')
  // The bill_recompute_paid_fn trigger keeps bills.paid_amount in sync
  // across all three; the PDF just needs to display the underlying entries.
  const paymentRows: BillPaymentRow[] = []

  const { data: allocations, error: allocErr } = await supabase
    .from('payment_bill_allocations')
    .select(`amount, payments(date, method, reference)`)
    .eq('bill_id', billUuid)
    .order('created_at', { ascending: true })
  if (allocErr) throw new Error(`Failed to fetch payment allocations: ${allocErr.message}`)

  for (const a of allocations ?? []) {
    paymentRows.push({
      date:      a.payments?.date ?? '',
      amount:    a.amount,
      method:    a.payments?.method ?? '',
      reference: a.payments?.reference ?? null,
    })
  }

  const { data: directPayments, error: directErr } = await supabase
    .from('payments')
    .select('date, amount, method, reference')
    .or(`and(source_type.eq.bill,source_id.eq.${billUuid}),bill_id.eq.${billUuid}`)
    .eq('direction', 'outgoing')
    .is('deleted_at', null)
    .order('date', { ascending: true })
  if (directErr) throw new Error(`Failed to fetch direct bill payments: ${directErr.message}`)

  for (const p of directPayments ?? []) {
    paymentRows.push({
      date:      p.date ?? '',
      amount:    p.amount ?? 0,
      method:    p.method ?? '',
      reference: p.reference ?? null,
    })
  }

  if (po && bill.purchase_order_id) {
    const { data: poPayments, error: poErr } = await supabase
      .from('payments')
      .select('date, amount, method, reference')
      .eq('source_type', 'purchase_order')
      .eq('source_id', bill.purchase_order_id)
      .eq('direction', 'outgoing')
      .is('deleted_at', null)
      .order('date', { ascending: true })
    if (poErr) throw new Error(`Failed to fetch PO payments: ${poErr.message}`)

    for (const p of poPayments ?? []) {
      paymentRows.push({
        date:      p.date ?? '',
        amount:    p.amount ?? 0,
        method:    p.method ?? '',
        reference: p.reference ?? null,
      })
    }
  }

  paymentRows.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const payments = paymentRows

  const totalAmount = bill.total_amount ?? 0
  // Source of truth is the trigger-maintained paid_amount, not a sum here.
  const amountPaid = bill.paid_amount ?? 0
  const outstanding = Math.max(0, totalAmount - amountPaid)
  const isPaid = outstanding <= 0 && totalAmount > 0

  const [brand, fonts] = await Promise.all([
    resolveBrand(opts?.divisionId ?? po?.division_id, supabase),
    loadPdfFonts(),
  ])
  const { assets } = brandDataToAssets(brand)

  const html = buildBillHtml({
    billId:          bill.bill_number,
    poNumber:        po?.po_number ?? null,
    poDate:          po?.created_date ?? null,
    supplierName:    supplier?.name ?? '—',
    supplierPhone:   supplier?.phone ?? null,
    supplierEmail:   supplier?.email ?? null,
    supplierAddress: supplier?.address ?? null,
    supplierRef:     bill.source_label ?? null,
    dueDate:         bill.due_date,
    lines:           lineItems,
    subtotal:        bill.subtotal ?? totalAmount,
    discountAmount:  bill.discount_amount ?? 0,
    discountLabel:   bill.discount_label ?? null,
    totalAmount,
    currency,
    payments,
    amountPaid,
    outstanding,
    isPaid,
    notes:           bill.notes ?? null,
    assets,
    fonts,
  })

  const buffer = await htmlToPdfBuffer(html)

  const storageKey = `${safeKey(bill.bill_number)}.pdf`

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
    filename:   `Bill-${bill.bill_number}.pdf`,
    bytes:      buffer.length,
  }
}
