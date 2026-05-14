/**
 * Recover lost agent attachment URLs in chat_messages.
 *
 * Before today's fetch-messages fix, the upsert path created duplicate agent
 * rows with attachments=null whenever it failed to claim the optimistic-insert
 * row. The original files are still in the `chat-attachments` Supabase Storage
 * bucket (the agent's send flow uploaded them there before sending to WATI).
 *
 * This script:
 *   1. Finds chat_messages rows where from_type='agent', attachments IS NULL,
 *      text IS NULL OR text='', and message_kind='message'.
 *   2. For each row, lists files in `chat-attachments/<conversation_id>/`.
 *   3. Matches each file to a broken row by created_at proximity (within ±2 min
 *      of the file's path timestamp).
 *   4. Updates the row with attachments=[{url:publicUrl, type, name}].
 *
 * Run:
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"; node scripts/recover_chat_attachments.mjs
 *
 * Dry run (no writes):
 *   $env:DRY_RUN="1"; node scripts/recover_chat_attachments.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://wkmvjxxmzstsvahuiwsz.supabase.co'
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.env.DRY_RUN === '1'

if (!SERVICE_ROLE) {
  console.error('SUPABASE_SERVICE_ROLE_KEY env var is required.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const MIME_BY_EXT = {
  pdf:  'application/pdf',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
  mp4:  'video/mp4',
  mov:  'video/quicktime',
  webm: 'video/webm',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:  'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt:  'text/plain',
}

function mimeFromExt(ext) {
  return MIME_BY_EXT[ext.toLowerCase()] ?? 'application/octet-stream'
}

// ── 1. Find broken rows ──────────────────────────────────────────────────────
console.log('Finding broken agent rows…')
const { data: brokenRows, error: queryErr } = await supabase
  .from('chat_messages')
  .select('id, conversation_id, created_at, external_id')
  .eq('from_type', 'agent')
  .eq('message_kind', 'message')
  .is('attachments', null)
  .or('text.is.null,text.eq.')
  .order('created_at', { ascending: false })

if (queryErr) {
  console.error('Query failed:', queryErr)
  process.exit(1)
}
console.log(`Found ${brokenRows.length} broken rows.`)

// ── 2. Group by conversation_id ──────────────────────────────────────────────
const byConvo = new Map()
for (const row of brokenRows) {
  if (!byConvo.has(row.conversation_id)) byConvo.set(row.conversation_id, [])
  byConvo.get(row.conversation_id).push(row)
}
console.log(`Spanning ${byConvo.size} conversations.`)

// ── 3. For each conversation, list bucket files and match ────────────────────
let matched = 0
let updated = 0
let skipped = 0

for (const [conversationId, rows] of byConvo.entries()) {
  const { data: files, error: listErr } = await supabase.storage
    .from('chat-attachments')
    .list(conversationId, { limit: 1000 })

  if (listErr) {
    console.warn(`  ⚠️  conv=${conversationId.slice(0, 8)} list failed: ${listErr.message}`)
    continue
  }
  if (!files || files.length === 0) {
    console.log(`  ⏭  conv=${conversationId.slice(0, 8)} no storage files`)
    skipped += rows.length
    continue
  }

  // Parse each filename: "<unixMs>.<ext>"
  const parsed = files
    .map((f) => {
      const dot = f.name.lastIndexOf('.')
      if (dot <= 0) return null
      const base = f.name.slice(0, dot)
      const ext  = f.name.slice(dot + 1)
      const ts   = Number(base)
      if (!Number.isFinite(ts)) return null
      return { name: f.name, ext, ts }
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts)

  for (const row of rows) {
    const rowTs = new Date(row.created_at).getTime()
    // Find file whose timestamp is closest to row's created_at, within ±120 s
    let best = null
    let bestDelta = Infinity
    for (const f of parsed) {
      const delta = Math.abs(f.ts - rowTs)
      if (delta < bestDelta && delta < 120_000) {
        best = f
        bestDelta = delta
      }
    }

    if (!best) {
      console.log(`  ❌  row=${row.id.slice(0, 8)} (${row.created_at}) — no file within ±120 s`)
      skipped++
      continue
    }

    matched++
    const path = `${conversationId}/${best.name}`
    const { data: { publicUrl } } = supabase.storage
      .from('chat-attachments').getPublicUrl(path)
    const attachments = [{
      url:  publicUrl,
      type: mimeFromExt(best.ext),
      name: best.name,
    }]

    if (DRY_RUN) {
      console.log(`  🔍  row=${row.id.slice(0, 8)} → ${best.name} (Δ${Math.round(bestDelta / 1000)}s)`)
      continue
    }

    const { error: updateErr } = await supabase
      .from('chat_messages')
      .update({ attachments })
      .eq('id', row.id)

    if (updateErr) {
      console.error(`  ❌  row=${row.id.slice(0, 8)} update failed: ${updateErr.message}`)
      continue
    }
    updated++
    console.log(`  ✅  row=${row.id.slice(0, 8)} → ${best.name} (Δ${Math.round(bestDelta / 1000)}s)`)
  }
}

console.log('\n── Summary ──')
console.log(`Broken rows: ${brokenRows.length}`)
console.log(`Matched:     ${matched}`)
console.log(`Updated:     ${updated}${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`)
console.log(`Skipped:     ${skipped}`)
