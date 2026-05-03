# Teams & Employee Page — Design Spec
**Date:** 2026-05-03  
**Route:** `/master-data/teams`  
**Status:** Approved — ready for implementation planning

---

## Overview

The single control room for every field-facing person and vehicle. Operators create, edit, assign, schedule, and archive teams, employees, vehicles and schedule templates. All reassignments are drag-and-drop and write to a dedicated activity log instantly.

**Architecture pattern:** React Context (`TeamsPageContext`) + feature hooks + `@dnd-kit/core`. Server state owned by TanStack Query; UI state (filters, dialog open/close) owned by context.

---

## 1. Database Migrations

Four migrations applied in order.

### Migration 1 — Extend `employees` table
```sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS site_visit_order      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS site_visit_quotation  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nationality           TEXT,
  ADD COLUMN IF NOT EXISTS join_date             DATE,
  ADD COLUMN IF NOT EXISTS avatar_url            TEXT;
```

### Migration 2 — `tool_assignments` table
```sql
CREATE TABLE tool_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_unit_id UUID NOT NULL REFERENCES tool_asset_units(id) ON DELETE CASCADE,
  assigned_to  TEXT NOT NULL CHECK (assigned_to IN ('team','employee')),
  team_id      UUID REFERENCES teams(id) ON DELETE SET NULL,
  employee_id  UUID REFERENCES employees(id) ON DELETE SET NULL,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes        TEXT,
  CONSTRAINT one_target CHECK (
    (team_id IS NOT NULL AND employee_id IS NULL) OR
    (employee_id IS NOT NULL AND team_id IS NULL)
  )
);
CREATE INDEX ON tool_assignments (team_id);
CREATE INDEX ON tool_assignments (employee_id);
```

### Migration 3 — `team_activity_log` table
```sql
CREATE TABLE team_activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,  -- 'team' | 'employee' | 'vehicle' | 'schedule'
  entity_id   UUID NOT NULL,
  before_data JSONB,
  after_data  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON team_activity_log (entity_id);
CREATE INDEX ON team_activity_log (created_at DESC);
```

**Action values:** `team-created`, `team-edited`, `team-archived`, `employee-created`, `employee-edited`, `employee-archived`, `employee-assigned`, `employee-removed`, `employee-status-changed`, `leader-assigned`, `leader-removed`, `vehicle-created`, `vehicle-edited`, `vehicle-archived`, `vehicle-assigned`, `vehicle-removed`, `schedule-created`, `schedule-edited`, `schedule-deleted`, `schedule-attached`, `schedule-detached`.

### Migration 4 — `schedules` + `team_schedule_assignments`
```sql
CREATE TABLE IF NOT EXISTS schedules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  days       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS team_schedule_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON team_schedule_assignments (team_id);
```

**`schedules.days` JSONB shape:**
```json
{
  "mon": { "enabled": true,  "start": "08:00", "end": "17:00", "break_minutes": 60 },
  "tue": { "enabled": true,  "start": "08:00", "end": "17:00", "break_minutes": 60 },
  "wed": { "enabled": true,  "start": "08:00", "end": "17:00", "break_minutes": 60 },
  "thu": { "enabled": true,  "start": "08:00", "end": "17:00", "break_minutes": 60 },
  "fri": { "enabled": false, "start": null,    "end": null,    "break_minutes": 0  },
  "sat": { "enabled": false, "start": null,    "end": null,    "break_minutes": 0  },
  "sun": { "enabled": false, "start": null,    "end": null,    "break_minutes": 0  }
}
```

---

## 2. Hooks Layer

All hooks live in `src/hooks/useTeams.ts`.

### Read hooks
| Hook | Source | Returns |
|---|---|---|
| `useTeams(filters?)` | `teams` + leader + members + vehicle + schedule | `TeamFull[]` |
| `useEmployees(filters?)` | `employees` with team_id, status | `Employee[]` |
| `useVehicles()` | `vehicles` with team_id | `Vehicle[]` |
| `useSchedules()` | `schedules` WHERE deleted_at IS NULL | `Schedule[]` |
| `useTeamScheduleAssignments(teamId)` | assignments for one team | `ScheduleAssignment[]` |
| `useToolAssignments(entityType, entityId)` | tools for team or employee | `ToolAssignment[]` |
| `useTeamActivityLog(entityId?)` | all logs or filtered | `ActivityLogEntry[]` |

### Mutation hooks
| Hook | DB effect |
|---|---|
| `useCreateTeam / useUpdateTeam / useArchiveTeam` | INSERT/UPDATE teams + log |
| `useCreateEmployee / useUpdateEmployee / useArchiveEmployee` | INSERT/UPDATE employees + log |
| `useCreateVehicle / useUpdateVehicle / useArchiveVehicle` | INSERT/UPDATE vehicles + log |
| `useAssignVehicleToTeam / useUnassignVehicle` | `vehicles.team_id` + log |
| `useAssignEmployeeToTeam / useUnassignEmployee` | `employees.team_id` + log |
| `useSetTeamLeader / useRemoveTeamLeader` | `teams.leader_id` + log |
| `useSetEmployeeStatus` | `employees.status`, `team_id=null` + log |
| `useCreateSchedule / useUpdateSchedule / useDeleteSchedule` | schedules CRUD |
| `useAttachSchedule / useDetachSchedule` | team_schedule_assignments + sync `teams.schedule_id` |
| `useLogActivity` | INSERT team_activity_log — called internally, never by consumer |

**Query invalidation:** Every mutation invalidates `['teams']`, `['employees']`, `['vehicles']` as appropriate. `['team-activity-log']` invalidates on every mutation so the Logs counter stays live.

---

## 3. Page Architecture & Component Tree

```
src/app/(dashboard)/master-data/teams/page.tsx
└── TeamsPageContext  (src/components/teams/TeamsPageContext.tsx)
    └── DndContext    (@dnd-kit/core — wraps entire page)
        ├── TopBar             (TopBar.tsx)
        ├── flex row layout
        │   ├── TeamGrid       (TeamGrid.tsx)          flex-1
        │   │   ├── GridToolbar
        │   │   └── TeamCard[] | TeamRow[]
        │   │       ├── TeamCardHeader
        │   │       ├── TeamCardIconStrip
        │   │       ├── VehicleSlot                   drop zone
        │   │       ├── LeaderSlot                    drop zone
        │   │       └── MembersGrid                   drop zone
        │   └── PoolSidebar    (PoolSidebar.tsx)       w-64
        │       ├── VehiclePool                       drop zone
        │       └── EmployeePool
        │           ├── StatusTabs (×5)               drop zones
        │           ├── Search input
        │           └── EmployeeRow[]                 draggable
        └── Dialogs (portaled at page root)
            ├── TeamEditDialog
            ├── EmployeeEditDialog
            ├── VehicleEditDialog
            ├── ScheduleDialog
            ├── ActivityLogPanel  (slide-over)
            └── EntityActivityLogDialog
```

### File structure
```
src/
  hooks/
    useTeams.ts
  components/teams/
    TeamsPageContext.tsx
    TopBar.tsx
    TeamGrid.tsx
    TeamCard.tsx
    TeamRow.tsx
    VehicleSlot.tsx
    LeaderSlot.tsx
    MembersGrid.tsx
    PoolSidebar.tsx
    VehiclePool.tsx
    EmployeePool.tsx
    StatusTabs.tsx
    EmployeeRow.tsx
    dialogs/
      TeamEditDialog.tsx
      EmployeeEditDialog.tsx
      VehicleEditDialog.tsx
      ScheduleDialog.tsx
      ActivityLogPanel.tsx
      EntityActivityLogDialog.tsx
  app/(dashboard)/master-data/teams/
    page.tsx
```

### Context shape
```ts
type TeamsPageContextValue = {
  // Dialog state
  teamDialog:     { open: boolean; team: TeamFull | null }
  employeeDialog: { open: boolean; employee: Employee | null }
  vehicleDialog:  { open: boolean; vehicle: Vehicle | null }
  scheduleDialog: { open: boolean; teamId: string | null }
  logPanel:       { open: boolean; entityId: string | null; entityType: string | null }

  // Filters
  searchQuery:     string
  divisionFilter:  string | null
  density:         'card' | 'list'

  // Dispatch
  openTeamDialog:     (team?: TeamFull) => void
  openEmployeeDialog: (employee?: Employee) => void
  openVehicleDialog:  (vehicle?: Vehicle) => void
  openScheduleDialog: (teamId?: string) => void
  openLogPanel:       (entityId?: string, entityType?: string) => void
  setSearch:          (q: string) => void
  setDivisionFilter:  (id: string | null) => void
  setDensity:         (d: 'card' | 'list') => void
}
```

---

## 4. Drag & Drop

**Library:** `@dnd-kit/core` + `@dnd-kit/utilities`

### Draggable payloads
```ts
type DragData =
  | { type: 'employee'; employeeId: string; fromTeamId: string | null }
  | { type: 'vehicle';  vehicleId: string;  fromTeamId: string | null }
```

### Drop zone payloads
```ts
type DropData =
  | { zone: 'team-members'; teamId: string }
  | { zone: 'team-leader';  teamId: string }
  | { zone: 'team-vehicle'; teamId: string }
  | { zone: 'vehicle-pool' }
  | { zone: 'status-tab';   status: EmployeeStatus }
```

### Handler matrix
| Drag → Drop | Handler | DB writes |
|---|---|---|
| employee → `team-members` | `handleDropEmployee` | `employees.team_id = teamId`, `status = 'active'` + log |
| employee → `team-leader` | `handleDropLeader` | `teams.leader_id = empId` + auto member-join + log |
| employee → `status-tab` | `handleDropToStatus` | `employees.team_id = null`, `status = tab.status` + log |
| vehicle → `team-vehicle` | `handleDropVehicleToTeam` | `vehicles.team_id = teamId` + log |
| vehicle → `vehicle-pool` | `handleDropVehicleToPool` | `vehicles.team_id = null` + log |

### Visual feedback
- Dragging source: `opacity-50`
- Valid drop target hovered: `ring-2 ring-primary bg-primary/5`
- Invalid combination: no highlight (checked in `onDragOver` via type guard)
- **DragOverlay:** floating chip clone following cursor (avatar for employee, plate chip for vehicle)

### `useDnDHandlers` interface
```ts
function useDnDHandlers(): {
  handleDragEnd: (event: DragEndEvent) => void
  activeItem:    DragData | null
}
```
Single `handleDragEnd` entry point reads `active.data.current` + `over.data.current` and routes to the correct mutation.

---

## 5. Dialogs

### TeamEditDialog
- **Fields:** Name EN (required), Name AR, Division (required, Select), Leader (employee Select), Phone, Emergency toggle, QC toggle, Traccar device
- **Constraint:** Emergency and QC are mutually exclusive — toggling one disables the other
- **Buttons:** Cancel | Archive (edit mode only → `deleted_at = now()`) | Save

### EmployeeEditDialog
- **Fields:** Name (required), Phone, Nationality, Join date, Status (Select), Avatar upload (`employee-avatars` Supabase bucket), Skills (multi-select of active services via `useServicesForLinks`), `site_visit_order` toggle, `site_visit_quotation` toggle
- **Skills:** delete-all + re-insert into `employee_services` on save
- **Buttons:** Cancel | Archive | Save

### VehicleEditDialog
- **Fields:** Type (Select: car/van/truck/pickup/motorcycle), Plate (required, unique — validated on blur), Traccar device
- **Buttons:** Cancel | Archive | Save

### ScheduleDialog — two modes

**List mode** (from TopBar):
- Table: all non-deleted schedules, name + day grid
- Per row: Edit (inline ScheduleForm) | Delete (sets `deleted_at`)
- ScheduleForm fields: Name + 7 day rows (enabled toggle + start_time + end_time + break_minutes)
- "+ New Schedule" button at top

**Team-attachment mode** (from TeamCard calendar icon):
- Lists `team_schedule_assignments` for that team ordered by `start_date`
- Assignment card: schedule name, start→end dates, day badges, status chip (Active / Upcoming / Past)
- Past assignments: read-only (immutable history)
- Future/active: Edit + Detach buttons
- "+ Attach Schedule": Select schedule + start_date + optional end_date → `useAttachSchedule` → syncs `teams.schedule_id` to current active assignment

### ActivityLogPanel (right slide-over, `w-96`)
- Full log stream: actor name, action label, entity type + name, relative timestamp, before/after JSON diff
- Filter chips: All | Teams | Employees | Vehicles | Schedules
- Triggered from TopBar "Logs (N)" button; N = total `team_activity_log` count

### EntityActivityLogDialog (modal)
- Same log content scoped to one entity
- Opened from 🕘 buttons on TeamCard, EmployeeRow, VehicleChip
- Title: "Activity — {entity name}"

---

## 6. TopBar

**Left cluster:**
| Element | Data source |
|---|---|
| 👥 "Team & Employee" | Static H1 |
| N teams (gray badge) | `useTeams().data.length` |
| N employees (outline badge) | `useEmployees().data.length` |
| N vehicles (outline badge) | `useVehicles().data.length` |

**Right cluster (left → right):**
| Button | Action |
|---|---|
| Logs (N) | Opens ActivityLogPanel slide-over; N = `useTeamActivityLog().data.length` |
| Schedules | Opens ScheduleDialog in list mode |
| Add Vehicle | Opens VehicleEditDialog blank |
| Add Employee | Opens EmployeeEditDialog blank |
| Add Team (primary) | Opens TeamEditDialog blank |

---

## 7. TeamCard (card view)

**Header strip:**
- Team name (bold, truncated)
- Capability badges: NRM (gray) / EMR (red) / QC (purple) — mutually exclusive; SVO (blue) if any member has `site_visit_order`; SVC (teal) if any member has `site_visit_quotation`
- Division badge (colored chip)

**Icon strip:** Phone tooltip | Calendar + schedule name (→ ScheduleDialog team mode) | Tools popover (count from `useToolAssignments('team', id)`) | 🕘 log | ✏️ edit

**Vehicle slot:** drop zone for `{ type: 'vehicle' }`. Empty = italic "Drop vehicle". Filled = 🚚 + plate chip + 📡 if Traccar. Hover reveals 🕘 + ✕ (unassign). Plate chip itself is draggable.

**Leader slot:** drop zone for `{ type: 'employee' }`. Empty = italic "Drop leader". Filled = 👑 + avatar + name + tools count. Hover reveals 🕘 + ✏️ + 👤➖ (remove leader).

**Members grid:** drop zone for `{ type: 'employee' }`. Empty = dashed "Drop employees here". Filled = row of 24 px circular avatars, max 8; +N pill for overflow; each avatar draggable; tiny 🛠 badge if employee has tools.

**TeamRow (compact/list view):** same data as a single horizontal row; all drop zones and drag behaviors identical.

---

## 8. PoolSidebar

### VehiclePool
- Header: 🚚 "Vehicle Pool · N available" (count where `vehicles.team_id IS NULL`)
- Drop zone for `{ type: 'vehicle' }` → `handleDropVehicleToPool`
- Empty: dashed "Drop vehicles here to unassign"
- VehicleChip: ⋮⋮ grip + 🚚 + type + plate + 📡 badge. Hover → 🕘. Draggable onto TeamCard vehicle slot.

### EmployeePool

**Status tabs (5):**
| Tab | Icon | Filter | Drop effect |
|---|---|---|---|
| Unassigned | UserX | `status='unassigned' AND team_id IS NULL` | `status='unassigned'` |
| Vacation | PalmTree | `status='vacation' AND team_id IS NULL` | `status='vacation'` |
| On Task | Briefcase | `status='on-task' AND team_id IS NULL` | `status='on-task'` |
| Archive | Archive | `status='archived'` | soft-archive employee |
| All | Users | all pool employees | read-only, no drop |

Each tab: count badge + highlights when active + acts as a drop zone.

**Employee search:** name or phone substring filter on visible tab list.

**EmployeeRow:** ⋮⋮ grip | Avatar (initials fallback) | Name | 🛠 tools popover | Status badge | 🕘 (hover) | ✏️ (hover). Entire row draggable.

---

## 9. Downstream integrations (read-only notes, no work needed in this phase)

| Module | What it reads |
|---|---|
| Calendar / Scheduling | `teams` + active schedule; `employee_services` for auto-assign |
| Orders / Visits | `team_id`; `is_emergency`; `is_qc`; `site_visit_order`; `site_visit_quotation` |
| Map | `team_live_locations` joined to `teams.traccar_device_id` |
| Team Leader app | `useTeamLeaderIdentity` → profile → employee → leader team |
| Inventory / Tools | `tool_assignments` per team/employee |
| Contact Center | `teams.phone` as WhatsApp endpoint |
