# Optimum Fleet (Trakzee / Uffizio) → `/map` Integration Plan

**Goal:** Feed live vehicle positions (then history + geofences) from the client's
**Optimum Fleet** platform into the existing `/map` fleet view, so the map shows
their real vehicles instead of (or alongside) the current Traccar feed.

**Branch:** `full-build/admin-misc` (where `/map` lives).

---

## 1. What the platform is (investigation result)

- **Optimum Fleet = Trakzee, by Uffizio** — a white-labeled commercial telematics
  platform. Instance: `https://avl.optimumfleet.net` (version `AVL v04.208.12`).
  The dashboard's private calls (`POST /GenerateJSON?method=getTrakzeeTracking…`)
  gave the vendor away; the **official REST API** is documented at
  `https://developers.uffizio.com`.
- We build against the **official `/webservice` API**, NOT the private
  `/GenerateJSON` (unsupported + fragile).

### Live-positions endpoint (Uffizio `getLiveData`)
```
GET https://avl.optimumfleet.net/webservice
      ?token=getLiveData                 ← "token" = the METHOD name (confusing but correct)
      &format=json
      &access_token=<token>              ← OR &user=<u>&pass=<p>
      [&company=<name> | &vehicle_no= | &imei_no=]   ← whole fleet, or one vehicle
      [&Tformat=UTC]
```
**Auth:** an **Access code** from the Trakzee profile → `generateAccessToken` returns
a token (preferred); or a service **user/pass**. **Rate limit:** 1 request/min per
vehicle, 1/2 min per company.

**Response — `VehicleData[]`, per vehicle:**
`Latitude, Longitude, Angle` (heading) · `Status`, `Speed`, `IGN`, `GPS`, `Power`, `SOS`,
`Immobilize_State` · `Odometer, Fuel, Temperature, battery_percentage, ExternalVolt` ·
`GPSActualTime, Datetime` (fmt `dd-MM-yyyy HH:mm`) · `Vehicle_No, Vehicle_Name, Imeino,
Company, Branch, Vehicletype, DeviceModel` · `Driver_First/Middle/Last_Name` · `Location`
(reverse-geocoded address) · `Door1..4`.

Same API family also exposes **history/track** and **geofences/alerts** (Phase 2/3).

---

## 2. Existing `/map` architecture (what we plug into)

Provider pattern, all present today for **Traccar**:
- `src/lib/traccar.ts` — server client (env base URL + creds), `getPositions()`,
  `getHistory()`, types (`TraccarPosition`, `TraccarDevice`), `parseTraccarId()`.
- `src/app/api/traccar/{positions,positions/history,devices,geofences}/route.ts` —
  **auth-gated** Next routes (`supabase.auth.getUser()` → 401), cached via Next Data
  Cache (`revalidate`).
- `src/hooks/useTraccar.ts` — `useTraccarPositions(deviceIds)` (60s poll),
  `useTraccarHistory`, `useTraccarDevices`, `useTraccarGeofences`.
- `src/app/(dashboard)/map/page.tsx` — `useVehicles()` → keep vehicles WITH a
  `traccar_device_id` → build `VehicleMapData` → `useTraccarPositions()` → markers.
- `VehicleMarkerLayer` (`VehicleMapData`), `VehicleTrail`, `GeofenceLayer`, `MapSidebar`.

**Vehicle↔device link today:** `vehicles.traccar_device_id` (text) ↔ Traccar numeric id.

The new provider mirrors this 1:1 — the map UI does not change.

---

## 3. Decisions (recommendations; confirm before build)

1. **Replace vs. coexist with Traccar** → *Recommend:* light **provider switch**
   (`TRACKING_PROVIDER=optimumfleet|traccar` env). This deployment uses
   `optimumfleet`; Traccar code stays but is dormant. (Avoids a full abstraction
   layer now; can grow into one later.)
2. **Vehicle identity** → *Recommend two-step:*
   - **Phase 1:** render the Optimum Fleet fleet **directly** from `getLiveData`
     (company-wide) keyed by `Imeino` — **no schema change, instant value.**
   - **Phase 4:** add `vehicles.avl_imei` (text) to link Optimum Fleet devices to our
     team-vehicles, so team search + the orders overlay work.
3. **Auth** → **Access code + `generateAccessToken`**, cached server-side; fall back to
   user/pass. Never in the browser.
4. **Scope of Phase 1** → **live positions + status only**; history/geofences later.

---

## 4. Environment / secrets (server-side only)

```
OPTIMUMFLEET_BASE_URL=https://avl.optimumfleet.net
OPTIMUMFLEET_ACCESS_CODE=<from Trakzee → Profile/Settings>   # or _USER / _PASS
```
Server-to-server only; the browser never sees these. **Password rotation = update the
env value** (no code change).

---

## 5. Files

**Create**
- `src/lib/optimumfleet.ts` — client: `getAccessToken()` (calls `generateAccessToken`,
  cached w/ TTL), `getLiveData(opts)`, `getHistory(imei, from, to)`, `getObjects()`,
  Uffizio types, and **`mapLiveDataToVehicle()`** (Uffizio row → `VehicleMapData`-shaped
  object): status-normalize (`Status` → `moving|idle|stopped|offline`), `Angle`→heading,
  speed unit, `Datetime` parse (`dd-MM-yyyy HH:mm`), driver/address/fuel passthrough.
- `src/app/api/optimumfleet/positions/route.ts` — auth-gated; returns mapped positions.
- `src/app/api/optimumfleet/history/route.ts` — auth-gated; mapped track.
- `src/app/api/optimumfleet/devices/route.ts` — auth-gated; object list.
- `src/hooks/useOptimumFleet.ts` — `useOptimumFleetPositions()` (poll ≥60s, whole-fleet),
  `useOptimumFleetHistory()`, `useOptimumFleetDevices()`.
- `src/lib/optimumfleet.mapping.test.ts` — unit tests for `mapLiveDataToVehicle` (status
  normalization, heading, date parse, missing fields).

**Modify**
- `src/app/(dashboard)/map/page.tsx` — source positions from the provider hook when
  `TRACKING_PROVIDER=optimumfleet` (Phase 1: fleet direct; Phase 4: joined via `avl_imei`).
- `src/components/map/VehicleMarkerLayer.tsx` / `MapSidebar.tsx` — only if we surface new
  fields (driver, ignition, fuel) in popup/sidebar; otherwise untouched.

**Migration (Phase 4 only)**
- `ALTER TABLE vehicles ADD COLUMN avl_imei text;` (+ index). Applied manually
  dev→staging→prod (git-push does not auto-apply migrations here).

---

## 6. Field mapping (Uffizio `getLiveData` → map)

| Uffizio field | Map usage |
|---|---|
| `Latitude`,`Longitude` | marker position |
| `Angle` | marker heading/rotation |
| `Status` | status color (normalize → Moving/Idle/Stopped/Offline legend) |
| `Speed` | speed label (confirm km/h) |
| `IGN`,`GPS`,`SOS` | popup indicators |
| `Datetime`/`GPSActualTime` | "last update" |
| `Vehicle_No`,`Vehicle_Name`,`Imeino` | identity + label |
| `Location` | address (sidebar) |
| `Driver_*` | driver (popup) |
| `Odometer`,`Fuel`,`battery_percentage` | extra detail (sidebar) |

---

## 7. Phases

1. **Live positions** — lib + token + `getLiveData` + mapping; positions proxy + hook;
   wire into map markers + status colors. Verify the "HILUX" vehicle renders live.
2. **History / trails** — `getHistory` + proxy + hook → existing `VehicleTrail` over the
   date-range picker.
3. **Geofences (optional)** — Uffizio geofence methods ↔ `GeofenceLayer`/`GeofenceDrawer`
   (read first; create if the API supports it).
4. **Team + order linking** — `vehicles.avl_imei` join → team search, orders overlay,
   sidebar richness.

---

## 8. Testing & risks

- **Tests:** unit-test the mapping (payload → `VehicleMapData`, status normalization,
  `dd-MM-yyyy HH:mm` parse). Dev: with the access code in env, confirm `getLiveData`
  returns the vehicle and it renders on `/map`.
- **Rate limits:** poll **company-wide** (≥60s) and cache; never per-vehicle loops.
- **Token lifecycle:** cache `generateAccessToken`, refresh on 401.
- **Base path:** confirm `/webservice` vs `/tracking` on this instance (docs show both API
  generations); the client should be configurable.
- **GPS accuracy:** the platform is showing a Qatar GNSS-interference notice — positions
  may jump; display-only, not our bug.

---

## 9. What's needed to start

- The **Access code** from the Trakzee **Profile/Settings** (a secret — the user pastes it
  into the server env, not the browser), and confirmation of `/webservice` vs `/tracking`.
- Sign-off on the decisions in §3 (provider switch; fleet-direct Phase 1).
