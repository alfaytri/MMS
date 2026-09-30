# Contact Centre (WhatsApp) — Chatbox Analysis & Issue Backlog

**Date:** 2026-09-30 · **Branch:** `full-build/admin-misc` (whole-app) · **Status:** review / backlog — fixes to follow after the current warehouse-shipping work.

---

## What it is (the model)

It is **not** a direct/personal WhatsApp connection. It is the **WhatsApp Business Platform (Cloud API) accessed through WATI as the provider (BSP)** — REST endpoints (`sendSessionMessage`, `sendTemplateMessage`, `getMessages`, `getMessageTemplates`, `sendReaction`) + a webhook. WATI owns the WhatsApp Business account and the number.

- **One shared business number + one API token** — not WhatsApp Web, not a linked phone, not per-agent numbers. Customers always see one business identity; which agent replied is tracked only inside the app (`agent_name`, `sent_by_profile_id`).
- **Meta's 24-hour session window is modelled correctly** (`useWhatsAppWindow.ts`): free-text is allowed only within 24h of the customer's last message; outside the window the composer disables typing and requires a **template**. In-window → `sendSessionMessage`; out-of-window → `sendTemplateMessage`.
- Internal **team chats use a second provider (WHAPI)** in the same inbox (unofficial channel), classified by `conversation_type='team'`.

### Architecture in brief
- **Inbound:** WATI → `POST /api/wati/webhook?secret=…` → find/create `chat_conversations` → insert `chat_messages` via `cc_dedup_insert_message` RPC → an `AFTER` trigger (`cc_broadcast_message`, migration `20261058`) emits `cc:inbox` + `thread:{id}` broadcasts → the client `SyncWorker` buffers into Dexie/IndexedDB → the V2 UI renders from Dexie.
- **Outbound (local-first):** the UI writes an optimistic Dexie row + a `pendingWrite`, and the `SyncWorker` drains the queue (every 1s) → thin Next.js routes `/api/wati/{send-session,send-template,send-file}` proxy to WATI (these exist specifically to bypass the `api-wati` edge function, which 403s on user JWTs).
- **Realtime:** Broadcast-from-DB with scoped topics + RLS on `realtime.messages` (`_auth_has_cc_access()`), replacing an earlier unfiltered `postgres_changes` firehose. **This is the strongest part of the system.**

---

## Issue backlog (by priority)

### 🔴 Broken / likely-broken
| # | Issue | Evidence |
|---|-------|----------|
| 1 | **Reactions likely broken** — `SyncWorker.sendReaction` still calls `supabase.functions.invoke('api-wati', {action:'send_reaction'})`, the edge function that 403s on user JWTs (the reason all other sends were moved local). A local `/api/wati/send-reaction` route exists but is **not wired** to the worker. | `sync-worker.ts` (sendReaction); `api/wati/send-reaction/route.ts` unused |
| 2 | **12 failing tests** on the two most critical components. `sync-worker.test.ts` 5/13 fail (drain/retry/terminal-failure race with `start()`'s internal drain + one stale test still asserting `api-wati`); `ChatListV2.{filtering,search}.test.tsx` 7/7 fail ("No QueryClient set" — `useFollowUpRequests` added, tests lack a `QueryClientProvider`). Mostly stale, but the outbound backbone + chat list have **no green coverage**. | `src/lib/contact-center/local/__tests__/`, `src/components/contact-center/v2/__tests__/` |
| 3 | **Retry backoff is dead code** — `RETRY_BACKOFF_MS = [1s,2s,5s,15s,60s]` is defined but never referenced; a transient failure is requeued to `status:'queued'` and retried on the next 1s tick → effectively **no backoff**. | `sync-worker.ts` |

### 🟠 Reliability
| # | Issue | Evidence |
|---|-------|----------|
| 4 | **Browser-only outbox** — `pendingWrites` live only in the sending agent's per-device IndexedDB. If that tab closes with queued/in-flight writes, nothing drains them until that same user reopens on that same device. No server-side outbox. | `pending-writes.ts`, `db.ts` |
| 5 | **File sends lost on reload** — the `File` blob lives only in an in-memory `fileMap`; a reload strands it → terminal "file lost — re-upload required". | `sync-worker.ts` (`fileMap`) |
| 6 | **No assignment/locking** — presence shows "who's viewing" badges but nothing prevents two agents replying to the same customer simultaneously. (The monitoring screen that surfaced handling was just removed.) | `useCCPresence.ts` |
| 7 | **Fragile heuristic dedup** — WATI emits inconsistent IDs per firing, so correctness leans on text+time-window guesses in 3 places (webhook, `cc_dedup_insert_message`, `fetch-messages`). Can merge two identical customer messages (±5min), put a delivered/read tick on the wrong bubble ("strategy-4" claims oldest still-`sent`), or attach a reaction to the wrong message. Ordering uses client clock for optimistic rows → skew reorders bubbles until a poll re-sorts. | `webhook/route.ts`, `fetch-messages/route.ts`, `cc_dedup_insert_message` |
| 8 | **Inbound customer media not persisted** — agent files go to Supabase Storage, but inbound media stays on WATI and is re-fetched every view via `/api/wati/media`. If WATI purges media / token changes, historical media 404s; every view = server egress. | `api/wati/media`, webhook media handling |

### 🟡 Scalability ceilings
| # | Issue | Evidence |
|---|-------|----------|
| 9 | **Single WATI number + token** — all inbound + all agents' outbound funnel through one number; Meta's per-24h business-initiated caps + quality rating are **shared company-wide**. No per-agent isolation. | `WATI_API_URL` / `WATI_API_TOKEN` (single) |
| 10 | **Polling amplification on top of realtime** — per open thread each agent polls the DB (10s) and WATI (15s dev / 30s prod), reloads the list (20s), runs a 5-min full `sync-contacts` scan, and pulls 30 days of history on open. Scales O(agents × open-threads). | `useLiveThread.ts`, `useLiveConversations.ts`, `useContactCenterState.ts` |
| 11 | **`cc:inbox` ping wakes all agents** — every inbound customer message pings every CC agent; each runs a 200-row `chat_conversations` query + a chime. | `sync-worker.ts` (`onInboundPing`) |

### 🟢 Templates (working — polish)
| # | Issue | Evidence |
|---|-------|----------|
| 12 | **250-template cap** — `getMessageTemplates?pageSize=250&pageNumber=0`, single page, no pagination; extra templates silently dropped. | `api/wati/templates/route.ts` |
| 13 | **No required-variable validation** — empty inputs sent as blank values (`vars[i] ?? ''`). | `ChatTemplateConfirmDialog`, `sendTemplateLocal` |
| 14 | Header-media URL is unvalidated free-text; WHAPI has no template UI; **two parallel template-send paths** (`sendTemplate` direct vs `sendTemplateLocal` queue) duplicate param-building logic. | `useChatMessages.ts`, `ComposerV2` |

### Single points of failure (context)
The one WATI number/token; the webhook endpoint (if unreachable, inbound falls back to 30s polling); realtime private-channel auth priming (`primeRealtimeAuth`, best-effort — silent degrade to polling on failure); the `api-wati` edge function (still the sole path for reactions + `set_status`).

---

## What's genuinely good (keep)
- The **Broadcast-from-DB** realtime redesign (scoped `thread:{id}` / `cc:inbox` topics + RLS) — correct and scalable.
- Atomic cross-tab claim (`claimForFlight`) prevents duplicate sends across tabs sharing one IndexedDB.
- "Push to Supabase **before** WATI" so the inbound echo dedups onto the existing row rather than duplicating.
- Correct 24h-window modelling and the media proxy's open-proxy path allow-list.

---

## Recommended fix order
1. **Fix/refresh the 12 tests** (send-queue + chat list coverage): add a `QueryClientProvider` for `ChatListV2`; update the file-send test to `/api/wati/send-file`; decouple drain tests from `start()`'s internal drain.
2. **Reactions:** point `SyncWorker.sendReaction` at the local `/api/wati/send-reaction` route.
3. **Wire up `RETRY_BACKOFF_MS`** so transient failures actually back off.
4. **Persist queued file blobs** (IndexedDB) + consider a server-side outbox for sends that must not be lost.
5. **Add assignment/locking** (or restore a monitoring reader) to prevent double-handling on the shared number.

*(Scalability items 9–11 and media persistence #8 are larger and can be scheduled once the reliability items above land.)*
