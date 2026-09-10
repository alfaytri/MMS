/**
 * GET  /api/contracts/invoices/[id]/pdf   → 302 to the cached PDF (generates if missing).
 * POST /api/contracts/invoices/[id]/pdf   (Bearer JWT) → regenerate; returns { url, ... }.
 *   ?force=true  regenerate even if pdf_url is set.
 *
 * Mirrors /api/orders/invoices/[id]/pdf. Service-role on the server; the
 * `contract-invoice-pdfs` bucket is public-read and the storage key is the
 * row's invoice_number (not user-supplied).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateContractInvoicePdf } from '@/lib/contracts/generate-contract-invoice-pdf'

export const runtime = 'nodejs'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: invoiceUuid } = await params

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authClient = createClient(SUPA_URL, SUPA_KEY)
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const force      = req.nextUrl.searchParams.get('force') === 'true'
  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const supabase   = createClient(SUPA_URL, SUPA_KEY)

  try {
    const result = await generateContractInvoicePdf(invoiceUuid, supabase, { force, divisionId })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[contract-invoice-pdf]', invoiceUuid, msg, '\n', err instanceof Error ? err.stack : '')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: invoiceUuid } = await params
  const force    = req.nextUrl.searchParams.get('force') === 'true'
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    if (!force) {
      const { data: row } = await supabase
        .from('contract_invoices').select('pdf_url').eq('id', invoiceUuid).maybeSingle()
      if (row?.pdf_url) return NextResponse.redirect(row.pdf_url, 302)
    }
    const result = await generateContractInvoicePdf(invoiceUuid, supabase, { force })
    return NextResponse.redirect(result.url, 302)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[contract-invoice-pdf][GET]', invoiceUuid, msg, '\n', err instanceof Error ? err.stack : '')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
