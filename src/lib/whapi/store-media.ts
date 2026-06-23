// ============================================================================
// Download a WHAPI media file ONCE and mirror it to Supabase Storage so future
// renders never hit gate.whapi.cloud again. WHAPI's quota was burning because
// every <img>/<video> render proxied through /api/whapi/media → WHAPI.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'

const WHAPI_URL   = 'https://gate.whapi.cloud'
const WHAPI_TOKEN = process.env.WHAPI_TOKEN ?? ''
const BUCKET      = 'chat-attachments'

type MediaKey = 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker'

interface WhapiMedia {
  id?:        string
  link?:      string | null
  mime_type?: string
  file_name?: string
  filename?:  string
  caption?:   string
}

export interface StoredAttachment {
  url:           string
  storage_path?: string | null
  type:          string
  name:          string
  // Index signature lets Supabase's `Json`-typed columns accept this
  // interface directly without needing a `Json` cast at every insert site.
  [key: string]: string | null | undefined
}

interface StoreCtx {
  externalId: string  // WHAPI message id (e.g. "ABGGFlA5...")
  phone:      string  // E.164, leading "+"
  mediaKey:   MediaKey
}

const DEFAULTS: Record<MediaKey, { mime: string; name: string }> = {
  image:    { mime: 'image/jpeg',                name: 'image'    },
  video:    { mime: 'video/mp4',                 name: 'video'    },
  audio:    { mime: 'audio/ogg',                 name: 'audio'    },
  voice:    { mime: 'audio/ogg',                 name: 'voice'    },
  document: { mime: 'application/octet-stream',  name: 'document' },
  sticker:  { mime: 'image/webp',                name: 'sticker'  },
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg':        'jpg',
  'image/png':         'png',
  'image/webp':        'webp',
  'image/gif':         'gif',
  'video/mp4':         'mp4',
  'video/3gpp':        '3gp',
  'video/quicktime':   'mov',
  'audio/ogg':         'ogg',
  'audio/mpeg':        'mp3',
  'audio/mp4':         'm4a',
  'audio/aac':         'aac',
  'application/pdf':   'pdf',
}

function deriveExt(filename: string | undefined): string | null {
  if (!filename) return null
  const m = filename.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : null
}

function proxyFallback(rawUrl: string, type: string, name: string): StoredAttachment {
  const url = `/api/whapi/media?url=${encodeURIComponent(rawUrl)}`
  return { url, storage_path: null, type, name }
}

/**
 * Build the attachment object for a WHAPI media message without touching
 * the network. Used for the immediate INSERT inside the webhook so the chat
 * row appears in real-time. The proxy URL is rewritten to the permanent
 * Supabase URL by a follow-up call to mirrorWhapiMedia().
 */
export function buildAttachmentSkeleton(media: WhapiMedia, key: MediaKey): StoredAttachment | null {
  const rawUrl = media.link ?? (media.id ? `${WHAPI_URL}/media/${media.id}` : null)
  if (!rawUrl) return null
  const defaults = DEFAULTS[key]
  const type = media.mime_type ?? defaults.mime
  const name = media.file_name ?? media.filename ?? defaults.name
  return proxyFallback(rawUrl, type, name)
}

/**
 * Download the file from WHAPI once and upload it to Supabase Storage.
 * Idempotent — `upsert: true` means re-runs are safe. Returns the new
 * attachment object or null if anything failed (caller keeps the proxy URL).
 */
export async function mirrorWhapiMedia(media: WhapiMedia, ctx: StoreCtx): Promise<StoredAttachment | null> {
  if (!WHAPI_TOKEN) return null
  const rawUrl = media.link ?? (media.id ? `${WHAPI_URL}/media/${media.id}` : null)
  if (!rawUrl) return null

  const defaults = DEFAULTS[ctx.mediaKey]
  const declaredType = (media.mime_type ?? defaults.mime).split(';')[0].trim()
  const displayName  = media.file_name ?? media.filename ?? defaults.name

  try {
    const res = await fetch(rawUrl, { headers: { Authorization: `Bearer ${WHAPI_TOKEN}` } })
    if (!res.ok) {
      console.warn('[whapi/store-media] fetch failed', res.status, ctx.externalId)
      return null
    }

    const contentType = (res.headers.get('content-type') ?? declaredType).split(';')[0].trim()
    const buffer = await res.arrayBuffer()

    const ext   = MIME_EXT[contentType] ?? deriveExt(displayName) ?? 'bin'
    const phone = ctx.phone.replace(/\D/g, '')
    const path  = `whapi/${phone}/${ctx.externalId}_${ctx.mediaKey}.${ext}`

    const admin = createAdminClient()
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: true })
    if (upErr) {
      console.warn('[whapi/store-media] upload failed', upErr.message, ctx.externalId)
      return null
    }

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
    return {
      url:          data.publicUrl,
      storage_path: path,
      type:         contentType,
      name:         displayName,
    }
  } catch (err) {
    console.warn('[whapi/store-media] threw', err, ctx.externalId)
    return null
  }
}
