/**
 * Pure helper that renders a TL-invoice PDF (invoice + payment history in one
 * document), uploads it to the `tl-invoice-pdfs` Storage bucket, persists the
 * public URL on `tl_invoices.pdf_url`, and returns the URL.
 *
 * Mirrors `generate-confirmation-pdf.ts` — same PDF pipeline, same brand
 * resolver, same caching-by-column pattern.
 */

import { fetchLineImages } from '@/lib/pdf/line-images'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { buildTlInvoiceHtml, type TlInvoiceLineInput, type TlInvoicePaymentInput } from '@/lib/orders/tl-invoice-pdf-html'

const BUCKET = 'tl-invoice-pdfs'

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function formatPhoneForDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('974') && digits.length === 11) {
    return `+974 ${digits.slice(3, 7)} ${digits.slice(7)}`
  }
  if (digits.length === 8) {
    return `+974 ${digits.slice(0, 4)} ${digits.slice(4)}`
  }
  return raw.startsWith('+') ? raw : `+${digits}`
}

// invoice_number contains slashes (e.g. SINV/2026/07/0001) — flatten for
// use as a Storage object key.
function storageKeyFor(invoiceNumber: string): string {
  return `${invoiceNumber.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`
}

export interface GenerateTlInvoicePdfResult {
  url:         string
  storageKey:  string
  invoiceId:   string
  bytes:       number
  regenerated: boolean
}

interface InvoiceRow {
  id:               string
  invoice_number:   string
  order_id:         string | null
  visit_id:         string
  created_at:       string
  customer_name:    string
  customer_phone:   string | null
  subtotal:         number | null
  spare_parts_amount: number | null
  discount_amount:  number | null
  total_amount:     number | null
  paid_amount:      number | null
  payment_status:   'unpaid' | 'partial' | 'paid'
  pdf_url:          string | null
  tl_invoice_lines: Array<{
    id:                string
    name:              string
    qty:               number | null
    unit_price:        number | null
    total:             number | null
    service_id:        string | null
    catalog_image_url: string | null
  }> | null
  tl_invoice_payments: Array<{
    id:                  string
    amount:              number | null
    method_slug:         string | null
    paid_at:             string
    registered_by_name:  string | null
    payment_methods:     { name: string | null } | null
  }> | null
}

export async function generateTlInvoicePdf(
  invoiceUuid: string,
  supabase:    SupabaseClient,
  opts?:       { force?: boolean; divisionId?: string },
): Promise<GenerateTlInvoicePdfResult> {

  // 1. Fetch invoice
  const { data: inv, error: fetchErr } = await supabase
    .from('tl_invoices')
    .select(`
      id, invoice_number, order_id, visit_id, created_at,
      customer_name, customer_phone,
      subtotal, spare_parts_amount, discount_amount, total_amount, paid_amount,
      payment_status, pdf_url,
      tl_invoice_lines(id, name, qty, unit_price, total, service_id, catalog_image_url),
      tl_invoice_payments(
        id, amount, method_slug, paid_at, registered_by_name,
        payment_methods:payment_method_id(name)
      )
    `)
    .eq('id', invoiceUuid)
    .single<InvoiceRow>()

  if (fetchErr || !inv) {
    throw new Error(`TL invoice not found: ${invoiceUuid} (${fetchErr?.message ?? 'no row'})`)
  }

  // 2. Cache hit
  if (!opts?.force && inv.pdf_url) {
    return {
      url:         inv.pdf_url,
      storageKey:  storageKeyFor(inv.invoice_number),
      invoiceId:   inv.id,
      bytes:       0,
      regenerated: false,
    }
  }

  // 3. Build template data
  const total     = Number(inv.total_amount ?? 0)
  const paid      = Number(inv.paid_amount  ?? 0)
  const remaining = Math.max(0, total - paid)
  const subtotal  = Number(inv.subtotal ?? 0)
  const sparePart = Number(inv.spare_parts_amount ?? 0)
  const discount  = Number(inv.discount_amount ?? 0)

  // Resolve each line's Arabic name + unit.
  //
  // Lines now carry service_id, so this is an exact lookup. It used to match on
  // services.name_en, which cannot distinguish two services that share a leaf
  // name — and in a six-level tree they do ("Cleaning" exists under both Split
  // and Ducted), so the Arabic text and unit printed could belong to the wrong
  // service. The name match survives only as a fallback for rows written before
  // service_id existed and for a team leader's typed-in custom billable.
  type SvcMeta = { name_ar: string | null; invoice_text_ar: string | null; price_unit: string | null }
  const lineRows   = inv.tl_invoice_lines ?? []
  const serviceIds = Array.from(new Set(lineRows.map((l) => l.service_id).filter((v): v is string => !!v)))
  const legacyNames = Array.from(new Set(lineRows.filter((l) => !l.service_id).map((l) => l.name)))

  const byId   = new Map<string, SvcMeta>()
  const byName = new Map<string, SvcMeta>()

  if (serviceIds.length > 0) {
    const { data } = await supabase
      .from('services')
      .select('id, name_ar, invoice_text_ar, price_unit')
      .in('id', serviceIds)
      .limit(serviceIds.length)
    for (const r of (data ?? []) as Array<SvcMeta & { id: string }>) byId.set(r.id, r)
  }
  if (legacyNames.length > 0) {
    const { data } = await supabase
      .from('services')
      .select('name_en, name_ar, invoice_text_ar, price_unit')
      .in('name_en', legacyNames)
      // NOT .limit(legacyNames.length): leaf names repeat in this tree, so N
      // names can match more than N rows and the cap would drop one at random,
      // silently reprinting an old invoice's line English-only. Ordered so the
      // winner is at least deterministic; still bounded.
      .order('name_en')
      .limit(legacyNames.length * 4 + 20)
    for (const r of (data ?? []) as Array<SvcMeta & { name_en: string }>) byName.set(r.name_en, r)
  }

  // Photos are fetched and base64-embedded BEFORE rendering: letting the
  // renderer pull them mid-render would fail intermittently. A failure here
  // yields null for that line and an empty cell — never a failed invoice.
  const images = await fetchLineImages(lineRows.map((l) => l.catalog_image_url))

const UNIT_LABELS: Record<string, { en: string; ar: string }> = {
    unit:  { en: 'Unit',  ar: 'الوحدة' },
    hour:  { en: 'Hour',  ar: 'ساعة' },
    day:   { en: 'Day',   ar: 'يوم' },
    month: { en: 'Month', ar: 'شهر' },
    year:  { en: 'Year',  ar: 'سنة' },
    visit: { en: 'Visit', ar: 'زيارة' },
    sqm:   { en: 'Sq.M',  ar: 'م²' },
    litre: { en: 'Litre', ar: 'لتر' },
    piece: { en: 'Piece', ar: 'قطعة' },
  }

  const lines: TlInvoiceLineInput[] = lineRows.map((l, idx) => {
    const svc = l.service_id ? byId.get(l.service_id) : byName.get(l.name)
    const arText = svc?.invoice_text_ar?.trim() || svc?.name_ar?.trim() || ''
    const unitKey = (svc?.price_unit ?? 'unit').toLowerCase()
    const unit = UNIT_LABELS[unitKey] ?? { en: unitKey.charAt(0).toUpperCase() + unitKey.slice(1), ar: unitKey }
    return {
      imageDataUri: images[idx] ?? null,
      name:      l.name,
      nameAr:    arText || null,
      unitEn:    unit.en,
      unitAr:    unit.ar,
      qty:       Number(l.qty ?? 0),
      unitPrice: Number(l.unit_price ?? 0),
      total:     Number(l.total ?? 0),
    }
  })

  const payments: TlInvoicePaymentInput[] = (inv.tl_invoice_payments ?? [])
    .slice()
    .sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime())
    .map((p) => ({
      paidAt: p.paid_at,
      method: p.payment_methods?.name ?? p.method_slug ?? '—',
      amount: Number(p.amount ?? 0),
    }))

  // 4. Resolve brand + fonts
  const divisionId = opts?.divisionId ?? null
  const [brand, fonts] = await Promise.all([
    resolveBrand(divisionId, supabase),
    loadPdfFonts(),
  ])
  const { assets } = brandDataToAssets(brand)

  const html = buildTlInvoiceHtml({
    invoiceNumber: inv.invoice_number,
    orderRef:      inv.order_id,
    issuingDate:   formatDate(inv.created_at),
    customerName:  inv.customer_name,
    customerPhone: inv.customer_phone ? formatPhoneForDisplay(inv.customer_phone) : '',
    lines,
    subtotal,
    sparePartCost: sparePart,
    discount,
    total,
    paid,
    remaining,
    status:        inv.payment_status,
    payments,
    currency:      'QAR',
    assets,
    fonts,
  })

  // 5. Render + upload
  const buffer     = await htmlToPdfBuffer(html)
  const storageKey = storageKeyFor(inv.invoice_number)

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storageKey, buffer, {
      contentType:  'application/pdf',
      upsert:       true,
      cacheControl: '3600',
    })
  if (uploadErr) {
    throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storageKey)
  const publicUrl = urlData.publicUrl

  // 6. Persist URL
  const { error: updErr } = await supabase
    .from('tl_invoices')
    .update({ pdf_url: publicUrl })
    .eq('id', inv.id)
  if (updErr) {
    console.warn(`[tl-invoice-pdf] uploaded but failed to persist URL on ${inv.invoice_number}: ${updErr.message}`)
  }

  return {
    url:         publicUrl,
    storageKey,
    invoiceId:   inv.id,
    bytes:       buffer.length,
    regenerated: true,
  }
}
