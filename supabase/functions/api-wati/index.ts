import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WATI_ENDPOINT = (Deno.env.get('WATI_API_URL') ?? '').replace(/\/$/, '')
// v3 endpoints use a different base URL on this WATI tenant — account ID is
// NOT in the URL (it's inferred from the bearer token). Defaults to the same
// host without the account-ID segment.
const WATI_V3_ENDPOINT = (Deno.env.get('WATI_V3_URL') ?? WATI_ENDPOINT.replace(/\/\d+$/, '')).replace(/\/$/, '')
const WATI_TOKEN   = (Deno.env.get('WATI_API_TOKEN') ?? '').replace(/^Bearer\s+/i, '')
const SUPA_URL     = Deno.env.get('SUPABASE_URL')!
const SUPA_ANON    = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPA_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET  = Deno.env.get('CRON_SECRET') ?? ''

let templateCache: unknown[] | null = null

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

async function wati(path: string, init?: RequestInit) {
  const res = await fetch(`${WATI_ENDPOINT}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${WATI_TOKEN}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After') ?? '60'
    return { error: 'rate_limited', retryAfter: parseInt(retryAfter, 10) }
  }
  if (!res.ok) {
    const text = await res.text()
    return { error: `WATI error ${res.status}`, detail: text }
  }
  return res.json()
}

// In-memory cache (per warm instance) of wamid → WATI ObjectID lookups.
// Used only for messages that pre-date the wati_id column being captured by
// the webhook — fresh messages skip this and read straight from the DB.
const wamidCache = new Map<string, string>()

async function resolveWatiObjectId(waId: string, wamid: string): Promise<string | null> {
  const cached = wamidCache.get(wamid)
  if (cached) return cached

  const digits = waId.replace(/\D/g, '')
  const data = await wati(`/api/v1/getMessages/${encodeURIComponent(digits)}?pageSize=50`) as any
  if (data?.error) return null
  const items: any[] = data?.messages?.items ?? []
  for (const item of items) {
    const itemWamid = item.whatsappMessageId ?? item.whatsAppMessageId ?? null
    // WATI's getMessages returns the MongoDB ObjectID in `id`. Some payloads
    // additionally expose it as `_id` — accept either.
    const itemId    = item.id ?? item._id ?? null
    if (itemWamid && itemId && /^[a-f0-9]{24}$/i.test(String(itemId))) {
      wamidCache.set(itemWamid, String(itemId))
    }
  }
  return wamidCache.get(wamid) ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey' } })
  }

  const supaAdmin = createClient(SUPA_URL, SUPA_SERVICE)

  // Cron-secret bypass — used by server-side notification routes that have no
  // user session (e.g. scheduled booking confirmations).
  const cronSecret = req.headers.get('x-cron-secret') ?? ''
  const isCronCall = CRON_SECRET && cronSecret === CRON_SECRET

  if (!isCronCall) {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supaUser = createClient(SUPA_URL, SUPA_ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authErr } = await supaUser.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: profileRow } = await supaAdmin
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!profileRow) return json({ error: 'Forbidden' }, 403)
    const { data: roleRows } = await supaAdmin
      .from('user_custom_roles')
      .select('custom_roles(permissions)')
      .eq('profile_id', profileRow.id)
    const perms: string[] = (roleRows ?? []).flatMap(
      (r: { custom_roles: { permissions: string[] } | null }) => r.custom_roles?.permissions ?? []
    )
    if (!perms.includes('contact_centre.view')) return json({ error: 'Forbidden' }, 403)
  }

  const body = await req.json().catch(() => ({}))
  const { action, phone, text, template_name, broadcast_name, parameters } = body

  switch (action) {
    case 'get_messages': {
      const data = await wati(`/api/v1/getMessages/${encodeURIComponent(phone)}?pageSize=50`)
      return json(data)
    }

    case 'send_session_message': {
      const encoded = encodeURIComponent(text ?? '')
      const data = await wati(`/api/v1/sendSessionMessage/${encodeURIComponent(phone)}?messageText=${encoded}`, { method: 'POST' })
      return json(data)
    }

    case 'send_file': {
      const { url: fileUrl, caption, filename, mime_type } = body as any
      if (!fileUrl) return json({ error: 'url required' }, 400)

      const fileRes = await fetch(fileUrl)
      if (!fileRes.ok) return json({ error: 'fetch_failed', httpStatus: fileRes.status }, 502)
      const fileBlob = await fileRes.blob()

      const form = new FormData()
      form.append('file', new File([fileBlob], filename ?? 'file', { type: mime_type ?? 'application/octet-stream' }))
      if (caption) form.append('caption', caption)

      const watiRes = await fetch(
        `${WATI_ENDPOINT}/api/v1/sendSessionFile/${encodeURIComponent(phone)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${WATI_TOKEN}` },
          body: form,
        },
      )
      const rawText = await watiRes.text()
      let watiData: any
      try { watiData = JSON.parse(rawText) } catch { watiData = { raw: rawText, httpStatus: watiRes.status } }
      console.log(`[api-wati] sendSessionFile → HTTP ${watiRes.status}`, JSON.stringify(watiData).slice(0, 400))
      if (!watiRes.ok) {
        return json({ error: 'wati_rejected', httpStatus: watiRes.status, detail: rawText.slice(0, 300) }, watiRes.status)
      }
      return json(watiData)
    }

    case 'send_template': {
      const data = await wati(`/api/v2/sendTemplateMessage?whatsappNumber=${encodeURIComponent(phone)}`, {
        method: 'POST',
        body: JSON.stringify({ template_name, broadcast_name, parameters }),
      })
      return json(data)
    }

    case 'send_template_v3': {
      // WATI v3 external API — uses a DIFFERENT base URL (no account ID in
      // the path; account is derived from the bearer token). v3 has explicit
      // custom_params, recipient-level error reporting, and is the only path
      // that actually delivers on tenants where v2 silently drops messages.
      const { local_message_id, channel } = body as { local_message_id?: string; channel?: string }
      const customParams = (parameters ?? []).map((p: { name: string; value: string }) => ({
        name: p.name,
        value: p.value,
      }))
      const res = await fetch(`${WATI_V3_ENDPOINT}/api/ext/v3/messageTemplates/send`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${WATI_TOKEN}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          channel:        channel ?? null,
          template_name,
          broadcast_name,
          recipients: [{
            phone_number:     phone,
            local_message_id: local_message_id ?? `${broadcast_name}_${Date.now()}`,
            custom_params:    customParams,
          }],
        }),
      })
      const text = await res.text()
      let parsed: unknown
      try { parsed = JSON.parse(text) } catch { parsed = { raw: text, httpStatus: res.status } }
      if (!res.ok) {
        return json({ error: `WATI v3 error ${res.status}`, detail: parsed }, res.status)
      }
      return json(parsed)
    }

    case 'add_contact': {
      const { name } = body as { name?: string }
      const data = await wati(`/api/v1/addContact/${encodeURIComponent(phone)}`, {
        method: 'POST',
        body: JSON.stringify({ name: name ?? '', customParams: [] }),
      })
      return json(data)
    }

    case 'get_templates': {
      if (!templateCache) {
        const data = await wati('/api/v1/getMessageTemplates')
        if (!('error' in (data as object))) {
          const EXCLUDED = new Set(['DELETED', 'PAUSED', 'DISABLED'])
          const all: any[] = (data as { messageTemplates?: unknown[] }).messageTemplates ?? []
          templateCache = all.filter((t: any) => !EXCLUDED.has((t.status ?? '').toUpperCase()))
        }
      }
      return json({ messageTemplates: templateCache ?? [] })
    }

    case 'get_window_status': {
      const data = await wati(`/api/v1/getMessages/${encodeURIComponent(phone)}?pageSize=1`)
      return json(data)
    }

    case 'sync_contacts': {
      let pageNumber = 1
      const pageSize = 100
      let totalSynced = 0

      while (true) {
        const data = await wati(`/api/v1/getContacts?pageSize=${pageSize}&pageNumber=${pageNumber}`) as any
        if (data?.error) return json(data, 502)

        const contacts: any[] = data?.contact_list ?? []
        if (contacts.length === 0) break

        for (const contact of contacts) {
          const rawPhone: string = contact.phone ?? contact.wAid ?? ''
          if (!rawPhone) continue

          const normalised = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone.replace(/\D/g, '')}`

          // Resolve customer
          const { data: phoneLookup } = await supaAdmin
            .from('service_customer_phones')
            .select('customer_id')
            .eq('phone', normalised)
            .maybeSingle()

          const lastMsgAt = contact.lastReceivedMessageDate
            ? new Date(contact.lastReceivedMessageDate).toISOString()
            : new Date().toISOString()

          await supaAdmin
            .from('chat_conversations')
            .upsert(
              {
                wati_phone:      normalised,
                customer_id:     phoneLookup?.customer_id ?? null,
                last_message:    contact.lastMessage ?? null,
                last_message_at: lastMsgAt,
              },
              { onConflict: 'wati_phone', ignoreDuplicates: false }
            )

          totalSynced++
        }

        if (contacts.length < pageSize) break
        pageNumber++
      }

      return json({ synced: totalSynced })
    }

    case 'send_reaction': {
      const { emoji, message_id } = body as { emoji?: string; message_id?: string }
      if (!phone || !message_id) return json({ error: 'phone and message_id required' }, 400)
      const waId = phone.replace(/^\+/, '')
      const remoteEmoji = typeof emoji === 'string' ? emoji : ''

      // WATI identifies messages by their internal MongoDB ObjectID
      // (24-char hex). Captured by the webhook into chat_messages.wati_id —
      // look it up via Supabase rather than calling WATI's getMessages every
      // time. message_id arriving from the SyncWorker is the wamid (or rarely
      // a 'wati_<numericId>' legacy prefix).
      let watiObjectId: string | null = null

      if (/^[a-f0-9]{24}$/i.test(message_id)) {
        // Already the ObjectID (e.g. the app sent us the right thing directly).
        watiObjectId = message_id
      } else {
        const { data: row } = await supaAdmin
          .from('chat_messages')
          .select('wati_id')
          .or(`external_id.eq.${message_id},wamid.eq.${message_id}`)
          .maybeSingle()
        if (row?.wati_id) watiObjectId = row.wati_id
      }

      // Fallback for messages that pre-date the wati_id column: resolve via
      // WATI's getMessages and scan the items list for a matching wamid.
      if (!watiObjectId && message_id.startsWith('wamid.')) {
        const resolved = await resolveWatiObjectId(waId, message_id)
        if (resolved) watiObjectId = resolved
      }

      if (!watiObjectId) {
        console.warn('[api-wati:send_reaction] could not resolve wati_id', { message_id, waId })
        return json({
          error: 'wati_id not found',
          detail: 'No wati_id column value for this external_id/wamid, and getMessages fallback found nothing. Message may pre-date the wati_id capture or be older than 50 messages on this phone.',
          original_message_id: message_id,
        }, 404)
      }

      console.log('[api-wati:send_reaction] →', { messageId: watiObjectId, emoji: remoteEmoji || '(remove)' })
      const data = await wati('/api/v1/conversations/whatsapp/sendReaction', {
        method: 'POST',
        body: JSON.stringify({ emoji: remoteEmoji, waId, messageId: watiObjectId }),
      })
      console.log('[api-wati:send_reaction] ←', JSON.stringify(data).slice(0, 300))
      return json(data)
    }

    case 'set_status': {
      const { status } = body as any
      const VALID = new Set(['open', 'resolved', 'pending'])
      if (!phone || !VALID.has(status)) return json({ error: 'phone and status (open|pending|resolved) required' }, 400)

      // Fetch the most recent message to get the WATI ticketId for this phone
      const msgData = await wati(`/api/v1/getMessages/${encodeURIComponent(phone)}?pageSize=1`) as any
      const ticketId: string | undefined = msgData?.messages?.items?.[0]?.ticketId
      if (!ticketId) return json({ error: 'no active ticket found for this phone' }, 404)

      const data = await wati(`/api/v3/conversations/${ticketId}/target-status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      return json(data)
    }

    default:
      return json({ error: 'Unknown action' }, 400)
  }
})
