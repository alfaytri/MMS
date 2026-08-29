# Contact Centre Rework — Complete Overview

> Plain-English walkthrough of the four-plan Contact Centre v2 redesign. For implementation details, see the individual plan files in `docs/superpowers/plans/`.

---

## The Big Picture

The company handles customer communication through three channels: **WhatsApp (via two providers — WATI and WHAPI)** and **phone calls (via 3CX)**. Previously, each channel lived in its own silo. The rework merges everything into **one conversation per customer** — every WhatsApp message and every phone call appears in a single, chronological timeline.

---

## Plan 1: The Foundation (Database + Media Pipeline)

**Problem:** When a customer sends a photo or voice note via WhatsApp, the webhook downloads it right then and there — blocking the response. If the file is large or the provider is slow, the webhook times out. Also, media files live on the provider's servers (WATI/WHAPI), which means if you stop using that provider, all your media links die.

**Solution:** The webhook now just saves the message and says "I'll download that file later" — it returns in under 100ms. A background worker runs every minute, picks up pending downloads, compresses images (shrinks them to max 1600px, converts to JPEG), and stores everything in a private Supabase Storage bucket that the company owns forever.

**How agents see media:** When an agent views an attachment, the request goes through a permission-checking proxy. The proxy confirms the agent has Contact Centre access, then either redirects to the stored file (if it's been archived) or streams it live from the provider (if the worker hasn't gotten to it yet). No one can access chat media without the right permission — not even with a direct URL.

**New database tables:**

- Every customer gets **one conversation row** (not one per phone number or provider)
- Messages gain soft-delete fields so they can be "deleted" without actually disappearing yet
- A job queue tracks which media files still need downloading
- A call records table stores phone call metadata (duration, recording URL, who answered)

**Key files:**

| What | Where |
|---|---|
| Schema migrations | `supabase/migrations/20260608120*` |
| Image compression | `src/lib/media/compress.ts` |
| Provider media fetch | `src/lib/media/provider-fetch.ts` |
| Background media worker | `src/app/api/internal/media-worker/tick/route.ts` |
| Permission-gated media proxy | `src/app/api/chat-media/[messageId]/[idx]/route.ts` |
| Attachment URL resolver | `src/lib/contact-center/attachment-url.ts` |

---

## Plan 2: The New UI

**Problem:** The current sidebar starts below the top navigation bar (wasting vertical space), shows each WhatsApp provider's messages separately, and auto-switches the reply provider when a new message arrives — which interrupts agents mid-sentence.

**Solution:**

### Sidebar from the very top

The sidebar now runs from pixel zero to the bottom of the screen. The top navigation bar shifts right to make room, giving the chat area more vertical space.

### Accordion sections

Customer info, phone numbers, addresses, products, and orders are each inside collapsible sections. Agents can collapse what they don't need. The open/closed state remembers itself across page reloads.

### Unified timeline

Instead of separate WATI and WHAPI message lists, there's one chronological thread. When the source changes between messages (e.g., the customer switched from WATI to WHAPI, or a phone call happened), a small divider line appears: `─── chat (WHAPI · ••5504) ───`. If the customer has multiple phone numbers, each message shows the last 4 digits so the agent knows which number it came from.

### Smart provider switching

When a customer replies via a different WhatsApp provider than the one the agent is currently typing on:

- If the agent's composer is **empty and unfocused** → the system silently switches to match the customer
- If the agent is **mid-sentence** → a small yellow banner appears saying "Customer replied via WHAPI — switch?" with a one-click button. It auto-dismisses after 30 seconds. No more losing typed messages.

### Address strip

Addresses display as horizontal cards you can scroll through with arrow buttons (on desktop) or swipe (on mobile). No more vertical list eating up the sidebar. Cards are draggable for the order-creation flow.

### Feature flag

All of this is behind a per-user flag (`contact_centre_v2`). Only users with the flag see the new UI; everyone else keeps the old one. This lets you roll out gradually.

**Key files:**

| What | Where |
|---|---|
| Feature flag hook | `src/hooks/contact-center/useFeatureFlag.ts` |
| v1/v2 gate | `src/components/contact-center/ContactCenterSidebarGate.tsx` |
| v2 sidebar shell | `src/components/contact-center/v2/ContactCenterSidebarV2.tsx` |
| Accordion wrapper | `src/components/contact-center/v2/SectionAccordion.tsx` |
| Customer card | `src/components/contact-center/v2/CustomerCardV2.tsx` |
| Address strip | `src/components/contact-center/v2/AddressStrip.tsx` |
| Unified thread | `src/components/contact-center/v2/UnifiedThread.tsx` |
| Source dividers | `src/components/contact-center/v2/SourceDivider.tsx` |
| Provider suggest banner | `src/components/contact-center/v2/ProviderSuggestBanner.tsx` |
| Composer | `src/components/contact-center/v2/ComposerV2.tsx` |

---

## Plan 3: Phone Calls (3CX Integration)

**Problem:** Phone calls aren't tracked in the Contact Centre at all. Agents have to mentally remember "I called this customer 10 minutes ago." There's no recording playback, no call history, no visibility for supervisors.

**How it works:**

1. **3CX sends a webhook** every time a call event happens — phone rings, someone picks up, call ends. All events go to one URL with a shared secret for security.

2. **The system identifies the caller.** It looks up the phone number in the customer database. If it finds a match, the call appears in that customer's unified timeline. If the number is unknown, a new "unknown caller" conversation is created — an agent can later link it to a real customer.

3. **Live calls show in the timeline.** When a call is ringing or in progress, a green pulsing dot appears with a live duration counter (0:00, 0:01, 0:02...). Agents on the Contact Centre can see that a colleague is currently on a call with this customer.

4. **When the call ends**, the system records whether it was answered or missed, inbound or outbound, who the agent was, and the duration. If 3CX recorded the call, the MP3 is downloaded by the same background worker from Plan 1, compressed, and stored permanently.

5. **Recordings are playable inline.** The ended call bubble shows a standard audio player right in the chat timeline — agents can listen to past calls without leaving the Contact Centre.

**Key files:**

| What | Where |
|---|---|
| Event normaliser | `src/lib/3cx/normalise-event.ts` |
| Customer resolver | `src/lib/3cx/resolve-customer.ts` |
| Agent extension map | `src/lib/3cx/extension-map.ts` |
| Webhook route | `src/app/api/3cx/webhook/event/route.ts` |
| Call event bubble (UI) | `src/components/contact-center/v2/CallEventBubble.tsx` |
| Recording auth in provider-fetch | `src/lib/media/provider-fetch.ts` |

**Environment variables required:**

| Variable | Purpose |
|---|---|
| `THREECX_WEBHOOK_SECRET` | Validates incoming 3CX webhooks |
| `THREECX_FQDN` | 3CX server hostname |
| `THREECX_RECORDING_AUTH` | `none`, `basic`, or `bearer` |
| `THREECX_RECORDING_USER` / `_PASS` | For basic auth mode |
| `THREECX_CLIENT_ID` / `_CLIENT_SECRET` | For bearer/OAuth mode |

---

## Plan 4: Admin Purge Page

**Problem:** Over time, chat history accumulates. There's no way for an admin to clean up old messages, and media files pile up in storage costing money.

**How it works:**

1. **An admin with the `contact_centre.admin.purge` permission** visits `/admin/contact-centre/purge`.

2. **They set filters:** date range (required), optionally restrict to specific sources (WATI only, 3CX only, etc.), and optionally limit to messages with attachments (to free storage space).

3. **They click Preview** — the system counts how many messages match and how much storage they occupy. Nothing is deleted yet.

4. **To proceed, they must type an exact phrase:** `DELETE messages from 2025-01-01 to 2025-06-30`. Not copy-paste — the phrase must match byte-for-byte. This prevents accidental mass deletion.

5. **Soft delete:** Messages are marked as deleted (with a timestamp and who did it) but not actually removed. They disappear from the agent-facing timeline immediately.

6. **7-day restore window:** The admin can see all past purge batches in a history list. Each batch shows its date range, message count, and storage size. A "Restore" button un-deletes the entire batch — as long as it's within 7 days.

7. **Nightly hard delete:** Every night at 3:00 AM, a cron job finds batches older than 7 days. It permanently deletes the database rows AND removes the associated media files from Supabase Storage. After this, restoration is impossible.

**Key files:**

| What | Where |
|---|---|
| Purge filter builder | `src/lib/contact-center/purge-filter.ts` |
| Confirmation phrase helper | `src/lib/contact-center/confirm-phrase.ts` |
| Preview route | `src/app/api/admin/contact-centre/purge/preview/route.ts` |
| Purge (soft-delete) route | `src/app/api/admin/contact-centre/purge/route.ts` |
| Restore route | `src/app/api/admin/contact-centre/purge/restore/route.ts` |
| History route | `src/app/api/admin/contact-centre/purge/history/route.ts` |
| Nightly sweep route | `src/app/api/admin/contact-centre/purge/sweep/route.ts` |
| Admin UI page | `src/app/(dashboard)/admin/contact-centre/purge/page.tsx` |
| Cron config | `vercel.json` |

---

## How It All Connects

```
Customer sends WhatsApp message
  → Webhook saves message + enqueues media download
  → Background worker archives media to private storage
  → Agent sees message in unified timeline (with inline media)

Customer calls via 3CX
  → 3CX webhook fires → system identifies caller
  → Live call appears in timeline with green ticker
  → Call ends → recording archived by same media worker
  → Agent can play recording inline

Admin wants to clean up old data
  → Filters by date/source → previews count
  → Types confirmation phrase → soft-delete
  → 7 days to undo → nightly sweep permanently removes
```

The four plans are layered: Plan 1 builds the database and media infrastructure that everything else depends on. Plan 2 builds the UI on top. Plan 3 adds phone calls using the same infrastructure. Plan 4 adds the admin cleanup tool. Each plan works independently once its dependencies are in place.

---

## Security Model

| Layer | Mechanism |
|---|---|
| Chat media access | Private Supabase bucket — no direct URL access. All reads go through `/api/chat-media` which checks `contact_centre.view` permission |
| Webhook routes | Bypass session auth (providers can't send cookies) but validate their own secrets (WATI token, WHAPI token, 3CX `?secret=` param, `CRON_SECRET` header) |
| Purge operations | Gated by `contact_centre.admin.purge` permission + typed confirmation phrase |
| Database tables | RLS enabled on all new tables. `purge_batches` readable only by purge admins. `media_download_jobs` accessible only by service role. `call_records` readable by all authenticated users |
| Feature flag | Per-user `profiles.feature_flags[]` array — UI changes are invisible to non-flagged users |
