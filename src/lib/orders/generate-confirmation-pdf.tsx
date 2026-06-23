/**
 * Pure helper that generates the customer-facing booking-confirmation PDF for
 * one order, uploads it to the `booking-confirmations` Storage bucket, persists
 * the public URL on `orders.confirmation_pdf_url`, and returns the URL.
 *
 * Implementation: builds a self-contained HTML document from the order data +
 * brand assets, then renders it via headless Chromium (Puppeteer). We chose
 * this over `@react-pdf/renderer` because that library reads React's private
 * internals at render time, which broke once Next.js 15 started shipping
 * React 19-canary in its RSC layer. Puppeteer doesn't touch React, so it
 * survives whatever Next bundles internally.
 *
 * Called from:
 *  - `POST /api/orders/[id]/generate-confirmation-pdf` (manual test button)
 *  - `POST /api/notifications/send-booking-confirmations` (just-in-time before
 *    the WATI send if `confirmation_pdf_url` is null)
 */

import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import puppeteer, { type Browser } from 'puppeteer-core'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildConfirmationHtml,
  type ConfirmationAssets,
  type ConfirmationFonts,
  type ConfirmationLineItem,
} from '@/lib/orders/confirmation-pdf-html'

// Re-export the line-item type so callers don't need to know about the html-builder
// module — preserves the previous public API of this file.
export type { ConfirmationLineItem as OrderConfirmationLineItem } from '@/lib/orders/confirmation-pdf-html'

// ── Asset & font loading (per-process cache) ────────────────────────────────

const BRAND_DIR = path.join(process.cwd(), 'public', 'brand')

async function readAsBase64(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath)
  return buf.toString('base64')
}

async function readAsDataUrl(filename: string, mime: string): Promise<string> {
  const b64 = await readAsBase64(path.join(BRAND_DIR, filename))
  return `data:${mime};base64,${b64}`
}

let cachedAssets: ConfirmationAssets | null = null
async function loadBrandAssets(): Promise<ConfirmationAssets> {
  if (cachedAssets) return cachedAssets
  // `Company logo.png` is the icon-only wrench-house. The "ALFAYTRI" /
  // "الفيتري" wordmarks are rendered as HTML text in the header so the
  // brand typography stays crisp at any size.
  const [logo, footer] = await Promise.all([
    readAsDataUrl('Company logo.png', 'image/png'),
    readAsDataUrl('Footer.png',       'image/png'),
  ])
  cachedAssets = { logo, footer }
  return cachedAssets
}

const FONT_DIR = path.join(BRAND_DIR, 'Font')

let cachedFonts: ConfirmationFonts | null = null
async function loadFonts(): Promise<ConfirmationFonts> {
  if (cachedFonts) return cachedFonts
  async function readFont(rel: string, mime: string): Promise<string> {
    const b64 = await readAsBase64(path.join(FONT_DIR, rel))
    return `data:${mime};base64,${b64}`
  }
  const [infieldBlock, infieldRounded, noorR, noorB] = await Promise.all([
    readFont('Infield/Infield-Block.ttf',   'font/ttf'),
    readFont('Infield/Infield-Rounded.ttf', 'font/ttf'),
    readFont('Noor/Noor Regular.ttf',       'font/ttf'),
    readFont('Noor/Noor Bold.ttf',          'font/ttf'),
  ])
  cachedFonts = { infieldBlock, infieldRounded, noorRegular: noorR, noorBold: noorB }
  return cachedFonts
}

// ── Chromium launcher ────────────────────────────────────────────────────────

function isServerlessEnv(): boolean {
  return !!process.env.VERCEL
      || !!process.env.AWS_LAMBDA_FUNCTION_NAME
      || !!process.env.AWS_EXECUTION_ENV
}

const WINDOWS_CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : '',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean) as string[]

const UNIX_CHROME_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

function findLocalChromiumExecutable(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH
  }
  const candidates = process.platform === 'win32' ? WINDOWS_CHROME_PATHS : UNIX_CHROME_PATHS
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error(
    `No local Chrome/Edge found. Tried: ${candidates.join(', ')}. ` +
    `Set PUPPETEER_EXECUTABLE_PATH in .env.local to override.`
  )
}

async function launchBrowser(): Promise<Browser> {
  if (isServerlessEnv()) {
    // Lazy-import so local dev never loads the Lambda chromium tarball.
    const chromium = (await import('@sparticuz/chromium')).default
    return puppeteer.launch({
      args:            chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath:  await chromium.executablePath(),
      headless:        true,
    })
  }
  const executablePath = findLocalChromiumExecutable()
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
}

// ── Date / phone formatting ──────────────────────────────────────────────────

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

// ── Main entry ───────────────────────────────────────────────────────────────

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

  // ── 1. Fetch order ──────────────────────────────────────────────────────
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

  // ── 2. Build template data ─────────────────────────────────────────────
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

  const [assets, fonts] = await Promise.all([loadBrandAssets(), loadFonts()])

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

  // ── 3. Render PDF via headless Chromium ────────────────────────────────
  const browser = await launchBrowser()
  let buffer: Buffer
  try {
    const page = await browser.newPage()
    // `domcontentloaded` is enough — fonts/images are inlined as data URLs so
    // there's no network to wait for. Using `networkidle0` would still wait
    // for the 500ms idle timer and add ~600ms per render for nothing.
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    // Ensure custom fonts are decoded and ready before we snapshot the page.
    await page.evaluateHandle('document.fonts.ready')
    const pdfData = await page.pdf({
      format:          'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin:          { top: 0, right: 0, bottom: 0, left: 0 },
    })
    buffer = Buffer.from(pdfData)
  } finally {
    await browser.close()
  }

  // ── 4. Upload to Storage ───────────────────────────────────────────────
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

  // ── 5. Persist URL on the order row ────────────────────────────────────
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
