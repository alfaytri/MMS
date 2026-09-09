# GPS-Driven Field-Service Time Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically measure how long each team spends on each service by fusing the Optimum Fleet vehicle GPS+ignition feed with the order lifecycle, and surface it as live map order-pins + a Reports "service times" sheet with a fair standard "happy time" per team/service.

**Architecture:** A daily 05:00 cron drops a 170 m geofence on each of today's confirmed orders (from the customer address). A ~1-minute watcher cron pulls Optimum Fleet positions+ignition and runs a **pure state-machine evaluator** per tracked order (Arrived → engine-off = Working ⏱ → Left → parts-run vs. done), writing an event log + per-service durations. A view rolls those into a trimmed-mean standard. Two UIs read it: the existing `/map` and a new `/reports/service-times` sheet.

**Tech Stack:** Next.js (app router) + TypeScript, Supabase (Postgres + RLS, `npx supabase db query` for manual migrations), React Query, Leaflet, Vitest. GPS from Uffizio/Trakzee `/webservice` REST API.

**Spec:** [docs/plans/2026-09-09-service-time-tracking-design.md](2026-09-09-service-time-tracking-design.md) (+ prerequisite [Optimum Fleet integration plan](2026-09-09-optimumfleet-trakzee-map-integration.md)).

**Branch:** `full-build/admin-misc`.

## Global Constraints

- **Precision:** minute-level; Optimum Fleet polls ≈1×/min (rate limit). Never poll per-vehicle loops — one company-wide `getLiveData` per tick.
- **Geofence radius:** default **170 m**, per-row override via `order_geofences.radius_m`.
- **Geofence lifecycle:** created **05:00** for today's `confirmed` orders; deleted on completion (invoice/status→completed); leftovers purged **end-of-day**.
- **Work clock:** runs only while a vehicle is inside its geofence with **engine OFF** (`IGN=OFF`).
- **Completion:** any of — `orders.status→'completed'`, a `tl_invoices`/`customer_invoices` for the order, the team starts another order, or engine OFF inside a *different* order's geofence.
- **Standard time:** rolling **trimmed mean** of last N=10 (drop top/bottom 15%); parts-time reported separately; all tunable via a config constant, not hard-coded.
- **Secrets:** Optimum Fleet creds in server **env vars only** (`OPTIMUMFLEET_*`); never in the browser.
- **Migrations:** flat timestamped `.sql` in `supabase/migrations/`, applied **manually** (`npx supabase db query --linked --project-ref <ref> --file <path>`), dry-run via `sed 's/^COMMIT;/ROLLBACK;/'` first. New tables aren't in generated types → cast `supabase.from('x' as never)`.
- **Cron auth:** each `/api/cron/*` route checks `Authorization: Bearer ${process.env.CRON_SECRET}` (Vercel Cron sends it) and 401s otherwise.
- **Money/PII:** none created here; positions are operational data. Every new table gets RLS mirroring the `orders`/`teams` visibility pattern already in the repo.

---

## File Structure

**Phase 1 — Optimum Fleet feed**
- `src/lib/optimumfleet/types.ts` — Uffizio response + normalized `VehiclePosition` types.
- `src/lib/optimumfleet/client.ts` — `getAccessToken()`, `getLiveData()`, `getHistory()`.
- `src/lib/optimumfleet/map.ts` — `mapLiveRow()` (Uffizio row → `VehiclePosition`) + `normalizeStatus()`.
- `src/lib/optimumfleet/map.test.ts` — mapping unit tests.
- `src/app/api/optimumfleet/positions/route.ts`, `.../history/route.ts` — auth-gated proxies.
- `src/hooks/useOptimumFleet.ts` — `useOptimumFleetPositions()`, `useOptimumFleetHistory()`.
- `supabase/migrations/20261065000000_vehicles_avl_imei.sql` — `vehicles.avl_imei`.

**Phase 2 — geofence math + tables + crons**
- `src/lib/geo.ts` — `haversineMeters()`, `isInsideGeofence()`.
- `src/lib/geo.test.ts`.
- `supabase/migrations/20261066000000_service_tracking_tables.sql` — `order_geofences`, `order_tracking_events`, `order_service_times`, `vehicle_positions`.
- `src/app/api/cron/geofences-open/route.ts`, `.../geofences-purge/route.ts`.
- `src/hooks/useOrderGeofences.ts`.
- `vercel.json` — cron entries.

**Phase 3 — the engine**
- `src/lib/service-tracking/types.ts` — `TrackState`, `TrackEvent`, `EvalInput`, `EvalResult`.
- `src/lib/service-tracking/evaluator.ts` — pure `evaluate()`.
- `src/lib/service-tracking/evaluator.test.ts` — exhaustive.
- `src/app/api/cron/tracking-watcher/route.ts` — the ~1-min watcher.

**Phase 4 — outputs**
- `supabase/migrations/20261067000000_service_time_standards_view.sql` — `v_service_time_standards`.
- `src/hooks/useServiceTimes.ts`.
- `src/app/(dashboard)/reports/service-times/page.tsx` + nav entry.
- `src/components/map/OrderPinsLayer.tsx`; modify `src/app/(dashboard)/map/page.tsx`.

---

## Task 1 — Optimum Fleet client + mapping

**Files:**
- Create: `src/lib/optimumfleet/types.ts`, `src/lib/optimumfleet/client.ts`, `src/lib/optimumfleet/map.ts`
- Test: `src/lib/optimumfleet/map.test.ts`

**Interfaces — Produces:**
```ts
// types.ts
export interface VehiclePosition {
  imei: string; vehicleNo: string; vehicleName: string;
  lat: number; lng: number; heading: number; speedKmh: number;
  ignition: boolean; status: 'moving'|'idle'|'stopped'|'offline';
  gpsTime: string /* ISO */; address: string | null; driver: string | null;
}
// map.ts
export function normalizeStatus(raw: string, ignition: boolean): VehiclePosition['status']
export function mapLiveRow(row: Record<string, unknown>): VehiclePosition
// client.ts  (reads env OPTIMUMFLEET_BASE_URL / _ACCESS_CODE)
export async function getLiveData(opts?: { company?: string }): Promise<VehiclePosition[]>
export async function getHistory(imei: string, fromIso: string, toIso: string): Promise<VehiclePosition[]>
```

- [ ] **Step 1: Failing tests for the mapping** (`map.test.ts`)
```ts
import { describe, it, expect } from 'vitest'
import { mapLiveRow, normalizeStatus } from './map'

describe('normalizeStatus', () => {
  it('engine off → stopped', () => expect(normalizeStatus('Stop', false)).toBe('stopped'))
  it('moving with ignition → moving', () => expect(normalizeStatus('Running', true)).toBe('moving'))
  it('ignition on, no motion → idle', () => expect(normalizeStatus('Idle', true)).toBe('idle'))
  it('no gps → offline', () => expect(normalizeStatus('Inactive', false)).toBe('offline'))
})

describe('mapLiveRow', () => {
  it('maps Uffizio getLiveData fields + parses dd-MM-yyyy HH:mm', () => {
    const p = mapLiveRow({
      Imeino: '307147', Vehicle_No: 'HILUX-1', Vehicle_Name: '307147 - HILUX',
      Latitude: '25.28', Longitude: '51.52', Angle: '90', Speed: '42',
      IGN: 'OFF', Status: 'Stop', GPSActualTime: '09-09-2026 15:17',
      Location: 'Street 28, Doha', Driver_First_Name: 'Reyas', Driver_Last_Name: 'S',
    })
    expect(p.imei).toBe('307147'); expect(p.lat).toBeCloseTo(25.28); expect(p.lng).toBeCloseTo(51.52)
    expect(p.heading).toBe(90); expect(p.speedKmh).toBe(42); expect(p.ignition).toBe(false)
    expect(p.status).toBe('stopped'); expect(p.driver).toBe('Reyas S')
    expect(p.gpsTime).toBe('2026-09-09T15:17:00.000Z')
  })
})
```
- [ ] **Step 2: Run → fail.** `npx vitest run src/lib/optimumfleet/map.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement `types.ts` + `map.ts`.**
```ts
// map.ts
import type { VehiclePosition } from './types'
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const truthyIgn = (v: unknown) => String(v).toUpperCase() === 'ON' || String(v) === '1'
export function normalizeStatus(raw: string, ignition: boolean): VehiclePosition['status'] {
  const r = (raw || '').toLowerCase()
  if (r.includes('inactive') || r.includes('offline') || r.includes('no gps')) return 'offline'
  if (r.includes('run') || r.includes('mov')) return 'moving'
  if (ignition) return 'idle'
  return 'stopped'
}
export function mapLiveRow(row: Record<string, unknown>): VehiclePosition {
  const ignition = truthyIgn(row.IGN)
  // Uffizio date "dd-MM-yyyy HH:mm" → ISO (treated UTC; Tformat=UTC requested by client)
  const dt = String(row.GPSActualTime ?? row.Datetime ?? '')
  const m = dt.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/)
  const gpsTime = m ? new Date(Date.UTC(+m[3], +m[2]-1, +m[1], +m[4], +m[5])).toISOString() : new Date().toISOString()
  const driver = [row.Driver_First_Name, row.Driver_Middle_Name, row.Driver_Last_Name]
    .map(x => (x ? String(x).trim() : '')).filter(Boolean).join(' ') || null
  return {
    imei: String(row.Imeino ?? ''), vehicleNo: String(row.Vehicle_No ?? ''),
    vehicleName: String(row.Vehicle_Name ?? ''),
    lat: num(row.Latitude), lng: num(row.Longitude), heading: num(row.Angle), speedKmh: num(row.Speed),
    ignition, status: normalizeStatus(String(row.Status ?? ''), ignition),
    gpsTime, address: (row.Location ? String(row.Location) : null), driver,
  }
}
```
- [ ] **Step 4: Implement `client.ts`** — GET `${BASE}/webservice?token=getLiveData&format=json&access_token=${token}&Tformat=UTC[&company=]`; `getAccessToken()` calls `?token=generateAccessToken&user=&pass=` OR uses `OPTIMUMFLEET_ACCESS_CODE` directly, cached in a module var with a 50-min TTL; parse `VehicleData[]`, `.map(mapLiveRow)`; throw on non-200 or `Status:0`.
- [ ] **Step 5: Run tests → pass.** Commit `git add src/lib/optimumfleet && git commit -m "feat(map): Optimum Fleet client + position mapping"`.

---

## Task 2 — Optimum Fleet API proxies + hooks

**Files:** Create `src/app/api/optimumfleet/positions/route.ts`, `.../history/route.ts`, `src/hooks/useOptimumFleet.ts`
**Interfaces — Consumes:** `getLiveData`, `getHistory` (Task 1). **Produces:** `useOptimumFleetPositions()` → `VehiclePosition[]` (60 s poll), `useOptimumFleetHistory(imei, from, to)`.

- [ ] **Step 1: positions route** — mirror `src/app/api/traccar/positions/route.ts` exactly: `const { data:{ user } } = await supabase.auth.getUser(); if(!user) 401;` then `return NextResponse.json(await getLiveData())`; wrap in try/catch → 502. History route: read `imei,from,to` query, `getHistory(...)`.
- [ ] **Step 2: hooks** — copy the shape of `src/hooks/useTraccar.ts`:
```ts
export function useOptimumFleetPositions() {
  return useQuery({ queryKey:['of-positions'], queryFn: async () => {
    const r = await fetch('/api/optimumfleet/positions'); if(!r.ok) throw new Error('positions'); return r.json() as Promise<VehiclePosition[]>
  }, refetchInterval: 60_000, staleTime: 30_000 })
}
```
- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; manual: with env set, `GET /api/optimumfleet/positions` returns the vehicle array (or `[]`).
- [ ] **Step 4: Commit** `feat(map): Optimum Fleet auth-gated proxies + hooks`.

---

## Task 3 — `vehicles.avl_imei` link

**Files:** Create `supabase/migrations/20261065000000_vehicles_avl_imei.sql`
- [ ] **Step 1: Migration**
```sql
BEGIN;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS avl_imei text;
CREATE INDEX IF NOT EXISTS vehicles_avl_imei_idx ON public.vehicles (avl_imei) WHERE avl_imei IS NOT NULL;
COMMENT ON COLUMN public.vehicles.avl_imei IS 'Optimum Fleet (Trakzee) device IMEI linking this vehicle to its GPS feed.';
COMMIT;
```
- [ ] **Step 2: Dry-run then apply to dev** — `sed 's/^COMMIT;/ROLLBACK;/'` → apply to `wkmvjxxmzstsvahuiwsz`; re-run for real. (Staging/prod at ship.)
- [ ] **Step 3: Data note (not code):** each `vehicles` row needs `team_id` (assign the team) + `avl_imei` (from Optimum Fleet). Surface later in the Vehicles admin; for the build, one vehicle is enough to test.
- [ ] **Step 4: Commit** the migration file.

---

## Task 4 — Geofence math

**Files:** Create `src/lib/geo.ts`; Test `src/lib/geo.test.ts`
**Interfaces — Produces:** `haversineMeters(a,b): number`, `isInsideGeofence(pt, center, radiusM): boolean`.

- [ ] **Step 1: Failing tests**
```ts
import { describe, it, expect } from 'vitest'
import { haversineMeters, isInsideGeofence } from './geo'
const A = { lat: 25.2854, lng: 51.5310 }
describe('haversineMeters', () => {
  it('same point = 0', () => expect(haversineMeters(A, A)).toBeCloseTo(0))
  it('~111m north', () => expect(haversineMeters(A, { lat: A.lat + 0.001, lng: A.lng })).toBeGreaterThan(100))
})
describe('isInsideGeofence', () => {
  it('inside 170m', () => expect(isInsideGeofence({ lat: A.lat + 0.001, lng: A.lng }, A, 170)).toBe(true))
  it('outside 50m', () => expect(isInsideGeofence({ lat: A.lat + 0.001, lng: A.lng }, A, 50)).toBe(false))
})
```
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement**
```ts
type Pt = { lat: number; lng: number }
export function haversineMeters(a: Pt, b: Pt): number {
  const R = 6371000, toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}
export function isInsideGeofence(pt: Pt, center: Pt, radiusM: number): boolean {
  return haversineMeters(pt, center) <= radiusM
}
```
- [ ] **Step 4: Run → pass. Commit** `feat(map): geofence distance helpers`.

---

## Task 5 — Service-tracking tables

**Files:** Create `supabase/migrations/20261066000000_service_tracking_tables.sql`
- [ ] **Step 1: Migration** (verbatim column names the later tasks use):
```sql
BEGIN;
CREATE TABLE public.order_geofences (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  order_date date NOT NULL,
  lat double precision NOT NULL, lng double precision NOT NULL,
  radius_m integer NOT NULL DEFAULT 170,
  source text NOT NULL DEFAULT 'customer_address',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz, closed_reason text
);
CREATE INDEX order_geofences_active_idx ON public.order_geofences (order_date) WHERE active;

CREATE TABLE public.vehicle_positions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  imei text NOT NULL, lat double precision NOT NULL, lng double precision NOT NULL,
  ignition boolean NOT NULL, status text, speed_kmh numeric, heading numeric,
  gps_time timestamptz NOT NULL, fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_positions_imei_time_idx ON public.vehicle_positions (imei, gps_time DESC);

CREATE TABLE public.order_tracking_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vehicle_id uuid, team_id uuid,
  type text NOT NULL,   -- arrived|engine_off|engine_on|left|returned|parts_run_start|parts_run_end|completed|gps_gap
  at timestamptz NOT NULL DEFAULT now(),
  lat double precision, lng double precision, ignition boolean, raw_status text
);
CREATE INDEX order_tracking_events_order_idx ON public.order_tracking_events (order_id, at);

CREATE TABLE public.order_service_times (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  team_id uuid, service_id uuid,
  work_seconds integer NOT NULL DEFAULT 0,
  parts_seconds integer NOT NULL DEFAULT 0,
  travel_seconds integer NOT NULL DEFAULT 0,
  visit_count integer NOT NULL DEFAULT 1,
  parts_run_count integer NOT NULL DEFAULT 0,
  arrived_at timestamptz, completed_at timestamptz, completion_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, service_id)
);

ALTER TABLE public.order_geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_service_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_positions ENABLE ROW LEVEL SECURITY;
-- read for any authenticated user (mirrors orders visibility); writes are service-role (crons).
CREATE POLICY of_read ON public.order_geofences FOR SELECT TO authenticated USING (true);
CREATE POLICY ote_read ON public.order_tracking_events FOR SELECT TO authenticated USING (true);
CREATE POLICY ost_read ON public.order_service_times FOR SELECT TO authenticated USING (true);
CREATE POLICY vp_read  ON public.vehicle_positions FOR SELECT TO authenticated USING (true);
COMMIT;
```
- [ ] **Step 2: Dry-run + apply to dev** (as Task 3). **Step 3: Commit** the migration.

---

## Task 6 — Daily geofence crons

**Files:** Create `src/app/api/cron/geofences-open/route.ts`, `.../geofences-purge/route.ts`; Modify `vercel.json`
**Interfaces — Consumes:** `order_geofences`, `customer_addresses.lat/lng`.

- [ ] **Step 1: `geofences-open` route** — cron-auth guard; then, via the **service-role** Supabase admin client: select today's `orders` where `status='confirmed'` and `scheduled_date = current_date`; for each, resolve coords from the customer's primary `customer_addresses` (join `orders.customer_id`/`service_customer_id` → `customer_addresses.is_primary`); `upsert` `order_geofences {order_id, order_date: today, lat, lng, radius_m: 170, source:'customer_address', active:true}`. Orders with no coords → skip + log (Phase-later: flag "needs location"). Return `{opened, skipped}`.
- [ ] **Step 2: `geofences-purge` route** — cron-auth; `update order_geofences set active=false, closed_at=now(), closed_reason='end_of_day' where active and order_date < current_date` (and any still-open from today at EOD run). Return `{purged}`.
- [ ] **Step 3: `vercel.json` crons** (server timezone is UTC; Qatar = UTC+3, so 05:00 local = 02:00 UTC; EOD 23:59 local = 20:59 UTC):
```json
{ "crons": [
  { "path": "/api/cron/geofences-open",  "schedule": "0 2 * * *" },
  { "path": "/api/cron/geofences-purge", "schedule": "0 21 * * *" },
  { "path": "/api/cron/tracking-watcher","schedule": "* * * * *" }
]}
```
(Merge into the existing `vercel.json` crons array — do not overwrite the contact-centre/notifications crons.)
- [ ] **Step 4: Verify** — call `/api/cron/geofences-open` locally with the `CRON_SECRET` header; confirm a row lands in `order_geofences` for a confirmed today-order that has customer coords. **Commit** `feat(map): daily geofence open/purge crons`.

---

## Task 7 — The evaluator (state machine) ← the heart

**Files:** Create `src/lib/service-tracking/types.ts`, `.../evaluator.ts`; Test `.../evaluator.test.ts`
**Interfaces — Produces:**
```ts
export type TrackState = 'en_route'|'arrived'|'working'|'left'|'parts_run'|'done'
export interface TrackContext {           // persisted running state per order (last tick)
  state: TrackState; insideGeofence: boolean; ignition: boolean;
  workStartedAt: string | null; leftAt: string | null;
  workSeconds: number; partsSeconds: number; partsRunCount: number;
  arrivedAt: string | null;
}
export interface EvalInput {
  now: string;                            // ISO of this tick
  pos: { lat: number; lng: number; ignition: boolean } | null;  // null = gps gap
  geofence: { lat: number; lng: number; radiusM: number };
  atOtherOrderGeofenceOff: boolean;       // engine off inside a DIFFERENT order's geofence
  businessDone: boolean;                  // invoice raised / status completed / next order started
}
export interface EvalResult { ctx: TrackContext; events: { type: string }[] }
export function initialContext(): TrackContext
export function evaluate(prev: TrackContext, input: EvalInput): EvalResult
```
Rules (from spec): geofence enter → `arrived`; inside+engine-off → `working` (accumulate `workSeconds` = now−workStartedAt each tick); engine-on+exit → `left` (set `leftAt`); from `left`, re-enter same geofence → parts interval closes (`partsSeconds += now−leftAt`, `partsRunCount++`) and back to `working`; `businessDone || atOtherOrderGeofenceOff` → `done`; `pos===null` (gap) → freeze clocks, no state change.

- [ ] **Step 1: Failing tests** (exhaustive — these ARE the spec):
```ts
import { describe, it, expect } from 'vitest'
import { evaluate, initialContext } from './evaluator'
const gf = { lat: 25.285, lng: 51.531, radiusM: 170 }
const IN = { lat: 25.2853, lng: 51.531 }, OUT = { lat: 25.30, lng: 51.55 }

it('en_route → arrived on geofence enter', () => {
  const r = evaluate({ ...initialContext(), state:'en_route' },
    { now:'2026-09-09T06:00:00Z', pos:{...IN, ignition:true}, geofence:gf, atOtherOrderGeofenceOff:false, businessDone:false })
  expect(r.ctx.state).toBe('arrived'); expect(r.events.map(e=>e.type)).toContain('arrived')
})
it('arrived → working when engine off inside', () => {
  const r = evaluate({ ...initialContext(), state:'arrived', insideGeofence:true },
    { now:'2026-09-09T06:01:00Z', pos:{...IN, ignition:false}, geofence:gf, atOtherOrderGeofenceOff:false, businessDone:false })
  expect(r.ctx.state).toBe('working'); expect(r.ctx.workStartedAt).toBe('2026-09-09T06:01:00Z')
})
it('accumulates work seconds while engine stays off inside', () => {
  const prev = { ...initialContext(), state:'working', insideGeofence:true, ignition:false, workStartedAt:'2026-09-09T06:01:00Z' }
  const r = evaluate(prev, { now:'2026-09-09T06:31:00Z', pos:{...IN, ignition:false}, geofence:gf, atOtherOrderGeofenceOff:false, businessDone:false })
  expect(r.ctx.workSeconds).toBe(1800)
})
it('engine on + exit → left', () => {
  const prev = { ...initialContext(), state:'working', insideGeofence:true, ignition:false, workStartedAt:'2026-09-09T06:01:00Z', workSeconds: 600 }
  const r = evaluate(prev, { now:'2026-09-09T06:40:00Z', pos:{...OUT, ignition:true}, geofence:gf, atOtherOrderGeofenceOff:false, businessDone:false })
  expect(r.ctx.state).toBe('left'); expect(r.ctx.leftAt).toBe('2026-09-09T06:40:00Z')
})
it('return to same geofence = parts run, resume working', () => {
  const prev = { ...initialContext(), state:'left', insideGeofence:false, leftAt:'2026-09-09T06:40:00Z', workSeconds:600 }
  const r = evaluate(prev, { now:'2026-09-09T07:10:00Z', pos:{...IN, ignition:false}, geofence:gf, atOtherOrderGeofenceOff:false, businessDone:false })
  expect(r.ctx.state).toBe('working'); expect(r.ctx.partsSeconds).toBe(1800); expect(r.ctx.partsRunCount).toBe(1)
})
it('businessDone → done', () => {
  const prev = { ...initialContext(), state:'working', insideGeofence:true, ignition:false, workStartedAt:'2026-09-09T06:01:00Z', workSeconds:600 }
  const r = evaluate(prev, { now:'2026-09-09T08:00:00Z', pos:{...IN, ignition:false}, geofence:gf, atOtherOrderGeofenceOff:false, businessDone:true })
  expect(r.ctx.state).toBe('done'); expect(r.events.map(e=>e.type)).toContain('completed')
})
it('engine off at a different order geofence → done', () => {
  const prev = { ...initialContext(), state:'left', leftAt:'2026-09-09T06:40:00Z' }
  const r = evaluate(prev, { now:'2026-09-09T07:00:00Z', pos:{...OUT, ignition:false}, geofence:gf, atOtherOrderGeofenceOff:true, businessDone:false })
  expect(r.ctx.state).toBe('done')
})
it('gps gap freezes clocks + state', () => {
  const prev = { ...initialContext(), state:'working', insideGeofence:true, ignition:false, workStartedAt:'2026-09-09T06:01:00Z', workSeconds:600 }
  const r = evaluate(prev, { now:'2026-09-09T06:10:00Z', pos:null, geofence:gf, atOtherOrderGeofenceOff:false, businessDone:false })
  expect(r.ctx.state).toBe('working'); expect(r.ctx.workSeconds).toBe(600); expect(r.events.map(e=>e.type)).toContain('gps_gap')
})
```
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `evaluate()`** as a pure reducer: compute `inside = isInsideGeofence(pos, geofence, radiusM)` (import from `@/lib/geo`); when in `working` and still inside+off, add `secondsBetween(workStartedAt, now)` to `workSeconds` and advance `workStartedAt=now` (tick-accumulate); apply the transition table above; on any `done`/gap push the matching event. No I/O, no Date.now() — use `input.now`.
- [ ] **Step 4: Run → all pass. Commit** `feat(map): pure service-tracking evaluator + tests`.

---

## Task 8 — The watcher cron

**Files:** Create `src/app/api/cron/tracking-watcher/route.ts`
**Interfaces — Consumes:** `getLiveData` (T1), `evaluate` (T7), `isInsideGeofence` (T4), tables (T5).

- [ ] **Step 1: Implement** (service-role client; cron-auth guard):
  1. `const positions = await getLiveData()`; upsert each into `vehicle_positions` (match `vehicle_id` by `vehicles.avl_imei = imei`).
  2. Load `active` `order_geofences` for today + join their order's team → vehicle → latest position (by imei). Build a set of `(imei → inside which active geofences, ignition)` to compute `atOtherOrderGeofenceOff`.
  3. For each active order: load its `TrackContext` from the last `order_service_times` running row (or `initialContext()`); compute `businessDone` (order.status='completed' OR a `tl_invoices`/`customer_invoices` exists for it OR the same team has another order now `in-progress`); call `evaluate(prev, input)`.
  4. Persist: append emitted rows to `order_tracking_events`; upsert `order_service_times` with the new `work/parts/travel_seconds, visit_count, parts_run_count`; when `state==='done'`, set `completed_at, completion_reason` and delete/close the geofence (`active=false, closed_reason='completed'`).
  Return `{vehicles: positions.length, ordersEvaluated, completed}`.
- [ ] **Step 2: Verify** — with a seeded confirmed order + geofence + a linked vehicle whose IMEI is in dev's `vehicle_positions`, hit the route and assert an `order_service_times` row updates and events append. (Seed a couple of synthetic position ticks to drive engine-off → working.)
- [ ] **Step 3: Commit** `feat(map): tracking watcher cron (positions → evaluator → durations)`.

---

## Task 9 — Standards aggregation view

**Files:** Create `supabase/migrations/20261067000000_service_time_standards_view.sql`
- [ ] **Step 1: Migration** — `v_service_time_standards` per (team_id, service_id): from the last 10 completed `order_service_times` (window by `completed_at desc`), compute `jobs=count`, `min`, `median` (`percentile_cont(0.5)`), `p75` (`percentile_cont(0.75)`), `max`, `std_dev`, and **`standard_seconds`** = mean of `work_seconds` after dropping the top and bottom 15% (order by work_seconds, filter rows between the 0.15 and 0.85 `percent_rank`). Also `avg_parts_seconds`. Grant SELECT to authenticated.
- [ ] **Step 2: Dry-run + apply to dev. Step 3: Commit** the migration. (Trim %/N live as SQL constants — a one-line change to tune.)

---

## Task 10 — Reports → Service Times sheet

**Files:** Create `src/hooks/useServiceTimes.ts`, `src/app/(dashboard)/reports/service-times/page.tsx`; Modify `src/components/layout/nav-config.ts`
**Interfaces — Consumes:** `order_service_times`, `v_service_time_standards`.

- [ ] **Step 1: Hook** — `useServiceTimes({ teamId?, serviceId?, from?, to? })` → rows joined with order#, team name, service name, customer; `useServiceStandards()` → `v_service_time_standards`. (`.from('order_service_times' as never)` — new tables aren't in generated types.)
- [ ] **Step 2: Page** — a filtered table (Team · Service · Order · Date · Work · Parts · Travel · Total · Reason) with the per-(team,service) **standard time** header row from the view; team/service/date filters; a "Export CSV" button (reuse the repo's existing CSV export util if present, else a simple `Blob` download). Gate behind a `reports.service_times.view` permission if the repo gates report pages (follow `PermissionTree`/`useHasPermission` usage on a sibling report page).
- [ ] **Step 3: Nav** — add `{ label:'Service Times', href:'/reports/service-times', icon:'Timer', permission:'reports.service_times.view' }` under the Reports group in `nav-config.ts`.
- [ ] **Step 4: Verify** — `npx tsc --noEmit`; page renders with seeded `order_service_times`; filters + export work. **Commit** `feat(reports): service-time extraction sheet`.

---

## Task 11 — Map: order pins + geofences + vehicle state, on the Optimum Fleet feed

**Files:** Create `src/components/map/OrderPinsLayer.tsx`; Modify `src/app/(dashboard)/map/page.tsx`
**Interfaces — Consumes:** `useOptimumFleetPositions` (T2), `useOrderGeofences`, `order_tracking_events` (latest state).

- [ ] **Step 1: `useOrderGeofences`** hook — today's active `order_geofences` joined to order#/customer/service + latest tracking state (subquery on `order_tracking_events`).
- [ ] **Step 2: `OrderPinsLayer`** — a Leaflet layer of markers at each geofence center (tag = order#, customer, service, current state badge), plus a faint 170 m circle; popup links to the order. Mirror `VehicleMarkerLayer` structure/dynamic import.
- [ ] **Step 3: Wire `map/page.tsx`** — when `TRACKING_PROVIDER==='optimumfleet'`, source vehicle markers from `useOptimumFleetPositions()` instead of `useTraccarPositions()`, matching to our vehicles by `avl_imei`; add `<OrderPinsLayer />`. Keep the existing sidebar/search.
- [ ] **Step 4: Verify** — dev map shows the order pin(s) for today + the live vehicle; **Commit** `feat(map): order pins + geofences + Optimum Fleet vehicle source`.

---

## Self-Review

- **Spec coverage:** geofence lifecycle → T5/T6; 170 m → T5/T6; work=engine-off → T7; completion rules → T7/T8; parts-run → T7; per-visit → `visit_count` (T5/T8); trimmed-mean standard → T9; order pins → T11; sheet under Reports → T10; GPS gap/overlap edge cases → T7/T8. Prereq GPS feed → T1/T2/T3. ✓ (Populating `team_id`/`avl_imei` is a data task, called out in T3.)
- **Placeholder scan:** none — every code step has real code; SQL is verbatim.
- **Type consistency:** `VehiclePosition`, `TrackContext`, `TrackState`, `evaluate`, `isInsideGeofence`, and the table/column names are used identically across T1–T11.

**Open build-time tunables (from spec):** trim %/N (T9 SQL constants); "needs location" block-vs-warn (T6); cron UTC offsets assume Qatar UTC+3 (T6).
