# Shipments Multi-PO & Schedule Revisions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one shipment carry line items from multiple POs, make the tracking number optional (with an `SHP-#####` identifier), give ETD/ETA a full original→updated→actual revision history, and allow location-less events.

**Architecture:** New `shipment_line_items` (item-level PO contents) and `shipment_schedule_revisions` (ETD/ETA history) tables; a trigger caches current-planned + actual dates on `shipments`; an atomic `create_shipment` RPC; the single `shipments.po_id` is retired last. Frontend: pure helpers for reconciliation/schedule, a rewritten `useShipments`, and the shipments page split into focused create/list/detail components.

**Tech Stack:** Next.js 15 App Router + TypeScript, Supabase (Postgres + RLS + RPC), TanStack Query v5, shadcn/ui + Tailwind, vitest. 17track for carrier sync.

**Spec:** [docs/plans/2026-09-08-shipments-multi-po-and-schedule-design.md](2026-09-08-shipments-multi-po-and-schedule-design.md)

## Global Constraints

- **DB target:** staging `mwvblpgbgxipvrevkeff` only during this window; every migration is written to BOTH `supabase/migrations/` AND `supabase/migrations-staging/` in the same commit. new-prod apply + push are gated on operator go-ahead (§ final task).
- **Migrations are authoritative from the LIVE DB** — before writing/altering any function or status write, fetch the live body/columns; `baseline_schema.sql` and `database.types.ts` are stale.
- **After `supabase gen types` re-append** the four `DBTable`/`DBInsert`/`DBUpdate`/`AllTables` helper aliases (the CLI wipes them).
- **RLS on every new table** + at least one policy (mirror `shipments`). Revoke anon, grant authenticated.
- **Commits:** feature commits are fine locally; **never push `deploy/warehouse-shipping` without asking** (one Vercel prod build per push). Every commit carries both co-author trailers:
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **Responsive + layout-stability** rules apply to all UI (min-heights on dynamic sections; dialogs full-screen on mobile). Dropdowns show labels, never raw UUIDs. Dates use the calendar picker.
- **Verification split:** `tsc` + eslint + migration probe (rolled-back `DO` block) + `pg_proc`/column checks are done silently; golden-path UI, layout stability, and cross-flow ripples are handed to the operator. Do not commit until the operator confirms UI work.

---

## Task 1: DB migration — enums, `shipments` columns, and the two new tables

**Files:**
- Create: `supabase/migrations/<ts>_shipments_multi_po_schedule.sql`
- Create: `supabase/migrations-staging/<ts>_shipments_multi_po_schedule.sql` (byte-identical copy)

**Interfaces:**
- Produces: enums `shipment_schedule_leg('etd','eta')`, `shipment_schedule_revision_type('original','updated','actual')`; columns `shipments.shipment_number` (unique, `SHP-#####`), `shipments.etd_actual`, `shipments.eta_actual`; nullable `shipments.tracking_number` and `shipments.po_id`; tables `shipment_line_items(shipment_id, po_line_item_id, qty)`, `shipment_schedule_revisions(shipment_id, leg, revision_type, date_value, reason, created_by, created_at)`.

- [ ] **Step 1: Verify live prerequisites** — run against staging and confirm: `shipments` has `po_id NOT NULL`, `tracking_number NOT NULL`; `po_line_items(id, po_id, qty)` exist; capture `shipments` RLS to mirror:
  ```sql
  select policyname, cmd, roles, qual, with_check from pg_policies where tablename='shipments';
  ```
  Record the output; Step 6 replicates it.

- [ ] **Step 2: Write the schema migration** (exact SQL — the numbering trigger is self-contained; if the repo already has a shared number generator used by `po_number`, call that instead):

```sql
BEGIN;

CREATE TYPE public.shipment_schedule_leg AS ENUM ('etd','eta');
CREATE TYPE public.shipment_schedule_revision_type AS ENUM ('original','updated','actual');

-- ── shipments: SHP number, nullable tracking/po_id, cached actual dates ──
CREATE SEQUENCE IF NOT EXISTS public.shipment_number_seq;
ALTER TABLE public.shipments ADD COLUMN shipment_number text;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM public.shipments
)
UPDATE public.shipments s
   SET shipment_number = 'SHP-' || lpad(o.rn::text, 5, '0')
  FROM ordered o WHERE o.id = s.id;

SELECT setval('public.shipment_number_seq', GREATEST((SELECT count(*) FROM public.shipments), 1));

ALTER TABLE public.shipments ALTER COLUMN shipment_number SET NOT NULL;
ALTER TABLE public.shipments ADD CONSTRAINT shipments_shipment_number_key UNIQUE (shipment_number);

CREATE OR REPLACE FUNCTION public.assign_shipment_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.shipment_number IS NULL THEN
    NEW.shipment_number := 'SHP-' || lpad(nextval('public.shipment_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_assign_shipment_number
  BEFORE INSERT ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.assign_shipment_number();

ALTER TABLE public.shipments ALTER COLUMN tracking_number DROP NOT NULL;
ALTER TABLE public.shipments ALTER COLUMN po_id DROP NOT NULL;  -- fully dropped in Task 14, after every po_id consumer is repointed
ALTER TABLE public.shipments ADD COLUMN etd_actual date, ADD COLUMN eta_actual date;

-- ── shipment_line_items ──
CREATE TABLE public.shipment_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  po_line_item_id uuid NOT NULL REFERENCES public.po_line_items(id) ON DELETE CASCADE,
  qty integer NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, po_line_item_id)
);
CREATE INDEX idx_shipment_line_items_shipment ON public.shipment_line_items(shipment_id);
CREATE INDEX idx_shipment_line_items_po_line  ON public.shipment_line_items(po_line_item_id);
ALTER TABLE public.shipment_line_items ENABLE ROW LEVEL SECURITY;

-- ── shipment_schedule_revisions ──
CREATE TABLE public.shipment_schedule_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  leg public.shipment_schedule_leg NOT NULL,
  revision_type public.shipment_schedule_revision_type NOT NULL,
  date_value date NOT NULL,
  reason text,
  created_by uuid REFERENCES public.user_data(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_schedule_original ON public.shipment_schedule_revisions(shipment_id, leg) WHERE revision_type='original';
CREATE UNIQUE INDEX uq_schedule_actual   ON public.shipment_schedule_revisions(shipment_id, leg) WHERE revision_type='actual';
CREATE INDEX idx_schedule_shipment_leg   ON public.shipment_schedule_revisions(shipment_id, leg, created_at);
ALTER TABLE public.shipment_schedule_revisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.shipment_line_items, public.shipment_schedule_revisions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipment_line_items, public.shipment_schedule_revisions TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
```

- [ ] **Step 3: Add the RLS policies** in the same migration, replicating what Step 1 captured from `shipments`. If `shipments` policies are simply `USING (true)` for `authenticated`, use the concrete default below; if they are division-scoped, mirror that qual joined through `shipment_id → shipments`:

```sql
-- default (only if shipments' policies are authenticated USING(true))
CREATE POLICY sli_authenticated_all ON public.shipment_line_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY ssr_authenticated_all ON public.shipment_schedule_revisions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

- [ ] **Step 4: Apply to staging** — `npx supabase db push`; confirm "Remote database is up to date" on a dry-run rerun.

- [ ] **Step 5: Probe the schema** (silent verification):
  ```sql
  \d public.shipment_line_items
  \d public.shipment_schedule_revisions
  select column_name,is_nullable from information_schema.columns
    where table_name='shipments' and column_name in ('shipment_number','tracking_number','po_id','etd_actual','eta_actual');
  select relrowsecurity from pg_class where relname in ('shipment_line_items','shipment_schedule_revisions');
  select shipment_number from public.shipments order by created_at; -- SHP-00001..SHP-00007
  ```
  Expected: both tables have `relrowsecurity=t`; `shipment_number NOT NULL`, `tracking_number`/`po_id` nullable; 7 rows numbered.

- [ ] **Step 6: Mirror to `migrations-staging/` and commit** the two identical files.

```bash
git add supabase/migrations/<ts>_shipments_multi_po_schedule.sql supabase/migrations-staging/<ts>_shipments_multi_po_schedule.sql
git commit  # feat(db): shipments multi-PO + schedule tables (see trailers)
```

---

## Task 2: Schedule-sync trigger — cache current-planned + actual onto `shipments`

**Files:**
- Create: `supabase/migrations/<ts>_shipment_schedule_sync.sql` (+ staging mirror)

**Interfaces:**
- Produces: trigger `trg_shipment_schedule_sync` on `shipment_schedule_revisions` that, after INSERT/UPDATE/DELETE, recomputes for the affected `shipment_id`: `shipments.etd`/`eta` = newest (`created_at`) revision of that leg where `revision_type IN ('original','updated')`; `shipments.etd_actual`/`eta_actual` = the `actual` revision's `date_value` (or NULL).

- [ ] **Step 1: Write the trigger function + trigger:**

```sql
BEGIN;
CREATE OR REPLACE FUNCTION public.sync_shipment_schedule_cache(p_shipment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.shipments s SET
    etd = (SELECT date_value FROM public.shipment_schedule_revisions r
           WHERE r.shipment_id=p_shipment_id AND r.leg='etd' AND r.revision_type IN ('original','updated')
           ORDER BY r.created_at DESC LIMIT 1),
    eta = (SELECT date_value FROM public.shipment_schedule_revisions r
           WHERE r.shipment_id=p_shipment_id AND r.leg='eta' AND r.revision_type IN ('original','updated')
           ORDER BY r.created_at DESC LIMIT 1),
    etd_actual = (SELECT date_value FROM public.shipment_schedule_revisions r
                  WHERE r.shipment_id=p_shipment_id AND r.leg='etd' AND r.revision_type='actual' LIMIT 1),
    eta_actual = (SELECT date_value FROM public.shipment_schedule_revisions r
                  WHERE r.shipment_id=p_shipment_id AND r.leg='eta' AND r.revision_type='actual' LIMIT 1),
    updated_at = now()
  WHERE s.id = p_shipment_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_shipment_schedule_sync_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.sync_shipment_schedule_cache(COALESCE(NEW.shipment_id, OLD.shipment_id));
  RETURN NULL;
END $$;

CREATE TRIGGER trg_shipment_schedule_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.shipment_schedule_revisions
  FOR EACH ROW EXECUTE FUNCTION public.trg_shipment_schedule_sync_fn();
COMMIT;
```

- [ ] **Step 2: Prove the write path with a rolled-back probe** (silent):
  ```sql
  DO $$
  DECLARE v_id uuid;
  BEGIN
    SELECT id INTO v_id FROM public.shipments ORDER BY created_at LIMIT 1;
    INSERT INTO public.shipment_schedule_revisions(shipment_id,leg,revision_type,date_value)
      VALUES (v_id,'etd','original','2026-01-01'),(v_id,'etd','updated','2026-02-01');
    ASSERT (SELECT etd FROM public.shipments WHERE id=v_id) = '2026-02-01', 'current planned should be the updated date';
    INSERT INTO public.shipment_schedule_revisions(shipment_id,leg,revision_type,date_value)
      VALUES (v_id,'etd','actual','2026-02-05');
    ASSERT (SELECT etd_actual FROM public.shipments WHERE id=v_id) = '2026-02-05', 'actual should cache';
    RAISE EXCEPTION 'rollback probe';  -- abort, no data kept
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'probe ok: %', SQLERRM;
  END $$;
  ```
  Expected: `probe ok: rollback probe` (both ASSERTs passed before the deliberate abort).

- [ ] **Step 3: Apply to staging, mirror, commit.**

---

## Task 3: `create_shipment` RPC (atomic shipment + lines + ETD original)

**Files:**
- Create: `supabase/migrations/<ts>_create_shipment_rpc.sql` (+ staging mirror)

**Interfaces:**
- Produces: `create_shipment(p_mode text, p_tracking_number text, p_carrier text, p_lines jsonb, p_etd_original date, p_etd_reason text) RETURNS public.shipments`. `p_lines` = `[{ "po_line_item_id": uuid, "qty": int }, …]`. Inserts the shipment (number via trigger), one `shipment_line_items` row per element, and — when `p_etd_original` is provided — an `('etd','original')` revision authored by `auth.uid()`.

- [ ] **Step 1: Write the RPC** (SECURITY DEFINER, authenticated; raises on empty lines):

```sql
BEGIN;
CREATE OR REPLACE FUNCTION public.create_shipment(
  p_mode text, p_tracking_number text DEFAULT NULL, p_carrier text DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb, p_etd_original date DEFAULT NULL, p_etd_reason text DEFAULT NULL
) RETURNS public.shipments LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ship public.shipments; v_line jsonb;
BEGIN
  IF jsonb_array_length(COALESCE(p_lines,'[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'A shipment needs at least one PO line';
  END IF;
  INSERT INTO public.shipments(mode, tracking_number, carrier, status, events, archived)
    VALUES (p_mode::public.shipment_mode, NULLIF(p_tracking_number,''), p_carrier, 'booked', '[]'::jsonb, false)
    RETURNING * INTO v_ship;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.shipment_line_items(shipment_id, po_line_item_id, qty)
      VALUES (v_ship.id, (v_line->>'po_line_item_id')::uuid, (v_line->>'qty')::int);
  END LOOP;
  IF p_etd_original IS NOT NULL THEN
    INSERT INTO public.shipment_schedule_revisions(shipment_id, leg, revision_type, date_value, reason, created_by)
      VALUES (v_ship.id, 'etd', 'original', p_etd_original, p_etd_reason, auth.uid());
    SELECT * INTO v_ship FROM public.shipments WHERE id = v_ship.id;  -- re-read cached etd
  END IF;
  RETURN v_ship;
END $$;
REVOKE ALL ON FUNCTION public.create_shipment(text,text,text,jsonb,date,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_shipment(text,text,text,jsonb,date,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
```

- [ ] **Step 2: Rolled-back probe** — call `create_shipment` with 2 lines + an ETD original, assert a shipment row, 2 `shipment_line_items`, 1 revision, and `shipments.etd = p_etd_original`; then `RAISE EXCEPTION` to roll back. Also assert the empty-lines path raises.

- [ ] **Step 3: Apply to staging, mirror, commit.**

---

## Task 4: Backfill existing shipments (lines + ETD original)

**Files:**
- Create: `supabase/migrations/<ts>_shipments_backfill.sql` (+ staging mirror)

**Interfaces:**
- Consumes: `shipments.po_id` (still present), `po_line_items`, `purchase_orders.expected_delivery`.
- Produces: one `shipment_line_items` row per PO line for each existing shipment (whole PO); one `('etd','original')` revision per shipment that has a source date.

- [ ] **Step 1: Write the backfill** (idempotent — guarded by `NOT EXISTS`):

```sql
BEGIN;
INSERT INTO public.shipment_line_items(shipment_id, po_line_item_id, qty)
SELECT s.id, pli.id, pli.qty
  FROM public.shipments s
  JOIN public.po_line_items pli ON pli.po_id = s.po_id
 WHERE s.po_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.shipment_line_items x
                    WHERE x.shipment_id=s.id AND x.po_line_item_id=pli.id);

INSERT INTO public.shipment_schedule_revisions(shipment_id, leg, revision_type, date_value)
SELECT s.id, 'etd', 'original', COALESCE(s.etd, po.expected_delivery)
  FROM public.shipments s
  LEFT JOIN public.purchase_orders po ON po.id = s.po_id
 WHERE COALESCE(s.etd, po.expected_delivery) IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.shipment_schedule_revisions r
                    WHERE r.shipment_id=s.id AND r.leg='etd' AND r.revision_type='original');
COMMIT;
```

- [ ] **Step 2: Verify on staging** — every shipment with a PO has ≥1 line; shipments with a source date have an ETD original and a cached `shipments.etd`:
  ```sql
  select s.shipment_number, count(sli.*) lines, s.etd
    from public.shipments s left join public.shipment_line_items sli on sli.shipment_id=s.id
   group by s.id order by s.created_at;
  ```

- [ ] **Step 3: Mirror + commit.**

---

## Task 5: Regenerate `database.types.ts`

**Files:**
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1:** `npx supabase gen types typescript --linked > src/lib/database.types.ts` (confirm path matches the repo's existing types file).
- [ ] **Step 2:** Re-append the four helper aliases (`DBTable`, `DBInsert`, `DBUpdate`, `AllTables`) the CLI wipes — copy them from the previous version.
- [ ] **Step 3:** `npx tsc --noEmit` — expect no new errors from the regen. Commit `chore(types): regenerate for shipment tables`.

## Task 6: Pure helpers — reconciliation + schedule resolvers (TDD)

**Files:**
- Create: `src/lib/shipments/reconciliation.ts`, `src/lib/shipments/schedule.ts`
- Test: `src/lib/shipments/reconciliation.test.ts`, `src/lib/shipments/schedule.test.ts`

**Interfaces:**
- Produces: `remainingUnshipped(poLineQty, alreadyShipped): number`; `exceedsRemaining(newQty, poLineQty, alreadyShippedElsewhere): boolean`; `currentPlanned(revs, leg): string|null`; `actualDate(revs, leg): string|null`; `legHistory(revs, leg): ScheduleRevision[]`. Types `Leg='etd'|'eta'`, `RevisionType='original'|'updated'|'actual'`, `ScheduleRevision`.

- [ ] **Step 1: Write the failing tests** (`schedule.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { currentPlanned, actualDate, legHistory, type ScheduleRevision } from './schedule'

const revs: ScheduleRevision[] = [
  { leg:'etd', revision_type:'original', date_value:'2026-08-20', created_at:'2026-08-01T10:00:00Z' },
  { leg:'etd', revision_type:'updated',  date_value:'2026-08-24', created_at:'2026-08-19T09:00:00Z' },
  { leg:'etd', revision_type:'actual',   date_value:'2026-08-25', created_at:'2026-08-25T20:00:00Z' },
  { leg:'eta', revision_type:'original', date_value:'2026-09-10', created_at:'2026-08-01T10:00:00Z' },
]
describe('schedule', () => {
  it('current planned = newest non-actual', () => {
    expect(currentPlanned(revs,'etd')).toBe('2026-08-24')
    expect(currentPlanned(revs,'eta')).toBe('2026-09-10')
    expect(currentPlanned([], 'etd')).toBeNull()
  })
  it('actual is the actual row', () => {
    expect(actualDate(revs,'etd')).toBe('2026-08-25')
    expect(actualDate(revs,'eta')).toBeNull()
  })
  it('legHistory is chronological', () => {
    expect(legHistory(revs,'etd').map(r=>r.revision_type)).toEqual(['original','updated','actual'])
  })
})
```

  And `reconciliation.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { remainingUnshipped, exceedsRemaining } from './reconciliation'
describe('reconciliation', () => {
  it('remaining never negative', () => {
    expect(remainingUnshipped(10, 4)).toBe(6)
    expect(remainingUnshipped(10, 15)).toBe(0)
  })
  it('exceeds when new qty beats the remainder elsewhere', () => {
    expect(exceedsRemaining(14, 12, 0)).toBe(true)
    expect(exceedsRemaining(6, 10, 4)).toBe(false)   // 6 == remainder 6, not exceeding
    expect(exceedsRemaining(7, 10, 4)).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/lib/shipments`) — modules not found.

- [ ] **Step 3: Implement** `schedule.ts`:
```ts
export type Leg = 'etd' | 'eta'
export type RevisionType = 'original' | 'updated' | 'actual'
export interface ScheduleRevision { leg: Leg; revision_type: RevisionType; date_value: string; created_at: string; reason?: string | null }
const RT_ORDER: Record<RevisionType, number> = { original: 0, updated: 1, actual: 2 }

export function currentPlanned(revs: ScheduleRevision[], leg: Leg): string | null {
  const planned = revs.filter(r => r.leg === leg && r.revision_type !== 'actual')
  if (!planned.length) return null
  return planned.reduce((a, b) => (a.created_at >= b.created_at ? a : b)).date_value
}
export function actualDate(revs: ScheduleRevision[], leg: Leg): string | null {
  return revs.find(r => r.leg === leg && r.revision_type === 'actual')?.date_value ?? null
}
export function legHistory(revs: ScheduleRevision[], leg: Leg): ScheduleRevision[] {
  return revs.filter(r => r.leg === leg).sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : RT_ORDER[a.revision_type] - RT_ORDER[b.revision_type])
}
```
  And `reconciliation.ts`:
```ts
export function remainingUnshipped(poLineQty: number, alreadyShipped: number): number {
  return Math.max(0, poLineQty - alreadyShipped)
}
export function exceedsRemaining(newQty: number, poLineQty: number, alreadyShippedElsewhere: number): boolean {
  return newQty > poLineQty - alreadyShippedElsewhere
}
```

- [ ] **Step 4: Run — expect PASS.** Commit `feat(shipments): schedule + reconciliation helpers`.

---

## Task 7: Rewrite `useShipments.ts`

**Files:**
- Modify: `src/hooks/useShipments.ts` (full rewrite of types + hooks)

**Interfaces:**
- Produces: types `ShipmentEvent` (adds `title`, optional `location`), `ShipmentLine`, `Shipment` (adds `shipment_number`, `etd_actual`, `eta_actual`; **removes `po_id`**; keeps `etd`/`eta` as current-planned), `ShipmentDetail` (shipment + `lines` grouped-able + `schedule_revisions`). Hooks: `useShipments`, `useShipmentDetail(id)`, `useCreateShipment` (RPC), `useAddShipmentLines`, `useUpdateShipmentLineQty`, `useRemoveShipmentLine`, `useAddScheduleRevision`, `useAddShipmentEvent`, `useUpdateShipmentStatus`, `useDeleteShipment`.

- [ ] **Step 1: Types** — replace the current `Shipment` type. `ShipmentEvent = { date; title; location?; status?; notes?; normalizedTimestamp?; hash? }`. Add:
```ts
export type ShipmentLine = {
  id: string; po_line_item_id: string; qty: number
  po_id: string; po_number: string; supplier_name: string | null
  item_name: string; sku: string | null; po_qty: number
}
```

- [ ] **Step 2: List query** — `useShipments` selects shipments + nested lines→PO, deriving distinct POs client-side:
```ts
.from('shipments')
.select(`id, shipment_number, tracking_number, mode, carrier, status, etd, eta, etd_actual, eta_actual, events, archived, is_syncing, last_synced_at, sync_error, created_at,
  shipment_line_items( id, qty, po_line_items( id, po_id, item_name, sku, qty, purchase_orders( po_number, supplier_name ) ) )`)
.eq('archived', archived).order('created_at', { ascending: false })
```
  Map each row to `{ …shipment, pos: [{ po_number, supplier_name }], lineCount }` (distinct by `po_id`). Search filters `shipment_number,tracking_number,carrier` ilike, plus a client filter on PO number.

- [ ] **Step 3: `useShipmentDetail(id)`** — same select but for one id, plus `shipment_schedule_revisions(leg,revision_type,date_value,reason,created_at)` ordered by `created_at`. Return `{ shipment, lines: ShipmentLine[], revisions }`. Enabled only when `id` is set.

- [ ] **Step 4: `useCreateShipment`** — calls the RPC:
```ts
await supabase.rpc('create_shipment', {
  p_mode, p_tracking_number: trackingNumber || null, p_carrier: carrier || null,
  p_lines: lines,               // [{ po_line_item_id, qty }]
  p_etd_original: etdOriginal || null, p_etd_reason: etdReason || null,
} as never)
```
  On success, invalidate `queryKeys.shipments.all`. If `trackingNumber` present, keep the existing auto-register `fetch('/api/shipments/register-tracking', …)` (moved into `onSuccess`).

- [ ] **Step 5: Line + schedule + event mutations** — `useAddShipmentLines({ shipment_id, lines })` inserts `shipment_line_items`; `useUpdateShipmentLineQty({ id, qty })`; `useRemoveShipmentLine(id)`; `useAddScheduleRevision({ shipment_id, leg, revision_type, date_value, reason })` inserts a revision (the trigger updates the cached dates); `useAddShipmentEvent` unchanged except the event object now carries `title` and optional `location`. All invalidate `queryKeys.shipments.all` + the detail key (add `queryKeys.shipments.detail(id)` to `queryKeys`).

- [ ] **Step 6: `tsc --noEmit`** clean. Commit `feat(shipments): multi-PO + schedule hooks`. (No UI yet — the page still imports old names, so also stub the page compile by updating imports in Task 9; if `tsc` blocks, land Tasks 7–9 in one commit.)

---

## Task 8: Create Shipment dialog

**Files:**
- Create: `src/components/purchase/shipments/CreateShipmentDialog.tsx`
- Modify: `src/app/(dashboard)/purchase/shipments/page.tsx` (import the extracted dialog)

**Interfaces:**
- Consumes: `useCreateShipment`, `usePurchaseOrders`, `useInventoryBrandVariants`-style PO-line fetch (`po_line_items` by `po_id`), `remainingUnshipped`/`exceedsRemaining`.
- Produces: `<CreateShipmentDialog open onOpenChange />`.

- [ ] **Step 1: Build the dialog** per the mockup surface ②:
  - Fields: Mode (`Select`, the 4 modes), Tracking number (`Input`, **optional** — placeholder "Leave blank if none"), ETD — original (calendar `DatePicker`), Note (optional `Input`).
  - **Multi-PO picker:** a PO `Select` (approved / partially_received POs, label = `po_number — supplier`); adding a PO fetches its `po_line_items` and appends a PO block. Each line row: item name + sku/division, a qty `Input` (default = `remainingUnshipped(po_qty, shippedElsewhere)`; fetch shipped-elsewhere via a lightweight sum query per line, or default to `po_qty` when not fetched), and an "of {po_qty}" hint. A **Whole PO / Clear** toggle sets every line to its remainder / 0. Lines with `exceedsRemaining(...)` show the amber warning row (soft — never blocks). Lines with qty 0 are excluded from submit.
  - Footer summary: "N whole PO · M partial · T units".
  - Submit → `useCreateShipment.mutate({ mode, trackingNumber, carrier:null, lines: nonZeroLines, etdOriginal, etdReason })`.
- [ ] **Step 2:** Layout stability — reserve min-height on the PO-blocks area; dialog `w-full h-full rounded-none sm:max-w-lg sm:rounded-lg`. Dropdowns show `po_number — supplier`, never ids.
- [ ] **Step 3:** `tsc`/eslint clean. Operator smoke deferred to the close-out task. Commit `feat(shipments): create dialog with multi-PO picker`.

---

## Task 9: Shipments list

**Files:**
- Modify: `src/app/(dashboard)/purchase/shipments/page.tsx`

- [ ] **Step 1:** Rewrite columns to: **Shipment** (`shipment_number` mono bold + tracking mono muted, or "no tracking"), **Purchase orders** (first PO number + `+N` + first supplier), **Mode** (`ModeBadge`), **Status** (`StatusBadge`), **ETD** (`currentPlanned` date + a red "+Xd vs plan" chip when `etd_actual`/updated drifted past original — compute from the row's cached `etd`/`etd_actual`), **Events** (count). Search box placeholder "Search shipment #, tracking, PO…".
- [ ] **Step 2:** Mobile card render mirrors the columns (shipment #, PO summary, status, event count). Keep the `PageHeader` "Create Shipment" action.
- [ ] **Step 3:** `tsc`/eslint clean. Commit `feat(shipments): SHP-number list with PO rollup + ETD slip`.

---

## Task 10: Detail dialog shell + Purchase Orders section

**Files:**
- Create: `src/components/purchase/shipments/ShipmentDetailDialog.tsx`, `src/components/purchase/shipments/ShipmentPoSection.tsx`
- Modify: `src/app/(dashboard)/purchase/shipments/page.tsx`

**Interfaces:**
- Consumes: `useShipmentDetail(id)`, `useUpdateShipmentStatus`, `useDeleteShipment`, line mutations.
- Produces: `<ShipmentDetailDialog shipmentId onClose />`; `<ShipmentPoSection lines addLine removeLine updateQty />`.

- [ ] **Step 1:** Dialog shell — header shows `shipment_number` (mono), `StatusBadge`, mode/carrier/tracking (sync bar rendered **only when `tracking_number` present**). Footer: Update Status dropdown, Delete (deregisters tracking only if present).
- [ ] **Step 2:** `ShipmentPoSection` — group `lines` by `po_id`; per group a header (`po_number` + supplier + Whole/Partial badge derived from whether every line == its `po_qty` and all lines present) and item rows (`item_name` · sku, `qty` **of** `po_qty`). Inline "Add PO" / edit-qty / remove-line, soft-reconciliation warning as in Task 8.
- [ ] **Step 3:** `tsc`/eslint clean. Commit `feat(shipments): detail dialog + PO/items section`.

## Task 11: Detail — Schedule section (ETD/ETA revisions)

**Files:**
- Create: `src/components/purchase/shipments/ShipmentScheduleSection.tsx`
- Modify: `src/components/purchase/shipments/ShipmentDetailDialog.tsx` (mount the section)

**Interfaces:**
- Consumes: `legHistory`, `currentPlanned`, `actualDate` (Task 6), `useAddScheduleRevision` (Task 7), the detail's `revisions`.
- Produces: `<ShipmentScheduleSection shipmentId revisions />`.

- [ ] **Step 1:** For each leg (`etd`, `eta`) render a row: leg label + a horizontal strip of `legHistory(revisions, leg)` steps (`original`, each `updated`, `actual`) — each step shows its type label, `date_value`, and `reason` when present; the current-planned step gets the accent tint, the `actual` step the success tint (mirror the mockup's Schedule strip). When a leg has no revisions, show a muted "No ETD/ETA set yet".
- [ ] **Step 2:** "Add revision" control per leg → inline form: `revision_type` `Select` (original disabled if one exists; actual disabled if one exists), a calendar `DatePicker` for `date_value`, optional `reason` `Input` → `useAddScheduleRevision.mutate({ shipment_id, leg, revision_type, date_value, reason })`. The DB partial-unique indexes are the backstop; the UI just avoids offering a duplicate original/actual.
- [ ] **Step 3:** Layout stability — fixed min-height on the strip; `tsc`/eslint clean. Commit `feat(shipments): schedule revision history section`.

---

## Task 12: Detail — Events section (title + optional location)

**Files:**
- Create: `src/components/purchase/shipments/ShipmentEventsSection.tsx`
- Modify: `src/components/purchase/shipments/ShipmentDetailDialog.tsx`

**Interfaces:**
- Consumes: `useAddShipmentEvent` (Task 7), the shipment's `events`, the 17track sync handler.
- Produces: `<ShipmentEventsSection shipment />`.

- [ ] **Step 1:** Timeline (newest first by `normalizedTimestamp ?? date`): each event renders `title` as the headline (fallback `location || status || '—'` for pre-`title` events), the `status` chip when present, `location` on a secondary line **only when present**, the formatted date/time, and `notes`. The first event gets the accent dot.
- [ ] **Step 2:** "Add Event" form — **`title` required**; `location`, `status`, `notes` **optional** (this is the key change from the current location-required form). Date via calendar picker. Submit appends `{ date, title, location, status, notes }` via `useAddShipmentEvent`.
- [ ] **Step 3:** "Sync Now" + the ambiguous-carrier picker render **only when `shipment.tracking_number` is present** (guard the whole sync bar). `tsc`/eslint clean. Commit `feat(shipments): freeform events (title + optional location)`.

---

## Task 13: Notifications to all PO owners + 17track optional-tracking guard

**Files:**
- Modify: `src/hooks/useShipments.ts` (`useUpdateShipmentStatus`)
- Modify: `src/app/(dashboard)/purchase/shipments/page.tsx` / `CreateShipmentDialog.tsx` (register guard)
- Check: `src/app/api/shipments/register-tracking/route.ts` (no-op cleanly on missing tracking)

- [ ] **Step 1:** In `useUpdateShipmentStatus.onSuccess`, when status becomes `delayed`/`customs`, resolve **all** linked PO owners: query the shipment's lines → `po_line_items.po_id` → `purchase_orders(created_by, po_number)`, dedupe `created_by`, and `notifyOwnerAndKey(owner, 'notify.purchase.shipment_delayed', 'shipment_delayed', …)` per distinct owner (best-effort, as today). Message names the shipment number and the affected PO numbers.
- [ ] **Step 2:** Only call `/api/shipments/register-tracking` (create + Sync Now) when a tracking number exists. Confirm the route returns a clean `{ ok:false, error }` (not a 500) if invoked without one.
- [ ] **Step 3:** `tsc`/eslint clean. Commit `feat(shipments): notify all PO owners; guard 17track when tracking absent`.

---

## Task 14: Repoint remaining `po_id` consumers, then drop the column

**Files:**
- Modify: any file still reading `shipments.po_id` (grep first)
- Create: `supabase/migrations/<ts>_shipments_drop_po_id.sql` (+ staging mirror)

- [ ] **Step 1:** `grep -rn "shipments" src | grep -i po_id` and audit each hit (earlier scan flagged `ReceivalFormDialog.tsx`, `SoDetailDialog.tsx`, plus the notify already handled). Repoint every reader to `shipment_line_items` / the derived PO set. If a consumer only needs "the shipment's PO(s)", expose a helper `shipmentPoIds(lines)` from `src/lib/shipments/`.
- [ ] **Step 2:** Once no source references `shipments.po_id`, write the drop migration:
```sql
BEGIN;
ALTER TABLE public.shipments DROP COLUMN po_id;
NOTIFY pgrst, 'reload schema';
COMMIT;
```
- [ ] **Step 3:** Apply to staging, regenerate `database.types.ts` (+ re-append helpers), `tsc` clean, mirror + commit `refactor(db): drop shipments.po_id (superseded by shipment_line_items)`.

---

## Task 15: Close-out — registry, security audit, docs, smoke, rollout

**Files:**
- Modify: `docs/flows-registry.md`, `PROGRESS.md`, `EOD/EOD-<date>.md`

- [ ] **Step 1: Flow registry** — add/revise entries: `Create Shipment (multi-PO)`, `Add Shipment Schedule Revision`, `Add Shipment Event`, `Update Shipment Status (notify PO owners)`; mark the old single-PO create deprecated. Cross-link with `[[…]]`.
- [ ] **Step 2: Security audit** — append a `## 🔒 Security Audit Log` row: Secrets ✅ (none), RLS ✅ (both new tables + policies mirror shipments), Auth gate ✅ (SECURITY DEFINER RPCs / authenticated client; 17track route already guards its own secret), Error handling ✅ (`humanizeDbError`; 17track best-effort), Layout stability ✅ (min-heights on PO/schedule/event sections).
- [ ] **Step 3: Operator smoke on staging** (hand to operator) — the §12 checklist from the spec: multi-PO create (whole + partial); tracking-less shipment gets `SHP-`, no sync bar; ETD updated→actual reflects in list + slip chip; location-free event; delete deregisters tracking; the 7 backfilled shipments show items + ETD original.
- [ ] **Step 4:** Update `PROGRESS.md` (Completed entry + Security row) and today's `EOD`. Commit docs separately.
- [ ] **Step 5: Rollout (gated):** after operator sign-off, apply all migrations to **new-prod** via the established `psql`/`db push` path (verify objects present), then **ask before** pushing `deploy/warehouse-shipping` (one Vercel prod build).

---

## Self-Review

**Spec coverage** — every spec section maps to a task: §4.1 shipments cols → T1; §4.2 line items → T1; §4.3 revisions → T1+T2; §4.4 events → T7(type)+T12(UI); §4.5 enums → T1; §4.6 RLS → T1; §5 migration/backfill → T1+T4; §5.2 soft reconciliation → T6+T8+T10; §6 RPC/hooks/consumer-repoint → T3+T7+T14; §7 UI → T8–T12; §8 17track optional → T13; §9 notify all owners → T13; §10 registry → T15; §11 security → T15; §12 test plan → per-task + T15; §13 rollout → T15. No gaps.

**Type consistency** — `ScheduleRevision` (T6) is the shape consumed by `useShipmentDetail` (T7) and `ShipmentScheduleSection` (T11). `ShipmentLine` (T7) feeds `ShipmentPoSection` (T10). `create_shipment(p_mode,p_tracking_number,p_carrier,p_lines,p_etd_original,p_etd_reason)` (T3) matches the `useCreateShipment` call (T7). `remainingUnshipped`/`exceedsRemaining` (T6) used identically in T8 + T10.

**Placeholder scan** — no TBD/TODO; RLS policy step carries a concrete default + the "mirror shipments" instruction; the `<ts>` in migration filenames is the standard timestamp placeholder, not a content gap.

---

## Execution options

Plan complete. Two ways to execute:

1. **Subagent-Driven (recommended)** — a fresh subagent per task with review between tasks (uses `superpowers:subagent-driven-development`). Best for keeping each task's context clean and reviewing before moving on.
2. **Inline** — execute tasks in this session with checkpoints (uses `superpowers:executing-plans`).

Given this project's gates (staging-first migrations, operator smoke, ask-before-push), I'd run it inline with a checkpoint after the DB layer (Tasks 1–5) and again after the UI (Tasks 8–12) — but your call.
