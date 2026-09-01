// Daily sweep of orphaned landed-cost bill files.
//
// The Create-Landed-Cost dialog uploads bill attachments to the `lc-bills`
// storage bucket eagerly (on file-select) and cleans them up client-side when
// the dialog is cancelled. That client cleanup can't run if the tab is closed
// or the browser crashes mid-dialog, leaving a file in the bucket that no
// landed_cost_lines row references. This job deletes those orphans.
//
// Safety rails:
//  - only files NOT referenced by any landed_cost_lines.bill_path are candidates;
//  - only files OLDER THAN 24h are deleted, so a file uploaded moments ago whose
//    landed cost is still being created is never swept;
//  - uses the service-role client (bypasses RLS) and the storage API (removes
//    both the S3 object and its metadata, unlike a raw SQL delete).
//
// Called by Vercel Cron (GET + `Authorization: Bearer <CRON_SECRET>`), or any
// external scheduler with `x-cron-secret: <CRON_SECRET>`.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'lc-bills'
const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000 // don't touch files younger than 24h
const DELETE_BATCH = 100

type Admin = ReturnType<typeof createAdminClient>
type StoredFile = { path: string; created_at: string | null }

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return (
    req.headers.get('x-cron-secret') === secret ||
    req.headers.get('authorization') === `Bearer ${secret}`
  )
}

// Storage has no real folders — `list(prefix)` returns files (with an id) and
// synthetic sub-prefixes (id === null). Walk the tree to collect every file.
async function listAllFiles(supabase: Admin, prefix = ''): Promise<StoredFile[]> {
  const out: StoredFile[] = []
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 })
  if (error) throw error
  for (const item of data ?? []) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name
    if (!item.id) {
      out.push(...(await listAllFiles(supabase, itemPath))) // sub-prefix → recurse
    } else {
      out.push({ path: itemPath, created_at: item.created_at ?? null })
    }
  }
  return out
}

async function sweep() {
  const supabase = createAdminClient()

  const files = await listAllFiles(supabase)

  const { data: lines, error: lErr } = await supabase
    .from('landed_cost_lines')
    .select('bill_path')
    .not('bill_path', 'is', null)
  if (lErr) throw lErr
  const referenced = new Set(
    (lines ?? []).map((l) => l.bill_path).filter((p): p is string => !!p),
  )

  const cutoff = Date.now() - ORPHAN_MIN_AGE_MS
  const orphans = files
    .filter((f) => !referenced.has(f.path))
    .filter((f) => !f.created_at || new Date(f.created_at).getTime() < cutoff)
    .map((f) => f.path)

  let deleted = 0
  for (let i = 0; i < orphans.length; i += DELETE_BATCH) {
    const batch = orphans.slice(i, i + DELETE_BATCH)
    const { error } = await supabase.storage.from(BUCKET).remove(batch)
    if (error) throw error
    deleted += batch.length
  }

  return {
    scanned: files.length,
    referenced: referenced.size,
    orphansDeleted: deleted,
    skippedTooRecent: files.filter(
      (f) => !referenced.has(f.path) && f.created_at && new Date(f.created_at).getTime() >= cutoff,
    ).length,
  }
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...(await sweep()) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
