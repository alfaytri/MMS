# Service-Team Capability Filtering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When services are selected in the order booking page, hide teams from the calendar that lack employees with matching service skills — using ancestor-aware matching so a parent-level skill (e.g. "Cleaning") qualifies for all descendant sub-services.

**Architecture:** A new pure-logic hook (`useTeamServiceFilter`) sits between the existing `useTeamSkills` + `useServiceTree` data and the `TeamCalendarPanel` rendering. It collects ancestor IDs for each selected service, then intersects them with each team's employee skill set. The existing `useTeamSkills` hook is broadened to accept `null` (fetch all divisions). The `TeamCalendarPanel` filters its team list before grouping into division rows.

**Tech Stack:** React, TanStack Query, Supabase client, TypeScript

**Spec:** `docs/superpowers/specs/2026-06-25-service-team-capability-filtering-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/hooks/useTeamServiceFilter.ts` | **Create** | Pure ancestor-walk logic + hook that returns `Set<string>` of capable team IDs |
| `src/hooks/useTeamSkills.ts` | **Modify** | Accept `null` divisionSlug to fetch all employee_services without division filter |
| `src/lib/queryKeys.ts` | **Modify** | Update `skills()` key factory type to accept `null` |
| `src/components/orders/TeamCalendarPanel.tsx` | **Modify** | Wire up the filter hook, use filtered teams in division groups |

---

## Task 1: Broaden `useTeamSkills` to accept `null`

**Files:**
- Modify: `src/lib/queryKeys.ts:538-539`
- Modify: `src/hooks/useTeamSkills.ts`

Currently `useTeamSkills(divisionSlug)` requires a non-null string to be `enabled`. When called from `TeamCalendarPanel` during order creation, we don't have a single division slug — the order can span divisions. We need it to accept `null` meaning "fetch all".

- [ ] **Step 1: Update queryKeys type**

In `src/lib/queryKeys.ts`, the `skills` key factory already accepts `Nullable` which allows `null`. Verify this — no change needed if the type is already `Nullable`. The key `['team-skills', null]` will be the cache key for "all divisions".

- [ ] **Step 2: Update `useTeamSkills` to enable on `null`**

In `src/hooks/useTeamSkills.ts`, change the hook so `null` means "fetch all" (always enabled), while a string still means "fetch for this division". The query itself already fetches all `employee_services` rows without any division filter — the `divisionSlug` parameter was only used to control the `enabled` flag and cache key.

Replace the full file content:

```typescript
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

const EMPTY_SKILLS_MAP = new Map<string, string[]>()

/**
 * Returns a Map<teamId, serviceId[]> for teams accessible to the current user.
 * Source: employee_services → employees (direct team_id FK).
 *
 * @param divisionSlug  Pass a string to scope by division (used by CalendarPage),
 *                      or `null` to fetch all divisions (used by TeamCalendarPanel
 *                      during order creation).
 */
export function useTeamSkills(divisionSlug: string | null) {
  return useQuery({
    queryKey: queryKeys.teams.skills(divisionSlug),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('employee_services')
        .select('service_id, employees!inner(team_id)')

      if (error) throw error

      const map = new Map<string, string[]>()
      for (const row of (data ?? []) as Array<{
        service_id: string | null
        employees: { team_id: string | null } | null
      }>) {
        const teamId = row.employees?.team_id ?? undefined
        if (!teamId || !row.service_id) continue
        const existing = map.get(teamId) ?? []
        if (!existing.includes(row.service_id)) {
          map.set(teamId, [...existing, row.service_id])
        }
      }
      return map
    },
    placeholderData: EMPTY_SKILLS_MAP,
  })
}
```

Key change: removed `enabled: !!divisionSlug` — the hook is now always enabled. The `divisionSlug` param is kept for cache-key differentiation only (CalendarPage passes a slug, TeamCalendarPanel passes `null`).

- [ ] **Step 3: Verify existing callers still work**

Check that `CalendarPage.tsx:101` still calls `useTeamSkills(activeDivisionSlug)` where `activeDivisionSlug` is a string. This call is unchanged — it just hits a different cache key than the `null` variant.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTeamSkills.ts
git commit -m "feat(teams): broaden useTeamSkills to accept null for all-division fetch"
```

---

## Task 2: Create `useTeamServiceFilter` hook

**Files:**
- Create: `src/hooks/useTeamServiceFilter.ts`

This is the core logic. A pure function (`getAncestorIds`) walks up the service tree, and the hook combines it with `useTeamSkills` data to produce a `Set<string>` of capable team IDs.

- [ ] **Step 1: Create the hook file**

Create `src/hooks/useTeamServiceFilter.ts` with the following content:

```typescript
import { useMemo } from 'react'
import type { OrderServiceDraft } from '@/types/orders'

interface ServiceNode {
  id: string
  parent_id: string | null
}

/**
 * Walk up the service tree from a leaf to the root, collecting all ancestor IDs.
 * Returns [leafId, parentId, grandparentId, ...rootId].
 */
function getAncestorIds(serviceId: string, tree: ServiceNode[]): string[] {
  const ids: string[] = [serviceId]
  let current = tree.find(s => s.id === serviceId)
  while (current?.parent_id) {
    ids.push(current.parent_id)
    current = tree.find(s => s.id === current!.parent_id)
  }
  return ids
}

/**
 * Given selected services, the full service tree, and a team→skills map,
 * returns the set of team IDs whose employees can handle at least one
 * of the selected services (union / OR logic).
 *
 * Skill matching is ancestor-aware: if an employee has a parent-level skill
 * (e.g. "Cleaning"), they qualify for any descendant sub-service.
 *
 * Returns an empty set when no services are selected (meaning "show all teams").
 */
export function useTeamServiceFilter(
  draftServices: OrderServiceDraft[],
  serviceTree: ServiceNode[] | undefined,
  teamSkills: Map<string, string[]>,
  assignedTeamIds: string[] = [],
): Set<string> {
  return useMemo(() => {
    if (draftServices.length === 0 || !serviceTree || serviceTree.length === 0) {
      return new Set<string>()
    }

    const matchableIds = new Set<string>()
    for (const draft of draftServices) {
      for (const id of getAncestorIds(draft.serviceId, serviceTree)) {
        matchableIds.add(id)
      }
    }

    const capable = new Set<string>()

    // Always include teams that already have assignments in this order
    for (const tid of assignedTeamIds) {
      capable.add(tid)
    }

    for (const [teamId, skillIds] of teamSkills) {
      if (skillIds.some(sid => matchableIds.has(sid))) {
        capable.add(teamId)
      }
    }

    return capable
  }, [draftServices, serviceTree, teamSkills, assignedTeamIds])
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useTeamServiceFilter.ts
git commit -m "feat(teams): add useTeamServiceFilter hook with ancestor-aware matching"
```

---

## Task 3: Wire filter into `TeamCalendarPanel`

**Files:**
- Modify: `src/components/orders/TeamCalendarPanel.tsx`

This is the integration point. The panel already receives `draftServices` and `assignments` as props. We add the two data hooks (`useTeamSkills`, `useServiceTree`) and the filter hook, then swap `teams` for `filteredTeams` in the `divisionGroups` memo.

- [ ] **Step 1: Add imports**

At the top of `src/components/orders/TeamCalendarPanel.tsx`, add these imports alongside the existing ones:

```typescript
import { useTeamSkills } from '@/hooks/useTeamSkills'
import { useServiceTree } from '@/hooks/useServices'
import { useTeamServiceFilter } from '@/hooks/useTeamServiceFilter'
```

- [ ] **Step 2: Call the data hooks and filter hook**

Inside the `TeamCalendarPanel` component body, after the existing `teams` declaration (line 78), add:

```typescript
  const { data: teamSkillsMap = new Map<string, string[]>() } = useTeamSkills(null)
  const { data: serviceTreeAll } = useServiceTree('normal', [], draftServices.length > 0)

  const assignedTeamIds = useMemo(
    () => assignments.map(a => a.teamId),
    [assignments],
  )

  const capableTeamIds = useTeamServiceFilter(
    draftServices,
    serviceTreeAll,
    teamSkillsMap,
    assignedTeamIds,
  )

  const filteredTeams = useMemo(
    () => capableTeamIds.size === 0
      ? teams
      : teams.filter(t => capableTeamIds.has(t.id)),
    [teams, capableTeamIds],
  )
```

Note: `useServiceTree('normal', [], draftServices.length > 0)` passes `enabled = draftServices.length > 0` so the service tree query only fires when there are services to filter by. The empty `[]` for `divisionSlugs` means "fetch all divisions" (no `.overlaps()` filter applied).

- [ ] **Step 3: Replace `teams` with `filteredTeams` in `divisionGroups` memo**

Find the `divisionGroups` memo (currently around line 123). Change it from using `teams` to `filteredTeams`:

Replace:
```typescript
  const divisionGroups = useMemo(() => {
    const groups = new Map<string, { slug: string; name: string; teams: TeamFull[] }>()
    for (const team of teams) {
      const slug = team.division?.slug ?? '__none__'
      const name = team.division?.name ?? team.division?.short_name ?? 'Unassigned'
      if (!groups.has(slug)) groups.set(slug, { slug, name, teams: [] })
      groups.get(slug)!.teams.push(team)
    }
    return Array.from(groups.values())
  }, [teams])
```

With:
```typescript
  const divisionGroups = useMemo(() => {
    const groups = new Map<string, { slug: string; name: string; teams: TeamFull[] }>()
    for (const team of filteredTeams) {
      const slug = team.division?.slug ?? '__none__'
      const name = team.division?.name ?? team.division?.short_name ?? 'Unassigned'
      if (!groups.has(slug)) groups.set(slug, { slug, name, teams: [] })
      groups.get(slug)!.teams.push(team)
    }
    return Array.from(groups.values())
  }, [filteredTeams])
```

This automatically hides empty division groups — if all teams in a division are filtered out, that division header won't render.

- [ ] **Step 4: Update `teamSkillMap` memo to use `filteredTeams`**

The existing `teamSkillMap` memo (line 151) builds a map from `teams`. Update it to use `filteredTeams` so it stays consistent:

Replace:
```typescript
  const teamSkillMap = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    teams.forEach((t) => { map[t.id] = t.members.flatMap((e) => e.skills ?? []) })
    return map
  }, [teams])
```

With:
```typescript
  const teamSkillMap = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    filteredTeams.forEach((t) => { map[t.id] = t.members.flatMap((e) => e.skills ?? []) })
    return map
  }, [filteredTeams])
```

- [ ] **Step 5: Commit**

```bash
git add src/components/orders/TeamCalendarPanel.tsx
git commit -m "feat(orders): wire service-team capability filter into TeamCalendarPanel"
```

---

## Task 4: Manual verification

**Files:** None (testing only)

- [ ] **Step 1: Verify the order creation flow**

Open the order creation page in the browser. The following scenarios should be tested:

1. **No services selected** → All teams visible in the calendar (no filter)
2. **Select a service (e.g. a cleaning sub-service)** → Only teams whose employees have that service (or a parent of that service) assigned in `employee_services` should appear
3. **Select a second service from a different division** → Teams matching either service should appear (union)
4. **Remove all services** → All teams reappear
5. **Edit an existing order** → Teams with existing assignments should always appear even if they don't match the current services

- [ ] **Step 2: Verify the existing calendar page still works**

Open the main calendar page (not order creation). Verify that:
- `SwapTeamDialog` still works — it calls `useTeamSkills(activeDivisionSlug)` with a string, which is unchanged
- Drag-time skill highlighting still works on the order creation page (opacity-40 on non-matching teams during drag)

- [ ] **Step 3: Commit PROGRESS.md update**

Update `PROGRESS.md` with the completed task details.

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — Service-Team Capability Filtering complete"
```
