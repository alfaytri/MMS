import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateWarrantyCertificatePdf } from '@/lib/sales/generate-warranty-certificate-pdf'
import { requireDocPermission } from '@/lib/api/require-doc-permission'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Streams the warranty certificate PDF as inline bytes — regenerated
 * on every call, no Storage upload. Per plan: snapshotted terms in
 * warranty_records make the reprint always reproducible from live
 * records, and skipping Storage avoids the cascade-cleanup work.
 */
async function handle(req: NextRequest, id: string) {
  const auth = await requireDocPermission(req, 'sales.deliveries.view')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    const { buffer, filename } = await generateWarrantyCertificatePdf(
      id, supabase, { divisionId },
    )
    // Copy into a fresh Uint8Array so the Response body is a plain
    // ArrayBuffer view (avoids Node Buffer vs. web BodyInit type friction).
    const bytes = new Uint8Array(buffer.byteLength)
    bytes.set(buffer)
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[warranty-certificate]', id, msg)
    const status = msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(req, id)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(req, id)
}
