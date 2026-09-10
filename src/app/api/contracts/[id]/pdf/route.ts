/**
 * GET  /api/contracts/[id]/pdf   → generates the contract/quotation document PDF
 *   fresh (no cache column — always current) and 302-redirects to it.
 * POST /api/contracts/[id]/pdf   (Bearer JWT) → returns { url, ... }.
 *
 * Service-role on the server; the `contract-pdfs` bucket is public-read and the
 * storage key is the contract/quotation number (from the row, not user input).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateContractPdf } from '@/lib/contracts/generate-contract-pdf'

export const runtime = 'nodejs'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authClient = createClient(SUPA_URL, SUPA_KEY)
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const supabase = createClient(SUPA_URL, SUPA_KEY)
  try {
    const result = await generateContractPdf(id, supabase, { divisionId })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[contract-pdf]', id, msg, '\n', err instanceof Error ? err.stack : '')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createClient(SUPA_URL, SUPA_KEY)
  try {
    const result = await generateContractPdf(id, supabase)
    return NextResponse.redirect(result.url, 302)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[contract-pdf][GET]', id, msg, '\n', err instanceof Error ? err.stack : '')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
