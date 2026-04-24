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
3. That endpoint registers the tracking number with 17track (auto-detects carrier — no mapping needed)
4. 17track monitors the carrier and pushes a `POST` to `/api/webhooks/17track` on every status change
5. Webhook handler appends new events to `shipments.events` JSONB, updates `status`, and sets `last_synced_at`
6. The existing shipment detail timeline renders the events — no UI redesign needed

## Components

### 1. `/api/webhooks/17track/route.ts`
- Verifies 17track webhook signature (rejects with 401 if invalid)
- Deduplicates events: skips if an event with same date + location already exists
- Maps 17track status codes → our `shipment_status` enum:
  - `InTransit` → `in_transit`
  - `Delivered` → `delivered`
  - `Exception` / `Undelivered` → `delayed`
  - `Customs` → `customs`
  - `InfoReceived` / `Pickup` / `NotFound` → `booked` (no change)
- Updates `shipments.events`, `shipments.status`, `shipments.last_synced_at`

### 2. `/api/shipments/register-tracking/route.ts`
- Accepts `{ tracking_number, shipment_id }`
- Calls 17track `POST /track/v2.2/register` with the tracking number
- No carrier code sent — 17track auto-detects
- Silently ignores "not found yet" errors (carrier hasn't scanned yet — webhook fires later)
- Also used by the "Sync Now" button for existing shipments

### 3. DB Migration
- Add `last_synced_at TIMESTAMPTZ` column to `shipments` table

### 4. UI Tweaks (shipment detail dialog)
- Show "Last synced X mins ago" under the tracking number header (null = never synced)
- Add a **"Sync Now"** fallback button that calls the register endpoint — useful for shipments created before this integration was set up

## Error Handling

| Scenario | Handling |
|---|---|
| Carrier not recognized yet | Silently ignored — webhook fires once carrier scans package |
| Invalid webhook signature | Reject 401 |
| Duplicate event pushed | Skip — deduplicate by date + location |
| Manual events added by user | Coexist in same `events` array, unaffected |

## Configuration

- Add `SEVENTEEN_TRACK_API_KEY` to `.env.local`
- Add 17track webhook secret to `.env.local` for signature verification
- Set webhook URL in 17track dashboard: `https://<your-domain>/api/webhooks/17track`

## Out of Scope

- Carrier name → 17track carrier code mapping (auto-detect handles this)
- Changes to the create shipment form
- Changes to the events timeline UI
- Paid 17track features
