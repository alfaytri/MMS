# Contact Centre Phase 1 — Design Spec
**Date:** 2026-05-11  
**Branch:** `feature/crm-sidebar-wati`  
**Status:** Approved — ready for implementation plan  
**Phase:** 1 of 2 (WATI + CRM Panel; Whapi/Tasks/Agent Resources deferred to Phase 2)

---

## Overview

Build the Contact Centre as a permission-gated, persistent sidebar that lives in the main dashboard layout. Phase 1 delivers:

- Collapsible sidebar (3 states: collapsed, chat list, customer detail)
- Full customer CRM panel (view, edit, block, unknown-caller flow)
- Address management (Blue Plate + Google Coords, draggable to Orders)
- Products + warranty display
- Order history
- WATI WhatsApp Business API messaging (chat thread, send/receive, 24h window, templates)
- Real-time updates via Supabase Realtime
- Permission-gated (`contact_centre.view`) — visible only to Call Centre and Owner roles

**Out of scope for Phase 1:** Whapi, reactions, reply-to, task queue, agent resources, Teams tab, 3CX dialer.

---

## Section 1 — Database Migrations

### Modified columns on `chat_messages`

```sql
ALTER TABLE chat_messages
  ADD COLUMN external_id TEXT,
  ADD COLUMN delivery_status TEXT DEFAULT 'sending'
    CHECK (delivery_status IN ('sending','sent','delivered','read','failed')),
  ADD COLUMN reply_to_external_id TEXT; -- Phase 2 Whapi, added now for schema stability

CREATE UNIQUE INDEX idx_chat_messages_external_id
  ON chat_messages (external_id)
  WHERE external_id IS NOT NULL;
```

**Deduplication strategy:** `INSERT INTO chat_messages ... ON CONFLICT (external_id) DO NOTHING` in the webhook. This is the primary guard against WATI double-delivery.

### Modified columns on `chat_conversations`

```sql
ALTER TABLE chat_conversations
  ADD COLUMN conversation_type TEXT NOT NULL DEFAULT 'customer'
    CHECK (conversation_type IN ('customer','team')),
  ADD COLUMN wati_phone TEXT; -- normalised +974XXXXXXXX form

CREATE INDEX idx_chat_conversations_wati_phone
  ON chat_conversations (wati_phone);
```

### Foreign key / delete policy

`chat_messages` already has `ON DELETE CASCADE` from `conversation_id → chat_conversations(id)`. No change needed. `chat_conversations.customer_id` has `NOT NULL` — if a customer record is deleted, the application must delete their conversations first (enforced at the service layer, not DB-level cascade, to avoid accidental data loss).

### Permission row

```sql
INSERT INTO permissions (module, action, description)
VALUES ('contact_centre', 'view', 'Access the Contact Centre sidebar');

-- Assign to Call Centre and Owner roles (role names match existing seed data)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('Call Centre', 'Owner')
  AND p.module = 'contact_centre' AND p.action = 'view'
ON CONFLICT DO NOTHING;
```

---

## Section 2 — Supabase Edge Functions

### `supabase/functions/api-wati/index.ts`

**Purpose:** Outbound WATI calls, invoked by the React UI via `supabase.functions.invoke('api-wati', { body })`.

**Auth:** Validates caller's Supabase JWT (`supa.auth.getUser()`). Returns 401 if invalid.

**Actions:**

| Action | WATI endpoint | Notes |
|---|---|---|
| `get_messages` | `GET /api/v1/getMessages/{phone}?pageSize=50` | Returns last 50 messages for thread seed |
| `send_session_message` | `POST /api/v1/sendSessionMessage/{phone}?messageText=...` | Text is query param (WATI quirk) |
| `send_template` | `POST /api/v2/sendTemplateMessage?whatsappNumber={phone}` | Body: `{ template_name, broadcast_name, parameters }` |
| `get_templates` | `GET /api/v1/getMessageTemplates` | Cached in-memory per cold start |
| `get_window_status` | `GET /api/v1/getMessages/{phone}?pageSize=1` | Derives `isOpen`, `expiresAt` from latest inbound timestamp |

**Rate limit handling:** All WATI calls check for HTTP 429 and return `{ error: 'rate_limited', retryAfter }` to the UI, which shows a toast rather than crashing.

**Cold start:** Edge functions may take 1–2s on first call. The UI shows a loading spinner on the Send button; the send action is disabled until the function responds (no double-send).

**Secrets:** `WATI_API_ENDPOINT`, `WATI_API_TOKEN` (stripped of accidental `Bearer ` prefix).

---

### `supabase/functions/webhook-wati/index.ts`

**Purpose:** Receives all WATI events. Registered in the WATI dashboard as the webhook URL. `verify_jwt = false` in `supabase/config.toml`.

**Pipeline:**

```
1. Normalise phone → +974XXXXXXXX (libphonenumber-style: strip non-digits, prepend +974 if 8 digits)
2. classifyEvent(payload) → "inbound" | "outbound" | "status"
3. Branch:
   status  → UPDATE chat_messages SET delivery_status=X WHERE external_id = 'wati_{messageId}'
   outbound → SKIP (UI already inserted the row optimistically)
   inbound →
     a. Upsert chat_conversations (customer_id from phone lookup, wati_phone, last_message, last_message_at, unread_count++)
     b. INSERT INTO chat_messages (...) ON CONFLICT (external_id) DO NOTHING
```

**Race condition mitigation (outbound echo):** The UI optimistically inserts with `external_id = 'wati_{id}'` only after the WATI API responds with the message ID. The webhook echo is classified as `outbound` and skipped entirely — no upsert, no conflict. This is the simplest solution: the UI owns the outbound row, the webhook owns the inbound row.

**Phone normalisation:** Centralised `normalisePhone(raw: string): string` utility shared between both edge functions. Handles: `00974XXXXXXXX`, `+974XXXXXXXX`, `974XXXXXXXX`, `XXXXXXXX` (8-digit local). Throws if result isn't 12 digits after normalisation.

---

## Section 3 — React Architecture

### File structure

```
src/components/contact-center/
├── ContactCenterSidebar.tsx       — root, owns view/collapsed state
├── ChatListView.tsx               — search + conversation rows (All / Unanswered)
├── ChatSection.tsx                — message thread, Realtime-fed
├── ChatInputBar.tsx               — textarea, window banner, templates, send
├── CrmSection.tsx                 — view / edit / unknown-caller modes
├── AddressSection.tsx             — address cards + add form
├── ProductsList.tsx               — warranty cards
├── OrderHistorySection.tsx        — last 20 orders
└── AttachmentRenderer.tsx         — image thumbnails + file badges

src/hooks/contact-center/
├── useContactCenterState.ts       — orchestrator (composes all sub-hooks)
├── useCustomerData.ts             — phone lookup, CRM edit, unknown caller
├── useChatMessages.ts             — input state, optimistic send, template send
├── useAddressState.ts             — address CRUD + Blue Plate geocode
├── useWhatsAppWindow.ts           — 24h window status
├── useLiveConversations.ts        — Realtime: chat_conversations
└── useLiveThread.ts               — Realtime: chat_messages for active conversation

src/contexts/ContactCenterContext.tsx
  Exports: selectedCustomer, openCustomerById(), openCustomerByPhone()
  Consumed by: Orders module (address drag, customer pre-fill)
```

### Realtime subscription lifecycle

`useLiveThread` subscribes to `chat_messages` filtered by `conversation_id`. **Cleanup:** `useEffect` return function calls `supabase.removeChannel(channel)` — runs on unmount AND whenever `conversationId` changes (switching customers). This prevents subscription accumulation.

`useLiveConversations` subscribes to `chat_conversations` for the authenticated user's accessible conversations. Same cleanup pattern.

### Context + re-render isolation

`ContactCenterContext` uses `useMemo` on its value object so consumers only re-render when `selectedCustomer` identity changes — not on every sidebar state update. The sidebar's internal state (scroll position, input text, collapsed flag) stays local to `ContactCenterSidebar` and never flows into context.

---

## Section 4 — Sidebar UI & States

**Three states:**

| State | Width | Trigger |
|---|---|---|
| Collapsed | `w-10` | Collapse button, or default on `< lg:` |
| Chat List | `w-80` | Expand from collapsed, or Back from customer detail |
| Customer Detail | `w-80` | Click conversation row or search result |

**Responsive:** On `< lg:` the sidebar renders as a bottom-anchored slide-over drawer (full width, `h-[85vh]`, `rounded-t-xl`). A floating chat bubble FAB triggers it. On `lg:+` it is fixed to the right edge and pushes the main content via `pr-80` on the layout wrapper.

**Scroll chaining prevention:** The CrmSection scroll area uses `overscroll-contain` so scroll events don't bubble to the outer sidebar. Each scrollable zone is isolated.

**Width at 1080p:** `w-80` = 320px. The main content area loses 320px. At 1920px+ this is negligible. The sidebar sections use compact padding (`px-3 py-2`) and small text (`text-xs` / `text-sm`) appropriate for an agent tool.

---

## Section 5 — CRM Panel

**Three modes:** `crmMode: "view" | "edit" | "unknown"`

### View mode
Phone numbers with icons · Pending payment badge (QAR) · Blocked banner + Unblock button · BIZ/IND type badge.

### Edit mode
Name + Type inputs · Multi-phone editor (add/remove, mark primary) · Block form (inline, not modal): reason required, notes optional, image upload → writes `customer_blocks`, sets `is_blocked = true`.

**Phone normalisation (critical):** All phone input is normalised through the shared `normalisePhone()` utility on save and on lookup. `00974...`, `+974...`, `974...`, `8-digit local` all resolve to the same canonical form. This is the single source of truth — the DB stores only canonical `+974XXXXXXXX` format.

**Concurrency:** Last-write-wins is acceptable for name/type edits (low collision probability). Block operations are append-only (`customer_blocks` table) — no conflict possible.

### Unknown Caller mode
Three sub-states: `prompt → attach | create`. Attach searches `customer_phones` by normalised phone. Create inserts `customers` + `customer_phones` then immediately loads the new customer into customer-detail view.

---

## Section 6 — Address Management

**Add Address — 2-step flow:**

Step 1: Type selector card — "Blue Plate" or "Google Coordinates"

Step 2a — Blue Plate: Unit (opt), Building*, Street*, Zone*, Country (6 GCC). Auto-label: `B{building} S{street} Z{zone}`. On save → calls `blue-plate-lookup` edge function for coords.

**Lookup downtime fallback:** If `blue-plate-lookup` fails or times out (>8s), the form shows a warning `"Coordinates unavailable — saved without GPS"` and saves the address with `coords_lat = null, coords_lng = null`. The agent is not blocked. Coords can be resolved later.

Step 2b — Google Coords: `lat,lng` input (mono font), Address line*, Country. **Format enforced:** The input is validated as `[-]DD.DDDDD, [-]DDD.DDDDD` — latitude first, longitude second. A note "lat, lng format e.g. 25.2854, 51.5310" prevents ocean-pining mistakes.

**Drag-to-Orders:** `dataTransfer.setData('application/mms-address', JSON.stringify(address))`. The Orders drop zone reads this key. Contract is already in place — no Orders module changes needed.

---

## Section 7 — Chat Thread + Input (WATI)

### Thread rendering

Messages from `useLiveThread` (DB seed + Realtime appends). Auto-scroll to bottom on new message (unless user has scrolled up — detect with scroll position check before forcing scroll).

| Message type | Rendering |
|---|---|
| Customer (left) | Phone/name · text (`dir="auto"`) · timestamp · `WA API` badge |
| Agent (right) | Agent name · text · timestamp · delivery tick |
| Attachment | Image thumbnail (click = new tab, no lightbox Phase 1) · File badge with name |

**RTL text:** `dir="auto"` on the text span handles Arabic correctly. Delivery ticks and timestamp are in a separate `flex` row below the text bubble, not inline — avoids RTL layout flip on the tick marks.

**Delivery ticks:** Derived from `delivery_status`:
- `sending` → spinner icon
- `sent` → single grey ✓
- `delivered` → double grey ✓✓
- `read` → double blue ✓✓
- `failed` → red ✗ with retry button

### 24h Window

`useWhatsAppWindow` calculates from the latest `chat_messages` row where `from_type = 'customer'` and `source = 'whatsapp_api'` for the active conversation. Uses **server timestamp** (`created_at` from the DB row) — not the agent's local clock. This eliminates clock drift issues entirely.

Banner states:
- Open (>6h remaining): green
- Expiring (<6h): amber
- Closed: red — textarea disabled, template buttons shown

### Template variable mapping

`get_templates` returns each template's component list including variable counts. The send function maps variables positionally: `{{1}}` → customer name, `{{2}}` → (if present) next order date. If a template has more than 2 variables, it is marked `unsupported` in the UI and hidden from the quick-send list. This prevents partial-variable send failures.

### Optimistic send flow

```
1. Agent clicks Send
2. useChatMessages inserts row: { from_type: 'agent', delivery_status: 'sending', text, external_id: null }
3. Calls api-wati → send_session_message
4. On success: UPDATE row SET external_id = 'wati_{id}', delivery_status = 'sent'
5. On failure: UPDATE row SET delivery_status = 'failed'
6. Webhook echo of outbound message is SKIPPED (classified as 'outbound', no DB write)
```

---

## Section 8 — Permission Gating

**UI gate:** `hasPermission('contact_centre.view')` in `src/app/(dashboard)/layout.tsx`. Sidebar component is not rendered at all — no hidden DOM, no data fetched.

**Function-level gate (critical):** `api-wati` validates the caller's JWT and additionally checks that the resolved `profile_id` has `contact_centre.view` permission before executing any action. This prevents direct edge function calls from users who lack the permission. The check uses a single DB query: `SELECT 1 FROM role_permissions rp JOIN roles r ON ... WHERE profile_id = $1 AND permission = 'contact_centre.view'`.

**Webhook exclusion:** `webhook-wati` uses `service_role` internally and is not guarded by user permissions — it is the server-to-server endpoint. Its security is the WATI webhook secret (validated via HMAC header if WATI supports it, otherwise IP allowlist in Supabase Edge config).

---

## Risk Mitigation Summary

| Risk | Mitigation |
|---|---|
| Duplicate external_id on webhook retries | `UNIQUE INDEX` on `external_id` + `ON CONFLICT DO NOTHING` |
| Race condition: UI send vs webhook echo | Webhook skips all `outbound` events; UI owns outbound rows |
| Realtime subscription memory leaks | `useEffect` cleanup calls `removeChannel` on unmount + customer switch |
| Phone normalisation mismatch | Shared `normalisePhone()` utility, DB stores canonical form only |
| 24h clock drift | Window status derived from DB `created_at` (server time), never client clock |
| Blue Plate lookup downtime | Save without coords + warning; agent not blocked |
| Template variable mismatch | Templates with >2 variables hidden as unsupported |
| RTL delivery tick layout flip | Ticks in separate `flex` row below text bubble |
| Cold start send latency | Send button shows spinner + disabled state; no double-send possible |
| WATI rate limits | 429 handled gracefully, toast shown, no crash |
| Security through obscurity | Edge function checks `contact_centre.view` permission on every call |

---

## Phase 2 Deferred

- Whapi integration (personal WhatsApp, reactions, reply-to)
- Task Queue (`contact_center_tasks` table + task cards)
- Agent Resources + Q&A panel
- Teams tab in chat list
- 3CX dialer
- Message lightbox (images/video full-screen viewer)
- Delivery status for Whapi messages
