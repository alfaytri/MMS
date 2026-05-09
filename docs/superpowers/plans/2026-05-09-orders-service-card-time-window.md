# Orders: Service Card Redesign + Visit Date Time Windows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the selected-service card to a clear stacked layout, fix the confusing qty/duration display in the service selector, and add a per-visit-day arrival time window picker backed by a normalized `order_visit_dates` DB table and a team-availability RPC.

**Architecture:** Two DB migrations create the new table and RPC. TypeScript types are updated first so every component has correct signatures. UI components are built bottom-up (types → hooks → leaf components → composite components → wiring). `useCreateOrder` is updated last to write the new `order_visit_dates` rows on submit.

**Tech Stack:** Next.js 15, React, TypeScript, Supabase (PostgreSQL + RPC), TanStack Query, shadcn/ui, DnD Kit, date-fns, Lucide icons, Tailwind CSS.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260509200000_order_visit_dates.sql` | Create | New table + backfill + drop old column |
| `supabase/migrations/20260509200001_rpc_get_date_team_availability.sql` | Create | Availability check RPC |
| `src/types/orders.ts` | Modify | Add `VisitDateWindow`; update `OrderDraft.visitDates` |
| `src/hooks/useDateAvailability.ts` | Create | Query wrapper for the availability RPC |
| `src/components/orders/SelectedServiceCard.tsx` | Rewrite | Idea 1 card layout with stepper |
| `src/components/orders/ServiceSelector.tsx` | Modify | Fix leaf panel: remove ghost clock/min, add stepper |
| `src/components/orders/VisitDateSchedule.tsx` | Create | Per-day time window table |
| `src/hooks/useCreateOrder.ts` | Modify | `visitDates` type change, `updateServiceQty`, submit writes `order_visit_dates` |
| `src/components/orders/OrderFormPanel.tsx` | Modify | Wire `VisitDateSchedule`, new props, date→window transform |

---

## Task 1: DB Migration — `order_visit_dates` table + backfill

**Files:**
- Create: `supabase/migrations/20260509200000_order_visit_dates.sql`

- [ ] **Step 1: Update PROGRESS.md — starting task**

Edit `PROGRESS.md`: add `🚀 Starting: **Orders Service Card & Time Windows Task 1: DB Migration — order_visit_dates**` to the In Progress section.

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — starting DB Migration order_visit_dates

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Create the migration file**

Create `supabase/migrations/20260509200000_order_visit_dates.sql`:

```sql
-- Create normalized visit dates table to replace orders.visit_dates JSONB column
CREATE TABLE order_visit_dates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  visit_date  date        NOT NULL,
  from_time   time,
  to_time     time,
  sort_order  smallint    NOT NULL DEFAULT 0,
  UNIQUE (order_id, visit_date)
);

ALTER TABLE order_visit_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_manage_order_visit_dates"
  ON order_visit_dates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX order_visit_dates_order_id_idx  ON order_visit_dates (order_id);
CREATE INDEX order_visit_dates_visit_date_idx ON order_visit_dates (visit_date);

-- Backfill from existing orders.visit_dates JSONB (stores ISO date strings)
INSERT INTO order_visit_dates (order_id, visit_date, sort_order)
SELECT
  o.id,
  (elem.value #>> '{}')::date,
  (elem.ordinality - 1)::smallint
FROM orders o,
     LATERAL jsonb_array_elements(
       COALESCE(o.visit_dates, '[]'::jsonb)
     ) WITH ORDINALITY AS elem(value, ordinality)
WHERE o.visit_dates IS NOT NULL
  AND jsonb_array_length(o.visit_dates) > 0
ON CONFLICT (order_id, visit_date) DO NOTHING;

-- Drop the old JSONB column now that data is migrated
ALTER TABLE orders DROP COLUMN IF EXISTS visit_dates;
```

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

Expected output includes: `Applied migration 20260509200000_order_visit_dates`

- [ ] **Step 4: Verify table exists**

```bash
npx supabase db diff --use-migra 2>&1 | head -20
```

Expected: no diff (remote is up to date).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260509200000_order_visit_dates.sql
git commit -m "$(cat <<'EOF'
feat(db): add order_visit_dates table, backfill from JSONB, drop visit_dates column

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Update PROGRESS.md — task complete**

Edit `PROGRESS.md`:
- Add to Completed: `- [2026-05-09] **Orders Service Card & Time Windows Task 1: DB Migration — order_visit_dates** — supabase/migrations/20260509200000_order_visit_dates.sql — Normalized visit dates table with from_time/to_time, backfill from JSONB, drop visit_dates column`
- Update In Progress to Task 2.

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — DB Migration order_visit_dates complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: DB Migration — `get_date_team_availability` RPC

**Files:**
- Create: `supabase/migrations/20260509200001_rpc_get_date_team_availability.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260509200001_rpc_get_date_team_availability.sql`:

```sql
-- Returns available team count per requested date for a given time window.
-- A team is "booked" if it has an order_team_assignments row whose time
-- interval overlaps [p_from_time, p_to_time).
CREATE OR REPLACE FUNCTION get_date_team_availability(
  p_dates     date[],
  p_from_time time,
  p_to_time   time
)
RETURNS TABLE (
  visit_date            date,
  available_teams_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH total_teams AS (
    SELECT COUNT(*)::integer AS cnt
    FROM teams
    WHERE deleted_at IS NULL
  ),
  booked_teams AS (
    SELECT DISTINCT
      ota.scheduled_date AS visit_date,
      ota.team_id
    FROM order_team_assignments ota
    WHERE ota.scheduled_date = ANY(p_dates)
      AND p_from_time IS NOT NULL
      AND p_to_time   IS NOT NULL
      -- Half-open interval overlap: [slot_start, slot_end) overlaps [p_from, p_to)
      AND ota.time_slot::time < p_to_time
      AND (ota.time_slot::time + (ota.duration || ' minutes')::interval)::time > p_from_time
  ),
  booked_counts AS (
    SELECT visit_date, COUNT(DISTINCT team_id)::integer AS booked
    FROM booked_teams
    GROUP BY visit_date
  )
  SELECT
    d::date                                                     AS visit_date,
    GREATEST(0, (SELECT cnt FROM total_teams) - COALESCE(bc.booked, 0)) AS available_teams_count
  FROM UNNEST(p_dates) AS d
  LEFT JOIN booked_counts bc ON bc.visit_date = d::date
  ORDER BY visit_date;
$$;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: `Applied migration 20260509200001_rpc_get_date_team_availability`

- [ ] **Step 3: Smoke-test the RPC**

```bash
npx supabase db diff --use-migra 2>&1 | head -5
```

Expected: no diff.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260509200001_rpc_get_date_team_availability.sql
git commit -m "$(cat <<'EOF'
feat(db): add get_date_team_availability RPC for time-window conflict detection

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Update PROGRESS.md — task complete**

Edit `PROGRESS.md`:
- Add to Completed: `- [2026-05-09] **Orders Service Card & Time Windows Task 2: RPC get_date_team_availability** — supabase/migrations/20260509200001_rpc_get_date_team_availability.sql — SQL function returning available team count per date for a time window`
- Update In Progress to Task 3.

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — RPC get_date_team_availability complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: TypeScript — `VisitDateWindow` type + `OrderDraft` update

**Files:**
- Modify: `src/types/orders.ts`

- [ ] **Step 1: Add `VisitDateWindow` interface and update `OrderDraft`**

In `src/types/orders.ts`, add the new interface after the `OrderAttachment` interface (line 82):

```typescript
export interface VisitDateWindow {
  date: string           // ISO date string e.g. "2026-05-09"
  fromTime: string | null  // "09:00" — null means no preference
  toTime: string | null    // "12:00" — null means no preference
}
```

Then update `OrderDraft` — change line 94:
```typescript
// Before:
  visitDates: string[]          // multi-date selection (ISO date strings)

// After:
  visitDates: VisitDateWindow[] // multi-date selection with optional arrival windows
```

Also update `OrderDetail` — add `order_visit_dates` array after `order_services` (around line 126):

```typescript
  order_visit_dates: Array<{
    id: string
    visit_date: string
    from_time: string | null
    to_time: string | null
    sort_order: number
  }>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:\MMS && npx tsc --noEmit 2>&1 | head -40
```

Expected: errors about `visitDates` usages (string[] vs VisitDateWindow[]) in `useCreateOrder.ts` and `OrderFormPanel.tsx`. These are expected — they get fixed in later tasks. If there are errors in OTHER files, fix them now.

- [ ] **Step 3: Commit**

```bash
git add src/types/orders.ts
git commit -m "$(cat <<'EOF'
feat(types): add VisitDateWindow, update OrderDraft.visitDates and OrderDetail

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Update PROGRESS.md — task complete**

Edit `PROGRESS.md`:
- Add to Completed: `- [2026-05-09] **Orders Service Card & Time Windows Task 3: TypeScript Types** — src/types/orders.ts — VisitDateWindow interface, OrderDraft.visitDates: VisitDateWindow[], OrderDetail.order_visit_dates`
- Update In Progress to Task 4.

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — TypeScript types complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `SelectedServiceCard.tsx` — Idea 1 rewrite

**Files:**
- Rewrite: `src/components/orders/SelectedServiceCard.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/components/orders/SelectedServiceCard.tsx`:

```tsx
'use client'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { X, GripVertical, Clock, Minus, Plus } from 'lucide-react'
import type { OrderServiceDraft } from '@/types/orders'
import { cn } from '@/lib/utils'

interface Props {
  service: OrderServiceDraft
  onRemove: (serviceId: string) => void
  onQtyChange: (serviceId: string, qty: number) => void
}

export function SelectedServiceCard({ service, onRemove, onQtyChange }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: service.serviceId,
    data: { type: 'service', service },
  })

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  // Path = all levels except the final service name
  const pathLabel = service.path.slice(0, -1).join(' / ')
  const hasDuration = service.duration > 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative rounded-md border border-slate-200 bg-white text-sm',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      {/* Drag handle + remove */}
      <div className="absolute left-1.5 top-1/2 -translate-y-1/2">
        <button
          {...listeners}
          {...attributes}
          className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
          tabIndex={-1}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <button
        onClick={() => onRemove(service.serviceId)}
        className="absolute right-1.5 top-1.5 text-slate-400 hover:text-red-500"
        aria-label="Remove service"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="pl-7 pr-7 pt-2 pb-2 space-y-1">
        {/* Breadcrumb path */}
        {pathLabel && (
          <p className="truncate text-[11px] text-slate-400 leading-none">{pathLabel}</p>
        )}

        {/* Service name — full width, wraps freely */}
        <p className="font-semibold text-slate-900 break-words leading-snug pr-1">
          {service.serviceName}
        </p>

        {/* Divider */}
        <div className="border-t border-slate-100" />

        {/* Controls row */}
        <div className="flex items-center gap-2 pt-0.5">
          {/* Qty stepper */}
          <div className="flex items-center rounded border border-slate-200">
            <button
              type="button"
              onClick={() => onQtyChange(service.serviceId, Math.max(1, service.qty - 1))}
              className="px-1.5 py-1 text-slate-500 hover:text-slate-900 disabled:opacity-40"
              disabled={service.qty <= 1}
              aria-label="Decrease quantity"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-6 text-center text-xs font-medium text-slate-900 select-none">
              {service.qty}
            </span>
            <button
              type="button"
              onClick={() => onQtyChange(service.serviceId, service.qty + 1)}
              className="px-1.5 py-1 text-slate-500 hover:text-slate-900"
              aria-label="Increase quantity"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Duration — only shown when > 0 */}
          {hasDuration && (
            <span className="flex items-center gap-0.5 text-xs text-slate-500">
              <Clock className="h-3 w-3" />
              {service.duration} min
            </span>
          )}

          {/* Price */}
          <span className="ml-auto text-xs font-semibold text-slate-900">
            QAR {(service.price * service.qty).toFixed(0)}
          </span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles for this file**

```bash
cd D:\MMS && npx tsc --noEmit 2>&1 | grep "SelectedServiceCard" | head -10
```

Expected: errors only about missing `onQtyChange` prop at the call site in `OrderFormPanel.tsx` — that's fixed in Task 9.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/SelectedServiceCard.tsx
git commit -m "$(cat <<'EOF'
feat(orders): rewrite SelectedServiceCard with stacked layout (Idea 1)

Shows path as muted breadcrumbs, service name full-width wrapping, qty stepper,
conditional duration badge (hidden when 0), price. Drag handle preserved.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Update PROGRESS.md — task complete**

Edit `PROGRESS.md`:
- Add to Completed: `- [2026-05-09] **Orders Service Card & Time Windows Task 4: SelectedServiceCard** — src/components/orders/SelectedServiceCard.tsx — Idea 1 stacked card: breadcrumb path, full-width name, divider, qty stepper, conditional duration, price`
- Update In Progress to Task 5.

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — SelectedServiceCard complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `ServiceSelector.tsx` — fix leaf panel

**Files:**
- Modify: `src/components/orders/ServiceSelector.tsx`

- [ ] **Step 1: Replace the leaf panel and imports**

Replace the entire contents of `src/components/orders/ServiceSelector.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Plus, Minus } from 'lucide-react'
import { useServiceTree } from '@/hooks/useServices'
import type { OrderServiceDraft } from '@/types/orders'

interface ServiceNode {
  id: string
  name_en: string
  parent_id: string | null
  price: number | null
  duration: number | null
  division: string[] | null
}

interface Props {
  onAdd: (service: OrderServiceDraft) => void
  divisionFilters?: string[]
  treeType?: string
}

export function ServiceSelector({ onAdd, divisionFilters = [], treeType = 'normal' }: Props) {
  const { data: services = [] } = useServiceTree(treeType, divisionFilters, true)
  const [selections, setSelections] = useState<Record<number, string>>({})
  const [qty, setQty] = useState(1)

  function getChildren(parentId: string | null): ServiceNode[] {
    return (services ?? []).filter((s: ServiceNode) => s.parent_id === parentId)
  }

  function buildLevels(): Array<{ options: ServiceNode[]; selectedId: string | undefined }> {
    const levels = []
    let parentId: string | null = null
    let levelIndex = 0
    while (true) {
      const options = getChildren(parentId)
      if (options.length === 0) break
      const selectedId = selections[levelIndex]
      levels.push({ options, selectedId })
      if (!selectedId) break
      parentId = selectedId
      levelIndex++
    }
    return levels
  }

  const levels = buildLevels()
  const lastSelectedId = selections[Object.keys(selections).length - 1]
  const lastSelected = lastSelectedId
    ? (services ?? []).find((s: ServiceNode) => s.id === lastSelectedId)
    : null
  const isLeaf = lastSelected && getChildren(lastSelected.id).length === 0

  function handleLevelChange(level: number, value: string) {
    const newSelections: Record<number, string> = {}
    for (let i = 0; i < level; i++) newSelections[i] = selections[i]
    newSelections[level] = value
    setSelections(newSelections)
    setQty(1)
  }

  function handleAdd() {
    if (!lastSelected || !isLeaf) return
    const pathNames = Object.values(selections).map(
      (id) => (services ?? []).find((s: ServiceNode) => s.id === id)?.name_en ?? ''
    )
    onAdd({
      serviceId: lastSelected.id as string,
      serviceName: lastSelected.name_en,
      path: pathNames,
      qty,
      price: lastSelected.price ?? 0,
      duration: lastSelected.duration ?? 0,
      rootSkillId: lastSelected.id as string,
    })
    setSelections({})
    setQty(1)
  }

  return (
    <div className="space-y-2">
      {levels.map((level, i) => (
        <Select
          key={i}
          value={(level.selectedId ?? '') as string}
          onValueChange={(v) => handleLevelChange(i, v ?? '')}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder={i === 0 ? 'Select category…' : 'Select…'} />
          </SelectTrigger>
          <SelectContent>
            {level.options.map((opt) => (
              <SelectItem key={opt.id} value={opt.id as string}>
                {opt.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {isLeaf && lastSelected && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="flex items-center gap-2">
            {/* Qty stepper */}
            <div className="flex items-center rounded border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                className="px-1.5 py-1 text-slate-500 hover:text-slate-900 disabled:opacity-40"
                aria-label="Decrease quantity"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-6 text-center text-xs font-medium text-slate-900 select-none">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                className="px-1.5 py-1 text-slate-500 hover:text-slate-900"
                aria-label="Increase quantity"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            {/* Unit price */}
            <span className="flex-1 text-right text-xs text-slate-500">
              QAR {lastSelected.price ?? 0}
            </span>

            {/* Add button */}
            <Button size="sm" className="h-8 gap-1" onClick={handleAdd}>
              <Plus className="h-3.5 w-3.5" />
              Add Service
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles for this file**

```bash
cd D:\MMS && npx tsc --noEmit 2>&1 | grep "ServiceSelector" | head -10
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/ServiceSelector.tsx
git commit -m "$(cat <<'EOF'
feat(orders): fix ServiceSelector leaf panel — remove ghost clock/min, add qty stepper

Removes the confusing empty duration display. Replaces bare Input with
[− qty +] stepper alongside unit price and Add Service button.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Update PROGRESS.md — task complete**

Edit `PROGRESS.md`:
- Add to Completed: `- [2026-05-09] **Orders Service Card & Time Windows Task 5: ServiceSelector** — src/components/orders/ServiceSelector.tsx — Removed ghost clock/min row, replaced bare Input with [− qty +] stepper, cleaner leaf panel`
- Update In Progress to Task 6.

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — ServiceSelector leaf panel fix complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `useDateAvailability.ts` — availability query hook

**Files:**
- Create: `src/hooks/useDateAvailability.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useDateAvailability.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface DateAvailability {
  visit_date: string
  available_teams_count: number
}

export function useDateAvailability(
  dates: string[],
  fromTime: string | null,
  toTime: string | null
) {
  const supabase = createClient()

  return useQuery<DateAvailability[]>({
    queryKey: ['date-availability', [...dates].sort(), fromTime, toTime],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_date_team_availability', {
        p_dates: dates,
        p_from_time: fromTime,
        p_to_time: toTime,
      })
      if (error) throw error
      return (data ?? []) as DateAvailability[]
    },
    enabled: !!fromTime && !!toTime && dates.length > 0,
    staleTime: 30_000,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles for this file**

```bash
cd D:\MMS && npx tsc --noEmit 2>&1 | grep "useDateAvailability" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDateAvailability.ts
git commit -m "$(cat <<'EOF'
feat(orders): add useDateAvailability hook for time-window conflict detection

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Update PROGRESS.md — task complete**

Edit `PROGRESS.md`:
- Add to Completed: `- [2026-05-09] **Orders Service Card & Time Windows Task 6: useDateAvailability** — src/hooks/useDateAvailability.ts — TanStack Query wrapper for get_date_team_availability RPC, enabled only when both times are set`
- Update In Progress to Task 7.

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — useDateAvailability hook complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `VisitDateSchedule.tsx` — per-day arrival time window component

**Files:**
- Create: `src/components/orders/VisitDateSchedule.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/orders/VisitDateSchedule.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Copy, Check, AlertTriangle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDateAvailability } from '@/hooks/useDateAvailability'
import type { VisitDateWindow } from '@/types/orders'

// 30-minute slots 06:00 – 22:00
const TIME_OPTIONS: string[] = []
for (let h = 6; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 22) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

interface Props {
  windows: VisitDateWindow[]
  onChange: (windows: VisitDateWindow[]) => void
}

export function VisitDateSchedule({ windows, onChange }: Props) {
  const [appliedDates, setAppliedDates] = useState<Set<string>>(new Set())

  const sorted = [...windows].sort((a, b) => a.date.localeCompare(b.date))

  // The first row with both times filled is the "Apply to all" source
  const sourceWindow = sorted.find((w) => w.fromTime && w.toTime) ?? null

  // Dates eligible for "Apply to all" conflict check: empty rows other than source
  const datesToCheck = sourceWindow
    ? sorted
        .filter((w) => w.date !== sourceWindow.date && (!w.fromTime || !w.toTime))
        .map((w) => w.date)
    : []

  const { data: availability = [] } = useDateAvailability(
    datesToCheck,
    sourceWindow?.fromTime ?? null,
    sourceWindow?.toTime ?? null
  )
  const availabilityMap = new Map(availability.map((a) => [a.visit_date, a.available_teams_count]))

  function updateWindow(date: string, patch: Partial<VisitDateWindow>) {
    onChange(windows.map((w) => (w.date === date ? { ...w, ...patch } : w)))
    // Clear applied marker if user manually edits
    if (appliedDates.has(date)) {
      setAppliedDates((prev) => {
        const next = new Set(prev)
        next.delete(date)
        return next
      })
    }
  }

  function getToOptions(fromTime: string | null): string[] {
    if (!fromTime) return TIME_OPTIONS
    const idx = TIME_OPTIONS.indexOf(fromTime)
    return idx === -1 ? TIME_OPTIONS : TIME_OPTIONS.slice(idx + 1)
  }

  function handleApplyToAll() {
    if (!sourceWindow?.fromTime || !sourceWindow?.toTime) return
    const newApplied = new Set(appliedDates)
    const updated = windows.map((w) => {
      if (w.date === sourceWindow.date) return w
      if (w.fromTime && w.toTime) return w // already has a custom window
      const avail = availabilityMap.get(w.date)
      if (avail === 0) return w // conflicted — skip
      newApplied.add(w.date)
      return { ...w, fromTime: sourceWindow.fromTime, toTime: sourceWindow.toTime }
    })
    setAppliedDates(newApplied)
    onChange(updated)
  }

  const hasOtherEmptyRows = sorted.some(
    (w) => w.date !== sourceWindow?.date && (!w.fromTime || !w.toTime)
  )
  const showApplyButton = !!sourceWindow && hasOtherEmptyRows && sorted.length > 1

  if (sorted.length === 0) return null

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Requested Arrival Window
      </Label>

      <div className="space-y-2">
        {sorted.map((w) => {
          const isSource = w.date === sourceWindow?.date
          const isApplied = appliedDates.has(w.date)
          const avail = availabilityMap.get(w.date)
          const isConflicted = avail === 0
          const toOptions = getToOptions(w.fromTime)

          return (
            <div key={w.date} className="flex flex-wrap items-center gap-2">
              {/* Date label */}
              <span className="w-24 shrink-0 text-xs text-slate-600">
                {format(parseISO(w.date), 'd MMM yyyy')}
              </span>

              {/* From time */}
              <Select
                value={w.fromTime ?? ''}
                onValueChange={(v) => {
                  const fromTime = v || null
                  // Reset toTime if no longer valid after fromTime change
                  const toTime =
                    w.toTime && fromTime && w.toTime > fromTime ? w.toTime : null
                  updateWindow(w.date, { fromTime, toTime })
                }}
              >
                <SelectTrigger className="h-8 w-[90px] text-xs">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="text-xs text-slate-400">→</span>

              {/* To time */}
              <Select
                value={w.toTime ?? ''}
                onValueChange={(v) => updateWindow(w.date, { toTime: v || null })}
                disabled={!w.fromTime}
              >
                <SelectTrigger className="h-8 w-[90px] text-xs">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {toOptions.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status / action */}
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {isSource && showApplyButton && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={handleApplyToAll}
                  >
                    <Copy className="h-3 w-3" />
                    Apply to all
                  </Button>
                )}
                {isApplied && !isSource && (
                  <span className="flex items-center gap-0.5 text-xs text-slate-400">
                    <Check className="h-3 w-3 text-green-500" />
                    applied
                  </span>
                )}
                {isConflicted && (
                  <span className="flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    No availability
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles for this file**

```bash
cd D:\MMS && npx tsc --noEmit 2>&1 | grep "VisitDateSchedule" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/VisitDateSchedule.tsx
git commit -m "$(cat <<'EOF'
feat(orders): add VisitDateSchedule component for per-day arrival time windows

Row-per-date table with From/To time selectors (30-min intervals 06:00-22:00),
Apply-to-all button with conflict detection via useDateAvailability hook.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Update PROGRESS.md — task complete**

Edit `PROGRESS.md`:
- Add to Completed: `- [2026-05-09] **Orders Service Card & Time Windows Task 7: VisitDateSchedule** — src/components/orders/VisitDateSchedule.tsx — Per-day arrival window table, Apply-to-all with conflict detection, 30-min time slots`
- Update In Progress to Task 8.

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — VisitDateSchedule complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `useCreateOrder.ts` — update types, add `updateServiceQty`, update submit

**Files:**
- Modify: `src/hooks/useCreateOrder.ts`

- [ ] **Step 1: Update imports + INITIAL_DRAFT**

In `src/hooks/useCreateOrder.ts`, update the import on line 6 to include `VisitDateWindow`:

```typescript
import type { OrderDraft, OrderServiceDraft, TeamAssignmentDraft, CustomerAddress, OrderAttachment, VisitDateWindow } from '@/types/orders'
```

Update `INITIAL_DRAFT` — change the `visitDates` field (line ~24):

```typescript
// Before:
  visitDates: [today],

// After:
  visitDates: [{ date: today, fromTime: null, toTime: null }] as VisitDateWindow[],
```

- [ ] **Step 2: Add `updateServiceQty` function**

After the `removeService` function (around line 68), add:

```typescript
  function updateServiceQty(serviceId: string, qty: number) {
    setDraft((d) => ({
      ...d,
      services: d.services.map((s) =>
        s.serviceId === serviceId ? { ...s, qty: Math.max(1, qty) } : s
      ),
    }))
  }
```

- [ ] **Step 3: Update the submit mutation — primary date extraction**

In the `submit` mutation, find the primary date extraction (around line 139) and update:

```typescript
// Before:
      const primaryDate = draft.visitDates.length > 0
        ? [...draft.visitDates].sort()[0]
        : draft.visitDate

// After:
      const primaryDate = draft.visitDates.length > 0
        ? [...draft.visitDates].sort((a, b) => a.date.localeCompare(b.date))[0].date
        : draft.visitDate
```

- [ ] **Step 4: Update the orders INSERT — remove visit_dates, keep the rest**

In the `.insert({...})` block (around line 144), remove the `visit_dates` line:

```typescript
// Remove this line:
          visit_dates: draft.visitDates.length > 0 ? draft.visitDates : [draft.visitDate],
```

The insert block should now look like:

```typescript
      const { data: order, error } = await (supabase as any)
        .from('orders')
        .insert({
          order_id: orderId,
          customer_id: draft.customerId,
          type: draft.type,
          status,
          confirmation_status: 'not_sent',
          scheduled_date: primaryDate,
          total_amount: totalAmount,
          address: addressString,
          notes: draft.notes || null,
          has_invoice: false,
          arrival_phone: draft.arrivalPhone || null,
          attachments: uploadedAttachments.length > 0 ? uploadedAttachments : null,
        })
        .select('id')
        .single()
```

- [ ] **Step 5: Insert into `order_visit_dates` after order creation**

After the `if (error || !order)` guard (line ~164), add the visit dates insert before the services insert:

```typescript
      // Insert visit dates with time windows
      const visitDateRows = draft.visitDates
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((w, i) => ({
          order_id: order.id,
          visit_date: w.date,
          from_time: w.fromTime ?? null,
          to_time: w.toTime ?? null,
          sort_order: i,
        }))

      if (visitDateRows.length > 0) {
        const { error: visitDateError } = await (supabase as any)
          .from('order_visit_dates')
          .insert(visitDateRows)
        if (visitDateError) throw visitDateError
      }
```

- [ ] **Step 6: Export `updateServiceQty` from the hook return**

At the bottom of `useCreateOrder`, add `updateServiceQty` to the return object:

```typescript
  return {
    draft,
    pendingFiles,
    setPendingFiles,
    setCustomer,
    setAddress,
    addService,
    removeService,
    updateServiceQty,   // ← add this
    addAssignment,
    removeAssignment,
    update,
    reset,
    isValid,
    submit,
  }
```

- [ ] **Step 7: Verify TypeScript compiles for this file**

```bash
cd D:\MMS && npx tsc --noEmit 2>&1 | grep "useCreateOrder" | head -10
```

Expected: no errors for this file.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useCreateOrder.ts
git commit -m "$(cat <<'EOF'
feat(orders): update useCreateOrder — VisitDateWindow type, updateServiceQty, order_visit_dates insert

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Update PROGRESS.md — task complete**

Edit `PROGRESS.md`:
- Add to Completed: `- [2026-05-09] **Orders Service Card & Time Windows Task 8: useCreateOrder** — src/hooks/useCreateOrder.ts — VisitDateWindow[] type, updateServiceQty, submit inserts order_visit_dates rows`
- Update In Progress to Task 9.

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — useCreateOrder complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `OrderFormPanel.tsx` — wire everything together

**Files:**
- Modify: `src/components/orders/OrderFormPanel.tsx`

- [ ] **Step 1: Add new imports**

At the top of `src/components/orders/OrderFormPanel.tsx`, add:

```typescript
import { VisitDateSchedule } from './VisitDateSchedule'
import type { VisitDateWindow } from '@/types/orders'
```

- [ ] **Step 2: Add `onUpdateServiceQty` prop**

Update the `Props` interface (around line 36) to add the new prop:

```typescript
interface Props {
  draft: OrderDraft
  pendingFiles: PendingAttachment[]
  onTypeChange: (type: OrderType) => void
  onAddService: (s: OrderServiceDraft) => void
  onRemoveService: (id: string) => void
  onUpdateServiceQty: (serviceId: string, qty: number) => void  // ← add this
  onAddressSelect: (a: CustomerAddress) => void
  onUpdate: (patch: Partial<OrderDraft>) => void
  onPendingFilesChange: (files: PendingAttachment[]) => void
  onSubmit: () => void
  isSubmitting: boolean
  isValid: boolean
}
```

- [ ] **Step 3: Destructure the new prop**

In the function signature (around line 50), add `onUpdateServiceQty`:

```typescript
export function OrderFormPanel({
  draft,
  pendingFiles,
  onTypeChange,
  onAddService,
  onRemoveService,
  onUpdateServiceQty,   // ← add this
  onAddressSelect,
  onUpdate,
  onPendingFilesChange,
  onSubmit,
  isSubmitting,
  isValid,
}: Props) {
```

- [ ] **Step 4: Update `SelectedServiceCard` usage to pass `onQtyChange`**

Find the `SelectedServiceCard` render (around line 169) and add the `onQtyChange` prop:

```tsx
// Before:
                  <SelectedServiceCard key={s.serviceId} service={s} onRemove={onRemoveService} />

// After:
                  <SelectedServiceCard
                    key={s.serviceId}
                    service={s}
                    onRemove={onRemoveService}
                    onQtyChange={onUpdateServiceQty}
                  />
```

- [ ] **Step 5: Update the VisitDatePicker onChange handler**

Find the `VisitDatePicker` block (around line 185) and update its `onChange` and `selected` props:

```tsx
        <VisitDatePicker
          selected={draft.visitDates.map((w) => w.date)}
          onChange={(dates) => {
            const existingMap = new Map(draft.visitDates.map((w) => [w.date, w]))
            const newWindows: VisitDateWindow[] = dates.map((date) =>
              existingMap.get(date) ?? { date, fromTime: null, toTime: null }
            )
            const primaryDate =
              newWindows.length > 0
                ? [...newWindows].sort((a, b) => a.date.localeCompare(b.date))[0].date
                : draft.visitDate
            onUpdate({ visitDates: newWindows, visitDate: primaryDate })
          }}
        />
```

- [ ] **Step 6: Add `VisitDateSchedule` below the date picker**

Immediately after the closing `</div>` of the visit date section (after the `VisitDatePicker` block), add:

```tsx
        {/* ── Requested Arrival Window ── */}
        {draft.visitDates.length > 0 && (
          <VisitDateSchedule
            windows={draft.visitDates}
            onChange={(windows) => onUpdate({ visitDates: windows })}
          />
        )}
```

- [ ] **Step 7: Wire `onUpdateServiceQty` in create/page.tsx**

Open `src/app/(dashboard)/orders/create/page.tsx`. The `useCreateOrder` hook now exposes `updateServiceQty`. Pass it to `OrderFormPanel`:

Find the `OrderFormPanel` usage (around line 117) and add the prop:

```tsx
        <OrderFormPanel
          draft={draft}
          pendingFiles={pendingFiles}
          onTypeChange={(type) => update({ type })}
          onAddService={addService}
          onRemoveService={removeService}
          onUpdateServiceQty={updateServiceQty}    // ← add this
          onAddressSelect={setAddress}
          onUpdate={update}
          onPendingFilesChange={setPendingFiles}
          onSubmit={handleSubmit}
          isSubmitting={submit.isPending}
          isValid={isValid()}
        />
```

Also update the destructuring of `useCreateOrder` at the top of the page component to include `updateServiceQty`:

```typescript
  const {
    draft,
    pendingFiles,
    setPendingFiles,
    setCustomer,
    setAddress,
    addService,
    removeService,
    updateServiceQty,    // ← add this
    addAssignment,
    update,
    isValid,
    submit,
  } = useCreateOrder()
```

- [ ] **Step 8: Full TypeScript check**

```bash
cd D:\MMS && npx tsc --noEmit 2>&1
```

Expected: **zero errors**. If any errors remain, fix them before continuing.

- [ ] **Step 9: Commit**

```bash
git add src/components/orders/OrderFormPanel.tsx src/app/(dashboard)/orders/create/page.tsx
git commit -m "$(cat <<'EOF'
feat(orders): wire VisitDateSchedule and new service card into OrderFormPanel

- onUpdateServiceQty prop threaded through to SelectedServiceCard stepper
- VisitDatePicker onChange transforms string[] to VisitDateWindow[]
- VisitDateSchedule rendered below date chips when dates are selected

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10: Update PROGRESS.md — task complete**

Edit `PROGRESS.md`:
- Add to Completed: `- [2026-05-09] **Orders Service Card & Time Windows Task 9: OrderFormPanel wire-up** — src/components/orders/OrderFormPanel.tsx, src/app/(dashboard)/orders/create/page.tsx — Wired VisitDateSchedule, onUpdateServiceQty, VisitDateWindow transform`
- Clear In Progress.

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — OrderFormPanel wire-up complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Smoke Test

- [ ] **Step 1: Start the dev server**

```bash
cd D:\MMS && npm run dev
```

- [ ] **Step 2: Open the order creation page**

Navigate to `http://localhost:3000/orders/create` (or whichever port Next.js starts on).

- [ ] **Step 3: Test service card**

1. Look up a customer via the phone modal
2. Select a division (e.g. AFM)
3. Drill down to a leaf service and click **Add Service**
4. Verify the card shows:
   - Muted breadcrumb path above the service name
   - Service name bold, full-width, wrapping if long
   - Divider line
   - `[−] 1 [+]` stepper, duration badge only if > 0, `QAR {price}` right-aligned
   - No clock icon with empty "min" text

5. Click `−` and `+` on the stepper — verify qty updates and price recalculates.
6. Add a second service — verify two cards stack, both independently controllable.

- [ ] **Step 4: Test visit date + arrival window**

1. Click the visit date picker, select 3+ dates
2. Verify the **Requested Arrival Window** section appears below the date chips with one row per date
3. Set `fromTime` on the first row → verify `toTime` is enabled and options start after `fromTime`
4. Set `toTime` → verify **Apply to all** button appears on that row
5. Click **Apply to all** → verify the window copies to rows with no conflict, skips conflicted rows (if any)
6. Verify `✓ applied` label appears on copied rows
7. Remove a date chip → verify its row disappears from the schedule table

- [ ] **Step 5: Test order submission**

1. Fill all required fields (customer, service, date, address, team assignment in calendar)
2. Submit the order
3. In Supabase dashboard → Table Editor → `order_visit_dates`, verify rows were created with the correct `order_id`, `visit_date`, `from_time`, `to_time`

- [ ] **Step 6: Update PROGRESS.md — smoke test complete**

Edit `PROGRESS.md`:
- Add to Completed: `- [2026-05-09] **Orders Service Card & Time Windows Task 10: Smoke Test** — Manual verification of service card UI, time window table, Apply-to-all, DB persistence`

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — smoke test complete, feature ready

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
