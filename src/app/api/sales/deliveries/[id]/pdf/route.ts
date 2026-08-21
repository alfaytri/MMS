import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateDeliveryNotePdf } from '@/lib/sales/generate-delivery-note-pdf'
import { requireDocPermission } from '@/lib/api/require-doc-permission'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireDocPermission(req, 'sales.deliveries.view')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const force = req.nextUrl.searchParams.get('force') === 'true'
  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    const result = await generateDeliveryNotePdf(id, supabase, { force, divisionId })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[delivery-note-pdf]', id, msg)
    const status = msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireDocPermission(req, 'sales.deliveries.view')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const force = req.nextUrl.searchParams.get('force') === 'true'
  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    const result = await generateDeliveryNotePdf(id, supabase, { force, divisionId })
    return NextResponse.redirect(result.url, 302)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[delivery-note-pdf:GET]', id, msg)
    const status = msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
