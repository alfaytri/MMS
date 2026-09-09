# GPS-Driven Field-Service Time Tracking — Design Spec

**Goal:** Automatically measure how long each team actually spends completing each
service, by fusing the Optimum Fleet vehicle GPS + **ignition** feed with the order
lifecycle. Output: per-team, per-service **actual durations** that converge into a
**standard "happy time"** per service, shown on a live map and a new extraction sheet.

**Prerequisite spec:** [Optimum Fleet integration plan](2026-09-09-optimumfleet-trakzee-map-integration.md) — supplies the position + `IGN` feed this design consumes.

**Branch:** `full-build/admin-misc`.

---

## Global constraints (confirmed decisions)

- **Precision:** minute-level. Optimum Fleet's API polls ≈1×/min (rate limit); all
  transitions are detected within ~1 minute. Acceptable for service durations.
- **Geofence location:** from `customer_addresses.lat/lng` (Qatar blue-plate / Google
  coords already stored). Default **radius 120 m** (per-address override allowed).
- **Work clock:** runs only while the vehicle is **inside the geofence with engine OFF**.
- **Order completion** (any one closes the job): (a) `orders.status → 'completed'`,
  (b) a `tl_invoices`/`customer_invoices` row raised for the order, (c) the team **starts
  another order** (another order goes `in-progress`), or (d) **engine OFF at a *different*
  order's geofence**.
- **Parts run:** vehicle leaves the geofence and **returns to the *same* geofence** with
  none of the completion events above → banked as parts-time; the work clock resumes on
  return.
- **Ignition source = Optimum Fleet.** `team_live_locations` (the team-leader app's phone
  GPS) has speed/heading but **no ignition**, so it is only a position fallback, never the
  work-clock trigger.

---

## Domain model — the per-order state machine

Evaluated every ~minute for each **active order** (status in `scheduled`, `confirmed`,
`in-progress`) that has an assigned team → vehicle → live GPS.

| State | Enter when | Timer running |
|---|---|---|
| `EN_ROUTE` | order active, vehicle outside its geofence | travel |
| `ARRIVED` | vehicle enters the order geofence | (idle) |
| `WORKING` | inside geofence **and** engine OFF | **work** |
| `LEFT` | was inside; engine ON and vehicle exits geofence | (deciding) |
| `PARTS_RUN` | in `LEFT`, no completion event, has not entered another order's geofence | **parts** |
| `DONE` | a completion trigger fires (see constraints) | — |

Transitions:
- `EN_ROUTE → ARRIVED` : geofence enter.
- `ARRIVED/LEFT(return) → WORKING` : engine OFF inside geofence (start/resume work clock).
- `WORKING → LEFT` : engine ON + exits geofence (stop work clock).
- `LEFT → WORKING` : re-enters same geofence + engine OFF → **it was a parts run** (close
  parts interval, resume work).
- `LEFT/WORKING → DONE` : completion trigger → finalize totals.

**Banked per order:** `work_seconds` (Σ engine-off-in-geofence), `parts_seconds` (Σ
leave-and-return), `travel_seconds` (arrival lead-in), `arrived_at`, `completed_at`.

---

## Data model (new)

```
order_geofences
  order_id (fk, unique)   lat  lng  radius_m (default 120)  source ('customer_address'|'pin'|'geocode')
  created_at              created_by

order_tracking_events            -- immutable audit log
  id  order_id  vehicle_id  team_id
  type ('arrived'|'engine_off'|'engine_on'|'left'|'returned'|'parts_run_start'|
        'parts_run_end'|'completed'|'gps_gap')
  at (timestamptz)  lat  lng  ignition (bool)  raw_status (text)

order_service_times              -- one row per (order, service) — what the sheet reads
  id  order_id  team_id  service_id
  work_seconds  parts_seconds  travel_seconds
  arrived_at  completed_at  completion_reason ('invoice'|'next_order'|'status'|'engine_off_elsewhere')
  visit_count  parts_run_count

vehicle_positions                -- latest + short history per vehicle (from Optimum Fleet)
  vehicle_id  imei  lat  lng  ignition  status  speed  heading  gps_time  fetched_at
  (retain N days for trails / trail comes from Optimum Fleet history otherwise)
```

**Links required (prerequisites):**
- `vehicles.team_id` (exists, empty in dev) — each team → its vehicle.
- `vehicles.avl_imei` (**new column**) — vehicle → Optimum Fleet device (from the
  integration plan §5).
- Order → team: via the order's team assignment; order → geofence via `order_geofences`.

---

## Components

1. **Geofence-on-booking hook.** When an order is booked/scheduled, insert
   `order_geofences` from the customer's primary `customer_addresses.lat/lng`
   (+ default radius). If coords are missing → flag the order "needs location" (operator
   drops a pin) rather than silently skipping.
2. **GPS watcher** (server worker / Vercel cron, ~60 s). Calls Optimum Fleet
   `getLiveData` company-wide, upserts `vehicle_positions`, and for each active order runs
   the **state-machine evaluator**. Idempotent + resumable (re-reads last state from the
   event log), so a missed tick self-heals.
3. **State-machine evaluator.** Pure function `evaluate(order, geofence, prevState,
   position)` → `(newState, events[])`. Geofence membership = haversine(position, center)
   ≤ radius. Emits `order_tracking_events` + updates the running `order_service_times`.
   Unit-tested exhaustively (this is the heart of the system).
4. **Completion listeners.** Order status→completed / invoice-raised / next-order-started
   also finalize a job (DB triggers or checked each tick), independent of GPS.
5. **Aggregation view** `v_service_time_standards` — per (team, service): count,
   avg/median work_seconds, avg parts_seconds, last-N rolling average = the **standard
   time**.
6. **UIs:**
   - **Map** (existing `/map`, Optimum-Fleet-fed): live vehicles + order geofences + each
     vehicle's current state badge (En-route / Working ⏱ / Parts run / Done).
   - **Extraction sheet** (new page, e.g. `/reports/service-times`): filterable table
     **team × service** → each measured job (work / parts / travel, completion reason) and
     the aggregated standard time; CSV/Excel export.

---

## How each signal is detected

- **Position + ignition:** Optimum Fleet `getLiveData` → `Latitude/Longitude`, `IGN`
  (ON/OFF), `Status`, `Speed`, `GPSActualTime`. Mapped in the integration lib.
- **Geofence enter/exit:** computed server-side (haversine vs `order_geofences`), so we
  don't depend on the vendor's geofence engine and can define our own radius/logic.
- **Engine on/off:** `IGN` transition between consecutive ticks.
- **"Different order's geofence":** the evaluator knows every active order's geofence, so
  "engine off at another site" = position inside a *different* active order's geofence with
  engine off.
- **Business completion:** `orders.status`, `tl_invoices`/`customer_invoices` for the order.

---

## Edge cases

- **GPS gap / device offline:** if no fresh position for T minutes, emit `gps_gap`; freeze
  the clock; resume on next fix. Don't finalize on a gap alone.
- **Overlapping geofences** (two orders close together): assign the tick to the order the
  vehicle's **team** is on; tie-break by nearest center.
- **No vehicle / no coords:** order simply isn't auto-tracked; surfaced as "not tracked"
  (manual time still possible).
- **Parking not at a job** (engine off outside every geofence): ignored — not work.
- **Multi-visit orders** (an order with several `site_visits`): track per visit; the sheet
  can roll up to the order.
- **GNSS interference** (current Qatar notice): positions may jitter; the 120 m radius +
  minute smoothing absorbs most of it.

---

## Extraction sheet (the payoff)

Columns: `Team · Service · Order · Date · Work · Parts · Travel · Total · Completion
reason`. Group/aggregate by **Team × Service** → **jobs measured**, **avg/median work
time**, **standard (rolling) time**. Filters: team, service, date range. Export CSV/Excel.
Purpose: know the realistic time each team needs per service (scheduling, SLAs, payroll).

---

## Rollout phases

1. **Optimum Fleet feed** (positions + IGN) — the prerequisite plan.
2. **Links:** `vehicles.avl_imei` + populate `vehicles.team_id`.
3. **Geofence-on-booking** + `order_geofences` + (pin fallback for missing coords).
4. **Watcher + evaluator + storage** (`order_tracking_events`, `order_service_times`) —
   with the exhaustive evaluator unit tests.
5. **Extraction sheet** + aggregation view.
6. **Map overlay** of live geofences + per-vehicle state.

---

## Open questions for review

1. **Active statuses:** treat `scheduled` + `confirmed` + `in-progress` as trackable, or
   only `in-progress`?
2. **Radius:** 120 m default OK? Per-address override needed?
3. **Multiple vehicles per team / rider changes** — one tracked vehicle per team assumed;
   is that always true?
4. **Multi-visit orders** — measure per visit and sum, or per order only?
5. **Standard time** — rolling average of last N, median, or trimmed mean? (Outlier jobs,
   e.g. an all-day one, shouldn't skew it.)
6. Where should the sheet live — under **Reports** or **Operations**?
