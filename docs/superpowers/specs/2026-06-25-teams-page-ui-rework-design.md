# Teams Page — UI Rework Design

**Date:** 2026-06-25
**Route:** `/master-data/teams`
**Status:** Design approved by user (2026-06-25). Ready for implementation plan.

---

## 1. Goal & Non-Goals

### Goal
Redesign the Teams & Employees page (`/master-data/teams`) end-to-end into a calm, modern, scannable workspace. Keep all existing functionality (drag-and-drop assignment, role badges, schedules, tools, per-entity activity logs). Replace today's cluttered grid + dense card + busy activity log with a Linear/Notion-style two-pane CRM layout plus a collapsible pools drawer and a day-grouped timeline activity log.

### Non-goals
- No data model changes. All hooks (`useTeams`, `useEmployees`, `useVehicles`, `useTeamActivityLog`, `useDnDHandlers`) keep their current shapes.
- No new server-side endpoints. Activity sentence generation is client-side only.
- No mobile-only redesign — responsive rules are inline (Section 6), not a separate spec.
- Do not touch the underlying dialogs (`TeamEditDialog`, `EmployeeEditDialog`, `VehicleEditDialog`, `ScheduleDialog`, `TeamToolsSheet`) beyond the trigger points that open them.

---

## 2. Visual Language

Linear/Notion-style minimal, applied uniformly:

- **Canvas**: one neutral background (`bg-background`). No tinted page + white card. No nested elevation.
- **Borders**: hairline only (`border-border/60`). Shadows reserved for the pools drawer overlay.
- **Spacing**: `gap-4`/`gap-6` between regions, `px-4 py-2.5` inside rows. Generous, never cramped.
- **Type**: `text-sm` is default; `text-xs text-muted-foreground` for meta; one `text-2xl font-semibold` (team name in detail hero) per pane.
- **Color**: foreground / muted-foreground for ~95% of text. Accent only for:
  - team status dot (green / amber / red / gray)
  - selected row highlight (`bg-accent` + 2px left accent border)
  - role badges (flat outlined: e.g. `border-red-300 text-red-700` for EMR — NOT filled `bg-red-100`)
- **Icons**: lucide at `h-4 w-4`, `text-muted-foreground` resting, `text-foreground` on hover. Ghost buttons only in the top bar.
- **Drag affordance**: dragged chip = neutral pill with subtle ring. Drop targets show a 2px dashed accent ring + light accent tint on valid hover; 2px dashed `border-destructive/50` + faint red tint on invalid hover.

---

## 3. Page Layout

Three primary zones plus a sliding drawer overlay.

```
┌─────────────────────────────────────────────────────────────────────┐
│ 👥 Team & Employee   12 teams · 84 employees · 23 vehicles          │
│                              [search]  [New ▾]  [📅]  [⏱]  [👥 5]    │  ← Top bar h-12
├──────────────────┬──────────────────────────────────────────────────┤
│  TEAMS (left)    │  DETAIL (right)                                  │
│                  │                                                  │
│  Alfaytri        │   Team 1 — Maintenance                [NRM] [SVO]│
│   Maintenance    │   Maintenance · Alfaytri                         │
│   ●  Team 1      │                                                  │
│   ●  Team 2      │   ┌─ Vehicle ────────┐ ┌─ Leader ────────────┐   │
│   ●  Team 3      │   │  🚐 QA-6162      │ │  👤 Ali Hassan       │   │
│   QC             │   │  Van             │ │  +974 5555 5555      │   │
│   ●  QC-1        │   └──────────────────┘ └──────────────────────┘   │
│                  │                                                  │
│   + Add team     │   Members (4)        Drag here to add            │
│                  │   [👤][👤][👤][👤][ + ]                            │
│                  │                                                  │
│                  │  [📞] [📅 Day shift] [🔧 3] [⏱] [✏ Edit]          │
└──────────────────┴──────────────────────────────────────────────────┘
                                          ╔══ Pools drawer ══════╗
                                          ║ Employees(4)|Veh.(1) ║
                                          ║ [🔍]                 ║
                                          ║ 👤 Mariam Said    ⋮  ║
                                          ║ 👤 Khalid Omar    ⋮  ║
                                          ╚══════════════════════╝
```

### 3.1 Top bar (`h-12`, single row, hairline bottom border)
- Left: page icon + title + inline counter text — `12 teams · 84 employees · 23 vehicles`. No badges; just muted text.
- Right cluster, left-to-right:
  - **Search** input, `w-64` desktop. Replaces today's per-grid search; filters the left rail only.
  - **`New ▾`** primary button. Menu: `New team` / `New employee` / `New vehicle`. Opens the matching existing dialog.
  - **📅 Schedules** ghost icon. Opens `ScheduleDialog` without a team pre-selected.
  - **⏱ Activity** ghost icon. Opens the global activity log sheet (Section 5).
  - **👥 Pools (N)** ghost icon + badge showing total unassigned count (employees + vehicles). Toggles the pools drawer.

### 3.2 Left rail (`w-[300px]`, scrollable)
- Quiet section headers for Company → Division. Style: `text-xs font-medium uppercase tracking-wide text-muted-foreground`, no borders, `pl-3 pt-3 pb-1`.
- One row per team, `h-11`:
  ```
  ●  Team 1 — Maintenance              QA-6162 · 4
  ```
  - Status dot `h-2 w-2 rounded-full`:
    - **green** = has leader + ≥1 member + vehicle
    - **amber** = missing one of {vehicle, members}
    - **red** = no leader (blocking)
    - **gray** = archived / fully empty
  - Name truncated; `name_ar` shown via tooltip on hover (not stacked).
  - Right side, muted: vehicle plate (`font-mono text-xs`) · member count.
  - **Hover**: `bg-muted/40`.
  - **Selected**: `bg-accent` + 2px left accent border (`border-l-2 border-l-primary`).
  - **Drop hover**: 2px dashed accent ring + light accent tint.
- Rail footer: full-width ghost button `+ Add team` → opens `TeamEditDialog`.
- Company → Division section headers are **collapsed by default only if more than one company exists** (multi-company case). Single-company users see a flat list without redundant headers, matching today's behavior in `TeamGrid.groupTeams`.

### 3.3 Right pane (flex, scrollable)
Stacks four sections with generous spacing (`space-y-6`, `p-6`):

1. **Hero**
   - Team name `text-2xl font-semibold` + `name_ar` muted `text-sm` directly beneath.
   - Trailing meta line `text-xs text-muted-foreground`: `Division · Company`.
   - Role badges on the right side of the hero row, flat outlined style.

2. **Slots** — `grid grid-cols-1 md:grid-cols-2 gap-4`:
   - **Vehicle slot card** — plate (`font-mono text-lg`), type below, truck icon. Empty: dashed border + "Drop a vehicle here". Hover: small swap (`⇄`) and remove (`×`) buttons in the top-right.
   - **Leader slot card** — avatar `h-10 w-10` + name + phone (if set). Empty: "Drop the leader here". Hover: swap + remove icons.
   - Both cards are drop targets.

3. **Members** — full width:
   - Heading row: `Members (N)` left + small caption "Drag here to add" right, both muted.
   - Avatar grid responsive: `grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3`. Each tile: avatar/initials + truncated name + tiny `×` on hover to remove.
   - Trailing tile: dashed `+` placeholder. The whole grid (including the placeholder) is one drop zone.

4. **Action footer** — thin top border, single row of ghost icon buttons:
   - `📞` (only when `team.phone` exists; tooltip shows the number)
   - `📅 Day shift` — schedule name inline; click opens `ScheduleDialog` with this team pre-selected
   - `🔧 3` — tools count inline; click opens `TeamToolsSheet`
   - `⏱` — per-team activity log (opens the activity sheet pre-filtered to this team)
   - `✏ Edit team` — opens `TeamEditDialog`

### 3.4 Empty state — no team selected
- Centered illustration: lucide `Users` at 64px, `text-muted-foreground/40`.
- Title: "Select a team".
- Sub: "Pick a team from the left to view details. You can also drag from the pools drawer onto any team in the list."

---

## 4. Pools Drawer

Slides from the right edge, `w-[380px]`, overlays the right pane. Triggered by the top-bar `👥 Pools` button. **Closed by default on first load.**

```
Pools                                                    ✕
─────────────────────────────────────────────────────────
Employees (4)    Vehicles (1)
─────────────────────────────────────────────────────────
[ 🔍  Search… ]

👤 Mariam Said        Technician          ⋮
👤 Khalid Omar        Helper              ⋮
👤 Sara Ali           QC Inspector        ⋮
👤 Yusuf Hassan       Driver              ⋮
```

- **Header**: title `Pools` + `✕` close.
- **Tabs**: `Employees` | `Vehicles` as text links (active = underlined). Counts beside each label.
- **Search**: filters the active tab. Employees search on name + role. Vehicles search on plate + type.
- **Rows**: avatar/icon + primary text + role/type muted + `⋮` drag handle on the right (always visible — affordance cue). The whole row is draggable; the handle is the visual signal.
- **Empty tab**: muted "All employees assigned" / "All vehicles assigned".
- **Closes on**: Esc, outside click, or clicking the toggle again.
- **Persistence**: drawer stays open after each drop so users can chain assignments. A toast appears: `Ali assigned to Team 1 — Undo`.
- **Sheet implementation**: use shadcn `Sheet` with `side="right"` and `modal={false}` so the right pane stays interactive behind it (important for dropping into specific slots).

---

## 5. Activity Log

Slides in from the right as a separate sheet (independent from the pools drawer — they never coexist). `w-[420px]` on desktop, full-screen on mobile.

### 5.1 Header (sticky top)
```
Activity                                                  ✕
─────────────────────────────────────────────────────────
All · Team · Employee · Vehicle · Schedule
```
- Title + close button.
- Filter row: text-link chips. Active = `text-foreground font-medium underline underline-offset-4`. Inactive = `text-muted-foreground hover:text-foreground`. No bordered pills.

### 5.2 Body — day-grouped accordion, all days **collapsed by default**

```
Today                                              12  ▸
Yesterday                                           8  ▸
Jun 22, Mon                                         3  ▾
  │
  ●  Test User assigned Ali to Team 1            2h ago
  │
  ●  Test User removed QA-6162 from Team 3       3h ago
  │
  ●  System unassigned Mariam (employee left)    5h ago

Jun 21, Sun                                         5  ▸
Jun 20, Sat                                         0  ▸ (greyed, not clickable)
```

- **Day header row**: `h-12`, full-width, hairline bottom border.
  - Left: day label — `Today` / `Yesterday` / `MMM d, EEE`.
  - Right: event count + chevron (`▸` collapsed, `▾` expanded).
  - Hover: `bg-muted/40`. Days with 0 events are rendered greyed and not clickable.
  - Click anywhere on the row toggles. Use a CSS height transition (no library) for the expand animation.

- **Expanded day body**: vertical timeline.
  - Left rail: 1px line (`border-l border-border`) with small dots (`h-2 w-2 rounded-full`) aligned to each event. If an actor exists, show their avatar (`h-5 w-5`) in place of the dot.
  - Each event = one sentence, no boxes, no badges.
  - Right side of the line: relative time (`2h ago`); click toggles to exact (`Jun 22 · 14:32`) — keep the existing `Timestamp` component's behavior.
  - Hover: tiny inline icons at the far right — `↗` open (jumps to that team/employee/vehicle in the main UI) and a details popover for raw before/after diff (power users).

### 5.3 Sentence generation
A pure client-side mapper turns `(action, before_data, after_data, entity, actor)` into a human sentence per action type. Lookup table extends `ACTION_LABELS` from today's `ActivityLogPanel.tsx`:

| action | sentence template |
|---|---|
| `team-created` | `{actor} created team {name}` |
| `team-edited` | `{actor} updated {team} ({changed_fields})` |
| `team-archived` | `{actor} archived {team}` |
| `employee-created` | `{actor} added employee {name}` |
| `employee-edited` | `{actor} updated {employee} ({changed_fields})` |
| `employee-assigned` | `{actor} assigned {employee} to {team}` *(or `as leader` if leader)* |
| `employee-removed` | `{actor} removed {employee} from {team}` |
| `employee-disabled` | `{actor} disabled {employee}` |
| `employee-enabled` | `{actor} re-enabled {employee}` |
| `employee-archived` | `{actor} archived {employee}` |
| `vehicle-created` | `{actor} added vehicle {plate}` |
| `vehicle-edited` | `{actor} updated vehicle {plate} ({changed_fields})` |
| `vehicle-assigned` | `{actor} assigned {plate} to {team}` |
| `vehicle-removed` | `{actor} unassigned {plate} from {team}` |
| `vehicle-archived` | `{actor} archived vehicle {plate}` |
| `tool-assigned` | `{actor} assigned {tool} to {team}` |
| `tool-removed` | `{actor} removed {tool} from {team}` |

Fallback for unmapped actions: `{actor} {humanized-action} ({entity})`. Never render raw UUIDs — apply the existing `UUID_RE` filter before substituting any field.

Field resolution rules:
- `{actor}` = `log.actor.full_name` if present, else `System`.
- `{team}` / `{employee}` / `{plate}` = look up name from `before_data` / `after_data` based on entity type; fall back to "Unknown" rather than UUID.
- `{changed_fields}` = comma-separated list of keys that differ between `before_data` and `after_data`, skipping ID columns and timestamp columns (reuse today's filter logic).

### 5.4 Per-entity log
When opened from a team/employee/vehicle's ⏱ button: same panel but the filter row is replaced with a fixed entity header — `Activity for Team 1` + back arrow to return to global view. Only events for that entity show, still day-grouped.

### 5.5 Empty state
Per filter / per entity: muted text "No activity in this view" centered in the body.

---

## 6. Drag & Drop

Per user choice: **both** team rows and detail-pane slots are valid drop targets.

### 6.1 Drag source
Rows in the pools drawer. Drag overlay = neutral pill with avatar/icon + name (already implemented in `page.tsx` `DragOverlayContent`; keep but restyle to the new flatter look — no `bg-primary/20`, use `bg-muted` + ring).

### 6.2 Valid drop targets

| Target | Visual state on valid hover | Action on drop |
|---|---|---|
| Team row in left rail | Row gets 2px dashed accent ring + accent tint | Employee → add as regular member. Vehicle → assign as team vehicle. |
| Vehicle slot (detail pane) | Card gets dashed accent ring + tint | Vehicle → assign (replaces with confirm if slot occupied). Employee → invalid. |
| Leader slot (detail pane) | Card gets dashed accent ring + tint | Employee → set as leader (replaces with confirm if slot occupied). Vehicle → invalid. |
| Members grid (detail pane) | Whole grid gets dashed ring + tint | Employee → add as regular member. Vehicle → invalid. |

### 6.3 Invalid hover
2px dashed `border-destructive/50` + faint red tint. Cursor stays `not-allowed`. dnd-kit's `useDroppable` `disabled` flag drives this per target.

### 6.4 Post-drop UX
- Drawer stays open by default — supports chained assignment.
- Toast appears: `{name} assigned to {team} — Undo`. Undo reverses the mutation via the inverse hook in `useDnDHandlers` (extend the existing handlers; no new mutations needed beyond exposing the inverse).

### 6.5 Accessibility
- Pools drawer traps focus while open; Esc closes (shadcn `Sheet` provides both).
- Left rail keyboard-navigable: ↑/↓ moves selection, Enter opens detail (it's already selected via URL/state — Enter just confirms).
- Add a `KeyboardSensor` to the existing `DndContext` so dnd-kit can be operated without a mouse (pick up with Space, move with arrows, drop with Space — dnd-kit default keys).

---

## 7. State & URL

- **Selected team** lives in URL: `/master-data/teams?team={id}`. Allows linking and back-button.
- **Search query** lives in URL: `?q=...` (debounced 200ms).
- **Pools drawer open/closed** lives in component state (not URL — ephemeral).
- **Activity log open/closed + filter + entity** lives in component state via the existing `useTeamsPage` `logPanel` slice. No URL change needed.
- **Expanded days** in the activity log: ephemeral component state. Always start collapsed when the sheet opens. Do not persist.

---

## 8. Components — Files & Responsibilities

New files:

| File | Purpose |
|---|---|
| `src/components/teams/v2/TopBar.tsx` | New top bar with title, counter text, search, New ▾ menu, icon actions. Replaces `src/components/teams/TopBar.tsx`. |
| `src/components/teams/v2/TeamList.tsx` | Left rail. Grouped team list with status dots. Selectable + drop target per row. |
| `src/components/teams/v2/TeamListRow.tsx` | Single team row. |
| `src/components/teams/v2/TeamDetail.tsx` | Right pane. Hero + slots + members + action footer. |
| `src/components/teams/v2/TeamDetailEmpty.tsx` | "Select a team" empty state. |
| `src/components/teams/v2/PoolsDrawer.tsx` | New collapsible pools drawer with Employees/Vehicles tabs + search. Replaces `PoolSidebar.tsx`. |
| `src/components/teams/v2/ActivityLog.tsx` | Day-grouped accordion timeline. Replaces `dialogs/ActivityLogPanel.tsx`. |
| `src/components/teams/v2/activitySentences.ts` | Pure function: `formatActivity(log) -> string`. Implements Section 5.3 mapper. |
| `src/components/teams/v2/teamStatus.ts` | Pure function: `teamStatus(team) -> 'green' \| 'amber' \| 'red' \| 'gray'`. |

Kept (used as-is or with minor tweaks):
- `TeamCard.tsx` — **delete**. Replaced by `TeamDetail.tsx`.
- `TeamRow.tsx` — **delete**. Replaced by `TeamListRow.tsx`.
- `TeamGrid.tsx` — **delete**. Replaced by `TeamList.tsx` + `TeamDetail.tsx` split.
- `VehiclePool.tsx`, `EmployeePool.tsx`, `EmployeeRow.tsx`, `PoolSidebar.tsx`, `StatusTabs.tsx` — **delete** (folded into `PoolsDrawer.tsx`).
- `LeaderSlot.tsx`, `VehicleSlot.tsx`, `MembersGrid.tsx` — restyle to new visual language; keep public props and dnd behavior.
- `TeamsPageContext.tsx` — keep; add `selectedTeamId`, `setSelectedTeamId`, `poolsDrawerOpen`, `togglePoolsDrawer`. Wire `selectedTeamId` to URL `?team=`.
- `useDnDHandlers.ts` — keep current handlers; extend with an `undo` callback returned from each handler for toast Undo.
- All dialogs unchanged.

`src/app/(dashboard)/master-data/teams/page.tsx` — replace the `<TeamGrid /> <PoolSidebar />` body with `<TeamList /> <TeamDetail /> <PoolsDrawer />` and the new `<TopBar />`. Keep `DndContext`, `DragOverlay`, sensors. Add `KeyboardSensor`.

---

## 9. Responsive Behavior

Per the project responsive rule (4 breakpoints):

| Breakpoint | Behavior |
|---|---|
| `<640px` (phone) | Top bar wraps to two rows: title row + actions row. Search collapses to icon. Left rail becomes a horizontal scroll strip of team chips above the detail pane. Pools drawer = full-screen sheet. Activity log = full-screen sheet. |
| `640–1024px` (tablet) | Left rail visible as `w-[260px]`. Detail pane scrolls. Pools drawer overlays as `w-[340px]`. |
| `1024–1920px` (laptop/desktop) | Layout as specified. Left rail `w-[300px]`. Pools drawer `w-[380px]`. Activity log `w-[420px]`. |
| `>1920px` (TV) | Left rail `w-[340px]`. Detail pane caps content width at `max-w-[960px]` and centers — avoids fields stretching absurdly wide. |

All touch targets ≥ `44px` on phone (`min-h-11`).

---

## 10. Data & Hooks (no schema changes)

- `useTeams({ search, divisionId })` — unchanged. Used by `TeamList`.
- `useEmployees()` / `useVehicles()` — unchanged. Used by `PoolsDrawer` and `DragOverlayContent`.
- `useTeamActivityLog(entityId?)` — unchanged. The new `ActivityLog` component groups events client-side by day.
- `useTeamActivityLogCount()` — unchanged. Drives the badge on the activity icon (top-bar `⏱` shows count only if > 0).
- Drawer-count badge on the `👥 Pools` icon = `unassignedEmployees.length + unassignedVehicles.length`, computed in `TopBar` via `useEmployees().filter(e => !e.team_id)` + `useVehicles().filter(v => !v.team_id)`.

---

## 11. Out of Scope (explicit)

- No realtime channel changes — existing channels keep their current shape per `docs/supabase-budget.md`.
- No new migrations.
- No changes to the underlying assignment mutations beyond exposing an `undo` callback.
- No bulk operations (multi-select). Single-item drag only.
- No persistent expanded-day state in the activity log.
- No "favorites" or "pinned teams" — left rail is grouped alphabetically inside Division.

---

## 12. Open Questions

None. All Section 1–5 questions answered in brainstorm.
