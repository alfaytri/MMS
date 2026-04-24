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
3. That endpoint calls 17track `POST /track/v2.2/register` (auto-detects carrier)
   - If 17track returns an **ambiguity error** (multiple carriers matched), the response includes the candidate carriers; the UI prompts the user to pick one and re-submits with the specific `carrier_code`
   - If 17track returns a **quota exceeded** error, the shipment's `sync_error` field is set to `"quota_exceeded"`
4. Immediately after successful registration, the endpoint also calls `POST /track/v2.2/gettrackinfo` to fetch current tracking data and returns it synchronously — the UI updates instantly
5. Going forward, 17track pushes `POST /api/webhooks/17track` on every status change
6. Webhook handler appends new events and updates status atomically in the DB
7. The existing shipment detail timeline renders events — no UI redesign needed

## Components

### 1. `/api/webhooks/17track/route.ts`
- Verifies 17track webhook signature (rejects with 401 if invalid)
- Deduplicates events using a **composite event hash**: `sha256(status + timestamp + location)` stored on each event object. Skips append if hash already exists in the array.
- Maps 17track status codes → our `shipment_status` enum:
  - `InTransit` → `in_transit`
  - `Delivered` → `delivered`
  - `Exception` / `Undelivered` → `delayed`
  - `Customs` → `customs`
  - `InfoReceived` / `Pickup` / `NotFound` → keep current status (no downgrade)
- **Status weight hierarchy** — only updates `status` if the new status outranks the current one:
  ```
  booked(1) < in_transit(2) < customs(3) < delayed(3) < delivered(4)
  ```
  A webhook can never revert a `delivered` shipment to `in_transit`.
- **Atomic DB update** via a Postgres RPC (`append_shipment_event`) that uses `jsonb_insert` / `||` to append to the events array and conditionally update status in a single transaction — no read-modify-write race conditions in application code.
- Updates `last_synced_at` on every processed webhook.

### 2. `/api/shipments/register-tracking/route.ts`
- Accepts `{ tracking_number, shipment_id, carrier_code? }`
- Calls 17track `POST /track/v2.2/register`
- **Quota exceeded:** If 17track returns quota error code, sets `shipments.sync_error = 'quota_exceeded'`; returns error to client so UI can show "Auto-sync unavailable (limit reached)"
- **Carrier ambiguity:** If 17track returns ambiguity error, returns `{ ambiguous: true, candidates: [...] }` to the client — no DB write yet
- **Success:** Immediately calls `POST /track/v2.2/gettrackinfo`, maps current events, writes them to DB via the same RPC, clears `sync_error`, returns the fetched events to the client for instant UI update
- **"Sync Now" button** calls this same endpoint — user sees instant results rather than waiting for a webhook

### 3. DB Migration
- Add `last_synced_at TIMESTAMPTZ` to `shipments`
- Add `sync_error TEXT` to `shipments` (values: `null` | `'quota_exceeded'`)
- Add `append_shipment_event(shipment_id, event_jsonb, new_status, status_weight)` Postgres RPC that atomically appends and conditionally updates status

### 4. UI Tweaks (shipment detail dialog)
- Show "Last synced X mins ago" (null = never synced)
- Show "Auto-sync unavailable (limit reached)" warning banner when `sync_error = 'quota_exceeded'`
- **"Sync Now"** button calls register-tracking and immediately reflects returned events — no empty-click loop
- **Carrier picker:** If registration returns `ambiguous: true`, show an inline dropdown of candidate carriers from 17track with a "Confirm Carrier" button; on confirm, re-submits with `carrier_code`

## Error Handling

| Scenario | Handling |
|---|---|
| Carrier not recognized yet | Silently ignored — webhook fires once carrier scans package |
| Invalid webhook signature | Reject 401 |
| Duplicate event (same hash) | Skip append |
| Out-of-order webhook (status regression) | Status weight check — lower-weight status never overwrites higher |
| Race condition on events JSONB | Atomic Postgres RPC — no app-level read-modify-write |
| Quota exceeded | Set `sync_error`, show warning in UI |
| Carrier ambiguity on registration | Return candidates to UI, user selects carrier, re-register with `carrier_code` |
| Manual events by user | Coexist in same `events` array, unaffected |

## Configuration

- `SEVENTEEN_TRACK_API_KEY` in `.env.local`
- `SEVENTEEN_TRACK_WEBHOOK_SECRET` in `.env.local` for signature verification
- Set webhook URL in 17track dashboard: `https://<your-domain>/api/webhooks/17track`

## Out of Scope

- Changes to the create shipment form
- Changes to the events timeline UI
- Paid 17track features
