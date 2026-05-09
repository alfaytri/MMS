# Orders: Service Card Redesign + Visit Date Time Windows

**Date:** 2026-05-09  
**Branch:** feature/orders-module  
**Scope:** OrderFormPanel — requested services UI + per-day arrival time window selection + full DB/backend support

---

## 1. Problem Statement

Two separate UX bugs in the order creation form:

1. **Service card confusion** — Selected services are rendered as a chain of raw dropdowns (one per hierarchy level). Below the last dropdown sits a row showing `⊙ min | QAR 300`, then directly underneath a `qty` input. When a service has no duration set the clock/min row is blank, making the qty input look like the field to enter time-in-minutes. The UX conveys the wrong thing without context.

2. **No time window capture** — Multi-day orders have no way to record the customer's preferred arrival window per day. The calendar panel handles team scheduling, but the customer's requested window ("9am–12pm") is never stored, so dispatchers have no reference.

---

## 2. Design Decisions

- **Service card**: Idea 1 — stacked rows, service name gets full width, path as muted breadcrumbs above, controls row below.
- **Time window**: Inline schedule table below date chips — one row per visit day, From/To droppers, "Apply to all days" button on the first fully-filled row, disabled per conflicting day.
- **DB**: New normalized `order_visit_dates` table replaces the flat `visit_dates` JSONB array; availability check via a new RPC.

---

## 3. UI Design

### 3.1 SelectedServiceCard — new layout

```
┌──────────────────────────────────────── ×  ┐
│  Air Conditioning / Window / L1 Maintenance  │  ← muted xs breadcrumb path
│  Gas Refill (R22) — Long Service Name Here   │  ← bold, full width, wraps freely
│  ─────────────────────────────────────────   │
│  [− 1 +]           ⏱ 45 min    QAR 300      │  ← controls row
└──────────────────────────────────────────────┘
```

Rules:
- **Path row**: All levels except the final name, joined by ` / `, rendered in `text-xs text-slate-400`. Truncate with `…` if > 60 chars.
- **Name row**: `font-semibold text-slate-900`, `break-words`, no truncation. Full width.
- **Divider**: 1px `border-t border-slate-100` between name and controls.
- **Controls row**: Qty stepper `[−] {n} [+]` left, duration badge `⏱ {n} min` center (hidden entirely when `duration === 0 || duration === null`), `QAR {price × qty}` right.
- **× button**: Absolute top-right, `text-slate-400 hover:text-red-500`.
- **Drag handle**: `GripVertical` icon left edge — keep existing DnD behaviour.
- The `+ Add Service` button in `ServiceSelector` leaf node: remove the current stacked layout with `Input` and `Clock` icon. Replace with a single-row: `[− qty +]` stepper left, `QAR {price}` muted right, `+ Add Service` button spanning below.

### 3.2 VisitDateSchedule — new component

Appears directly below the date chips section in `OrderFormPanel` when `visitDates.length > 0`.

Section header: `REQUESTED ARRIVAL WINDOW` (same label style as other sections).

```
REQUESTED ARRIVAL WINDOW

9 May 2026    [09:00 ▾]  →  [12:00 ▾]   [⧉ Apply to all days]
10 May 2026   [09:00 ▾]  →  [12:00 ▾]   ✓ applied
11 May 2026   [13:00 ▾]  →  [17:00 ▾]   ⚠ No availability — set manually
13 May 2026   [  —  ▾]   →  [  —  ▾]
```

**Time dropdowns**: 30-minute intervals, 06:00–22:00. Value `null` renders as `—` placeholder. `toTime` options start from `fromTime + 30 min` to prevent invalid ranges.

**"Apply to all days" button**:
- Renders on the row where both `fromTime` and `toTime` are set and at least one other row is empty.
- On click: copies this window to every other row that has no conflict.
- Rows with conflicts receive a `⚠ No availability` warning label instead and keep their own values.
- After apply: replaced by a muted `✓ applied` label on each row that was updated.
- Conflict detection: calls the `get_date_team_availability` RPC (see §4.3). A date is conflicted if `available_teams_count === 0` for the requested window.

**Time is optional**: Leaving both times as `—` is valid. Blank rows are saved with `from_time = null, to_time = null`.

---

## 4. Database

### 4.1 New table: `order_visit_dates`

Replaces the flat `visit_dates jsonb` column on `orders`.

```sql
CREATE TABLE order_visit_dates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  visit_date  date NOT NULL,
  from_time   time,
  to_time     time,
  sort_order  smallint NOT NULL DEFAULT 0,
  UNIQUE (order_id, visit_date)
);

ALTER TABLE order_visit_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can manage order_visit_dates"
  ON order_visit_dates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX order_visit_dates_order_id_idx ON order_visit_dates (order_id);
CREATE INDEX order_visit_dates_visit_date_idx ON order_visit_dates (visit_date);
```

### 4.2 Backfill + column drop

In the same migration, backfill existing rows from `orders.visit_dates` JSONB into `order_visit_dates`, then drop the column:

```sql
INSERT INTO order_visit_dates (order_id, visit_date, sort_order)
SELECT
  id,
  (elem.value #>> '{}')::date,
  elem.ordinality - 1
FROM orders,
     LATERAL jsonb_array_elements_text(
       COALESCE(visit_dates, '[]'::jsonb)
     ) WITH ORDINALITY AS elem(value, ordinality)
WHERE visit_dates IS NOT NULL
  AND jsonb_array_length(visit_dates) > 0
ON CONFLICT (order_id, visit_date) DO NOTHING;

ALTER TABLE orders DROP COLUMN IF EXISTS visit_dates;
```

### 4.3 RPC: `get_date_team_availability`

Returns, for each requested date, how many teams have NO overlapping booking during the given time window. Used by the frontend to disable the "Apply to all" button per day.

```sql
CREATE OR REPLACE FUNCTION get_date_team_availability(
  p_dates     date[],
  p_from_time time,
  p_to_time   time
)
RETURNS TABLE (
  visit_date           date,
  available_teams_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH total_teams AS (
    SELECT COUNT(*)::integer AS cnt FROM teams WHERE deleted_at IS NULL
  ),
  booked_teams AS (
    SELECT DISTINCT
      ota.scheduled_date AS visit_date,
      ota.team_id
    FROM order_team_assignments ota
    WHERE ota.scheduled_date = ANY(p_dates)
      AND p_from_time IS NOT NULL
      AND p_to_time IS NOT NULL
      AND (
        ota.time_slot::time < p_to_time
        AND (ota.time_slot::time + (ota.duration || ' minutes')::interval) > p_from_time
      )
  ),
  booked_counts AS (
    SELECT visit_date, COUNT(DISTINCT team_id)::integer AS booked
    FROM booked_teams
    GROUP BY visit_date
  )
  SELECT
    d::date AS visit_date,
    GREATEST(0, (SELECT cnt FROM total_teams) - COALESCE(bc.booked, 0)) AS available_teams_count
  FROM UNNEST(p_dates) AS d
  LEFT JOIN booked_counts bc ON bc.visit_date = d::date
  ORDER BY visit_date;
$$;
```

### 4.4 Update `create_order` flow (client-side)

`useCreateOrder.ts` currently inserts directly into `orders` with `visit_dates` JSONB. After this change:

- Remove `visit_dates` from the `orders` INSERT.
- After the main order INSERT, insert one row per window into `order_visit_dates`.
- Pass `sort_order` as the index in the sorted date array.

### 4.5 `OrderDetail` query update

Any query that reads `visit_dates` from `orders` must switch to a JOIN/subquery on `order_visit_dates`. The `OrderDetail` type must include the full window objects.

---

## 5. TypeScript Types

### 5.1 New type

```typescript
// src/types/orders.ts
export interface VisitDateWindow {
  date: string           // ISO date "2026-05-09"
  fromTime: string | null  // "09:00" | null
  toTime: string | null    // "12:00" | null
}
```

### 5.2 Updated `OrderDraft`

```typescript
export interface OrderDraft {
  // ...existing fields...
  visitDates: VisitDateWindow[]   // was: string[]
  // visitDate kept as string (primary date = first sorted window.date)
}
```

### 5.3 Updated `INITIAL_DRAFT` in `useCreateOrder.ts`

```typescript
visitDates: [{ date: today, fromTime: null, toTime: null }],
```

### 5.4 Updated `OrderDetail`

```typescript
order_visit_dates: Array<{
  id: string
  visit_date: string
  from_time: string | null
  to_time: string | null
  sort_order: number
}>
```

---

## 6. New / Modified Components

| File | Change |
|---|---|
| `src/types/orders.ts` | Add `VisitDateWindow`; update `OrderDraft.visitDates` |
| `src/components/orders/SelectedServiceCard.tsx` | Full rewrite — Idea 1 layout |
| `src/components/orders/ServiceSelector.tsx` | Fix leaf node panel: remove clock/min ghost, add stepper, cleaner Add button |
| `src/components/orders/VisitDateSchedule.tsx` | **New** — time window table per day |
| `src/components/orders/VisitDatePicker.tsx` | Update to work with `VisitDateWindow[]` instead of `string[]` |
| `src/components/orders/OrderFormPanel.tsx` | Wire `VisitDateSchedule` below date picker; update `onUpdate` calls |
| `src/hooks/useCreateOrder.ts` | Update `INITIAL_DRAFT`, `submit` mutation (insert `order_visit_dates`), `isValid` |
| `src/hooks/useDateAvailability.ts` | **New** — calls `get_date_team_availability` RPC |
| `supabase/migrations/YYYYMMDDHHMMSS_order_visit_dates.sql` | New table + backfill + drop column |
| `supabase/migrations/YYYYMMDDHHMMSS_rpc_get_date_team_availability.sql` | New RPC |

---

## 7. Behaviour Contracts

- **Qty stepper min**: 1. No upper bound in UI (backend has no constraint either).
- **Time optional**: Both `fromTime` and `toTime` null → valid, stored as NULL.
- **fromTime required if toTime set**: If only one is filled, treat as incomplete — don't save partial window. Show inline validation hint.
- **"Apply to all" conflict check**: Only fires on click (not real-time). After click, conflicted rows show warning, non-conflicted rows get the window applied. Button disappears from the source row (replaced by a muted `✓`).
- **Date removal**: Removing a date chip from `VisitDatePicker` also removes its `VisitDateWindow` from the array.
- **Sort order**: Rows always displayed sorted by date ascending.
- **Drag-and-drop on service cards**: Existing DnD behaviour (drag to team calendar) is preserved — `useDraggable` hook stays on the card.

---

## 8. Out of Scope

- Real-time conflict polling (only checked on button click)
- Team-specific conflict check (checks all teams, not a selected team)
- Time window display in the orders list view
- Editing visit date windows post-creation (future task)
