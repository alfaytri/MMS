# WHAPI Integration + Full Two-Way Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WHAPI as a second messaging provider alongside WATI in the Contact Centre, with a global toggle in the header, full two-way emoji reactions, and a client-side AbortError fix.

**Architecture:** Both WATI and WHAPI webhooks write to the same `chat_messages` / `chat_conversations` tables. A single `app_settings` row (`cc_provider`) determines which API outgoing messages are routed through. The toggle in the Contact Centre list header reads and writes this setting in real-time.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + Realtime + Storage), TypeScript, WHAPI REST API (`https://gate.whapi.cloud`)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `middleware.ts` | Modify | Add `/api/whapi/webhook` to `WEBHOOK_PREFIXES` |
| `supabase/migrations/20260517120000_app_settings.sql` | Create | `app_settings` table with `cc_provider` seed |
| `src/app/api/settings/cc-provider/route.ts` | Create | PATCH endpoint (service-role) to write `cc_provider` |
| `src/app/api/whapi/webhook/route.ts` | Create | Receive WHAPI events — messages, reactions, statuses |
| `src/app/api/whapi/send-message/route.ts` | Create | Send text/media via WHAPI |
| `src/app/api/whapi/send-reaction/route.ts` | Create | Send emoji reaction via WHAPI |
| `src/hooks/useProviderSetting.ts` | Create | Read/write/subscribe `cc_provider` |
| `src/hooks/contact-center/useChatMessages.ts` | Modify | Accept `provider` param; route send + react by provider |
| `src/hooks/contact-center/useContactCenterState.ts` | Modify | Wire `useProviderSetting`; pass `provider` to `useChatMessages` |
| `src/components/contact-center/ContactCenterSidebar.tsx` | Modify | Add WATI/WHAPI toggle pill to list-view header |

---

## Task 1: Fix AbortError in background sync

**Files:**
- Modify: `src/hooks/contact-center/useContactCenterState.ts:67-70`

- [ ] **Step 1: Widen the AbortError catch**

Open `src/hooks/contact-center/useContactCenterState.ts`. Find the catch block at line ~67 inside `runBgSync`:

```typescript
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        // All other background sync failures are non-fatal — silently ignore.
      } finally {
```

Replace it with:

```typescript
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err.name === 'AbortError' ||
           err.name.includes('Abort') ||
           err.message.includes('aborted') ||
           err.message.includes('BodyStreamBuffer'))
        ) return
        // All other background sync failures are non-fatal — silently ignore.
      } finally {
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/contact-center/useContactCenterState.ts
git commit -m "fix(contact-centre): catch RuntimeAbortError from Next.js 15 Turbopack bg sync

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Database migration — `app_settings`

**Files:**
- Create: `supabase/migrations/20260517120000_app_settings.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260517120000_app_settings.sql
create table if not exists app_settings (
  key   text primary key,
  value text not null
);

alter table app_settings enable row level security;

-- Only the service role (server-side API routes) can read or write settings.
-- The anon/authenticated key used by the browser client can only read.
create policy "anon read" on app_settings
  for select using (true);

create policy "service role write" on app_settings
  for all using (auth.role() = 'service_role');

-- Seed the default provider
insert into app_settings (key, value)
values ('cc_provider', 'wati')
on conflict (key) do nothing;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected output ends with: `Finished supabase db push.`

- [ ] **Step 3: Add WHAPI_TOKEN to environment**

Add to `.env.local`:
```
WHAPI_TOKEN=your_channel_token_here
```

(Get the token from the WHAPI dashboard → Channel → API Token.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517120000_app_settings.sql
git commit -m "feat(db): add app_settings table with cc_provider seed

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Settings API route — write `cc_provider`

**Files:**
- Create: `src/app/api/settings/cc-provider/route.ts`

The browser's anon key can't write to `app_settings` (RLS blocks it). This thin route uses the service-role key.

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/settings/cc-provider/route.ts
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const value = (body as any)?.value
  if (value !== 'wati' && value !== 'whapi') {
    return NextResponse.json({ error: 'value must be "wati" or "whapi"' }, { status: 400 })
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'cc_provider', value }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/settings/cc-provider/route.ts
git commit -m "feat(api): add PATCH /api/settings/cc-provider route

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: `useProviderSetting` hook

**Files:**
- Create: `src/hooks/useProviderSetting.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useProviderSetting.ts
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Provider = 'wati' | 'whapi'

export function useProviderSetting() {
  const [provider, setProviderState] = useState<Provider>('wati')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false

    // Initial load
    supabase
      .from('app_settings' as any)
      .select('value')
      .eq('key', 'cc_provider')
      .single()
      .then(({ data }) => {
        if (!cancelled && (data as any)?.value) {
          setProviderState((data as any).value as Provider)
        }
        if (!cancelled) setLoading(false)
      })

    // Realtime: reflect changes from other tabs/sessions immediately
    const channel = supabase
      .channel('app_settings_cc_provider')
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'app_settings', filter: 'key=eq.cc_provider' },
        (payload: any) => {
          if (!cancelled) setProviderState(payload.new.value as Provider)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  async function setProvider(value: Provider) {
    setProviderState(value) // optimistic
    await fetch('/api/settings/cc-provider', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
  }

  return { provider, setProvider, loading }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useProviderSetting.ts
git commit -m "feat(hooks): add useProviderSetting — reads/writes cc_provider with realtime sync

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Add WHAPI webhook to middleware bypass list

**Files:**
- Modify: `middleware.ts:11`

- [ ] **Step 1: Add the prefix**

Find line 11 in `middleware.ts`:
```typescript
const WEBHOOK_PREFIXES = ['/api/wati/webhook', '/api/webhooks/']
```

Replace with:
```typescript
const WEBHOOK_PREFIXES = ['/api/wati/webhook', '/api/whapi/webhook', '/api/webhooks/']
```

- [ ] **Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat(middleware): allow WHAPI webhook through auth gate

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: WHAPI webhook handler

**Files:**
- Create: `src/app/api/whapi/webhook/route.ts`

WHAPI sends a JSON body structured as `{ event: { type, event }, messages: [...] }` for messages and `{ event: ..., statuses: [...] }` for status updates.

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/whapi/webhook/route.ts
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function normalisePhone(raw: string): string {
  // WHAPI sends "from" without + e.g. "97412345678"
  return `+${raw.replace(/\D/g, '')}`
}

function extractAttachments(msg: any): { url: string; type: string; name: string }[] {
  if (msg.type === 'image' && msg.image) {
    return [{ url: msg.image.link ?? '', type: msg.image.mime_type ?? 'image/jpeg', name: msg.image.caption ?? 'image' }]
  }
  if (msg.type === 'document' && msg.document) {
    return [{ url: msg.document.link ?? '', type: msg.document.mime_type ?? 'application/octet-stream', name: msg.document.filename ?? 'document' }]
  }
  if (msg.type === 'video' && msg.video) {
    return [{ url: msg.video.link ?? '', type: msg.video.mime_type ?? 'video/mp4', name: msg.video.caption ?? 'video' }]
  }
  if ((msg.type === 'audio' || msg.type === 'voice') && msg.audio) {
    return [{ url: msg.audio.link ?? '', type: msg.audio.mime_type ?? 'audio/ogg', name: 'audio' }]
  }
  if (msg.type === 'sticker' && msg.sticker) {
    return [{ url: msg.sticker.link ?? '', type: 'image/webp', name: 'sticker' }]
  }
  return []
}

// GET — WHAPI verification ping
export async function GET() {
  return new Response('OK', { status: 200 })
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch {
    return new Response('Bad JSON', { status: 400 })
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)
  const eventType: string = body?.event?.type ?? ''
  const eventAction: string = body?.event?.event ?? ''

  // ── Delivery / read status updates ─────────────────────────────────────────
  if (eventType === 'statuses' && eventAction === 'post') {
    const statuses: any[] = body.statuses ?? []
    for (const s of statuses) {
      const externalId: string | null = s.id ?? null
      const raw: string = (s.status ?? '').toLowerCase()
      const status =
        raw === 'delivered' ? 'delivered'
        : raw === 'read'    ? 'read'
        : raw === 'failed'  ? 'failed'
        : raw === 'sent'    ? 'sent'
        : null
      if (externalId && status) {
        await (supabase.from('chat_messages') as any)
          .update({ delivery_status: status })
          .eq('external_id', externalId)
      }
    }
    return NextResponse.json({ ok: true })
  }

  // ── Incoming messages ───────────────────────────────────────────────────────
  if (eventType === 'messages' && eventAction === 'post') {
    const messages: any[] = body.messages ?? []

    for (const msg of messages) {
      // Skip outgoing (messages we sent — WHAPI echoes them back)
      if (msg.from_me) continue

      const phone = normalisePhone(msg.from ?? '')
      if (!phone || phone === '+') continue

      // ── Reaction ──────────────────────────────────────────────────────────
      if (msg.type === 'reaction') {
        const targetId: string | null = msg.reaction?.message_id ?? null
        const emoji: string | null    = msg.reaction?.emoji ?? null

        if (targetId) {
          const { data: targetRow } = await (supabase.from('chat_messages') as any)
            .select('id, reactions')
            .eq('external_id', targetId)
            .maybeSingle()

          if (targetRow) {
            const existing: { emoji: string; from_type: string }[] = targetRow.reactions ?? []
            let updated: typeof existing
            if (!emoji) {
              // Empty emoji = customer removed all their reactions
              updated = existing.filter((r) => r.from_type !== 'customer')
            } else {
              const hasIt = existing.some((r) => r.emoji === emoji && r.from_type === 'customer')
              updated = hasIt
                ? existing.filter((r) => !(r.emoji === emoji && r.from_type === 'customer'))
                : [...existing, { emoji, from_type: 'customer' }]
            }
            await (supabase.from('chat_messages') as any)
              .update({ reactions: updated })
              .eq('id', targetRow.id)
          }
        }
        continue
      }

      // ── Regular message ───────────────────────────────────────────────────
      const attachments = extractAttachments(msg)
      const text: string =
        msg.text?.body?.trim() ??
        msg.caption?.trim() ??
        (attachments.length > 0 ? '' : `[${msg.type ?? 'message'}]`)

      const ts = msg.timestamp
        ? new Date(Number(msg.timestamp) * 1000).toISOString()
        : new Date().toISOString()

      // Upsert conversation
      const { data: convo } = await (supabase.from('chat_conversations') as any)
        .upsert(
          {
            wati_phone:     phone,
            last_message:   text || (attachments[0]?.name ?? '[attachment]'),
            last_message_at: ts,
          },
          { onConflict: 'wati_phone', ignoreDuplicates: false },
        )
        .select('id')
        .single()

      if (!convo?.id) continue

      // Insert message (idempotent via external_id conflict)
      await (supabase.from('chat_messages') as any)
        .upsert(
          {
            conversation_id: convo.id,
            external_id:     msg.id ?? null,
            from_type:       'customer',
            source:          'whatsapp_api',
            message_kind:    'message',
            text:            text || null,
            attachments:     attachments.length > 0 ? attachments : null,
            reactions:       [],
            delivery_status: 'delivered',
            created_at:      ts,
          },
          { onConflict: 'external_id', ignoreDuplicates: true },
        )
    }

    return NextResponse.json({ ok: true })
  }

  // All other event types — acknowledge and ignore
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/whapi/webhook/route.ts
git commit -m "feat(whapi): add webhook handler — messages, reactions, status updates

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: WHAPI send-message route

**Files:**
- Create: `src/app/api/whapi/send-message/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/whapi/send-message/route.ts
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const WHAPI_BASE = 'https://gate.whapi.cloud'
const WHAPI_TOKEN = (process.env.WHAPI_TOKEN ?? '').replace(/^Bearer\s+/i, '')
const SUPA_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!

function whapiPhone(phone: string): string {
  // WHAPI expects "97412345678" (no + or @) for text/to field
  return phone.replace(/^\+/, '').replace(/\D/g, '')
}

async function whapiPost(path: string, payload: object): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch(`${WHAPI_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `WHAPI ${res.status}` }
    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Network error' }
  }
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    phone: rawPhone,
    text,
    documentUrl,
    documentName,
    imageUrl,
    senderName,
    conversationId,
  } = body

  if (!rawPhone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  const toPhone = whapiPhone(rawPhone)
  const supabase = createClient(SUPA_URL, SUPA_KEY)

  let whapiMessageId: string | null = null
  let whapiError: string | null = null

  // ── Send via WHAPI ──────────────────────────────────────────────────────────
  if (documentUrl) {
    const result = await whapiPost('/messages/document', {
      to:       toPhone,
      document: { link: documentUrl, filename: documentName ?? 'document' },
      caption:  text ?? '',
    })
    if (result.ok) whapiMessageId = result.data?.message?.id ?? null
    else whapiError = result.error ?? null
  } else if (imageUrl) {
    const result = await whapiPost('/messages/image', {
      to:    toPhone,
      image: { link: imageUrl },
      caption: text ?? '',
    })
    if (result.ok) whapiMessageId = result.data?.message?.id ?? null
    else whapiError = result.error ?? null
  } else {
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
    const result = await whapiPost('/messages/text', { to: toPhone, body: text })
    if (result.ok) whapiMessageId = result.data?.message?.id ?? null
    else whapiError = result.error ?? null
  }

  if (whapiError) {
    return NextResponse.json({ ok: false, error: whapiError }, { status: 502 })
  }

  // ── Persist to chat_messages ────────────────────────────────────────────────
  if (conversationId) {
    const attachments = documentUrl
      ? [{ url: documentUrl, type: 'application/octet-stream', name: documentName ?? 'document' }]
      : imageUrl
      ? [{ url: imageUrl, type: 'image/jpeg', name: 'image' }]
      : null

    const { data: inserted } = await (supabase.from('chat_messages') as any)
      .insert({
        conversation_id: conversationId,
        from_type:       'agent',
        source:          'whatsapp_api',
        message_kind:    'message',
        text:            text ?? null,
        attachments,
        agent_name:      senderName ?? null,
        delivery_status: whapiMessageId ? 'sent' : 'failed',
        external_id:     whapiMessageId ?? null,
        reactions:       [],
      })
      .select('id')
      .single()

    // Update conversation preview
    if (inserted?.id) {
      await (supabase.from('chat_conversations') as any)
        .update({
          last_message:    text ?? (documentUrl ? '[document]' : '[image]'),
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
    }
  }

  return NextResponse.json({ ok: true, messageId: whapiMessageId })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/whapi/send-message/route.ts
git commit -m "feat(whapi): add send-message route — text, image, document

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: WHAPI send-reaction route

**Files:**
- Create: `src/app/api/whapi/send-reaction/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/whapi/send-reaction/route.ts
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const WHAPI_BASE   = 'https://gate.whapi.cloud'
const WHAPI_TOKEN  = (process.env.WHAPI_TOKEN ?? '').replace(/^Bearer\s+/i, '')
const SUPA_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY!

function whapiPhone(phone: string): string {
  return phone.replace(/^\+/, '').replace(/\D/g, '')
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { to, messageId, emoji, localMessageId } = body
  if (!to || !messageId || !emoji) {
    return NextResponse.json({ error: 'to, messageId, and emoji are required' }, { status: 400 })
  }

  // Send reaction via WHAPI
  let whapiOk = false
  let whapiError: string | null = null
  try {
    const res = await fetch(`${WHAPI_BASE}/messages/reaction`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: whapiPhone(to), messageId, emoji }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) whapiError = data?.error?.message ?? `WHAPI ${res.status}`
    else whapiOk = true
  } catch (err: any) {
    whapiError = err.message ?? 'Network error'
  }

  if (!whapiOk) {
    return NextResponse.json({ ok: false, error: whapiError }, { status: 502 })
  }

  // Save agent reaction to the local reactions JSONB array
  if (localMessageId) {
    const supabase = createClient(SUPA_URL, SUPA_KEY)
    const { data: row } = await (supabase.from('chat_messages') as any)
      .select('reactions')
      .eq('id', localMessageId)
      .maybeSingle()

    if (row) {
      const existing: { emoji: string; from_type: string }[] = row.reactions ?? []
      const hasIt = existing.some((r) => r.emoji === emoji && r.from_type === 'agent')
      const updated = hasIt
        ? existing.filter((r) => !(r.emoji === emoji && r.from_type === 'agent'))
        : [...existing, { emoji, from_type: 'agent' }]
      await (supabase.from('chat_messages') as any)
        .update({ reactions: updated })
        .eq('id', localMessageId)
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/whapi/send-reaction/route.ts
git commit -m "feat(whapi): add send-reaction route

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Route sends and reactions by provider in `useChatMessages`

**Files:**
- Modify: `src/hooks/contact-center/useChatMessages.ts`

`useChatMessages` currently always calls the WATI Supabase edge function. We add a `provider` parameter and route accordingly.

- [ ] **Step 1: Add `provider` parameter to the hook signature**

Find the function signature at line ~34:
```typescript
export function useChatMessages(
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void,
  addMessage?: (msg: ChatMessage) => void,
) {
```

Replace with:
```typescript
export function useChatMessages(
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void,
  addMessage?: (msg: ChatMessage) => void,
  provider: 'wati' | 'whapi' = 'wati',
) {
```

- [ ] **Step 2: Route `sendSessionMessage` by provider**

Find the try block inside `sendSessionMessage` at line ~101:
```typescript
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('api-wati', {
        body: { action: 'send_session_message', phone, text: text.trim() },
      })
      if (fnErr) throw fnErr

      const watiId = (fnData as any)?.message?.whatsappMessageId
        ?? (fnData as any)?.info?.whatsAppMessageId
        ?? (fnData as any)?.id
        ?? (fnData as any)?.messageId
      if (watiId) {
        await (supabase as any)
          .from('chat_messages')
          .update({ external_id: `wati_${watiId}`, delivery_status: 'sent' })
          .eq('id', tempId)
        patchMessage(tempId, { external_id: `wati_${watiId}`, delivery_status: 'sent' })
      } else {
        patchMessage(tempId, { delivery_status: 'sent' })
      }
    } catch {
      await (supabase as any)
        .from('chat_messages')
        .update({ delivery_status: 'failed' })
        .eq('id', tempId)
      patchMessage(tempId, { delivery_status: 'failed' })
    } finally {
      setSending(false)
    }
```

Replace with:
```typescript
    try {
      if (provider === 'whapi') {
        const res = await fetch('/api/whapi/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, text: text.trim(), conversationId }),
        })
        const result = await res.json().catch(() => ({}))
        if (!res.ok || !result.ok) throw new Error(result.error ?? 'WHAPI send failed')
        const whapiId: string | null = result.messageId ?? null
        if (whapiId) {
          await (supabase as any).from('chat_messages').update({ external_id: whapiId, delivery_status: 'sent' }).eq('id', tempId)
          patchMessage(tempId, { external_id: whapiId, delivery_status: 'sent' })
        } else {
          patchMessage(tempId, { delivery_status: 'sent' })
        }
      } else {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('api-wati', {
          body: { action: 'send_session_message', phone, text: text.trim() },
        })
        if (fnErr) throw fnErr
        const watiId = (fnData as any)?.message?.whatsappMessageId
          ?? (fnData as any)?.info?.whatsAppMessageId
          ?? (fnData as any)?.id
          ?? (fnData as any)?.messageId
        if (watiId) {
          await (supabase as any)
            .from('chat_messages')
            .update({ external_id: `wati_${watiId}`, delivery_status: 'sent' })
            .eq('id', tempId)
          patchMessage(tempId, { external_id: `wati_${watiId}`, delivery_status: 'sent' })
        } else {
          patchMessage(tempId, { delivery_status: 'sent' })
        }
      }
    } catch {
      await (supabase as any)
        .from('chat_messages')
        .update({ delivery_status: 'failed' })
        .eq('id', tempId)
      patchMessage(tempId, { delivery_status: 'failed' })
    } finally {
      setSending(false)
    }
```

- [ ] **Step 3: Route `sendFile` by provider**

Find the `// 3. Send via Wati` block inside `sendFile` (line ~357):
```typescript
    // 3. Send via Wati
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('api-wati', {
        body: {
          action:    'send_file',
          phone,
          url:       publicUrl,
          caption:   caption ?? '',
          filename:  file.name,
          mime_type: file.type,
        },
      })
      if (fnErr) throw fnErr
      const watiResp = fnData as any
      if (watiResp?.result === false || watiResp?.error) {
        throw new Error(watiResp?.info ?? watiResp?.error ?? watiResp?.detail ?? 'WATI rejected the file')
      }
      const watiId = watiResp?.message?.whatsappMessageId
        ?? watiResp?.info?.whatsAppMessageId ?? null
      if (inserted) {
        const patch = watiId
          ? { external_id: `wati_${watiId}`, delivery_status: 'sent' as const }
          : { delivery_status: 'sent' as const }
        await (supabase as any).from('chat_messages').update(patch).eq('id', inserted.id)
        patchMessage(inserted.id, patch)
      }
    } catch (err) {
      if (inserted) {
        await (supabase as any).from('chat_messages').update({ delivery_status: 'failed' }).eq('id', inserted.id)
        patchMessage(inserted.id, { delivery_status: 'failed' })
      }
      throw err
    } finally {
      setSending(false)
    }
```

Replace with:
```typescript
    // 3. Send via active provider
    try {
      if (provider === 'whapi') {
        const isImage = file.type.startsWith('image/')
        const isDocument = !isImage && !file.type.startsWith('audio/') && !file.type.startsWith('video/')
        const res = await fetch('/api/whapi/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone,
            text: caption ?? undefined,
            conversationId,
            ...(isImage ? { imageUrl: publicUrl } : { documentUrl: publicUrl, documentName: file.name }),
          }),
        })
        const result = await res.json().catch(() => ({}))
        if (!res.ok || !result.ok) throw new Error(result.error ?? 'WHAPI send failed')
        if (inserted) {
          const whapiId: string | null = result.messageId ?? null
          const patch = whapiId
            ? { external_id: whapiId, delivery_status: 'sent' as const }
            : { delivery_status: 'sent' as const }
          await (supabase as any).from('chat_messages').update(patch).eq('id', inserted.id)
          patchMessage(inserted.id, patch)
        }
      } else {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('api-wati', {
          body: {
            action:    'send_file',
            phone,
            url:       publicUrl,
            caption:   caption ?? '',
            filename:  file.name,
            mime_type: file.type,
          },
        })
        if (fnErr) throw fnErr
        const watiResp = fnData as any
        if (watiResp?.result === false || watiResp?.error) {
          throw new Error(watiResp?.info ?? watiResp?.error ?? watiResp?.detail ?? 'WATI rejected the file')
        }
        const watiId = watiResp?.message?.whatsappMessageId
          ?? watiResp?.info?.whatsAppMessageId ?? null
        if (inserted) {
          const patch = watiId
            ? { external_id: `wati_${watiId}`, delivery_status: 'sent' as const }
            : { delivery_status: 'sent' as const }
          await (supabase as any).from('chat_messages').update(patch).eq('id', inserted.id)
          patchMessage(inserted.id, patch)
        }
      }
    } catch (err) {
      if (inserted) {
        await (supabase as any).from('chat_messages').update({ delivery_status: 'failed' }).eq('id', inserted.id)
        patchMessage(inserted.id, { delivery_status: 'failed' })
      }
      throw err
    } finally {
      setSending(false)
    }
```

- [ ] **Step 4: Route `reactToMessage` by provider**

Find the `reactToMessage` callback at line ~265:
```typescript
  const reactToMessage = useCallback(async (messageId: string, emoji: string, _phone?: string) => {
    const { data: row } = await (supabase as any)
      .from('chat_messages').select('reactions').eq('id', messageId).maybeSingle()
    const existing: { emoji: string; from_type: string }[] = row?.reactions ?? []
    const hasIt = existing.some((r) => r.emoji === emoji && r.from_type === 'agent')
    const updated = hasIt
      ? existing.filter((r) => !(r.emoji === emoji && r.from_type === 'agent'))
      : [...existing, { emoji, from_type: 'agent' }]
    const { error: updateErr } = await (supabase as any)
      .from('chat_messages').update({ reactions: updated }).eq('id', messageId)
    if (updateErr) {
      console.error('[reactToMessage] update failed', updateErr)
      return
    }
    patchMessage(messageId, { reactions: updated } as any)
    // NOTE: Wati does not expose a reaction-sending API endpoint.
    // Agent reactions are stored in MMS only and are not forwarded to the customer's WhatsApp.
    // Customer reactions arrive via the Wati webhook and are stored/displayed automatically.
  }, [supabase, patchMessage])
```

Replace with:
```typescript
  const reactToMessage = useCallback(async (messageId: string, emoji: string, phone?: string) => {
    if (provider === 'whapi' && phone) {
      // For WHAPI, look up the external_id first (needed for the reaction API)
      const { data: row } = await (supabase as any)
        .from('chat_messages').select('reactions, external_id').eq('id', messageId).maybeSingle()
      const externalId: string | null = row?.external_id ?? null

      if (externalId) {
        const res = await fetch('/api/whapi/send-reaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: phone, messageId: externalId, emoji, localMessageId: messageId }),
        })
        if (!res.ok) {
          console.error('[reactToMessage] WHAPI reaction failed', await res.text())
          return
        }
        // Server route already updated the DB — reflect locally
        const existing: { emoji: string; from_type: string }[] = row?.reactions ?? []
        const hasIt = existing.some((r) => r.emoji === emoji && r.from_type === 'agent')
        const updated = hasIt
          ? existing.filter((r) => !(r.emoji === emoji && r.from_type === 'agent'))
          : [...existing, { emoji, from_type: 'agent' }]
        patchMessage(messageId, { reactions: updated } as any)
      }
      return
    }

    // WATI: store locally only (no reaction API)
    const { data: row } = await (supabase as any)
      .from('chat_messages').select('reactions').eq('id', messageId).maybeSingle()
    const existing: { emoji: string; from_type: string }[] = row?.reactions ?? []
    const hasIt = existing.some((r) => r.emoji === emoji && r.from_type === 'agent')
    const updated = hasIt
      ? existing.filter((r) => !(r.emoji === emoji && r.from_type === 'agent'))
      : [...existing, { emoji, from_type: 'agent' }]
    const { error: updateErr } = await (supabase as any)
      .from('chat_messages').update({ reactions: updated }).eq('id', messageId)
    if (updateErr) {
      console.error('[reactToMessage] update failed', updateErr)
      return
    }
    patchMessage(messageId, { reactions: updated } as any)
  }, [supabase, patchMessage, provider])
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/contact-center/useChatMessages.ts
git commit -m "feat(contact-centre): route send/react by provider in useChatMessages

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Wire `useProviderSetting` into `useContactCenterState`

**Files:**
- Modify: `src/hooks/contact-center/useContactCenterState.ts`

- [ ] **Step 1: Import and call `useProviderSetting`**

At the top of the file, add the import after the existing hook imports:
```typescript
import { useProviderSetting }       from '@/hooks/useProviderSetting'
```

- [ ] **Step 2: Instantiate the hook and thread `provider` into `useChatMessages`**

Find line ~23 where the hook body begins and the state declarations are. Find the line:
```typescript
  const chatMessages   = useChatMessages(patchMessage, addMessage)
```

Replace with:
```typescript
  const { provider, setProvider } = useProviderSetting()
  const chatMessages   = useChatMessages(patchMessage, addMessage, provider)
```

- [ ] **Step 3: Export `provider` and `setProvider` from the hook return**

Find the `return` statement at the bottom of `useContactCenterState`. It currently returns an object — add `provider` and `setProvider` to it:
```typescript
  return {
    sidebarView, conversations, convsLoading, messages, threadLoading,
    fetchingWati, canLoadMore, loadMore,
    windowStatus, customerData, chatMessages, addressState,
    activeConversationId, activeCustomerId, activePhone,
    openConversation, goToList, expandSidebar, collapseSidebar, openPhoneDirect,
    syncFromWati, syncProgress, triggerPoll, updateConversationStatus,
    provider, setProvider,
  }
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/contact-center/useContactCenterState.ts
git commit -m "feat(contact-centre): wire useProviderSetting into state hook

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Add WATI/WHAPI toggle to Contact Centre header

**Files:**
- Modify: `src/components/contact-center/ContactCenterSidebar.tsx`

- [ ] **Step 1: Destructure `provider` and `setProvider` from state**

Find the destructuring at line ~36:
```typescript
  const {
    sidebarView, conversations, convsLoading, messages, threadLoading,
    fetchingWati, canLoadMore, loadMore,
    windowStatus, customerData, chatMessages, addressState,
    activeConversationId, activeCustomerId, activePhone,
    openConversation, goToList, expandSidebar, collapseSidebar, openPhoneDirect, syncFromWati, syncProgress, triggerPoll,
    updateConversationStatus,
  } = state
```

Replace with:
```typescript
  const {
    sidebarView, conversations, convsLoading, messages, threadLoading,
    fetchingWati, canLoadMore, loadMore,
    windowStatus, customerData, chatMessages, addressState,
    activeConversationId, activeCustomerId, activePhone,
    openConversation, goToList, expandSidebar, collapseSidebar, openPhoneDirect, syncFromWati, syncProgress, triggerPoll,
    updateConversationStatus, provider, setProvider,
  } = state
```

- [ ] **Step 2: Add the toggle to the list-view header (desktop)**

Find the desktop list-view header in the `sidebarView === 'list'` block:
```tsx
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold">Contact Centre</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCollapse}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </div>
```

Replace with:
```tsx
          <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2">
            <span className="text-xs font-semibold shrink-0">Contact Centre</span>
            {/* Provider toggle */}
            <div className="flex items-center rounded-full border border-border bg-muted/50 p-0.5 gap-0.5">
              {(['wati', 'whapi'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                    provider === p
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCollapse}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </div>
```

- [ ] **Step 3: Apply the same toggle to the mobile list-view header**

Find the mobile equivalent (inside the `lg:hidden` drawer in the same `sidebarView === 'list'` block):
```tsx
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold">Contact Centre</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCollapse}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
```

Replace with:
```tsx
            <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2">
              <span className="text-xs font-semibold shrink-0">Contact Centre</span>
              <div className="flex items-center rounded-full border border-border bg-muted/50 p-0.5 gap-0.5">
                {(['wati', 'whapi'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setProvider(p)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                      provider === p
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCollapse}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/contact-center/ContactCenterSidebar.tsx
git commit -m "feat(contact-centre): add WATI/WHAPI provider toggle to list header

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Update PROGRESS.md

- [ ] **Step 1: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-05-17] **WHAPI Integration Task 1–11: WHAPI provider + reactions** — `middleware.ts`, `supabase/migrations/20260517120000_app_settings.sql`, `src/app/api/settings/cc-provider/route.ts`, `src/app/api/whapi/webhook/route.ts`, `src/app/api/whapi/send-message/route.ts`, `src/app/api/whapi/send-reaction/route.ts`, `src/hooks/useProviderSetting.ts`, `src/hooks/contact-center/useChatMessages.ts`, `src/hooks/contact-center/useContactCenterState.ts`, `src/components/contact-center/ContactCenterSidebar.tsx` — dual-provider Contact Centre with global WATI/WHAPI toggle, full two-way reactions via WHAPI, AbortError fix
```

Add to `## 🔒 Security Audit Log`:
```
| 2026-05-17 | WHAPI Integration | ✅ Secrets | ✅ RLS | ✅ Auth gate | ✅ Error handling | Webhook has no HMAC signing (WHAPI standard plan doesn't provide it) — accepted gap, write-only route |
```

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — WHAPI integration complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Webhook registration reminder

Once deployed, register the webhook in the WHAPI dashboard:

1. Go to Channel Settings → Webhooks
2. Set URL: `https://<your-production-domain>/api/whapi/webhook`
3. Enable events: **messages.post** and **statuses.post**
4. Save
