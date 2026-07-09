/**
 * Server-side quotation PDF generator.
 *
 *  - Fetches the quotation + line items + customer + phones from Supabase
 *  - Builds self-contained HTML via `buildQuotationHtml`
 *  - Renders to PDF with the shared headless Chromium pipeline
 *  - Uploads to the `quotation-pdfs` Storage bucket (filename keyed on
 *    `quotation_id`), upsert: true
 *  - Returns the public URL
 *
 * Called from:
 *  - `POST /api/quotations/[id]/generate-pdf`        (PDF generation for send)
 *  - `POST /api/quotations/preview-html` (HTML only — does NOT use Puppeteer)
 *
 * The preview route imports `loadQuotationBrandAssets` and `loadQuotationFonts`
 * only, so Puppeteer never loads on that code path.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildQuotationHtml,
  type QuotationLineItem,
} from '@/lib/quotations/quotation-pdf-html'
import { loadPdfFonts, loadPdfAssets } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'

// ── Compat re-exports for preview-html route ────────────────────────────────
// The preview-html route previously imported loadQuotationBrandAssets and
// loadQuotationFonts from this file. Provide thin wrappers around the shared
// loaders so existing callers do not break.
export const loadQuotationBrandAssets = loadPdfAssets
export const loadQuotationFonts       = loadPdfFonts

// ── Date formatting ─────────────────────────────────────────────────────────

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  return `${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// Quotation IDs contain slashes ("Q/2026/06/0006") which would nest into folders.
function storageKeyFor(quotationId: string): string {
  return `${quotationId.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`
}

// ── DB row type ──────────────────────────────────────────────────────────────

interface QuotationRow {
  id:                  string
  quotation_id:        string
  division:            string | null
  total_amount:        number
  discount_type:       string
  discount_value:      number
  notes:               string | null
  created_date:        string
  expiry_date:         string | null
  service_customer_id: string
  service_customers:   {
    name: string | null
    service_customer_phones?: { phone: string; is_primary?: boolean }[] | null
  } | null
  order_quotation_line_items: Array<{
    name:  string
    path:  string[] | null
    qty:   number
    price: number
  }> | null
}

// ── Main entry ───────────────────────────────────────────────────────────────

export interface GenerateQuotationPdfResult {
  url:        string
  storageKey: string
  quotationId: string
  bytes:      number
}

export async function generateQuotationPdf(
  quotationUuid: string,
  supabase:      SupabaseClient,
  opts?: { divisionId?: string },
): Promise<GenerateQuotationPdfResult> {

  // ── 1. Fetch quotation ──────────────────────────────────────────────────
  const { data: q, error: fetchErr } = await supabase
    .from('order_quotations')
    .select(`
      id, quotation_id, division, total_amount, discount_type, discount_value, notes,
      created_date, expiry_date, service_customer_id,
      service_customers(
        name,
        service_customer_phones(phone, is_primary)
      ),
      order_quotation_line_items(name, path, qty, price)
    `)
    .eq('id', quotationUuid)
    .single<QuotationRow>()

  if (fetchErr || !q) {
    throw new Error(`Quotation not found: ${quotationUuid} (${fetchErr?.message ?? 'no row'})`)
  }

  // ── 2. Read admin validity setting (for the "Valid for N days" footnote) ─
  const { data: validityRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'order_quotation_validity_days')
    .maybeSingle()
  const cfgDays = Number((validityRow?.value as { days?: number } | null)?.days)
  const validityDays = Number.isFinite(cfgDays) && cfgDays > 0 ? cfgDays : 30

  // ── 3. Build template data ─────────────────────────────────────────────
  const customer = q.service_customers
  const phones   = customer?.service_customer_phones ?? []
  const primaryPhone = phones.find((p) => p.is_primary)?.phone ?? phones[0]?.phone ?? ''

  const services: QuotationLineItem[] = (q.order_quotation_line_items ?? []).map((li) => ({
    name:      li.name,
    pathLabel: (li.path && li.path.length > 1) ? li.path.slice(0, -1).join(' › ') : '',
    qty:       li.qty,
    unitPrice: Number(li.price ?? 0),
    subtotal:  Number(li.qty ?? 0) * Number(li.price ?? 0),
  }))

  const subtotal = services.reduce((acc, li) => acc + li.subtotal, 0)
  const total    = Number(q.total_amount ?? 0)
  const discount = Math.max(0, subtotal - total)

  const issuingDate = formatDate(q.created_date)
  const validUntil  = q.expiry_date ? formatDate(q.expiry_date) : ''

  // Resolve division UUID: override > slug lookup > null
  let divisionId: string | null = opts?.divisionId ?? null
  if (!divisionId && q.division) {
    const { data: divRow } = await supabase
      .from('company_divisions')
      .select('id')
      .eq('slug', q.division)
      .maybeSingle()
    divisionId = divRow?.id ?? null
  }

  const [brand, fonts] = await Promise.all([
    resolveBrand(divisionId, supabase),
    loadPdfFonts(),
  ])
  const { assets } = brandDataToAssets(brand)

  const html = buildQuotationHtml({
    quotationNumber: q.quotation_id,
    issuingDate,
    validUntilDate:  validUntil,
    validityDays,
    customerName:    customer?.name ?? '',
    customerPhone:   primaryPhone,
    services,
    subtotal,
    discount,
    total,
    notes:           q.notes ?? '',
    preparedBy:      '',  // could be sourced from order_quotation_log if needed
    currency:        'QAR',
    assets,
    fonts,
  })

  // ── 4. Render PDF via shared Chromium pipeline ────────────────────────
  const buffer = await htmlToPdfBuffer(html)

  // ── 5. Upload to Storage ───────────────────────────────────────────────
  const storageKey = storageKeyFor(q.quotation_id)
  const { error: uploadErr } = await supabase.storage
    .from('quotation-pdfs')
    .upload(storageKey, buffer, {
      contentType:  'application/pdf',
      upsert:       true,
      cacheControl: '3600',
    })

  if (uploadErr) {
    throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('quotation-pdfs')
    .getPublicUrl(storageKey)

  return {
    url:        urlData.publicUrl,
    storageKey,
    quotationId: q.quotation_id,
    bytes:      buffer.length,
  }
}
