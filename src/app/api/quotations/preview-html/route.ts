/**
 * POST /api/quotations/preview-html
 *
 * Returns the self-contained HTML for an in-progress quotation draft. Used by
 * the editor's iframe preview so the on-screen view is pixel-identical to the
 * PDF the customer will receive. Does NOT hit the database or Puppeteer — just
 * stitches the draft data into the shared `buildQuotationHtml` template with
 * brand assets/fonts loaded from disk.
 *
 * Auth:
 *   Authorization: Bearer <supabase user JWT>
 *
 * Body (JSON):
 *   {
 *     quotationNumber: string
 *     customerName:    string
 *     customerPhone:   string
 *     services:        Array<{ name, pathLabel, qty, unitPrice, subtotal }>
 *     subtotal:        number
 *     discount:        number
 *     total:           number
 *     notes:           string
 *     preparedBy:      string
 *     issuingDate:     string   // pre-formatted "24 Jun 2026"
 *     validUntilDate:  string   // pre-formatted
 *     validityDays:    number
 *   }
 *
 * Returns: HTML body with `Content-Type: text/html`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  buildQuotationHtml,
  type QuotationLineItem,
} from '@/lib/quotations/quotation-pdf-html'
import {
  loadQuotationBrandAssets,
  loadQuotationFonts,
} from '@/lib/quotations/generate-quotation-pdf'

export const runtime = 'nodejs'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface PreviewBody {
  quotationNumber: string
  customerName:    string
  customerPhone:   string
  services:        QuotationLineItem[]
  subtotal:        number
  discount:        number
  total:           number
  notes:           string
  preparedBy:      string
  issuingDate:     string
  validUntilDate:  string
  validityDays:    number
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const authClient = createClient(SUPA_URL, SUPA_KEY)
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as PreviewBody
    const [assets, fonts] = await Promise.all([loadQuotationBrandAssets(), loadQuotationFonts()])

    const html = buildQuotationHtml({
      quotationNumber: body.quotationNumber || '',
      issuingDate:     body.issuingDate,
      validUntilDate:  body.validUntilDate,
      validityDays:    body.validityDays,
      customerName:    body.customerName,
      customerPhone:   body.customerPhone,
      services:        body.services,
      subtotal:        body.subtotal,
      discount:        body.discount,
      total:           body.total,
      notes:           body.notes,
      preparedBy:      body.preparedBy,
      currency:        'QAR',
      assets,
      fonts,
    })

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[quotation-preview-html]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
