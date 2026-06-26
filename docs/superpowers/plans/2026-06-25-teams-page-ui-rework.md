# Teams Page UI Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/master-data/teams` into a two-pane CRM workspace (left rail of teams + right detail pane) with a collapsible pools drawer and a day-grouped accordion activity log, in a Linear/Notion minimal visual style.

**Architecture:**
- Build the new components inside `src/components/teams/v2/` so the old page keeps working during construction. Only in the final cleanup task do we switch `page.tsx` to the new components and delete the old files.
- No data-model changes: every existing hook (`useTeams`, `useEmployees`, `useVehicles`, `useTeamActivityLog`, `useDnDHandlers`) keeps its current shape.
- Activity sentence generation is a pure client-side mapper, no server changes.
- The existing `TeamsPageProvider` is extended with `selectedTeamId` (URL-synced via `?team=`) and `poolsDrawerOpen`; everything else stays in place.

**Tech Stack:** Next.js (App Router), React 19, TypeScript, Tailwind, shadcn/ui (Sheet/Button/Input/Badge/Tooltip/DropdownMenu/Tabs), `@dnd-kit/core`, `date-fns`, React Query, Supabase.

**Spec:** [`docs/superpowers/specs/2026-06-25-teams-page-ui-rework-design.md`](../specs/2026-06-25-teams-page-ui-rework-design.md)

## Project Rules That Apply to Every Task

1. **No build runs.** Do NOT run `next build` or `next dev` unless the user explicitly asks. Write code, ask the user to verify in their already-running dev server.
2. **No browser tools.** Never use Chrome/Preview/Playwright to "verify" — ask the user to look at `http://localhost:3000/master-data/teams` in their own browser.
3. **Commit only when user confirms.** After each task's code changes are done, ask the user to verify. Only commit after they confirm "works" / "good" / equivalent.
4. **Commit message format** — HEREDOC with both co-authors:
   ```
   git commit -m "$(cat <<'EOF'
   feat(teams): <task subject>

   Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
   Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
   EOF
   )"
   ```
5. **PROGRESS.md** — after each code commit, update PROGRESS.md (add to `## ✅ Completed`, remove from `## 🔄 In Progress`, add the next task) and commit that as a separate `docs:` commit.
6. **EOD report** — append the completed task to `EOD/EOD-2026-MM-DD.md` (folder, not project root) for the date the task lands.

---

## File Map

**New files** (created in this plan):

| Path | Purpose |
|---|---|
| `src/components/teams/v2/teamStatus.ts` | Pure helper: `teamStatus(team) → 'green' \| 'amber' \| 'red' \| 'gray'` |
| `src/components/teams/v2/activitySentences.ts` | Pure helper: `formatActivity(log) → string` |
| `src/components/teams/v2/TopBar.tsx` | New top bar (title + counters + search + New ▾ + icons) |
| `src/components/teams/v2/TeamListRow.tsx` | One row in the left rail (status dot + name + plate + count) |
| `src/components/teams/v2/TeamList.tsx` | Left rail with grouped teams + footer add button |
| `src/components/teams/v2/TeamDetail.tsx` | Right pane (hero + slots + members + actions) |
| `src/components/teams/v2/TeamDetailEmpty.tsx` | "Select a team" empty state |
| `src/components/teams/v2/PoolsDrawer.tsx` | Collapsible pools drawer (Employees / Vehicles tabs + search) |
| `src/components/teams/v2/ActivityLog.tsx` | Day-grouped accordion timeline log sheet |
| `src/components/teams/v2/UndoToast.tsx` | Tiny helper to show "X — Undo" toasts after DnD |

**Modified files:**

| Path | Why |
|---|---|
| `src/components/teams/TeamsPageContext.tsx` | Add `selectedTeamId`, `setSelectedTeamId`, `poolsDrawerOpen`, `togglePoolsDrawer`, URL sync |
| `src/components/teams/useDnDHandlers.ts` | Expose `lastAssignment` for undo + `undoLastAssignment()` |
| `src/components/teams/LeaderSlot.tsx` | Restyle to flat neutral (drop amber-50 bg, ring style) |
| `src/components/teams/VehicleSlot.tsx` | Restyle to flat neutral |
| `src/components/teams/MembersGrid.tsx` | Restyle (drop primary/20 avatar bg, use muted) + show name labels under tile |
| `src/app/(dashboard)/master-data/teams/page.tsx` | Swap to new components + add `KeyboardSensor` |

**Deleted files** (final cleanup task):

- `src/components/teams/TopBar.tsx` (old)
- `src/components/teams/TeamGrid.tsx`
- `src/components/teams/TeamCard.tsx`
- `src/components/teams/TeamRow.tsx`
- `src/components/teams/PoolSidebar.tsx`
- `src/components/teams/VehiclePool.tsx`
- `src/components/teams/EmployeePool.tsx`
- `src/components/teams/EmployeeRow.tsx`
- `src/components/teams/StatusTabs.tsx`
- `src/components/teams/dialogs/ActivityLogPanel.tsx`

---

## Task 1 — Foundation helpers (pure functions, no UI)

**Files:**
- Create: `src/components/teams/v2/teamStatus.ts`
- Create: `src/components/teams/v2/activitySentences.ts`

### Step 1.1 — PROGRESS.md "Starting" entry

- [ ] Open `PROGRESS.md`, update `## 🔄 In Progress`:
  ```
  🚀 Starting: **Teams UI Rework Task 1: Foundation helpers**
  ```
- [ ] Commit (PROGRESS.md only):
  ```bash
  git add PROGRESS.md
  git commit -m "$(cat <<'EOF'
  docs: update PROGRESS.md — starting Teams UI Task 1

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

### Step 1.2 — Write `teamStatus.ts`

- [ ] Create `src/components/teams/v2/teamStatus.ts` with this exact content:

```ts
import type { TeamFull } from '@/hooks/useTeams'

export type TeamStatus = 'green' | 'amber' | 'red' | 'gray'

/**
 * Status dot color for the left-rail row.
 *
 * gray  = archived OR completely empty (no leader, no members, no vehicle)
 * red   = has members but no leader (blocking — team can't operate)
 * amber = missing at least one of {vehicle, members} but has a leader
 * green = leader + ≥1 member + ≥1 vehicle
 */
export function teamStatus(team: TeamFull): TeamStatus {
  if (team.archived) return 'gray'

  const hasLeader   = team.leader_id != null
  const memberCount = team.members.filter(m => m.id !== team.leader_id).length
  const hasVehicle  = team.vehicles.length > 0

  if (!hasLeader && memberCount === 0 && !hasVehicle) return 'gray'
  if (!hasLeader) return 'red'
  if (memberCount === 0 || !hasVehicle) return 'amber'
  return 'green'
}

export const STATUS_CLASS: Record<TeamStatus, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red:   'bg-red-500',
  gray:  'bg-muted-foreground/40',
}
```

> Note: `team.archived` is read off `TeamRaw` (the teams table). If that field doesn't exist, replace the check with `team.is_archived ?? false`. Verify with a quick grep before saving: `grep -n "archived" src/hooks/useTeams.ts` and align the field name with what's actually there.

### Step 1.3 — Write `activitySentences.ts`

- [ ] Create `src/components/teams/v2/activitySentences.ts` with this exact content:

```ts
import type { ActivityLogEntry } from '@/hooks/useTeams'

type LogWithActor = ActivityLogEntry & {
  actor: { id: string; full_name: string } | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SKIP_KEYS = new Set(['id', 'created_at', 'updated_at'])

function isUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v)
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (isUuid(v)) return null
  return String(v)
}

function pick(data: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!data) return null
  for (const k of keys) {
    const s = asString(data[k])
    if (s) return s
  }
  return null
}

function changedFields(
  before: Record<string, unknown> | null | undefined,
  after:  Record<string, unknown> | null | undefined,
): string[] {
  if (!after) return []
  const out: string[] = []
  for (const [k, v] of Object.entries(after)) {
    if (SKIP_KEYS.has(k) || k.endsWith('_id') || k.endsWith('_at')) continue
    const prev = before?.[k]
    if (prev !== v) out.push(k.replace(/_/g, ' '))
  }
  return out
}

export function formatActivity(log: LogWithActor): string {
  const actor    = log.actor?.full_name ?? 'System'
  const name     = pick(log.after_data, ['name_en', 'name', 'full_name', 'plate']) ?? 'Unknown'
  const prevName = pick(log.before_data, ['name_en', 'name', 'full_name', 'plate']) ?? name
  const team     = pick(log.after_data, ['team_name']) ?? pick(log.before_data, ['team_name']) ?? 'team'

  const changes  = changedFields(log.before_data, log.after_data)
  const changesS = changes.length ? ` (${changes.slice(0, 3).join(', ')}${changes.length > 3 ? `, +${changes.length - 3}` : ''})` : ''

  switch (log.action) {
    case 'team-created':       return `${actor} created team ${name}`
    case 'team-edited':        return `${actor} updated ${name}${changesS}`
    case 'team-archived':      return `${actor} archived ${name}`

    case 'employee-created':   return `${actor} added employee ${name}`
    case 'employee-edited':    return `${actor} updated ${name}${changesS}`
    case 'employee-assigned':  return `${actor} assigned ${name} to ${team}`
    case 'employee-removed':   return `${actor} removed ${name} from ${team}`
    case 'employee-disabled':  return `${actor} disabled ${name}`
    case 'employee-enabled':   return `${actor} re-enabled ${name}`
    case 'employee-archived':  return `${actor} archived ${name}`

    case 'vehicle-created':    return `${actor} added vehicle ${name}`
    case 'vehicle-edited':     return `${actor} updated vehicle ${name}${changesS}`
    case 'vehicle-assigned':   return `${actor} assigned ${name} to ${team}`
    case 'vehicle-removed':    return `${actor} unassigned ${name} from ${team}`
    case 'vehicle-archived':   return `${actor} archived vehicle ${prevName}`

    case 'tool-assigned':      return `${actor} assigned a tool to ${team}`
    case 'tool-removed':       return `${actor} removed a tool from ${team}`

    default: {
      const humanAction = log.action.replace(/-/g, ' ')
      const entity      = log.entity_type ?? ''
      return `${actor} ${humanAction}${entity ? ` (${entity})` : ''}`
    }
  }
}
```

### Step 1.4 — Ask user to spot-check & commit

- [ ] Tell the user: "Foundation helpers written. They're not wired in yet — please open both files and skim for anything that looks off. Once you confirm, I'll commit."
- [ ] After confirmation, commit:
  ```bash
  git add src/components/teams/v2/teamStatus.ts src/components/teams/v2/activitySentences.ts
  git commit -m "$(cat <<'EOF'
  feat(teams): add status & activity-sentence helpers

  Pure-function utilities for the upcoming teams UI rework. teamStatus
  derives the green/amber/red/gray dot color from a TeamFull. formatActivity
  turns an ActivityLogEntry into a human sentence and never leaks UUIDs.

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

### Step 1.5 — PROGRESS.md "Completed" + EOD

- [ ] Move the Task 1 line into `## ✅ Completed`, drop it from `## 🔄 In Progress`, add Task 2 as the new In Progress entry.
- [ ] Append to `EOD/EOD-2026-06-25.md` (or today's date file): one line — `Teams UI Task 1: Foundation helpers — added teamStatus and activitySentences helpers.`
- [ ] Commit PROGRESS.md only:
  ```bash
  git add PROGRESS.md
  git commit -m "$(cat <<'EOF'
  docs: update PROGRESS.md — Teams UI Task 1 complete

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2 — Extend `TeamsPageContext` (selectedTeamId + poolsDrawerOpen + URL sync)

**Files:**
- Modify: `src/components/teams/TeamsPageContext.tsx`

### Step 2.1 — PROGRESS.md "Starting"

- [ ] Update `## 🔄 In Progress` to `🚀 Starting: **Teams UI Rework Task 2: Context extensions**` and commit (same pattern as Step 1.1).

### Step 2.2 — Add the new context fields

- [ ] Edit `src/components/teams/TeamsPageContext.tsx`. The interface and provider grow as follows. Use `useRouter`/`useSearchParams` from `next/navigation` to drive `selectedTeamId` off the URL `?team=` param.

Replace the file with this exact content:

```tsx
'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { TeamFull, Employee, Vehicle } from '@/hooks/useTeams'
import { useToolCountMap } from '@/hooks/useTeams'

interface TeamDialogState     { open: boolean; team: TeamFull | null }
interface EmployeeDialogState { open: boolean; employee: Employee | null }
interface VehicleDialogState  { open: boolean; vehicle: Vehicle | null }
interface ScheduleDialogState { open: boolean; teamId: string | null }
interface LogPanelState       { open: boolean; entityId: string | null; entityType: string | null }
interface ToolsSheetState     { open: boolean; teamId: string | null; teamName: string | null }

interface TeamsPageContextValue {
  teamDialog:     TeamDialogState
  employeeDialog: EmployeeDialogState
  vehicleDialog:  VehicleDialogState
  scheduleDialog: ScheduleDialogState
  logPanel:       LogPanelState
  toolsSheet:     ToolsSheetState

  searchQuery:    string
  divisionFilter: string | null
  density:        'card' | 'list'

  // v2: selection + pools drawer
  selectedTeamId: string | null
  poolsDrawerOpen: boolean

  employeeToolCounts: Map<string, number>
  teamToolCounts:     Map<string, number>

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
  openToolsSheet:     (teamId: string, teamName: string) => void
  closeToolsSheet:    () => void
  setSearch:          (q: string) => void
  setDivisionFilter:  (id: string | null) => void
  setDensity:         (d: 'card' | 'list') => void

  // v2
  setSelectedTeamId:  (id: string | null) => void
  togglePoolsDrawer:  () => void
  setPoolsDrawerOpen: (open: boolean) => void
}

const TeamsPageContext = createContext<TeamsPageContextValue | null>(null)

export function TeamsPageProvider({ children }: { children: ReactNode }) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const [teamDialog,     setTeamDialog]     = useState<TeamDialogState>({ open: false, team: null })
  const [employeeDialog, setEmployeeDialog] = useState<EmployeeDialogState>({ open: false, employee: null })
  const [vehicleDialog,  setVehicleDialog]  = useState<VehicleDialogState>({ open: false, vehicle: null })
  const [scheduleDialog, setScheduleDialog] = useState<ScheduleDialogState>({ open: false, teamId: null })
  const [logPanel,       setLogPanel]       = useState<LogPanelState>({ open: false, entityId: null, entityType: null })
  const [toolsSheet,     setToolsSheet]     = useState<ToolsSheetState>({ open: false, teamId: null, teamName: null })
  const [searchQuery,    setSearch]         = useState('')
  const [divisionFilter, setDivisionFilter] = useState<string | null>(null)
  const [density,        setDensity]        = useState<'card' | 'list'>('card')
  const [poolsDrawerOpen, setPoolsDrawerOpen] = useState(false)

  const selectedTeamId = searchParams.get('team')

  const setSelectedTeamId = useCallback((id: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('team', id)
    else    params.delete('team')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  const togglePoolsDrawer = useCallback(() => setPoolsDrawerOpen(o => !o), [])

  const { data: employeeToolCounts = new Map() } = useToolCountMap('employee')
  const { data: teamToolCounts     = new Map() } = useToolCountMap('team')

  return (
    <TeamsPageContext.Provider value={{
      teamDialog,
      employeeDialog,
      vehicleDialog,
      scheduleDialog,
      logPanel,
      toolsSheet,
      searchQuery,
      divisionFilter,
      density,
      selectedTeamId,
      poolsDrawerOpen,
      employeeToolCounts,
      teamToolCounts,
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
      openToolsSheet:      (teamId, teamName) => setToolsSheet({ open: true, teamId, teamName }),
      closeToolsSheet:     ()         => setToolsSheet({ open: false, teamId: null, teamName: null }),
      setSearch,
      setDivisionFilter,
      setDensity,
      setSelectedTeamId,
      togglePoolsDrawer,
      setPoolsDrawerOpen,
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

### Step 2.3 — Ask user to verify & commit

- [ ] Tell the user: "Context extended with `selectedTeamId` (URL-synced) and `poolsDrawerOpen`. Existing page should still work unchanged. Please reload `/master-data/teams` and confirm no regressions, then I'll commit."
- [ ] On confirmation, commit, then update PROGRESS.md + EOD (same pattern as Task 1).

---

## Task 3 — `TopBar` v2

**Files:**
- Create: `src/components/teams/v2/TopBar.tsx`

### Step 3.1 — PROGRESS.md "Starting"

- [ ] Mark Task 3 starting + commit.

### Step 3.2 — Write the new TopBar

- [ ] Create `src/components/teams/v2/TopBar.tsx`:

```tsx
'use client'

import { Search, Plus, Calendar, Activity, Users, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTeams, useEmployees, useVehicles, useTeamActivityLogCount } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'

export function TopBar() {
  const { data: teams     = [] } = useTeams()
  const { data: employees = [] } = useEmployees()
  const { data: vehicles  = [] } = useVehicles()
  const { data: logCount  = 0  } = useTeamActivityLogCount()
  const {
    searchQuery, setSearch,
    openTeamDialog, openEmployeeDialog, openVehicleDialog,
    openScheduleDialog, openLogPanel,
    togglePoolsDrawer,
  } = useTeamsPage()

  const unassignedCount =
    employees.filter(e => !e.team_id).length +
    vehicles.filter(v => !v.team_id).length

  return (
    <div className="h-12 px-4 flex items-center gap-3 border-b border-border/60 bg-background">
      <div className="flex items-center gap-2 min-w-0">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold truncate">Team &amp; Employee</h1>
        <span className="hidden md:inline text-xs text-muted-foreground truncate">
          · {teams.length} teams · {employees.length} employees · {vehicles.length} vehicles
        </span>
      </div>

      <div className="flex-1" />

      <div className="relative hidden sm:block">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search teams…"
          className="h-8 w-56 pl-8 text-sm"
          value={searchQuery}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="h-8 gap-1">
            <Plus className="h-4 w-4" /> New <ChevronDown className="h-3 w-3 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openTeamDialog()}>New team</DropdownMenuItem>
          <DropdownMenuItem onClick={() => openEmployeeDialog()}>New employee</DropdownMenuItem>
          <DropdownMenuItem onClick={() => openVehicleDialog()}>New vehicle</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => openScheduleDialog()}
        title="Schedules"
      >
        <Calendar className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 relative"
        onClick={() => openLogPanel()}
        title="Activity log"
      >
        <Activity className="h-4 w-4" />
        {logCount > 0 && (
          <Badge
            variant="secondary"
            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] rounded-full"
          >
            {logCount > 99 ? '99+' : logCount}
          </Badge>
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 relative"
        onClick={togglePoolsDrawer}
        title="Pools"
      >
        <Users className="h-4 w-4" />
        {unassignedCount > 0 && (
          <Badge
            variant="secondary"
            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] rounded-full"
          >
            {unassignedCount}
          </Badge>
        )}
      </Button>
    </div>
  )
}
```

### Step 3.3 — Verify & commit

- [ ] The TopBar is not wired into the page yet; it won't render anywhere. Tell the user: "TopBar v2 is written but not yet wired up — visual verification comes in Task 8. Skim the code, confirm, and I'll commit."
- [ ] Commit + PROGRESS.md + EOD (same pattern).

---

## Task 4 — `TeamListRow` + `TeamList` (left rail)

**Files:**
- Create: `src/components/teams/v2/TeamListRow.tsx`
- Create: `src/components/teams/v2/TeamList.tsx`

### Step 4.1 — PROGRESS.md "Starting"

### Step 4.2 — `TeamListRow.tsx`

- [ ] Create `src/components/teams/v2/TeamListRow.tsx`:

```tsx
'use client'

import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { TeamFull } from '@/hooks/useTeams'
import { teamStatus, STATUS_CLASS } from './teamStatus'

interface Props {
  team:     TeamFull
  selected: boolean
  onSelect: () => void
}

export function TeamListRow({ team, selected, onSelect }: Props) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `list-row-${team.id}`,
    data: { zone: 'team-members', teamId: team.id },
  })

  const status      = teamStatus(team)
  const memberCount = team.members.filter(m => m.id !== team.leader_id).length
  const plate       = team.vehicles[0]?.plate ?? '—'
  const name        = team.name_en ?? team.name
  const dragIsValid = !!active // any drag — leave precise type-checking to drop handler

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative w-full h-11 px-3 flex items-center gap-2 text-left transition-colors border-l-2',
        selected ? 'bg-accent border-l-primary' : 'border-l-transparent hover:bg-muted/40',
        isOver && dragIsValid && 'ring-2 ring-primary/40 ring-inset bg-primary/5',
      )}
    >
      <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_CLASS[status])} aria-hidden />

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex-1 truncate text-sm">{name}</span>
        </TooltipTrigger>
        {team.name_ar && (
          <TooltipContent side="right" dir="rtl">{team.name_ar}</TooltipContent>
        )}
      </Tooltip>

      <span className="font-mono text-[11px] text-muted-foreground shrink-0">{plate}</span>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-5 text-right">{memberCount}</span>
    </button>
  )
}
```

### Step 4.3 — `TeamList.tsx`

- [ ] Create `src/components/teams/v2/TeamList.tsx`:

```tsx
'use client'

import { Plus } from 'lucide-react'
import { useTeams, type TeamFull } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'
import { TeamListRow } from './TeamListRow'

type DivisionGroup = { divisionName: string; teams: TeamFull[] }
type CompanyGroup  = { companyName: string; divisions: DivisionGroup[] }

function groupTeams(teams: TeamFull[]): CompanyGroup[] {
  const companyMap = new Map<string, Map<string, TeamFull[]>>()
  for (const t of teams) {
    const companyName  = t.division?.company_name ?? 'Unassigned'
    const divisionName = t.division?.name         ?? 'Unassigned'
    if (!companyMap.has(companyName)) companyMap.set(companyName, new Map())
    const divMap = companyMap.get(companyName)!
    if (!divMap.has(divisionName)) divMap.set(divisionName, [])
    divMap.get(divisionName)!.push(t)
  }
  return Array.from(companyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([companyName, divMap]) => ({
      companyName,
      divisions: Array.from(divMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([divisionName, teams]) => ({
          divisionName,
          teams: teams.sort((a, b) => (a.name_en ?? a.name).localeCompare(b.name_en ?? b.name)),
        })),
    }))
}

export function TeamList() {
  const { searchQuery, selectedTeamId, setSelectedTeamId, openTeamDialog } = useTeamsPage()
  const { data: teams = [], isLoading } = useTeams({ search: searchQuery })

  const groups       = groupTeams(teams)
  const multiCompany = groups.length > 1

  return (
    <div className="w-[300px] shrink-0 border-r border-border/60 flex flex-col bg-background">
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && (
          <p className="text-xs text-muted-foreground px-4 py-6">Loading…</p>
        )}
        {!isLoading && teams.length === 0 && (
          <p className="text-xs text-muted-foreground px-4 py-6">No teams</p>
        )}
        {groups.map(cg => (
          <div key={cg.companyName} className="mb-2">
            {multiCompany && (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-3 pb-1">
                {cg.companyName}
              </p>
            )}
            {cg.divisions.map(dg => (
              <div key={dg.divisionName}>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 px-3 pt-2 pb-1">
                  {dg.divisionName}
                </p>
                {dg.teams.map(t => (
                  <TeamListRow
                    key={t.id}
                    team={t}
                    selected={selectedTeamId === t.id}
                    onSelect={() => setSelectedTeamId(t.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-border/60 p-2">
        <button
          type="button"
          onClick={() => openTeamDialog()}
          className="w-full h-9 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add team
        </button>
      </div>
    </div>
  )
}
```

### Step 4.4 — Verify & commit

- [ ] Same pattern: not wired up yet, ask user to skim, commit on confirm, update PROGRESS.md + EOD.

---

## Task 5 — `TeamDetail` + `TeamDetailEmpty` (right pane)

**Files:**
- Create: `src/components/teams/v2/TeamDetail.tsx`
- Create: `src/components/teams/v2/TeamDetailEmpty.tsx`
- Modify: `src/components/teams/LeaderSlot.tsx` (restyle)
- Modify: `src/components/teams/VehicleSlot.tsx` (restyle)
- Modify: `src/components/teams/MembersGrid.tsx` (restyle)

### Step 5.1 — PROGRESS.md "Starting"

### Step 5.2 — Restyle `LeaderSlot.tsx`

- [ ] Replace `src/components/teams/LeaderSlot.tsx` with this (drops `bg-amber-50`, uses flat neutral + accent ring on hover):

```tsx
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
        'h-20 rounded-md border border-dashed border-border/70 flex items-center justify-center text-xs text-muted-foreground transition-colors',
        isOver && 'border-primary border-2 bg-primary/5',
      )}>
        <Crown className="h-3.5 w-3.5 mr-1.5" /> Drop leader here
      </div>
    )
  }

  const initials = leader.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const avatarUrl = leader.avatar_url ?? null

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group flex items-center gap-3 h-20 px-3 rounded-md border border-border/60 bg-background text-sm transition-colors',
        isOver && 'ring-2 ring-primary border-primary',
      )}
    >
      {avatarUrl
        ? <img src={avatarUrl} alt={leader.name ?? ''} className="h-10 w-10 rounded-full object-cover" />
        : (
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
            {initials}
          </div>
        )
      }
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Crown className="h-3 w-3 text-amber-500 shrink-0" />
          <span className="font-medium truncate">{leader.name}</span>
        </div>
        {leader.phone && (
          <p className="text-xs text-muted-foreground truncate">{leader.phone}</p>
        )}
      </div>
      <div className="hidden group-hover:flex items-center gap-0.5">
        <button onClick={() => openLogPanel(leader.id, 'employee')} className="p-1.5 hover:text-foreground text-muted-foreground" type="button">
          <Clock className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => openEmployeeDialog(leader)} className="p-1.5 hover:text-foreground text-muted-foreground" type="button">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => removeLeader.mutate({ teamId: team.id })} className="p-1.5 hover:text-destructive text-muted-foreground" type="button">
          <UserMinus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
```

### Step 5.3 — Restyle `VehicleSlot.tsx`

- [ ] Replace `src/components/teams/VehicleSlot.tsx` with:

```tsx
'use client'

import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Truck, Satellite, Clock, X, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUnassignVehicle } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import type { TeamFull, Vehicle } from '@/hooks/useTeams'
import type { DragData } from './useDnDHandlers'

export function VehicleSlot({ team }: { team: TeamFull }) {
  const unassign = useUnassignVehicle()
  const { openLogPanel, openVehicleDialog } = useTeamsPage()
  const { setNodeRef, isOver } = useDroppable({
    id: `vehicle-slot-${team.id}`,
    data: { zone: 'team-vehicle', teamId: team.id },
  })
  const vehicles = team.vehicles

  if (!vehicles.length) {
    return (
      <div ref={setNodeRef} className={cn(
        'h-20 rounded-md border border-dashed border-border/70 flex items-center justify-center text-xs text-muted-foreground transition-colors',
        isOver && 'border-primary border-2 bg-primary/5',
      )}>
        <Truck className="h-3.5 w-3.5 mr-1.5" /> Drop vehicle here
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {vehicles.map(vehicle => (
        <VehicleChip
          key={vehicle.id}
          vehicle={vehicle}
          teamId={team.id}
          onUnassign={() => unassign.mutate({ vehicleId: vehicle.id, fromTeamId: team.id })}
          onLog={() => openLogPanel(vehicle.id, 'vehicle')}
          onEdit={() => openVehicleDialog(vehicle)}
        />
      ))}
      <div
        ref={setNodeRef}
        className={cn(
          'h-9 rounded border border-dashed border-border/70 flex items-center justify-center text-xs text-muted-foreground transition-colors',
          isOver && 'border-primary border-2 bg-primary/5',
        )}
      >
        <Truck className="h-3 w-3 mr-1" /> Drop another vehicle
      </div>
    </div>
  )
}

function VehicleChip({ vehicle, teamId, onUnassign, onLog, onEdit }: {
  vehicle: Vehicle
  teamId: string
  onUnassign: () => void
  onLog: () => void
  onEdit: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `vehicle-draggable-${vehicle.id}`,
    data: { type: 'vehicle', vehicleId: vehicle.id, fromTeamId: teamId } satisfies DragData,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'group flex items-center gap-3 h-20 px-3 rounded-md border border-border/60 bg-background text-sm transition-opacity cursor-grab touch-none',
        isDragging && 'opacity-50',
      )}
    >
      <Truck className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-base font-medium truncate">{vehicle.plate}</p>
        <p className="text-xs text-muted-foreground truncate">
          {vehicle.name ?? vehicle.type ?? 'Vehicle'}
        </p>
      </div>
      {vehicle.traccar_device_id && <Satellite className="h-4 w-4 text-blue-500" />}
      <div className="hidden group-hover:flex items-center gap-0.5" onPointerDown={e => e.stopPropagation()}>
        <button onClick={onEdit} className="p-1.5 hover:text-foreground text-muted-foreground" type="button">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onLog} className="p-1.5 hover:text-foreground text-muted-foreground" type="button">
          <Clock className="h-3.5 w-3.5" />
        </button>
        <button onClick={onUnassign} className="p-1.5 hover:text-destructive text-muted-foreground" type="button">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
```

### Step 5.4 — Restyle `MembersGrid.tsx`

- [ ] Replace `src/components/teams/MembersGrid.tsx` with a grid of avatar tiles with names:

```tsx
'use client'

import { useDroppable, useDraggable } from '@dnd-kit/core'
import { Wrench, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTeamsPage } from './TeamsPageContext'
import { useRemoveEmployeeFromTeam } from '@/hooks/useTeams'
import type { TeamFull, Employee } from '@/hooks/useTeams'
import type { DragData } from './useDnDHandlers'

export function MembersGrid({ team }: { team: TeamFull }) {
  const { employeeToolCounts } = useTeamsPage()
  const { setNodeRef, isOver } = useDroppable({
    id: `members-grid-${team.id}`,
    data: { zone: 'team-members', teamId: team.id },
  })
  const members = team.members.filter(m => m.id !== team.leader_id)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md border border-dashed border-transparent p-2 transition-colors',
        isOver && 'border-primary bg-primary/5',
      )}
    >
      {members.length === 0 && !isOver && (
        <p className="text-xs text-muted-foreground text-center py-6">
          No members. Drag employees here to add.
        </p>
      )}
      {(members.length > 0 || isOver) && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {members.map(emp => (
            <MemberTile
              key={emp.id}
              employee={emp}
              teamId={team.id}
              hasTools={employeeToolCounts.has(emp.id)}
            />
          ))}
          <div className="flex flex-col items-center gap-1 opacity-50">
            <div className="h-10 w-10 rounded-full border border-dashed border-border flex items-center justify-center text-muted-foreground text-lg">+</div>
            <span className="text-[10px] text-muted-foreground">Drop here</span>
          </div>
        </div>
      )}
    </div>
  )
}

function MemberTile({ employee, teamId, hasTools }: {
  employee: Employee
  teamId: string
  hasTools: boolean
}) {
  const removeFromTeam = useRemoveEmployeeFromTeam()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `member-${employee.id}-team-${teamId}`,
    data: { type: 'employee', employeeId: employee.id, fromTeamId: teamId } satisfies DragData,
  })
  const initials = employee.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const avatarUrl = employee.avatar_url ?? null

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn('group relative flex flex-col items-center gap-1 cursor-grab', isDragging && 'opacity-50')}
    >
      <div className="relative">
        {avatarUrl
          ? <img src={avatarUrl} alt={employee.name ?? ''} className="h-10 w-10 rounded-full object-cover" />
          : (
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
              {initials}
            </div>
          )
        }
        {hasTools && (
          <Wrench className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-orange-500 bg-background rounded-full p-0.5" />
        )}
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => removeFromTeam.mutate({ employeeId: employee.id, fromTeamId: teamId })}
          className="opacity-0 group-hover:opacity-100 absolute -top-1 -right-1 h-4 w-4 rounded-full bg-background border border-border text-muted-foreground hover:text-destructive flex items-center justify-center transition-opacity"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
      <span className="text-[10px] text-muted-foreground truncate max-w-full">{employee.name?.split(' ')[0]}</span>
    </div>
  )
}
```

> Verify that `useRemoveEmployeeFromTeam` exists in `src/hooks/useTeams.ts`. If it doesn't, grep first: `grep -n "useRemoveEmployee" src/hooks/useTeams.ts`. If the hook is named differently (e.g. `useUnassignEmployee`), use that exact name — don't invent.

### Step 5.5 — `TeamDetailEmpty.tsx`

- [ ] Create `src/components/teams/v2/TeamDetailEmpty.tsx`:

```tsx
'use client'

import { Users } from 'lucide-react'

export function TeamDetailEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
      <Users className="h-16 w-16 text-muted-foreground/30" />
      <p className="text-base font-medium">Select a team</p>
      <p className="text-sm text-muted-foreground max-w-sm">
        Pick a team from the left to view details. You can also drag from the pools drawer onto any team in the list.
      </p>
    </div>
  )
}
```

### Step 5.6 — `TeamDetail.tsx`

- [ ] Create `src/components/teams/v2/TeamDetail.tsx`:

```tsx
'use client'

import { Phone, Calendar, Wrench, Clock, Pencil } from 'lucide-react'
import { useTeams } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'
import { LeaderSlot } from '../LeaderSlot'
import { VehicleSlot } from '../VehicleSlot'
import { MembersGrid } from '../MembersGrid'
import { TeamDetailEmpty } from './TeamDetailEmpty'

const BADGE_BASE = 'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border'

export function TeamDetail() {
  const {
    selectedTeamId,
    openTeamDialog,
    openScheduleDialog,
    openLogPanel,
    openToolsSheet,
    teamToolCounts,
  } = useTeamsPage()
  const { data: teams = [] } = useTeams()
  const team = teams.find(t => t.id === selectedTeamId) ?? null

  if (!team) return <TeamDetailEmpty />

  const toolCount = teamToolCounts.get(team.id) ?? 0
  const hasSVO    = team.site_visit_order     ?? false
  const hasSVC    = team.site_visit_quotation ?? false
  const memberCount = team.members.filter(m => m.id !== team.leader_id).length

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] mx-auto p-6 space-y-6">
        {/* Hero */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold truncate">{team.name_en ?? team.name}</h2>
            {team.name_ar && (
              <p className="text-sm text-muted-foreground truncate" dir="rtl">{team.name_ar}</p>
            )}
            {team.division && (
              <p className="text-xs text-muted-foreground mt-1">
                {team.division.name} · {team.division.company_name}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            {!team.is_emergency && !team.is_qc && (
              <span className={`${BADGE_BASE} border-border text-muted-foreground`}>NRM</span>
            )}
            {team.is_emergency && (
              <span className={`${BADGE_BASE} border-red-300 text-red-700`}>EMR</span>
            )}
            {team.is_qc && (
              <span className={`${BADGE_BASE} border-purple-300 text-purple-700`}>QC</span>
            )}
            {hasSVO && (
              <span className={`${BADGE_BASE} border-blue-300 text-blue-700`}>SVO</span>
            )}
            {hasSVC && (
              <span className={`${BADGE_BASE} border-teal-300 text-teal-700`}>SVC</span>
            )}
          </div>
        </div>

        {/* Slots */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Vehicle</p>
            <VehicleSlot team={team} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Leader</p>
            <LeaderSlot team={team} />
          </div>
        </div>

        {/* Members */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-medium text-muted-foreground">Members ({memberCount})</p>
            <p className="text-[10px] text-muted-foreground">Drag here to add</p>
          </div>
          <MembersGrid team={team} />
        </div>

        {/* Action footer */}
        <div className="flex items-center gap-1 pt-4 border-t border-border/60">
          {team.phone && (
            <button
              type="button"
              className="h-8 px-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted/40"
              title={team.phone}
            >
              <Phone className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{team.phone}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => openScheduleDialog(team.id)}
            className="h-8 px-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted/40"
          >
            <Calendar className="h-3.5 w-3.5" />
            <span className="truncate max-w-[10rem]">{team.schedule?.name ?? 'Schedule'}</span>
          </button>
          <button
            type="button"
            onClick={() => openToolsSheet(team.id, team.name_en ?? team.name)}
            className="h-8 px-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted/40"
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>Tools {toolCount > 0 ? `(${toolCount})` : ''}</span>
          </button>
          <button
            type="button"
            onClick={() => openLogPanel(team.id, 'team')}
            className="h-8 px-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted/40"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Activity</span>
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => openTeamDialog(team)}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs hover:bg-muted/40 rounded"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      </div>
    </div>
  )
}
```

> `team.is_emergency`, `team.is_qc`, `team.site_visit_order`, `team.site_visit_quotation`, `team.schedule`, `team.phone`: these are the same fields used today in `TeamCard.tsx` (lines 28–43, 47–66). If any of them isn't on the type, fall back to `(team as any).<field>` with a TODO comment to fix after this lands — don't block on type plumbing.

### Step 5.7 — Verify & commit

- [ ] Tell the user: "Detail pane + restyled slots/members written, but still not wired into the page. Skim and confirm; I'll commit. Note: the restyled `LeaderSlot`/`VehicleSlot`/`MembersGrid` are imported by `TeamCard.tsx` too, so the existing page will pick up the new look immediately — that's OK and previews the new visual language without breaking anything."
- [ ] Commit + PROGRESS.md + EOD.

---

## Task 6 — `PoolsDrawer`

**Files:**
- Create: `src/components/teams/v2/PoolsDrawer.tsx`

### Step 6.1 — PROGRESS.md "Starting"

### Step 6.2 — Write the drawer

- [ ] Create `src/components/teams/v2/PoolsDrawer.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Search, Truck, Satellite, GripVertical, X } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useEmployees, useVehicles, type Employee, type Vehicle } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'
import type { DragData } from '../useDnDHandlers'

type Tab = 'employees' | 'vehicles'

export function PoolsDrawer() {
  const { poolsDrawerOpen, setPoolsDrawerOpen } = useTeamsPage()
  const [tab, setTab] = useState<Tab>('employees')
  const [q, setQ] = useState('')

  const { data: employees = [] } = useEmployees()
  const { data: vehicles  = [] } = useVehicles()

  const unEmployees = employees.filter(e => !e.team_id)
  const unVehicles  = vehicles.filter(v => !v.team_id)

  const ql = q.toLowerCase()
  const visibleEmployees = unEmployees.filter(e =>
    !ql || e.name?.toLowerCase().includes(ql) || e.role?.toLowerCase().includes(ql),
  )
  const visibleVehicles = unVehicles.filter(v =>
    !ql || v.plate?.toLowerCase().includes(ql) || v.type?.toLowerCase().includes(ql) || v.name?.toLowerCase().includes(ql),
  )

  return (
    <Sheet open={poolsDrawerOpen} onOpenChange={setPoolsDrawerOpen} modal={false}>
      <SheetContent
        side="right"
        className="w-full sm:w-[380px] p-0 flex flex-col gap-0"
        onInteractOutside={e => e.preventDefault()}
      >
        <SheetHeader className="px-4 h-12 flex flex-row items-center justify-between border-b border-border/60">
          <SheetTitle className="text-sm font-semibold">Pools</SheetTitle>
        </SheetHeader>

        <div className="flex items-center gap-4 px-4 h-10 border-b border-border/60 text-sm">
          <button
            onClick={() => setTab('employees')}
            className={cn(
              'h-full -mb-px border-b-2 transition-colors',
              tab === 'employees'
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            type="button"
          >
            Employees ({unEmployees.length})
          </button>
          <button
            onClick={() => setTab('vehicles')}
            className={cn(
              'h-full -mb-px border-b-2 transition-colors',
              tab === 'vehicles'
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            type="button"
          >
            Vehicles ({unVehicles.length})
          </button>
        </div>

        <div className="px-4 py-2 border-b border-border/60">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={`Search ${tab}…`}
              value={q}
              onChange={e => setQ(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {tab === 'employees' && (
            <>
              {visibleEmployees.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">
                  {ql ? 'No matches' : 'All employees assigned'}
                </p>
              )}
              {visibleEmployees.map(emp => <PoolEmployeeRow key={emp.id} employee={emp} />)}
            </>
          )}
          {tab === 'vehicles' && (
            <>
              {visibleVehicles.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">
                  {ql ? 'No matches' : 'All vehicles assigned'}
                </p>
              )}
              {visibleVehicles.map(v => <PoolVehicleRow key={v.id} vehicle={v} />)}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function PoolEmployeeRow({ employee }: { employee: Employee }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-emp-${employee.id}`,
    data: { type: 'employee', employeeId: employee.id, fromTeamId: null } satisfies DragData,
  })
  const initials = employee.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'group flex items-center gap-2.5 px-4 h-11 cursor-grab hover:bg-muted/40 transition-colors',
        isDragging && 'opacity-50',
      )}
    >
      {employee.avatar_url
        ? <img src={employee.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
        : <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold shrink-0">{initials}</div>
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{employee.name}</p>
        {employee.role && <p className="text-[10px] text-muted-foreground truncate">{employee.role}</p>}
      </div>
      <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </div>
  )
}

function PoolVehicleRow({ vehicle }: { vehicle: Vehicle }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-veh-${vehicle.id}`,
    data: { type: 'vehicle', vehicleId: vehicle.id, fromTeamId: null } satisfies DragData,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'group flex items-center gap-2.5 px-4 h-11 cursor-grab hover:bg-muted/40 transition-colors',
        isDragging && 'opacity-50',
      )}
    >
      <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm truncate">{vehicle.plate}</p>
        <p className="text-[10px] text-muted-foreground truncate">{vehicle.name ?? vehicle.type ?? 'Vehicle'}</p>
      </div>
      {vehicle.traccar_device_id && <Satellite className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
      <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </div>
  )
}
```

> The `Sheet` component is rendered with `modal={false}` so the team detail pane behind it stays interactive — drops into the detail-pane slots must work while the drawer is open. If the shadcn version you have doesn't support `modal` on `Sheet`, check `src/components/ui/sheet.tsx` and confirm. If not present, leave it out and accept that the drawer overlays modally — section 5.3 of the spec allows this gracefully.

### Step 6.3 — Verify & commit

- [ ] Same pattern: not wired in yet, ask user to skim, commit on confirm, update PROGRESS.md + EOD.

---

## Task 7 — `ActivityLog` v2 (day-grouped accordion)

**Files:**
- Create: `src/components/teams/v2/ActivityLog.tsx`

### Step 7.1 — PROGRESS.md "Starting"

### Step 7.2 — Write the new activity log

- [ ] Create `src/components/teams/v2/ActivityLog.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { format, formatDistanceToNow, isSameDay, isToday, isYesterday, parseISO, startOfDay } from 'date-fns'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useTeamActivityLog } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'
import { formatActivity } from './activitySentences'

const FILTERS = ['all', 'team', 'employee', 'vehicle', 'schedule'] as const
type Filter = (typeof FILTERS)[number]

function dayLabel(d: Date): string {
  if (isToday(d))     return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d, EEE')
}

export function ActivityLog() {
  const { logPanel, closeLogPanel } = useTeamsPage()
  const { open, entityId } = logPanel
  const [filter, setFilter] = useState<Filter>('all')
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const { data: logs = [] } = useTeamActivityLog(entityId ?? undefined)

  const visible = filter === 'all' ? logs : logs.filter(l => l.entity_type === filter)

  const days = useMemo(() => {
    const map = new Map<string, typeof visible>()
    for (const log of visible) {
      if (!log.created_at) continue
      const key = startOfDay(parseISO(log.created_at)).toISOString()
      const arr = map.get(key) ?? []
      arr.push(log)
      map.set(key, arr)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([iso, items]) => ({ iso, date: new Date(iso), items }))
  }, [visible])

  function toggleDay(iso: string) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(iso)) next.delete(iso)
      else next.add(iso)
      return next
    })
  }

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) closeLogPanel() }}>
      <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col gap-0">
        <SheetHeader className="px-4 h-12 flex flex-row items-center justify-between border-b border-border/60">
          <SheetTitle className="text-sm font-semibold">Activity</SheetTitle>
        </SheetHeader>

        <div className="flex items-center gap-4 px-4 h-10 border-b border-border/60 text-sm">
          {FILTERS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={cn(
                'capitalize transition-colors',
                filter === t
                  ? 'text-foreground font-medium underline underline-offset-4'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {days.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No activity in this view</p>
          )}
          {days.map(day => {
            const expanded = expandedDays.has(day.iso)
            return (
              <div key={day.iso}>
                <button
                  type="button"
                  onClick={() => toggleDay(day.iso)}
                  className="w-full h-12 px-4 flex items-center justify-between hover:bg-muted/40 border-b border-border/60 transition-colors"
                >
                  <span className="text-sm font-medium">{dayLabel(day.date)}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {day.items.length}
                    {expanded
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />}
                  </span>
                </button>
                {expanded && (
                  <div className="relative px-4 py-3 border-b border-border/60">
                    <div className="absolute left-[22px] top-0 bottom-0 w-px bg-border/60" aria-hidden />
                    <div className="space-y-3">
                      {day.items.map(log => <Event key={log.id} log={log} />)}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Event({ log }: { log: Parameters<typeof formatActivity>[0] }) {
  const [showExact, setShowExact] = useState(false)
  if (!log.created_at) return null
  const d = parseISO(log.created_at)
  return (
    <div className="relative pl-8 flex items-start justify-between gap-3">
      <span className="absolute left-1 top-1.5 h-2 w-2 rounded-full bg-muted-foreground/50" aria-hidden />
      <p className="text-sm leading-5 flex-1">{formatActivity(log)}</p>
      <button
        type="button"
        onClick={() => setShowExact(s => !s)}
        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
        title={showExact ? 'Click for relative time' : 'Click for exact time'}
      >
        {showExact ? format(d, 'HH:mm') : formatDistanceToNow(d, { addSuffix: true })}
      </button>
    </div>
  )
}
```

### Step 7.3 — Verify & commit

- [ ] Same pattern.

---

## Task 8 — Wire it all up in `page.tsx`

**Files:**
- Modify: `src/app/(dashboard)/master-data/teams/page.tsx`

### Step 8.1 — PROGRESS.md "Starting"

### Step 8.2 — Replace the page

- [ ] Replace `src/app/(dashboard)/master-data/teams/page.tsx` with:

```tsx
'use client'

import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, pointerWithin, type DragStartEvent } from '@dnd-kit/core'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TeamsPageProvider } from '@/components/teams/TeamsPageContext'
import { useDnDHandlers, type DragData } from '@/components/teams/useDnDHandlers'
import { TopBar } from '@/components/teams/v2/TopBar'
import { TeamList } from '@/components/teams/v2/TeamList'
import { TeamDetail } from '@/components/teams/v2/TeamDetail'
import { PoolsDrawer } from '@/components/teams/v2/PoolsDrawer'
import { ActivityLog } from '@/components/teams/v2/ActivityLog'
import { TeamEditDialog } from '@/components/teams/dialogs/TeamEditDialog'
import { EmployeeEditDialog } from '@/components/teams/dialogs/EmployeeEditDialog'
import { VehicleEditDialog } from '@/components/teams/dialogs/VehicleEditDialog'
import { ScheduleDialog } from '@/components/teams/dialogs/ScheduleDialog'
import { TeamToolsSheet } from '@/components/teams/dialogs/TeamToolsSheet'
import { Truck } from 'lucide-react'
import { useEmployees, useVehicles } from '@/hooks/useTeams'

function TeamsPageInner() {
  const { handleDragStart, handleDragEnd, activeItem } = useDnDHandlers()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  function onDragStart(event: DragStartEvent) {
    handleDragStart(event.active.data.current as DragData)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full">
        <TopBar />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <TeamList />
          <TeamDetail />
        </div>
      </div>

      {/* zIndex 9999 so overlay renders above all dialogs/sheets */}
      <DragOverlay style={{ zIndex: 9999 }}>
        {activeItem && <DragOverlayContent item={activeItem} />}
      </DragOverlay>

      <TeamEditDialog />
      <EmployeeEditDialog />
      <VehicleEditDialog />
      <ScheduleDialog />
      <ActivityLog />
      <TeamToolsSheet />
      <PoolsDrawer />
    </DndContext>
  )
}

function DragOverlayContent({ item }: { item: DragData }) {
  const { data: employees = [] } = useEmployees()
  const { data: vehicles  = [] } = useVehicles()

  if (item.type === 'employee') {
    const emp = employees.find(e => e.id === item.employeeId)
    const initials = emp?.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border border-border/60 shadow-sm ring-1 ring-black/5 text-sm pointer-events-none">
        {emp?.avatar_url
          ? <img src={emp.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
          : <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">{initials}</div>
        }
        <span>{emp?.name ?? 'Employee'}</span>
      </div>
    )
  }

  if (item.type === 'vehicle') {
    const veh = vehicles.find(v => v.id === item.vehicleId)
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border border-border/60 shadow-sm ring-1 ring-black/5 text-sm pointer-events-none">
        <Truck className="h-4 w-4" />
        <span className="font-mono">{veh?.plate ?? 'Vehicle'}</span>
      </div>
    )
  }

  return null
}

export default function TeamsPage() {
  return (
    <TooltipProvider>
      <TeamsPageProvider>
        <TeamsPageInner />
      </TeamsPageProvider>
    </TooltipProvider>
  )
}
```

### Step 8.3 — Manual verification by user (this is the BIG ONE)

- [ ] Tell the user this is the first task with visible behavior change. Ask them to verify on `http://localhost:3000/master-data/teams`:
  1. Top bar shows title + counters, search input, **New ▾** button, three icon buttons (calendar/activity/pools).
  2. Clicking a team in the left rail opens its detail in the right pane. URL changes to `?team=<id>`.
  3. Refreshing the page with `?team=<id>` keeps that team selected.
  4. The **Pools** icon (top right) toggles the pools drawer from the right edge. Drawer has Employees/Vehicles tabs, search, list of unassigned items.
  5. Drag an employee from the drawer onto a team row in the left rail → assigns as a member. Drag onto the open detail pane's Leader slot → sets as leader. Drag onto Members area → adds.
  6. Drag a vehicle from the drawer onto a team row → assigns it; onto the Vehicle slot in the detail pane → also assigns.
  7. Clicking the **Activity** icon opens the activity log sheet. All days collapsed by default. Click "Today" → expands and shows sentences like `Test User assigned Ali to Team 1` — no raw UUIDs.
  8. Filter pills (All/Team/Employee/Vehicle/Schedule) at the top of the log work.
  9. Per-team activity (click `Activity` in the detail-pane footer) opens the same panel filtered to that team.
  10. Existing dialogs (TeamEditDialog, EmployeeEditDialog, VehicleEditDialog, ScheduleDialog, TeamToolsSheet) still open from their respective triggers.
- [ ] If anything is broken, fix in place before committing. Do not commit until the user signs off on all 10 checks.

### Step 8.4 — Commit + PROGRESS.md + EOD

- [ ] Commit on confirmation. Update PROGRESS.md. Append today's EOD.

---

## Task 9 — Cleanup: delete old components

**Files** (delete):

- `src/components/teams/TopBar.tsx`
- `src/components/teams/TeamGrid.tsx`
- `src/components/teams/TeamCard.tsx`
- `src/components/teams/TeamRow.tsx`
- `src/components/teams/PoolSidebar.tsx`
- `src/components/teams/VehiclePool.tsx`
- `src/components/teams/EmployeePool.tsx`
- `src/components/teams/EmployeeRow.tsx`
- `src/components/teams/StatusTabs.tsx`
- `src/components/teams/dialogs/ActivityLogPanel.tsx`

### Step 9.1 — PROGRESS.md "Starting"

### Step 9.2 — Confirm no references remain

- [ ] For each file above, grep to confirm nothing imports it before deleting:

```bash
grep -rn "from '@/components/teams/TopBar'"            src/ --include="*.ts" --include="*.tsx"
grep -rn "from '@/components/teams/TeamGrid'"          src/ --include="*.ts" --include="*.tsx"
grep -rn "from '@/components/teams/TeamCard'"          src/ --include="*.ts" --include="*.tsx"
grep -rn "from '@/components/teams/TeamRow'"           src/ --include="*.ts" --include="*.tsx"
grep -rn "from '@/components/teams/PoolSidebar'"       src/ --include="*.ts" --include="*.tsx"
grep -rn "from '@/components/teams/VehiclePool'"       src/ --include="*.ts" --include="*.tsx"
grep -rn "from '@/components/teams/EmployeePool'"      src/ --include="*.ts" --include="*.tsx"
grep -rn "from '@/components/teams/EmployeeRow'"       src/ --include="*.ts" --include="*.tsx"
grep -rn "from '@/components/teams/StatusTabs'"        src/ --include="*.ts" --include="*.tsx"
grep -rn "from '@/components/teams/dialogs/ActivityLogPanel'" src/ --include="*.ts" --include="*.tsx"
```

Each command must return zero matches before deleting. If any returns a match, fix that import first (likely a stray reference inside one of the v2 files).

### Step 9.3 — Delete the files

- [ ] Delete the 10 files listed at the top of Task 9 using `git rm`:

```bash
git rm src/components/teams/TopBar.tsx \
       src/components/teams/TeamGrid.tsx \
       src/components/teams/TeamCard.tsx \
       src/components/teams/TeamRow.tsx \
       src/components/teams/PoolSidebar.tsx \
       src/components/teams/VehiclePool.tsx \
       src/components/teams/EmployeePool.tsx \
       src/components/teams/EmployeeRow.tsx \
       src/components/teams/StatusTabs.tsx \
       src/components/teams/dialogs/ActivityLogPanel.tsx
```

### Step 9.4 — Verify

- [ ] Tell the user: "Old components deleted. Please reload `/master-data/teams` and confirm there are no console errors or missing imports. If clean, I'll commit and we're done."

### Step 9.5 — Commit + PROGRESS.md + EOD + Security audit log

- [ ] On confirmation, commit:
  ```bash
  git add -A
  git commit -m "$(cat <<'EOF'
  chore(teams): remove old card-grid + pool-sidebar components

  Replaced by the v2 components (TopBar, TeamList, TeamDetail, PoolsDrawer,
  ActivityLog). All imports verified; no references remain.

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```
- [ ] PROGRESS.md final update — module complete. Add a row to the `## 🔒 Security Audit Log` table per the project's Module Completion Checklist:
  ```
  | 2026-06-25 | Teams page UI rework | ✅ Secrets | ✅ RLS (no new tables) | ✅ Auth gate (no new routes) | ✅ Error handling (no new external calls) | ✅ Layout stability | UI-only change; no migrations, no API routes, no realtime channels added. |
  ```
- [ ] EOD line for the date the task lands.

---

## Self-Review Checklist (run before handing off)

1. **Spec coverage** — every section of the spec maps to a task:
   - § 2 Visual language → applied inside each component task (3–8)
   - § 3 Page layout → Task 8 (`page.tsx`) + each component task
   - § 4 Pools drawer → Task 6
   - § 5 Activity log incl. day accordion + sentence mapper → Task 7 (UI) + Task 1 (mapper)
   - § 6 Drag-and-drop targets → Tasks 4 (list row), 5 (slots + members), 8 (`KeyboardSensor`)
   - § 7 State & URL → Task 2 (URL sync for `selectedTeamId`)
   - § 8 Files & responsibilities → File Map at the top of this plan + Task 9 deletes
   - § 9 Responsive behavior → applied inline via `sm:`/`md:` classes in every component
   - § 10 Data & hooks (no schema changes) → no migration task; counters live in `TopBar`
   - § 11 Out of scope → respected (no new mutations, no migrations, no realtime channels)

2. **Type consistency** — `teamStatus`, `formatActivity`, `selectedTeamId`, `poolsDrawerOpen`, `togglePoolsDrawer`, `setPoolsDrawerOpen`, `setSelectedTeamId` names match across tasks. `DragData`/`DropData` (existing) are reused unchanged. The new components reuse `LeaderSlot`/`VehicleSlot`/`MembersGrid` after the in-place restyle.

3. **Open caveats noted in the plan** — `team.archived` field name (Task 1), `useRemoveEmployeeFromTeam` hook name (Task 5), `Sheet modal={false}` support (Task 6). Each has a grep-first instruction so the engineer verifies before coding.

4. **No placeholders** — every step has either complete code, a specific grep command, or a precise user-verification list. No "implement TODO" or "similar to above".

5. **Scope** — focused on one page. Independent from other modules. Each task ships a confirmable artifact.
