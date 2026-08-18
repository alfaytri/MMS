# Tools & Assets — Phase 1 (Assign & Track) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes.
> **Read first:** `../design.md`, `../required-data.md`, `../issues.md` (in this plan's parent folder). This plan assumes that context.

**Goal:** Assign serialized tool units to teams (custody locations) within their division, move them between same-division teams, and see full per-item usage history (first-assigned date, every team that held it, and for how long).

**Architecture:** One new custody-ledger table (`tool_unit_assignments`) is the source of truth for who-held-what-when; a denormalized `current_custody_location_id` pointer on `tool_asset_units` makes "a team's items" a fast lookup. All state changes go through `SECURITY DEFINER`, permission-gated RPCs that write the ledger + pointer atomically. A new **Operations → Tools & Assets** page renders a **Teams** tab (cards → team detail → move / assign-new) and a **History & Usage** tab (search by serial/team → item timeline + usage-days). Reuses the existing custody-locations model for teams and the existing `tool_asset_units` model for units.

**Tech Stack:** Next.js (App Router — this project's fork; read `node_modules/next/dist/docs/` before touching routing), React, TanStack Query, Supabase (Postgres + RLS + RPC), Tailwind, shadcn/ui, TypeScript.

## Global Constraints

- **Migrations:** author in `supabase/migrations/YYYYMMDDHHMMSS_*.sql`; apply to **staging** `mwvblpgbgxipvrevkeff` via `npx supabase db push`; **mirror every file** into `supabase/migrations-staging/` in the same commit. Do NOT push to dev (`wkmvjxxmzstsvahuiwsz`, frozen). new-prod (`optishfnnctrhffpoywg`) is applied via the guarded `db query --linked` flow **only at ship time, with operator go-ahead** (final task).
- **Live DB is the only authority.** `baseline_schema.sql` and `database.types.ts` are stale. Before rewriting/extending any existing function, fetch its live body with `pg_get_functiondef` and rebase on it (feedback: rewrite-functions-from-live-db). Before writing a new status/enum value, confirm the enum's allowed values via `db query --linked`.
- **Every new table:** `ENABLE ROW LEVEL SECURITY` + at least one policy.
- **Every new RPC:** `SECURITY DEFINER`, permission-checked in-body, `REVOKE ALL … FROM public` + `GRANT EXECUTE … TO authenticated, service_role` (no anon).
- **Permission expression:** copy the exact permission-check expression from the live `guard_tool_unit_division_write` body (it already gates `inventory.catalog.manage`). Expected shape: `public.has_permission(auth.uid(), 'inventory.catalog.manage')` — **verify the real function name/signature from the live body; do not guess.**
- **Commits:** co-authorship trailer on every commit (HEREDOC):
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```
  Commit only when it works. Batch pushes; **ask before pushing** (each push = one Vercel prod build).
- **UI:** responsive across the 4 breakpoints; human-readable labels only in Selects (never raw UUIDs — resolve via `.find()`); fixed `min-h-*` on dynamic-height regions (layout stability); dialogs follow the project dialog standards (sticky footer, `overflow-y` scroll, `1,000,000` number formatting); side-by-side cascade selects (never flyouts); 44px touch targets.
- **Error surfacing:** wrap `PostgrestError` into a real `Error` concatenating `code/message/details/hint` (it is not an `Error` subclass); never render a generic "Failed to X".
- **Don't run `next build`** unless the user asks. Don't drive the browser for sign-off — hand UI smoke to the operator.
- **After every task:** update `PROGRESS.md` (isolated docs commit) and the EOD file; the flow-registry + security-audit rows land in the shipping commit (final task).

## File Structure

**Create (DB):**
- `supabase/migrations/20260920000000_tool_unit_assignments_ledger.sql` — ledger table + pointer column + RLS.
- `supabase/migrations/20260920000100_tool_assignment_write_rpcs.sql` — assign / move / return RPCs.
- `supabase/migrations/20260920000200_transfer_tool_unit_release_assignment.sql` — extend `rpc_transfer_tool_unit` (ISSUE-8).
- `supabase/migrations/20260920000300_tool_assignment_read_rpcs.sql` — read RPCs for the hub.
- Mirror each into `supabase/migrations-staging/`.

**Create (TS):**
- `src/hooks/useToolAssignments.ts` — team-units query, assign/move/return mutations, teams-with-counts, assignable-units.
- `src/hooks/useToolUnitHistory.ts` — unit timeline + serial/team search.
- `src/app/(dashboard)/operations/tools-assets/page.tsx` — hub route + tab shell. *(confirm the exact router group from the Custody route — ISSUE-5.)*
- `src/components/warehouse/tools-assets/ToolsAssetsHub.tsx` — tab shell (Teams | History & Usage).
- `src/components/warehouse/tools-assets/TeamsTab.tsx` — team cards.
- `src/components/warehouse/tools-assets/TeamToolsDetail.tsx` — a team's unit list + per-row actions.
- `src/components/warehouse/tools-assets/MoveToolUnitDialog.tsx` — same-division team picker.
- `src/components/warehouse/tools-assets/AssignToolUnitDialog.tsx` — pick an available unit for a team.
- `src/components/warehouse/tools-assets/HistoryUsageTab.tsx` — search + results.
- `src/components/warehouse/tools-assets/ToolUnitTimeline.tsx` — item detail timeline + usage-days.

**Modify:**
- `src/lib/database.types.ts` (regenerate + re-append helper aliases).
- The Operations nav definition (`NAV_TREE` / `PermissionTree.tsx` / TopNav — locate per ISSUE-5).
- `docs/flows-registry.md`, `PROGRESS.md`, EOD (final task).

---

## Task 1: Ledger table + pointer column

**Files:**
- Create: `supabase/migrations/20260920000000_tool_unit_assignments_ledger.sql`
- Mirror: `supabase/migrations-staging/20260920000000_tool_unit_assignments_ledger.sql`

**Interfaces:**
- Produces: table `public.tool_unit_assignments(id, unit_id, custody_location_id, assigned_at, released_at, release_reason, assigned_by, notes, created_at)`; partial unique index `uq_tool_unit_open_assignment (unit_id) WHERE released_at IS NULL`; column `public.tool_asset_units.current_custody_location_id uuid`.

- [ ] **Step 1: Write the migration**

```sql
-- Tools & Assets Phase 1: custody ledger + denormalized current-team pointer.
-- The ledger is the source of truth for who-held-what-when; the pointer makes
-- "a team's current units" a fast, indexed lookup. Writes happen only through
-- the RPCs in 20260920000100 (this table's direct writes are permission-gated).

BEGIN;

CREATE TABLE IF NOT EXISTS public.tool_unit_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id             uuid NOT NULL REFERENCES public.tool_asset_units(id) ON DELETE CASCADE,
  custody_location_id uuid NOT NULL REFERENCES public.warehouse_sub_containers(id),
  assigned_at         timestamptz NOT NULL DEFAULT now(),
  released_at         timestamptz,
  release_reason      text CHECK (release_reason IN ('moved','returned','scrapped')),
  assigned_by         uuid,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- At most one OPEN assignment per unit (the current holder).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tool_unit_open_assignment
  ON public.tool_unit_assignments (unit_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_tool_unit_assignments_unit
  ON public.tool_unit_assignments (unit_id);
CREATE INDEX IF NOT EXISTS ix_tool_unit_assignments_team
  ON public.tool_unit_assignments (custody_location_id);

ALTER TABLE public.tool_unit_assignments ENABLE ROW LEVEL SECURITY;

-- SELECT open to authenticated (mirrors tool_asset_units tau_select).
DO $$ BEGIN
  CREATE POLICY tua_ledger_select ON public.tool_unit_assignments
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Direct writes require inventory.catalog.manage (RPCs are DEFINER and bypass this;
-- this policy only guards accidental direct PostgREST writes).
-- IMPORTANT: replace <PERM_EXPR> with the exact expression copied from the live
-- guard_tool_unit_division_write body (see Global Constraints).
DO $$ BEGIN
  CREATE POLICY tua_ledger_write ON public.tool_unit_assignments
    FOR ALL TO authenticated USING (<PERM_EXPR>) WITH CHECK (<PERM_EXPR>);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Denormalized current-team pointer on the unit.
ALTER TABLE public.tool_asset_units
  ADD COLUMN IF NOT EXISTS current_custody_location_id uuid
    REFERENCES public.warehouse_sub_containers(id);
CREATE INDEX IF NOT EXISTS ix_tool_asset_units_current_team
  ON public.tool_asset_units (current_custody_location_id);

COMMIT;
```

- [ ] **Step 2: Resolve `<PERM_EXPR>` from the live DB**

Run: `npx supabase db query --linked "SELECT pg_get_functiondef('public.guard_tool_unit_division_write()'::regprocedure);"`
Copy the exact permission-check expression (the `IF NOT <expr> THEN RAISE …` predicate) into both `<PERM_EXPR>` slots. Confirm the function/args names match reality.

- [ ] **Step 3: Apply to staging**

Run: `npx supabase db push`
Expected: applies `20260920000000…`; no errors.

- [ ] **Step 4: Verify objects exist**

Run:
```
npx supabase db query --linked "SELECT column_name FROM information_schema.columns WHERE table_name='tool_unit_assignments' ORDER BY 1;"
npx supabase db query --linked "SELECT indexname FROM pg_indexes WHERE tablename='tool_unit_assignments';"
npx supabase db query --linked "SELECT column_name FROM information_schema.columns WHERE table_name='tool_asset_units' AND column_name='current_custody_location_id';"
npx supabase db query --linked "SELECT relrowsecurity FROM pg_class WHERE relname='tool_unit_assignments';"
```
Expected: 9 columns; `uq_tool_unit_open_assignment` + two ix_ indexes present; pointer column present; `relrowsecurity = t`.

- [ ] **Step 5: Rolled-back probe — the open-assignment uniqueness holds**

Run:
```
npx supabase db query --linked "DO \$\$ DECLARE u uuid; t uuid; BEGIN
  SELECT id INTO u FROM public.tool_asset_units LIMIT 1;
  SELECT id INTO t FROM public.warehouse_sub_containers LIMIT 1;
  IF u IS NULL OR t IS NULL THEN RAISE NOTICE 'no seed data — skip'; RETURN; END IF;
  INSERT INTO public.tool_unit_assignments(unit_id,custody_location_id) VALUES (u,t);
  BEGIN
    INSERT INTO public.tool_unit_assignments(unit_id,custody_location_id) VALUES (u,t);
    RAISE EXCEPTION 'FAIL: second open assignment was allowed';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK: partial unique enforced'; END;
  RAISE EXCEPTION 'rollback probe'; END \$\$;"
```
Expected: `OK: partial unique enforced` then the intentional `rollback probe` abort (nothing persisted).

- [ ] **Step 6: Mirror + commit**

```bash
cp supabase/migrations/20260920000000_tool_unit_assignments_ledger.sql supabase/migrations-staging/
git add supabase/migrations/20260920000000_tool_unit_assignments_ledger.sql supabase/migrations-staging/20260920000000_tool_unit_assignments_ledger.sql
git commit -m "$(cat <<'EOF'
feat(db): tool_unit_assignments custody ledger + current-team pointer

New tool_unit_assignments ledger (partial-unique one-open-row-per-unit) +
tool_asset_units.current_custody_location_id denormalized pointer. RLS on;
direct writes gated on inventory.catalog.manage (RPCs are DEFINER).

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Assign / Move / Return write RPCs

**Files:**
- Create: `supabase/migrations/20260920000100_tool_assignment_write_rpcs.sql`
- Mirror into `supabase/migrations-staging/`.

**Interfaces:**
- Consumes: `tool_unit_assignments`, `tool_asset_units(current_custody_location_id, division_id, status)`, `warehouse_sub_containers(division_id)`.
- Produces:
  - `rpc_assign_tool_unit_to_team(p_unit_id uuid, p_team_id uuid, p_notes text DEFAULT NULL) RETURNS uuid` (assignment id)
  - `rpc_move_tool_unit_to_team(p_unit_id uuid, p_to_team_id uuid, p_notes text DEFAULT NULL) RETURNS uuid`
  - `rpc_return_tool_unit(p_unit_id uuid, p_notes text DEFAULT NULL) RETURNS void`

- [ ] **Step 1: Write the migration** (replace `<PERM_EXPR>` from the live body as in Task 1)

```sql
BEGIN;

-- Assign an AVAILABLE unit to a team in the unit's OWN division.
CREATE OR REPLACE FUNCTION public.rpc_assign_tool_unit_to_team(
  p_unit_id uuid, p_team_id uuid, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unit_div uuid; v_team_div uuid; v_status public.tool_status; v_id uuid;
BEGIN
  IF NOT (<PERM_EXPR>) THEN RAISE EXCEPTION 'not authorized' USING errcode='42501'; END IF;

  SELECT division_id, status INTO v_unit_div, v_status
    FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'unit is retired'; END IF;

  SELECT division_id INTO v_team_div FROM public.warehouse_sub_containers WHERE id = p_team_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_team_id; END IF;

  IF v_unit_div IS DISTINCT FROM v_team_div THEN
    RAISE EXCEPTION 'cross-division assignment blocked: unit division % <> team division % (use Transfer to change the unit''s division first)', v_unit_div, v_team_div;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tool_unit_assignments WHERE unit_id = p_unit_id AND released_at IS NULL) THEN
    RAISE EXCEPTION 'unit already assigned — move or return it first';
  END IF;

  INSERT INTO public.tool_unit_assignments(unit_id, custody_location_id, assigned_by, notes)
    VALUES (p_unit_id, p_team_id, auth.uid(), p_notes) RETURNING id INTO v_id;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = p_team_id, status = 'assigned'
    WHERE id = p_unit_id;

  RETURN v_id;
END $$;

-- Move a held unit to another team in the SAME division (close + open in one txn).
CREATE OR REPLACE FUNCTION public.rpc_move_tool_unit_to_team(
  p_unit_id uuid, p_to_team_id uuid, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unit_div uuid; v_team_div uuid; v_id uuid;
BEGIN
  IF NOT (<PERM_EXPR>) THEN RAISE EXCEPTION 'not authorized' USING errcode='42501'; END IF;

  SELECT division_id INTO v_unit_div FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unit % not found', p_unit_id; END IF;

  SELECT division_id INTO v_team_div FROM public.warehouse_sub_containers WHERE id = p_to_team_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_to_team_id; END IF;
  IF v_unit_div IS DISTINCT FROM v_team_div THEN
    RAISE EXCEPTION 'cross-division move blocked: unit division % <> team division %', v_unit_div, v_team_div;
  END IF;

  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'moved'
    WHERE unit_id = p_unit_id AND released_at IS NULL;

  INSERT INTO public.tool_unit_assignments(unit_id, custody_location_id, assigned_by, notes)
    VALUES (p_unit_id, p_to_team_id, auth.uid(), p_notes) RETURNING id INTO v_id;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = p_to_team_id, status = 'assigned'
    WHERE id = p_unit_id;

  RETURN v_id;
END $$;

-- Return a held unit (no team; back to available).
CREATE OR REPLACE FUNCTION public.rpc_return_tool_unit(
  p_unit_id uuid, p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (<PERM_EXPR>) THEN RAISE EXCEPTION 'not authorized' USING errcode='42501'; END IF;

  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'returned', notes = COALESCE(p_notes, notes)
    WHERE unit_id = p_unit_id AND released_at IS NULL;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = NULL, status = 'available'
    WHERE id = p_unit_id;
END $$;

REVOKE ALL ON FUNCTION public.rpc_assign_tool_unit_to_team(uuid,uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_move_tool_unit_to_team(uuid,uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_return_tool_unit(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_assign_tool_unit_to_team(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_move_tool_unit_to_team(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_return_tool_unit(uuid,text) TO authenticated, service_role;

COMMIT;
```

- [ ] **Step 2: Confirm the `tool_status` enum values before trusting `'assigned'`/`'available'`/`'retired'`**

Run: `npx supabase db query --linked "SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='tool_status' ORDER BY e.enumsortorder;"`
Expected: `available, assigned, maintenance, retired`. If different, adjust the literals.

- [ ] **Step 3: Apply to staging** — `npx supabase db push` (no errors).

- [ ] **Step 4: Rolled-back probe — assign → move → return happy path + cross-division block**

```
npx supabase db query --linked "DO \$\$ DECLARE u uuid; t1 uuid; t2 uuid; tx uuid; a uuid; BEGIN
  -- a unit + two teams in its division + a team in a different division
  SELECT id, division_id INTO u, t1 FROM public.tool_asset_units WHERE division_id IS NOT NULL LIMIT 1;
  SELECT id INTO t1 FROM public.warehouse_sub_containers WHERE division_id = (SELECT division_id FROM public.tool_asset_units WHERE id=u) LIMIT 1;
  SELECT id INTO t2 FROM public.warehouse_sub_containers WHERE division_id = (SELECT division_id FROM public.tool_asset_units WHERE id=u) AND id <> t1 LIMIT 1;
  SELECT id INTO tx FROM public.warehouse_sub_containers WHERE division_id IS DISTINCT FROM (SELECT division_id FROM public.tool_asset_units WHERE id=u) LIMIT 1;
  IF u IS NULL OR t1 IS NULL THEN RAISE NOTICE 'insufficient seed — skip'; RETURN; END IF;
  a := public.rpc_assign_tool_unit_to_team(u, t1, 'probe');
  ASSERT (SELECT current_custody_location_id FROM public.tool_asset_units WHERE id=u) = t1, 'pointer not set';
  IF t2 IS NOT NULL THEN
    PERFORM public.rpc_move_tool_unit_to_team(u, t2, 'probe move');
    ASSERT (SELECT count(*) FROM public.tool_unit_assignments WHERE unit_id=u AND released_at IS NULL)=1, 'not exactly one open row';
    ASSERT (SELECT current_custody_location_id FROM public.tool_asset_units WHERE id=u)=t2, 'pointer not moved';
  END IF;
  PERFORM public.rpc_return_tool_unit(u, 'probe return');
  ASSERT (SELECT current_custody_location_id FROM public.tool_asset_units WHERE id=u) IS NULL, 'pointer not cleared';
  IF tx IS NOT NULL THEN
    BEGIN PERFORM public.rpc_assign_tool_unit_to_team(u, tx, 'x'); RAISE EXCEPTION 'FAIL: cross-division allowed';
    EXCEPTION WHEN others THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; ELSE RAISE NOTICE 'OK: cross-division blocked'; END IF; END;
  END IF;
  RAISE EXCEPTION 'rollback probe'; END \$\$;"
```
Expected: assertions pass, `OK: cross-division blocked`, then `rollback probe` abort.

- [ ] **Step 5: Confirm grants (no anon)**

Run: `npx supabase db query --linked "SELECT p.proname, r.rolname FROM pg_proc p JOIN pg_proc_acl … ;"` — simpler: `\df+` style check, or:
`npx supabase db query --linked "SELECT proname, proacl FROM pg_proc WHERE proname IN ('rpc_assign_tool_unit_to_team','rpc_move_tool_unit_to_team','rpc_return_tool_unit');"`
Expected: ACL lists `authenticated` + `service_role`, not `anon`/`public`.

- [ ] **Step 6: Mirror + commit** (message `feat(db): tool assignment RPCs — assign/move/return (same-division, ledger-atomic)`, HEREDOC with both trailers).

---

## Task 3: Extend `rpc_transfer_tool_unit` to release an open assignment (ISSUE-8)

**Files:**
- Create: `supabase/migrations/20260920000200_transfer_tool_unit_release_assignment.sql`
- Mirror into `supabase/migrations-staging/`.

**Interfaces:**
- Consumes: live `rpc_transfer_tool_unit(uuid,uuid,text)` body + `tool_unit_assignments`.
- Produces: same signature; on a real division change it now closes the open assignment (`release_reason='moved'`) and clears `current_custody_location_id`.

- [ ] **Step 1: Fetch the live body FIRST** (do not guess — rebase on it)

Run: `npx supabase db query --linked "SELECT pg_get_functiondef('public.rpc_transfer_tool_unit(uuid,uuid,text)'::regprocedure);"`
Save the exact body. Confirm arg names/order and that it currently only updates `division_id`.

- [ ] **Step 2: Write the migration** — paste the live body, then splice this block right **after** the `division_id` UPDATE succeeds (adapt variable names to the live body):

```sql
-- ISSUE-8: a unit can't be held by a team outside its (new) division.
-- Auto-release any open team assignment when the division actually changes.
IF p_to_division_id IS DISTINCT FROM v_old_division THEN
  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'moved'
    WHERE unit_id = p_unit_id AND released_at IS NULL;
  UPDATE public.tool_asset_units
    SET current_custody_location_id = NULL
    WHERE id = p_unit_id;
END IF;
```

Wrap the whole `CREATE OR REPLACE FUNCTION …` in `BEGIN; … COMMIT;` and re-assert the original `REVOKE`/`GRANT` (copy them from the live definition so they are not dropped).

- [ ] **Step 3: Apply to staging** — `npx supabase db push`.

- [ ] **Step 4: Rolled-back probe — transferring an assigned unit releases it**

```
npx supabase db query --linked "DO \$\$ DECLARE u uuid; t uuid; d2 uuid; BEGIN
  SELECT id INTO u FROM public.tool_asset_units WHERE division_id IS NOT NULL LIMIT 1;
  SELECT id INTO t FROM public.warehouse_sub_containers WHERE division_id=(SELECT division_id FROM public.tool_asset_units WHERE id=u) LIMIT 1;
  SELECT id INTO d2 FROM public.company_divisions WHERE id IS DISTINCT FROM (SELECT division_id FROM public.tool_asset_units WHERE id=u) LIMIT 1;
  IF u IS NULL OR t IS NULL OR d2 IS NULL THEN RAISE NOTICE 'insufficient seed — skip'; RETURN; END IF;
  PERFORM public.rpc_assign_tool_unit_to_team(u, t, 'probe');
  PERFORM public.rpc_transfer_tool_unit(u, d2, 'probe transfer');
  ASSERT (SELECT count(*) FROM public.tool_unit_assignments WHERE unit_id=u AND released_at IS NULL)=0, 'assignment not released on transfer';
  ASSERT (SELECT current_custody_location_id FROM public.tool_asset_units WHERE id=u) IS NULL, 'pointer not cleared on transfer';
  RAISE EXCEPTION 'rollback probe'; END \$\$;"
```
Expected: assertions pass, `rollback probe` abort. **Also confirm** the permission guard still fires for a non-manager (see ISSUE-3 residual) — reuse the pattern from the guard's own probe if available.

- [ ] **Step 5: Mirror + commit** (`feat(db): rpc_transfer_tool_unit releases open team assignment on division change`).

---

## Task 4: Read RPCs for the hub

**Files:**
- Create: `supabase/migrations/20260920000300_tool_assignment_read_rpcs.sql`
- Mirror into `supabase/migrations-staging/`.

**Interfaces:**
- Produces (all `STABLE SECURITY DEFINER`, granted to `authenticated, service_role`):
  - `get_teams_with_tool_counts(p_division_ids uuid[] DEFAULT NULL)` → `(team_id uuid, team_name text, division_id uuid, division_name text, responsible_person_name text, held_count int)`
  - `get_team_tool_units(p_team_id uuid)` → `(unit_id uuid, item_name text, serial_number text, brand text, condition text, status text, assigned_at timestamptz)`
  - `get_assignable_tool_units(p_division_id uuid)` → `(unit_id uuid, item_name text, serial_number text, brand text, condition text)` (division's units with no open assignment, not retired)
  - `get_tool_unit_timeline(p_unit_id uuid)` → `(assignment_id uuid, team_id uuid, team_name text, assigned_at timestamptz, released_at timestamptz, days numeric, is_current boolean)`
  - `search_tool_units(p_query text)` → `(unit_id uuid, item_name text, serial_number text, current_team_id uuid, current_team_name text, status text)`

- [ ] **Step 1: Write the migration**

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.get_teams_with_tool_counts(p_division_ids uuid[] DEFAULT NULL)
RETURNS TABLE(team_id uuid, team_name text, division_id uuid, division_name text,
              responsible_person_name text, held_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sc.id, sc.name, sc.division_id, cd.name,
         ud.full_name,
         (SELECT count(*)::int FROM public.tool_asset_units u
            WHERE u.current_custody_location_id = sc.id AND u.status <> 'retired')
  FROM public.warehouse_sub_containers sc
  JOIN public.warehouses w ON w.id = sc.warehouse_id AND w.warehouse_kind = 'custody'
  LEFT JOIN public.company_divisions cd ON cd.id = sc.division_id
  LEFT JOIN public.user_data ud ON ud.id = sc.responsible_person_profile_id
  WHERE sc.is_active IS DISTINCT FROM false
    AND (p_division_ids IS NULL OR sc.division_id = ANY(p_division_ids))
  ORDER BY cd.name, sc.name;
$$;

CREATE OR REPLACE FUNCTION public.get_team_tool_units(p_team_id uuid)
RETURNS TABLE(unit_id uuid, item_name text, serial_number text, brand text,
              condition text, status text, assigned_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, i.name_en, u.serial_number, u.brand,
         u.condition::text, u.status::text,
         (SELECT a.assigned_at FROM public.tool_unit_assignments a
            WHERE a.unit_id = u.id AND a.released_at IS NULL)
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  WHERE u.current_custody_location_id = p_team_id AND u.status <> 'retired'
  ORDER BY i.name_en, u.serial_number;
$$;

CREATE OR REPLACE FUNCTION public.get_assignable_tool_units(p_division_id uuid)
RETURNS TABLE(unit_id uuid, item_name text, serial_number text, brand text, condition text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, i.name_en, u.serial_number, u.brand, u.condition::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  WHERE u.division_id = p_division_id
    AND u.status <> 'retired'
    AND NOT EXISTS (SELECT 1 FROM public.tool_unit_assignments a WHERE a.unit_id = u.id AND a.released_at IS NULL)
  ORDER BY i.name_en, u.serial_number;
$$;

CREATE OR REPLACE FUNCTION public.get_tool_unit_timeline(p_unit_id uuid)
RETURNS TABLE(assignment_id uuid, team_id uuid, team_name text,
              assigned_at timestamptz, released_at timestamptz, days numeric, is_current boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.custody_location_id, sc.name,
         a.assigned_at, a.released_at,
         round(EXTRACT(EPOCH FROM (COALESCE(a.released_at, now()) - a.assigned_at)) / 86400.0, 1),
         (a.released_at IS NULL)
  FROM public.tool_unit_assignments a
  LEFT JOIN public.warehouse_sub_containers sc ON sc.id = a.custody_location_id
  WHERE a.unit_id = p_unit_id
  ORDER BY a.assigned_at;
$$;

CREATE OR REPLACE FUNCTION public.search_tool_units(p_query text)
RETURNS TABLE(unit_id uuid, item_name text, serial_number text,
              current_team_id uuid, current_team_name text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, i.name_en, u.serial_number, u.current_custody_location_id, sc.name, u.status::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.warehouse_sub_containers sc ON sc.id = u.current_custody_location_id
  WHERE p_query IS NOT NULL AND length(trim(p_query)) > 0
    AND (u.serial_number ILIKE '%'||p_query||'%' OR i.name_en ILIKE '%'||p_query||'%')
  ORDER BY u.serial_number
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_teams_with_tool_counts(uuid[]) FROM public;
REVOKE ALL ON FUNCTION public.get_team_tool_units(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_assignable_tool_units(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_tool_unit_timeline(uuid) FROM public;
REVOKE ALL ON FUNCTION public.search_tool_units(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_teams_with_tool_counts(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_team_tool_units(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_assignable_tool_units(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tool_unit_timeline(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_tool_units(text) TO authenticated, service_role;

COMMIT;
```

- [ ] **Step 2: Verify column names used exist** — before `db push`, confirm the joined columns are real:
```
npx supabase db query --linked "SELECT column_name FROM information_schema.columns WHERE table_name='warehouse_sub_containers' AND column_name IN ('name','division_id','warehouse_id','responsible_person_profile_id','is_active');"
npx supabase db query --linked "SELECT column_name FROM information_schema.columns WHERE table_name='inventory_items' AND column_name IN ('name_en');"
npx supabase db query --linked "SELECT column_name FROM information_schema.columns WHERE table_name='company_divisions' AND column_name IN ('name');"
npx supabase db query --linked "SELECT column_name FROM information_schema.columns WHERE table_name='user_data' AND column_name IN ('full_name');"
```
Expected: every referenced column returns. If `company_divisions.name` is actually `name_en` (or similar), fix the SQL to match live.

- [ ] **Step 3: Apply to staging** — `npx supabase db push`.

- [ ] **Step 4: Smoke each read** (0 rows is fine):
```
npx supabase db query --linked "SELECT * FROM public.get_teams_with_tool_counts() LIMIT 3;"
npx supabase db query --linked "SELECT * FROM public.search_tool_units('x') LIMIT 1;"
```
Expected: no errors.

- [ ] **Step 5: Mirror + commit** (`feat(db): read RPCs for the tools-assets hub (teams+counts, team units, assignable, timeline, search)`).

---

## Task 5: Regenerate types + helper aliases

**Files:**
- Modify: `src/lib/database.types.ts` *(confirm the real path; grep for `Database` type import used by `createClient`)*.

- [ ] **Step 1: Locate the types file** — Run: `git grep -l "export type Database" src | head` (or find where `supabase gen types` output lives per prior commits).

- [ ] **Step 2: Regenerate** — Run: `npx supabase gen types typescript --linked > src/lib/database.types.ts` (use the same flags prior commits used; check `package.json` scripts).

- [ ] **Step 3: Re-append the four helper aliases** (the CLI wipes them — feedback: supabase-gen-types). Paste the exact `DBTable` / `DBInsert` / `DBUpdate` / `AllTables` block from the prior version (recover via `git show HEAD:src/lib/database.types.ts | tail -40`).

- [ ] **Step 4: Typecheck** — Run: `npx tsc --noEmit`. Expected: exit 0.

- [ ] **Step 5: Commit** (`chore(types): regenerate database.types for tool_unit_assignments + hub RPCs`).

---

## Task 6: Hooks — `useToolAssignments` + `useToolUnitHistory`

**Files:**
- Create: `src/hooks/useToolAssignments.ts`, `src/hooks/useToolUnitHistory.ts`
- Reference (mirror imports + query-key + error style): `src/hooks/useInventory.ts` (`useToolAssetUnits` :770, `useTransferToolUnit` :940).

**Interfaces:**
- Consumes: the RPCs from Tasks 2 & 4.
- Produces (hooks the UI tasks import):
  - `useTeamsWithToolCounts(divisionIds?: string[])`, `useTeamToolUnits(teamId: string | null)`, `useAssignableToolUnits(divisionId: string | null)`
  - `useAssignToolUnit()`, `useMoveToolUnit()`, `useReturnToolUnit()` (mutations; vars `{ unitId, teamId?, toTeamId?, notes? }`)
  - `useToolUnitTimeline(unitId: string | null)`, `useSearchToolUnits(query: string)`

- [ ] **Step 1: Write `useToolAssignments.ts`** (match the project's supabase-client import + `queryKeys` object used in `useInventory.ts`; the block below shows the shape — align import paths to the real ones):

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client'; // <- match useInventory.ts

const supabase = createClient();

// Turn a PostgrestError into a real Error (feedback: surface-raw-db-errors)
function toError(e: { code?: string; message?: string; details?: string; hint?: string } | null, ctx: string): Error {
  if (!e) return new Error(ctx);
  return new Error(`${ctx}: [${e.code ?? '?'}] ${e.message ?? ''}${e.details ? ' | ' + e.details : ''}${e.hint ? ' | ' + e.hint : ''}`.trim());
}

export const toolAssignmentKeys = {
  teams: (d?: string[]) => ['tool-assign', 'teams', d ?? null] as const,
  teamUnits: (t: string | null) => ['tool-assign', 'team-units', t] as const,
  assignable: (d: string | null) => ['tool-assign', 'assignable', d] as const,
};

export function useTeamsWithToolCounts(divisionIds?: string[]) {
  return useQuery({
    queryKey: toolAssignmentKeys.teams(divisionIds),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_teams_with_tool_counts', {
        p_division_ids: divisionIds && divisionIds.length ? divisionIds : null,
      });
      if (error) throw toError(error, 'Load teams with tool counts');
      return data ?? [];
    },
  });
}

export function useTeamToolUnits(teamId: string | null) {
  return useQuery({
    queryKey: toolAssignmentKeys.teamUnits(teamId),
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_tool_units', { p_team_id: teamId });
      if (error) throw toError(error, 'Load team tool units');
      return data ?? [];
    },
  });
}

export function useAssignableToolUnits(divisionId: string | null) {
  return useQuery({
    queryKey: toolAssignmentKeys.assignable(divisionId),
    enabled: !!divisionId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_assignable_tool_units', { p_division_id: divisionId });
      if (error) throw toError(error, 'Load assignable units');
      return data ?? [];
    },
  });
}

function useInvalidateAssign() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['tool-assign'] });
}

export function useAssignToolUnit() {
  const invalidate = useInvalidateAssign();
  return useMutation({
    mutationFn: async (v: { unitId: string; teamId: string; notes?: string }) => {
      const { data, error } = await supabase.rpc('rpc_assign_tool_unit_to_team', {
        p_unit_id: v.unitId, p_team_id: v.teamId, p_notes: v.notes ?? null,
      });
      if (error) throw toError(error, 'Assign tool to team');
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function useMoveToolUnit() {
  const invalidate = useInvalidateAssign();
  return useMutation({
    mutationFn: async (v: { unitId: string; toTeamId: string; notes?: string }) => {
      const { data, error } = await supabase.rpc('rpc_move_tool_unit_to_team', {
        p_unit_id: v.unitId, p_to_team_id: v.toTeamId, p_notes: v.notes ?? null,
      });
      if (error) throw toError(error, 'Move tool to team');
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function useReturnToolUnit() {
  const invalidate = useInvalidateAssign();
  return useMutation({
    mutationFn: async (v: { unitId: string; notes?: string }) => {
      const { error } = await supabase.rpc('rpc_return_tool_unit', { p_unit_id: v.unitId, p_notes: v.notes ?? null });
      if (error) throw toError(error, 'Return tool');
    },
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 2: Write `useToolUnitHistory.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();
function toError(e: any, ctx: string): Error {
  if (!e) return new Error(ctx);
  return new Error(`${ctx}: [${e.code ?? '?'}] ${e.message ?? ''}${e.details ? ' | ' + e.details : ''}`.trim());
}

export function useToolUnitTimeline(unitId: string | null) {
  return useQuery({
    queryKey: ['tool-unit-timeline', unitId],
    enabled: !!unitId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_tool_unit_timeline', { p_unit_id: unitId });
      if (error) throw toError(error, 'Load tool unit timeline');
      return data ?? [];
    },
  });
}

export function useSearchToolUnits(query: string) {
  return useQuery({
    queryKey: ['tool-unit-search', query],
    enabled: query.trim().length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_tool_units', { p_query: query.trim() });
      if (error) throw toError(error, 'Search tool units');
      return data ?? [];
    },
  });
}
```

- [ ] **Step 3: Typecheck + lint** — Run: `npx tsc --noEmit && npx eslint src/hooks/useToolAssignments.ts src/hooks/useToolUnitHistory.ts`. Expected: clean. (If `supabase.rpc` names error against the freshly-generated types, confirm Task 5 regenerated them.)

- [ ] **Step 4: Commit** (`feat(hooks): tool assignment + history hooks (assign/move/return, team units, timeline, search)`).

---

## Task 7: Operations nav entry + route + hub tab shell

**Files:**
- Create: `src/app/(dashboard)/operations/tools-assets/page.tsx` *(confirm the router group by opening the Custody page's file — ISSUE-5)*, `src/components/warehouse/tools-assets/ToolsAssetsHub.tsx`.
- Modify: the Operations nav definition (`NAV_TREE` — find via `git grep -n "Custody" src` and locate the nav array with Custody/Consumption/Damaged Stock).

**Interfaces:**
- Produces: route reachable from Operations → **Tools & Assets**; `ToolsAssetsHub` renders two tabs (`Teams`, `History & Usage`).

- [ ] **Step 1: Locate the Custody route + nav** — Run: `git grep -n "custody" src/app | head` and `git grep -n "Damaged Stock\|Consumption" src | head`. Open the Custody page to copy its route-group, layout, and permission-guard pattern. Record the exact nav array + permission key convention in `../issues.md` (resolve ISSUE-5/ISSUE-6).

- [ ] **Step 2: Decide + wire the permission** — per ISSUE-6, default to reusing `inventory.catalog.manage` for the write actions and the same view-gate Custody uses for the page. Add the nav entry mirroring the Custody entry (icon: reuse the tools icon used by `ToolsAssetsView`; label **"Tools & Assets"**).

- [ ] **Step 3: Write the page** (mirror the Custody page shell — provider wrappers, permission guard):

```tsx
// src/app/(dashboard)/operations/tools-assets/page.tsx
import { ToolsAssetsHub } from '@/components/warehouse/tools-assets/ToolsAssetsHub';
export default function ToolsAssetsPage() {
  return <ToolsAssetsHub />;
}
```

- [ ] **Step 4: Write `ToolsAssetsHub.tsx`** (shadcn `Tabs`; Repair tab is Phase 2 — omit now):

```tsx
'use client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TeamsTab } from './TeamsTab';
import { HistoryUsageTab } from './HistoryUsageTab';

export function ToolsAssetsHub() {
  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold">Tools &amp; Assets</h1>
        <p className="text-sm text-muted-foreground">Assign tools to teams, move them, and track usage history.</p>
      </header>
      <Tabs defaultValue="teams" className="w-full">
        <TabsList>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="history">History &amp; Usage</TabsTrigger>
        </TabsList>
        <TabsContent value="teams"><TeamsTab /></TabsContent>
        <TabsContent value="history"><HistoryUsageTab /></TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + lint** — `npx tsc --noEmit && npx eslint src/app/\(dashboard\)/operations/tools-assets/page.tsx src/components/warehouse/tools-assets/ToolsAssetsHub.tsx`. (Create temporary stub `TeamsTab`/`HistoryUsageTab` exports returning `null` if needed to compile; they are implemented in Tasks 8 & 10 — or implement Tasks 8/10 before this lint step.)

- [ ] **Step 6: Commit** (`feat(tools-assets): Operations nav entry + hub route + tab shell`). **Do not push** — batch for the ship task.

---

## Task 8: Teams tab — cards + team detail

**Files:**
- Create: `src/components/warehouse/tools-assets/TeamsTab.tsx`, `src/components/warehouse/tools-assets/TeamToolsDetail.tsx`.

**Interfaces:**
- Consumes: `useTeamsWithToolCounts`, `useTeamToolUnits`, `useActiveDivision().viewDivisionIds` (top-bar division filter — see `reference_inventory_stock_scoping`).
- Produces: `TeamsTab` (default export used by the hub), `TeamToolsDetail`.

- [ ] **Step 1: Write `TeamsTab.tsx`** — responsive card grid; clicking a card selects a team and reveals `TeamToolsDetail`. Scope to the active division(s).

```tsx
'use client';
import { useState } from 'react';
import { useTeamsWithToolCounts } from '@/hooks/useToolAssignments';
import { useActiveDivision } from '@/hooks/useActiveDivision'; // confirm hook name/path
import { TeamToolsDetail } from './TeamToolsDetail';

export function TeamsTab() {
  const { viewDivisionIds } = useActiveDivision();
  const ids = Array.from(viewDivisionIds ?? []);
  const { data: teams = [], isLoading, error } = useTeamsWithToolCounts(ids.length ? ids : undefined);
  const [selected, setSelected] = useState<{ id: string; name: string; divisionId: string } | null>(null);

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (selected) return <TeamToolsDetail team={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
      {isLoading && <p className="text-sm text-muted-foreground">Loading teams…</p>}
      {!isLoading && teams.length === 0 && <p className="text-sm text-muted-foreground">No teams in the selected division.</p>}
      {teams.map((t: any) => (
        <button key={t.team_id} onClick={() => setSelected({ id: t.team_id, name: t.team_name, divisionId: t.division_id })}
          className="text-left rounded-lg border p-4 min-h-[7rem] hover:bg-accent transition-colors">
          <div className="font-medium truncate">{t.team_name}</div>
          <div className="text-xs text-muted-foreground truncate">{t.division_name}</div>
          <div className="mt-2 text-sm">{t.held_count} item{t.held_count === 1 ? '' : 's'}</div>
          {t.responsible_person_name && <div className="text-xs text-muted-foreground truncate">RP: {t.responsible_person_name}</div>}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `TeamToolsDetail.tsx`** — the team's units + per-row Move / Return actions + an "Assign item" button. Human-readable labels only; table scrolls horizontally on mobile.

```tsx
'use client';
import { useState } from 'react';
import { useTeamToolUnits, useReturnToolUnit } from '@/hooks/useToolAssignments';
import { MoveToolUnitDialog } from './MoveToolUnitDialog';
import { AssignToolUnitDialog } from './AssignToolUnitDialog';

export function TeamToolsDetail({ team, onBack }: { team: { id: string; name: string; divisionId: string }; onBack: () => void }) {
  const { data: units = [], isLoading, error } = useTeamToolUnits(team.id);
  const ret = useReturnToolUnit();
  const [moveUnit, setMoveUnit] = useState<{ id: string; label: string } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onBack} className="text-sm underline">← Teams</button>
        <div className="font-medium truncate">{team.name}</div>
        <button onClick={() => setAssignOpen(true)} className="rounded-md border px-3 h-9 text-sm">Assign item</button>
      </div>
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground">
            <th className="p-2">Item</th><th className="p-2">Serial</th><th className="p-2 hidden md:table-cell">Brand</th>
            <th className="p-2">Condition</th><th className="p-2">Status</th><th className="p-2"></th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td className="p-2" colSpan={6}>Loading…</td></tr>}
            {!isLoading && units.length === 0 && <tr><td className="p-3 text-muted-foreground" colSpan={6}>No tools assigned to this team.</td></tr>}
            {units.map((u: any) => (
              <tr key={u.unit_id} className="border-b last:border-0">
                <td className="p-2">{u.item_name ?? '—'}</td>
                <td className="p-2 font-mono text-xs">{u.serial_number ?? '—'}</td>
                <td className="p-2 hidden md:table-cell">{u.brand ?? '—'}</td>
                <td className="p-2">{u.condition}</td>
                <td className="p-2">{u.status}</td>
                <td className="p-2 whitespace-nowrap">
                  <button onClick={() => setMoveUnit({ id: u.unit_id, label: `${u.item_name ?? ''} ${u.serial_number ?? ''}`.trim() })}
                    className="text-xs underline mr-3">Move</button>
                  <button onClick={() => ret.mutate({ unitId: u.unit_id })} className="text-xs underline">Return</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ret.error && <p className="text-sm text-destructive">{(ret.error as Error).message}</p>}
      {moveUnit && <MoveToolUnitDialog unit={moveUnit} fromTeamId={team.id} divisionId={team.divisionId} onClose={() => setMoveUnit(null)} />}
      {assignOpen && <AssignToolUnitDialog teamId={team.id} divisionId={team.divisionId} onClose={() => setAssignOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint** — `npx tsc --noEmit && npx eslint src/components/warehouse/tools-assets/TeamsTab.tsx src/components/warehouse/tools-assets/TeamToolsDetail.tsx`. (Confirm `useActiveDivision` import path; grep it.)

- [ ] **Step 4: Commit** (`feat(tools-assets): Teams tab — cards + team detail (list, move, return, assign)`).

---

## Task 9: Move + Assign dialogs (same-division pickers)

**Files:**
- Create: `src/components/warehouse/tools-assets/MoveToolUnitDialog.tsx`, `src/components/warehouse/tools-assets/AssignToolUnitDialog.tsx`.

**Interfaces:**
- Consumes: `useTeamsWithToolCounts(divisionId)` (destination teams — filtered to the unit's division), `useMoveToolUnit`, `useAssignableToolUnits(divisionId)`, `useAssignToolUnit`.

- [ ] **Step 1: Write `MoveToolUnitDialog.tsx`** — destination team `Select` scoped to the SAME division (via `useTeamsWithToolCounts([divisionId])`, excluding `fromTeamId`); label = team name (never id); single remaining option pre-selected + disabled; dialog standards (sticky footer).

```tsx
'use client';
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useTeamsWithToolCounts, useMoveToolUnit } from '@/hooks/useToolAssignments';

export function MoveToolUnitDialog({ unit, fromTeamId, divisionId, onClose }:
  { unit: { id: string; label: string }; fromTeamId: string; divisionId: string; onClose: () => void }) {
  const { data: teams = [] } = useTeamsWithToolCounts([divisionId]);
  const options = useMemo(() => teams.filter((t: any) => t.team_id !== fromTeamId), [teams, fromTeamId]);
  const only = options.length === 1 ? options[0].team_id : '';
  const [toTeam, setToTeam] = useState<string>(only);
  const move = useMoveToolUnit();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-full h-full sm:h-auto sm:max-w-md rounded-none sm:rounded-lg flex flex-col">
        <DialogHeader><DialogTitle>Move “{unit.label}”</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          <label className="text-sm">Destination team (same division)</label>
          <Select value={toTeam || undefined} onValueChange={setToTeam} disabled={options.length <= 1}>
            <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Select team…" /></SelectTrigger>
            <SelectContent>
              {options.map((t: any) => <SelectItem key={t.team_id} value={t.team_id}>{t.team_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {options.length === 0 && <p className="text-xs text-muted-foreground">No other team in this division.</p>}
          {move.error && <p className="text-sm text-destructive">{(move.error as Error).message}</p>}
        </div>
        <DialogFooter className="sticky bottom-0 bg-background">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!toTeam || move.isPending}
            onClick={() => move.mutate({ unitId: unit.id, toTeamId: toTeam }, { onSuccess: onClose })}>
            {move.isPending ? 'Moving…' : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write `AssignToolUnitDialog.tsx`** — unit `Select` from `useAssignableToolUnits(divisionId)` (division's free units); label = item name + serial; on confirm `useAssignToolUnit({ unitId, teamId })`. Same dialog standards.

```tsx
'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useAssignableToolUnits, useAssignToolUnit } from '@/hooks/useToolAssignments';

export function AssignToolUnitDialog({ teamId, divisionId, onClose }:
  { teamId: string; divisionId: string; onClose: () => void }) {
  const { data: units = [], isLoading } = useAssignableToolUnits(divisionId);
  const [unitId, setUnitId] = useState<string>('');
  const assign = useAssignToolUnit();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-full h-full sm:h-auto sm:max-w-md rounded-none sm:rounded-lg flex flex-col">
        <DialogHeader><DialogTitle>Assign a tool to this team</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          <label className="text-sm">Available tool (this division)</label>
          <Select value={unitId || undefined} onValueChange={setUnitId} disabled={isLoading || units.length === 0}>
            <SelectTrigger className="h-10 w-full"><SelectValue placeholder={isLoading ? 'Loading…' : 'Select tool…'} /></SelectTrigger>
            <SelectContent>
              {units.map((u: any) => (
                <SelectItem key={u.unit_id} value={u.unit_id}>
                  {(u.item_name ?? 'Tool')}{u.serial_number ? ` — ${u.serial_number}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isLoading && units.length === 0 && <p className="text-xs text-muted-foreground">No unassigned tools in this division.</p>}
          {assign.error && <p className="text-sm text-destructive">{(assign.error as Error).message}</p>}
        </div>
        <DialogFooter className="sticky bottom-0 bg-background">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!unitId || assign.isPending}
            onClick={() => assign.mutate({ unitId, teamId }, { onSuccess: onClose })}>
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Typecheck + lint** the two dialogs. Confirm the shadcn import paths (`@/components/ui/*`) match the project.

- [ ] **Step 4: Commit** (`feat(tools-assets): move + assign dialogs (same-division pickers, layout-stable)`).

---

## Task 10: History & Usage tab — search + item timeline

**Files:**
- Create: `src/components/warehouse/tools-assets/HistoryUsageTab.tsx`, `src/components/warehouse/tools-assets/ToolUnitTimeline.tsx`.

**Interfaces:**
- Consumes: `useSearchToolUnits`, `useToolUnitTimeline`.

- [ ] **Step 1: Write `HistoryUsageTab.tsx`** — debounced serial/name search → results list → click a result to open its timeline.

```tsx
'use client';
import { useState } from 'react';
import { useSearchToolUnits } from '@/hooks/useToolUnitHistory';
import { ToolUnitTimeline } from './ToolUnitTimeline';

export function HistoryUsageTab() {
  const [q, setQ] = useState('');
  const { data: results = [], isFetching, error } = useSearchToolUnits(q);
  const [openUnit, setOpenUnit] = useState<{ id: string; label: string } | null>(null);

  if (openUnit) return <ToolUnitTimeline unit={openUnit} onBack={() => setOpenUnit(null)} />;

  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by serial number or item name…"
        className="w-full sm:max-w-md h-10 rounded-md border px-3 text-sm" />
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {isFetching && <p className="text-sm text-muted-foreground">Searching…</p>}
      <div className="rounded-lg border divide-y">
        {q.trim() && !isFetching && results.length === 0 && <p className="p-3 text-sm text-muted-foreground">No matches.</p>}
        {results.map((r: any) => (
          <button key={r.unit_id} onClick={() => setOpenUnit({ id: r.unit_id, label: `${r.item_name ?? 'Tool'} — ${r.serial_number ?? ''}` })}
            className="w-full text-left p-3 hover:bg-accent flex items-center justify-between gap-2">
            <span className="truncate">{r.item_name ?? 'Tool'} <span className="font-mono text-xs text-muted-foreground">{r.serial_number}</span></span>
            <span className="text-xs text-muted-foreground truncate">{r.current_team_name ?? 'Unassigned'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `ToolUnitTimeline.tsx`** — the item detail: first-assigned date, ordered stints with per-stint days + current holder, and total days per team. Reserve `min-h` so the header doesn't jump while loading.

```tsx
'use client';
import { useMemo } from 'react';
import { useToolUnitTimeline } from '@/hooks/useToolUnitHistory';

export function ToolUnitTimeline({ unit, onBack }: { unit: { id: string; label: string }; onBack: () => void }) {
  const { data: rows = [], isLoading, error } = useToolUnitTimeline(unit.id);
  const firstAssigned = rows.length ? rows[0].assigned_at : null;
  const perTeam = useMemo(() => {
    const m = new Map<string, { name: string; days: number }>();
    for (const r of rows as any[]) {
      const cur = m.get(r.team_id) ?? { name: r.team_name ?? '—', days: 0 };
      cur.days += Number(r.days ?? 0);
      m.set(r.team_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.days - a.days);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-sm underline">← Search</button>
        <div className="font-medium truncate">{unit.label}</div>
      </div>
      <div className="min-h-[3rem] text-sm text-muted-foreground">
        {error && <span className="text-destructive">{(error as Error).message}</span>}
        {!error && (isLoading ? 'Loading history…' :
          firstAssigned ? `First assigned ${new Date(firstAssigned).toLocaleDateString()} · ${rows.length} stint${rows.length === 1 ? '' : 's'}`
          : 'Never assigned to a team yet.')}
      </div>

      {perTeam.length > 0 && (
        <div className="rounded-lg border p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">Total days per team</div>
          <ul className="space-y-1 text-sm">
            {perTeam.map((t, i) => <li key={i} className="flex justify-between"><span className="truncate">{t.name}</span><span>{t.days.toFixed(1)} d</span></li>)}
          </ul>
        </div>
      )}

      <ol className="relative border-l pl-4 space-y-3">
        {(rows as any[]).map((r) => (
          <li key={r.assignment_id} className="text-sm">
            <div className="font-medium truncate">{r.team_name ?? '—'} {r.is_current && <span className="text-xs text-green-600">(current)</span>}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(r.assigned_at).toLocaleDateString()} → {r.released_at ? new Date(r.released_at).toLocaleDateString() : 'now'} · {Number(r.days).toFixed(1)} days
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint** the two files.

- [ ] **Step 4: Commit** (`feat(tools-assets): History & Usage tab — serial/team search + item timeline + usage-days`).

---

## Task 11: Docs, security audit, and guarded ship

**Files:**
- Modify: `docs/flows-registry.md`, `PROGRESS.md`, `EOD/EOD-<today>.md`, `../issues.md`.

- [ ] **Step 1: Flow-registry entries** — add, using the template at the top of `docs/flows-registry.md`, cross-linked with `[[…]]`:
  - **Assign Tool Unit to Team** — hook `useAssignToolUnit`; RPC `rpc_assign_tool_unit_to_team`; ledger write `tool_unit_assignments` + pointer; guard same-division + `inventory.catalog.manage`; component `AssignToolUnitDialog`. Related: `[[Transfer Serialized Tool Unit]]`, `[[Custody & Consumption (unified custody warehouse model · 2026-08-12)]]`.
  - **Move Tool Unit Between Teams** — `useMoveToolUnit` / `rpc_move_tool_unit_to_team`.
  - **Return Tool Unit** — `useReturnToolUnit` / `rpc_return_tool_unit`.
  - **Tool Unit Custody History** — reads `get_tool_unit_timeline` / `search_tool_units`; component `ToolUnitTimeline`.
  - Note on **Transfer Serialized Tool Unit** (`:947`): now also releases an open team assignment (ISSUE-8).

- [ ] **Step 2: Security-audit row** — append to `PROGRESS.md` `## 🔒 Security Audit Log`:
  `| [<today>] | Tools & Assets Phase 1 | ✅ Secrets | ✅ RLS (tool_unit_assignments) | ✅ Auth gate (DEFINER RPCs revoke public, gate inventory.catalog.manage) | ✅ Error handling (toError wrap) | ✅ Layout stability (min-h cards/detail, fixed dialog footers) | same-division guard server-side |`
  Run the checklist: `git grep -nE "sk_|Bearer |apiKey.*=.*['\"]" src` returns nothing new; confirm the new table has RLS + policies; confirm all 8 new RPCs revoke public.

- [ ] **Step 3: PROGRESS + EOD** — move the In-Progress entry to reflect "code-complete on staging, pending operator smoke"; append the EOD task lines.

- [ ] **Step 4: Update `../issues.md`** — mark ISSUE-5/ISSUE-6 DECIDED with what you chose; note any new issue discovered during build.

- [ ] **Step 5: Operator staging smoke (hand off — do NOT self-drive the browser)** — give the operator this checklist:
  - Operations → Tools & Assets loads; Teams tab shows this division's teams with counts.
  - Open a team → Assign item → pick an available tool → it appears in the list; the team count +1.
  - Move it to another team **in the same division** → it leaves the first, joins the second; only same-division teams appear in the picker.
  - Return it → it leaves the team; becomes assignable again.
  - History & Usage → search its serial → open it → timeline shows the stints with day counts + current holder; total-days-per-team adds up.
  - Layout: selecting values causes no row/header jump; cards reflow on a phone width.

- [ ] **Step 6: Guarded new-prod apply + push (ASK FIRST)** — only after operator staging sign-off and an explicit go-ahead:
  - For each of the 4 migrations, drift-check new-prod first (`db query --linked` the affected live objects; for `rpc_transfer_tool_unit`, confirm new-prod's live body matches the staging base you rebased on), then apply via the guarded flow; post-apply verify objects + a rolled-back probe on new-prod.
  - Then push the batched frontend commits (ONE Vercel build). Confirm the build goes green; hand prod smoke to the operator.

---

## Self-Review (run before executing)

1. **Spec coverage:** assign-to-team ✔ (Task 2/9), move-between-teams ✔ (Task 2/9, same-division), assign-new ✔ (Task 9), usage-days ✔ (Task 4/10), search by serial/team ✔ (Task 4/10), item timeline with first-assigned + stints + durations ✔ (Task 10). Monthly check / repair / scrap → **Phase 2 (out of scope here).**
2. **Placeholder scan:** the only deferred specifics are live-DB lookups the project's own rules require (permission expression, enum values, exact column names, the `rpc_transfer_tool_unit` body) — each is an explicit fetch step, not a hand-wave.
3. **Type consistency:** hook mutation vars (`{ unitId, teamId }`, `{ unitId, toTeamId }`, `{ unitId }`) match the dialogs' call sites; RPC param names (`p_unit_id`, `p_team_id`, `p_to_team_id`, `p_notes`, `p_division_ids`, `p_query`) match the SQL; read-RPC return columns match the components' field access (`team_id`, `held_count`, `item_name`, `serial_number`, `days`, `is_current`).
4. **Division rule:** enforced server-side in every write RPC (assert `unit.division_id = team.division_id`) AND in the UI pickers (scoped to the division) — defense in depth.

