# Map Page — Live Fleet Tracking

**Date:** 2026-05-31
**Status:** Approved
**Reference:** `Ideas/map.txt` (pixel-level UI spec)

---

## Overview

A real-time fleet tracking page at `/map` showing team locations on an interactive Leaflet map with an operational sidebar. Teams are represented as colored circle markers derived from GPS telemetry; orders appear as pin markers filtered by completion status.

## Data Layer

### DB Migration — `team_live_locations`

Add two nullable columns to the existing `team_live_locations` table:

```sql
ALTER TABLE team_live_locations ADD COLUMN speed double precision;
ALTER TABLE team_live_locations ADD COLUMN heading double precision;
```

- `speed`: km/h from browser Geolocation API (nullable — old clients won't send it)
- `heading`: degrees 0-360 from Geolocation API (nullable)

### API Update — `/api/team-leader/update-location`

Accept optional `speed` and `heading` fields in the request body. Upsert them alongside lat/lng/accuracy.

### Hook: `useTeamLocations()`

**New file:** `src/hooks/useTeamLocations.ts`

Fetches teams joined with `team_live_locations` to produce a combined view:

```typescript
interface TeamLocation {
  id: string              // team ID
  teamName: string        // name_en ?? name
  driverName: string      // leader.name ?? 'No leader'
  vehiclePlate: string    // vehicles[0].plate ?? '—'
  lat: number | null
  lng: number | null
  speed: number | null
  heading: number | null
  lastUpdate: string | null  // team_live_locations.updated_at
  status: 'moving' | 'idle' | 'stopped' | 'offline'
  currentTask: string | null // placeholder — null for now
}
```

**Status derivation** (computed client-side from speed + updatedAt):

First, compute `effectiveSpeed`: if `updatedAt` is older than 2 minutes, treat speed as 0 regardless of the stored value. This prevents a "black hole" where a device reports speed > 0 then loses connection — without this, stale moving data would match no status bucket.

```typescript
const ageMs = Date.now() - new Date(updatedAt).getTime()
const effectiveSpeed = ageMs > 2 * 60_000 ? 0 : (speed ?? 0)
```

| Status | Condition |
|---|---|
| `moving` | effectiveSpeed > 0 (implies updatedAt < 2 min) |
| `idle` | effectiveSpeed === 0 AND updatedAt < 5 min ago |
| `stopped` | effectiveSpeed === 0 AND updatedAt between 5–30 min ago |
| `offline` | updatedAt > 30 min OR no location data |

**Polling:** React Query `refetchInterval: 30_000` (30 seconds).

**Query:**

```sql
SELECT
  t.id, t.name_en, t.name,
  e.name AS leader_name,
  v.plate,
  tl.lat, tl.lng, tl.speed, tl.heading, tl.updated_at
FROM teams t
LEFT JOIN team_live_locations tl ON tl.team_id = t.id
LEFT JOIN employees e ON e.id = t.leader_id
LEFT JOIN vehicles v ON v.team_id = t.id
WHERE t.deleted_at IS NULL
```

(Implemented via Supabase `.from('teams').select(...)` with joins.)

### Hook: `useOrderLocations()`

**New file:** `src/hooks/useOrderLocations.ts`

Fetches non-completed orders that have geocoded addresses:

```typescript
interface OrderLocation {
  id: string
  orderId: string        // order_number
  customerName: string
  service: string        // first line-item service name
  address: string
  lat: number
  lng: number
  status: 'scheduled' | 'in-progress' | 'completed' | 'pending'
  visitDate: string | null
}
```

**Filters:**
- Excludes `completed` and `cancelled` orders by default
- Only includes orders where `customer_addresses.lat` and `customer_addresses.lng` are not null
- Date filter on `visit_date`: defaults to **today + tomorrow** to keep the payload small and the map readable. Dispatchers can widen the range via the sidebar date picker. Without a date cap, hundreds of pending orders could accumulate and clutter the map at scale.

**Polling:** React Query `refetchInterval: 60_000` (60 seconds).

---

## Page Layout

**Route:** `/map` (under Teams dropdown, above Calendar)

```
+--------------------------------------------------+
| TopNav                                           |
+----------+---------------------------------------+
| Sidebar  |           Map Area                    |
| 320px    |           flex-1                      |
| (fixed)  |                                       |
|          |                                       |
|          |                                       |
+----------+---------------------------------------+
```

**Root container:** `<div className="flex flex-col md:flex-row h-full">`

**Responsive:**
- Mobile (<md): sidebar stacks on top, `max-h-[40vh]` with overflow scroll, map fills remaining height
- Desktop (>=md): sidebar `w-80` fixed left, map `flex-1`, full viewport height

---

## Sidebar — `MapSidebar.tsx`

**Container:** `bg-card border-r flex flex-col w-full md:w-80 max-h-[40vh] md:max-h-none`

### Header Block — `p-3 border-b space-y-2`

**Row A — Title + Refresh:**
- Left: `<h2 class="text-sm font-semibold">Live Fleet Tracking</h2>`
- Right: `<Button variant="ghost" size="icon" h-7 w-7>` with `<RefreshCw h-3.5 w-3.5 />`
- Click refresh -> refetch team locations

**Row B — Search input:**
- Relative wrapper with `<Search>` icon positioned `absolute left-2 top-1/2 -translate-y-1/2`
- `<Input class="h-8 pl-7 text-xs" placeholder="Search teams..." />`
- Filters sidebar list AND dims non-matching map markers (case-insensitive match on teamName, driverName, vehiclePlate)

**Row C — Status legend:**
- 4 inline chips, `text-[10px]`, each with a 2px colored dot:
  - `bg-success` Moving
  - `bg-warning` Idle
  - `bg-destructive` Stopped
  - `bg-muted-foreground` Offline

**Row D — Orders toggle + date filter:**
- Toggle pill: `<button class="flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-md {active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}">` with `<MapPin h-3 w-3 />` Orders ({count})
- When orders are shown: compact date input to filter by visit date (defaults to today + tomorrow)

### Team List — `<ScrollArea class="flex-1">`

Inner: `p-2 space-y-1`. One `<button>` per team that passes the search filter.

**Card layout:**

```
+----------------------------------------------+
| [status-badge]  Team Name        [plate-badge]|
|                 Driver Name                   |
|         current-task (if any)                 |
|         speed (if moving) | last-update  [!]  |
+----------------------------------------------+
```

**Card classes:**
```
w-full text-left rounded-md p-2.5 transition-colors
{selected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'}
```

**Status badge:** 24px circle (`h-6 w-6 rounded-full flex items-center justify-center`):
- `moving` -> `bg-success text-success-foreground` + `<Navigation h-3 w-3 />`
- `idle` -> `bg-warning text-warning-foreground` + `<Clock h-3 w-3 />`
- `stopped` -> `bg-destructive text-destructive-foreground` + `<MapPin h-3 w-3 />`
- `offline` -> `bg-muted text-muted-foreground` + `<WifiOff h-3 w-3 />`

**Vehicle plate:** `<Badge variant="outline" class="text-[9px] h-4 shrink-0">`

**Bottom row details:**
- If currentTask: `<p class="text-[10px] text-muted-foreground mt-1 ml-8 truncate">` with task text
- Speed (only when moving): `text-[10px]` with car icon + `{speed} km/h`
- Last update: `text-[10px]` formatted time — `updated_at` from DB is UTC; convert to browser's local timezone via `new Date(updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })` before display
- **Stale warning:** if `updatedAt` > 5 minutes ago, show `<AlertTriangle h-3 w-3 className="text-warning" />` icon

**Click behavior:**
- `setSelectedTeam(team.id)` -> highlights card
- `setFlyTo({ lat, lng })` -> triggers map flyTo animation

---

## Map Area — `MapView.tsx`

**Container:** `<div ref={mapContainerRef} class="h-full w-full z-0 flex-1" />`

Leaflet mounts imperatively into this div.

### Initialization (one-time effect)

```javascript
const map = L.map(container, { zoomControl: false })
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '...'
}).addTo(map)
```

- `zoomControl: false` — no +/- buttons, zoom via pinch/scroll only
- **Auto-fit bounds:** on first load with data, call `map.fitBounds(allTeamCoords)` with padding. Falls back to `setView([25.2854, 51.5310], 12)` if no teams have locations.
- Two `L.layerGroup()` stored in refs: `markerLayerRef` (teams) and `orderLayerRef` (orders)
- Cleanup on unmount: `map.remove()`

### Marker Clustering

Use `leaflet.markercluster` plugin. At zoom <= 10, overlapping markers cluster with a count badge. Configured with:
- `maxClusterRadius: 50`
- `disableClusteringAtZoom: 11`
- **Custom `iconCreateFunction`:** The default yellow/green/orange cluster graphics clash with the design system. Provide a custom function that renders cluster icons as a neutral circle (e.g., `bg-primary` or `bg-slate-700`) with a white count label, matching the app's visual language. Size scales with count: small (<10), medium (10-50), large (>50).

### Team Markers (effect on team data change)

**Diff-based update** — do NOT use `clearLayers()`. Clearing and re-adding markers every 30s causes popups to force-close mid-read and visible flickering. Instead, maintain a `Map<teamId, L.Marker>` ref:

- **Existing marker:** call `marker.setLatLng([lat, lng])`. If status changed, call `marker.setIcon(newIcon)` and update popup content via `marker.getPopup().setContent(html)`.
- **New team:** create marker, add to layer group, store in the Map.
- **Removed team:** remove marker from layer group, delete from the Map.

This preserves open popups and avoids visual flashing during polling updates.

**Team marker icon (custom L.divIcon):**

```html
<div style="background:{statusColor}; width:28px; height:28px; border-radius:50%;
  border:3px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.3);
  display:flex; align-items:center; justify-content:center;">
  <svg width=14 height=14 stroke="white" stroke-width=2.5>{Navigation arrow}</svg>
</div>
```

- `iconSize: [28, 28]`, `iconAnchor: [14, 14]`
- Status colors (hex for Leaflet inline HTML): moving `#22c55e`, idle `#eab308`, stopped `#ef4444`, offline `#94a3b8`
- **Icon cache:** `Map<status, DivIcon>` — only 4 icons ever created
- **Pulse animation:** moving markers get a CSS class `animate-pulse-marker` (subtle scale pulse via CSS keyframes injected once)

**Search dimming:** when sidebar search is active, markers for non-matching teams get `opacity: 0.25`

### Order Markers (effect on showOrders + orderLocations)

- `orderLayer.clearLayers()`
- If `showOrders` is true: add marker per order with lat/lng
- If false: layer stays empty

**Order marker icon (custom L.divIcon):**

```html
<div style="background:white; width:24px; height:24px; border-radius:6px;
  border:2.5px solid {statusColor}; box-shadow:0 2px 6px rgba(0,0,0,0.25);
  display:flex; align-items:center; justify-content:center;">
  <svg width=12 height=12 fill="{statusColor}">{map-pin path}</svg>
</div>
```

- `iconSize: [24, 24]`, `iconAnchor: [12, 24]`
- Order status colors: scheduled `#3b82f6`, in-progress `#f59e0b`, completed `#22c55e`, pending `#94a3b8`
- **Icon cache:** `Map<status, DivIcon>` — 4 icons total
- Popup: order ID (bold), customer, service, address, status (colored)

### FlyTo Effect

When sidebar selects a team:
```javascript
map.flyTo([lat, lng], 15, { duration: 1 })
```
1-second animated pan + zoom to street level.

---

## State Summary

| State | Type | Purpose |
|---|---|---|
| `search` | `string` | Sidebar text filter + map marker dimming |
| `selectedTeam` | `string \| null` | Highlights card, drives flyTo |
| `flyTo` | `{lat, lng} \| null` | Triggers map animation |
| `showOrders` | `boolean` (default `true`) | Toggles order layer |
| `orderDateFilter` | `string \| null` | Optional visit date filter for orders |
| `mapContainerRef` | `ref` | Leaflet container div |
| `mapRef` | `ref` | Leaflet map instance |
| `markerLayerRef` | `ref` | Team marker layer group |
| `orderLayerRef` | `ref` | Order marker layer group |

---

## Files to Create / Modify

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/YYYYMMDDHHMMSS_add_speed_heading_to_live_locations.sql` | CREATE | Add speed + heading columns |
| `src/app/api/team-leader/update-location/route.ts` | MODIFY | Accept speed + heading in upsert |
| `src/hooks/useTeamLocations.ts` | CREATE | Fetch teams + live locations, 30s polling |
| `src/hooks/useOrderLocations.ts` | CREATE | Fetch non-completed orders with coords, 60s polling |
| `src/app/(dashboard)/map/page.tsx` | MODIFY | Main page shell (sidebar + map) |
| `src/components/map/MapSidebar.tsx` | CREATE | Left sidebar with search, legend, team list |
| `src/components/map/MapView.tsx` | CREATE | Leaflet map with markers |
| `src/components/map/useMapMarkers.ts` | CREATE | Marker creation, caching, popup HTML |
| `src/components/map/map-styles.css` | CREATE | Pulse animation keyframes, Leaflet overrides |

---

## Enhancements (included in scope)

1. **Auto-fit bounds** — fitBounds on first data load instead of hardcoded center
2. **Pulse animation** — CSS pulse on moving team markers
3. **Stale location warning** — warning icon on sidebar cards when updatedAt > 5 min
4. **Search filters map** — sidebar search dims non-matching markers on the map
5. **Marker clustering** — leaflet.markercluster at low zoom levels

---

## Performance Notes

- Icon caching: 4 team icons + 4 order icons = 8 total DivIcon objects regardless of fleet size
- `useMemo` on filtered team list to avoid re-filtering on every map update
- Diff-based marker updates (setLatLng/setIcon) instead of clearLayers — preserves popups and avoids flicker during 30s polling
- Single map instance guarded by `if (mapRef.current) return` in init effect
- Tile attribution rendered (OSM legal requirement)
- Leaflet default icon paths patched at module load for Vite compatibility

## Not In Scope

- Realtime websocket (uses polling)
- Heat-map / route trail overlay
- "Draw route to closest team" tool
- Filter by division/team type/status on the map itself
- Fullscreen toggle
- Export / share location
