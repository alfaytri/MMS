/**
 * GET /api/sales/customers/[id]/statement/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   → returns application/pdf inline (opens in a new tab)
 *
 * Auth: Authorization: Bearer <supabase user JWT>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateStatementPdf } from '@/lib/sales/generate-statement-pdf'

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const from = req.nextUrl.searchParams.get('from')
  const to   = req.nextUrl.searchParams.get('to')

  const supabase = createClient(SUPA_URL, SUPA_KEY)
  try {
    const { buffer, filename } = await generateStatementPdf(
      { customerId: id, dateFrom: from, dateTo: to },
      supabase,
    )

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length':      String(buffer.length),
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[statement-pdf]', id, msg, '\n', stack)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
