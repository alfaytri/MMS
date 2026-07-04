/**
 * Generates the SO Quotation PDF for one sale order, uploads it to the
 * `quotation-pdfs` Storage bucket, persists the public URL on
 * `sale_orders.quotation_pdf_url` (via the service-role RPC that bypasses the
 * cache-invalidation trigger), and returns the URL.
 *
 * Implementation: builds a self-contained HTML document and renders it via
 * headless Chromium. We chose this over `@react-pdf/renderer` because that
 * library reads React's private internals at render time, which broke once
 * Next.js 15 started shipping React 19-canary in its RSC layer. Puppeteer
 * doesn't touch React, so it survives whatever Next bundles internally.
 *
 * Cache invalidation: handled by DB triggers — any edit to the SO row or its
 * `sale_order_lines` rows nulls `quotation_pdf_url`, causing the next call to
 * regenerate. The trigger is suppressed when this generator writes the URL
 * back (via `app.skip_pdf_invalidation` GUC inside the RPC).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildQuotationHtml,
  type QuotationLineItem,
} from '@/lib/sales/quotation-pdf-html'
import { loadPdfFonts, loadPdfAssets } from '@/lib/pdf/pdf-fonts'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'

// SO numbers like "SO-00088" don't contain slashes, but normalise anyway.
function storageKeyFor(soNumber: string): string {
  return `${soNumber.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`
}

interface SaleOrderRow {
  id:                       string
  so_number:                string
  subtotal:                 number
  total:                    number
  discount_amount_resolved: number
  discount_label:           string | null
  currency:                 string
  validity_days:            number
  payment_terms:            string | null
  payment_terms_notes:      string | null
  delivery_terms:           string | null
  delivery_terms_notes:     string | null
  customer_notes:           string | null
  created_at:               string
  quotation_pdf_url:        string | null
  customers:                { name: string | null; phone: string | null } | null
  sale_order_lines:         QuotationLineItem[] | null
}

export interface GenerateQuotationPdfResult {
  url:         string
  storageKey:  string
  soNumber:    string
  bytes:       number
  regenerated: boolean
}

export async function generateQuotationPdf(
  saleOrderId: string,
  supabase:    SupabaseClient,
  opts?:       { force?: boolean },
): Promise<GenerateQuotationPdfResult> {

  // ── 1. Fetch SO ────────────────────────────────────────────────────────
  const { data: so, error: fetchErr } = await supabase
    .from('sale_orders')
    .select(`
      id, so_number, subtotal, total, discount_amount_resolved, discount_label,
      currency, validity_days,
      payment_terms, payment_terms_notes,
      delivery_terms, delivery_terms_notes,
      customer_notes, created_at, quotation_pdf_url,
      customers(name, phone),
      sale_order_lines(item_name, item_name_ar, sku, qty, unit, unit_price, total, line_type)
    `)
    .eq('id', saleOrderId)
    .single<SaleOrderRow>()

  if (fetchErr || !so) {
    throw new Error(`Sale order not found: ${saleOrderId} (${fetchErr?.message ?? 'no row'})`)
  }

  if (!opts?.force && so.quotation_pdf_url) {
    return {
      url:         so.quotation_pdf_url,
      storageKey:  storageKeyFor(so.so_number),
      soNumber:    so.so_number,
      bytes:       0,
      regenerated: false,
    }
  }

  // ── 2. Build HTML ──────────────────────────────────────────────────────
  const [assets, fonts] = await Promise.all([loadPdfAssets(), loadPdfFonts()])

  const html = buildQuotationHtml({
    so_number:                so.so_number,
    created_at:               so.created_at,
    validity_days:            so.validity_days,
    currency:                 so.currency,
    customer_name:            so.customers?.name  ?? '',
    customer_phone:           so.customers?.phone ?? null,
    lines:                    so.sale_order_lines ?? [],
    subtotal:                 Number(so.subtotal ?? 0),
    discount_amount_resolved: Number(so.discount_amount_resolved ?? 0),
    discount_label:           so.discount_label,
    total:                    Number(so.total ?? 0),
    payment_terms:            so.payment_terms,
    payment_terms_notes:      so.payment_terms_notes,
    delivery_terms:           so.delivery_terms,
    delivery_terms_notes:     so.delivery_terms_notes,
    customer_notes:           so.customer_notes,
    assets,
    fonts,
  })

  // ── 4. Render to PDF ───────────────────────────────────────────────────
  const buffer = await htmlToPdfBuffer(html)

  // ── 5. Upload to storage ───────────────────────────────────────────────
  const storageKey = storageKeyFor(so.so_number)
  const { error: uploadErr } = await supabase.storage
    .from('quotation-pdfs')
    .upload(storageKey, buffer, {
      contentType:  'application/pdf',
      upsert:       true,
      cacheControl: '0',
    })
  if (uploadErr) {
    throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('quotation-pdfs')
    .getPublicUrl(storageKey)
  // Cache-buster — see note in generate-invoice-pdf.ts.
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

  // ── 6. Persist URL (via RPC so the cache-invalidation trigger skips) ──
  const { error: rpcErr } = await supabase.rpc('set_sale_order_pdf_url', {
    p_id:  so.id,
    p_url: publicUrl,
  })
  if (rpcErr) {
    console.warn(`[so-pdf] uploaded but failed to persist URL on ${so.so_number}: ${rpcErr.message}`)
  }

  return {
    url:         publicUrl,
    storageKey,
    soNumber:    so.so_number,
    bytes:       buffer.length,
    regenerated: true,
  }
}
