import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface AttachmentLite {
  storage_path?: string | null
}

export async function POST(req: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET ?? ''
  const auth = req.headers.get('authorization') ?? ''
  const secret = req.headers.get('x-cron-secret') ?? ''
  const ok = CRON_SECRET && (auth === `Bearer ${CRON_SECRET}` || secret === CRON_SECRET)
  if (!ok) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: candidates, error: candidatesErr } = await admin
    .from('purge_batches')
    .select('id')
    .lt('soft_deleted_at', cutoff)
    .is('hard_deleted_at', null)
    .is('restored_at', null)
    .limit(50)

  if (candidatesErr) {
    return NextResponse.json({ ok: false, error: candidatesErr.message }, { status: 500 })
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, batches_processed: 0, summary: [] })
  }

  const summary: { batch_id: string; deleted: number; files_removed: number }[] = []

  for (const batch of candidates) {
    let filesRemoved = 0
    let deletedCount = 0

    try {
      const { data: messages, error: msgErr } = await admin
        .from('chat_messages')
        .select('id, attachments')
        .eq('purge_batch_id', batch.id)
        .not('deleted_at', 'is', null)

      if (msgErr) {
        console.error(`[sweep] failed to fetch messages for batch ${batch.id}:`, msgErr.message)
        continue
      }

      const storagePaths: string[] = []
      for (const msg of messages ?? []) {
        const attachments = (msg.attachments ?? []) as AttachmentLite[]
        for (const att of attachments) {
          if (att.storage_path) {
            storagePaths.push(att.storage_path)
          }
        }
      }

      for (let i = 0; i < storagePaths.length; i += 100) {
        const chunk = storagePaths.slice(i, i + 100)
        const { error: storageErr } = await admin.storage.from('chat-media').remove(chunk)
        if (storageErr) {
          console.error(`[sweep] storage removal error for batch ${batch.id}:`, storageErr.message)
        } else {
          filesRemoved += chunk.length
        }
      }

      const { count, error: deleteErr } = await admin
        .from('chat_messages')
        .delete({ count: 'exact' })
        .eq('purge_batch_id', batch.id)
        .not('deleted_at', 'is', null)

      if (deleteErr) {
        console.error(`[sweep] message delete error for batch ${batch.id}:`, deleteErr.message)
        continue
      }

      deletedCount = count ?? 0

      const { error: markErr } = await admin
        .from('purge_batches')
        .update({ hard_deleted_at: new Date().toISOString() })
        .eq('id', batch.id)

      if (markErr) {
        console.error(`[sweep] failed to mark batch ${batch.id} as hard-deleted:`, markErr.message)
      }

      summary.push({ batch_id: batch.id, deleted: deletedCount, files_removed: filesRemoved })
    } catch (err) {
      console.error(`[sweep] unexpected error for batch ${batch.id}:`, err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({ ok: true, batches_processed: summary.length, summary })
}
