import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WATI_ENDPOINT = (Deno.env.get('WATI_API_URL') ?? '').replace(/\/$/, '')
const WATI_TOKEN   = (Deno.env.get('WATI_API_TOKEN') ?? '').replace(/^Bearer\s+/i, '')
const SUPA_URL     = Deno.env.get('SUPABASE_URL')!
const SUPA_ANON    = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPA_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey' } })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const supaUser = createClient(SUPA_URL, SUPA_ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: authErr } = await supaUser.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const supaAdmin = createClient(SUPA_URL, SUPA_SERVICE)
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
      // body: { phone, url, caption?, filename?, mime_type? }
      // Uses sendSessionFile (binary upload): the edge function downloads the file from
      // our storage and POSTs it directly to WATI. This is synchronous — WATI returns the
      // wamid in the response, avoiding the "accepted-but-never-delivered" problem that
      // sendSessionFileViaUrl has when WATI fetches asynchronously and silently fails.
      const { url: fileUrl, caption, filename, mime_type } = body as any
      if (!fileUrl) return json({ error: 'url required' }, 400)

      // 1. Download from Supabase storage
      const fileRes = await fetch(fileUrl)
      if (!fileRes.ok) return json({ error: 'fetch_failed', httpStatus: fileRes.status }, 502)
      const fileBlob = await fileRes.blob()

      // 2. Upload to WATI as multipart/form-data
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
      const watiData = await watiRes.json().catch(() => ({ ok: watiRes.ok, httpStatus: watiRes.status }))
      // Return WATI's status so the client can detect failures via fnErr
      return json(watiData, watiRes.ok ? 200 : watiRes.status)
    }

    case 'send_template': {
      const data = await wati(`/api/v2/sendTemplateMessage?whatsappNumber=${encodeURIComponent(phone)}`, {
        method: 'POST',
        body: JSON.stringify({ template_name, broadcast_name, parameters }),
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

    default:
      return json({ error: 'Unknown action' }, 400)
  }
})
