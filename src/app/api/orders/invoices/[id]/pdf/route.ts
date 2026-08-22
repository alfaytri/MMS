/**
 * GET  /api/orders/invoices/[id]/pdf
 *   Redirects (302) to the cached PDF public URL. If the invoice has no
 *   pdf_url yet, generates one first. This is the URL the TlInvoiceCard's
 *   "View PDF" anchor targets — a plain <a href="…"> works without any
 *   fetch/token dance.
 *
 * POST /api/orders/invoices/[id]/pdf
 *   Authorization: Bearer <supabase user JWT>
 *   ?force=true         regenerate even if pdf_url is set
 *   ?divisionId=<uuid>  override the brand (defaults to fallback brand)
 *   Returns { url, storageKey, invoiceId, bytes, regenerated }
 *
 * Both branches use the service-role client on the server; RLS bypass is
 * safe because the storage bucket is public-read and the invoice number
 * (which is the storage key) is not user-supplied — it comes from the row.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateTlInvoicePdf } from '@/lib/orders/generate-tl-invoice-pdf'

// Puppeteer needs Node APIs. Don't run on Edge.
export const runtime = 'nodejs'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: invoiceUuid } = await params

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const authClient = createClient(SUPA_URL, SUPA_KEY)
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const force      = req.nextUrl.searchParams.get('force') === 'true'
  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const supabase   = createClient(SUPA_URL, SUPA_KEY)

  try {
    const result = await generateTlInvoicePdf(invoiceUuid, supabase, { force, divisionId })
    return NextResponse.json(result)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[tl-invoice-pdf]', invoiceUuid, msg, '\n', stack)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: invoiceUuid } = await params
  const force    = req.nextUrl.searchParams.get('force') === 'true'
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    if (!force) {
      const { data: row } = await supabase
        .from('tl_invoices')
        .select('pdf_url')
        .eq('id', invoiceUuid)
        .maybeSingle()
      if (row?.pdf_url) return NextResponse.redirect(row.pdf_url, 302)
    }

    const result = await generateTlInvoicePdf(invoiceUuid, supabase, { force })
    return NextResponse.redirect(result.url, 302)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[tl-invoice-pdf][GET]', invoiceUuid, msg, '\n', stack)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
