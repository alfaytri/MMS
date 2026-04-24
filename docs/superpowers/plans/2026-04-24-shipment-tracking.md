# Shipment Tracking (17track) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-sync real carrier tracking events into the existing shipment timeline using the 17track free API (100 trackings/month, 2000+ carriers).

**Architecture:** A thin utility layer (`normalize`, `statusMap`, `client17track`) feeds two API routes. All atomic DB writes go through the `append_shipment_events` Postgres RPC. The existing `ShipmentDetailDialog` gains Sync Now, quota warning, carrier picker, and a sorted timeline; the existing create/archive flows gain auto-register/de-register.

**Tech Stack:** Next.js App Router API routes, 17track REST API v2.2, Supabase Postgres RPC (SECURITY DEFINER), React Query (`@tanstack/react-query`), Node.js `crypto`, Vitest

---

## File Map

**Create:**
- `src/lib/tracking/normalize.ts` — UTC timestamp normalization + SHA-256 hash
- `src/lib/tracking/statusMap.ts` — 17track tag → shipment_status + weight constants
- `src/lib/tracking/client17track.ts` — 17track REST client (register, gettrackinfo, stoptrack)
- `src/lib/tracking/normalize.test.ts` — normalize utility tests
- `src/lib/tracking/statusMap.test.ts` — status map + weight tests
- `src/app/api/shipments/register-tracking/route.ts` — register + initial sync endpoint
- `src/app/api/shipments/deregister-tracking/route.ts` — stop-track endpoint
- `src/app/api/webhooks/17track/route.ts` — 17track push webhook handler
- `supabase/migrations/20260424180000_shipment_tracking.sql` — new columns + RPC

**Modify:**
- `src/types/database.types.ts` — add 4 new columns to shipments Row/Insert/Update
- `src/hooks/useShipments.ts` — extend `ShipmentEvent` + `Shipment` types with new fields
- `src/app/(dashboard)/purchase/shipments/page.tsx` — auto-register on create, de-register on archive, ShipmentDetailDialog enhancements

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260424180000_shipment_tracking.sql`

- [ ] **Step 1.1: Create the migration file**

```sql
BEGIN;

-- ─── SHIPMENTS — tracking columns ───
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_error     TEXT,
  ADD COLUMN IF NOT EXISTS carrier_code   TEXT,
  ADD COLUMN IF NOT EXISTS is_syncing     BOOLEAN NOT NULL DEFAULT false;

-- ─── RPC: append_shipment_events ───
CREATE OR REPLACE FUNCTION append_shipment_events(
  p_shipment_id  UUID,
  p_events       JSONB,
  p_status_map   JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status  TEXT;
  v_current_weight  NUMERIC;
  v_max_new_weight  NUMERIC   := 0;
  v_best_new_status TEXT      := NULL;
  v_existing_events JSONB;
  v_events_to_add   JSONB     := '[]'::JSONB;
  v_updated_events  JSONB;
  v_event           JSONB;
  v_existing_evt    JSONB;
  v_hash            TEXT;
  v_ts              TEXT;
  v_loc             TEXT;
  v_status          TEXT;
  v_new_weight      NUMERIC;
  v_match_found     BOOLEAN;
  v_supersede_idx   INT;
  i                 INT;
  j                 INT;
BEGIN
  SELECT status, events
  INTO v_current_status, v_existing_events
  FROM shipments
  WHERE id = p_shipment_id;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_existing_events IS NULL THEN v_existing_events := '[]'::JSONB; END IF;

  v_current_weight := COALESCE((p_status_map->>v_current_status)::NUMERIC, 0);

  FOR i IN 0 .. jsonb_array_length(p_events) - 1 LOOP
    v_event         := p_events->i;
    v_hash          := v_event->>'hash';
    v_ts            := v_event->>'normalizedTimestamp';
    v_loc           := v_event->>'location';
    v_status        := v_event->>'status';
    v_match_found   := FALSE;
    v_supersede_idx := -1;

    FOR j IN 0 .. jsonb_array_length(v_existing_events) - 1 LOOP
      v_existing_evt := v_existing_events->j;
      IF (v_existing_evt->>'normalizedTimestamp')::TIMESTAMPTZ = v_ts::TIMESTAMPTZ
         AND v_existing_evt->>'location' = v_loc THEN
        IF v_existing_evt->>'hash' = v_hash THEN
          v_match_found := TRUE;
          EXIT;
        ELSE
          v_supersede_idx := j;
          EXIT;
        END IF;
      END IF;
    END LOOP;

    IF v_match_found THEN CONTINUE; END IF;

    IF v_supersede_idx >= 0 THEN
      v_updated_events := '[]'::JSONB;
      FOR j IN 0 .. jsonb_array_length(v_existing_events) - 1 LOOP
        IF j = v_supersede_idx THEN
          v_updated_events := v_updated_events || jsonb_build_array(v_event);
        ELSE
          v_updated_events := v_updated_events || jsonb_build_array(v_existing_events->j);
        END IF;
      END LOOP;
      v_existing_events := v_updated_events;
    ELSE
      v_events_to_add := v_events_to_add || jsonb_build_array(v_event);
    END IF;

    IF v_status IS NOT NULL AND p_status_map ? v_status THEN
      v_new_weight := (p_status_map->>v_status)::NUMERIC;
      IF v_new_weight > v_max_new_weight THEN
        v_max_new_weight  := v_new_weight;
        v_best_new_status := v_status;
      END IF;
    END IF;
  END LOOP;

  UPDATE shipments
  SET
    events         = v_existing_events || v_events_to_add,
    status         = CASE
                       WHEN v_best_new_status IS NOT NULL
                            AND v_max_new_weight > v_current_weight
                       THEN v_best_new_status::shipment_status
                       ELSE status
                     END,
    last_synced_at = NOW()
  WHERE id = p_shipment_id;
END;
$$;

REVOKE ALL ON FUNCTION append_shipment_events(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION append_shipment_events(UUID, JSONB, JSONB) TO authenticated;

COMMIT;
```

- [ ] **Step 1.2: Push migration to Supabase**

```bash
npx supabase db push
```

Expected: migration applies with no errors.

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/20260424180000_shipment_tracking.sql
git commit -m "feat: add shipment tracking columns and append_shipment_events RPC"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/database.types.ts`
- Modify: `src/hooks/useShipments.ts`

- [ ] **Step 2.1: Add new columns to shipments in database.types.ts**

In `src/types/database.types.ts`, find the `shipments` section. In the `Row` object add after `updated_at: string | null`:

```typescript
carrier_code: string | null
is_syncing: boolean
last_synced_at: string | null
sync_error: string | null
```

In the `Insert` object add:
```typescript
carrier_code?: string | null
is_syncing?: boolean
last_synced_at?: string | null
sync_error?: string | null
```

In the `Update` object add:
```typescript
carrier_code?: string | null
is_syncing?: boolean
last_synced_at?: string | null
sync_error?: string | null
```

- [ ] **Step 2.2: Extend ShipmentEvent and Shipment types in useShipments.ts**

In `src/hooks/useShipments.ts`, replace the `ShipmentEvent` type with:

```typescript
export type ShipmentEvent = {
  date: string
  location: string
  status: string
  notes?: string
  // 17track auto-sync fields (optional — absent on manual events)
  normalizedTimestamp?: string
  hash?: string
}
```

Replace the `Shipment` type with:

```typescript
export type Shipment = {
  id: string
  tracking_number: string
  po_id: string
  receival_id: string | null
  mode: ShipmentMode
  carrier: string
  status: ShipmentStatus
  origin: string | null
  destination: string | null
  etd: string | null
  eta: string | null
  events: ShipmentEvent[]
  archived: boolean
  carrier_code: string | null
  is_syncing: boolean
  last_synced_at: string | null
  sync_error: string | null
  created_at: string
  updated_at: string
  purchase_orders?: { po_number: string; supplier_name: string } | null
}
```

- [ ] **Step 2.3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2.4: Commit**

```bash
git add src/types/database.types.ts src/hooks/useShipments.ts
git commit -m "feat: extend Shipment and ShipmentEvent types with tracking fields"
```

---

## Task 3: Tracking Utilities

**Files:**
- Create: `src/lib/tracking/normalize.ts`
- Create: `src/lib/tracking/statusMap.ts`
- Create: `src/lib/tracking/normalize.test.ts`
- Create: `src/lib/tracking/statusMap.test.ts`

- [ ] **Step 3.1: Write failing normalize tests**

Create `src/lib/tracking/normalize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { normalizeTimestamp, computeEventHash } from './normalize'

describe('normalizeTimestamp', () => {
  it('converts UTC string to ISO-8601', () => {
    expect(normalizeTimestamp('2024-01-15T10:30:00Z')).toBe('2024-01-15T10:30:00.000Z')
  })
  it('converts offset +03:00 to UTC', () => {
    expect(normalizeTimestamp('2024-01-15T13:30:00+03:00')).toBe('2024-01-15T10:30:00.000Z')
  })
  it('returns ISO format for space-separated string', () => {
    expect(normalizeTimestamp('2024-01-15 10:30:00')).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    )
  })
  it('returns original string for unparseable input', () => {
    expect(normalizeTimestamp('not-a-date')).toBe('not-a-date')
  })
})

describe('computeEventHash', () => {
  it('returns same hash for identical inputs', () => {
    const h1 = computeEventHash('2024-01-15T10:30:00.000Z', 'Shanghai', 'Picked up')
    const h2 = computeEventHash('2024-01-15T10:30:00.000Z', 'Shanghai', 'Picked up')
    expect(h1).toBe(h2)
  })
  it('returns different hash when description changes', () => {
    const h1 = computeEventHash('2024-01-15T10:30:00.000Z', 'Shanghai', 'Picked up')
    const h2 = computeEventHash('2024-01-15T10:30:00.000Z', 'Shanghai', 'Shanghai facility')
    expect(h1).not.toBe(h2)
  })
  it('returns different hash when location changes', () => {
    const h1 = computeEventHash('2024-01-15T10:30:00.000Z', 'Shanghai', 'Picked up')
    const h2 = computeEventHash('2024-01-15T10:30:00.000Z', 'Beijing', 'Picked up')
    expect(h1).not.toBe(h2)
  })
  it('returns a 64-character hex string', () => {
    expect(computeEventHash('ts', 'loc', 'desc')).toMatch(/^[a-f0-9]{64}$/)
  })
})
```

- [ ] **Step 3.2: Run tests — expect FAIL**

```bash
npx vitest run src/lib/tracking/normalize.test.ts
```

Expected: FAIL — `Cannot find module './normalize'`

- [ ] **Step 3.3: Implement normalize.ts**

Create `src/lib/tracking/normalize.ts`:

```typescript
import { createHash } from 'crypto'

export function normalizeTimestamp(raw: string): string {
  const d = new Date(raw)
  return isNaN(d.getTime()) ? raw : d.toISOString()
}

export function computeEventHash(
  normalizedTimestamp: string,
  location: string,
  description: string
): string {
  return createHash('sha256')
    .update(`${normalizedTimestamp}|${location}|${description}`)
    .digest('hex')
}
```

- [ ] **Step 3.4: Run tests — expect PASS**

```bash
npx vitest run src/lib/tracking/normalize.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 3.5: Write failing statusMap tests**

Create `src/lib/tracking/statusMap.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { map17trackTag, STATUS_WEIGHTS, STATUS_MAP_JSON } from './statusMap'

describe('map17trackTag', () => {
  it('maps InTransit to in_transit', () => expect(map17trackTag('InTransit')).toBe('in_transit'))
  it('maps Delivered to delivered',   () => expect(map17trackTag('Delivered')).toBe('delivered'))
  it('maps Exception to delayed',     () => expect(map17trackTag('Exception')).toBe('delayed'))
  it('maps Undelivered to delayed',   () => expect(map17trackTag('Undelivered')).toBe('delayed'))
  it('maps Customs to customs',       () => expect(map17trackTag('Customs')).toBe('customs'))
  it('returns null for InfoReceived', () => expect(map17trackTag('InfoReceived')).toBeNull())
  it('returns null for Pickup',       () => expect(map17trackTag('Pickup')).toBeNull())
  it('returns null for NotFound',     () => expect(map17trackTag('NotFound')).toBeNull())
  it('returns null for unknown tag',  () => expect(map17trackTag('FooBar')).toBeNull())
})

describe('STATUS_WEIGHTS', () => {
  it('delivered outranks all others', () => {
    (['booked', 'in_transit', 'customs', 'delayed'] as const).forEach(s =>
      expect(STATUS_WEIGHTS.delivered).toBeGreaterThan(STATUS_WEIGHTS[s])
    )
  })
  it('delayed outranks customs', () => {
    expect(STATUS_WEIGHTS.delayed).toBeGreaterThan(STATUS_WEIGHTS.customs)
  })
  it('in_transit outranks booked', () => {
    expect(STATUS_WEIGHTS.in_transit).toBeGreaterThan(STATUS_WEIGHTS.booked)
  })
  it('STATUS_MAP_JSON matches STATUS_WEIGHTS', () => {
    expect(STATUS_MAP_JSON).toEqual(STATUS_WEIGHTS)
  })
})
```

- [ ] **Step 3.6: Run tests — expect FAIL**

```bash
npx vitest run src/lib/tracking/statusMap.test.ts
```

Expected: FAIL — `Cannot find module './statusMap'`

- [ ] **Step 3.7: Implement statusMap.ts**

Create `src/lib/tracking/statusMap.ts`:

```typescript
import type { ShipmentStatus } from '@/hooks/useShipments'

export const STATUS_WEIGHTS: Record<ShipmentStatus, number> = {
  booked:     1,
  in_transit: 2,
  customs:    3.0,
  delayed:    3.1,
  delivered:  4,
}

// Passed as p_status_map to the append_shipment_events RPC
export const STATUS_MAP_JSON = { ...STATUS_WEIGHTS }

// Returns null for tags that should not change shipment status
export function map17trackTag(tag: string): ShipmentStatus | null {
  switch (tag) {
    case 'InTransit':   return 'in_transit'
    case 'Delivered':   return 'delivered'
    case 'Exception':
    case 'Undelivered': return 'delayed'
    case 'Customs':     return 'customs'
    default:            return null
  }
}
```

- [ ] **Step 3.8: Run tests — expect PASS**

```bash
npx vitest run src/lib/tracking/statusMap.test.ts
```

Expected: 13 tests pass.

- [ ] **Step 3.9: Commit**

```bash
git add src/lib/tracking/
git commit -m "feat: add tracking normalize and statusMap utilities with tests"
```

---

## Task 4: 17track API Client

**Files:**
- Create: `src/lib/tracking/client17track.ts`

- [ ] **Step 4.1: Create the client**

Create `src/lib/tracking/client17track.ts`:

```typescript
const BASE = 'https://api.17track.net/track/v2.2'

function headers() {
  return {
    '17token': process.env.SEVENTEEN_TRACK_API_KEY!,
    'Content-Type': 'application/json',
  }
}

// 17track rejection error codes
export const ERR_QUOTA_EXCEEDED    = 4031
export const ERR_AMBIGUOUS_CARRIER = 4013

export interface Track17Event {
  a: string  // timestamp string from carrier
  b: string  // location
  c: string  // description
  z: string  // status tag (e.g. "InTransit")
}

export interface Track17TrackInfo {
  number: string
  carrier: number
  tag: string
  track: { z0?: { a?: Track17Event[] } }
}

export interface Track17RegisterRejection {
  number: string
  error: { code: number; message: string; data?: number[] }
}

export interface Track17RegisterResult {
  accepted: Array<{ number: string; carrier: number }>
  rejected: Track17RegisterRejection[]
}

export async function registerTracking(
  trackingNumber: string,
  carrierCode?: number
): Promise<Track17RegisterResult> {
  const body: Record<string, unknown>[] = [{ number: trackingNumber }]
  if (carrierCode !== undefined) body[0].carrier = carrierCode
  const res = await fetch(`${BASE}/register`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  const json = await res.json()
  return { accepted: json.data?.accepted ?? [], rejected: json.data?.rejected ?? [] }
}

export async function getTrackInfo(
  trackingNumber: string,
  carrierCode?: number
): Promise<Track17TrackInfo | null> {
  const body: Record<string, unknown>[] = [{ number: trackingNumber }]
  if (carrierCode !== undefined) body[0].carrier = carrierCode
  const res = await fetch(`${BASE}/gettrackinfo`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  const json = await res.json()
  return json.data?.accepted?.[0] ?? null
}

export async function stopTracking(trackingNumber: string): Promise<void> {
  await fetch(`${BASE}/stoptrack`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify([{ number: trackingNumber }]),
  })
}
```

- [ ] **Step 4.2: Add env vars to `.env.local`**

Add to `.env.local`:
```
SEVENTEEN_TRACK_API_KEY=your_api_key_here
SEVENTEEN_TRACK_WEBHOOK_SECRET=your_webhook_secret_here
```

Get these from https://api.17track.net after signing up for a free account:
- **API key**: API Management → Create key
- **Webhook secret**: Webhook settings → set callback URL → copy secret

- [ ] **Step 4.3: Commit**

```bash
git add src/lib/tracking/client17track.ts
git commit -m "feat: add 17track API client"
```

---

## Task 5: Register-Tracking API Route

**Files:**
- Create: `src/app/api/shipments/register-tracking/route.ts`

- [ ] **Step 5.1: Create the route**

Create `src/app/api/shipments/register-tracking/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  registerTracking, getTrackInfo,
  ERR_QUOTA_EXCEEDED, ERR_AMBIGUOUS_CARRIER,
} from '@/lib/tracking/client17track'
import { normalizeTimestamp, computeEventHash } from '@/lib/tracking/normalize'
import { map17trackTag, STATUS_MAP_JSON } from '@/lib/tracking/statusMap'

// Kept short to stay within Vercel Hobby 10s limit (total delay ≤ 5s + API call time)
const BACKOFF_DELAYS_MS = [500, 1500, 3000]

async function fetchWithBackoff(trackingNumber: string, carrierCode?: number) {
  for (const delay of BACKOFF_DELAYS_MS) {
    await new Promise(r => setTimeout(r, delay))
    const info = await getTrackInfo(trackingNumber, carrierCode)
    if (info?.track?.z0?.a?.length) return info
  }
  return null
}

function mapRawEvents(rawEvents: Array<{ a: string; b: string; c: string; z: string }>) {
  return rawEvents
    .map(e => {
      const normalizedTimestamp = normalizeTimestamp(e.a)
      const location = e.b ?? ''
      const description = e.c ?? ''
      const status = map17trackTag(e.z)
      if (!status) return null
      const hash = computeEventHash(normalizedTimestamp, location, description)
      // `date` mirrors normalizedTimestamp so existing display code (ev.date) works
      return { hash, normalizedTimestamp, date: normalizedTimestamp, location, notes: description, status }
    })
    .filter(Boolean)
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  const { tracking_number, shipment_id, carrier_code } = await request.json()

  if (!tracking_number || !shipment_id) {
    return NextResponse.json({ error: 'tracking_number and shipment_id required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Atomic semaphore: only acquires the lock if is_syncing is currently false.
  // Prevents race conditions in serverless environments where two requests can
  // both read is_syncing: false before either sets it to true.
  const { data: lockedShipment, error: lockError } = await (supabase as any)
    .from('shipments')
    .update({ is_syncing: true })
    .eq('id', shipment_id)
    .eq('is_syncing', false)
    .select('carrier_code')
    .maybeSingle()

  if (lockError || !lockedShipment) {
    return NextResponse.json({ error: 'Sync already in progress' }, { status: 409 })
  }

  const resolvedCarrierCode: number | undefined =
    carrier_code !== undefined
      ? Number(carrier_code)
      : lockedShipment.carrier_code != null
        ? Number(lockedShipment.carrier_code)
        : undefined

  try {
    const result = await registerTracking(tracking_number, resolvedCarrierCode)
    const rejected = result.rejected.find(r => r.number === tracking_number)

    if (rejected) {
      if (rejected.error.code === ERR_QUOTA_EXCEEDED) {
        await (supabase as any)
          .from('shipments')
          .update({ sync_error: 'quota_exceeded', is_syncing: false })
          .eq('id', shipment_id)
        return NextResponse.json({ error: 'quota_exceeded' }, { status: 429 })
      }
      if (rejected.error.code === ERR_AMBIGUOUS_CARRIER) {
        // rejected.error.data contains candidate carrier code numbers per 17track API docs
        const candidates: number[] = rejected.error.data ?? []
        await (supabase as any).from('shipments').update({ is_syncing: false }).eq('id', shipment_id)
        return NextResponse.json({ ambiguous: true, candidates })
      }
      // Other rejections (not found yet) are non-fatal — webhook fires when carrier scans
    }

    if (carrier_code !== undefined) {
      await (supabase as any)
        .from('shipments')
        .update({ carrier_code: String(carrier_code) })
        .eq('id', shipment_id)
    }

    const info = await fetchWithBackoff(tracking_number, resolvedCarrierCode)
    const rawEvents = info?.track?.z0?.a ?? []
    const events = mapRawEvents(rawEvents)

    if (events.length > 0) {
      await (supabase as any).rpc('append_shipment_events', {
        p_shipment_id: shipment_id,
        p_events: events,
        p_status_map: STATUS_MAP_JSON,
      })
    }

    await (supabase as any)
      .from('shipments')
      .update({ sync_error: null, is_syncing: false })
      .eq('id', shipment_id)

    return NextResponse.json({ events })
  } catch (err) {
    console.error('[register-tracking]', err)
    await (supabase as any).from('shipments').update({ is_syncing: false }).eq('id', shipment_id)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 5.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5.3: Commit**

```bash
git add src/app/api/shipments/register-tracking/
git commit -m "feat: add register-tracking API route with backoff, quota, and ambiguity handling"
```

---

## Task 6: Deregister-Tracking API Route

**Files:**
- Create: `src/app/api/shipments/deregister-tracking/route.ts`

- [ ] **Step 6.1: Create the route**

Create `src/app/api/shipments/deregister-tracking/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { stopTracking } from '@/lib/tracking/client17track'

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  const { tracking_number } = await request.json()
  if (!tracking_number) {
    return NextResponse.json({ error: 'tracking_number required' }, { status: 400 })
  }

  try {
    await stopTracking(tracking_number)
  } catch (err) {
    // Non-fatal — log but don't surface to user
    console.error('[deregister-tracking]', err)
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6.2: Commit**

```bash
git add src/app/api/shipments/deregister-tracking/
git commit -m "feat: add deregister-tracking API route"
```

---

## Task 7: Webhook Handler

**Files:**
- Create: `src/app/api/webhooks/17track/route.ts`

- [ ] **Step 7.1: Create the webhook handler**

Create `src/app/api/webhooks/17track/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeTimestamp, computeEventHash } from '@/lib/tracking/normalize'
import { map17trackTag, STATUS_MAP_JSON } from '@/lib/tracking/statusMap'

// 17track sends the HMAC-SHA256 signature in the `17track-signature` header.
function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.SEVENTEEN_TRACK_WEBHOOK_SECRET
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return expected === signature
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('17track-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)
  const updates: unknown[] = Array.isArray(payload.data) ? payload.data : [payload.data]

  const supabase = createAdminClient()

  for (const update of updates) {
    const u = update as {
      number: string
      track?: { z0?: { a?: Array<{ a: string; b: string; c: string; z: string }> } }
    }
    if (!u.number) continue

    const { data: shipment } = await (supabase as any)
      .from('shipments')
      .select('id')
      .eq('tracking_number', u.number)
      .maybeSingle()

    if (!shipment) continue // ghost tracking — acknowledge and ignore

    const rawEvents = u.track?.z0?.a ?? []
    const events = rawEvents
      .map(e => {
        const normalizedTimestamp = normalizeTimestamp(e.a)
        const location = e.b ?? ''
        const description = e.c ?? ''
        const status = map17trackTag(e.z)
        if (!status) return null
        const hash = computeEventHash(normalizedTimestamp, location, description)
        return { hash, normalizedTimestamp, date: normalizedTimestamp, location, notes: description, status }
      })
      .filter(Boolean)

    if (events.length > 0) {
      await (supabase as any).rpc('append_shipment_events', {
        p_shipment_id: shipment.id,
        p_events: events,
        p_status_map: STATUS_MAP_JSON,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7.3: Commit**

```bash
git add src/app/api/webhooks/17track/
git commit -m "feat: add 17track webhook handler with signature verification and bulk event ingestion"
```

---

## Task 8: Page — Auto-Register on Create + De-Register on Archive

**Files:**
- Modify: `src/app/(dashboard)/purchase/shipments/page.tsx`

- [ ] **Step 8.1: Derive currentShipment reactively in ShipmentsPage**

In `ShipmentsPage`, after the `useShipments` call, add a derived value so the detail dialog always reflects the latest query data (needed for last_synced_at to update after Sync Now):

```typescript
// After:  const { data: shipments, isLoading } = useShipments({ archived, search })
// Add:
const currentShipment = selected
  ? (shipments ?? []).find(s => s.id === selected.id) ?? selected
  : null
```

Then change the `ShipmentDetailDialog` invocation at the bottom from:
```tsx
<ShipmentDetailDialog shipment={selected} onClose={() => setSelected(null)} />
```
to:
```tsx
<ShipmentDetailDialog shipment={currentShipment} onClose={() => setSelected(null)} />
```

- [ ] **Step 8.2: Auto-register on shipment creation**

In `CreateShipmentDialog`, change the `onSuccess` callback inside `handleSubmit` from:

```typescript
onSuccess: () => { toast.success('Shipment created'); onOpenChange(false); setForm({ po_id: '', mode: 'air', carrier: '', tracking_number: '', origin: '', destination: '', etd: '', eta: '' }) },
```

to:

```typescript
onSuccess: (newShipment) => {
  toast.success('Shipment created')
  onOpenChange(false)
  setForm({ po_id: '', mode: 'air', carrier: '', tracking_number: '', origin: '', destination: '', etd: '', eta: '' })
  // Fire-and-forget: keepalive ensures the request completes even if the user
  // navigates away immediately after the toast.
  fetch('/api/shipments/register-tracking', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tracking_number: newShipment.tracking_number,
      shipment_id: newShipment.id,
    }),
  }).catch(err => console.error('[auto-register]', err))
},
```

- [ ] **Step 8.3: De-register on archive**

In `ShipmentDetailDialog`, change the archive button's `onSuccess` from:

```typescript
{ onSuccess: () => { toast.success('Archived'); onClose() }, onError: (err) => toast.error(err.message) }
```

to:

```typescript
{
  onSuccess: () => {
    toast.success('Archived')
    fetch('/api/shipments/deregister-tracking', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracking_number: shipment.tracking_number }),
    }).catch(err => console.error('[deregister]', err))
    onClose()
  },
  onError: (err) => toast.error(err.message),
}
```

- [ ] **Step 8.4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8.5: Commit**

```bash
git add src/app/(dashboard)/purchase/shipments/page.tsx
git commit -m "feat: auto-register on shipment create, de-register on archive, reactive detail dialog"
```

---

## Task 9: ShipmentDetailDialog — Sync Now, Quota Warning, Carrier Picker, Sorted Timeline

**Files:**
- Modify: `src/app/(dashboard)/purchase/shipments/page.tsx`

- [ ] **Step 9.1: Add missing imports at the top of the file**

Change:
```typescript
import { useState } from 'react'
```
to:
```typescript
import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
```

- [ ] **Step 9.2: Add state, sorted events, and handleSyncNow inside ShipmentDetailDialog**

At the top of the `ShipmentDetailDialog` function body, after the existing hook calls, add:

```typescript
const queryClient = useQueryClient()
const [isSyncing, setIsSyncing] = useState(false)
const [syncAmbiguous, setSyncAmbiguous] = useState<{ candidates: number[] } | null>(null)
const [selectedCarrierCode, setSelectedCarrierCode] = useState<number | ''>('')

const sortedEvents = useMemo(
  () =>
    [...(shipment?.events ?? [])].sort((a, b) => {
      const ta = new Date(a.normalizedTimestamp ?? a.date ?? 0).getTime()
      const tb = new Date(b.normalizedTimestamp ?? b.date ?? 0).getTime()
      return tb - ta
    }),
  [shipment?.events]
)

async function handleSyncNow(carrierCode?: number) {
  if (!shipment || isSyncing) return
  setIsSyncing(true)
  setSyncAmbiguous(null)
  try {
    const res = await fetch('/api/shipments/register-tracking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracking_number: shipment.tracking_number,
        shipment_id: shipment.id,
        carrier_code: carrierCode,
      }),
    })
    const data = await res.json()
    if (data.ambiguous) {
      setSyncAmbiguous({ candidates: data.candidates })
      return
    }
    if (data.error === 'quota_exceeded') {
      toast.error('Auto-sync unavailable: monthly tracking limit reached')
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['shipments'] })
    toast.success('Tracking synced')
  } catch {
    toast.error('Sync failed — try again')
  } finally {
    setIsSyncing(false)
  }
}
```

- [ ] **Step 9.3: Add quota warning, last-synced label, and Sync Now button to JSX**

In the `ShipmentDetailDialog` JSX, inside the `<div className="space-y-4 ...">` (the scrollable content area), add these elements **before** the `{/* Summary */}` grid:

```tsx
{/* Quota warning */}
{shipment.sync_error === 'quota_exceeded' && (
  <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
    Auto-sync unavailable — monthly tracking limit reached
  </div>
)}

{/* Sync controls */}
<div className="flex items-center gap-3 text-sm text-muted-foreground">
  {shipment.last_synced_at ? (
    <span>
      Last synced{' '}
      {Math.round((Date.now() - new Date(shipment.last_synced_at).getTime()) / 60000)} min ago
    </span>
  ) : (
    <span>Never synced</span>
  )}
  <button
    onClick={() => handleSyncNow()}
    disabled={isSyncing}
    className="text-primary underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {isSyncing ? 'Syncing…' : 'Sync Now'}
  </button>
</div>

{/* Carrier picker — shown when 17track returns ambiguous result */}
{syncAmbiguous && (
  <div className="rounded-md border border-border p-3 space-y-2">
    <p className="text-sm font-medium">Multiple carriers matched. Select the correct one:</p>
    <div className="flex items-center gap-2">
      <select
        className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        value={selectedCarrierCode}
        onChange={e => setSelectedCarrierCode(e.target.value === '' ? '' : Number(e.target.value))}
      >
        <option value="">Pick carrier…</option>
        {syncAmbiguous.candidates.map(code => (
          <option key={code} value={code}>Carrier #{code}</option>
        ))}
      </select>
      <Button
        size="sm"
        disabled={selectedCarrierCode === '' || isSyncing}
        onClick={() => {
          if (selectedCarrierCode !== '') handleSyncNow(selectedCarrierCode as number)
        }}
      >
        Confirm
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 9.4: Replace the events list with sortedEvents and update status display**

Find the tracking timeline block. Replace:

```tsx
{[...(shipment.events ?? [])].reverse().map((ev, i) => (
  <div key={i} className="flex gap-3 text-sm">
    <div className="w-24 shrink-0 text-muted-foreground">{ev.date}</div>
    <div>
      <span className="font-medium">{ev.location}</span>
      {ev.status && <span className="ml-2 text-muted-foreground">· {ev.status}</span>}
      {ev.notes && <p className="text-xs text-muted-foreground">{ev.notes}</p>}
    </div>
  </div>
))}
```

with:

```tsx
{sortedEvents.map((ev, i) => (
  <div key={i} className="flex gap-3 text-sm">
    <div className="w-24 shrink-0 text-muted-foreground">
      {ev.date ? new Date(ev.date).toLocaleDateString() : '—'}
    </div>
    <div>
      <span className="font-medium">{ev.location}</span>
      {ev.status && (
        <span className="ml-2 text-muted-foreground">
          · {STATUS_LABELS[ev.status as ShipmentStatus] ?? ev.status}
        </span>
      )}
      {ev.notes && <p className="text-xs text-muted-foreground">{ev.notes}</p>}
    </div>
  </div>
))}
```

Also replace the empty-state check from `(shipment.events ?? []).length === 0` to `sortedEvents.length === 0`.

- [ ] **Step 9.5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 9.6: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 9.7: Start dev server and test the full flow manually**

```bash
npm run dev
```

Open http://localhost:3000/purchase/shipments and verify:

1. Create a shipment — no errors in console, no visible delay (register fires in background)
2. Open the detail dialog — "Never synced" + "Sync Now" button visible
3. Click "Sync Now" — button shows "Syncing…" and is disabled; cannot be clicked again
4. After sync: "Last synced 0 min ago" label updates (requires valid API key + real tracking number)
5. Archive a shipment — no console errors from deregister call

- [ ] **Step 9.8: Commit**

```bash
git add src/app/(dashboard)/purchase/shipments/page.tsx
git commit -m "feat: add Sync Now, last-synced label, quota warning, carrier picker, and sorted timeline to ShipmentDetailDialog"
```

---

## Task 10: 17track Dashboard Setup (Manual)

- [ ] **Step 10.1: Sign up for a free 17track API account**

Go to https://api.17track.net → sign up → free plan (100 trackings/month).

- [ ] **Step 10.2: Copy API key**

API Management → Create API key → paste into `SEVENTEEN_TRACK_API_KEY` in `.env.local`.

- [ ] **Step 10.3: Configure webhook**

Webhook settings → set callback URL to `https://<your-domain>/api/webhooks/17track` → copy the webhook secret into `SEVENTEEN_TRACK_WEBHOOK_SECRET` in `.env.local`.

**Note:** The webhook handler uses the `17track-signature` header as documented by 17track. If your account's dashboard shows a different header name, update `request.headers.get(...)` in `src/app/api/webhooks/17track/route.ts`.
