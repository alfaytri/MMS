import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { buildBillHtml, type BillLineItem, type BillPaymentRow } from '@/lib/purchase/bill-pdf-html'
import { fetchArabicNamesByEnglishName, fetchOriginsByBrandVariant } from '@/lib/pdf/arabic-names'

async function hydrateBillLines(
  client: SupabaseClient<Database>,
  lines:  BillLineItem[],
): Promise<BillLineItem[]> {
  if (lines.length === 0) return lines
  const [arMap, originMap] = await Promise.all([
    fetchArabicNamesByEnglishName(client, lines.map((l) => l.description)),
    fetchOriginsByBrandVariant(client, lines.map((l) => l.brand_variant_id ?? null)),
  ])
  return lines.map((l) => ({
    ...l,
    description_ar: arMap.get(l.description) ?? null,
    origin:         l.brand_variant_id ? originMap.get(l.brand_variant_id) ?? null : null,
  }))
}

export interface GenerateBillPdfResult {
  url:         string
  storageKey:  string
  filename:    string
  bytes:       number
  regenerated: boolean
}

function safeKey(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_')
}

export async function generateBillPdf(
  billUuid: string,
  supabase:  SupabaseClient<Database>,
  opts?: { divisionId?: string; force?: boolean },
): Promise<GenerateBillPdfResult> {
  const { data: bill, error: billErr } = await supabase
    .from('bills')
    .select(`
      id, bill_number, supplier_id, purchase_order_id,
      payment_status, total_amount, paid_amount, subtotal,
      discount_amount, discount_label, source_label,
      issued_date, due_date, notes, pdf_url, needs_refresh,
      bill_line_items(id, description, qty, unit_price, total, brand_variant_id),
      suppliers(name, contact_name, phone, email, address),
      purchase_orders(po_number, created_date, currency, division_id)
    `)
    .eq('id', billUuid)
    .single()
  if (billErr || !bill) {
    throw new Error(`Bill not found: ${billUuid} (${billErr?.message ?? 'no row'})`)
  }

  // ── Cache hit — serve the previous PDF unless caller forced regen ──
  // pdf_url is nulled by the bills_invalidate_pdf_cache trigger on any
  // update to the bill (including payment recomputes and line-item
  // changes). If it's still set, the cached rendering is current.
  if (!opts?.force && bill.pdf_url && !bill.needs_refresh) {
    return {
      url:         bill.pdf_url,
      storageKey:  `${safeKey(bill.bill_number)}.pdf`,
      filename:    `Bill-${bill.bill_number}.pdf`,
      bytes:       0,
      regenerated: false,
    }
  }

  const supplier = bill.suppliers
  const po = bill.purchase_orders
  const lineItems = await hydrateBillLines(supabase, (bill.bill_line_items ?? []) as BillLineItem[])
  const currency = po?.currency ?? 'QAR'

  // Bill payments come from three sources:
  //   1. payment_bill_allocations rows explicitly split to this bill
  //   2. payments with source_type='bill' or bill_id=<this bill>
  //   3. payments recorded against the parent PO (source_type='purchase_order')
  //
  // Six-domains H6: the three queries overlap — a payment carrying both
  // an allocation row AND bill_id would render twice; a PO-level payment
  // already split via an allocation would show BOTH the full amount and
  // the split amount. Deduplicate by payment id, allocation-rows win
  // (they carry the split amount and are the accounting truth).
  const paymentRows: BillPaymentRow[] = []
  const seenPaymentIds = new Set<string>()

  const { data: allocations, error: allocErr } = await supabase
    .from('payment_bill_allocations')
    .select(`amount, payment_id, payments(id, date, method, reference)`)
    .eq('bill_id', billUuid)
    .order('created_at', { ascending: true })
  if (allocErr) throw new Error(`Failed to fetch payment allocations: ${allocErr.message}`)

  for (const a of allocations ?? []) {
    const pid = (a.payments as { id?: string } | null)?.id ?? a.payment_id ?? null
    if (pid) seenPaymentIds.add(pid)
    paymentRows.push({
      date:      a.payments?.date ?? '',
      amount:    a.amount,
      method:    a.payments?.method ?? '',
      reference: a.payments?.reference ?? null,
    })
  }

  const { data: directPayments, error: directErr } = await supabase
    .from('payments')
    .select('id, date, amount, method, reference')
    .or(`and(source_type.eq.bill,source_id.eq.${billUuid}),bill_id.eq.${billUuid}`)
    .eq('direction', 'outgoing')
    .is('deleted_at', null)
    .order('date', { ascending: true })
  if (directErr) throw new Error(`Failed to fetch direct bill payments: ${directErr.message}`)

  for (const p of directPayments ?? []) {
    if (p.id && seenPaymentIds.has(p.id)) continue
    if (p.id) seenPaymentIds.add(p.id)
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
      .select('id, date, amount, method, reference')
      .eq('source_type', 'purchase_order')
      .eq('source_id', bill.purchase_order_id)
      .eq('direction', 'outgoing')
      .is('deleted_at', null)
      .order('date', { ascending: true })
    if (poErr) throw new Error(`Failed to fetch PO payments: ${poErr.message}`)

    for (const p of poPayments ?? []) {
      if (p.id && seenPaymentIds.has(p.id)) continue
      if (p.id) seenPaymentIds.add(p.id)
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

  // Persist the URL via the SECURITY DEFINER RPC — it sets a
  // transaction-local GUC so bills_invalidate_pdf_cache_fn lets
  // the write through and also flips needs_refresh back to false.
  const { error: rpcErr } = await supabase.rpc('set_bill_pdf_url', {
    p_id:  bill.id,
    p_url: publicUrl,
  })
  if (rpcErr) {
    console.warn(`[bill-pdf] uploaded but failed to persist URL on ${bill.bill_number}: ${rpcErr.message}`)
  }

  return {
    url:         publicUrl,
    storageKey,
    filename:    `Bill-${bill.bill_number}.pdf`,
    bytes:       buffer.length,
    regenerated: true,
  }
}
