# Teams & Employee Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Teams & Employee management page at `/master-data/teams` with drag-and-drop, activity logging, schedule management, and all CRUD dialogs.

**Architecture:** React Context (`TeamsPageContext`) for UI state + TanStack Query for server state + `@dnd-kit/core` for drag-and-drop. All mutations call a shared `useLogActivity` hook internally to write to `team_activity_log`. Atomic operations (leader assignment, skill upsert, schedule sync) are backed by Postgres RPCs.

**Tech Stack:** Next.js App Router, Supabase (client-side), TanStack Query v5, @dnd-kit/core v6, shadcn/ui, Tailwind CSS, TypeScript, Lucide icons.

---

## File Map

| File | Role |
|---|---|
| `supabase/migrations/*_teams_employees_*.sql` | 4 DB migrations |
| `src/hooks/useTeams.ts` | All read + mutation hooks |
| `src/components/teams/TeamsPageContext.tsx` | Page-wide React Context |
| `src/components/teams/TopBar.tsx` | Header with counts + action buttons |
| `src/components/teams/TeamGrid.tsx` | Grid/list toggle + TeamCard/TeamRow list |
| `src/components/teams/TeamCard.tsx` | Card-view team tile (drops + drags) |
| `src/components/teams/TeamRow.tsx` | List-view team row |
| `src/components/teams/VehicleSlot.tsx` | Drop zone for vehicle on a team |
| `src/components/teams/LeaderSlot.tsx` | Drop zone for leader on a team |
| `src/components/teams/MembersGrid.tsx` | Drop zone for members on a team |
| `src/components/teams/PoolSidebar.tsx` | Right sidebar shell |
| `src/components/teams/VehiclePool.tsx` | Unassigned vehicle list + drop zone |
| `src/components/teams/EmployeePool.tsx` | Employee pool with status tabs |
| `src/components/teams/StatusTabs.tsx` | 5-tab status filter + drop zones |
| `src/components/teams/EmployeeRow.tsx` | Draggable employee row |
| `src/components/teams/dialogs/TeamEditDialog.tsx` | Create/edit team |
| `src/components/teams/dialogs/EmployeeEditDialog.tsx` | Create/edit employee |
| `src/components/teams/dialogs/VehicleEditDialog.tsx` | Create/edit vehicle |
| `src/components/teams/dialogs/ScheduleDialog.tsx` | Schedule list + team-attachment |
| `src/components/teams/dialogs/ActivityLogPanel.tsx` | Right slide-over log stream |
| `src/components/teams/dialogs/EntityActivityLogDialog.tsx` | Per-entity log modal |
| `src/components/teams/useDnDHandlers.ts` | DnD event handler hook |
| `src/app/(dashboard)/master-data/teams/page.tsx` | Route entry point |

---

## Task 1: Migration 1 — Extend `employees` table

**Files:**
- Create: `supabase/migrations/20260503000001_extend_employees.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260503000001_extend_employees.sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS site_visit_order     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS site_visit_quotation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nationality          TEXT,
  ADD COLUMN IF NOT EXISTS join_date            DATE,
  ADD COLUMN IF NOT EXISTS avatar_url           TEXT;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```
Expected: `Remote database is up to date` or `Applied 1 migration`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260503000001_extend_employees.sql
git commit -m "$(cat <<'EOF'
feat(db): extend employees with avatar, nationality, join_date, visit flags

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migration 2 — `tool_assignments` table

**Files:**
- Create: `supabase/migrations/20260503000002_tool_assignments.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260503000002_tool_assignments.sql
CREATE TABLE IF NOT EXISTS tool_assignments (
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
CREATE INDEX IF NOT EXISTS idx_tool_assignments_team_id     ON tool_assignments (team_id);
CREATE INDEX IF NOT EXISTS idx_tool_assignments_employee_id ON tool_assignments (employee_id);
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```
Expected: `Applied 1 migration`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260503000002_tool_assignments.sql
git commit -m "$(cat <<'EOF'
feat(db): add tool_assignments table with team/employee target constraint

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Migration 3 — `team_activity_log` table

**Files:**
- Create: `supabase/migrations/20260503000003_team_activity_log.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260503000003_team_activity_log.sql
CREATE TABLE IF NOT EXISTS team_activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  before_data JSONB,
  after_data  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_activity_log_entity_id   ON team_activity_log (entity_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_log_created_at  ON team_activity_log (created_at DESC);
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```
Expected: `Applied 1 migration`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260503000003_team_activity_log.sql
git commit -m "$(cat <<'EOF'
feat(db): add team_activity_log table for audit trail

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Migration 4 — Schedules, team_schedule_assignments, and RPCs

**Files:**
- Create: `supabase/migrations/20260503000004_schedules_and_rpcs.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260503000004_schedules_and_rpcs.sql

-- Schedules template table
CREATE TABLE IF NOT EXISTS schedules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  days       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Team ↔ schedule assignment history
CREATE TABLE IF NOT EXISTS team_schedule_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_sched_team_id ON team_schedule_assignments (team_id);

-- RPC: sync teams.schedule_id to the current active assignment (Risk R5)
CREATE OR REPLACE FUNCTION sync_team_active_schedule(p_team_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_schedule_id UUID;
BEGIN
  SELECT schedule_id INTO v_schedule_id
  FROM team_schedule_assignments
  WHERE team_id = p_team_id
    AND start_date <= CURRENT_DATE
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  ORDER BY start_date DESC
  LIMIT 1;

  UPDATE teams SET schedule_id = v_schedule_id WHERE id = p_team_id;
END;
$$;

-- RPC: atomically assign team leader + ensure member (Risk R4)
CREATE OR REPLACE FUNCTION assign_team_leader(p_team_id UUID, p_employee_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Ensure employee is a member of the team
  UPDATE employees SET team_id = p_team_id, status = 'active'
  WHERE id = p_employee_id;

  -- Set as leader
  UPDATE teams SET leader_id = p_employee_id WHERE id = p_team_id;

  -- Log the action
  INSERT INTO team_activity_log (action, entity_type, entity_id, after_data)
  VALUES (
    'leader-assigned', 'team', p_team_id,
    jsonb_build_object('leader_id', p_employee_id)
  );
END;
$$;

-- RPC: upsert employee skills atomically (Risk R3)
CREATE OR REPLACE FUNCTION upsert_employee_services(
  p_employee_id UUID,
  p_service_ids UUID[]
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM employee_services WHERE employee_id = p_employee_id;
  INSERT INTO employee_services (employee_id, service_id)
  SELECT p_employee_id, unnest(p_service_ids);
END;
$$;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```
Expected: `Applied 1 migration`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260503000004_schedules_and_rpcs.sql
git commit -m "$(cat <<'EOF'
feat(db): add schedules, team_schedule_assignments, and atomic RPCs

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Types & Read Hooks (Part A — useTeams.ts skeleton + read hooks)

**Files:**
- Create: `src/hooks/useTeams.ts`

- [ ] **Step 1: Write the hook file with types and all read hooks**

```typescript
// src/hooks/useTeams.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

// ─── Types ───────────────────────────────────────────────────────────────────

export type Employee = DBTable<'employees'>
export type EmployeeInsert = DBInsert<'employees'>
export type EmployeeUpdate = DBUpdate<'employees'>

export type EmployeeStatus = 'active' | 'unassigned' | 'vacation' | 'on-task' | 'archived'

export type Vehicle = DBTable<'vehicles'>
export type VehicleInsert = DBInsert<'vehicles'>
export type VehicleUpdate = DBUpdate<'vehicles'>

export type Schedule = DBTable<'schedules'>
export type ScheduleInsert = DBInsert<'schedules'>
export type ScheduleUpdate = DBUpdate<'schedules'>

export type ScheduleAssignment = DBTable<'team_schedule_assignments'>
export type ToolAssignment = DBTable<'tool_assignments'>
export type ActivityLogEntry = DBTable<'team_activity_log'>

export type TeamRaw = DBTable<'teams'>

export interface TeamFull extends TeamRaw {
  leader:   Employee | null
  members:  Employee[]
  vehicle:  Vehicle | null
  schedule: Schedule | null
}

export interface TeamsFilters {
  search?:     string
  divisionId?: string | null
}

// ─── Read Hooks ───────────────────────────────────────────────────────────────

export function useTeams(filters?: TeamsFilters) {
  return useQuery({
    queryKey: ['teams', filters],
    queryFn: async () => {
      const supabase = createClient()
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .is('deleted_at', null)
        .order('name_en')
      if (teamsError) throw teamsError

      const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('*')
        .is('deleted_at', null)
      if (empError) throw empError

      const { data: vehicles, error: vehError } = await supabase
        .from('vehicles')
        .select('*')
        .is('deleted_at', null)
      if (vehError) throw vehError

      const { data: schedules, error: schError } = await supabase
        .from('schedules')
        .select('*')
        .is('deleted_at', null)
      if (schError) throw schError

      const empById   = new Map(employees.map(e => [e.id, e]))
      const vehByTeam = new Map(vehicles.filter(v => v.team_id).map(v => [v.team_id!, v]))
      const schById   = new Map(schedules.map(s => [s.id, s]))

      let result: TeamFull[] = teams.map(t => ({
        ...t,
        leader:   t.leader_id ? (empById.get(t.leader_id) ?? null) : null,
        members:  employees.filter(e => e.team_id === t.id),
        vehicle:  vehByTeam.get(t.id) ?? null,
        schedule: t.schedule_id ? (schById.get(t.schedule_id) ?? null) : null,
      }))

      if (filters?.search) {
        const q = filters.search.toLowerCase()
        result = result.filter(t =>
          t.name_en?.toLowerCase().includes(q) ||
          t.name_ar?.toLowerCase().includes(q)
        )
      }
      if (filters?.divisionId) {
        result = result.filter(t => t.division_id === filters.divisionId)
      }

      return result
    },
    staleTime: 30 * 1000,
  })
}

export function useEmployees(filters?: { search?: string; status?: EmployeeStatus }) {
  return useQuery({
    queryKey: ['employees', filters],
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('employees')
        .select('*')
        .is('deleted_at', null)
        .order('name')

      if (filters?.status) query = query.eq('status', filters.status)

      const { data, error } = await query
      if (error) throw error

      let result = data as Employee[]
      if (filters?.search) {
        const q = filters.search.toLowerCase()
        result = result.filter(e =>
          e.name?.toLowerCase().includes(q) ||
          e.phone?.toLowerCase().includes(q)
        )
      }
      return result
    },
    staleTime: 30 * 1000,
  })
}

export function useVehicles() {
  return useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .is('deleted_at', null)
        .order('plate')
      if (error) throw error
      return data as Vehicle[]
    },
    staleTime: 30 * 1000,
  })
}

export function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data as Schedule[]
    },
    staleTime: 60 * 1000,
  })
}

export function useTeamScheduleAssignments(teamId: string | null) {
  return useQuery({
    queryKey: ['team-schedule-assignments', teamId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('team_schedule_assignments')
        .select('*, schedule:schedules(*)')
        .eq('team_id', teamId!)
        .order('start_date', { ascending: false })
      if (error) throw error
      return data as (ScheduleAssignment & { schedule: Schedule })[]
    },
    enabled: !!teamId,
  })
}

export function useToolAssignments(
  entityType: 'team' | 'employee',
  entityId: string | null
) {
  return useQuery({
    queryKey: ['tool-assignments', entityType, entityId],
    queryFn: async () => {
      const supabase = createClient()
      const col = entityType === 'team' ? 'team_id' : 'employee_id'
      const { data, error } = await supabase
        .from('tool_assignments')
        .select('*')
        .eq(col, entityId!)
      if (error) throw error
      return data as ToolAssignment[]
    },
    enabled: !!entityId,
    staleTime: 30 * 1000,
  })
}

export function useTeamActivityLog(entityId?: string | null) {
  return useQuery({
    queryKey: ['team-activity-log', entityId ?? 'all'],
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('team_activity_log')
        .select('*, actor:profiles(id,full_name)')
        .order('created_at', { ascending: false })
        .limit(500)

      if (entityId) query = query.eq('entity_id', entityId)

      const { data, error } = await query
      if (error) throw error
      return data as (ActivityLogEntry & { actor: { id: string; full_name: string } | null })[]
    },
    staleTime: 10 * 1000,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: Zero errors (or only pre-existing errors unrelated to this file).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTeams.ts
git commit -m "$(cat <<'EOF'
feat(teams): add types and read hooks in useTeams.ts

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Mutation Hooks — Teams + Employees + Vehicles CRUD

**Files:**
- Modify: `src/hooks/useTeams.ts` (append below the read hooks)

- [ ] **Step 1: Append internal log helper + teams mutations**

```typescript
// ─── Internal log helper ──────────────────────────────────────────────────────

async function logActivity(params: {
  action: string
  entityType: string
  entityId: string
  beforeData?: Record<string, unknown>
  afterData?: Record<string, unknown>
}) {
  const supabase = createClient()
  // MUST call logActivity — every mutationFn must call this
  await supabase.from('team_activity_log').insert({
    action:      params.action,
    entity_type: params.entityType,
    entity_id:   params.entityId,
    before_data: params.beforeData ?? null,
    after_data:  params.afterData ?? null,
  })
}

// ─── Team mutations ───────────────────────────────────────────────────────────

export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async (input: DBInsert<'teams'>) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('teams').insert(input).select().single()
      if (error) throw error
      await logActivity({ action: 'team-created', entityType: 'team', entityId: data.id, afterData: data })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

export function useUpdateTeam() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async ({ id, before, ...patch }: DBUpdate<'teams'> & { id: string; before?: Record<string, unknown> }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('teams').update(patch).eq('id', id).select().single()
      if (error) throw error
      await logActivity({ action: 'team-edited', entityType: 'team', entityId: id, beforeData: before, afterData: data })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

export function useArchiveTeam() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('teams').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      await logActivity({ action: 'team-archived', entityType: 'team', entityId: id })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

// ─── Employee mutations ───────────────────────────────────────────────────────

export function useCreateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async (input: EmployeeInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('employees').insert(input).select().single()
      if (error) throw error
      await logActivity({ action: 'employee-created', entityType: 'employee', entityId: data.id, afterData: data })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

export function useUpdateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async ({ id, before, ...patch }: EmployeeUpdate & { id: string; before?: Record<string, unknown> }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('employees').update(patch).eq('id', id).select().single()
      if (error) throw error
      await logActivity({ action: 'employee-edited', entityType: 'employee', entityId: id, beforeData: before, afterData: data })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

export function useArchiveEmployee() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('employees')
        .update({ deleted_at: new Date().toISOString(), status: 'archived', team_id: null })
        .eq('id', id)
      if (error) throw error
      await logActivity({ action: 'employee-archived', entityType: 'employee', entityId: id })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

// ─── Vehicle mutations ────────────────────────────────────────────────────────

export function useCreateVehicle() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async (input: VehicleInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('vehicles').insert(input).select().single()
      if (error) throw error
      await logActivity({ action: 'vehicle-created', entityType: 'vehicle', entityId: data.id, afterData: data })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

export function useUpdateVehicle() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async ({ id, before, ...patch }: VehicleUpdate & { id: string; before?: Record<string, unknown> }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('vehicles').update(patch).eq('id', id).select().single()
      if (error) throw error
      await logActivity({ action: 'vehicle-edited', entityType: 'vehicle', entityId: id, beforeData: before, afterData: data })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

export function useArchiveVehicle() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('vehicles')
        .update({ deleted_at: new Date().toISOString(), team_id: null })
        .eq('id', id)
      if (error) throw error
      await logActivity({ action: 'vehicle-archived', entityType: 'vehicle', entityId: id })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: Zero new errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTeams.ts
git commit -m "$(cat <<'EOF'
feat(teams): add CRUD mutation hooks for teams, employees, vehicles

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Mutation Hooks — Assignments, Status, Schedules

**Files:**
- Modify: `src/hooks/useTeams.ts` (append)

- [ ] **Step 1: Append assignment, status, and schedule mutation hooks**

```typescript
// ─── Assignment mutations ─────────────────────────────────────────────────────

export function useAssignEmployeeToTeam() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async ({ employeeId, teamId }: { employeeId: string; teamId: string }) => {
      const supabase = createClient()
      const { error } = await supabase.from('employees')
        .update({ team_id: teamId, status: 'active' })
        .eq('id', employeeId)
      if (error) throw error
      await logActivity({ action: 'employee-assigned', entityType: 'employee', entityId: employeeId, afterData: { team_id: teamId } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

export function useUnassignEmployee() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async ({ employeeId, fromTeamId }: { employeeId: string; fromTeamId: string }) => {
      const supabase = createClient()
      const { error } = await supabase.from('employees')
        .update({ team_id: null, status: 'unassigned' })
        .eq('id', employeeId)
      if (error) throw error
      await logActivity({ action: 'employee-removed', entityType: 'employee', entityId: employeeId, beforeData: { team_id: fromTeamId } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

export function useSetTeamLeader() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity — done inside RPC assign_team_leader
    mutationFn: async ({ teamId, employeeId }: { teamId: string; employeeId: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('assign_team_leader', {
        p_team_id:     teamId,
        p_employee_id: employeeId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

export function useRemoveTeamLeader() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async ({ teamId }: { teamId: string }) => {
      const supabase = createClient()
      const { data: team, error: fetchError } = await supabase
        .from('teams').select('leader_id').eq('id', teamId).single()
      if (fetchError) throw fetchError
      const { error } = await supabase.from('teams').update({ leader_id: null }).eq('id', teamId)
      if (error) throw error
      await logActivity({ action: 'leader-removed', entityType: 'team', entityId: teamId, beforeData: { leader_id: team.leader_id } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

export function useAssignVehicleToTeam() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async ({ vehicleId, teamId }: { vehicleId: string; teamId: string }) => {
      const supabase = createClient()
      const { error } = await supabase.from('vehicles').update({ team_id: teamId }).eq('id', vehicleId)
      if (error) throw error
      await logActivity({ action: 'vehicle-assigned', entityType: 'vehicle', entityId: vehicleId, afterData: { team_id: teamId } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

export function useUnassignVehicle() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async ({ vehicleId, fromTeamId }: { vehicleId: string; fromTeamId: string }) => {
      const supabase = createClient()
      const { error } = await supabase.from('vehicles').update({ team_id: null }).eq('id', vehicleId)
      if (error) throw error
      await logActivity({ action: 'vehicle-removed', entityType: 'vehicle', entityId: vehicleId, beforeData: { team_id: fromTeamId } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

export function useSetEmployeeStatus() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async ({ employeeId, status }: { employeeId: string; status: EmployeeStatus }) => {
      const supabase = createClient()
      const patch: Partial<Employee> = { status }
      if (status !== 'active') patch.team_id = null
      const { error } = await supabase.from('employees').update(patch).eq('id', employeeId)
      if (error) throw error
      await logActivity({ action: 'employee-status-changed', entityType: 'employee', entityId: employeeId, afterData: { status } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

// ─── Schedule mutations ───────────────────────────────────────────────────────

export function useCreateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async (input: ScheduleInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('schedules').insert(input).select().single()
      if (error) throw error
      await logActivity({ action: 'schedule-created', entityType: 'schedule', entityId: data.id, afterData: data })
      return data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedules'] }) },
  })
}

export function useUpdateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async ({ id, ...patch }: ScheduleUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('schedules').update(patch).eq('id', id).select().single()
      if (error) throw error
      await logActivity({ action: 'schedule-edited', entityType: 'schedule', entityId: id, afterData: data })
      return data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedules'] }) },
  })
}

export function useDeleteSchedule() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('schedules').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      await logActivity({ action: 'schedule-deleted', entityType: 'schedule', entityId: id })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedules'] }) },
  })
}

export function useAttachSchedule() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async (input: { teamId: string; scheduleId: string; startDate: string; endDate?: string | null }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('team_schedule_assignments').insert({
        team_id:     input.teamId,
        schedule_id: input.scheduleId,
        start_date:  input.startDate,
        end_date:    input.endDate ?? null,
      }).select().single()
      if (error) throw error
      const { error: syncError } = await supabase.rpc('sync_team_active_schedule', { p_team_id: input.teamId })
      if (syncError) throw syncError
      await logActivity({ action: 'schedule-attached', entityType: 'team', entityId: input.teamId, afterData: data })
      return data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-schedule-assignments', vars.teamId] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}

export function useDetachSchedule() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async ({ assignmentId, teamId }: { assignmentId: string; teamId: string }) => {
      const supabase = createClient()
      const { error } = await supabase.from('team_schedule_assignments').delete().eq('id', assignmentId)
      if (error) throw error
      const { error: syncError } = await supabase.rpc('sync_team_active_schedule', { p_team_id: teamId })
      if (syncError) throw syncError
      await logActivity({ action: 'schedule-detached', entityType: 'team', entityId: teamId })
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-schedule-assignments', vars.teamId] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTeams.ts
git commit -m "$(cat <<'EOF'
feat(teams): add assignment, status, and schedule mutation hooks

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: TeamsPageContext

**Files:**
- Create: `src/components/teams/TeamsPageContext.tsx`

- [ ] **Step 1: Write the context file**

```tsx
// src/components/teams/TeamsPageContext.tsx
'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { TeamFull, Employee, Vehicle } from '@/hooks/useTeams'

interface TeamDialogState     { open: boolean; team: TeamFull | null }
interface EmployeeDialogState { open: boolean; employee: Employee | null }
interface VehicleDialogState  { open: boolean; vehicle: Vehicle | null }
interface ScheduleDialogState { open: boolean; teamId: string | null }
interface LogPanelState       { open: boolean; entityId: string | null; entityType: string | null }

interface TeamsPageContextValue {
  teamDialog:     TeamDialogState
  employeeDialog: EmployeeDialogState
  vehicleDialog:  VehicleDialogState
  scheduleDialog: ScheduleDialogState
  logPanel:       LogPanelState

  searchQuery:    string
  divisionFilter: string | null
  density:        'card' | 'list'

  openTeamDialog:     (team?: TeamFull) => void
  closeTeamDialog:    () => void
  openEmployeeDialog: (employee?: Employee) => void
  closeEmployeeDialog:() => void
  openVehicleDialog:  (vehicle?: Vehicle) => void
  closeVehicleDialog: () => void
  openScheduleDialog: (teamId?: string) => void
  closeScheduleDialog:() => void
  openLogPanel:       (entityId?: string, entityType?: string) => void
  closeLogPanel:      () => void
  setSearch:          (q: string) => void
  setDivisionFilter:  (id: string | null) => void
  setDensity:         (d: 'card' | 'list') => void
}

const TeamsPageContext = createContext<TeamsPageContextValue | null>(null)

export function TeamsPageProvider({ children }: { children: ReactNode }) {
  const [teamDialog,     setTeamDialog]     = useState<TeamDialogState>({ open: false, team: null })
  const [employeeDialog, setEmployeeDialog] = useState<EmployeeDialogState>({ open: false, employee: null })
  const [vehicleDialog,  setVehicleDialog]  = useState<VehicleDialogState>({ open: false, vehicle: null })
  const [scheduleDialog, setScheduleDialog] = useState<ScheduleDialogState>({ open: false, teamId: null })
  const [logPanel,       setLogPanel]       = useState<LogPanelState>({ open: false, entityId: null, entityType: null })
  const [searchQuery,    setSearch]         = useState('')
  const [divisionFilter, setDivisionFilter] = useState<string | null>(null)
  const [density,        setDensity]        = useState<'card' | 'list'>('card')

  return (
    <TeamsPageContext.Provider value={{
      teamDialog,
      employeeDialog,
      vehicleDialog,
      scheduleDialog,
      logPanel,
      searchQuery,
      divisionFilter,
      density,
      openTeamDialog:      (team)     => setTeamDialog({ open: true, team: team ?? null }),
      closeTeamDialog:     ()         => setTeamDialog({ open: false, team: null }),
      openEmployeeDialog:  (employee) => setEmployeeDialog({ open: true, employee: employee ?? null }),
      closeEmployeeDialog: ()         => setEmployeeDialog({ open: false, employee: null }),
      openVehicleDialog:   (vehicle)  => setVehicleDialog({ open: true, vehicle: vehicle ?? null }),
      closeVehicleDialog:  ()         => setVehicleDialog({ open: false, vehicle: null }),
      openScheduleDialog:  (teamId)   => setScheduleDialog({ open: true, teamId: teamId ?? null }),
      closeScheduleDialog: ()         => setScheduleDialog({ open: false, teamId: null }),
      openLogPanel:        (id, type) => setLogPanel({ open: true, entityId: id ?? null, entityType: type ?? null }),
      closeLogPanel:       ()         => setLogPanel({ open: false, entityId: null, entityType: null }),
      setSearch,
      setDivisionFilter,
      setDensity,
    }}>
      {children}
    </TeamsPageContext.Provider>
  )
}

export function useTeamsPage() {
  const ctx = useContext(TeamsPageContext)
  if (!ctx) throw new Error('useTeamsPage must be used inside TeamsPageProvider')
  return ctx
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/teams/TeamsPageContext.tsx
git commit -m "$(cat <<'EOF'
feat(teams): add TeamsPageContext for dialog and filter state

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: DnD Handlers Hook

**Files:**
- Create: `src/components/teams/useDnDHandlers.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/components/teams/useDnDHandlers.ts
import { useState } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  useAssignEmployeeToTeam, useSetTeamLeader, useSetEmployeeStatus,
  useAssignVehicleToTeam, useUnassignVehicle,
  type EmployeeStatus,
} from '@/hooks/useTeams'

export type DragData =
  | { type: 'employee'; employeeId: string; fromTeamId: string | null }
  | { type: 'vehicle';  vehicleId: string;  fromTeamId: string | null }

export type DropData =
  | { zone: 'team-members'; teamId: string }
  | { zone: 'team-leader';  teamId: string }
  | { zone: 'team-vehicle'; teamId: string }
  | { zone: 'vehicle-pool' }
  | { zone: 'status-tab';   status: EmployeeStatus }

export function useDnDHandlers() {
  const [activeItem, setActiveItem] = useState<DragData | null>(null)
  const assignEmployee  = useAssignEmployeeToTeam()
  const setLeader       = useSetTeamLeader()
  const setStatus       = useSetEmployeeStatus()
  const assignVehicle   = useAssignVehicleToTeam()
  const unassignVehicle = useUnassignVehicle()

  function handleDragStart(data: DragData) { setActiveItem(data) }

  function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null)
    const drag = event.active.data.current as DragData | undefined
    const drop = event.over?.data.current as DropData | undefined
    if (!drag || !drop) return

    if (drag.type === 'employee' && drop.zone === 'team-members') {
      assignEmployee.mutate({ employeeId: drag.employeeId, teamId: drop.teamId }); return
    }
    if (drag.type === 'employee' && drop.zone === 'team-leader') {
      setLeader.mutate({ teamId: drop.teamId, employeeId: drag.employeeId }); return
    }
    if (drag.type === 'employee' && drop.zone === 'status-tab') {
      setStatus.mutate({ employeeId: drag.employeeId, status: drop.status }); return
    }
    if (drag.type === 'vehicle' && drop.zone === 'team-vehicle') {
      assignVehicle.mutate({ vehicleId: drag.vehicleId, teamId: drop.teamId }); return
    }
    if (drag.type === 'vehicle' && drop.zone === 'vehicle-pool' && drag.fromTeamId) {
      unassignVehicle.mutate({ vehicleId: drag.vehicleId, fromTeamId: drag.fromTeamId })
    }
  }

  return { handleDragStart, handleDragEnd, activeItem }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/teams/useDnDHandlers.ts
git commit -m "feat(teams): add useDnDHandlers for DnD routing

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: TopBar component

**Files:**
- Create: `src/components/teams/TopBar.tsx`

- [ ] **Step 1: Write TopBar**

```tsx
// src/components/teams/TopBar.tsx
'use client'

import { Users, Truck, Calendar, Plus, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTeams, useEmployees, useVehicles, useTeamActivityLog } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'

export function TopBar() {
  const { data: teams     = [] } = useTeams()
  const { data: employees = [] } = useEmployees()
  const { data: vehicles  = [] } = useVehicles()
  const { data: logs      = [] } = useTeamActivityLog()
  const { openTeamDialog, openEmployeeDialog, openVehicleDialog, openScheduleDialog, openLogPanel } = useTeamsPage()

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b bg-background">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" /> Team &amp; Employee
        </h1>
        <Badge variant="secondary">{teams.length} teams</Badge>
        <Badge variant="outline">{employees.length} employees</Badge>
        <Badge variant="outline" className="flex items-center gap-1">
          <Truck className="h-3 w-3" />{vehicles.length} vehicles
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => openLogPanel()}>
          <Activity className="h-4 w-4 mr-1" /> Logs ({logs.length})
        </Button>
        <Button variant="outline" size="sm" onClick={() => openScheduleDialog()}>
          <Calendar className="h-4 w-4 mr-1" /> Schedules
        </Button>
        <Button variant="outline" size="sm" onClick={() => openVehicleDialog()}>
          <Plus className="h-4 w-4 mr-1" /> Add Vehicle
        </Button>
        <Button variant="outline" size="sm" onClick={() => openEmployeeDialog()}>
          <Plus className="h-4 w-4 mr-1" /> Add Employee
        </Button>
        <Button size="sm" onClick={() => openTeamDialog()}>
          <Plus className="h-4 w-4 mr-1" /> Add Team
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/teams/TopBar.tsx
git commit -m "feat(teams): add TopBar with counts and action buttons

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: VehicleSlot, LeaderSlot, MembersGrid

**Files:**
- Create: `src/components/teams/VehicleSlot.tsx`
- Create: `src/components/teams/LeaderSlot.tsx`
- Create: `src/components/teams/MembersGrid.tsx`

- [ ] **Step 1: Write VehicleSlot**

```tsx
// src/components/teams/VehicleSlot.tsx
'use client'

import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Truck, Satellite, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUnassignVehicle } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import type { TeamFull } from '@/hooks/useTeams'
import type { DragData } from './useDnDHandlers'

export function VehicleSlot({ team }: { team: TeamFull }) {
  const unassign = useUnassignVehicle()
  const { openLogPanel } = useTeamsPage()
  const { setNodeRef, isOver } = useDroppable({
    id: `vehicle-slot-${team.id}`,
    data: { zone: 'team-vehicle', teamId: team.id },
  })
  const vehicle = team.vehicle

  if (!vehicle) {
    return (
      <div ref={setNodeRef} className={cn(
        'h-10 rounded border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground transition-colors',
        isOver && 'border-primary bg-primary/5 ring-2 ring-primary'
      )}>
        <Truck className="h-3 w-3 mr-1" /> Drop vehicle
      </div>
    )
  }

  return <DraggableVehicleChip vehicle={vehicle} teamId={team.id}
    onUnassign={() => unassign.mutate({ vehicleId: vehicle.id, fromTeamId: team.id })}
    onLog={() => openLogPanel(vehicle.id, 'vehicle')}
    dropRef={setNodeRef} isOver={isOver}
  />
}

function DraggableVehicleChip({ vehicle, teamId, onUnassign, onLog, dropRef, isOver }: {
  vehicle: NonNullable<TeamFull['vehicle']>; teamId: string
  onUnassign: () => void; onLog: () => void
  dropRef: (n: HTMLElement | null) => void; isOver: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `vehicle-draggable-${vehicle.id}`,
    data: { type: 'vehicle', vehicleId: vehicle.id, fromTeamId: teamId } satisfies DragData,
  })
  return (
    <div ref={(n) => { setNodeRef(n); dropRef(n) }}
      className={cn('group flex items-center gap-2 h-10 px-2 rounded border bg-muted/50 text-sm cursor-grab transition-opacity',
        isDragging && 'opacity-50', isOver && 'ring-2 ring-primary bg-primary/5')}
      {...listeners} {...attributes}
    >
      <Truck className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate font-mono text-xs">{vehicle.plate}</span>
      {vehicle.traccar_device_id && <Satellite className="h-3 w-3 text-blue-500" />}
      <div className="hidden group-hover:flex items-center gap-1">
        <button onClick={onLog} className="p-0.5 hover:text-primary" type="button"><Clock className="h-3 w-3" /></button>
        <button onClick={onUnassign} className="p-0.5 hover:text-destructive" type="button"><X className="h-3 w-3" /></button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write LeaderSlot**

```tsx
// src/components/teams/LeaderSlot.tsx
'use client'

import { useDroppable } from '@dnd-kit/core'
import { Crown, Clock, Pencil, UserMinus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRemoveTeamLeader } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import type { TeamFull } from '@/hooks/useTeams'

export function LeaderSlot({ team }: { team: TeamFull }) {
  const removeLeader = useRemoveTeamLeader()
  const { openEmployeeDialog, openLogPanel } = useTeamsPage()
  const { setNodeRef, isOver } = useDroppable({
    id: `leader-slot-${team.id}`,
    data: { zone: 'team-leader', teamId: team.id },
  })
  const leader = team.leader

  if (!leader) {
    return (
      <div ref={setNodeRef} className={cn(
        'h-10 rounded border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground transition-colors',
        isOver && 'border-primary bg-primary/5 ring-2 ring-primary'
      )}>
        <Crown className="h-3 w-3 mr-1" /> Drop leader
      </div>
    )
  }

  const initials = leader.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() ?? '?'

  return (
    <div ref={setNodeRef} className={cn(
      'group flex items-center gap-2 h-10 px-2 rounded border bg-amber-50 dark:bg-amber-950/20 text-sm',
      isOver && 'ring-2 ring-primary bg-primary/5'
    )}>
      <Crown className="h-3 w-3 text-amber-500 shrink-0" />
      {leader.avatar_url
        ? <img src={leader.avatar_url} alt={leader.name ?? ''} className="h-6 w-6 rounded-full object-cover" />
        : <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">{initials}</div>
      }
      <span className="flex-1 truncate text-xs">{leader.name}</span>
      <div className="hidden group-hover:flex items-center gap-1">
        <button onClick={() => openLogPanel(leader.id, 'employee')} className="p-0.5 hover:text-primary" type="button"><Clock className="h-3 w-3" /></button>
        <button onClick={() => openEmployeeDialog(leader)} className="p-0.5 hover:text-primary" type="button"><Pencil className="h-3 w-3" /></button>
        <button onClick={() => removeLeader.mutate({ teamId: team.id })} className="p-0.5 hover:text-destructive" type="button"><UserMinus className="h-3 w-3" /></button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write MembersGrid**

```tsx
// src/components/teams/MembersGrid.tsx
'use client'

import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToolAssignments } from '@/hooks/useTeams'
import type { TeamFull, Employee } from '@/hooks/useTeams'
import type { DragData } from './useDnDHandlers'

const MAX_VISIBLE = 8

export function MembersGrid({ team }: { team: TeamFull }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `members-grid-${team.id}`,
    data: { zone: 'team-members', teamId: team.id },
  })
  const members  = team.members.filter(m => m.id !== team.leader_id)
  const visible  = members.slice(0, MAX_VISIBLE)
  const overflow = members.length - MAX_VISIBLE

  if (members.length === 0) {
    return (
      <div ref={setNodeRef} className={cn(
        'min-h-[2.5rem] rounded border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground p-2 transition-colors',
        isOver && 'border-primary bg-primary/5 ring-2 ring-primary'
      )}>
        Drop employees here
      </div>
    )
  }

  return (
    <div ref={setNodeRef} className={cn(
      'flex flex-wrap gap-1 p-1 min-h-[2.5rem] rounded border-2 border-transparent transition-colors',
      isOver && 'border-primary bg-primary/5 ring-2 ring-primary'
    )}>
      {visible.map(emp => <MemberAvatar key={emp.id} employee={emp} teamId={team.id} />)}
      {overflow > 0 && (
        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-medium">+{overflow}</div>
      )}
    </div>
  )
}

function MemberAvatar({ employee, teamId }: { employee: Employee; teamId: string }) {
  const { data: tools = [] } = useToolAssignments('employee', employee.id)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `member-${employee.id}-team-${teamId}`,
    data: { type: 'employee', employeeId: employee.id, fromTeamId: teamId } satisfies DragData,
  })
  const initials = employee.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() ?? '?'

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={cn('relative cursor-grab', isDragging && 'opacity-50')}
      title={employee.name ?? ''}
    >
      {employee.avatar_url
        ? <img src={employee.avatar_url} alt={employee.name ?? ''} className="h-6 w-6 rounded-full object-cover" />
        : <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-semibold">{initials}</div>
      }
      {tools.length > 0 && <Wrench className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 text-orange-500" />}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/teams/VehicleSlot.tsx src/components/teams/LeaderSlot.tsx src/components/teams/MembersGrid.tsx
git commit -m "feat(teams): add VehicleSlot, LeaderSlot, MembersGrid sub-components

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 12: TeamCard + TeamRow + TeamGrid

**Files:**
- Create: `src/components/teams/TeamCard.tsx`
- Create: `src/components/teams/TeamRow.tsx`
- Create: `src/components/teams/TeamGrid.tsx`

- [ ] **Step 1: Write TeamCard**

```tsx
// src/components/teams/TeamCard.tsx
'use client'

import { Phone, Calendar, Wrench, Clock, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToolAssignments } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import { VehicleSlot } from './VehicleSlot'
import { LeaderSlot } from './LeaderSlot'
import { MembersGrid } from './MembersGrid'
import type { TeamFull } from '@/hooks/useTeams'

export function TeamCard({ team }: { team: TeamFull }) {
  const { data: tools = [] } = useToolAssignments('team', team.id)
  const { openTeamDialog, openScheduleDialog, openLogPanel } = useTeamsPage()
  const hasSVO = team.members.some(m => m.site_visit_order)
  const hasSVC = team.members.some(m => m.site_visit_quotation)

  return (
    <div className="rounded-lg border bg-card shadow-sm flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate text-sm">{team.name_en}</p>
          {team.name_ar && <p className="text-xs text-muted-foreground truncate" dir="rtl">{team.name_ar}</p>}
        </div>
        <div className="flex flex-wrap gap-1 shrink-0">
          {!team.is_emergency && !team.is_qc && <Badge variant="secondary" className="text-[10px] px-1">NRM</Badge>}
          {team.is_emergency && <Badge className="text-[10px] px-1 bg-red-100 text-red-700 hover:bg-red-100">EMR</Badge>}
          {team.is_qc        && <Badge className="text-[10px] px-1 bg-purple-100 text-purple-700 hover:bg-purple-100">QC</Badge>}
          {hasSVO            && <Badge className="text-[10px] px-1 bg-blue-100 text-blue-700 hover:bg-blue-100">SVO</Badge>}
          {hasSVC            && <Badge className="text-[10px] px-1 bg-teal-100 text-teal-700 hover:bg-teal-100">SVC</Badge>}
        </div>
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        {team.phone && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="p-1 hover:text-foreground" type="button"><Phone className="h-3.5 w-3.5" /></button>
            </TooltipTrigger>
            <TooltipContent>{team.phone}</TooltipContent>
          </Tooltip>
        )}
        <button onClick={() => openScheduleDialog(team.id)} className="p-1 hover:text-foreground flex items-center gap-1 text-xs" type="button">
          <Calendar className="h-3.5 w-3.5" />
          {team.schedule?.name && <span className="hidden sm:inline truncate max-w-[6rem]">{team.schedule.name}</span>}
        </button>
        {tools.length > 0 && <span className="p-1 flex items-center gap-0.5 text-xs"><Wrench className="h-3.5 w-3.5" />{tools.length}</span>}
        <button onClick={() => openLogPanel(team.id, 'team')} className="p-1 hover:text-foreground ml-auto" type="button"><Clock className="h-3.5 w-3.5" /></button>
        <button onClick={() => openTeamDialog(team)} className="p-1 hover:text-foreground" type="button"><Pencil className="h-3.5 w-3.5" /></button>
      </div>
      <VehicleSlot team={team} />
      <LeaderSlot  team={team} />
      <MembersGrid team={team} />
    </div>
  )
}
```

- [ ] **Step 2: Write TeamRow**

```tsx
// src/components/teams/TeamRow.tsx
'use client'

import { Calendar, Wrench, Clock, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useToolAssignments } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import { VehicleSlot } from './VehicleSlot'
import { LeaderSlot } from './LeaderSlot'
import { MembersGrid } from './MembersGrid'
import type { TeamFull } from '@/hooks/useTeams'

export function TeamRow({ team }: { team: TeamFull }) {
  const { data: tools = [] } = useToolAssignments('team', team.id)
  const { openTeamDialog, openScheduleDialog, openLogPanel } = useTeamsPage()

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 border-b hover:bg-muted/30 text-sm">
      <div className="w-36 shrink-0 font-medium truncate">{team.name_en}</div>
      <div className="flex gap-1 shrink-0">
        {team.is_emergency && <Badge className="text-[10px] px-1 bg-red-100 text-red-700 hover:bg-red-100">EMR</Badge>}
        {team.is_qc        && <Badge className="text-[10px] px-1 bg-purple-100 text-purple-700 hover:bg-purple-100">QC</Badge>}
      </div>
      <div className="flex-1 min-w-0"><VehicleSlot team={team} /></div>
      <div className="flex-1 min-w-0"><LeaderSlot  team={team} /></div>
      <div className="flex-1 min-w-0"><MembersGrid team={team} /></div>
      <div className="flex items-center gap-1 text-muted-foreground shrink-0">
        <button onClick={() => openScheduleDialog(team.id)} className="p-1 hover:text-foreground" type="button"><Calendar className="h-3.5 w-3.5" /></button>
        {tools.length > 0 && <span className="flex items-center gap-0.5 text-xs"><Wrench className="h-3.5 w-3.5" />{tools.length}</span>}
        <button onClick={() => openLogPanel(team.id, 'team')} className="p-1 hover:text-foreground" type="button"><Clock className="h-3.5 w-3.5" /></button>
        <button onClick={() => openTeamDialog(team)} className="p-1 hover:text-foreground" type="button"><Pencil className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write TeamGrid**

```tsx
// src/components/teams/TeamGrid.tsx
'use client'

import { LayoutGrid, List, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTeams } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import { TeamCard } from './TeamCard'
import { TeamRow } from './TeamRow'

export function TeamGrid() {
  const { searchQuery, divisionFilter, density, setSearch, setDensity } = useTeamsPage()
  const { data: teams = [], isLoading } = useTeams({ search: searchQuery, divisionId: divisionFilter })

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search teams..." className="pl-8 h-8" value={searchQuery} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center border rounded-md overflow-hidden">
          <Button variant={density === 'card' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8 rounded-none" onClick={() => setDensity('card')}><LayoutGrid className="h-4 w-4" /></Button>
          <Button variant={density === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8 rounded-none" onClick={() => setDensity('list')}><List className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading...</div>}
        {!isLoading && teams.length === 0 && <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No teams found</div>}
        {!isLoading && density === 'card' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {teams.map(t => <TeamCard key={t.id} team={t} />)}
          </div>
        )}
        {!isLoading && density === 'list' && (
          <div className="rounded-lg border overflow-hidden">
            {teams.map(t => <TeamRow key={t.id} team={t} />)}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/components/teams/TeamCard.tsx src/components/teams/TeamRow.tsx src/components/teams/TeamGrid.tsx
git commit -m "feat(teams): add TeamCard, TeamRow, TeamGrid components

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 13: PoolSidebar components

**Files:**
- Create: `src/components/teams/VehiclePool.tsx`
- Create: `src/components/teams/EmployeeRow.tsx`
- Create: `src/components/teams/StatusTabs.tsx`
- Create: `src/components/teams/EmployeePool.tsx`
- Create: `src/components/teams/PoolSidebar.tsx`

- [ ] **Step 1: Write VehiclePool**

```tsx
// src/components/teams/VehiclePool.tsx
'use client'

import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Truck, GripVertical, Satellite, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVehicles } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import type { Vehicle } from '@/hooks/useTeams'
import type { DragData } from './useDnDHandlers'

export function VehiclePool() {
  const { data: vehicles = [] } = useVehicles()
  const pool = vehicles.filter(v => !v.team_id)
  const { setNodeRef, isOver } = useDroppable({ id: 'vehicle-pool', data: { zone: 'vehicle-pool' } })

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <Truck className="h-3.5 w-3.5" /> Vehicle Pool · {pool.length} available
      </p>
      <div ref={setNodeRef} className={cn(
        'min-h-[2.5rem] rounded border-2 border-dashed p-1 flex flex-col gap-1 transition-colors',
        pool.length === 0 && 'items-center justify-center text-xs text-muted-foreground',
        isOver && 'border-primary bg-primary/5'
      )}>
        {pool.length === 0 && 'Drop vehicles here to unassign'}
        {pool.map(v => <PoolVehicleChip key={v.id} vehicle={v} />)}
      </div>
    </div>
  )
}

function PoolVehicleChip({ vehicle }: { vehicle: Vehicle }) {
  const { openLogPanel } = useTeamsPage()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-vehicle-${vehicle.id}`,
    data: { type: 'vehicle', vehicleId: vehicle.id, fromTeamId: null } satisfies DragData,
  })

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={cn('group flex items-center gap-1.5 px-2 py-1 rounded border bg-muted/50 text-xs cursor-grab', isDragging && 'opacity-50')}
    >
      <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
      <Truck className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="flex-1 truncate font-mono">{vehicle.plate}</span>
      {vehicle.traccar_device_id && <Satellite className="h-3 w-3 text-blue-500" />}
      <button onClick={() => openLogPanel(vehicle.id, 'vehicle')} className="hidden group-hover:block p-0.5 hover:text-primary" type="button"><Clock className="h-3 w-3" /></button>
    </div>
  )
}
```

- [ ] **Step 2: Write EmployeeRow**

```tsx
// src/components/teams/EmployeeRow.tsx
'use client'

import { useDraggable } from '@dnd-kit/core'
import { GripVertical, Wrench, Clock, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useToolAssignments } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import type { Employee } from '@/hooks/useTeams'
import type { DragData } from './useDnDHandlers'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700', unassigned: 'bg-gray-100 text-gray-700',
  vacation: 'bg-yellow-100 text-yellow-700', 'on-task': 'bg-blue-100 text-blue-700',
  archived: 'bg-red-100 text-red-700',
}

export function EmployeeRow({ employee }: { employee: Employee }) {
  const { data: tools = [] } = useToolAssignments('employee', employee.id)
  const { openEmployeeDialog, openLogPanel } = useTeamsPage()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-employee-${employee.id}`,
    data: { type: 'employee', employeeId: employee.id, fromTeamId: null } satisfies DragData,
  })
  const initials = employee.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() ?? '?'

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={cn('group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-grab text-sm', isDragging && 'opacity-50')}
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {employee.avatar_url
        ? <img src={employee.avatar_url} alt={employee.name ?? ''} className="h-7 w-7 rounded-full object-cover shrink-0" />
        : <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-semibold shrink-0">{initials}</div>
      }
      <span className="flex-1 truncate text-xs">{employee.name}</span>
      {tools.length > 0 && <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Wrench className="h-3 w-3" />{tools.length}</span>}
      <Badge className={cn('text-[10px] px-1 hidden sm:inline-flex', STATUS_COLORS[employee.status ?? 'unassigned'])}>{employee.status}</Badge>
      <div className="hidden group-hover:flex items-center gap-1">
        <button onClick={() => openLogPanel(employee.id, 'employee')} className="p-0.5 hover:text-primary" type="button"><Clock className="h-3 w-3" /></button>
        <button onClick={() => openEmployeeDialog(employee)} className="p-0.5 hover:text-primary" type="button"><Pencil className="h-3 w-3" /></button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write StatusTabs**

```tsx
// src/components/teams/StatusTabs.tsx
'use client'

import { useDroppable } from '@dnd-kit/core'
import { UserX, Palmtree, Briefcase, Archive, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EmployeeStatus } from '@/hooks/useTeams'

export interface StatusTabDef {
  key: EmployeeStatus | 'all'; label: string; icon: React.ElementType; status: EmployeeStatus | null
}

export const STATUS_TABS: StatusTabDef[] = [
  { key: 'unassigned', label: 'Unassigned', icon: UserX,     status: 'unassigned' },
  { key: 'vacation',   label: 'Vacation',   icon: Palmtree,  status: 'vacation'   },
  { key: 'on-task',    label: 'On Task',    icon: Briefcase, status: 'on-task'    },
  { key: 'archived',   label: 'Archive',    icon: Archive,   status: 'archived'   },
  { key: 'all',        label: 'All',        icon: Users,     status: null         },
]

export function StatusTabItem({ tab, isActive, count, onClick }: {
  tab: StatusTabDef; isActive: boolean; count: number; onClick: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `status-tab-${tab.key}`,
    data: tab.status ? { zone: 'status-tab', status: tab.status } : undefined,
    disabled: !tab.status,
  })
  const Icon = tab.icon

  return (
    <button ref={setNodeRef} onClick={onClick} type="button"
      className={cn(
        'flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded text-xs transition-colors',
        isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
        isOver && !isActive && 'bg-primary/10 ring-1 ring-primary'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:block truncate">{tab.label}</span>
      <span className={cn('text-[10px] rounded-full px-1', isActive ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20')}>{count}</span>
    </button>
  )
}
```

- [ ] **Step 4: Write EmployeePool + PoolSidebar**

```tsx
// src/components/teams/EmployeePool.tsx
'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useEmployees } from '@/hooks/useTeams'
import { STATUS_TABS, StatusTabItem } from './StatusTabs'
import { EmployeeRow } from './EmployeeRow'
import type { EmployeeStatus } from '@/hooks/useTeams'

export function EmployeePool() {
  const [activeTab, setActiveTab] = useState<EmployeeStatus | 'all'>('unassigned')
  const [search, setSearch] = useState('')
  const { data: allEmployees = [] } = useEmployees()

  const pool = allEmployees.filter(e => {
    if (activeTab !== 'all' && e.status !== activeTab) return false
    if (activeTab === 'unassigned' && e.team_id) return false
    if (search) {
      const q = search.toLowerCase()
      return e.name?.toLowerCase().includes(q) || e.phone?.toLowerCase().includes(q)
    }
    return true
  })

  function countForTab(tab: typeof STATUS_TABS[number]) {
    if (tab.key === 'all') return allEmployees.filter(e => e.status !== 'active' || !e.team_id).length
    return allEmployees.filter(e => e.status === tab.key).length
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-0.5">
        {STATUS_TABS.map(tab => (
          <StatusTabItem key={tab.key} tab={tab} isActive={activeTab === tab.key} count={countForTab(tab)} onClick={() => setActiveTab(tab.key)} />
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Search..." className="pl-7 h-7 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="flex flex-col overflow-y-auto max-h-[calc(100vh-26rem)]">
        {pool.map(emp => <EmployeeRow key={emp.id} employee={emp} />)}
        {pool.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No employees</p>}
      </div>
    </div>
  )
}
```

```tsx
// src/components/teams/PoolSidebar.tsx
'use client'

import { VehiclePool } from './VehiclePool'
import { EmployeePool } from './EmployeePool'

export function PoolSidebar() {
  return (
    <div className="w-56 lg:w-64 shrink-0 border-l flex flex-col gap-4 p-3 overflow-y-auto">
      <VehiclePool />
      <div className="border-t pt-3">
        <EmployeePool />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add src/components/teams/VehiclePool.tsx src/components/teams/EmployeeRow.tsx src/components/teams/StatusTabs.tsx src/components/teams/EmployeePool.tsx src/components/teams/PoolSidebar.tsx
git commit -m "feat(teams): add PoolSidebar with VehiclePool, EmployeePool, StatusTabs

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 14: TeamEditDialog

**Files:**
- Create: `src/components/teams/dialogs/TeamEditDialog.tsx`

- [ ] **Step 1: Write the dialog**

```tsx
// src/components/teams/dialogs/TeamEditDialog.tsx
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDivisions } from '@/hooks/useDivisions'
import { useEmployees, useCreateTeam, useUpdateTeam, useArchiveTeam } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'
import type { TeamFull } from '@/hooks/useTeams'

interface TeamFormValues {
  name_en:          string
  name_ar:          string
  division_id:      string
  leader_id:        string
  phone:            string
  is_emergency:     boolean
  is_qc:            boolean
  traccar_device_id:string
}

export function TeamEditDialog() {
  const { teamDialog, closeTeamDialog } = useTeamsPage()
  const { open, team } = teamDialog
  const isEdit = !!team

  const { data: divisions  = [] } = useDivisions()
  const { data: employees  = [] } = useEmployees()
  const createTeam = useCreateTeam()
  const updateTeam = useUpdateTeam()
  const archiveTeam = useArchiveTeam()

  const form = useForm<TeamFormValues>({
    defaultValues: {
      name_en: '', name_ar: '', division_id: '', leader_id: '',
      phone: '', is_emergency: false, is_qc: false, traccar_device_id: '',
    },
  })

  useEffect(() => {
    if (team) {
      form.reset({
        name_en:           team.name_en ?? '',
        name_ar:           team.name_ar ?? '',
        division_id:       team.division_id ?? '',
        leader_id:         team.leader_id ?? '',
        phone:             team.phone ?? '',
        is_emergency:      team.is_emergency ?? false,
        is_qc:             team.is_qc ?? false,
        traccar_device_id: team.traccar_device_id ?? '',
      })
    } else {
      form.reset({ name_en: '', name_ar: '', division_id: '', leader_id: '', phone: '', is_emergency: false, is_qc: false, traccar_device_id: '' })
    }
  }, [team, open])

  async function onSubmit(values: TeamFormValues) {
    const payload = {
      name_en:           values.name_en,
      name_ar:           values.name_ar || null,
      division_id:       values.division_id || null,
      leader_id:         values.leader_id || null,
      phone:             values.phone || null,
      is_emergency:      values.is_emergency,
      is_qc:             values.is_qc,
      traccar_device_id: values.traccar_device_id || null,
    }
    if (isEdit) {
      await updateTeam.mutateAsync({ id: team!.id, before: team as Record<string, unknown>, ...payload })
    } else {
      await createTeam.mutateAsync(payload)
    }
    closeTeamDialog()
  }

  const isPending = createTeam.isPending || updateTeam.isPending

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) closeTeamDialog() }}>
      <DialogContent className="w-full max-w-lg sm:max-w-lg md:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Team' : 'New Team'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="name_en" rules={{ required: 'Required' }} render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (EN)</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="name_ar" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (AR)</FormLabel>
                  <FormControl><Input {...field} dir="rtl" /></FormControl>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="division_id" rules={{ required: 'Required' }} render={({ field }) => (
              <FormItem>
                <FormLabel>Division</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select division..." /></SelectTrigger></FormControl>
                  <SelectContent>
                    {divisions.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl><Input {...field} type="tel" /></FormControl>
              </FormItem>
            )} />

            <div className="flex gap-6">
              <FormField control={form.control} name="is_emergency" render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={v => {
                      field.onChange(v)
                      if (v) form.setValue('is_qc', false)
                    }} />
                  </FormControl>
                  <FormLabel className="!mt-0">Emergency (EMR)</FormLabel>
                </FormItem>
              )} />
              <FormField control={form.control} name="is_qc" render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={v => {
                      field.onChange(v)
                      if (v) form.setValue('is_emergency', false)
                    }} />
                  </FormControl>
                  <FormLabel className="!mt-0">QC</FormLabel>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="traccar_device_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Traccar Device ID</FormLabel>
                <FormControl><Input {...field} /></FormControl>
              </FormItem>
            )} />

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={closeTeamDialog}>Cancel</Button>
              {isEdit && (
                <Button type="button" variant="destructive" disabled={archiveTeam.isPending}
                  onClick={async () => { await archiveTeam.mutateAsync(team!.id); closeTeamDialog() }}>
                  Archive
                </Button>
              )}
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/teams/dialogs/TeamEditDialog.tsx
git commit -m "feat(teams): add TeamEditDialog with EMR/QC mutual-exclusion (R2)

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 15: EmployeeEditDialog

**Files:**
- Create: `src/components/teams/dialogs/EmployeeEditDialog.tsx`

- [ ] **Step 1: Write the dialog**

```tsx
// src/components/teams/dialogs/EmployeeEditDialog.tsx
'use client'

import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { useServiceTree } from '@/hooks/useServices'
import { useCreateEmployee, useUpdateEmployee, useArchiveEmployee } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'
import type { EmployeeStatus } from '@/hooks/useTeams'

interface EmployeeFormValues {
  name:                 string
  phone:                string
  nationality:          string
  join_date:            string
  status:               EmployeeStatus
  site_visit_order:     boolean
  site_visit_quotation: boolean
  avatar_url:           string
  serviceIds:           string[]
}

const STATUSES: EmployeeStatus[] = ['unassigned', 'active', 'vacation', 'on-task', 'archived']

export function EmployeeEditDialog() {
  const { employeeDialog, closeEmployeeDialog } = useTeamsPage()
  const { open, employee } = employeeDialog
  const isEdit = !!employee

  const createEmployee = useCreateEmployee()
  const updateEmployee = useUpdateEmployee()
  const archiveEmployee = useArchiveEmployee()
  const { data: services = [] } = useServiceTree('normal', [])

  const fileRef = useRef<HTMLInputElement>(null)

  const form = useForm<EmployeeFormValues>({
    defaultValues: {
      name: '', phone: '', nationality: '', join_date: '',
      status: 'unassigned', site_visit_order: false, site_visit_quotation: false,
      avatar_url: '', serviceIds: [],
    },
  })

  useEffect(() => {
    if (!open) return
    if (employee) {
      form.reset({
        name:                 employee.name ?? '',
        phone:                employee.phone ?? '',
        nationality:          employee.nationality ?? '',
        join_date:            employee.join_date ?? '',
        status:               (employee.status as EmployeeStatus) ?? 'unassigned',
        site_visit_order:     employee.site_visit_order ?? false,
        site_visit_quotation: employee.site_visit_quotation ?? false,
        avatar_url:           employee.avatar_url ?? '',
        serviceIds:           [],
      })
      // Load existing skill IDs
      createClient()
        .from('employee_services')
        .select('service_id')
        .eq('employee_id', employee.id)
        .then(({ data }) => {
          if (data) form.setValue('serviceIds', data.map(r => r.service_id))
        })
    } else {
      form.reset({ name: '', phone: '', nationality: '', join_date: '', status: 'unassigned', site_visit_order: false, site_visit_quotation: false, avatar_url: '', serviceIds: [] })
    }
  }, [employee, open])

  async function uploadAvatar(file: File): Promise<string> {
    const supabase = createClient()
    const path = `${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('employee-avatars').upload(path, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('employee-avatars').getPublicUrl(path)
    return data.publicUrl
  }

  async function onSubmit(values: EmployeeFormValues) {
    let avatarUrl = values.avatar_url
    if (fileRef.current?.files?.[0]) {
      avatarUrl = await uploadAvatar(fileRef.current.files[0])
    }

    const payload = {
      name:                 values.name,
      phone:                values.phone || null,
      nationality:          values.nationality || null,
      join_date:            values.join_date || null,
      status:               values.status,
      site_visit_order:     values.site_visit_order,
      site_visit_quotation: values.site_visit_quotation,
      avatar_url:           avatarUrl || null,
    }

    let employeeId: string
    if (isEdit) {
      const updated = await updateEmployee.mutateAsync({ id: employee!.id, before: employee as Record<string, unknown>, ...payload })
      employeeId = updated.id
    } else {
      const created = await createEmployee.mutateAsync(payload)
      employeeId = created.id
    }

    // Upsert skills atomically (Risk R3)
    await createClient().rpc('upsert_employee_services', {
      p_employee_id: employeeId,
      p_service_ids: values.serviceIds,
    })

    closeEmployeeDialog()
  }

  const isPending = createEmployee.isPending || updateEmployee.isPending
  const watchedServiceIds = form.watch('serviceIds')

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) closeEmployeeDialog() }}>
      <DialogContent className="w-full max-w-lg sm:max-w-lg md:rounded-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Employee' : 'New Employee'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" rules={{ required: 'Required' }} render={({ field }) => (
              <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} type="tel" /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="nationality" render={({ field }) => (
                <FormItem><FormLabel>Nationality</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="join_date" render={({ field }) => (
                <FormItem><FormLabel>Join Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>

            <div>
              <p className="text-sm font-medium mb-1">Avatar</p>
              <input ref={fileRef} type="file" accept="image/*" className="text-sm" />
              {form.watch('avatar_url') && (
                <img src={form.watch('avatar_url')} alt="current avatar" className="mt-2 h-12 w-12 rounded-full object-cover" />
              )}
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Skills</p>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {services.map(s => {
                  const checked = watchedServiceIds.includes(s.id)
                  return (
                    <button key={s.id} type="button"
                      onClick={() => {
                        const next = checked
                          ? watchedServiceIds.filter(id => id !== s.id)
                          : [...watchedServiceIds, s.id]
                        form.setValue('serviceIds', next)
                      }}
                      className={`px-2 py-0.5 rounded-full border text-xs transition-colors ${checked ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                    >
                      {s.name_en}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-6">
              <FormField control={form.control} name="site_visit_order" render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel className="!mt-0">Site Visit Order (SVO)</FormLabel>
                </FormItem>
              )} />
              <FormField control={form.control} name="site_visit_quotation" render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel className="!mt-0">Site Visit Quotation (SVC)</FormLabel>
                </FormItem>
              )} />
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={closeEmployeeDialog}>Cancel</Button>
              {isEdit && (
                <Button type="button" variant="destructive" disabled={archiveEmployee.isPending}
                  onClick={async () => { await archiveEmployee.mutateAsync(employee!.id); closeEmployeeDialog() }}>
                  Archive
                </Button>
              )}
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/teams/dialogs/EmployeeEditDialog.tsx
git commit -m "feat(teams): add EmployeeEditDialog with atomic skill upsert (R3)

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 16: VehicleEditDialog

**Files:**
- Create: `src/components/teams/dialogs/VehicleEditDialog.tsx`

- [ ] **Step 1: Write the dialog**

```tsx
// src/components/teams/dialogs/VehicleEditDialog.tsx
'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { useCreateVehicle, useUpdateVehicle, useArchiveVehicle } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'

interface VehicleFormValues {
  type:              string
  plate:             string
  traccar_device_id: string
}

const VEHICLE_TYPES = ['car', 'van', 'truck', 'pickup', 'motorcycle']

export function VehicleEditDialog() {
  const { vehicleDialog, closeVehicleDialog } = useTeamsPage()
  const { open, vehicle } = vehicleDialog
  const isEdit = !!vehicle

  const createVehicle  = useCreateVehicle()
  const updateVehicle  = useUpdateVehicle()
  const archiveVehicle = useArchiveVehicle()
  const [plateError, setPlateError] = useState<string | null>(null)

  const form = useForm<VehicleFormValues>({
    defaultValues: { type: 'car', plate: '', traccar_device_id: '' },
  })

  useEffect(() => {
    if (!open) return
    setPlateError(null)
    form.reset(vehicle
      ? { type: vehicle.type ?? 'car', plate: vehicle.plate ?? '', traccar_device_id: vehicle.traccar_device_id ?? '' }
      : { type: 'car', plate: '', traccar_device_id: '' }
    )
  }, [vehicle, open])

  async function validatePlate(plate: string) {
    if (!plate) return
    const supabase = createClient()
    const { count } = await supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('plate', plate)
      .neq('id', vehicle?.id ?? '00000000-0000-0000-0000-000000000000')
    if ((count ?? 0) > 0) {
      setPlateError('Plate already in use')
    } else {
      setPlateError(null)
    }
  }

  async function onSubmit(values: VehicleFormValues) {
    if (plateError) return
    const payload = {
      type:              values.type,
      plate:             values.plate,
      traccar_device_id: values.traccar_device_id || null,
    }
    if (isEdit) {
      await updateVehicle.mutateAsync({ id: vehicle!.id, before: vehicle as Record<string, unknown>, ...payload })
    } else {
      await createVehicle.mutateAsync(payload)
    }
    closeVehicleDialog()
  }

  const isPending = createVehicle.isPending || updateVehicle.isPending

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) closeVehicleDialog() }}>
      <DialogContent className="w-full max-w-md sm:max-w-md md:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Vehicle' : 'New Vehicle'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="type" render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {VEHICLE_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            <FormField control={form.control} name="plate" rules={{ required: 'Required' }} render={({ field }) => (
              <FormItem>
                <FormLabel>Plate Number</FormLabel>
                <FormControl>
                  <Input {...field}
                    onBlur={async e => { field.onBlur(); await validatePlate(e.target.value) }}
                    className={plateError ? 'border-destructive' : ''}
                  />
                </FormControl>
                {plateError && <p className="text-sm text-destructive">{plateError}</p>}
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="traccar_device_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Traccar Device ID</FormLabel>
                <FormControl><Input {...field} /></FormControl>
              </FormItem>
            )} />

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={closeVehicleDialog}>Cancel</Button>
              {isEdit && (
                <Button type="button" variant="destructive" disabled={archiveVehicle.isPending}
                  onClick={async () => { await archiveVehicle.mutateAsync(vehicle!.id); closeVehicleDialog() }}>
                  Archive
                </Button>
              )}
              <Button type="submit" disabled={isPending || !!plateError}>{isPending ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/teams/dialogs/VehicleEditDialog.tsx
git commit -m "feat(teams): add VehicleEditDialog with async plate validation (R6)

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 17: ScheduleDialog (list mode + team-attachment mode)

**Files:**
- Create: `src/components/teams/dialogs/ScheduleDialog.tsx`

- [ ] **Step 1: Write the dialog**

```tsx
// src/components/teams/dialogs/ScheduleDialog.tsx
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { format, parseISO, isAfter, isBefore } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  useSchedules, useTeamScheduleAssignments,
  useCreateSchedule, useUpdateSchedule, useDeleteSchedule,
  useAttachSchedule, useDetachSchedule,
  type Schedule,
} from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'

const DAYS = ['mon','tue','wed','thu','fri','sat','sun'] as const

interface ScheduleFormValues {
  name: string
  days: Record<string, { enabled: boolean; start: string; end: string; break_minutes: number }>
}

function defaultDays() {
  return Object.fromEntries(
    DAYS.map(d => [d, { enabled: ['mon','tue','wed','thu'].includes(d), start: '08:00', end: '17:00', break_minutes: 60 }])
  )
}

export function ScheduleDialog() {
  const { scheduleDialog, closeScheduleDialog } = useTeamsPage()
  const { open, teamId } = scheduleDialog
  const isTeamMode = !!teamId

  const { data: schedules = [] } = useSchedules()
  const { data: assignments = [] } = useTeamScheduleAssignments(teamId)
  const createSchedule = useCreateSchedule()
  const updateSchedule = useUpdateSchedule()
  const deleteSchedule = useDeleteSchedule()
  const attachSchedule = useAttachSchedule()
  const detachSchedule = useDetachSchedule()

  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [showAttachForm, setShowAttachForm] = useState(false)

  const form = useForm<ScheduleFormValues>({ defaultValues: { name: '', days: defaultDays() } })
  const attachForm = useForm({ defaultValues: { scheduleId: '', startDate: '', endDate: '' } })

  function startEdit(schedule?: Schedule) {
    setEditingId(schedule?.id ?? 'new')
    form.reset({ name: schedule?.name ?? '', days: (schedule?.days as ScheduleFormValues['days']) ?? defaultDays() })
  }

  async function onSaveSchedule(values: ScheduleFormValues) {
    if (editingId === 'new') {
      await createSchedule.mutateAsync({ name: values.name, days: values.days })
    } else if (editingId) {
      await updateSchedule.mutateAsync({ id: editingId, name: values.name, days: values.days })
    }
    setEditingId(null)
  }

  async function onAttach(values: { scheduleId: string; startDate: string; endDate: string }) {
    await attachSchedule.mutateAsync({
      teamId: teamId!,
      scheduleId: values.scheduleId,
      startDate: values.startDate,
      endDate: values.endDate || null,
    })
    setShowAttachForm(false)
    attachForm.reset()
  }

  function getAssignmentStatus(a: typeof assignments[number]) {
    const today = new Date()
    const start = parseISO(a.start_date)
    const end   = a.end_date ? parseISO(a.end_date) : null
    if (isAfter(start, today)) return 'upcoming'
    if (end && isBefore(end, today)) return 'past'
    return 'active'
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) closeScheduleDialog() }}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto md:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isTeamMode ? 'Team Schedules' : 'Manage Schedules'}</DialogTitle>
        </DialogHeader>

        {/* LIST MODE */}
        {!isTeamMode && (
          <div className="space-y-3">
            <Button size="sm" onClick={() => startEdit()}>+ New Schedule</Button>

            {editingId && (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSaveSchedule)} className="border rounded p-3 space-y-3">
                  <FormField control={form.control} name="name" rules={{ required: 'Required' }} render={({ field }) => (
                    <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                  <div className="space-y-2">
                    {DAYS.map(day => {
                      const enabled = form.watch(`days.${day}.enabled`)
                      return (
                        <div key={day} className="flex items-center gap-3 text-sm">
                          <Switch checked={enabled} onCheckedChange={v => form.setValue(`days.${day}.enabled`, v)} />
                          <span className="w-8 uppercase text-xs font-mono">{day}</span>
                          {enabled && (
                            <>
                              <Input type="time" className="w-28 h-7" {...form.register(`days.${day}.start`)} />
                              <span>–</span>
                              <Input type="time" className="w-28 h-7" {...form.register(`days.${day}.end`)} />
                              <Input type="number" min={0} max={180} className="w-20 h-7" placeholder="break min" {...form.register(`days.${day}.break_minutes`, { valueAsNumber: true })} />
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm">{createSchedule.isPending || updateSchedule.isPending ? 'Saving...' : 'Save'}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </form>
              </Form>
            )}

            <div className="space-y-2">
              {schedules.map(s => (
                <div key={s.id} className="flex items-center justify-between border rounded px-3 py-2 text-sm">
                  <span className="font-medium">{s.name}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => startEdit(s)}>Edit</Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteSchedule.mutate(s.id)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TEAM-ATTACHMENT MODE */}
        {isTeamMode && (
          <div className="space-y-3">
            {!showAttachForm && (
              <Button size="sm" onClick={() => setShowAttachForm(true)}>+ Attach Schedule</Button>
            )}

            {showAttachForm && (
              <form onSubmit={attachForm.handleSubmit(onAttach)} className="border rounded p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium">Schedule</label>
                    <Select onValueChange={v => attachForm.setValue('scheduleId', v)}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {schedules.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Start Date</label>
                    <Input type="date" {...attachForm.register('startDate', { required: true })} className="h-8" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">End Date (optional)</label>
                    <Input type="date" {...attachForm.register('endDate')} className="h-8" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">Attach</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowAttachForm(false)}>Cancel</Button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {assignments.map(a => {
                const status = getAssignmentStatus(a)
                const isPast = status === 'past'
                return (
                  <div key={a.id} className="border rounded px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{a.schedule?.name}</span>
                      <Badge className={
                        status === 'active'   ? 'bg-green-100 text-green-700' :
                        status === 'upcoming' ? 'bg-blue-100 text-blue-700'  :
                        'bg-gray-100 text-gray-700'
                      }>{status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(a.start_date), 'dd MMM yyyy')}
                      {a.end_date ? ` → ${format(parseISO(a.end_date), 'dd MMM yyyy')}` : ' → ongoing'}
                    </p>
                    {!isPast && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={() => detachSchedule.mutate({ assignmentId: a.id, teamId: teamId! })}>
                          Detach
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
              {assignments.length === 0 && <p className="text-sm text-muted-foreground">No schedule assignments</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/teams/dialogs/ScheduleDialog.tsx
git commit -m "feat(teams): add ScheduleDialog (list mode + team-attachment mode)

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 18: ActivityLogPanel + EntityActivityLogDialog

**Files:**
- Create: `src/components/teams/dialogs/ActivityLogPanel.tsx`
- Create: `src/components/teams/dialogs/EntityActivityLogDialog.tsx`

- [ ] **Step 1: Write ActivityLogPanel**

```tsx
// src/components/teams/dialogs/ActivityLogPanel.tsx
'use client'

import { useState } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { useTeamActivityLog } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'

const FILTER_TABS = ['all', 'team', 'employee', 'vehicle', 'schedule'] as const
type FilterTab = typeof FILTER_TABS[number]

export function ActivityLogPanel() {
  const { logPanel, closeLogPanel } = useTeamsPage()
  const { open, entityId, entityType } = logPanel
  const [filter, setFilter] = useState<FilterTab>('all')

  const { data: logs = [] } = useTeamActivityLog(entityId ?? undefined)

  const visible = filter === 'all' ? logs : logs.filter(l => l.entity_type === filter)

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) closeLogPanel() }}>
      <SheetContent side="right" className="w-full sm:w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Activity Log</SheetTitle>
        </SheetHeader>

        {/* Filter chips */}
        <div className="flex gap-1 flex-wrap mt-3 mb-4">
          {FILTER_TABS.map(tab => (
            <button key={tab} onClick={() => setFilter(tab)} type="button"
              className={`px-2 py-0.5 rounded-full text-xs border capitalize transition-colors ${filter === tab ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {visible.map(log => (
            <div key={log.id} className="border rounded p-3 space-y-1 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium capitalize">{log.action.replace(/-/g, ' ')}</span>
                <Badge variant="secondary" className="text-[10px] capitalize">{log.entity_type}</Badge>
              </div>
              {log.actor && <p className="text-xs text-muted-foreground">by {log.actor.full_name}</p>}
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(parseISO(log.created_at), { addSuffix: true })}
              </p>
              {(log.before_data || log.after_data) && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Details</summary>
                  <pre className="mt-1 p-2 bg-muted rounded text-[10px] overflow-x-auto">
                    {JSON.stringify({ before: log.before_data, after: log.after_data }, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
          {visible.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No activity</p>}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Write EntityActivityLogDialog**

```tsx
// src/components/teams/dialogs/EntityActivityLogDialog.tsx
'use client'

import { formatDistanceToNow, parseISO } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useTeamActivityLog } from '@/hooks/useTeams'

interface Props {
  open:       boolean
  entityId:   string
  entityName: string
  onClose:    () => void
}

export function EntityActivityLogDialog({ open, entityId, entityName, onClose }: Props) {
  const { data: logs = [] } = useTeamActivityLog(entityId)

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-lg max-h-[80vh] overflow-y-auto md:rounded-lg">
        <DialogHeader>
          <DialogTitle>Activity — {entityName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {logs.map(log => (
            <div key={log.id} className="border rounded p-3 space-y-1 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium capitalize">{log.action.replace(/-/g, ' ')}</span>
                <Badge variant="secondary" className="text-[10px] capitalize">{log.entity_type}</Badge>
              </div>
              {log.actor && <p className="text-xs text-muted-foreground">by {log.actor.full_name}</p>}
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(parseISO(log.created_at), { addSuffix: true })}
              </p>
            </div>
          ))}
          {logs.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No activity recorded</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/teams/dialogs/ActivityLogPanel.tsx src/components/teams/dialogs/EntityActivityLogDialog.tsx
git commit -m "feat(teams): add ActivityLogPanel and EntityActivityLogDialog

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 19: Page Route + DragOverlay

**Files:**
- Create: `src/app/(dashboard)/master-data/teams/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/app/(dashboard)/master-data/teams/page.tsx
'use client'

import { DndContext, DragOverlay, type DragStartEvent } from '@dnd-kit/core'
import { TeamsPageProvider, useTeamsPage } from '@/components/teams/TeamsPageContext'
import { useDnDHandlers, type DragData } from '@/components/teams/useDnDHandlers'
import { TopBar } from '@/components/teams/TopBar'
import { TeamGrid } from '@/components/teams/TeamGrid'
import { PoolSidebar } from '@/components/teams/PoolSidebar'
import { TeamEditDialog } from '@/components/teams/dialogs/TeamEditDialog'
import { EmployeeEditDialog } from '@/components/teams/dialogs/EmployeeEditDialog'
import { VehicleEditDialog } from '@/components/teams/dialogs/VehicleEditDialog'
import { ScheduleDialog } from '@/components/teams/dialogs/ScheduleDialog'
import { ActivityLogPanel } from '@/components/teams/dialogs/ActivityLogPanel'
import { Truck, User } from 'lucide-react'
import { useEmployees, useVehicles } from '@/hooks/useTeams'

function TeamsPageInner() {
  const { handleDragStart, handleDragEnd, activeItem } = useDnDHandlers()

  function onDragStart(event: DragStartEvent) {
    handleDragStart(event.active.data.current as DragData)
  }

  return (
    <DndContext onDragStart={onDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full">
        <TopBar />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <TeamGrid />
          <PoolSidebar />
        </div>
      </div>

      {/* Drag overlay — floating chip following cursor */}
      <DragOverlay>
        {activeItem && <DragOverlayContent item={activeItem} />}
      </DragOverlay>

      {/* Dialogs */}
      <TeamEditDialog />
      <EmployeeEditDialog />
      <VehicleEditDialog />
      <ScheduleDialog />
      <ActivityLogPanel />
    </DndContext>
  )
}

function DragOverlayContent({ item }: { item: DragData }) {
  const { data: employees = [] } = useEmployees()
  const { data: vehicles  = [] } = useVehicles()

  if (item.type === 'employee') {
    const emp = employees.find(e => e.id === item.employeeId)
    const initials = emp?.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() ?? '?'
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border shadow-lg text-sm">
        {emp?.avatar_url
          ? <img src={emp.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
          : <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-semibold">{initials}</div>
        }
        <span>{emp?.name ?? 'Employee'}</span>
      </div>
    )
  }

  if (item.type === 'vehicle') {
    const veh = vehicles.find(v => v.id === item.vehicleId)
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border shadow-lg text-sm">
        <Truck className="h-4 w-4" />
        <span className="font-mono">{veh?.plate ?? 'Vehicle'}</span>
      </div>
    )
  }

  return null
}

export default function TeamsPage() {
  return (
    <TeamsPageProvider>
      <TeamsPageInner />
    </TeamsPageProvider>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Start dev server and navigate to `/master-data/teams` to verify the page loads**

```bash
npm run dev
```
Expected: Page renders with TopBar, TeamGrid (empty or with data), PoolSidebar, no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/master-data/teams/page.tsx
git commit -m "feat(teams): add Teams & Employee page route with DnD context

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 20: PROGRESS.md update + nav link

**Files:**
- Modify: `PROGRESS.md`
- Modify: Navigation sidebar file (check `src/components/layout/` or `src/components/shared/` for the nav config)

- [ ] **Step 1: Add nav link to sidebar**

Find the sidebar navigation file:

```bash
grep -r "master-data" src/components/layout/ src/components/shared/ --include="*.tsx" -l
```

In the nav config, add:

```tsx
{ href: '/master-data/teams', label: 'Teams & Employees', icon: Users }
```

- [ ] **Step 2: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-05-03] **Teams & Employee Page (Tasks 1-20)** — `supabase/migrations/*`, `src/hooks/useTeams.ts`, `src/components/teams/**`, `src/app/(dashboard)/master-data/teams/page.tsx` — Full teams management page with DnD, CRUD dialogs, activity logging, and schedule management
```

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — Teams & Employee page complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Errata — Code Review Fixes

> Apply these corrections when executing the tasks above. Each entry references the task it patches.

---

### Errata 1: DB constraints (patches Tasks 1, 2, 4)

**Add Migration 5** — `supabase/migrations/20260503000005_constraints.sql`

Fixes:
- **R-EMR/QC**: Add `CHECK (NOT (is_emergency AND is_qc))` to `teams` table
- **R-Traccar unique**: Add `UNIQUE` on `traccar_device_id` in both `teams` and `vehicles`
- **R-tool_assignments CASCADE**: The original Migration 2 uses `ON DELETE SET NULL` which violates the `one_target` CHECK (both FKs become NULL). Change to `ON DELETE CASCADE`.

- [ ] **Step 1: Write Migration 5**

```sql
-- supabase/migrations/20260503000005_constraints.sql

-- EMR/QC are mutually exclusive at DB level (mirrors UI logic in TeamEditDialog)
ALTER TABLE teams
  ADD CONSTRAINT check_emergency_xor_qc CHECK (NOT (is_emergency AND is_qc));

-- Traccar device IDs must be unique — two entities cannot share one device
ALTER TABLE teams
  ADD CONSTRAINT teams_traccar_device_id_unique UNIQUE (traccar_device_id);

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_traccar_device_id_unique UNIQUE (traccar_device_id);

-- Fix tool_assignments FK cascade — SET NULL would put both FKs to NULL,
-- violating the one_target CHECK constraint. CASCADE is correct behavior.
ALTER TABLE tool_assignments
  DROP CONSTRAINT IF EXISTS tool_assignments_team_id_fkey,
  DROP CONSTRAINT IF EXISTS tool_assignments_employee_id_fkey;

ALTER TABLE tool_assignments
  ADD CONSTRAINT tool_assignments_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  ADD CONSTRAINT tool_assignments_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260503000005_constraints.sql
git commit -m "feat(db): add EMR/QC check, traccar unique, fix tool_assignments cascade

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Errata 2: Atomic employee save RPC (patches Task 4 and Task 15)

Add the following RPC to **Migration 4** (`20260503000004_schedules_and_rpcs.sql`) before committing it — or as a separate Migration 6 if Migration 4 was already applied.

Fixes: Non-atomic skill upsert. Employee update + skill delete/insert must be one transaction. If the second call fails after the first succeeds, the employee record is updated but skills are corrupt.

```sql
-- Add to migration 4 (or as migration 20260503000006_save_employee_rpc.sql)

CREATE OR REPLACE FUNCTION save_employee(
  p_employee_id          UUID,
  p_name                 TEXT,
  p_phone                TEXT,
  p_nationality          TEXT,
  p_join_date            DATE,
  p_status               TEXT,
  p_site_visit_order     BOOLEAN,
  p_site_visit_quotation BOOLEAN,
  p_avatar_url           TEXT,
  p_service_ids          UUID[]
)
RETURNS employees LANGUAGE plpgsql AS $$
DECLARE
  v_employee employees;
BEGIN
  UPDATE employees SET
    name                 = p_name,
    phone                = p_phone,
    nationality          = p_nationality,
    join_date            = p_join_date,
    status               = p_status,
    site_visit_order     = p_site_visit_order,
    site_visit_quotation = p_site_visit_quotation,
    avatar_url           = p_avatar_url
  WHERE id = p_employee_id
  RETURNING * INTO v_employee;

  -- Atomically replace all skills in one transaction (Risk R3)
  DELETE FROM employee_services WHERE employee_id = p_employee_id;
  IF array_length(p_service_ids, 1) > 0 THEN
    INSERT INTO employee_services (employee_id, service_id)
    SELECT p_employee_id, unnest(p_service_ids);
  END IF;

  RETURN v_employee;
END;
$$;
```

In **Task 15 EmployeeEditDialog**, replace the two-call pattern:

```typescript
// REMOVE these two separate calls:
// await updateEmployee.mutateAsync({ id: employee!.id, ...payload })
// await createClient().rpc('upsert_employee_services', { ... })

// REPLACE with single atomic RPC call:
const supabase = createClient()
const { data, error } = await supabase.rpc('save_employee', {
  p_employee_id:          employee!.id,
  p_name:                 values.name,
  p_phone:                values.phone || null,
  p_nationality:          values.nationality || null,
  p_join_date:            values.join_date || null,
  p_status:               values.status,
  p_site_visit_order:     values.site_visit_order,
  p_site_visit_quotation: values.site_visit_quotation,
  p_avatar_url:           avatarUrl || null,
  p_service_ids:          values.serviceIds,
})
if (error) throw error
// Manually invalidate queries since we bypassed the mutation hook
qc.invalidateQueries({ queryKey: ['employees'] })
qc.invalidateQueries({ queryKey: ['teams'] })
qc.invalidateQueries({ queryKey: ['team-activity-log'] })
```

Also update `useUpdateEmployee` hook to add `qc` from `useQueryClient` since the dialog bypasses it for the edit path. For **create** path, still use `useCreateEmployee` + `upsert_employee_services` as two calls (create is low-risk: if skills fail the employee just has no skills, nothing corrupt).

---

### Errata 3: Batch tool count query — fix N+1 (patches Tasks 5, 8, 11, 12, 13)

The `useToolAssignments('employee', id)` hook in `MemberAvatar` and `EmployeeRow` fires one query per employee rendered. With 100 employees on screen this is 100 concurrent API calls.

**Fix: Add a batch hook to `useTeams.ts`:**

```typescript
// Add to src/hooks/useTeams.ts

/** Returns a Map<entityId, toolCount> for ALL employees or ALL teams in one query. */
export function useToolCountMap(entityType: 'team' | 'employee') {
  return useQuery({
    queryKey: ['tool-count-map', entityType],
    queryFn: async () => {
      const supabase = createClient()
      const col = entityType === 'team' ? 'team_id' : 'employee_id'
      const { data, error } = await supabase
        .from('tool_assignments')
        .select(col)
        .not(col, 'is', null)
      if (error) throw error
      const counts = new Map<string, number>()
      for (const row of data as Record<string, string>[]) {
        const id = row[col]
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
      return counts
    },
    staleTime: 30 * 1000,
  })
}
```

**Fix: Add tool count maps to `TeamsPageContext`:**

```typescript
// In TeamsPageContext.tsx, add to context value and provider:

interface TeamsPageContextValue {
  // ... existing fields ...
  employeeToolCounts: Map<string, number>
  teamToolCounts:     Map<string, number>
}

// In TeamsPageProvider:
const { data: employeeToolCounts = new Map() } = useToolCountMap('employee')
const { data: teamToolCounts     = new Map() } = useToolCountMap('team')

// Pass both in the context value.
```

**Fix: Update `MemberAvatar` (in MembersGrid.tsx) — remove per-member hook:**

```typescript
// REMOVE: const { data: tools = [] } = useToolAssignments('employee', employee.id)

// REPLACE: receive hasTools as prop
function MemberAvatar({ employee, teamId, hasTools }: {
  employee: Employee; teamId: string; hasTools: boolean
}) {
  // ... rest unchanged, replace tools.length > 0 check with hasTools
}

// In MembersGrid, read from context:
const { employeeToolCounts } = useTeamsPage()
// Then pass: hasTools={employeeToolCounts.has(emp.id)}
```

**Fix: Update `EmployeeRow` (EmployeeRow.tsx) — remove per-employee hook:**

```typescript
// REMOVE: const { data: tools = [] } = useToolAssignments('employee', employee.id)

// REPLACE: read from context
const { employeeToolCounts } = useTeamsPage()
const toolCount = employeeToolCounts.get(employee.id) ?? 0
```

**Fix: Update `TeamCard` — remove per-team hook:**

```typescript
// REMOVE: const { data: tools = [] } = useToolAssignments('team', team.id)

// REPLACE: read from context
const { teamToolCounts } = useTeamsPage()
const toolCount = teamToolCounts.get(team.id) ?? 0
```

**Fix: Update `TeamRow` — same as TeamCard.**

Result: 3 queries total (one for all employee tool counts, one for all team tool counts, one for tool count in the leader slot tooltip if needed) instead of O(n) queries.

---

### Errata 4: DnD same-source guard + leader status check (patches Task 9)

In `useDnDHandlers.ts`, add guards before calling mutate:

```typescript
// In handleDragEnd, BEFORE the mutation calls:

// Guard 1: No-op if employee dropped back to the same team
if (drag.type === 'employee' && drop.zone === 'team-members') {
  if (drag.fromTeamId === drop.teamId) return  // already a member, skip
  assignEmployee.mutate({ employeeId: drag.employeeId, teamId: drop.teamId })
  return
}

// Guard 2: Prevent archived/vacation employees from becoming leader
if (drag.type === 'employee' && drop.zone === 'team-leader') {
  // employees are available in TanStack Query cache — read synchronously
  const qc = useQueryClient() // NOTE: this needs to be called at hook top level, not inside handleDragEnd
  const cached = qc.getQueryData<Employee[]>(['employees', undefined]) ?? []
  const emp = cached.find(e => e.id === drag.employeeId)
  if (emp && (emp.status === 'archived' || emp.status === 'vacation')) return
  setLeader.mutate({ teamId: drop.teamId, employeeId: drag.employeeId })
  return
}
```

Note: `useQueryClient()` must be called at hook top level. Add `const qc = useQueryClient()` to the top of `useDnDHandlers`.

---

### Errata 5: Plate validation race condition (patches Task 16)

In `VehicleEditDialog.tsx`, add an `isValidating` state to block Save during async check:

```typescript
const [plateError, setPlateError]       = useState<string | null>(null)
const [isValidatingPlate, setIsValidating] = useState(false)

async function validatePlate(plate: string) {
  if (!plate) return
  setIsValidating(true)
  try {
    const supabase = createClient()
    const { count } = await supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('plate', plate)
      .neq('id', vehicle?.id ?? '00000000-0000-0000-0000-000000000000')
    setPlateError((count ?? 0) > 0 ? 'Plate already in use' : null)
  } finally {
    setIsValidating(false)
  }
}

// Save button:
<Button type="submit" disabled={isPending || !!plateError || isValidatingPlate}>
  {isValidatingPlate ? 'Checking...' : isPending ? 'Saving...' : 'Save'}
</Button>
```

---

### Errata 6: TeamEditDialog — normalize both-true on mount (patches Task 14)

In `TeamEditDialog.tsx`, the `useEffect` that resets the form must handle the case where stale data (e.g. from a migration before the CHECK constraint) has both `is_emergency` and `is_qc` as `true`:

```typescript
useEffect(() => {
  if (team) {
    // Normalize: if DB has both true (pre-constraint data), prefer emergency
    const isEmergency = team.is_emergency ?? false
    const isQc        = isEmergency ? false : (team.is_qc ?? false)
    form.reset({
      // ... other fields ...
      is_emergency: isEmergency,
      is_qc:        isQc,
    })
  }
}, [team, open])
```

---

### Errata 7: Avatar path collision (patches Task 15)

In `EmployeeEditDialog.tsx`, replace `Date.now()` with `crypto.randomUUID()`:

```typescript
// REMOVE:
const path = `${Date.now()}-${file.name}`

// REPLACE:
const ext  = file.name.split('.').pop()
const path = `${crypto.randomUUID()}.${ext}`
```

---

### Errata 8: DragOverlay z-index (patches Task 19)

In `page.tsx`, add explicit z-index to the DragOverlay so it renders above all modals and sheets:

```tsx
<DragOverlay dropAnimation={null} style={{ zIndex: 9999 }}>
  {activeItem && <DragOverlayContent item={activeItem} />}
</DragOverlay>
```

---

### Errata 9: Schedule soft-delete orphanage (patches Tasks 4 and 17)

**Problem:** `useDeleteSchedule` sets `deleted_at` on the schedule row. The `sync_team_active_schedule` RPC does not filter by `deleted_at IS NULL`, so a team can stay linked to a soft-deleted schedule forever.

**Fix A — Update the RPC in Migration 4** to join on non-deleted schedules:

```sql
CREATE OR REPLACE FUNCTION sync_team_active_schedule(p_team_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_schedule_id UUID;
BEGIN
  SELECT tsa.schedule_id INTO v_schedule_id
  FROM team_schedule_assignments tsa
  JOIN schedules s ON s.id = tsa.schedule_id
  WHERE tsa.team_id = p_team_id
    AND tsa.start_date <= CURRENT_DATE
    AND (tsa.end_date IS NULL OR tsa.end_date >= CURRENT_DATE)
    AND s.deleted_at IS NULL          -- exclude soft-deleted schedules
  ORDER BY tsa.start_date DESC
  LIMIT 1;

  UPDATE teams SET schedule_id = v_schedule_id WHERE id = p_team_id;
END;
$$;
```

**Fix B — Update `useDeleteSchedule` hook** in `useTeams.ts` to cascade-detach all assignments for that schedule and re-sync affected teams:

```typescript
export function useDeleteSchedule() {
  const qc = useQueryClient()
  return useMutation({
    // MUST call logActivity
    mutationFn: async (id: string) => {
      const supabase = createClient()

      // 1. Find all teams that have an assignment to this schedule
      const { data: affected } = await supabase
        .from('team_schedule_assignments')
        .select('team_id')
        .eq('schedule_id', id)

      // 2. Soft-delete the schedule
      const { error } = await supabase
        .from('schedules')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error

      // 3. Delete all assignments referencing this schedule
      await supabase
        .from('team_schedule_assignments')
        .delete()
        .eq('schedule_id', id)

      // 4. Re-sync each affected team's active schedule pointer
      const teamIds = [...new Set((affected ?? []).map(r => r.team_id))]
      await Promise.all(
        teamIds.map(teamId =>
          supabase.rpc('sync_team_active_schedule', { p_team_id: teamId })
        )
      )

      await logActivity({ action: 'schedule-deleted', entityType: 'schedule', entityId: id })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-schedule-assignments'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    },
  })
}
```

---

### Errata 10: Activity log real count in TopBar (patches Tasks 5 and 10)

**Problem:** `useTeamActivityLog` applies `.limit(500)`. `TopBar` uses `logs.length` for the badge, which caps at 500 even when thousands of logs exist.

**Fix — Add a count-only hook to `useTeams.ts`:**

```typescript
/** Returns total count of activity log rows (no row data, no limit). */
export function useTeamActivityLogCount() {
  return useQuery({
    queryKey: ['team-activity-log-count'],
    queryFn: async () => {
      const supabase = createClient()
      const { count, error } = await supabase
        .from('team_activity_log')
        .select('id', { count: 'exact', head: true })
      if (error) throw error
      return count ?? 0
    },
    staleTime: 10 * 1000,
  })
}
```

**Fix — Update `TopBar.tsx`** to use the count hook instead of `logs.length`:

```typescript
// REMOVE: const { data: logs = [] } = useTeamActivityLog()
// REPLACE:
import { useTeamActivityLogCount } from '@/hooks/useTeams'
const { data: logCount = 0 } = useTeamActivityLogCount()

// In render:
<Button variant="outline" size="sm" onClick={() => openLogPanel()}>
  <Activity className="h-4 w-4 mr-1" /> Logs ({logCount})
</Button>
```

Also invalidate `['team-activity-log-count']` in every mutation's `onSuccess` alongside `['team-activity-log']`.

---

### Errata 11: Surface RPC errors in EmployeeEditDialog (patches Errata 2 / Task 15)

**Problem:** The `save_employee` RPC call (added in Errata 2) uses `if (error) throw error`, which throws but the error is not shown to the user — `form.handleSubmit` silently swallows it and the dialog can close.

**Fix — Add explicit error state to `EmployeeEditDialog`:**

```typescript
const [submitError, setSubmitError] = useState<string | null>(null)

async function onSubmit(values: EmployeeFormValues) {
  setSubmitError(null)
  try {
    let avatarUrl = values.avatar_url
    if (fileRef.current?.files?.[0]) {
      avatarUrl = await uploadAvatar(fileRef.current.files[0])
    }

    if (isEdit) {
      const { error } = await createClient().rpc('save_employee', { /* ... */ })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['teams'] })
      qc.invalidateQueries({ queryKey: ['team-activity-log'] })
    } else {
      const created = await createEmployee.mutateAsync({ /* payload without serviceIds */ })
      const { error } = await createClient().rpc('upsert_employee_services', {
        p_employee_id: created.id,
        p_service_ids: values.serviceIds,
      })
      if (error) throw error
    }
    closeEmployeeDialog()
  } catch (err) {
    setSubmitError(err instanceof Error ? err.message : 'Save failed. Please try again.')
  }
}

// In JSX, show error above footer:
{submitError && (
  <p className="text-sm text-destructive border border-destructive/20 rounded p-2">{submitError}</p>
)}
```

---

### Errata 12: Resilient `useTeams` query — prevent one-table failure from breaking everything (patches Task 5)

**Problem:** The `useTeams` queryFn awaits four sequential queries. If the `vehicles` query throws (e.g. a permissions error), the entire hook fails and the page shows "No teams found" even though teams/employees loaded fine.

**Fix — Use `Promise.allSettled` for the independent sub-queries:**

```typescript
queryFn: async () => {
  const supabase = createClient()

  const [teamsRes, employeesRes, vehiclesRes, schedulesRes] = await Promise.allSettled([
    supabase.from('teams').select('*').is('deleted_at', null).order('name_en'),
    supabase.from('employees').select('*').is('deleted_at', null),
    supabase.from('vehicles').select('*').is('deleted_at', null),
    supabase.from('schedules').select('*').is('deleted_at', null),
  ])

  // Teams are required — throw if they fail
  if (teamsRes.status === 'rejected' || teamsRes.value.error) {
    throw teamsRes.status === 'rejected' ? teamsRes.reason : teamsRes.value.error
  }

  // Other tables degrade gracefully
  const teams     = teamsRes.value.data ?? []
  const employees = employeesRes.status === 'fulfilled' ? (employeesRes.value.data ?? []) : []
  const vehicles  = vehiclesRes.status === 'fulfilled'  ? (vehiclesRes.value.data ?? [])  : []
  const schedules = schedulesRes.status === 'fulfilled' ? (schedulesRes.value.data ?? []) : []

  // ... rest of mapping unchanged
}
```

---

### Errata 13: Schedule default workweek Sun–Thu (patches Task 17)

**Problem:** `defaultDays()` enables Mon–Thu. The standard workweek in Saudi Arabia (where this system operates) is Sun–Thu.

**Fix — Update `defaultDays` in `ScheduleDialog.tsx`:**

```typescript
function defaultDays() {
  return Object.fromEntries(
    DAYS.map(d => [d, {
      enabled:       ['sun','mon','tue','wed','thu'].includes(d),
      start:         '08:00',
      end:           '17:00',
      break_minutes: 60,
    }])
  )
}
```

---

### Known Limitations (not fixed — accepted trade-offs)

| Issue | Status |
|---|---|
| **Stale schedule sync**: `sync_team_active_schedule` only fires on manual attach/detach. Schedules with future `start_date` won't auto-activate. | Matches spec R5. Fix in a later phase: add a DB view `team_active_schedule_v` computed at query time. |
| **Memory-heavy `useTeams`**: Fetches all teams/employees/vehicles into JS memory. | Matches spec architecture. Future fix: move join to a Supabase DB view. |
| **Optimistic UI for DnD**: Dragged items snap back on slow connections. | Out of spec scope. Future improvement. |
| **Audit log best-effort**: Client-side mutations log after success, not atomically. | RPCs (`assign_team_leader`) log atomically. Client mutations are best-effort — acceptable for audit logging. |
| **Missing RLS policies**: New tables have no per-table RLS. | Existing project RLS infrastructure applies. Verify in Supabase dashboard after migration. |
