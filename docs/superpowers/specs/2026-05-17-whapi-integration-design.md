# WHAPI Integration + Full Two-Way Reactions Design

**Date:** 2026-05-17  
**Status:** Approved  
**Scope:** Contact Centre — add WHAPI as a second messaging provider alongside WATI, global toggle in the CC header, full two-way emoji reactions, fix client-side AbortError.

---

## 1. Goals

1. Let operators switch the Contact Centre between WATI and WHAPI via a toggle in the header — choice persists globally in the database.
2. Incoming WHAPI messages and status updates write to the same `chat_messages` / `chat_conversations` tables that WATI already uses — no UI changes needed to display them.
3. Full two-way reactions: customer reacts on WhatsApp → appears in MMS; agent picks an emoji in MMS → sent to customer via WHAPI.
4. Fix the silent `RuntimeAbortError / BodyStreamBuffer was aborted` crash in the background sync.

---

## 2. Non-Goals

- Replacing WATI for template sends, order notifications, or quotation sending (those routes stay as-is).
- Contact sync via WHAPI (WATI `/getContacts` sync keeps running).
- Per-conversation provider selection (toggle is global).

---

## 3. Webhook URL

Register this URL in the WHAPI dashboard (Channel Settings → Webhooks):

```
https://<production-domain>/api/whapi/webhook
```

Events to enable: **messages.post**, **statuses.post**  
(The `statuses.post` event carries delivery/read receipts identical in purpose to WATI's status callbacks.)

---

## 4. Database

### 4.1 `app_settings` table

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON app_settings
  USING (auth.role() = 'service_role');

-- Seed default provider
INSERT INTO app_settings (key, value)
VALUES ('cc_provider', 'wati')
ON CONFLICT (key) DO NOTHING;
```

Single row `{ key: 'cc_provider', value: 'wati' | 'whapi' }`.  
The toggle writes to this row; `useProviderSetting` subscribes to realtime changes so all open tabs flip simultaneously.

### 4.2 Environment variables (`.env.local`)

```env
WHAPI_TOKEN=<channel token from WHAPI dashboard>
```

No `WHAPI_BASE_URL` needed — always `https://gate.whapi.cloud`.

---

## 5. New Files

| Path | Purpose |
|---|---|
| `supabase/migrations/YYYYMMDDHHMMSS_app_settings.sql` | Create `app_settings`, seed `cc_provider` |
| `src/app/api/whapi/webhook/route.ts` | Receive WHAPI events; map to `chat_messages` schema |
| `src/app/api/whapi/send-message/route.ts` | Send text + media via WHAPI |
| `src/app/api/whapi/send-reaction/route.ts` | Send emoji reaction via WHAPI |
| `src/hooks/useProviderSetting.ts` | Read/write/subscribe `cc_provider` |

---

## 6. WHAPI Webhook Handler (`/api/whapi/webhook`)

### 6.1 Event types to handle

| WHAPI event | Action |
|---|---|
| `messages.post` — inbound text/media | Upsert `chat_conversations`, insert `chat_messages` (from_type = 'customer') |
| `messages.post` — reaction subtype | Upsert `chat_message_reactions` |
| `statuses.post` — delivered / read | Update `chat_messages.delivery_status` |

All other event types are acknowledged with 200 and ignored.

### 6.2 WHAPI message object shape (relevant fields)

```jsonc
{
  "event": { "type": "messages", "event": "post" },
  "messages": [{
    "id": "wamid.xxx",
    "from": "97412345678",       // sender phone (no +)
    "to": "97455852848",         // our number
    "type": "text",              // or image, document, audio, reaction, …
    "text": { "body": "Hello" },
    "image": { "link": "https://…", "mime_type": "image/jpeg" },
    "reaction": { "message_id": "wamid.yyy", "emoji": "❤️" },
    "timestamp": 1716000000
  }]
}
```

### 6.3 Reaction handling (inbound)

When `type === 'reaction'`:
1. Resolve the `chat_message` row whose `external_id = reaction.message_id`.
2. Upsert into `chat_message_reactions`:
   ```
   { message_id, conversation_id, emoji, from_type: 'customer', external_id: message.id }
   ```
3. The existing `ReactionBubbles` component renders it automatically via realtime.

### 6.4 Middleware

Add `/api/whapi/webhook` to `WEBHOOK_PREFIXES` in `middleware.ts` (same pattern as the WATI webhook).

No HMAC verification in v1 — WHAPI's free/standard plans don't include webhook signing. *(Accepted gap: ⚠️ document in security audit log.)*

---

## 7. WHAPI Send Message (`/api/whapi/send-message`)

Mirrors `POST /api/wati/send-message`. Called by `ChatInputBar` when provider is `whapi`.

**Request body** (same contract as the WATI route):
```jsonc
{
  "phone": "+97412345678",
  "text": "Hello!",
  "documentUrl": "https://…",   // optional
  "documentName": "quote.pdf",  // optional
  "imageUrl": "https://…",      // optional
  "senderName": "Agent Name"    // optional
}
```

**Internal flow:**
1. `POST https://gate.whapi.cloud/messages/text` (or `/messages/document`, `/messages/image`) with `Authorization: Bearer ${WHAPI_TOKEN}`.
2. Save to `chat_messages` (from_type = 'agent', external_id = WHAPI message id).
3. Update `chat_conversations.last_message` / `last_message_at`.
4. Return `{ ok: true, messageId }`.

---

## 8. WHAPI Send Reaction (`/api/whapi/send-reaction`)

**Request body:**
```jsonc
{ "to": "+97412345678", "messageId": "wamid.xxx", "emoji": "❤️" }
```

**Internal flow:**
1. `POST https://gate.whapi.cloud/messages/reaction` `{ to, messageId, emoji }`.
2. On success: upsert `chat_message_reactions` with `from_type = 'agent'`.
3. Return `{ ok: true }`.

When provider is WATI, `onReact` saves to `chat_message_reactions` locally only (no API call — WATI has no reaction endpoint). The `ReactionBubbles` component already distinguishes `hasCustomer` vs agent-only reactions with a dashed border.

---

## 9. Provider Setting Hook (`useProviderSetting`)

```typescript
// Returns { provider, setProvider, loading }
// provider: 'wati' | 'whapi'
// setProvider: writes to app_settings via service-role fetch, triggers realtime
```

- Reads `app_settings` via `supabase.from('app_settings').select('value').eq('key','cc_provider').single()`.
- Subscribes to `postgres_changes` on `app_settings` for real-time cross-tab sync.
- `setProvider` calls `PATCH /api/settings/cc-provider` (a thin route that uses the service role to update the row, since the anon key can't write due to RLS).

---

## 10. UI — Toggle in Contact Centre Header

Location: the list-view header (`sidebarView === 'list'`), where the red box appears in the screenshot.

```
Contact Centre   [WATI · WHAPI]   ‹
```

The toggle is a small two-pill button. Active pill is filled (primary), inactive is ghost. It reads from `useProviderSetting` and calls `setProvider` on click. A loading spinner replaces it while the DB write is in-flight.

---

## 11. Routing — ChatInputBar

`ChatInputBar` currently always calls `/api/wati/send-message`. After this change:

```typescript
const endpoint = provider === 'whapi'
  ? '/api/whapi/send-message'
  : '/api/wati/send-message'
```

The request body contract is identical so no other changes needed in `ChatInputBar`.

---

## 12. Routing — Reactions

`ContactCenterSidebar` passes `onReact` to `ChatSection`. Currently:
```typescript
onReact={(msgId, extId, emoji) => chatMessages.reactToMessage(msgId, emoji, activePhone ?? '')}
```

After change — `useChatMessages.reactToMessage` receives `provider` and routes accordingly:
- `whapi`: calls `/api/whapi/send-reaction`
- `wati`: saves to DB only (no API call)

---

## 13. AbortError Fix

In `useContactCenterState.ts`, the background sync catch currently only matches `err.name === 'AbortError'`. Next.js 15 Turbopack throws a `RuntimeAbortError` (different class name) with the message `BodyStreamBuffer was aborted`. Fix:

```typescript
} catch (err: unknown) {
  if (
    err instanceof Error &&
    (err.name === 'AbortError' ||
     err.name.includes('Abort') ||
     err.message.includes('aborted') ||
     err.message.includes('BodyStreamBuffer'))
  ) return
  // non-abort failures are non-fatal — silently ignore
}
```

---

## 14. Security Audit Notes

| Check | Status | Notes |
|---|---|---|
| Secrets | ✅ | `WHAPI_TOKEN` via `process.env` only |
| RLS | ✅ | `app_settings` has RLS enabled; service-role-only policy |
| Auth gate | ✅ | `/api/whapi/webhook` is in `WEBHOOK_PREFIXES` (middleware bypasses session check); `/api/whapi/send-*` routes are behind session middleware |
| Error handling | ✅ | All WHAPI fetch calls wrapped in try/catch; non-200 returns `{ ok: false, error }` |
| Webhook signing | ⚠️ | WHAPI standard plan doesn't provide HMAC signing — no verification in v1. Mitigate: route is public but write-only; worst case is spam inserts which the UI filters by `last_message_at`. |

---

## 15. File Change Summary

**New files:** 5  
**Modified files:** `middleware.ts`, `ChatInputBar.tsx`, `ContactCenterSidebar.tsx`, `useChatMessages.ts`, `useContactCenterState.ts`  
**Migration:** 1
