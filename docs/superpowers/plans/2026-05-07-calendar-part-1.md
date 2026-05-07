# Operations Calendar — Implementation Plan Part 1 (Tasks 1–7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data foundation and toolbar for the Operations Calendar — permissions, DB view, hooks, and the CalendarToolbar component.

**Architecture:** A Postgres `calendar_visits` view unifies `order_team_assignments + orders` and `contract_visits` into a single queryable source. Three React Query hooks (`useCalendarSchedule`, `useCalendarVisits`, `useWeekCapacity`) feed the UI. `CalendarToolbar` orchestrates date nav, active schedule badge, and division/visit-type filters.

**Tech Stack:** Next.js 15, Supabase (Postgres view + RPC), React Query, Vitest + Testing Library, Tailwind CSS, shadcn/ui, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-05-07-calendar-design.md`
**Part 2:** `docs/superpowers/plans/2026-05-07-calendar-part-2.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/permissions.ts` | Modify | Add `calendar.*` permission entries |
| `supabase/migrations/20260507120000_create_calendar_visits_view.sql` | Create | Postgres UNION view over order_team_assignments + contract_visits |
| `supabase/migrations/20260507120001_create_swap_visit_team_rpc.sql` | Create | Atomic server-side eligibility check + team swap RPC |
| `src/hooks/useCalendarSchedule.ts` | Create | Read `app_settings` calendar_schedule row |
| `src/hooks/useCalendarSchedule.test.ts` | Create | Unit tests for schedule parsing |
| `src/hooks/useCalendarVisits.ts` | Create | Query `calendar_visits` view for a single day |
| `src/hooks/useCalendarVisits.test.ts` | Create | Unit tests for visit grouping & filtering |
| `src/hooks/useWeekCapacity.ts` | Create | Lightweight week aggregation (minutes only) |
| `src/hooks/useWeekCapacity.test.ts` | Create | Unit tests for capacity math |
| `src/components/calendar/CalendarToolbar.tsx` | Create | Date nav, schedule badge, division selector, visit-type chips |
| `src/components/calendar/CalendarToolbar.test.tsx` | Create | Render + interaction tests |

---

## Task 1: Add Calendar Permissions

**Files:**
- Modify: `src/lib/permissions.ts`
- Test: `src/lib/permissions.test.ts`

- [ ] **Step 1: Write the failing test**

Open `src/lib/permissions.test.ts` and add inside the existing `describe` block:

```typescript
it('includes calendar permission group with required keys', () => {
  const calGroup = PERMISSION_GROUPS.find(g => g.module === 'Calendar')
  expect(calGroup).toBeDefined()
  const keys = calGroup!.permissions.map(p => p.key)
  expect(keys).toContain('calendar.view')
  expect(keys).toContain('calendar.edit-order')
  expect(keys).toContain('calendar.swap-teams')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/permissions.test.ts
```

Expected: FAIL — "includes calendar permission group with required keys"

- [ ] **Step 3: Add calendar group to `src/lib/permissions.ts`**

Add the `CalendarDays` import to the existing lucide import line:

```typescript
import {
  Database, ShoppingCart, TrendingUp, ClipboardList,
  FileText, Receipt, Users, Settings2, CalendarDays,
} from 'lucide-react'
```

Append to the `PERMISSION_GROUPS` array (before the closing `]`):

```typescript
  {
    module: 'Calendar',
    icon: asFC(CalendarDays),
    permissions: [
      { key: 'calendar.view',        label: 'View Calendar',    description: 'Access the Operations Calendar page' },
      { key: 'calendar.edit-order',  label: 'Edit Visits',      description: 'Edit visits directly from the calendar grid' },
      { key: 'calendar.swap-teams',  label: 'Swap Teams',       description: 'Reassign a visit to a different team from the calendar' },
    ],
  },
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/permissions.test.ts
```

Expected: PASS (all existing tests + new calendar test)

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions.ts src/lib/permissions.test.ts
git commit -m "$(cat <<'EOF'
feat(calendar): add calendar permission group to permissions registry

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: DB Migration — `calendar_visits` View

**Files:**
- Create: `supabase/migrations/20260507120000_create_calendar_visits_view.sql`

This view unifies `order_team_assignments` (joined with `orders` + `customers`) and `contract_visits` (joined with `contracts` + `customers`) into one queryable source for the calendar.

> **Developer note:** Verify the actual stored format of `order_team_assignments.time_slot` and `order_team_assignments.duration` in your database before running this migration. The view assumes `time_slot` is stored as `'HH:MM'` (e.g. `'09:00'`) and `duration` is stored as a plain integer representing hours (e.g. `'2'`). If the format differs, update the CASE expressions accordingly.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260507120000_create_calendar_visits_view.sql`:

```sql
-- calendar_visits: unified read-only view over all visit sources.
-- Used exclusively by the Operations Calendar.
CREATE OR REPLACE VIEW public.calendar_visits AS

-- Source 1: Order team assignments (the primary field-service visit type)
SELECT
  ota.id                                  AS id,
  'order'::text                           AS source_type,
  ota.team_id                             AS team_id,
  t.division::text                        AS division,
  t.is_qc                                 AS is_qc,
  ota.scheduled_date                      AS visit_date,

  -- start_time: prefer order_team_assignments.time_slot, fall back to orders.scheduled_time
  CASE
    WHEN ota.time_slot  ~ '^\d{2}:\d{2}' THEN ota.time_slot::time
    WHEN o.scheduled_time ~ '^\d{2}:\d{2}' THEN o.scheduled_time::time
    ELSE NULL
  END                                     AS start_time,

  -- end_time: start + duration (hours integer), or start + 2h default
  CASE
    WHEN ota.time_slot ~ '^\d{2}:\d{2}' AND ota.duration ~ '^\d+$'
      THEN (ota.time_slot::time + (ota.duration::int * interval '1 hour'))
    WHEN ota.time_slot ~ '^\d{2}:\d{2}'
      THEN (ota.time_slot::time + interval '2 hours')
    WHEN o.scheduled_time ~ '^\d{2}:\d{2}'
      THEN (o.scheduled_time::time + interval '2 hours')
    ELSE NULL
  END                                     AS end_time,

  COALESCE(o.type, 'normal_order')        AS visit_type,
  COALESCE(o.status::text, 'scheduled')  AS status,
  c.name                                  AS customer_name,
  c.id                                    AS customer_id,
  -- Extract first service_id from the services JSON array.
  -- Verify the actual JSON key name against your order_team_assignments.services payload.
  -- Common shapes: [{"id": "uuid", ...}] → use ->0->>'id'
  --               [{"service_id": "uuid", ...}] → use ->0->>'service_id'
  NULLIF((ota.services::jsonb -> 0 ->> 'id'), '')::uuid AS service_id

FROM public.order_team_assignments  ota
JOIN public.orders                  o   ON o.id  = ota.order_id
JOIN public.teams                   t   ON t.id  = ota.team_id
LEFT JOIN public.customers          c   ON c.id  = o.customer_id

UNION ALL

-- Source 2: Contract visits
SELECT
  cv.id                                   AS id,
  'contract_visit'::text                  AS source_type,
  cv.team_id                              AS team_id,
  t.division::text                        AS division,
  t.is_qc                                 AS is_qc,
  cv.scheduled_date                       AS visit_date,
  NULL::time                              AS start_time,
  NULL::time                              AS end_time,
  'contract_visit'::text                  AS visit_type,
  CASE WHEN cv.completed THEN 'completed' ELSE 'scheduled' END AS status,
  c.name                                  AS customer_name,
  c.id                                    AS customer_id,
  -- contract_visits stores service as a name string, not a UUID FK.
  -- If your schema adds a service_id FK to contract_visits later, replace NULL here.
  NULL::uuid                              AS service_id

FROM public.contract_visits  cv
JOIN public.teams             t    ON t.id  = cv.team_id
LEFT JOIN public.contracts    con  ON con.id = cv.contract_id
LEFT JOIN public.customers    c    ON c.id  = con.customer_id
WHERE cv.team_id IS NOT NULL;

-- Read-only: grant SELECT to authenticated role used by Supabase client
GRANT SELECT ON public.calendar_visits TO authenticated;
COMMENT ON VIEW public.calendar_visits IS
  'Unified calendar view over order_team_assignments and contract_visits. Read-only.';
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected output ends with: `Remote database is up to date` or lists the migration as applied.

- [ ] **Step 3: Verify the view exists**

```bash
npx supabase db push --dry-run
```

Expected: `Remote database is up to date` (no pending migrations).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260507120000_create_calendar_visits_view.sql
git commit -m "$(cat <<'EOF'
feat(db): add calendar_visits unified view over order_team_assignments + contract_visits

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: DB Migration — `swap_visit_team` RPC

**Files:**
- Create: `supabase/migrations/20260507120001_create_swap_visit_team_rpc.sql`

Server-side atomic eligibility check + team swap. Called on "Confirm Swap" in `SwapTeamDialog`.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260507120001_create_swap_visit_team_rpc.sql`:

```sql
-- swap_visit_team: atomically validates eligibility and reassigns a visit's team.
-- Returns jsonb: { success: true } or { success: false, error: 'reason' }
CREATE OR REPLACE FUNCTION public.swap_visit_team(
  p_assignment_id  uuid,
  p_new_team_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id        uuid;
  v_scheduled_date  date;
  v_time_slot       text;
  v_duration        text;
  v_skill_match     int;
  v_time_conflict   int;
  v_performer       text;
BEGIN
  -- 1. Fetch the assignment being swapped
  SELECT order_id, scheduled_date, time_slot, duration
  INTO   v_order_id, v_scheduled_date, v_time_slot, v_duration
  FROM   public.order_team_assignments
  WHERE  id = p_assignment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assignment not found');
  END IF;

  -- 2. Ensure new team is not a QC team
  IF EXISTS (SELECT 1 FROM public.teams WHERE id = p_new_team_id AND is_qc = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'QC teams cannot be assigned via calendar swap');
  END IF;

  -- 3. Check time conflict: only block when BOTH visits have time slots that actually overlap.
  --    If either visit has no time_slot (e.g. a contract_visit), skip the conflict check —
  --    no-time visits are considered "flexible" and never block a timed assignment.
  SELECT COUNT(*) INTO v_time_conflict
  FROM   public.order_team_assignments
  WHERE  team_id        = p_new_team_id
    AND  id            <> p_assignment_id
    AND  scheduled_date = v_scheduled_date
    AND  v_time_slot IS NOT NULL          -- incoming visit must have a time
    AND  time_slot IS NOT NULL            -- existing visit must have a time (contract_visits excluded)
    AND  time_slot::time <
         CASE WHEN v_duration ~ '^\d+$'
              THEN v_time_slot::time + (v_duration::int * interval '1 hour')
              ELSE v_time_slot::time + interval '2 hours'
         END
    AND (
         CASE WHEN duration ~ '^\d+$'
              THEN time_slot::time + (duration::int * interval '1 hour')
              ELSE time_slot::time + interval '2 hours'
         END
        ) > v_time_slot::time;

  IF v_time_conflict > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Time conflict with existing visit');
  END IF;

  -- 4. Perform the swap
  UPDATE public.order_team_assignments
  SET    team_id = p_new_team_id
  WHERE  id      = p_assignment_id;

  -- 5. Write audit log
  SELECT COALESCE(raw_user_meta_data->>'full_name', email, 'unknown')
  INTO   v_performer
  FROM   auth.users
  WHERE  id = auth.uid();

  INSERT INTO public.activity_log
    (entity_type, entity_id, action, module, performer_name, new_data)
  VALUES
    ('order_team_assignment', p_assignment_id::text, 'team_swapped', 'calendar',
     v_performer,
     jsonb_build_object('new_team_id', p_new_team_id, 'order_id', v_order_id));

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.swap_visit_team(uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.swap_visit_team IS
  'Atomically validates eligibility and reassigns an order_team_assignment to a new team. Returns { success, error? }.';
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: migration applied cleanly.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260507120001_create_swap_visit_team_rpc.sql
git commit -m "$(cat <<'EOF'
feat(db): add swap_visit_team RPC for atomic server-side team reassignment

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `useCalendarSchedule` Hook

**Files:**
- Create: `src/hooks/useCalendarSchedule.ts`
- Create: `src/hooks/useCalendarSchedule.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useCalendarSchedule.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseCalendarSchedule, type CalendarScheduleRaw } from './useCalendarSchedule'

describe('parseCalendarSchedule', () => {
  it('returns defaults when value is null', () => {
    const result = parseCalendarSchedule(null)
    expect(result).toEqual({
      mode: 'normal',
      day_start: 7,
      day_end: 18,
      scroll_to: 7,
    })
  })

  it('parses a valid normal schedule', () => {
    const raw: CalendarScheduleRaw = { mode: 'normal', day_start: 8, day_end: 17, scroll_to: 8 }
    const result = parseCalendarSchedule(raw)
    expect(result.mode).toBe('normal')
    expect(result.day_start).toBe(8)
    expect(result.day_end).toBe(17)
    expect(result.scroll_to).toBe(8)
  })

  it('parses a ramadan schedule', () => {
    const raw: CalendarScheduleRaw = { mode: 'ramadan', day_start: 9, day_end: 15, scroll_to: 9 }
    const result = parseCalendarSchedule(raw)
    expect(result.mode).toBe('ramadan')
  })

  it('builds a readable label', () => {
    const raw: CalendarScheduleRaw = { mode: 'normal', day_start: 8, day_end: 17, scroll_to: 8 }
    const result = parseCalendarSchedule(raw)
    expect(result.label).toBe('8 AM – 5 PM · Normal')
  })

  it('formats ramadan label', () => {
    const raw: CalendarScheduleRaw = { mode: 'ramadan', day_start: 9, day_end: 15, scroll_to: 9 }
    const result = parseCalendarSchedule(raw)
    expect(result.label).toBe('9 AM – 3 PM · Ramadan')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/hooks/useCalendarSchedule.test.ts
```

Expected: FAIL — cannot find module `./useCalendarSchedule`

- [ ] **Step 3: Create `src/hooks/useCalendarSchedule.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CalendarScheduleMode = 'normal' | 'ramadan'

export interface CalendarScheduleRaw {
  mode: CalendarScheduleMode
  day_start: number
  day_end: number
  scroll_to: number
}

export interface CalendarSchedule extends CalendarScheduleRaw {
  label: string
}

function formatHour(h: number): string {
  if (h === 0 || h === 24) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

export function parseCalendarSchedule(raw: CalendarScheduleRaw | null | undefined): CalendarSchedule {
  const defaults: CalendarScheduleRaw = { mode: 'normal', day_start: 7, day_end: 18, scroll_to: 7 }
  const v: CalendarScheduleRaw = raw ?? defaults
  const modeLabel = v.mode === 'ramadan' ? 'Ramadan' : 'Normal'
  const label = `${formatHour(v.day_start)} – ${formatHour(v.day_end)} · ${modeLabel}`
  return { ...v, label }
}

export function useCalendarSchedule() {
  return useQuery({
    queryKey: ['calendar-schedule'],
    queryFn: async (): Promise<CalendarSchedule> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'calendar_schedule')
        .single()
      if (error) throw error
      return parseCalendarSchedule(data?.value as CalendarScheduleRaw | null)
    },
    staleTime: 5 * 60 * 1000,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/hooks/useCalendarSchedule.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCalendarSchedule.ts src/hooks/useCalendarSchedule.test.ts
git commit -m "$(cat <<'EOF'
feat(calendar): add useCalendarSchedule hook with label formatting

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `useCalendarVisits` Hook

**Files:**
- Create: `src/hooks/useCalendarVisits.ts`
- Create: `src/hooks/useCalendarVisits.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useCalendarVisits.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { groupVisitsByTeam, filterVisitsByType, type CalendarVisit } from './useCalendarVisits'

const makeVisit = (overrides: Partial<CalendarVisit>): CalendarVisit => ({
  id: 'v1',
  source_type: 'order',
  team_id: 'team-a',
  division: 'rsh',
  is_qc: false,
  visit_date: '2026-05-07',
  start_time: '09:00',
  end_time: '11:00',
  visit_type: 'normal_order',
  status: 'scheduled',
  customer_name: 'Al-Sayed',
  customer_id: 'cust-1',
  service_id: null,
  ...overrides,
})

describe('groupVisitsByTeam', () => {
  it('returns empty map for empty array', () => {
    expect(groupVisitsByTeam([])).toEqual(new Map())
  })

  it('groups visits by team_id', () => {
    const visits = [
      makeVisit({ id: 'v1', team_id: 'team-a' }),
      makeVisit({ id: 'v2', team_id: 'team-b' }),
      makeVisit({ id: 'v3', team_id: 'team-a' }),
    ]
    const result = groupVisitsByTeam(visits)
    expect(result.get('team-a')).toHaveLength(2)
    expect(result.get('team-b')).toHaveLength(1)
  })

  it('excludes QC visits', () => {
    const visits = [
      makeVisit({ id: 'v1', team_id: 'team-a', is_qc: false }),
      makeVisit({ id: 'v2', team_id: 'team-qc', is_qc: true }),
    ]
    const result = groupVisitsByTeam(visits)
    expect(result.has('team-qc')).toBe(false)
    expect(result.get('team-a')).toHaveLength(1)
  })
})

describe('filterVisitsByType', () => {
  it('returns all visits when filter set is empty (all selected)', () => {
    const visits = [
      makeVisit({ visit_type: 'normal_order' }),
      makeVisit({ visit_type: 'emergency' }),
    ]
    expect(filterVisitsByType(visits, new Set())).toHaveLength(2)
  })

  it('filters to only selected types', () => {
    const visits = [
      makeVisit({ id: 'v1', visit_type: 'normal_order' }),
      makeVisit({ id: 'v2', visit_type: 'emergency' }),
    ]
    const result = filterVisitsByType(visits, new Set(['emergency']))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('v2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/hooks/useCalendarVisits.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Create `src/hooks/useCalendarVisits.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type VisitType =
  | 'normal_order'
  | 'emergency'
  | 'follow_up'
  | 'backwork'
  | 'site_visit'
  | 'site_visit_contract'
  | 'contract_visit'
  | 'qc_visit'

export interface CalendarVisit {
  id: string
  source_type: string
  team_id: string
  division: string
  is_qc: boolean
  visit_date: string
  start_time: string | null
  end_time: string | null
  visit_type: string
  status: string
  customer_name: string | null
  customer_id: string | null
  service_id: string | null
}

/** Groups a flat visit array by team_id, excluding QC visits. */
export function groupVisitsByTeam(visits: CalendarVisit[]): Map<string, CalendarVisit[]> {
  const map = new Map<string, CalendarVisit[]>()
  for (const v of visits) {
    if (v.is_qc) continue
    const existing = map.get(v.team_id) ?? []
    existing.push(v)
    map.set(v.team_id, existing)
  }
  return map
}

/**
 * Filters visits to only the selected visit types.
 * An empty set means "all selected" — returns everything.
 */
export function filterVisitsByType(
  visits: CalendarVisit[],
  activeTypes: Set<string>,
): CalendarVisit[] {
  if (activeTypes.size === 0) return visits
  return visits.filter(v => activeTypes.has(v.visit_type))
}

export function useCalendarVisits(date: string, divisionSlug: string | null) {
  return useQuery({
    queryKey: ['calendar-visits', date, divisionSlug],
    queryFn: async (): Promise<CalendarVisit[]> => {
      const supabase = createClient()
      let query = supabase
        .from('calendar_visits')
        .select('*')
        .eq('visit_date', date)
        .eq('is_qc', false)

      if (divisionSlug) {
        query = query.eq('division', divisionSlug)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as CalendarVisit[]
    },
    enabled: !!date,
    staleTime: 60 * 1000,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/hooks/useCalendarVisits.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCalendarVisits.ts src/hooks/useCalendarVisits.test.ts
git commit -m "$(cat <<'EOF'
feat(calendar): add useCalendarVisits hook with grouping and type-filter helpers

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `useWeekCapacity` Hook

**Files:**
- Create: `src/hooks/useWeekCapacity.ts`
- Create: `src/hooks/useWeekCapacity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useWeekCapacity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  computeDayCapacity,
  buildWeekDates,
  type CapacityVisitRow,
  type DaySchedule,
} from './useWeekCapacity'

const DAY_SCHEDULE: DaySchedule = { enabled: true, start: '08:00', end: '17:00', break_minutes: 60 }
const OFF_SCHEDULE: DaySchedule = { enabled: false, start: '08:00', end: '17:00', break_minutes: 0 }

describe('computeDayCapacity', () => {
  it('returns zero scheduled minutes for an off day', () => {
    const result = computeDayCapacity([], OFF_SCHEDULE)
    expect(result.scheduledMinutes).toBe(0)
    expect(result.totalMinutes).toBe(0)
    expect(result.isOff).toBe(true)
  })

  it('computes scheduled minutes from start/end minus break', () => {
    // 08:00 to 17:00 = 540 min, minus 60 break = 480 min
    const result = computeDayCapacity([], DAY_SCHEDULE)
    expect(result.scheduledMinutes).toBe(480)
    expect(result.isOff).toBe(false)
  })

  it('sums total booked minutes from visits', () => {
    const visits: CapacityVisitRow[] = [
      { start_time: '09:00', end_time: '11:00' }, // 120 min
      { start_time: '13:00', end_time: '14:30' }, // 90 min
    ]
    const result = computeDayCapacity(visits, DAY_SCHEDULE)
    expect(result.totalMinutes).toBe(210)
  })

  it('handles visits with null times as 0 minutes', () => {
    const visits: CapacityVisitRow[] = [
      { start_time: null, end_time: null },
    ]
    const result = computeDayCapacity(visits, DAY_SCHEDULE)
    expect(result.totalMinutes).toBe(0)
  })

  it('computes percentage correctly', () => {
    const visits: CapacityVisitRow[] = [
      { start_time: '08:00', end_time: '16:00' }, // 480 min — exactly 100%
    ]
    const result = computeDayCapacity(visits, DAY_SCHEDULE)
    expect(result.percentage).toBe(100)
  })

  it('allows percentage above 100 for overtime', () => {
    const visits: CapacityVisitRow[] = [
      { start_time: '08:00', end_time: '18:00' }, // 600 min > 480 scheduled
    ]
    const result = computeDayCapacity(visits, DAY_SCHEDULE)
    expect(result.percentage).toBeGreaterThan(100)
    expect(result.overflowMinutes).toBeGreaterThan(0)
  })
})

describe('buildWeekDates', () => {
  it('returns 7 dates starting from weekStart', () => {
    const dates = buildWeekDates('2026-05-03') // Sunday
    expect(dates).toHaveLength(7)
    expect(dates[0]).toBe('2026-05-03')
    expect(dates[6]).toBe('2026-05-09')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/hooks/useWeekCapacity.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Create `src/hooks/useWeekCapacity.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { addDays, format, startOfWeek } from 'date-fns'

export interface CapacityVisitRow {
  start_time: string | null
  end_time: string | null
}

export interface DaySchedule {
  enabled: boolean
  start: string    // 'HH:MM'
  end: string      // 'HH:MM'
  break_minutes: number
}

export interface DayCapacity {
  scheduledMinutes: number
  totalMinutes: number
  percentage: number
  overflowMinutes: number
  visitCount: number
  isOff: boolean
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

export function computeDayCapacity(visits: CapacityVisitRow[], schedule: DaySchedule): DayCapacity {
  if (!schedule.enabled) {
    return { scheduledMinutes: 0, totalMinutes: 0, percentage: 0, overflowMinutes: 0, visitCount: 0, isOff: true }
  }

  const scheduledMinutes =
    timeToMinutes(schedule.end) - timeToMinutes(schedule.start) - schedule.break_minutes

  let totalMinutes = 0
  let visitCount = 0
  for (const v of visits) {
    if (v.start_time && v.end_time) {
      totalMinutes += timeToMinutes(v.end_time) - timeToMinutes(v.start_time)
      visitCount++
    }
  }

  const percentage = scheduledMinutes > 0 ? Math.round((totalMinutes / scheduledMinutes) * 100) : 0
  const overflowMinutes = Math.max(0, totalMinutes - scheduledMinutes)

  return { scheduledMinutes, totalMinutes, percentage, overflowMinutes, visitCount, isOff: false }
}

/** Returns array of 7 ISO date strings starting from weekStart (Sunday). */
export function buildWeekDates(weekStart: string): string[] {
  const base = new Date(weekStart)
  return Array.from({ length: 7 }, (_, i) => format(addDays(base, i), 'yyyy-MM-dd'))
}

export function getWeekStart(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 0 }), 'yyyy-MM-dd')
}

export interface WeekCapacityDay {
  date: string
  capacity: DayCapacity
}

export function useWeekCapacity(
  weekStart: string,
  divisionSlug: string | null,
  activeVisitTypes: Set<string>,
) {
  return useQuery({
    queryKey: ['week-capacity', weekStart, divisionSlug, [...activeVisitTypes].sort().join(',')],
    queryFn: async (): Promise<Record<string, CapacityVisitRow[]>> => {
      const supabase = createClient()
      const dates = buildWeekDates(weekStart)
      const [from, to] = [dates[0], dates[6]]

      let query = supabase
        .from('calendar_visits')
        .select('visit_date, start_time, end_time')
        .gte('visit_date', from)
        .lte('visit_date', to)
        .eq('is_qc', false)

      if (divisionSlug) query = query.eq('division', divisionSlug)
      if (activeVisitTypes.size > 0) {
        query = query.in('visit_type', [...activeVisitTypes])
      }

      const { data, error } = await query
      if (error) throw error

      // Group by date
      const grouped: Record<string, CapacityVisitRow[]> = {}
      for (const d of dates) grouped[d] = []
      for (const row of (data ?? [])) {
        const key = row.visit_date as string
        if (grouped[key]) {
          grouped[key].push({ start_time: row.start_time as string | null, end_time: row.end_time as string | null })
        }
      }
      return grouped
    },
    enabled: !!weekStart,
    staleTime: 60 * 1000,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/hooks/useWeekCapacity.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useWeekCapacity.ts src/hooks/useWeekCapacity.test.ts
git commit -m "$(cat <<'EOF'
feat(calendar): add useWeekCapacity hook with capacity math helpers

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `CalendarToolbar` Component

**Files:**
- Create: `src/components/calendar/CalendarToolbar.tsx`
- Create: `src/components/calendar/CalendarToolbar.test.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p src/components/calendar
```

- [ ] **Step 2: Write the failing test**

Create `src/components/calendar/CalendarToolbar.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CalendarToolbar } from './CalendarToolbar'
import type { CalendarSchedule } from '@/hooks/useCalendarSchedule'
import type { Division } from '@/hooks/useDivisions'

const SCHEDULE: CalendarSchedule = {
  mode: 'normal',
  day_start: 8,
  day_end: 17,
  scroll_to: 8,
  label: '8 AM – 5 PM · Normal',
}

const DIVISIONS: Division[] = [
  { id: 'div-1', slug: 'rsh', name: 'RSH', short_name: 'RSH', sort_order: 1, is_active: true, company_id: 'co-1' },
  { id: 'div-2', slug: 'afm', name: 'AFM', short_name: 'AFM', sort_order: 2, is_active: true, company_id: 'co-1' },
]

const baseProps = {
  date: '2026-05-07',
  onDateChange: vi.fn(),
  schedule: SCHEDULE,
  isSuperViewer: false,
  activeDivisionSlug: 'rsh',
  divisions: [DIVISIONS[0]], // regular user sees one division
  onDivisionChange: vi.fn(),
  activeVisitTypes: new Set<string>(),
  onVisitTypeToggle: vi.fn(),
  fitMode: false,
  onFitModeToggle: vi.fn(),
}

describe('CalendarToolbar', () => {
  it('renders formatted date label', () => {
    render(<CalendarToolbar {...baseProps} />)
    expect(screen.getByText(/Wed, May 7/i)).toBeInTheDocument()
  })

  it('shows schedule badge', () => {
    render(<CalendarToolbar {...baseProps} />)
    expect(screen.getByText('8 AM – 5 PM · Normal')).toBeInTheDocument()
  })

  it('calls onDateChange with next day when › is clicked', () => {
    render(<CalendarToolbar {...baseProps} />)
    fireEvent.click(screen.getByLabelText('next day'))
    expect(baseProps.onDateChange).toHaveBeenCalledWith('2026-05-08')
  })

  it('calls onDateChange with prev day when ‹ is clicked', () => {
    render(<CalendarToolbar {...baseProps} />)
    fireEvent.click(screen.getByLabelText('previous day'))
    expect(baseProps.onDateChange).toHaveBeenCalledWith('2026-05-06')
  })

  it('hides division selector for non-owner with single division', () => {
    render(<CalendarToolbar {...baseProps} isSuperViewer={false} divisions={[DIVISIONS[0]]} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows division selector for owner', () => {
    render(<CalendarToolbar {...baseProps} isSuperViewer={true} divisions={DIVISIONS} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders all 8 visit type chips', () => {
    render(<CalendarToolbar {...baseProps} />)
    expect(screen.getByText('Normal Order')).toBeInTheDocument()
    expect(screen.getByText('Emergency')).toBeInTheDocument()
    expect(screen.getByText('QC Visit')).toBeInTheDocument()
  })

  it('calls onVisitTypeToggle when a chip is clicked', () => {
    render(<CalendarToolbar {...baseProps} />)
    fireEvent.click(screen.getByText('Emergency'))
    expect(baseProps.onVisitTypeToggle).toHaveBeenCalledWith('emergency')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/components/calendar/CalendarToolbar.test.tsx
```

Expected: FAIL — cannot find module

- [ ] **Step 4: Create `src/components/calendar/CalendarToolbar.tsx`**

```typescript
'use client'

import { ChevronLeft, ChevronRight, ChevronDown, Filter } from 'lucide-react'
import { format, addDays, subDays, parseISO, isToday } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { CalendarSchedule } from '@/hooks/useCalendarSchedule'
import type { Division } from '@/hooks/useDivisions'

export type VisitTypeConfig = {
  key: string
  label: string
  color: string // tailwind bg class
}

export const VISIT_TYPES: VisitTypeConfig[] = [
  { key: 'normal_order',       label: 'Normal Order',          color: 'bg-blue-500' },
  { key: 'emergency',          label: 'Emergency',             color: 'bg-red-500' },
  { key: 'follow_up',          label: 'Follow Up',             color: 'bg-orange-400' },
  { key: 'backwork',           label: 'Backwork',              color: 'bg-yellow-500' },
  { key: 'site_visit',         label: 'Site Visit',            color: 'bg-green-500' },
  { key: 'site_visit_contract',label: 'Site Visit (Contract)', color: 'bg-teal-500' },
  { key: 'contract_visit',     label: 'Contract Visit',        color: 'bg-purple-500' },
  { key: 'qc_visit',           label: 'QC Visit',              color: 'bg-pink-500' },
]

interface CalendarToolbarProps {
  date: string
  onDateChange: (date: string) => void
  schedule: CalendarSchedule
  isSuperViewer: boolean
  activeDivisionSlug: string | null
  divisions: Division[]
  onDivisionChange: (slug: string) => void
  activeVisitTypes: Set<string>
  onVisitTypeToggle: (type: string) => void
  fitMode: boolean
  onFitModeToggle: () => void
  /** Hidden on mobile — only rendered at lg+ */
  showFitToggle?: boolean
}

export function CalendarToolbar({
  date,
  onDateChange,
  schedule,
  isSuperViewer,
  activeDivisionSlug,
  divisions,
  onDivisionChange,
  activeVisitTypes,
  onVisitTypeToggle,
  fitMode,
  onFitModeToggle,
  showFitToggle = false,
}: CalendarToolbarProps) {
  const parsed = parseISO(date)
  const dateLabel = format(parsed, 'EEE, MMM d')
  const onToday = !isToday(parsed)

  function prev() { onDateChange(format(subDays(parsed, 1), 'yyyy-MM-dd')) }
  function next() { onDateChange(format(addDays(parsed, 1), 'yyyy-MM-dd')) }
  function goToday() { onDateChange(format(new Date(), 'yyyy-MM-dd')) }

  return (
    <div className="flex flex-col gap-1 px-3 py-2 border-b bg-background">
      {/* Row 1 */}
      <div className="flex items-center gap-2 flex-wrap min-h-11 lg:min-h-0 lg:h-10">
        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={prev}
            aria-label="previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium w-28 text-center">{dateLabel}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={next}
            aria-label="next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {onToday && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={goToday}>
            Today
          </Button>
        )}

        {/* Active schedule badge */}
        <Badge variant="outline" className="text-xs font-normal h-6 hidden sm:flex">
          {schedule.label}
        </Badge>

        <div className="flex-1" />

        {/* Division selector — owner only, single-select */}
        {isSuperViewer && divisions.length > 1 && (
          <Select
            value={activeDivisionSlug ?? ''}
            onValueChange={onDivisionChange}
          >
            <SelectTrigger className="h-7 w-36 text-xs gap-1">
              <SelectValue placeholder="All divisions" />
              <ChevronDown className="h-3 w-3 opacity-50" />
            </SelectTrigger>
            <SelectContent>
              {divisions.map(d => (
                <SelectItem key={d.id} value={d.slug} className="text-xs">
                  {d.short_name ?? d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Fit / Scroll toggle — lg+ only */}
        {showFitToggle && (
          <div className="hidden lg:flex border rounded-md overflow-hidden text-xs">
            <button
              onClick={() => !fitMode && onFitModeToggle()}
              className={cn('px-2 h-7', fitMode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              Fit
            </button>
            <button
              onClick={() => fitMode && onFitModeToggle()}
              className={cn('px-2 h-7 border-l', !fitMode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              Scroll
            </button>
          </div>
        )}
      </div>

      {/* Row 2 — Visit type chips (hidden on mobile; mobile uses Filters sheet) */}
      <div className="hidden sm:flex items-center gap-1 flex-wrap">
        {VISIT_TYPES.map(vt => {
          const active = activeVisitTypes.size === 0 || activeVisitTypes.has(vt.key)
          return (
            <button
              key={vt.key}
              onClick={() => onVisitTypeToggle(vt.key)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-opacity',
                active ? 'opacity-100' : 'opacity-40',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', vt.color)} />
              {vt.label}
            </button>
          )
        })}
      </div>

      {/* Mobile: Filters button (visible only on < sm) */}
      <div className="flex sm:hidden">
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeVisitTypes.size > 0 && (
            <Badge className="h-4 w-4 p-0 flex items-center justify-center text-[10px]">
              {activeVisitTypes.size}
            </Badge>
          )}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/components/calendar/CalendarToolbar.test.tsx
```

Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/calendar/CalendarToolbar.tsx src/components/calendar/CalendarToolbar.test.tsx
git commit -m "$(cat <<'EOF'
feat(calendar): add CalendarToolbar with date nav, schedule badge, division select, visit chips

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## End of Part 1

**Completed in Part 1:**
- [x] Calendar permissions added to registry
- [x] `calendar_visits` Postgres view (DB migration)
- [x] `swap_visit_team` RPC (DB migration)
- [x] `useCalendarSchedule` hook + tests
- [x] `useCalendarVisits` hook + tests
- [x] `useWeekCapacity` hook + tests
- [x] `CalendarToolbar` component + tests

**Continue with:** `docs/superpowers/plans/2026-05-07-calendar-part-2.md`
