# Contact Centre Phase 2 — Scope Notes
**Saved:** 2026-05-11  
**Context:** Phase 1 spec written at `docs/superpowers/specs/2026-05-11-contact-centre-phase1-design.md`  
**Branch:** `feature/crm-sidebar-wati` (Phase 1), new branch for Phase 2

---

## What Phase 2 Builds

Everything deferred from Phase 1. Phase 1 must be merged and stable before starting Phase 2.

---

### 1. Whapi Integration (Personal WhatsApp)

Provider for personal WhatsApp numbers (free-form chat, no 24h window restriction).

**Edge functions needed:**
- `supabase/functions/api-whapi/index.ts` — outbound actions:
  - `send_text` → `POST /messages/text { to, body, quoted? }`
  - `send_media` → `POST /messages/{image|video|document}`
  - `send_reaction` → `PUT /messages/{messageId}/reaction { emoji }` (Whapi supports agent reactions; WATI does not)
- `supabase/functions/webhook-whapi/index.ts` — inbound events, same pipeline shape as webhook-wati but `source: 'whatsapp'`, `external_id: whapi_{id}`

**Secrets:** `WHAPI_API_TOKEN` → `https://gate.whapi.cloud`

**Channel selector in ChatInputBar:** Phase 1 only shows `WA API` (WATI). Phase 2 adds `WhatsApp` (Whapi) as a selectable channel. Source stored on `chat_messages.source`.

---

### 2. Reactions

Three reaction flows:

**A. Agent → Whapi only**
- UI: hover a message → reaction button → emoji popover (👍❤️😂😮🙏👎)
- Disabled/toast for `whatsapp_api` source (WATI doesn't support agent reactions via API)
- Calls `api-whapi` `send_reaction` action
- Whapi echoes back via webhook → webhook inserts the reaction row (single source of truth)

**B. Customer reacts → Whapi → webhook-whapi**
- `type: "reaction"` or `type: "action", action.type: "reaction"`
- Empty emoji = removal → delete row by `reaction_to_external_id`
- Non-empty = insert `chat_messages` row with `reaction_to_external_id`, `reaction_emoji`, `from_type: 'customer'`

**C. Customer reacts → WATI → webhook-wati**
- `messageType === "reaction"` or `eventType` contains `reaction`
- Same insert/delete shape, `source: 'whatsapp_api'`, `external_id: wati_reaction_{id}_{ts}`
- Looks up original message via `call_metadata->>'whatsappMessageId'` OR `external_id = wati_{targetId}`

**DB columns needed (add in Phase 2 migration):**
```sql
ALTER TABLE chat_messages
  ADD COLUMN reaction_to_external_id TEXT,
  ADD COLUMN reaction_emoji TEXT;
```

**UI rendering:** Reactions are standalone `chat_messages` rows joined by `reaction_to_external_id`. The thread loader aggregates them as `reactions: ChatReaction[]` on the parent message and renders emoji pills below the bubble with counts.

---

### 3. Reply-to (Whapi only)

- Hover message → Reply button → sets `replyTo` state
- ChatInputBar shows quoted preview bar with close button
- On send: passes `quoted` message ID to `api-whapi` `send_text`
- WATI does not support reply quoting via API — button hidden for `whatsapp_api` messages

---

### 4. Task Queue

**New table:**
```sql
CREATE TABLE contact_center_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'cancel_request','reschedule_request','follow_up_work','customer_unavailable'
  )),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','dismissed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ
);
```

**Task card UI (TaskQueuePanel.tsx):**
- Type icon + label + creation time
- Customer name + order display ID + scheduled date
- Notes (2-line clamp)
- Actions: Resolve / Dismiss / Open Order
- All transitions logged to `activity_log`

**Embedded in Chat List:** `Tasks` tab (4th tab, deferred from Phase 1). Polls every 30s.

**Task type colours:**
| Type | Icon | Colour |
|---|---|---|
| `cancel_request` | XCircle | destructive |
| `reschedule_request` | CalendarClock | primary |
| `follow_up_work` | Wrench | warning |
| `customer_unavailable` | UserX | destructive |

---

### 5. Agent Resources + Q&A Panel

**New tables:**
```sql
CREATE TABLE agent_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL, -- 'file' | 'link'
  file_url TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_qa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_en TEXT NOT NULL,
  question_ar TEXT,
  answer_en TEXT NOT NULL,
  answer_ar TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**AgentResourcePanel.tsx** — Sheet (left side, `w-[360px]`), opened via 📖 button in ChatInputBar.

Two tabs:
- **Resources** — preview (opens URL) + "Send to customer" (queues as chat attachment)
- **Q&A** — "Use EN" / "Use AR" buttons → inserts answer text into chat input

Both tabs: unified search by title/question/answer/category. Category badges.

---

### 6. Teams Tab

`chat_conversations WHERE conversation_type = 'team'` — team WhatsApp conversations from team phone numbers.

Deferred because it requires `phone_lines_3cx` setup and team number routing which is part of 3CX scope.

---

### 7. Message Lightbox

Full-screen media viewer for images/video/PDF in the chat thread.

- Images/video: inline lightbox dialog with download button
- PDF: embedded viewer or open-in-new-tab
- Whapi media URLs resolved via `resolveWhapiMediaUrl()` helper (Whapi media requires auth token to fetch)

---

### 8. 3CX Dialer (separate future phase)

Explicitly excluded from Phase 1 and Phase 2. Will be its own phase when client is ready.

Components when built: `DialerSection.tsx`, `use3cx.ts`, `use3cxCallPoller.ts`, `use3cxWebSocket.ts`, `useCurrentUserExtension.ts`, `usePhoneLines.ts`, `active_agent_calls` table, `cx_call_journal` table.

---

## Key Architectural Notes for Phase 2 Builder

- **Both webhooks normalise to the same DB tables** — `chat_messages` with `source` discriminator (`whatsapp` vs `whatsapp_api`) and `external_id` prefix (`whapi_` vs `wati_`). The thread renderer is source-agnostic.
- **Reactions are not stored on the parent message** — they are standalone `chat_messages` rows linked by `reaction_to_external_id`. The loader aggregates them.
- **`whatsappMessageId` in `call_metadata`** — outbound WATI messages store the WATI message ID in `call_metadata->>'whatsappMessageId'` so the webhook can look up the parent when a customer reacts to an agent message.
- **Whapi `external_id` prefix:** `whapi_{id}` — never overlap with WATI's `wati_{id}`.
- **Phase 1 `reply_to_external_id` column** was added to `chat_messages` in Phase 1 migration — no schema change needed in Phase 2 for reply-to.
