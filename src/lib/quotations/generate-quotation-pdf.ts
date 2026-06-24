/**
 * Server-side quotation PDF generator. Mirrors `generate-confirmation-pdf.tsx`.
 *
 *  - Fetches the quotation + line items + customer + phones from Supabase
 *  - Builds self-contained HTML via `buildQuotationHtml`
 *  - Renders to PDF with headless Chromium (Puppeteer)
 *  - Uploads to the `quotation-pdfs` Storage bucket (filename keyed on
 *    `quotation_id`), upsert: true
 *  - Returns the public URL
 *
 * Called from:
 *  - `POST /api/quotations/[id]/generate-pdf`        (PDF generation for send)
 *  - `POST /api/quotations/preview-html` (HTML only — does NOT use Puppeteer)
 *
 * The preview route imports `buildQuotationHtmlFromDraft` only, so Puppeteer
 * never loads on that code path.
 */

import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import puppeteer, { type Browser } from 'puppeteer-core'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildQuotationHtml,
  type QuotationAssets,
  type QuotationFonts,
  type QuotationLineItem,
} from '@/lib/quotations/quotation-pdf-html'

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

let cachedAssets: QuotationAssets | null = null
export async function loadQuotationBrandAssets(): Promise<QuotationAssets> {
  if (cachedAssets) return cachedAssets
  const [logo, footer] = await Promise.all([
    readAsDataUrl('Company logo.png', 'image/png'),
    readAsDataUrl('Footer.png',       'image/png'),
  ])
  cachedAssets = { logo, footer }
  return cachedAssets
}

const FONT_DIR = path.join(BRAND_DIR, 'Font')

let cachedFonts: QuotationFonts | null = null
export async function loadQuotationFonts(): Promise<QuotationFonts> {
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
    const chromium = (await import('@sparticuz/chromium')).default
    return puppeteer.launch({
      args:            chromium.args,
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

// Quotation IDs contain slashes ("Q/2026/06/0006") which would nest into folders.
function storageKeyFor(quotationId: string): string {
  return `${quotationId.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`
}

// ── DB row type ──────────────────────────────────────────────────────────────

interface QuotationRow {
  id:                  string
  quotation_id:        string
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
): Promise<GenerateQuotationPdfResult> {

  // ── 1. Fetch quotation ──────────────────────────────────────────────────
  const { data: q, error: fetchErr } = await supabase
    .from('order_quotations')
    .select(`
      id, quotation_id, total_amount, discount_type, discount_value, notes,
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

  const [assets, fonts] = await Promise.all([loadQuotationBrandAssets(), loadQuotationFonts()])

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

  // ── 4. Render PDF via headless Chromium ────────────────────────────────
  const browser = await launchBrowser()
  let buffer: Buffer
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    await page.evaluateHandle('document.fonts.ready')
    const pdfData = await page.pdf({
      format:            'A4',
      printBackground:   true,
      preferCSSPageSize: true,
      margin:            { top: 0, right: 0, bottom: 0, left: 0 },
    })
    buffer = Buffer.from(pdfData)
  } finally {
    await browser.close()
  }

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
