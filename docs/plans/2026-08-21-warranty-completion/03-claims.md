# Stage 3 — Warranty claims (sale) + void, wired into Returns (Approach B)

> Read the folder [README.md](README.md) first — Global Constraints + Live-verified facts apply. Do Stages 1–2 first.

**Deliverables:** a `warranty_claims` bounded unit with a full lifecycle (open → covered/rejected → in_progress → resolved, plus void), where a **covered sale claim** creates a warranty-flagged sale return that rides the *existing* inspection → restock → replacement/credit/refund/repair RPCs; a Claims tab + claim detail UI under Sales; a `sales.warranty_claims.manage` permission.

**Architecture note:** `warranty_claims` consumes the Returns machinery through (a) creating a `so_po_returns` row linked via `warranty_claim_id`, and (b) a trigger that syncs the claim to `resolved` when that return reaches a terminal resolution. It does **not** re-implement any return logic — one source of truth.

---

### Task 1: Schema — `warranty_claims`, enum, numbering, return link, RLS

**Files:**
- Create: `supabase/migrations/20261002000200_warranty_claims_schema.sql` (+ mirror)

**Interfaces:**
- Produces: table `warranty_claims`, enum `warranty_claim_status`, `so_po_returns.warranty_claim_id`, `next_warranty_claim_number(p_division_id uuid)`.

- [ ] **Step 1: Write the migration**

```sql
BEGIN;

CREATE TYPE public.warranty_claim_status AS ENUM
  ('open','covered','rejected','in_progress','resolved','void');

CREATE TABLE public.warranty_claims (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number          text UNIQUE NOT NULL,
  warranty_record_id    uuid NOT NULL REFERENCES public.warranty_records(id) ON DELETE RESTRICT,
  warranty_type         public.warranty_source_type NOT NULL,   -- snapshot; drives workflow (sale only for now)
  status                public.warranty_claim_status NOT NULL DEFAULT 'open',
  issue_description     text NOT NULL,
  reported_by           uuid REFERENCES public.user_data(id),
  reported_at           timestamptz NOT NULL DEFAULT now(),
  decision              text CHECK (decision IN ('covered','rejected')),
  decided_by            uuid REFERENCES public.user_data(id),
  decided_at            timestamptz,
  decision_reason       text,
  resolution_type       text CHECK (resolution_type IN ('replacement','credit','refund','repair')),
  resolved_at           timestamptz,
  linked_return_id      uuid REFERENCES public.so_po_returns(id),
  linked_credit_note_id uuid,
  void_reason           text,
  voided_by             uuid REFERENCES public.user_data(id),
  voided_at             timestamptz,
  division_id           uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_warranty_claims_record   ON public.warranty_claims(warranty_record_id);
CREATE INDEX idx_warranty_claims_division ON public.warranty_claims(division_id);
CREATE INDEX idx_warranty_claims_status   ON public.warranty_claims(status);

ALTER TABLE public.so_po_returns
  ADD COLUMN IF NOT EXISTS warranty_claim_id uuid REFERENCES public.warranty_claims(id);
CREATE INDEX IF NOT EXISTS idx_so_po_returns_warranty_claim ON public.so_po_returns(warranty_claim_id);

-- Numbering (mirror next_warranty_number's per-division counter pattern)
CREATE TABLE public.warranty_claim_counters (
  division_id uuid PRIMARY KEY,
  next_value  integer NOT NULL DEFAULT 1
);

CREATE OR REPLACE FUNCTION public.next_warranty_claim_number(p_division_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_n integer; v_slug text;
BEGIN
  INSERT INTO warranty_claim_counters(division_id, next_value)
  VALUES (p_division_id, 1)
  ON CONFLICT (division_id) DO UPDATE SET next_value = warranty_claim_counters.next_value + 1
  RETURNING next_value INTO v_n;
  v_slug := public.resolve_warranty_division_slug(p_division_id);  -- reuse existing slug helper
  RETURN 'WC-' || v_slug || '-' || lpad(v_n::text, 5, '0');
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.next_warranty_claim_number(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.next_warranty_claim_number(uuid) TO authenticated;

-- RLS: division-scoped read; writes only via the DEFINER RPCs in later tasks.
ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY warranty_claims_select ON public.warranty_claims
  FOR SELECT TO authenticated USING (public.is_division_visible(division_id));
-- No INSERT/UPDATE/DELETE policy for authenticated → only SECURITY DEFINER RPCs write.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.warranty_claims FROM authenticated;
REVOKE ALL ON public.warranty_claims FROM anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
```
Mirror to `migrations-staging/`.

- [ ] **Step 2: Apply + verify**

```bash
printf 'y\n' | npx supabase db push
npx supabase db query --linked "select coalesce(to_regclass('public.warranty_claims')::text,'MISSING') as tbl, (select count(*) from pg_policies where tablename='warranty_claims') as policies, (select count(*) from information_schema.columns where table_name='so_po_returns' and column_name='warranty_claim_id') as ret_link;"
```
Expected: `tbl=warranty_claims`, `policies>=1`, `ret_link=1`.

- [ ] **Step 3: Commit** (migration + mirror; HEREDOC both trailers).

---

### Task 2: Permission key `sales.warranty_claims.manage`

**Files:**
- Modify: `src/components/master-data/PermissionTree.tsx` (add the grantable leaf under Sales)
- Modify: `src/lib/route-permissions.ts` (claims live under `/sales/warranties`, already guarded by `sales.warranties.view` for read; the manage key gates write actions in RPC + UI buttons)

- [ ] **Step 1:** In NAV_TREE, add `sales.warranty_claims.manage` (label "Manage Warranty Claims") next to `sales.warranties.view`. Commit.

---

### Task 3: Claim RPCs — file / assess / void (self-contained)

**Files:**
- Create: `supabase/migrations/20261002000300_warranty_claim_rpcs.sql` (+ mirror)

**Interfaces:**
- Produces:
  - `rpc_file_warranty_claim(p_warranty_record_id uuid, p_issue text) → uuid` (claim id)
  - `rpc_assess_warranty_claim(p_claim_id uuid, p_decision text, p_reason text) → void`
  - `rpc_void_warranty_claim(p_claim_id uuid, p_reason text) → void`

- [ ] **Step 1: Write the migration**

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_file_warranty_claim(p_warranty_record_id uuid, p_issue text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_profile uuid; v_rec RECORD; v_id uuid;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();
  IF NOT public._user_has_permission(v_profile, 'sales.warranty_claims.manage') THEN
    RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
  END IF;
  SELECT id, source_type, division_id INTO v_rec FROM warranty_records WHERE id = p_warranty_record_id;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Warranty record not found'; END IF;
  IF COALESCE(btrim(p_issue),'') = '' THEN RAISE EXCEPTION 'Issue description is required'; END IF;
  INSERT INTO warranty_claims(claim_number, warranty_record_id, warranty_type, status, issue_description, reported_by, division_id)
  VALUES (public.next_warranty_claim_number(v_rec.division_id), v_rec.id, v_rec.source_type, 'open', btrim(p_issue), v_profile, v_rec.division_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.rpc_assess_warranty_claim(p_claim_id uuid, p_decision text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_profile uuid; v_status warranty_claim_status;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();
  IF NOT public._user_has_permission(v_profile, 'sales.warranty_claims.manage') THEN
    RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
  END IF;
  IF p_decision NOT IN ('covered','rejected') THEN RAISE EXCEPTION 'decision must be covered or rejected'; END IF;
  SELECT status INTO v_status FROM warranty_claims WHERE id = p_claim_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'Only an open claim can be assessed (status: %)', v_status USING ERRCODE='42501'; END IF;
  IF p_decision = 'rejected' AND COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
  UPDATE warranty_claims
    SET decision = p_decision, decided_by = v_profile, decided_at = now(), decision_reason = NULLIF(btrim(p_reason),''),
        status = CASE WHEN p_decision = 'covered' THEN 'covered'::warranty_claim_status ELSE 'rejected'::warranty_claim_status END,
        updated_at = now()
    WHERE id = p_claim_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.rpc_void_warranty_claim(p_claim_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_profile uuid; v_status warranty_claim_status;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();
  IF NOT public._user_has_permission(v_profile, 'sales.warranty_claims.manage') THEN
    RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
  END IF;
  IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A void reason is required'; END IF;
  SELECT status INTO v_status FROM warranty_claims WHERE id = p_claim_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;
  IF v_status IN ('resolved','void') THEN RAISE EXCEPTION 'Claim is already %', v_status USING ERRCODE='42501'; END IF;
  UPDATE warranty_claims
    SET status = 'void', void_reason = btrim(p_reason), voided_by = v_profile, voided_at = now(), updated_at = now()
    WHERE id = p_claim_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.rpc_file_warranty_claim(uuid,text)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_assess_warranty_claim(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_void_warranty_claim(uuid,text)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_file_warranty_claim(uuid,text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_assess_warranty_claim(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_void_warranty_claim(uuid,text)    TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
```
> Verify before writing: confirm the helper is named `_user_has_permission(uuid, text)` (used by `reports-auth.ts`) — if the SQL-callable variant differs, use the correct one (`_auth_user_has_permission(text)` derives the profile itself; either is fine, adjust the calls consistently).

- [ ] **Step 2: Apply + probe (rolled-back)**

```bash
printf 'y\n' | npx supabase db push
```
Then a rolled-back DO-block probe: as the login role, file a claim against an existing warranty record, assess it covered, then void — `RAISE EXCEPTION` at the end to roll back, printing the intermediate statuses. Confirm each transition + that the permission check path exists. (If no warranty_records exist yet on staging, run Stage 1 Task 2 first.)

- [ ] **Step 3: Commit** (migration + mirror).

---

### Task 4: Start-resolution RPC (creates the warranty return) + claim status-sync trigger

**Files:**
- Create: `supabase/migrations/20261002000400_warranty_claim_resolution_wiring.sql` (+ mirror)

**Interfaces:**
- Consumes: existing return numbering (from `useCreateSaleReturn`), `_return_resolution_status(p_return_id uuid)`, `so_po_returns` terminal statuses.
- Produces: `rpc_start_warranty_claim_resolution(p_claim_id uuid) → uuid` (return id); trigger `trg_sync_warranty_claim_from_return` on `so_po_returns`.

- [ ] **Step 1: Verify the return internals (live) before writing SQL**

Read `src/hooks/useSaleReturns.ts:222-266` and confirm **exactly** how `useCreateSaleReturn` sets `so_po_returns.return_number`, `source_type`, `source_id`, `source_delivery_id`, and what `return_lines` columns it populates. Also run:
```bash
npx supabase db query --linked "select pg_get_functiondef('public._return_resolution_status'::regproc);"
```
to learn what `_return_resolution_status` returns (its shape drives the resolution_type mapping below). Record both findings — they fill the two marked spots in Step 2.

- [ ] **Step 2: Write `rpc_start_warranty_claim_resolution`**

Guarded (`sales.warranty_claims.manage`); requires claim `status='covered'` AND `warranty_type='sale'` (else `RAISE EXCEPTION 'service/contract warranty resolution is not built yet' USING ERRCODE='0A000'`). It reads the claim's `warranty_record`, creates a `so_po_returns` row (**return_number generated exactly as confirmed in Step 1**; `source_type`/`source_id`/`source_delivery_id` from the record's `sale_order_id`/`sale_delivery_line_id`; `division_id` from the claim; `warranty_claim_id = p_claim_id`; `reason = 'Warranty claim ' || claim_number`), inserts `return_lines` from the warranty record (`brand_variant_id, item_name, sku, qty, sale_delivery_line_id`), then sets `warranty_claims.status='in_progress'`, `linked_return_id = <new return>`. Returns the return id. `REVOKE … FROM PUBLIC, anon; GRANT … TO authenticated`.

> The operator then drives the **existing** Returns UI on that return: `rpc_complete_return_inspection` (damaged check) → `rpc_process_return_restock` / `createCreditNoteForReturn` / `rpc_create_partial_replacement` / `rpc_record_return_refund` / `rpc_record_return_store_credit`, and repair via a return-line disposition → `rpc_send_damaged_for_repair`. No new resolution code — this is the whole point of Approach B.

- [ ] **Step 3: Write the status-sync trigger**

`_sync_warranty_claim_from_return()` (SECURITY DEFINER, `SET search_path=public`): AFTER UPDATE ON `so_po_returns` FOR EACH ROW, when `NEW.warranty_claim_id IS NOT NULL` and the return has reached a **terminal** resolution (derive from `NEW.status` + `_return_resolution_status(NEW.id)` per Step 1 findings), set the linked claim `status='resolved'`, `resolved_at=now()`, `linked_credit_note_id = NEW.credit_note_id`, and `resolution_type` mapped from the resolution mix:
  - a partial-replacement delivery exists → `'replacement'`
  - `NEW.credit_note_id` set + refund recorded → `'refund'`; credit/store-credit only → `'credit'`
  - a repair disposition on the return → `'repair'`
(Use the exact terminal-status values + `_return_resolution_status` shape confirmed in Step 1; if the mix is ambiguous, prefer replacement > refund > credit > repair, and leave `resolution_type` NULL rather than guessing when none apply.) Attach:
```sql
DROP TRIGGER IF EXISTS trg_sync_warranty_claim_from_return ON public.so_po_returns;
CREATE TRIGGER trg_sync_warranty_claim_from_return
AFTER UPDATE ON public.so_po_returns FOR EACH ROW
WHEN (NEW.warranty_claim_id IS NOT NULL)
EXECUTE FUNCTION public._sync_warranty_claim_from_return();
```

- [ ] **Step 4: Apply + probe (rolled-back, end-to-end)**

`db push`, then a rolled-back DO block: file→cover→start-resolution (assert a return with `warranty_claim_id` + `return_lines` created, claim `in_progress`); then simulate the return reaching a terminal state and assert the trigger flips the claim to `resolved` with a sensible `resolution_type`. Roll back.

- [ ] **Step 5: Commit** (migration + mirror). Update `docs/flows-registry.md` with a **Warranty Claim (sale)** flow entry cross-linking the Returns flows, in this commit.

---

### Task 5: Hooks

**Files:**
- Create: `src/hooks/useWarrantyClaims.ts`
- Modify: `src/lib/queryKeys.ts` (add `warranty.claims(filters)` + `warranty.claim(id)`)

**Interfaces:**
- Produces: `useWarrantyClaims(filters)`, `useWarrantyClaim(id)`, `useFileWarrantyClaim()`, `useAssessWarrantyClaim()`, `useVoidWarrantyClaim()`, `useStartWarrantyClaimResolution()`.

- [ ] **Step 1:** Add query keys mirroring `warranty.records`.
- [ ] **Step 2:** Write the read hooks (explicit columns, `.limit(200)`, division + status + search filters; join the warranty record for item/customer display — never render UUIDs, resolve customer to name).
- [ ] **Step 3:** Write the mutations calling the RPCs via the `supabase.rpc('name' as never, args as never)` cast (new RPCs aren't in generated types); surface errors via `humanizeDbError`; invalidate `warranty.claims` + `warranty.records` + (for start-resolution) `saleReturns.all` on success.
- [ ] **Step 4:** `tsc --noEmit` clean; commit.

---

### Task 6: UI — Claims tab, file-claim entry, claim detail

**Files:**
- Modify: `src/app/(dashboard)/sales/warranties/page.tsx` (fill in the `Claims` tab stubbed in Stage 2)
- Create: `src/components/sales/WarrantyClaimDetailDialog.tsx`, `src/components/sales/FileWarrantyClaimDialog.tsx`

**Interfaces:**
- Consumes: Task 5 hooks; the existing Returns detail UI (link out to the created return so the operator resolves it there).

- [ ] **Step 1:** In the Warranties page, populate the **Claims** tab: a `DataTable` of claims (Claim #, Warranty #, Item, Customer-name, Status badge, Decision, Resolution, Reported) with loading/empty/**error** states, search, status filter. Gate write buttons on `sales.warranty_claims.manage` via `useHasPermission`.
- [ ] **Step 2:** `FileWarrantyClaimDialog` — opened from a warranty **record** (add a "File claim" button in the record detail drawer from Stage 2) and/or from the Claims tab (pick a warranty record). Fields: the record (read-only summary) + issue description. Calls `useFileWarrantyClaim`.
- [ ] **Step 3:** `WarrantyClaimDetailDialog` — shows the claim + its warranty record; actions by status: **open** → Assess (Cover / Reject+reason); **covered** → Start resolution (creates the return; then a link/button "Open return →" that navigates to the return in the Returns UI to finish inspection→resolution); any non-terminal → **Void** (+reason). Show the resolution + linked return/credit-note once set. Follow dialog conventions (title wraps, sticky footer, full-screen on mobile, fixed-height sections to avoid layout shift).
- [ ] **Step 4:** `tsc --noEmit` + eslint clean; commit page + dialogs together.

---

### Stage 3 wrap-up

- [ ] Update PROGRESS.md (Completed + Security Audit Log: new `warranty_claims` table RLS division-scoped + RPC-only writes; 5 DEFINER fns revoked from anon + gated; the return-link trigger; no secrets; layout stability on the dialogs) — docs-only commit.
- [ ] Append to `EOD/EOD-YYYY-MM-DD.md`.
- [ ] Operator staging smoke: file → cover/reject → start-resolution → finish via the Returns UI (inspection → credit/replacement/refund/repair) → claim auto-flips to resolved with the right resolution_type; void path; permission gate hides write actions for a role without `sales.warranty_claims.manage`.
- [ ] Deploy gate: after smoke, apply the 3 Stage-3 migrations to new-prod (guarded psql, drift-checked) → one push.

---

## Post-plan self-review (done at authoring)

- **Spec coverage:** foundational (Stage 1) ✓; registry + origin (Stage 2) ✓; claims full lifecycle covered/rejected/void + monitor (Stage 3 Tasks 1/3) ✓; sale claim rides Returns via Approach B (Stage 3 Task 4) ✓; nav under Sales (Stage 2 Task 3, Stage 3 Task 6) ✓; permissions (Stage 2 + Stage 3 Task 2) ✓; type-branching for deferred service/contract (`warranty_type` column + the `warranty_type='sale'` guard in start-resolution) ✓; expiry deferred (not present) ✓.
- **Type consistency:** RPC names/args used in hooks (Task 5) match the migrations (Tasks 3–4); `warranty_claim_status` values match across schema + RPCs + trigger.
- **Flagged live-lookups (not placeholders — project rule requires live-sourcing):** return_number generation + `_return_resolution_status` shape (Task 4 Step 1); the exact permission-helper name (Task 3 Step 1); the `countries` display column (Stage 2 Task 1 Step 1); `create_warranty_records_for_delivery` body (Stage 1/2, sourced via `pg_get_functiondef`).
