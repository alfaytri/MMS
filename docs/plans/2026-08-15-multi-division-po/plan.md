# Multi-Division Purchase Order (Phase 1) — Implementation Plan

> **For agentic workers:** implement task-by-task. Steps use `- [ ]` checkboxes. Each task ends with an independently verifiable deliverable. This project has **no unit-test runner** — "tests" are: `npx tsc --noEmit`, `npx supabase db push`, live-schema re-reads, rolled-back `DO`-block write-path probes via `psql`, and operator/browser smoke. Follow that idiom, not pytest.

**Goal:** Let one Purchase Order hold line items belonging to different divisions (same supplier, one approval), received per-item into the correct division's stock.

**Architecture:** Move division from the PO header to the **line** (`po_line_items.division_id`), denormalize the set onto the header (`purchase_orders.division_ids uuid[]`, kept current by an `AFTER` trigger on `po_line_items`), and switch PO RLS to array-aware visibility (`is_any_division_visible(division_ids) OR is_division_visible(division_id)`). The create RPC accepts + validates per-line division. Approval is unchanged (amount-tier). Design: [design.md](./design.md).

**Tech Stack:** Next.js 15 (App Router) + TS, TanStack Query v5, Supabase Postgres (RLS), shadcn/ui.

## Global Constraints

- Migrations → **staging** (`mwvblpgbgxipvrevkeff`) via `npx supabase db push`; **mirror every `.sql` into `supabase/migrations-staging/`** in the same commit. New-prod (`optishfnnctrhffpoywg`) only on explicit operator confirmation.
- Migration timestamps must be **> `20260823000100`** (latest applied). Use the `20260824*` series in order.
- Before any `CREATE OR REPLACE`, fetch the live body via `pg_get_functiondef`; after apply, re-read to confirm; prove write paths with a **rolled-back `DO` block**. `psql` = `"/c/Program Files/PostgreSQL/18/bin/psql.exe"`; staging conn: `PGPASSWORD='Alfaytri@123'` + `host=db.mwvblpgbgxipvrevkeff.supabase.co port=5432 user=postgres dbname=postgres sslmode=require`.
- `npx tsc --noEmit` + `npx eslint <changed files>` must be clean. **Never run `next build`** unless the operator asks.
- Dropdowns show human-readable labels, never UUIDs. Number inputs, layout-stability, and responsive rules per `AGENTS.md`.
- Commit messages carry both co-author trailers. **Do not commit code until the operator confirms it works** (migrations are still applied to staging to test).
- Update `docs/flows-registry.md` "Create Purchase Order" entry in the same commit as the create-RPC change.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20260824000000_po_line_division.sql` | `po_line_items.division_id` + `purchase_orders.division_ids` + backfill + recompute trigger | 1 |
| `supabase/migrations/20260824000100_po_multidivision_rls.sql` | `is_any_division_visible(uuid[])` + repoint 4 PO policies | 2 |
| `supabase/migrations/20260824000200_rpc_create_po_line_division.sql` | per-line division in `rpc_create_purchase_order` | 3 |
| `src/types/database.types.ts` | typed new columns | 4 |
| `src/hooks/useCascadeAccessibleItems.ts` | optional `divisionId` param | 5 |
| `src/components/purchase/CascadeInventorySelector.tsx` | filter by a passed division | 5 |
| `src/components/purchase/PoLineItemsEditor.tsx` | per-line Division column + `LineItemRow.division_id` | 6 |
| `src/app/(dashboard)/purchase/create-po/page.tsx` | per-line payload + validation; header picker → default-for-new-lines | 6 |
| `src/hooks/usePurchaseOrders.ts` | `CreatePOPayload`/`LineItem` types gain `division_id` | 6 |
| `src/app/(dashboard)/purchase/orders/page.tsx` + PO detail/sidebar | division badges | 7 |
| `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx` | per-line division on edit | 8 |
| receiving surface (`purchase/receivals` create) | show line division + soft warning | 9 |

---

### Task 1: DB — per-line division column, header set, backfill, recompute trigger

**Files:** Create `supabase/migrations/20260824000000_po_line_division.sql` (+ mirror to `supabase/migrations-staging/`).

**Produces:** `po_line_items.division_id uuid`, `purchase_orders.division_ids uuid[] NOT NULL DEFAULT '{}'`, trigger `trg_po_recompute_division_ids` on `po_line_items`.

- [ ] **Step 1: Write the migration**

```sql
-- Multi-division PO (Phase 1) — per-line division + denormalized header set.
BEGIN;

ALTER TABLE public.po_line_items
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS division_ids uuid[] NOT NULL DEFAULT '{}';

-- Backfill existing lines from their PO's header division.
UPDATE public.po_line_items li
  SET division_id = po.division_id
  FROM public.purchase_orders po
  WHERE li.po_id = po.id AND li.division_id IS NULL AND po.division_id IS NOT NULL;

-- Backfill the header set = distinct non-null line divisions.
UPDATE public.purchase_orders po
  SET division_ids = COALESCE(
    (SELECT array_agg(DISTINCT li.division_id)
       FROM public.po_line_items li
      WHERE li.po_id = po.id AND li.division_id IS NOT NULL),
    '{}');

CREATE INDEX IF NOT EXISTS po_line_items_division_id_idx
  ON public.po_line_items(division_id) WHERE division_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_orders_division_ids_gin
  ON public.purchase_orders USING gin(division_ids);

-- Keep purchase_orders.division_ids in sync whenever a PO's lines change
-- (the create RPC also sets it directly; this covers direct edits).
CREATE OR REPLACE FUNCTION public.trg_po_recompute_division_ids()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_po uuid := COALESCE(NEW.po_id, OLD.po_id);
BEGIN
  UPDATE public.purchase_orders po
    SET division_ids = COALESCE(
      (SELECT array_agg(DISTINCT li.division_id)
         FROM public.po_line_items li
        WHERE li.po_id = v_po AND li.division_id IS NOT NULL),
      '{}')
    WHERE po.id = v_po;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS po_recompute_division_ids ON public.po_line_items;
CREATE TRIGGER po_recompute_division_ids
  AFTER INSERT OR UPDATE OF division_id OR DELETE ON public.po_line_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_po_recompute_division_ids();

COMMIT;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Mirror + dry-run + apply**

Run: `cp supabase/migrations/20260824000000_po_line_division.sql supabase/migrations-staging/` then `npx supabase db push --dry-run --linked` (expect only this migration) then `npx supabase db push --linked`.
Expected: `Applying migration 20260824000000…` / `Finished`.

- [ ] **Step 3: Verify columns + backfill + trigger (rolled-back probe)**

Run this `psql` heredoc:
```sql
\echo '=== columns present ==='
SELECT (SELECT 1 FROM information_schema.columns WHERE table_name='po_line_items' AND column_name='division_id') AS li_div,
       (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_orders' AND column_name='division_ids') AS po_divs;
\echo '=== backfill: any single-division PO where set != [header]? (expect 0) ==='
SELECT count(*) FROM purchase_orders WHERE division_id IS NOT NULL
  AND division_ids IS DISTINCT FROM ARRAY[division_id];
\echo '=== trigger recompute (rolled back) ==='
BEGIN;
DO $$
DECLARE v_po uuid; v_div uuid; v_before uuid[]; v_after uuid[];
BEGIN
  SELECT id, division_id INTO v_po, v_div FROM purchase_orders WHERE division_id IS NOT NULL LIMIT 1;
  SELECT division_ids INTO v_before FROM purchase_orders WHERE id=v_po;
  INSERT INTO po_line_items(po_id, item_name, qty, unit, unit_price, total_price, division_id)
    VALUES (v_po, 'PROBE', 1, 'pcs', 1, 1, (SELECT id FROM company_divisions WHERE id <> v_div LIMIT 1));
  SELECT division_ids INTO v_after FROM purchase_orders WHERE id=v_po;
  RAISE NOTICE 'before=% after=% (after should have 2 divisions)', v_before, v_after;
END $$;
ROLLBACK;
```
Expected: both columns = 1, mismatch count = 0, and `after` has 2 divisions.

- [ ] **Step 4: Commit** (docs-registry not needed yet) — hold per commit policy; migration already on staging.

---

### Task 2: DB — array-aware RLS visibility

**Files:** Create `supabase/migrations/20260824000100_po_multidivision_rls.sql` (+ mirror).

**Consumes:** `purchase_orders.division_ids` (Task 1). **Produces:** `is_any_division_visible(uuid[])`; 4 repointed policies.

- [ ] **Step 1: Fetch the live policy names** (confirm they match `division_scope_select/insert/update/delete`) — `SELECT policyname,cmd FROM pg_policies WHERE tablename='purchase_orders';`

- [ ] **Step 2: Write the migration**

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.is_any_division_visible(p_division_ids uuid[])
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM unnest(coalesce(p_division_ids, '{}'::uuid[])) AS d(id)
    WHERE public.is_division_visible(d.id)
  );
$fn$;

DROP POLICY IF EXISTS division_scope_select ON public.purchase_orders;
CREATE POLICY division_scope_select ON public.purchase_orders FOR SELECT
  USING (is_any_division_visible(division_ids) OR is_division_visible(division_id));

DROP POLICY IF EXISTS division_scope_update ON public.purchase_orders;
CREATE POLICY division_scope_update ON public.purchase_orders FOR UPDATE
  USING (is_any_division_visible(division_ids) OR is_division_visible(division_id))
  WITH CHECK (is_any_division_visible(division_ids) OR is_division_visible(division_id));

DROP POLICY IF EXISTS division_scope_delete ON public.purchase_orders;
CREATE POLICY division_scope_delete ON public.purchase_orders FOR DELETE
  USING (is_any_division_visible(division_ids) OR is_division_visible(division_id));

DROP POLICY IF EXISTS division_scope_insert ON public.purchase_orders;
CREATE POLICY division_scope_insert ON public.purchase_orders FOR INSERT
  WITH CHECK (is_any_division_visible(division_ids) OR is_division_visible(division_id));

COMMIT;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Mirror + apply** (as Task 1 Step 2).

- [ ] **Step 4: Verify with an RLS probe (rolled back)** — simulate 3 callers via `SET LOCAL request.jwt.claims`:

```sql
BEGIN;
-- pick a mixed test PO (create one inline if none)
DO $$
DECLARE v_po uuid; v_m uuid; v_t uuid;
BEGIN
  SELECT id FROM company_divisions WHERE name='Maintenance' INTO v_m;
  SELECT id FROM company_divisions WHERE name='Trading' INTO v_t;
  INSERT INTO purchase_orders(po_number, supplier_name, division_ids, po_type, discount_amount, version_number, initial_exchange_rate, exchange_gain, exchange_loss, show_specifications)
    VALUES ('PROBE-MD', 'x', ARRAY[v_m, v_t], 'draft', 0, 1, 1, 0, 0, true) RETURNING id INTO v_po;
  RAISE NOTICE 'probe po=%', v_po;
END $$;
-- Trading-only user should see it:
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"user_type":"purchaser","division_ids":["<TRADING_UUID>"]}';
SELECT count(*) AS trading_sees FROM purchase_orders WHERE po_number='PROBE-MD';
-- A user of neither division should NOT:
SET LOCAL request.jwt.claims = '{"user_type":"purchaser","division_ids":["<KITCHEN_UUID>"]}';
SELECT count(*) AS kitchen_sees FROM purchase_orders WHERE po_number='PROBE-MD';
ROLLBACK;
```
Expected: `trading_sees=1`, `kitchen_sees=0`. (Substitute real UUIDs from `company_divisions`.)

---

### Task 3: DB — per-line division in `rpc_create_purchase_order`

**Files:** Create `supabase/migrations/20260824000200_rpc_create_po_line_division.sql` (+ mirror). Modify `docs/flows-registry.md` (Create Purchase Order entry — note per-line division).

**Consumes:** Task 1 columns. **Produces:** create RPC that reads `line_items[].division_id`, validates access, stores `division_id` + `division_ids`.

- [ ] **Step 1: Fetch the live body** — `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='rpc_create_purchase_order';` → save to scratch, base the rewrite on it verbatim.

- [ ] **Step 2: Edit the body** — in the line-items insert loop, read `(elem->>'division_id')::uuid` per line; before inserting, `IF NOT is_division_visible(v_line_div) THEN RAISE EXCEPTION 'You cannot create a line for a division you do not have access to'; END IF;`. Insert it into `po_line_items.division_id`. After the loop, set `division_ids` = distinct non-null line divisions and header `division_id` = payload division_id if in the set else the first line's division. (The Task-1 trigger will also recompute `division_ids`; setting it explicitly avoids a second UPDATE round-trip and keeps the RPC self-contained.) Keep every other line byte-identical to the live body.

- [ ] **Step 3: Mirror + apply.**

- [ ] **Step 4: Verify (rolled-back write-path probe)** — call the RPC with a 2-division payload and a real auth `sub`:

```sql
BEGIN;
DO $$
DECLARE v_auth uuid; v_sup uuid; v_bv uuid; v_m uuid; v_t uuid; v_res jsonb; v_po uuid; v_divs uuid[];
BEGIN
  SELECT auth_user_id INTO v_auth FROM user_data WHERE auth_user_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_sup FROM suppliers LIMIT 1;
  SELECT id INTO v_bv FROM inventory_item_brand_variants LIMIT 1;
  SELECT id INTO v_m FROM company_divisions WHERE name='Maintenance';
  SELECT id INTO v_t FROM company_divisions WHERE name='Trading';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth,'user_type','owner')::text, true);
  v_res := rpc_create_purchase_order(jsonb_build_object(
    'supplier_id', v_sup, 'supplier_name','probe','currency','QAR','exchange_rate',1,
    'po_type','draft','division_id', v_m,
    'line_items', jsonb_build_array(
      jsonb_build_object('item_name','A','qty',1,'unit','pcs','unit_price',1,'total_price',1,'brand_variant_id',v_bv,'free_qty',0,'division_id',v_m),
      jsonb_build_object('item_name','B','qty',1,'unit','pcs','unit_price',1,'total_price',1,'brand_variant_id',v_bv,'free_qty',0,'division_id',v_t))));
  v_po := (v_res->>'id')::uuid;
  SELECT division_ids INTO v_divs FROM purchase_orders WHERE id=v_po;
  RAISE NOTICE 'po=% division_ids=% (expect 2)', v_po, v_divs;
END $$;
ROLLBACK;
```
Expected: `division_ids` has both Maintenance + Trading; no error. (Owner passes the access check; also spot-check a non-owner + inaccessible division raises.)

- [ ] **Step 5: Update `docs/flows-registry.md`** Create Purchase Order entry — note lines carry `division_id`, header `division_ids[]` set, array RLS.

---

### Task 4: Types — new columns

**Files:** Modify `src/types/database.types.ts`.

- [ ] **Step 1:** In `po_line_items` Row/Insert/Update add `division_id: string | null` (Insert/Update: `division_id?: string | null`) and a Relationship `po_line_items_division_id_fkey → company_divisions`.
- [ ] **Step 2:** In `purchase_orders` Row add `division_ids: string[]`; Insert/Update `division_ids?: string[]`.
- [ ] **Step 3:** `npx tsc --noEmit` → clean.

---

### Task 5: `useCascadeAccessibleItems` accepts a division

**Files:** Modify `src/hooks/useCascadeAccessibleItems.ts`, `src/components/purchase/CascadeInventorySelector.tsx`.

**Interfaces — Produces:** `useCascadeAccessibleItems(divisionId?: string | null)` — when `divisionId` is passed, filter to that division; when omitted, current behavior (active division).

- [ ] **Step 1:** Read the hook. It currently derives the division from `useActiveDivision()`. Add an optional `divisionId?: string | null` parameter; use `divisionId ?? activeDivisionId` as the effective division. Do not change the query shape otherwise.
- [ ] **Step 2:** `CascadeInventorySelector` — add an optional `divisionId?: string | null` prop, thread it into `useCascadeAccessibleItems(divisionId)`. Default `undefined` (unchanged for existing callers — consumption, etc.).
- [ ] **Step 3:** `npx tsc --noEmit` + `npx eslint` on both files → clean. Confirm non-PO callers still compile (they pass no arg).

---

### Task 6: Create-PO per-line division UI + payload

**Files:** Modify `src/components/purchase/PoLineItemsEditor.tsx`, `src/app/(dashboard)/purchase/create-po/page.tsx`, `src/hooks/usePurchaseOrders.ts`.

**Consumes:** Task 5 (`CascadeInventorySelector` `divisionId` prop). **Produces:** `LineItemRow.division_id: string | null`; `CreatePOPayload.line_items[].division_id`.

- [ ] **Step 1:** `usePurchaseOrders.ts` — add `division_id: string | null` to the `CreatePOPayload` line-item type (and any `LineItem` type it exports).
- [ ] **Step 2:** `PoLineItemsEditor.tsx` — add `division_id` to `LineItemRow`. Add a **Division** `<Select>` at the start of each row (options = the user's accessible divisions, passed in as a prop `divisions` grouped by company; show `division.name`, value = id; disabled + preselected when the user has one division). Pass the row's `division_id` into `<CascadeInventorySelector divisionId={row.division_id} … />` so the item cascade is scoped per line. Changing a row's division clears that row's item selection (`brand_variant_id`, `item_name`, price) to avoid a cross-division mismatch.
- [ ] **Step 3:** `create-po/page.tsx` — the header "Division" picker becomes **"Default division for new lines"** (still shown only for multi-division users); new rows inherit it. Pass `divisions` to `PoLineItemsEditor`. In `buildPayload`, map each line's `division_id`. In `validate()`, require every line to have a `division_id` (message: "Every line needs a division") in addition to the existing item/qty/price checks. `division_id` header in the payload = the default (primary).
- [ ] **Step 4:** `npx tsc --noEmit` + `npx eslint` → clean.
- [ ] **Step 5: Operator/browser smoke** (deferred to Task 10) — create a Maintenance+Trading PO.

---

### Task 7: Display — PO detail, orders list, sidebar

**Files:** Modify `src/app/(dashboard)/purchase/orders/page.tsx` and the PO detail/sidebar component that renders line items.

- [ ] **Step 1:** Orders list — add a **Division** cell: if `po.division_ids.length <= 1` show the single division's short-name (resolve via `useDivisions` map) or "—"; if `> 1` show a "Multi" badge with a tooltip listing the names.
- [ ] **Step 2:** PO detail / line rows — render each line's division as a small badge (resolve id → short-name; never the UUID). Header shows the division set.
- [ ] **Step 3:** `npx tsc --noEmit` + `npx eslint` → clean.

---

### Task 8: Edit-PO per-line division

**Files:** Modify `src/app/(dashboard)/purchase/edit-po/[id]/page.tsx` (+ its line editor usage).

- [ ] **Step 1:** Seed each existing line's `division_id` from the loaded PO. Render the same per-line Division select (reuse the Task-6 `PoLineItemsEditor` changes).
- [ ] **Step 2:** On save, the direct `po_line_items` update writes `division_id`; the Task-1 trigger recomputes `purchase_orders.division_ids`. Confirm the save path includes `division_id` in the updated columns.
- [ ] **Step 3:** `npx tsc --noEmit` + `npx eslint` → clean. Trace the edit write path (first save + re-edit) per `feedback_mutation_path_verification`.

---

### Task 9: Receiving — show line division + soft warning

**Files:** Modify the receive-against-PO surface under `src/app/(dashboard)/purchase/receivals/` (the component that lists PO lines to receive).

- [ ] **Step 1:** For each PO line being received, show its **division** badge next to the item.
- [ ] **Step 2:** When the operator picks a destination sub-container/warehouse whose division differs from the line's division, show a non-blocking amber warning ("Destination is in <X>, line is <Y>"). Do not block submit (Phase 1).
- [ ] **Step 3:** `npx tsc --noEmit` + `npx eslint` → clean.

---

### Task 10: Full verification + operator smoke

- [ ] **Step 1:** `npx tsc --noEmit` (whole project) + `npx eslint` on every changed file → clean.
- [ ] **Step 2: Silent DB re-checks:** re-read the 4 PO policies (array-aware), `rpc_create_purchase_order` body (reads line division), and the trigger — confirm all live on staging.
- [ ] **Step 3: Operator/browser smoke (local dev → staging):**
  1. As a multi-division user, create a PO with one Maintenance line + one Trading line → saves; header shows both.
  2. Submit for approval → one chain (unchanged).
  3. Switch active division to Trading → the PO still appears in the orders list; the Maintenance line is visible.
  4. Switch to a division on neither → the PO disappears.
  5. Receive the two lines into their respective division warehouses; confirm the soft warning fires on a mismatched destination.
  6. Edit the PO: change a line's division → header set updates; zero console errors.
- [ ] **Step 4:** On operator "works": commit (2 co-authors), update PROGRESS.md (Completed + Security Audit Log), EOD. Ship to new-prod only if the operator asks.

## Self-Review notes (author)

- **Spec coverage:** data model (T1), RLS (T2), create RPC (T3), types (T4), cascade filter (T5), create UI (T6), display (T7), edit (T8), receiving (T9), approval unchanged (no task — verified division-agnostic). ✅
- **Consistency:** `useCascadeAccessibleItems(divisionId?)` (T5) is consumed by `CascadeInventorySelector divisionId` (T5) used in `PoLineItemsEditor` (T6). `LineItemRow.division_id` (T6) → `CreatePOPayload.line_items[].division_id` (T6) → RPC `line_items[].division_id` (T3). `purchase_orders.division_ids` (T1) → RLS (T2) + display (T7).
- **Open item to confirm at T3:** the exact JSON key the current RPC reads for line items (`line_items`) and each line's field names — verify against the live body before editing.
