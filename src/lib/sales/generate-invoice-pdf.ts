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
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { fetchArabicNamesByEnglishName, fetchOriginsByBrandVariant } from '@/lib/pdf/arabic-names'
import { fetchCategoryInfoByBrandVariant } from '@/lib/pdf/category-paths'

async function hydrateInvoiceLines(
  client: SupabaseClient,
  lines:  InvoiceLineItem[],
): Promise<InvoiceLineItem[]> {
  if (lines.length === 0) return lines
  const [arMap, originMap, catMap] = await Promise.all([
    fetchArabicNamesByEnglishName(client, lines.map((l) => l.description)),
    fetchOriginsByBrandVariant(client, lines.map((l) => l.brand_variant_id ?? null)),
    fetchCategoryInfoByBrandVariant(client, lines.map((l) => l.brand_variant_id ?? null)),
  ])
  return lines.map((l) => ({
    ...l,
    description_ar: arMap.get(l.description) ?? null,
    origin:         l.brand_variant_id ? originMap.get(l.brand_variant_id) ?? null : null,
    category_path:  l.brand_variant_id ? catMap.get(l.brand_variant_id)?.category_path ?? null : null,
  }))
}

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
  customers:       { name: string | null; customer_phones: { phone: string; is_primary: boolean }[] | null } | null
  invoice_line_items: InvoiceLineItem[] | null
  sale_orders:     { so_number: string; payment_terms: string | null; division_id: string | null; currency: string | null } | null
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
  opts?:       { force?: boolean; divisionId?: string },
): Promise<GenerateInvoicePdfResult> {

  // ── 1. Fetch invoice ─────────────────────────────────────────────────
  const { data: inv, error: fetchErr } = await supabase
    .from('so_invoices')
    .select(`
      id, invoice_id, invoice_type, issued_date, due_date,
      subtotal, discount_amount, total_amount, paid_amount, payment_status,
      notes, pdf_url, sale_order_id,
      customers(name, customer_phones(phone, is_primary)),
      invoice_line_items(description, qty, unit_price, total, brand_variant_id),
      sale_orders(so_number, payment_terms, division_id, currency)
    `)
    .eq('id', invoiceUuid)
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
  const [brand, fonts] = await Promise.all([
    resolveBrand(opts?.divisionId ?? inv.sale_orders?.division_id ?? null, supabase),
    loadPdfFonts(),
  ])
  const { assets } = brandDataToAssets(brand)

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

  const payments: InvoicePayment[] = (payRows ?? []).map((p: { date: string; amount: number | null; method: string | null; reference: string | null }) => ({
    date:      p.date,
    amount:    Number(p.amount ?? 0),
    method:    p.method ?? '—',
    reference: p.reference,
  }))

  // Payment plan schedule (active plans only). Renders under a
  // "Payment Schedule" section in the PDF.
  const { data: planRows } = await supabase
    .from('payment_plans')
    .select('id, status, plan_type, total_amount, payment_installments(id, due_date, amount, paid_amount, status)')
    .eq('invoice_id', inv.id)
    .eq('status', 'active')
    .limit(5)

  type InstRow = { id: string; due_date: string | null; amount: number | null; paid_amount: number | null; status: string }
  type PlanRow = { id: string; status: string; plan_type: string; total_amount: number | null; payment_installments: InstRow[] | null }
  const paymentPlan = (planRows as PlanRow[] | null)?.[0] ?? null
  const paymentInstallments = paymentPlan
    ? (paymentPlan.payment_installments ?? [])
        .slice()
        .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
        .map((i) => ({
          due_date:    i.due_date,
          amount:      Number(i.amount ?? 0),
          paid_amount: Number(i.paid_amount ?? 0),
          status:      i.status,
        }))
    : []

  const html = buildInvoiceHtml({
    invoice_id:     inv.invoice_id,
    invoice_type:   inv.invoice_type,
    issued_date:    inv.issued_date,
    due_date:       inv.due_date,
    customer_name:  inv.customers?.name  ?? '',
    customer_phone: (() => {
      const phones = inv.customers?.customer_phones ?? []
      return phones.find((p) => p.is_primary)?.phone ?? phones[0]?.phone ?? null
    })(),
    so_number:      inv.sale_orders?.so_number ?? null,
    currency:       inv.sale_orders?.currency ?? 'QAR',
    lines:          await hydrateInvoiceLines(supabase, inv.invoice_line_items ?? []),
    subtotal,
    discount,
    total_amount:   totalAmount,
    amount_paid:    paid,
    outstanding,
    payments,
    payment_terms:  inv.sale_orders?.payment_terms ?? null,
    notes:          inv.notes,
    isPaid:         inv.payment_status === 'paid',
    plan_type:      (paymentPlan?.plan_type as 'schedule' | 'adhoc' | null) ?? null,
    installments:   paymentInstallments,
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
