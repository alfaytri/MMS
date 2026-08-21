/**
 * GET /api/sales/customers/[id]/statement/pdf?open=true|false
 *   → returns application/pdf inline
 *
 * Auth: Authorization: Bearer <supabase user JWT> + sales.invoices.view
 *       (or sales.customer_statement.view) permission.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateStatementPdf } from '@/lib/sales/generate-statement-pdf'
import { requireDocPermission } from '@/lib/api/require-doc-permission'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireDocPermission(req, ['sales.invoices.view', 'sales.customer_statement.view'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const openParam = req.nextUrl.searchParams.get('open')
  const openOnly = openParam === null ? true : openParam !== 'false'
  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined

  const supabase = createClient(SUPA_URL, SUPA_KEY)
  try {
    const { buffer, filename } = await generateStatementPdf(
      { customerId: id, openOnly, divisionId },
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
