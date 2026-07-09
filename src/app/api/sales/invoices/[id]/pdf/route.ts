/**
 * POST /api/sales/invoices/[id]/pdf  → returns { url, storageKey, invoiceId, bytes, regenerated }
 * GET  /api/sales/invoices/[id]/pdf  → 302 redirect to the public PDF URL
 *
 * Auth: Authorization: Bearer <supabase user JWT>
 * Query: ?force=true to bypass cache
 *
 * Cache is invalidated by DB triggers — see migration 20260627101900.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateInvoicePdf } from '@/lib/sales/generate-invoice-pdf'

export const runtime = 'nodejs'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function requireUser(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const authClient = createClient(SUPA_URL, SUPA_KEY)
  const { data: { user }, error } = await authClient.auth.getUser(token)
  if (error || !user) return null
  return user
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const force    = req.nextUrl.searchParams.get('force') === 'true'
  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const supabase = createClient(SUPA_URL, SUPA_KEY)
  try {
    const result = await generateInvoicePdf(id, supabase, { force, divisionId })
    return NextResponse.json(result)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[invoice-pdf]', id, msg, '\n', stack)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const force    = req.nextUrl.searchParams.get('force') === 'true'
  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const supabase = createClient(SUPA_URL, SUPA_KEY)
  try {
    const { url } = await generateInvoicePdf(id, supabase, { force, divisionId })
    return NextResponse.redirect(url, 302)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[invoice-pdf:GET]', id, msg, '\n', stack)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
