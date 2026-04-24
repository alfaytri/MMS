# Shipment Tracking — Design Spec
**Date:** 2026-04-24
**Status:** Final — approved for implementation

## Problem

The shipments page currently stores tracking numbers as plain text with no automatic tracking. Users must manually add events and update status. Entering a real carrier tracking number (DHL, Aramex, FedEx, etc.) does nothing automatic.

## Goal

Auto-sync real carrier tracking events into the existing shipment timeline using the 17track free API (supports 2000+ carriers, 100 trackings/month free — enough for <50 shipments/month).

## Data Flow

1. User creates a shipment with a tracking number (existing form, unchanged)
2. App calls `/api/shipments/register-tracking` immediately after creation
3. Endpoint calls 17track `POST /track/v2.2/register`
   - **Ambiguity:** Returns `{ ambiguous: true, candidates: [...] }` — UI prompts user to pick carrier; chosen `carrier_code` persisted to `shipments.carrier_code`
   - **Quota exceeded:** Sets `shipments.sync_error = 'quota_exceeded'`; UI shows warning
4. After successful registration, waits with **exponential backoff** (retry up to 3×: 1s, 2s, 4s) before calling `POST /track/v2.2/gettrackinfo` — avoids the initialization lag window
5. `gettrackinfo` response (full event history) ingested as a **bulk array** via `append_shipment_events` RPC; UI updates instantly; `is_syncing` lock cleared
6. Going forward, 17track pushes `POST /api/webhooks/17track` on every status change (may contain multiple events)
7. Webhook handler processes bulk events via same RPC; if `shipment_id` not found, returns `200 OK` and exits silently
8. Timeline renders events **sorted by normalizedTimestamp descending** via memoized frontend sort

## Components

### 1. `/api/webhooks/17track/route.ts`
- Verifies 17track webhook signature (rejects 401 if invalid)
- If `shipment_id` not found in DB → return `200 OK`, exit silently (ghost tracking cleanup)
- Normalizes all timestamps to **UTC ISO-8601** before any processing
- Per event, computes hash: `sha256(normalizedTimestamp + location + description)`
  - **Supersede logic:** if incoming event matches an existing entry on `timestamp + location` but has a different `description`, **update** that existing JSONB entry in place rather than skip or duplicate
  - Otherwise skip if hash already exists; append if new
- Maps 17track status codes → `shipment_status`:
  - `InTransit` → `in_transit`
  - `Delivered` → `delivered`
  - `Exception` / `Undelivered` → `delayed`
  - `Customs` → `customs`
  - `InfoReceived` / `Pickup` / `NotFound` → keep current (no downgrade)
- Passes full processed event array to `append_shipment_events` RPC

### 2. `/api/shipments/register-tracking/route.ts`
- Accepts `{ tracking_number, shipment_id, carrier_code? }`
- **Concurrent execution guard:** checks `shipments.is_syncing = true`; if set, returns `409 Conflict` immediately
- Sets `shipments.is_syncing = true` at start; clears in finally block
- Calls 17track `POST /track/v2.2/register`
- **Quota exceeded:** Sets `sync_error = 'quota_exceeded'`; returns error
- **Ambiguity:** Returns `{ ambiguous: true, candidates: [...] }` — no DB write yet
- **Success:** Retries `gettrackinfo` with exponential backoff (1s, 2s, 4s); normalizes timestamps; passes bulk array to `append_shipment_events` RPC; clears `sync_error`; returns events to client
- Persists `carrier_code` if provided — subsequent Sync Now calls use it without re-prompting

### 3. `append_shipment_events` Postgres RPC
```sql
-- SECURITY DEFINER with explicit search_path to prevent privilege escalation
CREATE OR REPLACE FUNCTION append_shipment_events(
  p_shipment_id UUID,
  p_events      JSONB,   -- array of event objects with hash, normalizedTimestamp, location, description, status
  p_status_map  JSONB    -- { "booked":1, "in_transit":2, "customs":3.0, "delayed":3.1, "delivered":4 }
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
```
Logic inside the RPC:
- Iterates over `p_events`; for each event:
  - **Supersede check:** if `timestamp + location` matches existing but `description` differs → replace that entry
  - **Skip check:** if hash already exists → skip
  - Otherwise add to `events_to_add` array; track `max_new_weight` from this event's status
- After loop, single `UPDATE`:
  ```sql
  UPDATE shipments
  SET
    events = events || events_to_add,
    status = CASE WHEN max_new_weight > current_weight THEN new_status_enum ELSE status END,
    last_synced_at = NOW()
  WHERE id = p_shipment_id;
  ```
- Highest-weight status across the entire bulk array wins — not just the last event

### 4. Shipment deletion — de-register from 17track
When a shipment is deleted or cancelled, call 17track `POST /track/v2.2/stoptrack` with the tracking number. Prevents quota exhaustion from ghost trackings continuing to fire webhooks.

### 5. DB Migration
- `last_synced_at TIMESTAMPTZ` on `shipments`
- `sync_error TEXT` on `shipments` (`null` | `'quota_exceeded'`)
- `carrier_code TEXT` on `shipments`
- `is_syncing BOOLEAN DEFAULT false` on `shipments` — server-side concurrency lock

### 6. UI (shipment detail dialog)
- `isSyncing` React state on Sync Now button — disabled + spinner during request; prevents parallel calls from the frontend
- "Last synced X mins ago" (`null` = never synced)
- Warning banner when `sync_error = 'quota_exceeded'`
- Carrier picker dropdown when registration returns `ambiguous: true`
- **Timeline sort:** `useMemo(() => [...events].sort((a, b) => b.normalizedTimestamp - a.normalizedTimestamp), [events])` — memoized to avoid re-sorting on every render

## Status Weight Hierarchy

| Status | Weight | Note |
|---|---|---|
| `booked` | 1 | |
| `in_transit` | 2 | |
| `customs` | 3.0 | Describes location — slightly lower than delayed |
| `delayed` | 3.1 | Describes condition — can override customs badge |
| `delivered` | 4 | Terminal — never overwritten |

Transitions only move forward in weight. `delivered` is permanent.

## Error Handling

| Scenario | Handling |
|---|---|
| Carrier not recognized yet | Silently ignored — webhook fires once carrier scans |
| Invalid webhook signature | Reject 401 |
| Ghost tracking (deleted shipment) | Return 200 OK, exit silently |
| Duplicate event (same hash) | Skip |
| Updated event details (same time+location, new description) | Supersede — update existing entry in place |
| Hash collision from raw timestamp variance | Normalize to UTC ISO-8601 before hashing |
| Out-of-order webhook (status regression) | Weight check — lower weight never overwrites higher |
| Weight collision (customs vs delayed) | `delayed(3.1)` > `customs(3.0)` — delayed wins |
| Bulk payload with mixed statuses | RPC picks highest weight across entire array |
| Race condition on events JSONB | Atomic Postgres RPC — no app-level read-modify-write |
| Concurrent Sync Now (server) | `is_syncing` DB lock → 409 Conflict |
| Concurrent Sync Now (client) | `isSyncing` React state disables button |
| Initialization lag after registration | Exponential backoff 1s → 2s → 4s before `gettrackinfo` |
| Quota exceeded | Set `sync_error`, show UI warning |
| Carrier ambiguity on registration | Return candidates; user selects; `carrier_code` persisted |
| Manual events by user | Coexist in `events` array, unaffected |

## Configuration

- `SEVENTEEN_TRACK_API_KEY` in `.env.local`
- `SEVENTEEN_TRACK_WEBHOOK_SECRET` in `.env.local`
- Webhook URL in 17track dashboard: `https://<your-domain>/api/webhooks/17track`

## Out of Scope

- Changes to the create shipment form
- Changes to the events timeline base UI layout
- Paid 17track features
