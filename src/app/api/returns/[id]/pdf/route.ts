import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateReturnPdf } from '@/lib/returns/generate-return-pdf'
import { requireDocPermission } from '@/lib/api/require-doc-permission'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// A return can be a sale return or a purchase return, so allow either module's view perm.
const RETURN_PERMS = ['sales.returns.view', 'purchase.returns.view']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireDocPermission(req, RETURN_PERMS)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const force = req.nextUrl.searchParams.get('force') === 'true'
  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    const result = await generateReturnPdf(id, supabase, { force, divisionId })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[return-pdf]', id, msg)
    const status = msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireDocPermission(req, RETURN_PERMS)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const force = req.nextUrl.searchParams.get('force') === 'true'
  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    const result = await generateReturnPdf(id, supabase, { force, divisionId })
    return NextResponse.redirect(result.url, 302)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[return-pdf:GET]', id, msg)
    const status = msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
