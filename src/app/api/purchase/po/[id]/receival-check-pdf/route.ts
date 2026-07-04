/**
 * POST /api/purchase/po/[id]/receival-check-pdf?mode=per_receival&receivalId=<uuid>[&force=true]
 * POST /api/purchase/po/[id]/receival-check-pdf?mode=blank
 *   → JSON { url, storageKey, filename, bytes, regenerated }
 *
 * GET  ... → 302 redirect to public URL
 *
 * Auth: Bearer <Supabase user JWT>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  generateReceivalCheckPdf,
  type ReceivalCheckMode,
} from '@/lib/purchase/generate-receival-check-pdf'

export const runtime = 'nodejs'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const VALID_MODES: ReceivalCheckMode[] = ['per_receival', 'blank']

async function requireUser(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const authClient = createClient(SUPA_URL, SUPA_KEY)
  const { data: { user }, error } = await authClient.auth.getUser(token)
  if (error || !user) return null
  return user
}

interface Parsed {
  mode:        ReceivalCheckMode
  receivalId:  string | undefined
  force:       boolean
  error?:      string
}

function parseParams(req: NextRequest): Parsed {
  const modeRaw = req.nextUrl.searchParams.get('mode')
  if (!modeRaw || !VALID_MODES.includes(modeRaw as ReceivalCheckMode)) {
    return {
      mode:       'blank',
      receivalId: undefined,
      force:      false,
      error:      `Missing or invalid mode. Expected one of: ${VALID_MODES.join(', ')}`,
    }
  }
  const receivalId = req.nextUrl.searchParams.get('receivalId') ?? undefined
  const force = req.nextUrl.searchParams.get('force') === 'true'

  if (modeRaw === 'per_receival' && !receivalId) {
    return {
      mode:  'per_receival',
      receivalId,
      force,
      error: 'receivalId is required when mode is per_receival',
    }
  }
  if (receivalId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receivalId)) {
    return {
      mode:  modeRaw as ReceivalCheckMode,
      receivalId,
      force,
      error: `Invalid receivalId — expected UUID, got ${receivalId}`,
    }
  }
  return { mode: modeRaw as ReceivalCheckMode, receivalId, force }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = parseParams(req)
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    const result = await generateReceivalCheckPdf(id, supabase, {
      mode:       parsed.mode,
      receivalId: parsed.receivalId,
      force:      parsed.force,
    })
    return NextResponse.json(result)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[receival-check-pdf]', id, msg, '\n', stack)
    const status = msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = parseParams(req)
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  try {
    const result = await generateReceivalCheckPdf(id, supabase, {
      mode:       parsed.mode,
      receivalId: parsed.receivalId,
      force:      parsed.force,
    })
    return NextResponse.redirect(result.url, 302)
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack   : ''
    console.error('[receival-check-pdf:GET]', id, msg, '\n', stack)
    const status = msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
