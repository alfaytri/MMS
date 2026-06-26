# Service-Team Capability Filtering

**Date:** 2026-06-25
**Status:** Approved
**Scope:** Order booking flow — filter calendar teams by service capability

---

## Problem

When a dispatcher selects services in the order booking page, the TeamCalendarPanel shows **all** teams regardless of whether their employees can perform those services. This forces dispatchers to mentally filter teams, leading to mistakes (assigning cleaning jobs to plumbing teams) and wasted time.

The infrastructure already exists — `employee_services` junction table, `useTeamSkills()` hook, and drag-time skill highlighting — but none of it gates which teams appear during order creation.

## Solution

When services are selected in the order form, **hide teams that lack the required skills** from the calendar panel. Teams reappear when their services are removed. When no services are selected, all teams show (no filter).

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Non-capable teams | **Hidden entirely** | Clean UX — dispatchers shouldn't see teams they can't use. Avoids "why is this greyed out?" confusion. |
| Multi-service logic | **Union (OR)** | Show any team that can handle at least one selected service. Different services in an order often go to different teams via drag-drop. |
| Empty service list | **Show all teams** | No filter until services are selected. Preserves current browse-first workflow. |
| Skill matching | **Ancestor match** | If employee has a parent-level service skill (e.g. "Cleaning"), they qualify for all descendant sub-services. Also matches exact leaf IDs. Avoids requiring admins to assign every leaf service individually. |

## Data Flow

```
ServiceSelector
    → draftServices[] (already passed to TeamCalendarPanel as prop)
            ↓
    useTeamServiceFilter(draftServices, serviceTree, teamSkillsMap)
            ↓
    capableTeamIds: Set<string>
            ↓
    TeamCalendarPanel filters `teams` before divisionGroups memo
```

## Components

### 1. `useTeamServiceFilter` hook (NEW)

**File:** `src/hooks/useTeamServiceFilter.ts`

**Inputs:**
- `draftServices: OrderServiceDraft[]` — currently selected services in the order form
- `serviceTree: ServiceNode[]` — flat array of all services (from `useServiceTree`)
- `teamSkills: Map<string, string[]>` — team-to-service-IDs map (from `useTeamSkills`)

**Logic:**
1. For each service in `draftServices`, collect its `serviceId`
2. For each `serviceId`, walk up the `parent_id` chain in `serviceTree` to build an ancestor set: `[leafId, parentId, grandparentId, ...]`
3. Union all ancestor sets across all selected services into `requiredSkillIds: Set<string>`
4. For each team in `teamSkills`, check if any of its employee service IDs intersect with `requiredSkillIds`
5. Return `Set<string>` of capable team IDs

**Additional input (optional):**
- `assignedTeamIds: string[]` — team IDs that already have assignments in the current order (from `assignments` prop). These are always included in the result set regardless of skill match, so editing an order never hides teams that already have work.

**Returns:** `Set<string>` — empty set means "no filter" (show all teams)

**Memoization:** Wrapped in `useMemo` — recomputes only when `draftServices`, `serviceTree`, `teamSkills`, or `assignedTeamIds` change.

**Ancestor walk helper (pure function):**
```
function getAncestorIds(serviceId: string, tree: ServiceNode[]): string[] {
  const ids: string[] = [serviceId]
  let current = tree.find(s => s.id === serviceId)
  while (current?.parent_id) {
    ids.push(current.parent_id)
    current = tree.find(s => s.id === current!.parent_id)
  }
  return ids
}
```

The matching logic is **inverted** from the ancestor walk: we collect ancestors of the *selected* services, then check if any employee skill ID appears in that ancestor set. This means:
- Employee has leaf skill "Deep carpet cleaning" → matches if that exact leaf is selected
- Employee has parent skill "Cleaning" → matches if ANY descendant of "Cleaning" is selected (because the descendant's ancestor chain includes "Cleaning")

### 2. `useTeamSkills` modification (EXISTING)

**File:** `src/hooks/useTeamSkills.ts`

**Current signature:** `useTeamSkills(divisionSlug: string | null)`
**New signature:** `useTeamSkills(divisionSlug: string | string[] | null)`

When passed an array, the query applies no division filter (fetches all) — the hook already returns a `Map<teamId, serviceId[]>` so the caller filters by team. This avoids making multiple queries when the order spans divisions.

Alternatively, pass `null` to fetch all divisions (simpler, and the data is small — `employee_services` rows are typically < 500 total).

**Query key** must account for the array case to avoid cache collisions.

### 3. `TeamCalendarPanel` changes (EXISTING)

**File:** `src/components/orders/TeamCalendarPanel.tsx`

**Changes:**
1. Import and call `useTeamServiceFilter` with `draftServices` (already a prop), `serviceTree`, and `teamSkills`
2. Call `useServiceTree` to get the flat service tree (needed for ancestor walks)
3. Call `useTeamSkills(null)` to get skills across all divisions
4. Filter teams before the `divisionGroups` memo:
   ```
   const filteredTeams = capableTeamIds.size === 0
     ? teams
     : teams.filter(t => capableTeamIds.has(t.id))
   ```
5. Use `filteredTeams` instead of `teams` in the `divisionGroups` memo
6. The existing `getSkillMatch` drag-time highlighting stays unchanged (additive visual feedback)

### 4. No changes needed

- **ServiceSelector** — already emits `OrderServiceDraft` with `serviceId` and `rootSkillId`
- **Database** — `employee_services` junction table already has the data
- **Order submission** — no validation change needed (assignment is still manual via drag-drop)

## Edge Cases

| Case | Behavior |
|------|----------|
| No services selected | `capableTeamIds` is empty → all teams shown |
| Employee has parent-level skill | Ancestor walk on selected service includes parent → team qualifies |
| Employee has exact leaf skill | Direct match → team qualifies |
| No team qualifies for any service | Calendar is empty — signals no capable teams exist. Dispatcher must check employee skills setup. |
| Services span multiple divisions | Union logic — any team matching any service shows. Division groups that become empty are hidden. |
| Service removed from order | Filter recomputes — previously hidden teams reappear if they were only excluded by that service |
| Order in edit mode (existing assignments) | Teams with existing assignments should always show regardless of filter, to avoid hiding teams that already have work assigned. |

## Performance

- `useTeamSkills` query: single Supabase call, ~500 rows max, cached 5 min (`staleTime: 5 * 60 * 1000`)
- Ancestor walk: O(depth × services) where depth ≤ 5 levels — negligible
- Filter: O(teams × skills) — typically < 20 teams × < 50 skills — negligible
- All computation is client-side in `useMemo` — no extra network calls beyond the existing `useTeamSkills` and `useServiceTree` queries

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useTeamServiceFilter.ts` | **Create** | New hook: ancestor-aware team filtering |
| `src/hooks/useTeamSkills.ts` | **Modify** | Accept `null` to fetch all divisions |
| `src/components/orders/TeamCalendarPanel.tsx` | **Modify** | Wire up filter, use `filteredTeams` in division groups |
