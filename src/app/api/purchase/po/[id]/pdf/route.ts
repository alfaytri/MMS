/**
 * POST /api/purchase/po/[id]/pdf?variant=rfq|draft|po|confirmed[&force=true][&snapshotVersion=<n>]
 *   - Live variant  → JSON { kind:'live', url, storageKey, poNumber, bytes, regenerated }
 *   - Snapshot mode → application/pdf response (attachment)
 *
 * GET  /api/purchase/po/[id]/pdf?variant=...
 *   - Live variant  → 302 redirect to public URL
 *   - Snapshot mode → application/pdf response (inline, for tab preview)
 *
 * Auth: Authorization: Bearer <supabase user JWT> + purchase.orders.view permission.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  generatePoPdf,
  type PoPdfVariant,
} from '@/lib/purchase/generate-po-pdf'
import { requireDocPermission } from '@/lib/api/require-doc-permission'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const VALID_VARIANTS: PoPdfVariant[] = ['rfq', 'draft', 'po', 'confirmed']

interface ParsedParams {
  variant:         PoPdfVariant
  force:           boolean
  snapshotVersion: number | undefined
  error?:          string
}

function parseParams(req: NextRequest): ParsedParams {
  const variantRaw = req.nextUrl.searchParams.get('variant')
  if (!variantRaw || !VALID_VARIANTS.includes(variantRaw as PoPdfVariant)) {
    return {
      variant:         'po',
      force:           false,
      snapshotVersion: undefined,
      error:           `Missing or invalid variant. Expected one of: ${VALID_VARIANTS.join(', ')}`,
    }
  }
  const force = req.nextUrl.searchParams.get('force') === 'true'
  const snapRaw = req.nextUrl.searchParams.get('snapshotVersion')
  let snapshotVersion: number | undefined
  if (snapRaw !== null) {
    const n = Number(snapRaw)
    if (!Number.isInteger(n) || n < 1) {
      return {
        variant:         variantRaw as PoPdfVariant,
        force,
        snapshotVersion: undefined,
        error:           `Invalid snapshotVersion — expected positive integer, got ${snapRaw}`,
      }
    }
    snapshotVersion = n
  }
  return { variant: variantRaw as PoPdfVariant, force, snapshotVersion }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireDocPermission(req, 'purchase.orders.view')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const parsed = parseParams(req)
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
    const result = await generatePoPdf(id, supabase, {
      variant:         parsed.variant,
      force:           parsed.force,
      snapshotVersion: parsed.snapshotVersion,
      divisionId,
    })

    if (result.kind === 'snapshot') {
      return new NextResponse(result.buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'Content-Length':      String(result.bytes),
          'Cache-Control':       'no-store',
        },
      })
    }
    return NextResponse.json(result)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[po-pdf]', id, msg, '\n', stack)
    const status =
      msg.startsWith('Snapshot not found') ? 404 :
      msg.includes('not found')            ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireDocPermission(req, 'purchase.orders.view')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const parsed = parseParams(req)
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    const divisionId = req.nextUrl.searchParams.get('divisionId') ?? undefined
    const result = await generatePoPdf(id, supabase, {
      variant:         parsed.variant,
      force:           parsed.force,
      snapshotVersion: parsed.snapshotVersion,
      divisionId,
    })

    if (result.kind === 'snapshot') {
      return new NextResponse(result.buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `inline; filename="${result.filename}"`,
          'Content-Length':      String(result.bytes),
          'Cache-Control':       'no-store',
        },
      })
    }
    return NextResponse.redirect(result.url, 302)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[po-pdf:GET]', id, msg, '\n', stack)
    const status =
      msg.startsWith('Snapshot not found') ? 404 :
      msg.includes('not found')            ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
