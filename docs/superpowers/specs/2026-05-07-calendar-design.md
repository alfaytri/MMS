# Operations Calendar — Design Spec
**Date:** 2026-05-07  
**Branch:** feature/Calander  
**Status:** Approved — ready for implementation planning

---

## 1. Overview

The Operations Calendar is the dispatcher's command center: a single live, day-at-a-glance view showing every scheduled visit across all field teams. It is the time-axis mirror of all work created by Orders, Contracts, Site Visits, Follow-ups, Backwork, and QC modules.

**Route:** `/calendar` (under the Teams nav dropdown)  
**Primary user:** Dispatcher (desktop) + Supervisor (tablet) + Field manager (mobile)  
**Access:** Teams → Calendar in TopNav

---

## 2. Page Structure

Three stacked zones, top to bottom:

```
┌──────────────────────────────────────────┐
│  TOOLBAR  (sticky, h-12 desktop)         │
├──────────────────────────────────────────┤
│  WEEK CAPACITY STRIP  (~64px)            │
├──────────────────────────────────────────┤
│  TIMELINE GRID   (lg+, md)               │
│  — OR —                                  │
│  TEAM CARD LIST  (< md)                  │
└──────────────────────────────────────────┘
```

Total fixed header budget: ~112px (toolbar 48px + strip 64px), leaving ~85% of viewport for the grid.

---

## 3. Routing & Navigation

- Route: `/(dashboard)/calendar/page.tsx`
- Added to `nav-config.ts` under the **Teams** dropdown (replaces "Coming Soon")
- Auth-protected by existing dashboard layout guard

---

## 4. Breakpoints

| Range | Width | Layout |
|---|---|---|
| Mobile | < 768px (`< md`) | Team card list + bottom sheet |
| Tablet | 768px–1024px (`md`–`lg`) | Compressed grid (40px/hour) |
| Desktop | ≥ 1024px (`lg+`) | Full grid (60px/hour, Fit/Scroll toggle) |

---

## 5. Toolbar

**Height:** `h-12` (48px) on desktop. Two rows on mobile.

### Row 1 — Date nav + schedule badge + division selector + view toggle

- `‹ Today ›` date navigation — steps one day at a time
- Date label: `EEE, MMM d` format
- `Today` button: jumps to current date, highlighted when viewing a different day
- **Active Schedule badge** (read-only): `8 AM – 5 PM · Normal` or `· Ramadan` — reads `app_settings.calendar_schedule.mode` + `day_start` + `day_end`. Uses `text-xs` to stay compact.
- **Division selector** — single-select, behavior driven by `useUserDivisionScope()`:
  - Regular user: auto-filtered to their division, no selector rendered
  - Owner/supervisor: compact dropdown with `ChevronDown` icon, switches active division
- **Fit | Scroll toggle** — `lg+` only, hidden below

### Row 2 — Visit type filter chips

Eight ghost/outline toggle chips, one per `visit_type` enum value:

| Chip label | visit_type value |
|---|---|
| Normal Order | `normal_order` |
| Emergency | `emergency` |
| Follow Up | `follow_up` |
| Backwork | `backwork` |
| Site Visit | `site_visit` |
| Site Visit (Contract) | `site_visit_contract` |
| Contract Visit | `contract_visit` |
| QC Visit | `qc_visit` |

- Ghost/outline style — low visual weight when 8+ chips visible
- Click toggles visibility of matching visit blocks on the grid and updates week strip bars
- **Desktop (`lg+`):** single row, wraps only if viewport is very narrow
- **Mobile (`< md`):** chips hidden; replaced by a single "Filters" button that opens a bottom sheet containing all 8 chips — saves ~60px of vertical space for the card list

---

## 6. Week Capacity Strip

**Height:** ~64px including labels.  
**Position:** Below toolbar, above the grid.

### Layout

7 equal columns (Sun–Sat). Each column contains:
- Day label (abbreviated on `md`, full on `lg+`)
- Capacity bar
- Percentage label (hidden on `md`)

### Bar logic

- **100% baseline** = total working minutes for that weekday from the active schedule (`day_start`/`day_end` per day config)
- **Numerator** = sum of `(end_time - start_time)` for all visible visits on that day (respects active division + visit type filters)
- **Color:**
  - 0–79% → `bg-green-500`
  - 80–99% → `bg-amber-400`
  - 100%+ → `bg-red-500`, bar overflows container to signal overtime visually
- **Off days** (0 baseline): ghost dashed outline bar + `Off` label — maintains 7-column visual rhythm
- **Overflow display:** red bars also show a `+Nm` overflow label (e.g. `+120m`) so dispatchers can distinguish 101% load from 150% load at a glance
- **Today column**: subtle ring highlight + bold day label
- **Click**: jumps the main grid to that date

### Hover tooltip (`lg+`)

Shows raw numbers: `"3,400 / 4,000 min booked · 12 Visits"`

### Responsive

| Breakpoint | Behavior |
|---|---|
| `lg+` | 7 equal columns, full labels, % text, hover tooltip |
| `md` | 7 columns, abbreviated labels (S M T W T F S), bar only |
| `< md` | Horizontal scrollable strip, 36px wide per day |

### Filter sync

Bars re-calculate in real-time when the dispatcher toggles division or visit type filters in the toolbar.

---

## 7. Timeline Grid (Desktop `lg+` / Tablet `md`)

### Hour ruler (sticky top)

- Built from `day_start` → `day_end` from `useCalendarSchedule()`
- Hours outside active window: `bg-muted/30` dimmed
- Overnight schedules (`day_end > 24`): appends next-day hours after a `→` divider
- Vertical `border-l` on every hour cell for time-tracking down to any team row
- Sticky horizontally with team name column

### Team name column (sticky left)

- Desktop: `w-48` (192px)
- Tablet: `w-32` (128px)
- Shows: team name + division color dot
- QC teams (`is_qc: true`) hidden in dispatcher view

### Auto-scroll

On mount, grid scrolls to `schedule.scroll_to` hour (default 7 AM).

### Visit blocks

Positioned absolutely within each team row by `start_time`/`end_time`.

| Block width | Content shown |
|---|---|
| ≥ 60px | Customer name + visit type label |
| < 60px | Color dot only |

- Colored by `visit_type` (8 semantic colors matching toolbar chips)
- Each visit type also has a **distinct icon** (Lucide) rendered inside the block alongside the color — ensures visit types remain distinguishable for color-blind users and when two similar colors (e.g. Site Visit vs Site Visit Contract) are adjacent
- Height: fills row minus 4px padding top/bottom

**Z-index layers** (prevents hover cards being clipped by sticky columns):
| Layer | z-index |
|---|---|
| Grid body cells | `z-0` |
| Sticky hour ruler | `z-10` |
| Sticky team name column | `z-10` |
| Visit block (default) | `z-20` |
| Visit block hover card | `z-30` |
| SwapTeamDialog overlay | `z-50` |

**Hover card (desktop):** team, customer, time range, visit type, status. Action buttons:
- **Edit** (`calendar.edit-order`): navigates to `/orders/create-visit?edit=<id>`
- **Swap Team** (`calendar.swap-teams`): opens SwapTeamDialog
- **Customer chip**: triggers `ContactCenterContext.triggerCustomerLookup()` → unified customer drawer

### Scroll modes

| Mode | Cell width | Scroll |
|---|---|---|
| Scroll | 60px fixed | Horizontal scroll |
| Fit | viewport ÷ hours | No scroll (forced scroll if cell < 40px) |

- **Fit mode constraint:** hour cells have `min-width: 40px`. If the viewport is too narrow to fit all hours at 40px, the grid forces horizontal scroll regardless of the toggle — preventing illegible 10–20px cells on smaller laptops.
- Header and body share a single `scrollLeft` ref — kept in sync, no drift.

### "Now" indicator

A live red vertical line at the current time, rendered as an absolutely-positioned element within the grid body. Updates every 60 seconds via `setInterval`. Visible only when the current time falls within the active schedule window (`day_start`–`day_end`). Hidden when viewing a past or future date.

### Tablet (`md`–`lg`)

- Hour cell width: 40px
- Visit blocks: color + abbreviated label only
- Team name column: `w-32`
- Horizontal swipe gesture on grid body

---

## 8. Mobile Card List (`< md`)

Replaces the grid entirely on phones.

### Team card

```
┌─────────────────────────────────┐
│ ● RSH-K / Team 1          82%  │
│ ████████████░░░░░░░░░░░░░░░░   │
│ 09:00  [Emergency]  Al-Sayed   │
│ 11:30  [Normal]     Al-Rashidi │
│ +3 more visits           [  >] │
└─────────────────────────────────┘
```

- Division color dot + team name + day load %
- Mini capacity bar (same green/amber/red logic as week strip)
- First 2 visits previewed: `time · type chip · customer name`
- `+N more visits` + chevron if more than 2
- Empty teams: dashed bar + "No visits scheduled" in muted text
- Tap anywhere → opens `TeamDaySheet`

### TeamDaySheet (bottom sheet)

- Slides up, covers ~85% screen height, draggable to dismiss
- Header: team name + date
- Visit list sorted by `start_time`
- Each visit row: time range, visit type badge, customer name, status badge
- Action buttons per row: Edit + Swap Team (permission-gated)

---

## 9. SwapTeamDialog

**Trigger:** Swap Team button on hover card (desktop) or visit row (mobile sheet)  
**Permission required:** `calendar.swap-teams`

### Layout

| Feature | Desktop (`md+`) | Mobile |
|---|---|---|
| Container | Centered modal | Full-screen drawer |
| Team list | Scrollable area, fixed height | Full-screen list |
| Ineligible teams | Visible at `opacity-40` with reason tag | Hidden / moved to bottom |
| Action | Confirm Swap (primary) | Full-width bottom button |

### Eligibility logic

**Display (client-side):** On dialog open, teams are pre-filtered using locally cached `employee_services` and `calendar_visits` data for visual speed. Ineligible teams are dimmed with reason tags immediately.

**Confirm (server-side):** On "Confirm Swap" the PATCH calls a Supabase RPC `swap_visit_team(visit_id, new_team_id)` which re-validates eligibility atomically before committing. If validation fails (e.g. skill removed since the dialog opened), the RPC returns an error and the UI surfaces it as a toast — preventing race-condition "Failed to Save" errors.

A team is **eligible** if:
1. Has a skill matching the visit's service (`employee_services`)
2. Has no overlapping visit at the same `start_time`/`end_time`
3. Is not a QC team (`is_qc: false`)
4. Is not the current team

### Each team row shows

- Team name + division dot
- Load context: `N visits · X% load` for the day
- If `team_live_locations` data available: `3km away` distance label
- **Ineligible reason:** `Missing skill` or `Time conflict` (dimmed, `opacity-40`)
- **Conflict peek:** tapping a "Time conflict" team briefly shows what they are doing in that slot (e.g. "Busy: Site Visit at Al-Sadd 09:00–11:00")

### On confirm

1. PATCH `team_id` on the visit record
2. `audit('dispatcher', 'visit-swapped')` — audit trail entry
3. React Query invalidates `useCalendarVisits` → visit block moves to new team row instantly

---

## 10. Data Layer

### `useCalendarSchedule()`

- Source: `app_settings` where `key = 'calendar_schedule'`
- Returns: `{ mode, day_start, day_end, scroll_to }`
- Drives: hour ruler, dim zones, auto-scroll, Active Schedule badge
- `staleTime: 5min`

### `useCalendarVisits(date, divisionId, visitTypes?)`

- Queries the **`calendar_visits` Supabase view** — a Postgres view that does the UNION of orders, contract_visits, site_visits, follow_ups, backwork, qc_visits once on the DB side. This makes the hook a simple indexed `SELECT` against the view rather than a multi-table join at query time, eliminating the UNION performance bottleneck as data grows.
- View columns: `id`, `source_type`, `team_id`, `division_id`, `customer_name`, `start_time`, `end_time`, `visit_type`, `status`, `service_id`, `is_qc`
- Filters out `is_qc: true` teams by default
- Returns flat `Visit[]` — components group by `team_id` client-side
- React Query invalidation on cron job mutations → real-time status changes
- **Migration required:** `supabase/migrations/YYYYMMDDHHMMSS_create_calendar_visits_view.sql`

### `useWeekCapacity(weekStart, divisionId, visitTypes?)`

- Lightweight summary query: `date`, `team_id`, `(end_time - start_time)` only — no customer joins
- Returns `{ date, totalMinutes, scheduledMinutes, visitCount }[]`
- Reacts to toolbar filter state (division + visit types)

### `useUserDivisionScope()` — existing hook

Drives division selector: regular user auto-filtered, owner gets dropdown.

### `useCurrentPermissions()` — existing hook

Gates: `calendar.edit-order`, `calendar.swap-teams`

---

## 11. File Structure

```
src/app/(dashboard)/calendar/
  page.tsx                          ← route entry (placeholder exists)

src/components/calendar/
  CalendarPage.tsx                  ← top-level shell, state orchestration
  CalendarToolbar.tsx               ← toolbar (date nav, badge, division, chips)
  WeekCapacityStrip.tsx             ← 7-bar week overview
  TimelineGrid.tsx                  ← desktop/tablet 2D grid
  TeamRow.tsx                       ← single team row within the grid
  VisitBlock.tsx                    ← colored event block + hover card
  SwapTeamDialog.tsx                ← reassignment dialog
  TeamCardList.tsx                  ← mobile card list
  TeamCard.tsx                      ← single team card
  TeamDaySheet.tsx                  ← mobile bottom sheet detail

src/hooks/
  useCalendarVisits.ts              ← unified visits query (via calendar_visits view)
  useCalendarSchedule.ts            ← active schedule window
  useWeekCapacity.ts                ← lightweight week aggregation

supabase/migrations/
  YYYYMMDDHHMMSS_create_calendar_visits_view.sql   ← Postgres UNION view
  YYYYMMDDHHMMSS_create_swap_visit_team_rpc.sql    ← server-side eligibility + swap RPC
```

---

## 12. Connections to Other Modules

| Module | Relationship |
|---|---|
| Create Visit (`/orders/create-visit`) | Reuses `TeamCalendar` as drop target; Edit button deep-links here |
| Master Data → Teams | Defines rows; `is_qc`, `divisionId`, skills, `team_schedule_assignments` |
| Master Data → Services | `skills[]` matching for SwapTeamDialog eligibility |
| Orders / Contracts / Site Visits / Follow-ups / Backwork / QC | All write into visits; all surface as colored blocks |
| Map (`/map`) | Same visits + teams; Calendar = time view, Map = space view |
| Contact Center | Customer chip triggers unified history + dial drawer |
| Admin Settings | `calendar_schedule` drives visible hours + Active Schedule badge |
| Cron jobs | Status mutations → React Query invalidation → blocks update without refresh |
| Team Leader app | Reads same visits scoped to `team_id` |
