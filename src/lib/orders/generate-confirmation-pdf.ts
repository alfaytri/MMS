/**
 * Pure helper that generates the customer-facing booking-confirmation PDF for
 * one order, uploads it to the `booking-confirmations` Storage bucket, persists
 * the public URL on `orders.confirmation_pdf_url`, and returns the URL.
 *
 * Implementation: builds a self-contained HTML document from the order data +
 * brand assets, then renders it via the shared Puppeteer pipeline in
 * `@/lib/pdf/html-to-pdf`. Fonts and assets are loaded from the shared
 * `@/lib/pdf/pdf-fonts` module (IBM Plex Sans/Arabic, cached per-process).
 *
 * Called from:
 *  - `POST /api/orders/[id]/generate-confirmation-pdf` (manual test button)
 *  - `POST /api/notifications/send-booking-confirmations` (just-in-time before
 *    the WATI send if `confirmation_pdf_url` is null)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPdfFonts, loadPdfAssets } from '@/lib/pdf/pdf-fonts'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import {
  buildConfirmationHtml,
  type ConfirmationLineItem,
} from '@/lib/orders/confirmation-pdf-html'

// Re-export the line-item type so callers don't need to know about the html-builder
// module — preserves the previous public API of this file.
export type { ConfirmationLineItem as OrderConfirmationLineItem } from '@/lib/orders/confirmation-pdf-html'

// -- Date / phone formatting -------------------------------------------------

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
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

// order_id contains slashes ("N/2026/01/00088") which would nest into folders.
function storageKeyFor(orderId: string): string {
  return `${orderId.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`
}

// -- Main entry ---------------------------------------------------------------

export interface GenerateOrderConfirmationPdfResult {
  url:          string
  storageKey:   string
  orderId:      string
  bytes:        number
  regenerated:  boolean
}

interface OrderRow {
  id:                   string
  order_id:             string
  scheduled_date:       string
  total_amount:         number
  confirmation_pdf_url: string | null
  service_customer_id:  string
  service_customers:    {
    name: string | null
    service_customer_phones?: { phone: string; is_primary?: boolean }[] | null
  } | null
  order_services:       Array<{
    name:    string
    qty:     number
    price:   number
    // Joined from the `services` table — provides the Arabic line shown
    // beneath the English service name in the confirmation PDF.
    services: {
      name_ar:         string | null
      invoice_text_ar: string | null
    } | null
  }> | null
}

export async function generateOrderConfirmationPdf(
  orderUuid: string,
  supabase:  SupabaseClient,
  opts?:     { force?: boolean },
): Promise<GenerateOrderConfirmationPdfResult> {

  // -- 1. Fetch order ---------------------------------------------------------
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select(`
      id,
      order_id,
      scheduled_date,
      total_amount,
      confirmation_pdf_url,
      service_customer_id,
      service_customers(
        name,
        service_customer_phones(phone, is_primary)
      ),
      order_services(name, qty, price, services(name_ar, invoice_text_ar))
    `)
    .eq('id', orderUuid)
    .single<OrderRow>()

  if (fetchErr || !order) {
    throw new Error(`Order not found: ${orderUuid} (${fetchErr?.message ?? 'no row'})`)
  }

  if (!opts?.force && order.confirmation_pdf_url) {
    return {
      url:         order.confirmation_pdf_url,
      storageKey:  storageKeyFor(order.order_id),
      orderId:     order.order_id,
      bytes:       0,
      regenerated: false,
    }
  }

  // -- 2. Build template data -------------------------------------------------
  const customer = order.service_customers
  const phones   = customer?.service_customer_phones ?? []
  const primaryPhone = phones.find((p) => p.is_primary)?.phone ?? phones[0]?.phone ?? ''

  const services: ConfirmationLineItem[] = (order.order_services ?? []).map((row) => {
    // Prefer `invoice_text_ar` (sale-facing copy) over `name_ar` (catalogue
    // label) when present. The HTML builder converts `\n` to `<br>` so the
    // English snapshot and Arabic translation render on stacked lines.
    const arabicName = row.services?.invoice_text_ar?.trim()
                    || row.services?.name_ar?.trim()
                    || ''
    const combinedName = arabicName ? `${row.name}\n${arabicName}` : row.name
    return {
      name:      combinedName,
      qty:       row.qty,
      unitPrice: Number(row.price ?? 0),
      subtotal:  Number(row.qty ?? 0) * Number(row.price ?? 0),
    }
  })

  const subtotal = services.reduce((acc, li) => acc + li.subtotal, 0)
  const total    = Number(order.total_amount ?? 0)
  const discount = Math.max(0, subtotal - total)

  const todayIso = new Date().toISOString().split('T')[0]

  const [assets, fonts] = await Promise.all([loadPdfAssets(), loadPdfFonts()])

  const html = buildConfirmationHtml({
    orderNumber:   order.order_id,
    issuingDate:   formatDate(todayIso),
    scheduledDate: formatDate(order.scheduled_date),
    customerName:  customer?.name ?? '',
    customerPhone: primaryPhone ? formatPhoneForDisplay(primaryPhone) : '',
    services,
    subtotal,
    discount,
    total,
    currency: 'QAR',
    assets,
    fonts,
  })

  // -- 3. Render PDF via shared pipeline --------------------------------------
  const buffer = await htmlToPdfBuffer(html)

  // -- 4. Upload to Storage ---------------------------------------------------
  const storageKey = storageKeyFor(order.order_id)
  const { error: uploadErr } = await supabase.storage
    .from('booking-confirmations')
    .upload(storageKey, buffer, {
      contentType:  'application/pdf',
      upsert:       true,
      cacheControl: '3600',
    })

  if (uploadErr) {
    throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('booking-confirmations')
    .getPublicUrl(storageKey)
  const publicUrl = urlData.publicUrl

  // -- 5. Persist URL on the order row ----------------------------------------
  const { error: updateErr } = await supabase
    .from('orders')
    .update({ confirmation_pdf_url: publicUrl })
    .eq('id', order.id)

  if (updateErr) {
    console.warn(`[order-pdf] uploaded but failed to persist URL on ${order.order_id}: ${updateErr.message}`)
  }

  return {
    url:         publicUrl,
    storageKey,
    orderId:     order.order_id,
    bytes:       buffer.length,
    regenerated: true,
  }
}
