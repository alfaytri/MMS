# Stage 1 — Foundational: un-regress issuance + verify it actually works

> Read the folder [README.md](README.md) first — its **Global Constraints** and **Live-verified facts** apply to every task here.

**Why this stage:** warranty records are created *only* by `create_warranty_records_for_delivery` (called from `complete_delivery_inventory`). The live body is correct on both DBs, but a file-ordering landmine means a from-scratch rebuild would re-break it, and the path has **never actually run** (0 records). Nothing in Stage 2/3 is meaningful until issuance is proven.

**Deliverables:** a post-dated hygiene migration so rebuilds can't regress; a proven delivery→record→certificate path.

---

### Task 1: Hygiene migration — re-assert the correct `create_warranty_records_for_delivery` body at a later timestamp

**Problem (files-only, not live):** `20260806280200_fix_warranty_delivery_hook_invoices_ref.sql` (correct, uses `so_invoices`) sorts *before* `20260815003700` (broken, uses the renamed-away `public.invoices`). A fresh `db push` applies the fix then overwrites it with the broken body. Re-issuing the correct body as the newest migration makes the last-writer correct.

**Files:**
- Create: `supabase/migrations/20261002000000_warranty_delivery_hook_reassert_so_invoices.sql`
- Create (mirror): `supabase/migrations-staging/20261002000000_warranty_delivery_hook_reassert_so_invoices.sql`

**Interfaces:**
- Produces: no signature change — `create_warranty_records_for_delivery(p_delivery_id uuid)` stays identical; only its stored body is re-asserted (correct `so_invoices` reference).

- [ ] **Step 1: Fetch the current live body (source of truth)**

Run:
```bash
set -a && . supabase/.temp/migrate.env && set +a
"/c/Program Files/PostgreSQL/18/bin/psql.exe" "$NEW_DB_URL" -At -c "select pg_get_functiondef('public.create_warranty_records_for_delivery'::regproc);" > /tmp/wr_fn.sql
```
Expected: a full `CREATE OR REPLACE FUNCTION public.create_warranty_records_for_delivery(...) … $function$` that contains `so_invoices` and does **not** contain `public.invoices`. (Staging is identical — either DB is a valid source.)

- [ ] **Step 2: Build the migration from that body**

Create the migration file with a header comment explaining the ordering fix, then paste the exact `CREATE OR REPLACE FUNCTION …` body from Step 1, wrapped in `BEGIN; … NOTIFY pgrst, 'reload schema'; COMMIT;`. Do not edit the body. Copy the identical file to `supabase/migrations-staging/`.

Header to prepend:
```sql
-- Re-assert create_warranty_records_for_delivery with the correct so_invoices
-- reference AS THE NEWEST migration. Fixes a file-ordering landmine: the earlier
-- corrective 20260806280200 sorts before the broken 20260815003700, so a fresh
-- `db push` would end with the broken public.invoices body. Both live DBs already
-- hold the correct body, so this is a no-op on staging/new-prod and only protects
-- from-scratch rebuilds. Body copied verbatim from live pg_get_functiondef.
```

- [ ] **Step 3: Apply to staging**

Run:
```bash
printf 'y\n' | npx supabase db push
```
Expected: `Applying migration 20261002000000_warranty_delivery_hook_reassert_so_invoices.sql...` then `Finished supabase db push.`

- [ ] **Step 4: Verify the body post-apply (staging)**

Run:
```bash
npx supabase db query --linked "select position('so_invoices' in pg_get_functiondef('public.create_warranty_records_for_delivery'::regproc)) as so_invoices_pos, position('public.invoices' in pg_get_functiondef('public.create_warranty_records_for_delivery'::regproc)) as bad_pos;"
```
Expected: `so_invoices_pos` > 0 and `bad_pos` = 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261002000000_warranty_delivery_hook_reassert_so_invoices.sql supabase/migrations-staging/20261002000000_warranty_delivery_hook_reassert_so_invoices.sql
git commit -m "$(cat <<'EOF'
fix(warranty): re-assert delivery hook so_invoices body as newest migration

Closes the file-ordering landmine where the corrective 20260806280200 sorts
before the broken 20260815003700, so a fresh db push would end with the
public.invoices body. No-op on live DBs (already correct); protects rebuilds.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Verify issuance end-to-end (operator smoke on staging) — GATE

This path has never run. Confirm it works before building the registry/claims on top of it. No code unless it fails.

**Files:** none (verification only).

- [ ] **Step 1: Ensure a warranty-covered, costed item + a credit/cash customer exist on staging**

In the app (staging): confirm at least one inventory item resolves a warranty policy (Admin → Warranty Policies has an active policy; the item's category default or item override points at it — check the item edit dialog shows an "effective warranty"). Ensure the item has stock with a cost (a received FIFO layer).

- [ ] **Step 2: Run a real sale through delivery**

Create a Sale Order for that item → confirm it → create + confirm a Delivery for the delivered line (Sales → Sale Orders → the SO → deliver; or Sales → Deliveries).

- [ ] **Step 3: Confirm a warranty record was created**

Run:
```bash
npx supabase db query --linked "select warranty_number, item_name, qty, policy_name_snapshot, start_date, end_date, source_type from warranty_records order by created_at desc limit 5;"
```
Expected: a new row per delivered warranty-covered line, with a `warranty_number`, snapshotted policy fields, and start/end dates.

- [ ] **Step 4: Confirm the certificate prints**

In the app: open that delivery (Sales → Deliveries → the delivery → detail dialog) → the **Warranty Certificate** button now renders (it only shows when records exist) → it downloads a PDF.

- [ ] **Step 5: Record the result**

If PASS: note it in PROGRESS.md (Stage 1 gate passed) and proceed to Stage 2.
If FAIL: capture the exact error (from the delivery action or `select` result), then debug `create_warranty_records_for_delivery` (fetch its live body; check the `so_invoices` join columns `issued_date`/`sale_order_id`, the `next_warranty_number` call, and the `get_effective_warranty_policy` resolution). Fix as a follow-up migration (post-dated, mirrored), re-run this task. Do **not** proceed to Stage 2 until this passes.

---

### Stage 1 wrap-up

- [ ] Update PROGRESS.md (Completed bullet + Security Audit Log row: DB-only, no new RLS surface, no secrets) — docs-only commit.
- [ ] Append to `EOD/EOD-YYYY-MM-DD.md`.
- [ ] Deploy gate: after operator staging smoke, apply Task 1's migration to new-prod via guarded psql (drift-check: body already `so_invoices`; this is a no-op re-assert) + push. (Task 2 is verification, nothing to deploy.)
