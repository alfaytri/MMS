# Shipment Tracking — Design Spec
**Date:** 2026-04-24
**Status:** Approved

## Problem

The shipments page currently stores tracking numbers as plain text with no automatic tracking. Users must manually add events and update status. Entering a real carrier tracking number (DHL, Aramex, FedEx, etc.) does nothing automatic.

## Goal

Auto-sync real carrier tracking events into the existing shipment timeline using the 17track free API (supports 2000+ carriers, 100 trackings/month free — enough for <50 shipments/month).

## Data Flow

1. User creates a shipment with a tracking number (existing form, unchanged)
2. App calls `/api/shipments/register-tracking` immediately after creation
3. That endpoint calls 17track `POST /track/v2.2/register`
   - **Ambiguity:** If 17track returns multiple carrier candidates, returns `{ ambiguous: true, candidates: [...] }` — UI prompts user to pick one and re-submits with `carrier_code`; chosen `carrier_code` is persisted to `shipments.carrier_code`
   - **Quota exceeded:** Sets `shipments.sync_error = 'quota_exceeded'`; UI shows warning
4. After successful registration, waits **2–3 seconds** (or retries with exponential backoff) before calling `POST /track/v2.2/gettrackinfo` — avoids the initialization lag window where 17track returns "Not Found" immediately after registration
5. The `gettrackinfo` response (full event history) is ingested as a **bulk array** via the `append_shipment_events` RPC — UI updates instantly with all history
6. Going forward, 17track pushes `POST /api/webhooks/17track` on every status change (may contain multiple events per payload)
7. Webhook handler ingests events as a bulk array via the same RPC, atomically updating status
8. The existing shipment detail timeline renders events sorted by timestamp descending — no UI redesign needed

## Components

### 1. `/api/webhooks/17track/route.ts`
- Verifies 17track webhook signature (rejects with 401 if invalid)
- Normalizes all incoming timestamps to **UTC ISO-8601** before processing (carrier formatting and offsets vary)
- Generates a **composite event hash** per event: `sha256(status + normalizedTimestamp + location)` stored on each event object; skips events whose hash already exists in the array
- Maps 17track status codes → our `shipment_status` enum:
  - `InTransit` → `in_transit`
  - `Delivered` → `delivered`
  - `Exception` / `Undelivered` → `delayed`
  - `Customs` → `customs`
  - `InfoReceived` / `Pickup` / `NotFound` → keep current (no downgrade)
- Passes the full **array of new events** to `append_shipment_events` RPC in a single call

### 2. `/api/shipments/register-tracking/route.ts`
- Accepts `{ tracking_number, shipment_id, carrier_code? }`
- Calls 17track `POST /track/v2.2/register`
- **Quota exceeded:** Sets `shipments.sync_error = 'quota_exceeded'`; returns error to client
- **Ambiguity:** Returns `{ ambiguous: true, candidates: [...] }` — no DB write yet
- **Success:** Waits 2–3 seconds (or retries up to 3× with exponential backoff: 1s, 2s, 4s), then calls `POST /track/v2.2/gettrackinfo`; normalizes timestamps; passes full event array to `append_shipment_events` RPC; clears `sync_error`; returns events to client
- If `carrier_code` is provided (user resolved ambiguity), persists it to `shipments.carrier_code`
- **"Sync Now"** calls this same endpoint using the stored `carrier_code` if present — no re-triggering of the ambiguity prompt

### 3. `append_shipment_events` Postgres RPC
Replaces the single-event `append_shipment_event`. Signature:
```sql
append_shipment_events(
  p_shipment_id UUID,
  p_events      JSONB,   -- array of event objects
  p_status_map  JSONB    -- { "booked":1, "in_transit":2, "customs":3, "delayed":3, "delivered":4 }
)
```
- Iterates over `p_events`, skips any whose `hash` already exists in `shipments.events`
- Appends all new events in one `||` operation
- Determines the **highest-weight status** across the entire new-events array (not just the last event)
- Updates `shipments.status` only if that highest weight exceeds the current status weight
- Updates `shipments.last_synced_at = now()`
- Single transaction — no partial updates

### 4. DB Migration
- Add `last_synced_at TIMESTAMPTZ` to `shipments`
- Add `sync_error TEXT` to `shipments` (`null` | `'quota_exceeded'`)
- Add `carrier_code TEXT` to `shipments` — persists user-resolved carrier for future syncs

### 5. UI Tweaks (shipment detail dialog)
- Show "Last synced X mins ago" (`null` = never synced)
- Show warning banner when `sync_error = 'quota_exceeded'`
- **"Sync Now"** returns current events immediately (no empty-click loop); uses stored `carrier_code` if present
- **Carrier picker:** If registration returns `ambiguous: true`, show inline dropdown of candidate carriers; on confirm, re-submits with `carrier_code`
- **Timeline rendering:** Explicitly sort `events` array by normalized timestamp descending before rendering — does not rely on array index order

## Error Handling

| Scenario | Handling |
|---|---|
| Carrier not recognized yet | Silently ignored — webhook fires once carrier scans package |
| Invalid webhook signature | Reject 401 |
| Duplicate event (same hash) | Skip — hash checked per event before append |
| Hash collision from raw timestamp variance | Timestamps normalized to UTC ISO-8601 before hashing |
| Out-of-order webhook (status regression) | Status weight check — lower-weight status never overwrites higher |
| Bulk payload with mixed statuses | RPC picks highest-weight status from entire array |
| Race condition on events JSONB | Atomic Postgres RPC — no app-level read-modify-write |
| Initialization lag after registration | 2–3s delay + exponential backoff before `gettrackinfo` |
| Quota exceeded | Set `sync_error`, show warning in UI |
| Carrier ambiguity on registration | Return candidates to UI; user selects; `carrier_code` persisted to DB |
| Subsequent "Sync Now" after ambiguity resolved | Uses stored `carrier_code` — no re-prompt |
| Manual events by user | Coexist in `events` array, unaffected |

## Configuration

- `SEVENTEEN_TRACK_API_KEY` in `.env.local`
- `SEVENTEEN_TRACK_WEBHOOK_SECRET` in `.env.local`
- Set webhook URL in 17track dashboard: `https://<your-domain>/api/webhooks/17track`

## Out of Scope

- Changes to the create shipment form
- Changes to the events timeline base UI
- Paid 17track features
