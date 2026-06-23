/**
 * POST /api/orders/[id]/generate-confirmation-pdf
 *
 * Generates the booking-confirmation PDF for one order, uploads it to the
 * `booking-confirmations` Storage bucket, and saves the public URL on
 * `orders.confirmation_pdf_url`.
 *
 * Auth:
 *   Authorization: Bearer <supabase user JWT>
 *
 * Query:
 *   ?force=true  → re-render even if `confirmation_pdf_url` already set
 *
 * Returns: { url, storageKey, orderId, bytes, regenerated }
 *
 * Generation is idempotent and cached — calling this twice for the same order
 * returns the same URL without re-rendering, unless `force=true`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateOrderConfirmationPdf } from '@/lib/orders/generate-confirmation-pdf'

// React-PDF needs Node APIs (fs, Buffer). Don't run on Edge.
export const runtime = 'nodejs'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderUuid } = await params

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
  const force = req.nextUrl.searchParams.get('force') === 'true'
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    const result = await generateOrderConfirmationPdf(orderUuid, supabase, { force })
    return NextResponse.json(result)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[order-pdf]', orderUuid, msg, '\n', stack)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
