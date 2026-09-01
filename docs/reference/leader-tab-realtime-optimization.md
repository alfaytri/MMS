# Leader Tab Realtime Optimization — Future Idea

**Status:** Idea / backlog — do not implement yet. Revisit only when triggers below are hit.
**Captured:** 2026-06-16
**Context:** Discussed during Phase 1+2 quota remediation review. Project will move to Supabase Pro before onboarding 30+ users; this doc captures a deeper optimization to consider afterward.

---

## The idea

Only ONE tab per user holds the realtime subscriptions and polls. Other tabs from the same user become "followers" that read state from shared storage (Dexie) and listen to a `BroadcastChannel` for updates.

**At 30 users × ~2 tabs avg → 60 connections drops to ~30. Realtime msgs drop ~50%. Concurrent connection ceiling pressure drops ~50%.**

---

## How it works

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  Tab A      │         │  Tab B      │         │  Tab C      │
│  (LEADER)   │         │  (follower) │         │  (follower) │
│             │         │             │         │             │
│  WebSocket  │         │  Reads from │         │  Reads from │
│  Polls      │         │  Dexie      │         │  Dexie      │
│  Writes to  │ ──────► │  Listens to │         │  Listens to │
│  Dexie      │         │  Broadcast  │         │  Broadcast  │
│  Broadcasts │         │  Channel    │         │  Channel    │
└─────────────┘         └─────────────┘         └─────────────┘
       │
       │ if Tab A closes, Tab B or C wins the lock and becomes leader
       ▼
   navigator.locks.request('cc-leader', { mode: 'exclusive' }, ...)
```

### Primitives

| Primitive | Role |
|---|---|
| `navigator.locks.request('cc-leader', { mode: 'exclusive' })` | Leader election — only one tab can hold the lock at a time. Auto-releases on tab close. |
| `BroadcastChannel('cc-events')` | Leader fans out incoming WebSocket events to follower tabs in real time. |
| Dexie (already in project) | Followers read durable state from here. Leader writes. Already the canonical store in `sync-worker.ts`. |

---

## What you'd save

- **Realtime messages:** ~50% reduction (depends on how many users open multiple tabs in practice)
- **Concurrent connections:** ~50% reduction — this matters more than msg count once you approach Pro's 500-connection ceiling
- **Egress:** Smaller win — each tab still hydrates from Supabase on cold open, but live updates stop multiplying

---

## Where it bites (real costs)

### 1. Hidden-leader problem
Leader tab is in background, follower is the visible one. Leader's `document.hidden` polls slow down → follower sees stale data.

**Fix:** Leader does NOT gate on `document.hidden` directly. Instead, "is any tab visible" is broadcast across tabs — leader only slows down when ALL tabs are hidden.

### 2. Failover lag
Leader crashes or closes → 1–2 second gap before a follower wins the lock. Live updates stall during the window.

**Fix:** Acceptable in most contact-centre flows. For critical screens (active call ringing), the follower can fall back to its own short-lived subscription for ~5s during failover.

### 3. Refactor surface
Every hook with `.channel(` or polling has to become "if leader: subscribe; else: listen to BroadcastChannel". The hooks affected today:

- `useLiveThread` (chat messages)
- `useLivePolledInboundCalls` (3CX active calls)
- `cc-sync` worker (conversation sync)
- Any future realtime hook added before this refactor lands

Plus you need a shared "leader registry" hook (`useLeaderTab()`) that every realtime hook consults.

### 4. Debugging gets harder
Bugs reproduce differently depending on which tab is leader. "Works in Tab A but not Tab B" becomes a normal failure mode. Need DevTools indicator showing "I am leader" / "I am follower."

### 5. Cross-user assumption
Only deduplicates across tabs of the **same user on the same machine**. Doesn't help if one user opens the app on phone + laptop — those are still separate connections. (Acceptable — that's the boundary of `BroadcastChannel`.)

---

## When to revisit (triggers)

Build this ONLY when one of these fires:

- [ ] Concurrent connections approach 400 in practice (Pro ceiling is 500)
- [ ] Monthly Supabase overage cost crosses ~$30
- [ ] Specific user complaint about multi-tab sluggishness or "the second tab is slow"
- [ ] User count exceeds 75 and most users keep multiple tabs open

Until then, the complexity cost is not worth the saving. Pro plan headroom + Phase 1+2 remediation should cover 30–50 users comfortably.

---

## Cheaper interim wins (consider first)

If quota becomes a concern before the triggers above, try these in order:

### A. Heartbeat warning (1 hour of work)
Detect "this user has many tabs open" via `BroadcastChannel` heartbeat and show a small banner: "You have 4 tabs of MMS open. Closing extras saves resources." No architectural change.

### B. Aggressive hidden-tab throttling (2 hours of work)
When `document.hidden`, push polls to 30s+ instead of 5s. Already done for some hooks — audit and apply uniformly.

### C. `SharedWorker` for WebSocket only (1–2 days of work)
A `SharedWorker` is automatically shared across same-origin tabs. Move the WebSocket into one. Simpler than full leader election. **Catch:** Safari support for SharedWorker is unreliable; iPad users may fall back to per-tab connections.

### D. Full leader-tab election (5–7 days of work)
The pattern in this doc. Reserved for when interim wins aren't enough.

---

## Reference implementation sketch

```ts
// hooks/useLeaderTab.ts
import { useEffect, useState } from 'react'

export function useLeaderTab(channelName = 'cc-leader') {
  const [isLeader, setIsLeader] = useState(false)

  useEffect(() => {
    if (!('locks' in navigator)) {
      // No Web Locks API — fall back to every-tab-is-its-own-leader
      setIsLeader(true)
      return
    }

    const controller = new AbortController()
    let releaseLock: (() => void) | null = null

    navigator.locks.request(
      channelName,
      { mode: 'exclusive', signal: controller.signal },
      () => new Promise<void>((resolve) => {
        setIsLeader(true)
        releaseLock = () => { setIsLeader(false); resolve() }
      })
    ).catch(() => {
      // Aborted — not the leader, stay follower
      setIsLeader(false)
    })

    return () => {
      controller.abort()
      if (releaseLock) releaseLock()
    }
  }, [channelName])

  return isLeader
}
```

```ts
// Inside useLiveThread.ts — pseudocode
const isLeader = useLeaderTab()
const bc = useBroadcastChannel('cc-events')

useEffect(() => {
  if (isLeader) {
    // Real subscription — leader pays the realtime cost
    const channel = supabase.channel(...).on('postgres_changes', ..., (payload) => {
      writeToDexie(payload.new)
      bc.postMessage({ type: 'message:new', row: payload.new })
    }).subscribe()
    return () => supabase.removeChannel(channel)
  } else {
    // Follower — listen for the leader's broadcasts
    const handler = (e: MessageEvent) => {
      if (e.data.type === 'message:new') writeToDexie(e.data.row)
    }
    bc.addEventListener('message', handler)
    return () => bc.removeEventListener('message', handler)
  }
}, [isLeader])
```

---

## Related

- `docs/supabase-budget.md` — current rules + Free-plan caps
- `PROGRESS.md` → `## 🔋 Quota Watch` — month-by-month usage tracking
- `src/lib/sync/sync-worker.ts` — existing Dexie sync layer that this pattern would build on
- Memory: `project_supabase_quota.md` — incident history
