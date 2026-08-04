# Contact Centre v2 — Redesign Spec

**Date:** 2026-06-08
**Status:** Spec — not yet implemented
**Branch (planned):** `feature/contact-centre-v2`
**Supersedes:** `docs/modules/contact-centre-spec.md` (current implementation)

---

## 1. Goals

Three things drive this redesign:

1. **More chat real-estate.** Today the chat thread fights for space with CRM panels, address forms, and the right-side rail. Agents spend most of their time reading and replying — the chat needs to dominate.
2. **One conversation per customer.** Today a customer with two phone numbers, or a customer who switches between WhatsApp providers, looks like multiple conversations. Agents miss context. We want one thread that fuses WATI + WHAPI + 3CX + all customer phones.
3. **A single source of truth for every customer interaction.** Every WhatsApp message, every 3CX call, every reaction, every voice note, every attachment — all stored in our DB and Supabase Storage. The provider becomes the transport, not the system of record.

---

## 2. UI Layout Changes

### 2.1 Sidebar position

**Current behaviour:** The Contact Centre sidebar starts BELOW the top nav bar (top: 14, bottom: 0) on the left side. The nav bar spans the full page width.

**New behaviour:** The Contact Centre sidebar starts at the very top of the page (top: 0, bottom: 0). The top nav bar starts AFTER the sidebar's right edge — i.e. nav `padding-left` (or `margin-left`) equals sidebar width (40 px when collapsed, 320 px when expanded).

```
┌──────┬─────────────────────────────────────────┐
│  CC  │  TopNav                                 │
│  bar ├─────────────────────────────────────────┤
│      │                                         │
│      │  Dashboard content                      │
│      │                                         │
└──────┴─────────────────────────────────────────┘
```

The dashboard layout component must read the `ccSidebar` state from `ContactCenterContext` and apply the correct left offset to both the nav bar and the content area.

### 2.2 Right-side panel removed

Today Order History and Products live in a separate right-side panel when an agent opens an order. We're removing that panel entirely.

Order History, Products, Customer Profile, and Addresses all become stackable **collapsible sections inside the Contact Centre sidebar**, ordered:

1. Customer
2. Phones
3. Addresses
4. Products
5. Orders

Each section is collapsible (click header to toggle). Collapsed by default except Customer + Phones (which are always visible). State persists per-user in localStorage (`cc-section-open: { addresses: true, ... }`).

### 2.3 Minimalist customer card

The CRM section is reworked for density. Today it sprawls. New layout:

```
┌─────────────────────────────────────┐
│ 👤 Ismail              [IND]  ✎    │  ← name, type, edit
│ 📞 +97455123456  +97444987654       │  ← primary (orange bg), then others
└─────────────────────────────────────┘
```

- Primary phone: orange background pill (`bg-primary/10 text-primary`)
- Secondary phones: plain monospace text, comma-separated
- No "mobile" / "work" labels visible by default (revealed in edit mode only)
- No phone icon for each phone — one icon at the row start
- Block warning and pending-payment badge sit below the card, only if relevant

### 2.4 Address cards — horizontal scroll-snap strip

Replaces the current vertical list. New behaviour:

```
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Address  [1] │ │ Address  [2] │ │ Address  [3] │
│ Z55 St495    │ │ Z42 St12     │ │ GPS 25.28...  │
│ B48          │ │ B17          │ │ 51.53...      │
│ Open in Waze │ │ Open in Waze │ │ Open in Waze │
└───────────────┘ └───────────────┘ └───────────────┘
   ⬑ orange [1]  badge on primary; grey on others
```

- Cards stacked horizontally with `overflow-x-auto scroll-smooth snap-x snap-mandatory`
- Each card is `min-w-[240px] snap-start`
- A small number badge in the top-right corner shows the index (1, 2, 3...). Primary address card has `bg-primary/10 text-primary` on the badge; others are muted.
- **Mouse wheel hijack:** when the cursor is hovering over the strip, vertical wheel events scroll horizontally. Implementation: attach `onWheel` to the container; if `Math.abs(e.deltaY) > Math.abs(e.deltaX)`, call `el.scrollBy({ left: e.deltaY * 1.2, behavior: 'smooth' })` and `e.preventDefault()`.
- Cards remain draggable using the existing `dataTransfer.setData('application/mms-address', JSON.stringify(address))` payload. The grip handle moves to the top-left of the card.
- "Add address" appears as a thin `+` button at the end of the strip (also snap-aligned).

### 2.5 Order History and Products inline

Both appear as collapsible sections below Addresses. They reuse the existing `OrderHistorySection` and `ProductsList` components with no functional change — only their location moves.

### 2.6 Maximise chat space

The detail view splits height as follows:

| Region | Height |
|---|---|
| Header (name + status pill) | 40 px fixed |
| CRM accordion (all sections combined) | `max-h-[40vh]`, scrollable internally |
| Chat thread | `flex-1` (everything else) |
| Composer | `min-h-[80px]`, auto-grow up to `max-h-[35%]` |

The accordion's max-height ensures even if an agent expands every section, the chat thread always gets at least 60 % of the height.

---

## 3. Unified Chat Thread

### 3.1 Conceptual model

A **conversation** is now tied to a **customer**, not to a phone number. Every WATI message, WHAPI message, and 3CX call event that involves any of that customer's phones belongs to the same conversation.

Schema change (preview — full details in §6):

```
chat_conversations:
  id, customer_id (NOT NULL), last_message, last_message_at, ...
  → no more wati_phone field on this table

chat_messages:
  id, conversation_id, source, phone_id (which phone the msg came from/went to), ...
```

A customer with 3 phones still has ONE row in `chat_conversations`. The thread mixes messages from all 3 phones.

### 3.2 Timeline rendering

All messages from all sources interleave chronologically. When the **source** changes between two consecutive messages, a section divider is drawn:

```
─── chat (WATI · +974551..56) ────────────────────────────
[customer msg]                       [agent msg ✓✓]
[customer msg]

─── 3CX Call ─────────────────────────────────────────────
🟢 Live: Agent Ahmed is calling +974551..56
   (rendered while call is active)
                                     🎤 [voice note 1:24]
                                     (rendered when call ends)

─── chat (WATI · +974551..56) ────────────────────────────
[customer msg]                       [agent msg ✓✓]

─── chat (WHAPI · +974449..54) ───────────────────────────
[customer msg]
                                     [agent msg ✓✓]
```

Divider rules:
- Show divider when `(source, phone)` of message N+1 differs from message N.
- Format: `─── {source label} · {phone, masked middle} ───`
- Source labels: `chat (WATI)`, `chat (WHAPI)`, `3CX Call`
- Phone is omitted from the divider when the source is the same and only the phone differs within the same provider — but a small phone badge appears on the bubble itself instead.

### 3.3 Bubble badges

Each bubble carries small metadata badges:

- **Phone badge** (always, when the customer has > 1 phone): last 4 digits, e.g. `••56`. Click to filter the thread to only messages on that phone.
- **Source badge** (only when adjacent dividers don't already make it obvious): `WATI` / `WHAPI` / `3CX`
- **Reactions** below the bubble (existing behaviour)
- **Delivery ticks** for agent messages (existing behaviour)

### 3.4 3CX call rendering

A 3CX call appears as a special "event" message with two phases:

**Phase 1 — Call active:**
```
─── 3CX Call ──────────────
🟢 Agent Ahmed is on a call with +974551..56
   Duration: 0:42 (ticking live)
```
This is a single `chat_messages` row inserted by the call-start webhook, with `source='3cx_call'`, `message_kind='event'`, `delivery_status='sending'`. The duration counter is computed client-side from `created_at`.

**Phase 2 — Call ended:**
The same row's `delivery_status` flips to `delivered`. The call recording is downloaded server-side, compressed to OGG Opus @ 24 kbps, uploaded to Supabase Storage, and appended to the row's `attachments`. The bubble re-renders as:
```
─── 3CX Call ──────────────
✅ Agent Ahmed · 2:14 duration · ended 10:42 AM
🎤 [▶ play 2:14 recording] [⬇ download]
```

If the call was missed (no answer), the row instead shows `❌ Missed call from +974551..56`.

### 3.5 Composer (auto-switching)

The composer at the bottom of the chat has:

- **Provider toggle** (WATI / WHAPI pill) — auto-switches based on the last inbound message's provider. Agent can override manually.
- **Phone-target dropdown** — only visible when the customer has > 1 phone. Pre-selects the phone of the last inbound message. Agent can change.
- **Window banner** (WATI only) — green / amber / red based on minutesRemaining
- **Textarea** — `min-h-[80px] max-h-[35%]` (of the parent chat region), auto-grow with content. When content exceeds max, internal scroll.
- **Buttons:** emoji, attachment, instructions (canned snippets), voice mic, send. WATI mode adds a **Templates** button.

**Auto-switch logic:**
```ts
// in useContactCenterState
useEffect(() => {
  const last = messages.filter(m => m.from_type === 'customer').slice(-1)[0]
  if (!last) return
  if (last.source === 'whatsapp_whapi' && provider === 'wati')  setProvider('whapi')
  if (last.source === 'whatsapp_api'   && provider === 'whapi') setProvider('wati')
}, [messages])
```

---

## 4. Storage Strategy

### 4.1 Eager download + compression

Every webhook handler (WATI / WHAPI / 3CX) does the same thing for media:

1. Receive webhook payload with `mediaUrl` (provider's CDN URL).
2. Server-side fetch the file (with provider auth header).
3. Compress according to type (see §4.2).
4. Upload to Supabase Storage bucket `chat-attachments`, path `{conversation_id}/{message_id}_{i}.{ext}`.
5. Store the **Supabase public URL** in `chat_messages.attachments[].url`. Provider URL is NOT stored.

This is synchronous within the webhook handler (with reasonable timeouts). If compression / upload fails, the row still inserts but with `attachments[].status='download_failed'` and the provider URL stored as a fallback so the agent at least sees something.

### 4.2 Compression rules

| Type | Rule | Implementation |
|---|---|---|
| Image (jpeg/png/webp) | Resize longest edge to 1600 px; JPEG quality 80; strip EXIF | `sharp` (Node) |
| Image (heic) | Convert to JPEG, then apply image rules | `sharp` with libheif |
| Video | If size ≤ 5 MB: store as-is. If > 5 MB: re-encode H.264 720p @ 1 Mbps audio AAC 96 kbps | `fluent-ffmpeg` |
| Voice note (audio/ogg) | Store as-is — already OGG Opus | none |
| Voice note (audio/mp4/m4a) | Re-encode to OGG Opus 24 kbps mono | `ffmpeg` |
| 3CX recording | Re-encode to OGG Opus 24 kbps mono | `ffmpeg` |
| Document (pdf, docx, etc.) | Store as-is | none |
| Sticker (webp) | Store as-is | none |

Compression runs in a Supabase Edge Function (`compress-and-store-media`) invoked by each webhook. The function takes `{ providerUrl, providerAuth, conversationId, messageId, mime }` and returns the Supabase URL when done.

### 4.3 Manual time-range purge

A new admin-only page `/admin/contact-centre/purge` allows soft-deletion of message history within a date range.

UI flow:

1. **Filter form:**
   - Customer: dropdown (search), or "All customers"
   - Date range: from / to (defaults to nothing — must be explicit)
   - Source filter: checkbox group (WATI, WHAPI, 3CX, all)
   - Media filter: checkbox group (text, images, video, audio, documents, all)
   - Preview button → shows a count: "This will delete 1,432 messages and 287 media files"

2. **Confirmation gate:** Below the preview, a text input that says:
   > Type the phrase below to confirm deletion:
   > `DELETE messages from 2025-01-01 to 2025-03-31`

   The exact phrase regenerates whenever filters change. The Confirm button is disabled until the user types the phrase **exactly**.

3. **Soft delete:** On confirm, the route `POST /api/admin/contact-centre/purge` does:
   - For matching `chat_messages` rows: set `deleted_at = now()`, `deleted_by = user.id`
   - For matching `chat_conversations` with no remaining undeleted messages: optionally also mark them deleted (toggle in the UI)
   - Returns `{ deleted: { messages: N, conversations: M } }`

4. **Hard-delete sweep:** A nightly cron job deletes messages where `deleted_at < now() - interval '7 days'`. The Supabase Storage files for those messages are deleted in the same job (loop through attachments, call `supabase.storage.from('chat-attachments').remove([...paths])`).

5. **Restore:** Within the 7-day window, a sibling admin page `/admin/contact-centre/purge/history` lists soft-deleted batches with a "Restore" action that sets `deleted_at = null` for the batch.

Permission gate: requires `contact_centre.admin.purge` permission. Not granted by default — must be explicitly added to a role.

---

## 5. 3CX Integration

### 5.1 Webhook events

Two new endpoints (assuming 3CX is configured to call them):

| Endpoint | Trigger | Payload (expected) |
|---|---|---|
| `POST /api/3cx/webhook/call-start` | When a call connects | `{ call_id, agent_extension, agent_name, customer_phone, direction, started_at }` |
| `POST /api/3cx/webhook/call-end` | When a call ends | `{ call_id, ended_at, duration_seconds, status: 'answered'\|'missed'\|'rejected', recording_url? }` |

Both endpoints validate a shared secret in the `x-3cx-secret` header against `process.env.THREECX_WEBHOOK_SECRET`. Routes are added to `WEBHOOK_PREFIXES` in `middleware.ts`.

### 5.2 Customer resolution

When `customer_phone` arrives:
1. Normalise (e.g. `+974551..56` → `+97455123456`)
2. Look up `service_customer_phones.customer_id` by `phone`
3. If found → use that `customer_id` for the conversation
4. If not found → create a placeholder `chat_conversations` row with `customer_id = null` and surface in the "Unknown" filter (same behaviour as today's unknown-caller flow)

### 5.3 Message insertion on call-start

```ts
await supabase.from('chat_messages').insert({
  conversation_id,
  from_type:       direction === 'inbound' ? 'customer' : 'agent',
  source:          '3cx_call',
  message_kind:    'event',
  text:            `Agent ${agent_name} ${direction === 'inbound' ? 'received' : 'placed'} a call`,
  agent_name:      agent_name,
  external_id:     `3cx_${call_id}`,
  delivery_status: 'sending',  // means "call in progress"
  attachments:     null,
  phone_id:        resolvedPhoneId,
})
```

### 5.4 Message update on call-end

Look up the row by `external_id = '3cx_' + call_id`. Update:
- `delivery_status = 'delivered'` (call completed) or `'failed'` (missed/rejected)
- `text` updated to final form (e.g. `Agent Ahmed · 2:14 duration`)
- Attachments: invoke `compress-and-store-media` with the recording URL, then patch the row.

### 5.5 Database additions

A new `call_records` table is added for fast lookup and reporting (one-to-one with the `3cx_call` event in `chat_messages`):

```sql
create table call_records (
  id              uuid primary key default uuid_generate_v4(),
  message_id      uuid not null references chat_messages(id) on delete cascade,
  call_id         text unique not null,
  agent_extension text,
  agent_name      text,
  customer_phone  text not null,
  direction       text check (direction in ('inbound', 'outbound')),
  status          text check (status in ('in_progress', 'answered', 'missed', 'rejected')),
  started_at      timestamptz not null,
  ended_at        timestamptz,
  duration_seconds int,
  recording_url   text,  -- supabase storage url after upload
  created_at      timestamptz default now()
);
alter table call_records enable row level security;
create policy "Authenticated read" on call_records for select to authenticated using (true);
create policy "Service-role write" on call_records for all to service_role using (true) with check (true);
```

---

## 6. Database Migrations

### 6.1 chat_conversations — make customer_id the key

Today's schema treats `wati_phone` as the conversation key. New schema treats `customer_id` as the key.

```sql
-- Migration: unify conversations by customer

-- 1. Add provider-agnostic columns
alter table chat_conversations
  add column if not exists customer_id_v2 uuid references service_customers(id),
  add column if not exists is_deleted boolean default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references profiles(id);

-- 2. Backfill: pick the customer_id from existing rows
update chat_conversations c
   set customer_id_v2 = c.customer_id
 where c.customer_id is not null;

-- 3. For phone-only rows (no customer linked), resolve through phones
update chat_conversations c
   set customer_id_v2 = p.customer_id
  from service_customer_phones p
 where c.customer_id_v2 is null
   and p.phone = c.wati_phone;

-- 4. Merge: for each customer that has multiple conversation rows
--    (one per phone, one per provider), pick a canonical row and
--    move all chat_messages to it.
--    [Manual migration script — see migration file]

-- 5. Drop wati_phone, provider; rename customer_id_v2 → customer_id
alter table chat_conversations drop column wati_phone;
alter table chat_conversations drop column provider;
alter table chat_conversations drop column customer_id;
alter table chat_conversations rename column customer_id_v2 to customer_id;
alter table chat_conversations alter column customer_id set not null;
create unique index chat_conversations_customer_id_uq on chat_conversations(customer_id);
```

### 6.2 chat_messages — add phone_id and source variants

```sql
alter table chat_messages
  add column if not exists phone_id uuid references service_customer_phones(id),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references profiles(id);

-- Expand the source enum
alter table chat_messages drop constraint if exists chat_messages_source_check;
alter table chat_messages add constraint chat_messages_source_check
  check (source in ('whatsapp_api', 'whatsapp_whapi', '3cx_call', 'manual'));

-- Index for purge queries
create index chat_messages_deleted_at_idx on chat_messages(deleted_at) where deleted_at is not null;
create index chat_messages_created_at_idx on chat_messages(created_at);
```

### 6.3 New tables

- `call_records` (see §5.5)
- `purge_batches` — audit trail for purge operations:

```sql
create table purge_batches (
  id              uuid primary key default uuid_generate_v4(),
  performed_by    uuid not null references profiles(id),
  filter_payload  jsonb not null,
  message_count   int  not null,
  attachment_bytes bigint not null default 0,
  soft_deleted_at timestamptz not null default now(),
  hard_deleted_at timestamptz,
  restored_at     timestamptz
);
alter table purge_batches enable row level security;
create policy "Admins read" on purge_batches for select to authenticated
  using (exists (select 1 from user_custom_roles ur
                  join custom_roles cr on cr.id = ur.role_id
                 where ur.profile_id = auth.uid()
                   and 'contact_centre.admin.purge' = any(cr.permissions)));
```

### 6.4 Supabase Storage bucket

```sql
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- RLS: authenticated users can read; service role writes
create policy "chat-attachments read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-attachments');
create policy "chat-attachments write" on storage.objects for all to service_role
  using (bucket_id = 'chat-attachments') with check (bucket_id = 'chat-attachments');
```

---

## 7. Hook & Component Changes

### 7.1 New hooks

- `useUnifiedConversation(customerId)` — replaces `useLiveConversations` filtered to one customer. Returns: customer, phones, messages (all sources), last_message_at, unread_count. Subscribes to `chat_messages` realtime filtered by `conversation_id`.
- `useProviderAutoSwitch(messages, provider, setProvider)` — runs the auto-switch effect described in §3.5.
- `useScrollSnap(ref)` — attaches the wheel hijack to address-card strip.

### 7.2 Modified hooks

- `useContactCenterState` — replaces `activePhone` / `activeConversationId` with `activeCustomerId`. All phone-specific resolution moves into per-message handling.
- `useChatMessages` — adds `sendVia: 'wati' | 'whapi'` and `targetPhoneId` parameters to `sendSessionMessage` and `sendFile`. Provider routing decided per send.

### 7.3 Renamed / new components

| Component | Status | Notes |
|---|---|---|
| `ContactCenterSidebar` | modified | Position from top:0, sections accordion |
| `ChatListView` | modified | Row shows customer name + last source badge + last phone badge |
| `ChatSection` | modified | Source dividers, phone badges, 3CX call cards |
| `ChatInputBar` | modified | Phone-target dropdown, auto-switch, no Templates button outside WATI |
| `CrmSection` | modified | Minimalist single-row card |
| `AddressSection` | replaced | Now `AddressStrip` with horizontal scroll-snap |
| `ProductsList` | unchanged | Moves into the accordion |
| `OrderHistorySection` | unchanged | Moves into the accordion |
| `CallEventBubble` | **new** | Renders 3CX call events with live duration |
| `SectionAccordion` | **new** | Wraps each collapsible section |
| `PurgeMessagesPage` | **new** | The admin purge UI |

---

## 8. API Route Changes

### 8.1 New routes

| Route | Method | Purpose |
|---|---|---|
| `/api/3cx/webhook/call-start` | POST | 3CX call connect event |
| `/api/3cx/webhook/call-end` | POST | 3CX call end event + recording upload |
| `/api/admin/contact-centre/purge` | POST | Soft-delete messages by filter |
| `/api/admin/contact-centre/purge/restore` | POST | Restore a soft-deleted batch |
| `/api/admin/contact-centre/purge/history` | GET | List purge batches |
| `/api/internal/compress-media` | POST | Internal route called by webhooks to compress + upload media (or replaced by an Edge Function) |

### 8.2 Modified routes

- All WATI / WHAPI webhook routes now invoke `compress-and-store-media` for every media attachment. Provider URLs are dropped from `chat_messages.attachments` after successful upload.
- `/api/wati/sync-contacts` and `/api/whapi/sync-chats` continue to upsert `chat_conversations` but now key by `customer_id` (resolved from phone via `service_customer_phones`). If no customer match, the conversation is held in a "pending" state until the unknown-caller flow resolves it.

### 8.3 Cron additions

- Nightly `0 3 * * *` — `/api/admin/contact-centre/purge/sweep` — hard-deletes soft-deleted messages older than 7 days and removes their Storage files.

---

## 9. Permission Model

| Permission | Grants |
|---|---|
| `contact_centre.view` | See sidebar (existing) |
| `contact_centre.send` | Send messages / make calls (new — split from view) |
| `contact_centre.admin.purge` | Access the purge page and restore page (new) |
| `contact_centre.admin.unblock` | Unblock customers without manager approval (new — optional split) |

---

## 10. Migration & Rollout Plan

This is a breaking change to data shape. Plan carefully:

1. **Phase 1 — Schema migrations:** apply the additive parts (new columns, new tables, new bucket) without dropping anything yet. Old code keeps working.
2. **Phase 2 — Backfill:** run the customer-resolution backfill in a one-off script. Generate a report of conversations that couldn't be resolved to a customer and surface them in the unknown-caller flow.
3. **Phase 3 — New code behind feature flag:** ship the new components and hooks behind a `contact_centre_v2` feature flag in `profiles.feature_flags[]`. Pilot with a small group.
4. **Phase 4 — Compression pipeline:** roll out the eager-download pipeline. Backfill is OPTIONAL — old messages keep their WATI URLs.
5. **Phase 5 — Cut over:** flip the flag for all users.
6. **Phase 6 — Drop old columns:** drop `wati_phone`, `provider` from `chat_conversations` after a stability window of 2 weeks.

---

## 11. Open Questions

1. **3CX webhook payload shape** — we need the exact shape from 3CX's documentation or a sample webhook. The spec assumes a payload but the real shape may differ; the route may need adjustments.
2. **Recording URLs from 3CX** — does 3CX deliver the recording inline (binary) or via a URL that requires further authentication? Affects how the compress-and-store function is built.
3. **Storage cost monitoring** — should we add a dashboard widget that tracks `chat-attachments` bucket size and alerts above a threshold (e.g. 80 GB)? Suggested for a follow-up.
4. **PII redaction on purge** — should the purge also overwrite the original message `text` in the DB row (irreversibly) for compliance use cases, or is soft-delete sufficient? Today's spec assumes soft-delete only.
5. **Multi-phone send routing** — when sending to a customer with multiple phones and no recent inbound, what's the default target? Spec says "primary phone via WATI" but worth confirming.

---

## 12. Out of Scope (this spec)

- Email channel integration
- SMS fallback when WhatsApp window is closed
- Bulk outreach campaigns
- AI-powered reply suggestions
- Multi-language UI for the sidebar
- Mobile-native (React Native) version

These remain future modules.
