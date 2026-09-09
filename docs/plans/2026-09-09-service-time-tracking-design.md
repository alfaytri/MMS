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
  coords already stored). Default **radius 170 m** (per-address override allowed) — wide
  enough that when a customer's house has no parking and the team parks a street or two
  away, they still register as "on site."
- **Geofence lifecycle (daily, ephemeral):** a geofence is NOT created at booking. Each
  day at **05:00** a cron marks every **confirmed** order scheduled for *that day* with a
  geofence. A geofence is **erased when its order completes** (invoiced / status→completed),
  and any leftovers are **purged at end of day**. So only *today's* live orders carry
  geofences — the watcher's working set stays small.
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

Evaluated every ~minute for each **today's tracked order** — a `confirmed` (or already
`in-progress`) order scheduled for today that has a geofence (created by the 05:00 cron)
and an assigned team → vehicle → live GPS.

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
order_geofences                  -- ephemeral: created 05:00, dropped on completion/EOD
  order_id (fk, unique)   order_date  lat  lng  radius_m (default 170)
  source ('customer_address'|'pin'|'geocode')  active (bool)
  created_at  closed_at  closed_reason ('completed'|'end_of_day')

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

1. **Daily geofence cron (05:00) + end-of-day purge.** At 05:00, insert `order_geofences`
   for every confirmed order scheduled for today, from the customer's primary
   `customer_addresses.lat/lng` (+ default radius). Delete a geofence when its order
   completes; a nightly purge removes any leftovers so only today's orders are geofenced.
   If coords are missing → flag the order "needs location" (operator drops a pin) rather
   than silently skipping.
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
5. **Aggregation view** `v_service_time_standards` — per (team, service). The **standard
   "happy time"** is designed to be **fair and achievable** (a target teams accept, not the
   fastest fluke nor a lazy one): a **rolling trimmed mean of the last N completed jobs**
   (default N=10) that **drops the fastest and slowest ~15%** before averaging, so a
   record-fast job or an all-day outlier can't skew it. The view also exposes
   `count, min, median, p75, max, std_dev` for transparency (so the number is defensible to
   the team), and everything (N, trim %, parts-time inclusion) is a tunable config, not
   hard-coded. Parts-run time is tracked and reported **separately** so it never inflates
   the service standard.
6. **UIs:**
   - **Map** (existing `/map`, Optimum-Fleet-fed): live vehicles + **today's order pins**
     (a tag at each geofenced location — "this place has an order," showing order #, customer,
     service, and current state) + the geofence circles + each vehicle's current state badge
     (En-route / Working ⏱ / Parts run / Done). Clicking a pin opens the order.
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
3. **Daily geofence cron** (05:00 create / EOD purge) + `order_geofences` + pin fallback
   for missing coords.
4. **Watcher + evaluator + storage** (`order_tracking_events`, `order_service_times`) —
   with the exhaustive evaluator unit tests.
5. **Extraction sheet** (Reports) + the trimmed-mean aggregation view.
6. **Map overlay:** today's order pins/tags + geofence circles + per-vehicle state.

---

## Resolved decisions

1. **Trackable orders:** `confirmed` (and `in-progress` once started), scheduled for
   *today*, geofenced by the 05:00 cron.
2. **Geofence radius:** **170 m** default (parking-tolerant), per-address override allowed.
3. **One tracked vehicle per team** — always true.
4. **Multi-visit orders:** measured **per visit and summed** to the order (`visit_count` on
   `order_service_times`); the sheet can show per-visit or per-order.
5. **Standard "happy time":** rolling **trimmed mean** of last N (drop top/bottom ~15%),
   distribution shown, config-tunable — see Aggregation view §5.
6. **Sheet location:** under **Reports** → `/reports/service-times`.
7. **Order pins on the map:** yes — today's orders shown as location tags with state.
8. **Geofence lifecycle:** created 05:00 for the day's confirmed orders; erased on
   completion; purged end-of-day.

## Still open (minor — can decide during build)

- Exact **trim %/N** starting values (10 jobs, 15% trim proposed) — tune once real data
  accrues.
- Whether a **"needs location"** order (missing customer coords) should block or just warn
  at 05:00.
