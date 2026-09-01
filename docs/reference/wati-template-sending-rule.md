# WATI Template Sending — Mandatory Rule

**Date:** 2026-06-08
**Status:** Active project rule — apply to every new feature that sends a WhatsApp template
**Reference implementation:** `src/app/api/notifications/send-booking-confirmations/route.ts`

---

## Why this rule exists

WATI has multiple ways to send a template. Most of them don't work in our setup:

- **Direct Node.js → WATI API calls** are silently filtered by WATI's backend. The request succeeds (200 OK) but the message never reaches the customer. This bit us in early versions and is hard to debug.
- **Direct fetch from the browser** exposes the WATI API token and is blocked by CORS.
- **Positional parameters (`{{1}}/{{2}}`)** are rejected by the v3 API with "Check your template, it cannot have typos or blank text".
- **Arabic-formatted parameter values** are rejected for the same reason — even when the template body is Arabic.

There is exactly **one path that works reliably**, and every feature must use it.

---

## The mandatory pattern

### 1. Route through the `api-wati` Supabase Edge Function

NEVER call WATI directly from a Next.js route, server action, browser, or cron job. Always invoke the `api-wati` Edge Function, which holds the WATI credentials as Supabase secrets and forwards to WATI's v3 API correctly.

**From a Next.js route with a user session (preferred):**

```ts
const userSupabase = createClient(SUPA_URL, SUPA_ANON, {
  global: { headers: { Authorization: `Bearer ${userToken}` } },
})

const { data, error } = await userSupabase.functions.invoke('api-wati', {
  body: {
    action:         'send_template',
    phone:          watiPhone,           // digits only, no '+'
    template_name:  'normal_booking_conformation_utility',
    broadcast_name: `${TEMPLATE_NAME}_${unique_id}_${Date.now()}`,
    parameters:     bodyParams,
  },
})
```

**From a cron job (no user session):**

```ts
const watiRes = await fetch(`${SUPA_URL}/functions/v1/api-wati`, {
  method: 'POST',
  headers: {
    'Content-Type':  'application/json',
    'apikey':        SUPA_ANON,
    'Authorization': `Bearer ${SUPA_ANON}`,
    'x-cron-secret': CRON_SECRET,
  },
  body: JSON.stringify({
    action:         'send_template',
    phone:          watiPhone,
    template_name:  TEMPLATE_NAME,
    broadcast_name: `${TEMPLATE_NAME}_${unique_id}_${Date.now()}`,
    parameters:     bodyParams,
  }),
})
```

### 2. Phone format: digits only, no `+`

```ts
const watiPhone = rawPhone.replace(/\D/g, '')  // "97455123456"
// NOT "+97455123456" — WATI rejects the + prefix
```

### 3. Use NAMED parameters, not positional

Every parameter must be `{ name: <variable name from template>, value: <stringified value> }`.

```ts
// ✅ Correct — named (matches the template's bodyOriginal placeholders)
const parameters = [
  { name: 'booking_number', value: 'B-12345' },
  { name: 'date',           value: 'Monday 15/Jan/2025' },
  { name: 'time',           value: '10:00 AM' },
]

// ❌ Wrong — positional. v3 API rejects.
const parameters = [
  { name: '1', value: 'B-12345' },
  { name: '2', value: 'Monday 15/Jan/2025' },
]
```

To discover the names: load the template from WATI, inspect `template.paramNames` (array of strings extracted from `bodyOriginal`).

### 4. Use English-formatted values

Even when the template body is Arabic, the parameter VALUES must use English numerals and standard formatting. WATI's validator compares against the approved sample structure, which uses English values.

```ts
// ✅ Correct
{ name: 'date', value: 'Monday 15/Jan/2025' }
{ name: 'time', value: '10:00 AM' }

// ❌ Wrong — Arabic numerals and formatting trigger "typos or blank text" rejection
{ name: 'date', value: 'الإثنين ١٥/يناير/٢٠٢٥' }
```

The user-facing rendered message in `chat_messages.text` can still be Arabic (see step 7). Only the template parameter VALUES must be English.

### 5. Replace empty values with `'-'`

WATI rejects blank parameters. Use a `safe()` helper:

```ts
const safe = (v: string | null | undefined) => (v && v.trim()) || '-'

const parameters = [
  { name: 'booking_number', value: safe(orderId) },
  { name: 'date',           value: safe(formatDate(scheduledDate)) },
  { name: 'time',           value: safe(timeSlot ? formatTime(timeSlot) : '') },
  { name: 'address_label',  value: safe(addressLabel) },
  { name: 'address_link',   value: safe(wazeLink) },
]
```

### 6. Unique `broadcast_name`

Format: `{template_name}_{stable_unique_id}_{Date.now()}`

```ts
const broadcast_name = `${TEMPLATE_NAME}_${orderId.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`
```

The `Date.now()` suffix prevents broadcast name collisions on retry. The middle slug helps when debugging in WATI's dashboard.

### 7. ALWAYS save to `chat_messages` for Contact Centre visibility

After invoking the Edge Function, upsert `chat_conversations` and insert a `chat_messages` row so the message appears in the Contact Centre thread. Do this regardless of whether the WATI send succeeded or failed — agents need to see what was attempted.

```ts
// ── Upsert conversation ────────────────────────────
const phone = `+${watiPhone}`

const { data: existing } = await supabase
  .from('chat_conversations')
  .select('id')
  .eq('wati_phone', phone)
  .maybeSingle()

let conversationId: string | null = existing?.id ?? null

if (!conversationId) {
  const { data: created } = await supabase
    .from('chat_conversations')
    .insert({
      wati_phone:      phone,
      last_message:    renderedText,
      last_message_at: new Date().toISOString(),
      unread_count:    0,
    })
    .select('id')
    .single()
  conversationId = created?.id ?? null
} else {
  await supabase
    .from('chat_conversations')
    .update({
      last_message:    renderedText,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
}

// ── Insert message ─────────────────────────────────
if (conversationId) {
  await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    from_type:       'agent',
    source:          'whatsapp_api',
    text:            renderedText,   // human-readable, can be Arabic
    agent_name:      'System',       // or the agent's name if user-initiated
    attachments:     pdfUrl
      ? [{ url: pdfUrl, type: 'application/pdf', name: 'document.pdf' }]
      : null,
    external_id:     watiMsgId ? `wati_${watiMsgId}` : `${TEMPLATE_NAME}_${unique_id}_${Date.now()}`,
    delivery_status: watiOk ? 'sent' : 'failed',
  })
}
```

The `external_id` always has a `wati_` prefix when derived from a WATI message id. This convention is used by the webhook deduplication logic.

### 8. Parse the Edge Function response correctly

The Edge Function may return any of these shapes depending on WATI's response:

```ts
// v2 success
{ result: true, info: { whatsAppMessageId: '...' }, ... }
// v3 success
{ result: true, message: { whatsappMessageId: '...' }, ... }
// Legacy
{ id: '...', messageId: '...', ... }
// Failure
{ error: 'reason', detail: '...', result: false }
```

Extract `watiMsgId` defensively:

```ts
const watiMsg  = data?.message as Record<string, unknown> | undefined
const watiInfo = data?.info    as Record<string, unknown> | undefined
const watiMsgId: string | null =
  (watiMsg?.whatsappMessageId  as string | undefined) ??
  (watiInfo?.whatsAppMessageId as string | undefined) ??
  (data?.id                    as string | undefined) ??
  (data?.messageId             as string | undefined) ??
  null

const watiOk = !error && !data?.error && data?.result !== false
```

### 9. Log enough to debug

When WATI fails, always log both the error AND the full response body (truncated):

```ts
if (!watiOk) {
  console.warn(
    '[my-feature] wati send failed',
    unique_id,
    'result:', data?.result,
    'fn_error:', error ?? data?.error,
    'detail:', data?.detail,
    'body:', JSON.stringify(data).slice(0, 500),
  )
}
```

This pays for itself the first time a template starts failing in prod.

---

## Existing template names (DO NOT redefine — reuse)

| Template name | Purpose | Param names |
|---|---|---|
| `normal_booking_conformation_utility` | Booking confirmation, 2 days before visit | `booking_number, date, time, address_label, address_link` (+ `pdflink` for header doc) |
| (add more as they're created) | | |

If a new use case maps to an existing template, REUSE it. Don't create a new template that does the same thing — WATI charges per template approval cycle and each template adds cognitive load for the team that approves them.

---

## Checklist before merging any feature that sends a WATI template

- [ ] Route is in `src/app/api/<feature>/route.ts` (Next.js API route), not a server component or client-side fetch
- [ ] Sends via `userSupabase.functions.invoke('api-wati', ...)` or the cron fetch pattern with `x-cron-secret`
- [ ] Phone is normalised to **digits only** (no `+`)
- [ ] Parameters use **named** entries, not positional
- [ ] All values are **English-formatted** (numerals, dates, times)
- [ ] Empty values are replaced with `'-'` via a `safe()` helper
- [ ] `broadcast_name` is unique and includes `Date.now()`
- [ ] Response is parsed defensively (4-way fallback for the message id)
- [ ] `chat_conversations` upsert happens
- [ ] `chat_messages` insert happens with `external_id = wati_<msgId>` (or a fallback string when WATI failed)
- [ ] `delivery_status` is `'sent'` only when the WATI call actually succeeded
- [ ] Failure path logs the full WATI response body (truncated to 500 chars) for debugging
- [ ] If the route is called by a cron, it's added to `WEBHOOK_PREFIXES` in `middleware.ts` and validates `x-cron-secret`
- [ ] If the route is called by an authenticated user, it validates the JWT via `supabase.auth.getUser(userToken)`

---

## When in doubt

Copy `src/app/api/notifications/send-booking-confirmations/route.ts` as a starting point. It implements every rule on this page correctly and has been validated in production.
