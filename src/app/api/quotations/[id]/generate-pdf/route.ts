/**
 * POST /api/quotations/[id]/generate-pdf
 *
 * Generates the quotation PDF for one saved order_quotation, uploads it to the
 * `quotation-pdfs` Storage bucket, and returns the public URL. Always
 * regenerates — quotations are edited frequently and there's no per-row
 * cached URL column.
 *
 * Auth:
 *   Authorization: Bearer <supabase user JWT>
 *
 * Returns: { url, storageKey, quotationId, bytes }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateQuotationPdf } from '@/lib/quotations/generate-quotation-pdf'

// Puppeteer needs Node APIs (fs, Buffer). Don't run on Edge.
export const runtime = 'nodejs'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: quotationUuid } = await params

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

  // ── Generate ──────────────────────────────────────────────────────────
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    const result = await generateQuotationPdf(quotationUuid, supabase)
    return NextResponse.json(result)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[quotation-pdf]', quotationUuid, msg, '\n', stack)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
