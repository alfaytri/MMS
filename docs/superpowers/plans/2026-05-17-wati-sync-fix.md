# Wati Sync Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "only 10 chats show" bug, replace two sync buttons with one, add silent 5-minute background auto-sync, and debounce the realtime list handler so burst upserts don't flicker the UI.

**Architecture:** The root bug is `RECENT_MAX_PAGES = 15` — Wati sorts contacts by name so scanning only 1,500 of 13,000+ contacts misses most active-today entries. The fix removes that page cap from the default mode (keeping a 2-day date filter), so all pages are scanned but only recent contacts are kept. A `setInterval` in `useContactCenterState` drives the background sync silently. The realtime handler in `useLiveConversations` is debounced so a burst of 25 upserts produces one DB query, not 25.

**Tech Stack:** Next.js 15 App Router, React hooks, Supabase realtime, SSE streaming

---

## File Map

| File | Change |
|------|--------|
| `src/app/api/wati/sync-contacts/route.ts` | Remove `RECENT_MAX_PAGES` cap; default mode now scans all pages with 2-day filter |
| `src/hooks/contact-center/useLiveConversations.ts` | Debounce `load()` on realtime events |
| `src/hooks/contact-center/useContactCenterState.ts` | Add 5-minute silent background sync interval |
| `src/components/contact-center/ChatListView.tsx` | Replace dropdown with single Sync button |

---

## Task 1: Fix sync-contacts — remove page cap from default mode

**Files:**
- Modify: `src/app/api/wati/sync-contacts/route.ts`

**What and why:** `RECENT_MAX_PAGES = 15` caps the scan at 1,500 contacts. Wati sorts by name not date, so recently-active contacts are distributed across all 130+ pages. Remove the cap for the default (no `?mode` param) so it scans every page but still filters to contacts active in the last 2 days. `?mode=full` stays unchanged (scans all, no date filter).

- [ ] **Step 1: Edit `sync-contacts/route.ts`**

  Replace the entire block of constants at the top (lines 9–13) and the `maxPages` line inside the `while` loop:

  Remove these lines:
  ```typescript
  // Recent mode: scan up to this many pages (100 contacts each) regardless of sort order.
  // Wati sorts /getContacts by name, not by date, so date-based early cutoff is unreliable.
  const RECENT_MAX_PAGES = 15
  const RECENT_DAYS = 3
  const PAGE_SIZE   = 100
  ```

  Replace with:
  ```typescript
  // Default (recent) mode: scan ALL pages but keep only contacts active in the last
  // RECENT_DAYS days. Wati sorts by name, not date, so a page cap would miss contacts
  // whose names fall later in the alphabet.
  const RECENT_DAYS = 2
  const PAGE_SIZE   = 100
  ```

  Then find this line inside the async IIFE:
  ```typescript
  const maxPages = full ? Infinity : RECENT_MAX_PAGES
  ```

  Replace with:
  ```typescript
  // Both modes now scan all pages; the difference is only the date filter applied
  // per-contact inside the loop.
  const maxPages = Infinity
  ```

  And update the `cutoff` line (currently uses `RECENT_DAYS * 24 * 60 * 60 * 1000`):
  ```typescript
  // full mode → no cutoff; default mode → today + yesterday (2 days)
  const cutoff = full ? null : (() => {
    const d = new Date()
    d.setDate(d.getDate() - RECENT_DAYS)
    d.setHours(0, 0, 0, 0)
    return d
  })()
  ```

- [ ] **Step 2: Verify the diff looks correct**

  Run: `git diff src/app/api/wati/sync-contacts/route.ts`

  Expected: `RECENT_MAX_PAGES` is gone, `RECENT_DAYS = 2`, `maxPages = Infinity`, cutoff sets to start-of-day 2 days ago.

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/wati/sync-contacts/route.ts
  git commit -m "$(cat <<'EOF'
  fix(contact-centre): scan all wati pages in default sync mode

  Wati sorts /getContacts by name, not by activity date. The previous
  RECENT_MAX_PAGES=15 cap only scanned 1500 contacts (A-C alphabetically),
  missing any active contacts whose names fell later. Remove the cap so the
  default mode scans all pages but still filters to the last 2 days.

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: Debounce realtime handler in useLiveConversations

**Files:**
- Modify: `src/hooks/contact-center/useLiveConversations.ts`

**What and why:** The realtime subscription calls `load()` on every `postgres_changes` event. When a sync upserts 25 rows, that's 25 sequential DB queries causing rapid state churn and potential scroll flicker. A 400ms debounce batches the burst into one query.

- [ ] **Step 1: Add debounce ref and replace the realtime callback**

  The file currently imports `useState, useEffect, useCallback, useRef`. Add a `useRef`-based debounce — no new imports needed.

  Replace the `useEffect` that sets up the channel (currently lines 62–79):

  ```typescript
  useEffect(() => {
    cancelledRef.current = false
    load()

    // Debounce realtime-triggered reloads so a burst of upserts (e.g. 25 contacts
    // from a background sync) batches into a single DB query instead of 25.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    function debouncedLoad() {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!cancelledRef.current) load()
      }, 400)
    }

    const channel = supabase
      .channel('live-conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversations' },
        () => { if (!cancelledRef.current) debouncedLoad() }
      )
      .subscribe()

    return () => {
      cancelledRef.current = true
      if (debounceTimer) clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
    }
  }, [load])
  ```

- [ ] **Step 2: Verify the diff**

  Run: `git diff src/hooks/contact-center/useLiveConversations.ts`

  Expected: the realtime callback now calls `debouncedLoad()` instead of `load()` directly; timer is cleared on unmount.

- [ ] **Step 3: Commit**

  ```bash
  git add src/hooks/contact-center/useLiveConversations.ts
  git commit -m "$(cat <<'EOF'
  perf(contact-centre): debounce realtime reload in useLiveConversations

  A background sync that upserts 25 rows previously triggered 25 rapid load()
  calls, causing state churn and scroll flicker. Batch them into one query
  with a 400ms debounce.

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: Add 5-minute silent background sync

**Files:**
- Modify: `src/hooks/contact-center/useContactCenterState.ts`

**What and why:** Add a `useEffect` that fires a silent sync every 5 minutes. "Silent" means no `setSyncProgress` calls — no banner, no spinner. The existing Supabase realtime subscription (now debounced) picks up the DB changes automatically. Use `useRef` to track whether a background sync is already running to avoid overlap.

- [ ] **Step 1: Add the background sync effect**

  At the top of the file, `useEffect` and `useRef` are already imported. Add a new effect inside `useContactCenterState`, after the existing state declarations and before the `openConversation` function.

  First, add a ref right after the `syncProgress` state declaration:

  ```typescript
  const bgSyncRunning = useRef(false)
  ```

  Then add this effect after the existing state/hook declarations (place it before the `openConversation` function definition):

  ```typescript
  // Silent background sync every 5 minutes — keeps the conversation list
  // up to date without user interaction. No banner or spinner; the debounced
  // realtime subscription in useLiveConversations handles the UI update.
  useEffect(() => {
    async function runBgSync() {
      if (bgSyncRunning.current) return
      bgSyncRunning.current = true
      try {
        const res = await fetch('/api/wati/sync-contacts', { method: 'GET' })
        if (!res.ok || !res.body) return
        const reader = res.body.getReader()
        // Drain the SSE stream to completion so the server-side upserts finish.
        // We don't parse events — the realtime subscription handles UI updates.
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      } catch {
        // Background sync failures are non-fatal — silently ignore.
      } finally {
        bgSyncRunning.current = false
      }
    }

    const interval = setInterval(runBgSync, 5 * 60 * 1000) // every 5 minutes
    return () => clearInterval(interval)
  }, [])
  ```

  The `useRef` import is already in the file (check the import line — add `useRef` if missing; currently the file only imports `useState` and `useCallback`).

  Update the import line at the top of the file from:
  ```typescript
  import { useState, useCallback } from 'react'
  ```
  to:
  ```typescript
  import { useState, useCallback, useEffect, useRef } from 'react'
  ```

- [ ] **Step 2: Verify the diff**

  Run: `git diff src/hooks/contact-center/useContactCenterState.ts`

  Expected: new `useEffect` with `setInterval(runBgSync, 300_000)`, cleanup returns `clearInterval`, `bgSyncRunning` ref guards against overlapping runs, import includes `useEffect` and `useRef`.

- [ ] **Step 3: Commit**

  ```bash
  git add src/hooks/contact-center/useContactCenterState.ts
  git commit -m "$(cat <<'EOF'
  feat(contact-centre): add silent 5-minute background wati sync

  Polls /api/wati/sync-contacts every 5 minutes without showing a banner.
  The debounced realtime subscription in useLiveConversations updates the
  list automatically when the sync upserts new rows.

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: Replace two-button dropdown with single Sync button

**Files:**
- Modify: `src/components/contact-center/ChatListView.tsx`

**What and why:** The user wants one button, not a dropdown. The new default sync mode (Task 1) already covers today+yesterday by scanning all pages, so there's no need to distinguish "recent" vs "full" for the button. The `handleSync()` call stays the same — it calls `onSync()` which internally calls `syncFromWati()` without `full=true`.

- [ ] **Step 1: Remove dropdown imports, simplify the sync button**

  Replace the import block at the top — remove the dropdown-related imports:

  Old imports (lines 1–18 area):
  ```typescript
  import { Search, MessageSquare, RefreshCw, AlertCircle, CheckCircle2, ChevronDown, Headphones, Bot } from 'lucide-react'
  import { Input } from '@/components/ui/input'
  import { Badge } from '@/components/ui/badge'
  import { Button } from '@/components/ui/button'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  ```

  New imports:
  ```typescript
  import { Search, MessageSquare, RefreshCw, AlertCircle, CheckCircle2, Headphones, Bot } from 'lucide-react'
  import { Input } from '@/components/ui/input'
  import { Badge } from '@/components/ui/badge'
  import { Button } from '@/components/ui/button'
  ```

- [ ] **Step 2: Replace the dropdown JSX with a single button**

  Find the `{onSync && ( <DropdownMenu>...</DropdownMenu> )}` block (around lines 249–286) and replace it with:

  ```tsx
  {onSync && (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 flex-shrink-0"
      disabled={!!isSyncing}
      title="Sync from WATI (today + yesterday)"
      onClick={() => handleSync()}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
    </Button>
  )}
  ```

- [ ] **Step 3: Verify the diff**

  Run: `git diff src/components/contact-center/ChatListView.tsx`

  Expected: `DropdownMenu*` imports gone, `ChevronDown` gone, dropdown JSX replaced with a single `<Button>` that calls `handleSync()`.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/contact-center/ChatListView.tsx
  git commit -m "$(cat <<'EOF'
  feat(contact-centre): replace two-button sync dropdown with single button

  Both modes now scan all pages (Task 1 fixed the page cap), so there is no
  longer a meaningful distinction between "recent" and "full" for the manual
  sync button. One button, one action.

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 5: Manual verification

- [ ] **Step 1: Start the dev server**

  ```bash
  npm run dev
  ```

- [ ] **Step 2: Open the Contact Centre and check initial load**

  Navigate to the contact centre. The conversation list should load from DB (no sync needed for existing rows).

- [ ] **Step 3: Click the single Sync button**

  Verify:
  - Only one refresh icon button appears (no dropdown, no chevron)
  - The icon spins during sync
  - The progress banner appears: "Fetching from WATI… → Resolving N contacts… → Saving N contacts… → Synced N contacts"
  - After sync completes, the list shows ALL today+yesterday conversations (should match Wati's count — 25+)
  - Banner disappears after 4 seconds

- [ ] **Step 4: Verify background sync doesn't disturb active conversation**

  Open a conversation. Wait up to 5 minutes (or temporarily change `5 * 60 * 1000` to `10 * 1000` in Task 3 for testing).
  Verify:
  - No banner appears
  - The open conversation stays open, messages visible
  - The conversation list updates silently (new rows appear at top if any)
  - Console shows no errors

- [ ] **Step 5: Restore test interval if changed**

  If you changed the interval to 10s for testing, restore it to `5 * 60 * 1000`.

- [ ] **Step 6: Update PROGRESS.md and commit**

  Update `PROGRESS.md`: move task to completed, record files changed.

  ```bash
  git add PROGRESS.md
  git commit -m "$(cat <<'EOF'
  docs: update PROGRESS.md — wati sync fix complete

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```
