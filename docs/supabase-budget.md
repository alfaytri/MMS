# Supabase Budget — Mandatory Reference

Read this before adding any Supabase Realtime channel, polling hook, or list query. It exists because the project hit the Free-plan quota twice in 2026-05 / 2026-06; the rules below are the lessons from those incidents.

## The monthly cap (Free plan)

| Resource | Cap | Where to check |
|---|---|---|
| Realtime messages | **2,000,000 / month** | https://supabase.com/dashboard/project/wkmvjxxmzstsvahuiwsz/usage |
| Egress | **5 GB / month** | same dashboard |
| Database size | 0.5 GB | same dashboard |
| Storage size | 1 GB | same dashboard |
| Realtime peak concurrent connections | 200 | same dashboard |

Current month's baseline + remediation progress live in `PROGRESS.md` under `## 🔋 Quota Watch`. Always check it before opening a PR that touches realtime or polling.

---

## Pillar 1 — Realtime channels

**Default: `event: 'INSERT'` with a `filter`.** Subscribing to `'*'` means UPDATE and DELETE events fire too — and delivery-status flips alone on `chat_messages` (sending → sent → delivered → read) multiply your message count by ~4× per real chat message.

### When `event: '*'` is justified

Only when the local cache (Dexie, TanStack Query) needs to react to UPDATEs in real time AND polling on focus is not acceptable. The project's `cc-sync` and `useLiveThread` channels qualify because the V2 sidebar reads from Dexie and breaks visually without UPDATE propagation (see commit `b170bd7` revert on 2026-06-14). If you're unsure, default to INSERT.

### When you don't need a channel at all

If the data updates more than once a minute and the screen is rarely open, **poll on visibility instead of subscribing**. A 30 s poll on a non-realtime screen costs zero realtime messages.

### Required for every channel

- A `filter:` clause limiting rows (`conversation_id=eq.${id}`, never bare table subscribe)
- Cleanup via `supabase.removeChannel(channel)` in the effect's return value
- Document the channel name and table in a one-line comment

### Example — good

```ts
const channel = supabase
  .channel(`thread-${conversationId}`)
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'chat_messages',
      filter: `conversation_id=eq.${conversationId}` },
    (payload) => { /* ... */ })
  .subscribe()
return () => { supabase.removeChannel(channel) }
```

### Example — bad

```ts
supabase.channel('all-messages')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'chat_messages' },  // no filter, all events
    (payload) => { /* ... */ })
  .subscribe()
// No cleanup — channel leaks on unmount
```

---

## Pillar 2 — Polling

The realtime WebSocket is the **primary** delivery channel. Polling is a **safety net** for missed events. Polls should be infrequent and paused when nobody is watching.

### Defaults

| Data type | Interval | Visibility-gated? |
|---|---|---|
| Chat-like (messages, calls) | 5–10 s | **Yes — required** |
| Human-paced (orders, calendar, dashboard) | 60 s | Yes |
| Master data (employees, services, inventory) | Don't poll — use TanStack staleTime | n/a |

### Rules

- **Always pause when `document.hidden`.** The agent isn't watching; you're burning quota for nothing. Add `if (document.hidden) return` at the top of the poll function.
- **Always trigger an immediate poll on `visibilitychange` focus.** This avoids the user waiting up to N seconds for the next scheduled tick.
- **Never poll faster than 5 s** without a documented justification in a comment.
- **Use recursive `setTimeout`, not `setInterval`**, when each poll has variable latency (fetch). Prevents overlapping in-flight requests.
- **For self-rescheduling polls, scope `alive` and `timeoutId` to `let` variables inside the effect — not `useRef`.** A shared ref leaks zombie pollers across unmount/remount cycles (see `useLivePolledInboundCalls` zombie-poller bug, fix in commit `663cded`).

### Example — good

```ts
useEffect(() => {
  let alive = true
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  async function poll() {
    if (!alive) return
    if (document.hidden) { timeoutId = setTimeout(poll, 5000); return }
    try { /* fetch */ }
    finally { if (alive) timeoutId = setTimeout(poll, 5000) }
  }

  poll()
  function handleVisibility() { if (!document.hidden && alive) { poll() } }
  document.addEventListener('visibilitychange', handleVisibility)

  return () => {
    alive = false
    if (timeoutId) clearTimeout(timeoutId)
    document.removeEventListener('visibilitychange', handleVisibility)
  }
}, [])
```

### Example — bad

```ts
useEffect(() => {
  const id = setInterval(() => fetch('/api/heavy-thing'), 2_000)  // 2 s, always-on
  return () => clearInterval(id)
}, [])
```

---

## Pillar 3 — Queries

### Rules

- **Always add `.limit(N)` to list queries.** Even on tables that "shouldn't grow" — that assumption breaks the day someone bulk-imports old data.
- **Prefer explicit columns over `select('*')` on list reads.** Wildcard pulls every column including JSONB blobs, audit timestamps, and soft-delete metadata you don't render.
- **`select('*')` is acceptable on `.insert().select('*').single()` and `.update().select('*').single()`** — fetching back one row that was just written has a known cost.
- **Avoid `select('*')` inside loops or per-row hover-card fetches.** Those compound.

### Defaults for list limits

| Table type | Suggested `.limit()` |
|---|---|
| Master data (employees, services, products) | 1000–2000 |
| Transactional list (orders, invoices) | 200 — paginate via offset |
| History / log tables | 100–200 |
| Versioning (po_versions) | 100 |

### Example — good

```ts
const { data } = await supabase
  .from('employees')
  .select('id, name, phone, status, role_id')
  .is('deleted_at', null)
  .order('name')
  .limit(2000)
```

### Example — bad

```ts
const { data } = await supabase
  .from('employees')
  .select('*')           // pulls every column
  .order('name')         // no .limit — could be 10k+ rows after a few years
```

---

## Where to look when quota spikes

1. Open the Usage dashboard (link above). Note which metric is over: Realtime, Egress, or both.
2. Open browser DevTools → Network on the contact-centre while signed in. If you see ≥1 Supabase request/second sustained, find the offending hook with `setInterval` or `setTimeout` and check its interval.
3. Open DevTools → Console and filter by `[poll:` — Phase 1 added debug logging hooks; if any are still present they will reveal the cadence.
4. Search the codebase: `grep -r "setInterval\|refetchInterval\|\.channel(" src/`. Audit each one against the rules above.
5. Check `PROGRESS.md` Quota Watch for the most recent baseline and recent remediation commits.

---

## Required reading for AI agents

If you are an AI agent (Claude, Codex, Copilot, etc.) editing this codebase, you **must** check this doc against your proposed change BEFORE writing code in these patterns:
- `.channel(` — adding a realtime subscription
- `setInterval` / `setTimeout` / `refetchInterval` — adding a poll
- `.select(` — adding a query that reads more than one row

A check is a 30-second skim of the relevant pillar. Skipping the check is how the project hit the cap twice.
