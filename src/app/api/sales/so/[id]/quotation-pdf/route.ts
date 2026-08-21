/**
 * POST   /api/sales/so/[id]/quotation-pdf   — generate (or return cached) URL
 * GET    /api/sales/so/[id]/quotation-pdf   — convenience: 302 redirect to URL
 *
 * Auth: Authorization: Bearer <supabase user JWT> + sales.orders.view permission.
 *
 * Query:
 *   ?force=true  → re-render even if `quotation_pdf_url` is already set
 *
 * POST returns JSON: { url, storageKey, soNumber, bytes, regenerated }.
 * GET   is a download convenience for `<a href="…">View PDF</a>` — it ensures
 *       the PDF exists, then 302-redirects to the public Storage URL so the
 *       browser opens / downloads it natively.
 *
 * The DB triggers null `quotation_pdf_url` on any edit to the SO or its lines,
 * so the next call regenerates automatically.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateQuotationPdf } from '@/lib/sales/generate-quotation-pdf'
import { requireDocPermission } from '@/lib/api/require-doc-permission'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: soId } = await params

  const auth = await requireDocPermission(req, 'sales.orders.view')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const force = req.nextUrl.searchParams.get('force') === 'true'
  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    const result = await generateQuotationPdf(soId, supabase, { force, divisionId })
    return NextResponse.json(result)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[so-quotation-pdf]', soId, msg, '\n', stack)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: soId } = await params

  const auth = await requireDocPermission(req, 'sales.orders.view')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const force = req.nextUrl.searchParams.get('force') === 'true'
  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    const { url } = await generateQuotationPdf(soId, supabase, { force, divisionId })
    return NextResponse.redirect(url, 302)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[so-quotation-pdf:GET]', soId, msg, '\n', stack)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
