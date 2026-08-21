/**
 * POST /api/sales/credit-notes/[id]/pdf  → returns { url, storageKey, noteId, bytes, regenerated }
 * GET  /api/sales/credit-notes/[id]/pdf  → 302 redirect to the public PDF URL
 *
 * Handles both Credit Notes (credit_notes table) and Debit Notes (debit_notes
 * table) via the `noteType` query param. Auth: Bearer JWT + credit/debit-notes
 * view permission. Query: ?force=true.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateCreditDebitNotePdf } from '@/lib/sales/generate-credit-debit-note-pdf'
import { requireDocPermission } from '@/lib/api/require-doc-permission'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const NOTE_PERMS = ['sales.credit_notes.view', 'purchase.debit_notes.view']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireDocPermission(req, NOTE_PERMS)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const force    = req.nextUrl.searchParams.get('force') === 'true'
  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const noteType = (req.nextUrl.searchParams.get('noteType') as 'credit' | 'debit' | null) ?? undefined
  const supabase = createClient(SUPA_URL, SUPA_KEY)
  try {
    const result = await generateCreditDebitNotePdf(id, supabase, { force, divisionId, noteType })
    return NextResponse.json(result)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[cn-pdf]', id, msg, '\n', stack)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireDocPermission(req, NOTE_PERMS)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const force    = req.nextUrl.searchParams.get('force') === 'true'
  const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
  const noteType = (req.nextUrl.searchParams.get('noteType') as 'credit' | 'debit' | null) ?? undefined
  const supabase = createClient(SUPA_URL, SUPA_KEY)
  try {
    const { url } = await generateCreditDebitNotePdf(id, supabase, { force, divisionId, noteType })
    return NextResponse.redirect(url, 302)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[cn-pdf:GET]', id, msg, '\n', stack)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
