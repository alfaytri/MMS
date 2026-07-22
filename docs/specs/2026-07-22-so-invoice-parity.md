# SO / Invoice — Mirror PO / Bill Treatment

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the same quality pass to the AR side that landed on the AP side in commits `e8fabad7` and `7242bb3b`: auto-recompute `invoices.paid_amount` from `payments` (currency-correct), drop the manual "Mark as Paid" toggle, enforce 1 SO = 1 invoice, and renumber SOs + Invoices to the monthly-reset scheme.

**Architecture:** The AR side already has most of the pieces — `invoice_recompute_paid_fn` trigger, `payments_redirect_to_invoice_fn`, `generate_invoice_from_so` RPC with an internal 1:1 check. Three defects remain: (1) the recompute sums `amount_qar` and breaks for foreign-currency invoices — same bug we fixed on bills; (2) Dibsy (Qatar's online card gateway) is wired into AR invoices but shouldn't be — sales-order invoices are paid via cash / bank transfer / cheque only, never online card; (3) the RPC's 1:1 enforcement isn't backed by a DB UNIQUE constraint. Layer on the numbering rework and this is a straightforward mirror of the PO/Bill work.

**Dibsy scope decision (locked — Option A):** Rip Dibsy out of `public.invoices` entirely. That means both invoice-touching Dibsy endpoints (`create-invoice-link` — dead — and `create-customer-batch-payment` — live), both invoice branches in the webhook (`metadata.invoice_id` + `metadata.customer_batch_invoice_ids`), the Dibsy button on the collections page (`/invoices/pending-payments/[customerId]`), and the two columns `invoices.dibsy_payment_id` + `invoices.dibsy_checkout_url`.

**Critical:** `tl_invoices` (Telelink invoices) has its OWN independent `dibsy_*` columns and its OWN webhook branches. Telelink is a live Dibsy flow and must stay untouched. The migration in Task 2 only drops columns from `public.invoices`, never from `tl_invoices`.

**UI rename (locked):** After Dibsy removal, rename user-visible "Invoices" labels to "SO Invoices" so `public.invoices` (sales orders) is unambiguously distinguished from `tl_invoices` (Telelink). Task 2b covers plural / index-level display strings on sales-order routes only; Task 2c below extends this to the DB itself.

**DB table rename (locked — Task 2c):** In addition to the UI rename, rename the DB table `public.invoices` → `public.so_invoices` for "clear understanding" (the user's direct request). This ripples through: FK constraints (auto-updated by Postgres), views (auto-updated by parse tree), RLS policies (auto-updated), triggers (auto-updated), RPC bodies (must be rewritten — text-defined). Migration `20260723115000_rename_invoices_to_so_invoices.sql` uses `pg_get_functiondef` + `regexp_replace('\minvoices\M', 'so_invoices', 'g')` to auto-rewrite every affected function. Code side: `.from('invoices')` → `.from('so_invoices')` in 13 files (25 total occurrences) + types regen. Ships in the same combined commit as Task 2 + Task 2b.

**Downstream impact on Tasks 3-6 (locked):** All subsequent tasks' SQL bodies must reference `public.so_invoices` (not `public.invoices`). Task briefs 3-6 in this document were drafted before the rename decision — treat their `invoices` references as `so_invoices` when executing. The recreated `customer_invoices` view (from Task 2's migration) still selects from the underlying table via Postgres's OID-bound parse tree, so no additional rebuild needed after the rename.

**Tech Stack:** Next.js 15 App Router, Supabase Postgres (staging `mwvblpgbgxipvrevkeff`, prod `wkmvjxxmzstsvahuiwsz` — paused), TypeScript strict. Migrations via `npx supabase db push`. Dibsy is an external Qatar payment gateway; its webhook is a Next.js API route.

## Global Constraints

- **Commits include both authors:**
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```
- **Every migration mirrored** to `supabase/migrations/` AND `supabase/migrations-staging/`. `db push` only reads from `supabase/migrations/`; the staging mirror is for record-keeping and future reset scenarios.
- **All DDL is idempotent** — `CREATE ... IF NOT EXISTS`, `ALTER ... ADD CONSTRAINT` inside a `DO $$ ... EXCEPTION WHEN duplicate_object` block. Safe against both staging and prod.
- **Types regen after DB changes:** `npx supabase gen types typescript --project-id mwvblpgbgxipvrevkeff --schema public > src/types/database.types.ts` then re-append the four helper aliases (`AllTables`, `DBTable`, `DBInsert`, `DBUpdate`) — the CLI strips them every time.
- **No commits until the user confirms** the change works via the browser or a targeted query.
- **Prod is paused.** All DB changes apply to staging only. Migrations are ready to run against prod when it's unpaused.
- **Dibsy live-mode considerations:** Dibsy runs in test mode today (per the memory `reference_dibsy.md`). Any webhook rewrite must keep the test-mode secret validation intact.
- **No test infrastructure exists** for these hooks / API routes. Verification is manual smoke suite in staging + `tsc --noEmit --skipLibCheck` gate per task.

---

## File Structure

**Modified (Task 2 — Dibsy removal from AR):**
- `src/app/api/payments/dibsy/webhook/route.ts` — delete BOTH invoice branches: `metadata.invoice_id` (dead) AND `metadata.customer_batch_invoice_ids` (live). Non-invoice branches (Telelink etc.) untouched.
- `src/components/invoices/CustomerInvoiceDetailContent.tsx` — remove the "Send payment link via Dibsy" button + its `fetch('/api/payments/dibsy/create-customer-batch-payment')` call. The list-of-outstanding-invoices view itself stays.
- Any other UI referencing `dibsy_checkout_url` / `dibsy_payment_id` on `invoices` (audit via grep in Task 2 Step 1).

**Deleted (Task 2):**
- `src/app/api/payments/dibsy/create-invoice-link/route.ts` — dead endpoint.
- `src/app/api/payments/dibsy/create-customer-batch-payment/route.ts` — live batch-payment endpoint.

**Modified (Task 2b — Invoices → SO Invoices rename):**
- Sidebar / nav menu labels (search `src/components/layout` for the "Invoices" nav item).
- Page titles (`src/app/(app)/invoices/**/page.tsx` where a page header reads "Invoices").
- Any breadcrumbs, page headings, dialog titles that read the word "Invoices" in a UI-visible context and refer to `public.invoices`.
- Table title columns / list-view captions on SO-invoice pages.
- **Do NOT touch:** any UI text that refers to `tl_invoices` (Telelink still calls itself "Invoices" in its own module), URL routes (`/invoices/...`), file paths, code identifiers, DB table names.

**Modified (Task 3 — manually_paid cleanup):**
- `src/components/sales/InvoiceDetailDocument.tsx` — remove any "Mark as Paid" toggle if present.
- `src/hooks/useCustomerInvoices.ts` — remove any manually_paid mutation if present.

**Preserved (do NOT touch — Dibsy still used by Telelink):**
- `src/lib/dibsy.ts` — Dibsy API client.
- The webhook route file (only two branches removed, file itself stays).
- All `tl_invoices.*` Dibsy columns and their write paths (Telelink is a live Dibsy consumer).
- Dibsy env vars, secret validation, test-mode config.

**Untouched (context, do not edit):**
- `src/hooks/usePayments.ts` — AR payment insert code.
- `src/components/sales/SoPaymentDialog.tsx` — "Record Payment" flow; already inserts into `payments` correctly.
- PDF generators — read `invoice.paid_amount` from the DB.

**Created (6 migration files, mirrored to both folders):**
- Phase 1 Task 1: `20260723100000_invoice_recompute_use_original_currency.sql`
- Phase 1 Task 2: `20260723105000_drop_invoice_dibsy_columns.sql` (drops from `public.invoices` ONLY, not `tl_invoices`)
- Phase 1 Task 3: `20260723110000_reset_invoice_manually_paid.sql`
- Phase 2 Task 4: `20260723120000_enforce_one_invoice_per_so.sql`
- Phase 3 Task 5: `20260723130000_invoice_monthly_numbering.sql`
- Phase 3 Task 6: `20260723140000_renumber_existing_sos_and_invoices.sql`

---

# Phase 1 — Currency Fix + Auto-Recompute Cleanup

Goal: `invoices.paid_amount` and `payment_status` are computed correctly (in the invoice's currency) by the existing trigger, from all payment sources. Dibsy webhook stops writing to invoices directly. Manual toggle removed.

---

### Task 1: Fix currency bug in AR recompute functions

**Files:**
- Create: `supabase/migrations/20260723100000_invoice_recompute_use_original_currency.sql`
- Create: `supabase/migrations-staging/20260723100000_invoice_recompute_use_original_currency.sql`

**Interfaces:**
- Consumes: existing `invoice_recompute_paid_fn` (trigger fn) and `recalculate_ar_invoice_payment_status` (RPC). Both currently use `COALESCE(amount_qar, amount)` which mixes currencies.
- Produces: both functions now sum `payments.amount` (original currency, same as invoice's `total_amount`). Every invoice's `paid_amount` recomputed post-migration.

- [ ] **Step 1: Write the migration**

Content:
```sql
-- Fix invoice_recompute_paid_fn + recalculate_ar_invoice_payment_status
-- to sum payments in the invoice's currency, not QAR. Mirror of the
-- bill_recompute fix in 20260722190000.

BEGIN;

CREATE OR REPLACE FUNCTION public.invoice_recompute_paid_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id     uuid;
  v_old_invoice_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type = 'invoice' THEN v_invoice_id := OLD.source_id;
    ELSIF OLD.invoice_id IS NOT NULL THEN v_invoice_id := OLD.invoice_id;
    END IF;
  ELSE
    IF NEW.source_type = 'invoice' THEN v_invoice_id := NEW.source_id;
    ELSIF NEW.invoice_id IS NOT NULL THEN v_invoice_id := NEW.invoice_id;
    END IF;
  END IF;

  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  WITH summed AS (
    SELECT COALESCE(SUM(amount), 0) AS paid  -- FIX: was COALESCE(amount_qar, amount)
    FROM   public.payments
    WHERE  (
             (source_type = 'invoice' AND source_id = v_invoice_id)
             OR invoice_id = v_invoice_id
           )
      AND  deleted_at IS NULL
      AND  direction  = 'incoming'
  )
  UPDATE public.invoices i
  SET    paid_amount    = summed.paid,
         payment_status = CASE
           WHEN i.total_amount > 0 AND summed.paid >= i.total_amount THEN 'paid'
           WHEN summed.paid > 0                                      THEN 'partially_paid'
           ELSE                                                           'unpaid'
         END
  FROM   summed
  WHERE  i.id = v_invoice_id;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.source_type = 'invoice' THEN v_old_invoice_id := OLD.source_id;
    ELSIF OLD.invoice_id IS NOT NULL THEN v_old_invoice_id := OLD.invoice_id;
    END IF;

    IF v_old_invoice_id IS NOT NULL AND v_old_invoice_id <> v_invoice_id THEN
      WITH summed AS (
        SELECT COALESCE(SUM(amount), 0) AS paid
        FROM   public.payments
        WHERE  (
                 (source_type = 'invoice' AND source_id = v_old_invoice_id)
                 OR invoice_id = v_old_invoice_id
               )
          AND  deleted_at IS NULL
          AND  direction  = 'incoming'
      )
      UPDATE public.invoices i
      SET    paid_amount    = summed.paid,
             payment_status = CASE
               WHEN i.total_amount > 0 AND summed.paid >= i.total_amount THEN 'paid'
               WHEN summed.paid > 0                                      THEN 'partially_paid'
               ELSE                                                           'unpaid'
             END
      FROM   summed
      WHERE  i.id = v_old_invoice_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_ar_invoice_payment_status(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total NUMERIC;
  v_paid  NUMERIC;
  v_new   TEXT;
BEGIN
  SELECT total_amount INTO v_total FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid  -- FIX: was COALESCE(amount_qar, amount)
  FROM   payments
  WHERE  (
           (source_type = 'invoice' AND source_id = p_invoice_id)
           OR invoice_id = p_invoice_id
         )
    AND  deleted_at IS NULL
    AND  direction  = 'incoming';

  v_new := CASE
    WHEN COALESCE(v_total, 0) > 0 AND v_paid >= v_total THEN 'paid'
    WHEN v_paid > 0                                     THEN 'partially_paid'
    ELSE                                                     'unpaid'
  END;

  UPDATE invoices
  SET    paid_amount    = v_paid,
         payment_status = v_new
  WHERE  id = p_invoice_id;
END;
$$;

-- Rerun the recompute for every invoice to correct paid_amount + status.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.invoices LOOP
    PERFORM public.recalculate_ar_invoice_payment_status(r.id);
  END LOOP;
END $$;

COMMIT;
```

- [ ] **Step 2: Mirror to migrations-staging/**

```bash
cp supabase/migrations/20260723100000_invoice_recompute_use_original_currency.sql \
   supabase/migrations-staging/20260723100000_invoice_recompute_use_original_currency.sql
```

- [ ] **Step 3: Apply to staging**

```bash
npx supabase db push
```

Expected: single migration applied, no notices.

- [ ] **Step 4: Ask the user to verify one existing invoice**

Message the user:
> "Migration applied. Please open any existing invoice in staging — the paid_amount should reflect actual payments in the invoice's currency (not converted to QAR). If any invoices previously showed wrong numbers because of the currency mix, they should now be correct."

- [ ] **Step 5: Commit after confirmation**

```bash
git add supabase/migrations/20260723100000_invoice_recompute_use_original_currency.sql \
        supabase/migrations-staging/20260723100000_invoice_recompute_use_original_currency.sql
git commit -m "$(cat <<'EOF'
fix(invoices): recompute paid_amount in invoice currency, not QAR

Same currency bug we fixed on bills (20260722190000). invoice_recompute
and recalculate_ar_invoice_payment_status summed amount_qar, which is
each payment's QAR-converted mirror. But invoices.total_amount is in
the customer's currency (e.g. USD), so mixed-currency operations mark
a USD invoice as paid when a payment sum of USD 15,000 → QAR 54,750
exceeds the USD 53,500 total.

Both functions now sum payments.amount (original currency). Backfill
recomputes every existing invoice.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Remove Dibsy from `public.invoices` entirely (Option A)

**Scope:** AR sales-order invoices are paid via cash / bank transfer / cheque only. Rip Dibsy off `public.invoices` completely — both endpoints, both webhook branches, the collections-page Dibsy button, and both columns. Telelink (`tl_invoices`) has its OWN independent Dibsy columns and webhook branches and must stay untouched.

**Reality of the current wiring (from investigation):**
- `src/app/api/payments/dibsy/create-invoice-link/route.ts` — DEAD. No UI calls it.
- `src/app/api/payments/dibsy/create-customer-batch-payment/route.ts` — LIVE. Called by `src/components/invoices/CustomerInvoiceDetailContent.tsx:116` from the collections page `/invoices/pending-payments/[customerId]`.
- Webhook (`src/app/api/payments/dibsy/webhook/route.ts`) has two invoice branches: `metadata.invoice_id` (unreachable — created by the dead endpoint) and `metadata.customer_batch_invoice_ids` (live — created by the batch endpoint). Both go.
- Only two files write `invoices.dibsy_*` columns: the two endpoints above. `generate_invoice_from_so` never writes them.
- `tl_invoices` has its OWN `dibsy_payment_id`/`dibsy_checkout_url` and its OWN webhook branches — Telelink still uses Dibsy. **Do not touch anything under `tl_invoices` or `tl_payment_batches`.**

**Files:**
- Delete: `src/app/api/payments/dibsy/create-invoice-link/route.ts`
- Delete: `src/app/api/payments/dibsy/create-customer-batch-payment/route.ts`
- Modify: `src/app/api/payments/dibsy/webhook/route.ts` — delete both invoice branches.
- Modify: `src/components/invoices/CustomerInvoiceDetailContent.tsx` — remove the "Send Payment Link" (or similar) button + its fetch call. Keep the outstanding-invoices list itself.
- Audit + modify: any other `dibsy_checkout_url` / `dibsy_payment_id` references on `public.invoices` (grep in Step 1).
- Create: `supabase/migrations/20260723105000_drop_invoice_dibsy_columns.sql`
- Create: `supabase/migrations-staging/20260723105000_drop_invoice_dibsy_columns.sql`

**Interfaces:**
- Consumes: `invoices.dibsy_payment_id` + `invoices.dibsy_checkout_url` (both dropped).
- Produces: `public.invoices` no longer has any online-payment concept. The webhook still runs (Telelink branches intact); the invoice branches are gone. The collections page still lists outstanding invoices but the pay-via-link button is gone.

- [ ] **Step 1: Audit all touchpoints on `public.invoices` (NOT `tl_invoices`)**

```bash
grep -rnE "dibsy_payment_id|dibsy_checkout_url|create-invoice-link|create-customer-batch-payment|customer_batch_invoice_ids|metadata\.invoice_id" src/ --include="*.ts" --include="*.tsx"
```

Categorize each hit as (a) `public.invoices` = TO REMOVE, (b) `tl_invoices` / Telelink module = LEAVE ALONE. Anything under `src/app/(app)/telelink` or that queries `tl_invoices` / `tl_payment_batches` is category (b) and is out of scope.

- [ ] **Step 2: Delete the two endpoints**

```bash
rm src/app/api/payments/dibsy/create-invoice-link/route.ts
rm src/app/api/payments/dibsy/create-customer-batch-payment/route.ts
# Remove empty parent directories if any:
rmdir src/app/api/payments/dibsy/create-invoice-link 2>/dev/null || true
rmdir src/app/api/payments/dibsy/create-customer-batch-payment 2>/dev/null || true
```

- [ ] **Step 3: Strip both invoice branches from the webhook**

Read `src/app/api/payments/dibsy/webhook/route.ts`. Identify the branch that keys off `metadata.invoice_id` (~lines 159–191, single-invoice update on `public.invoices`) and the branch that keys off `metadata.customer_batch_invoice_ids` (~lines 45–98, batch update on `public.invoices`). Delete both. Collapse the `if / else if` chain cleanly so no dead stubs remain.

**Do NOT touch** any branch that keys off `metadata.tl_invoice_id`, `metadata.tl_batch_id`, or otherwise operates on `tl_invoices` / `tl_payment_batches`. Those are Telelink and live.

- [ ] **Step 4: Remove the collections-page Dibsy button**

Open `src/components/invoices/CustomerInvoiceDetailContent.tsx`. Around line 116 there's a `fetch('/api/payments/dibsy/create-customer-batch-payment', ...)` call — remove:
- The button JSX that triggers it.
- The handler function.
- Any local state (`isGenerating`, `dibsyUrl`, etc.).
- Toasts / dialogs shown after the link is created.
- The import if unused elsewhere.

The list-of-outstanding-invoices view stays — only the Dibsy pay-batch action is removed.

- [ ] **Step 5: Remove any residual `dibsy_*` references on `public.invoices`**

For every category-(a) hit from Step 1 that wasn't already handled by Steps 2–4:
- If it's a `select('..., dibsy_checkout_url, ...')` list — remove those columns.
- If it's a JSX chip / badge that renders when `dibsy_payment_id` is present — remove the block.
- If it's a TypeScript type import assuming those fields — leave it for now; regenerated types in Step 8 will make TS complain if anything's still referencing them.

- [ ] **Step 6: Write the column-drop migration**

Content of `supabase/migrations/20260723105000_drop_invoice_dibsy_columns.sql`:
```sql
-- Option A: rip Dibsy out of public.invoices. Sales-order invoices are
-- paid via cash / bank transfer / cheque only. Both endpoints that
-- wrote these columns are being deleted in the same task.
--
-- Telelink (tl_invoices) uses its OWN dibsy_* columns and is untouched.

BEGIN;

ALTER TABLE public.invoices DROP COLUMN IF EXISTS dibsy_payment_id;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS dibsy_checkout_url;

COMMIT;
```

- [ ] **Step 7: Mirror + apply**

```bash
cp supabase/migrations/20260723105000_drop_invoice_dibsy_columns.sql \
   supabase/migrations-staging/20260723105000_drop_invoice_dibsy_columns.sql
npx supabase db push
```

- [ ] **Step 8: Regenerate types**

```bash
npx supabase gen types typescript --project-id mwvblpgbgxipvrevkeff --schema public > src/types/database.types.ts
```

Re-append the four helper aliases (`AllTables`, `DBTable`, `DBInsert`, `DBUpdate`) — the CLI strips them.

- [ ] **Step 9: Typecheck**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -40
```

Anything referencing `invoices.dibsy_payment_id` or `invoices.dibsy_checkout_url` errors here — fix each. Telelink files should NOT error (their `dibsy_*` columns still exist on `tl_invoices`).

- [ ] **Step 10: Sanity DB queries (report to user for QA)**

Show the user output of these two queries:
```sql
-- 1. Confirm columns gone from invoices, still present on tl_invoices.
SELECT table_name, column_name
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  column_name LIKE 'dibsy_%'
ORDER  BY table_name, column_name;
-- Expect: only tl_invoices (and tl_payment_batches if it has them) — no rows for 'invoices'.

-- 2. Confirm no orphan Dibsy references on invoices left behind.
SELECT COUNT(*) FROM public.invoices;  -- basic sanity, table still exists and readable
```

- [ ] **Step 11: Ask the user to smoke-test**

Message the user:
> "Dibsy fully removed from public.invoices (Option A):
> - Both endpoints deleted, both webhook branches removed.
> - Collections page (/invoices/pending-payments/[customerId]) still shows outstanding invoices but no 'send payment link' button.
> - Columns dropped from public.invoices.
> - Telelink (tl_invoices) untouched — please smoke-test any active Telelink flow to confirm it still works end-to-end.
> Also confirm: invoice list, invoice detail, and invoice PDF render normally."

- [ ] **Step 12: Do NOT commit yet — Task 2b (rename) lands in the same commit series**

Leave files staged/unstaged. Task 2b is a small rename that pairs naturally with this commit; controller will decide whether to combine or split commits after both tasks pass review.

---

### Task 2b: Rename user-visible "Invoices" → "SO Invoices"

**Rationale:** `public.invoices` = sales-order AR invoices; `tl_invoices` = Telelink service invoices. Both have appeared in the app UI as "Invoices" which is ambiguous. The user requested renaming `public.invoices`-facing UI text to "SO Invoices" so the two are visually distinct. Table name and routes stay `invoices` — pure display-string change.

**Files (audit + modify):**
- Sidebar / top-nav labels — search `src/components/layout/**` and `src/app/(app)/layout.tsx` for the "Invoices" nav label pointing at `/invoices/*`.
- Page titles — `src/app/(app)/invoices/**/page.tsx` (any `<h1>`, `<title>`, breadcrumb component reading "Invoices").
- Table captions / list headers on the invoices index, invoice detail, and pending-payments pages.
- Dialog titles that say "Invoice…" — leave singular "Invoice" on document-level dialogs alone (an individual document is still called "Invoice #SO-2026-07-001-I"); only the *plural, index-level, nav-level* usages become "SO Invoices".

**Files (do NOT touch):**
- URL routes (`/invoices/...` stays).
- Directory names, filenames, component names (`invoices/` dir, `useCustomerInvoices` hook).
- DB table `public.invoices`.
- Any Telelink-facing UI that reads "Invoices" (that's for `tl_invoices` and refers to service invoices — its own module's rename is out of scope for this plan).
- Migration files, RPC names, function bodies, code comments.

- [ ] **Step 1: Audit all UI touchpoints**

```bash
grep -rn ">Invoices<\|\"Invoices\"\|'Invoices'\|Invoices List\|All Invoices\|My Invoices" src/ --include="*.tsx" --include="*.ts"
```

For each hit, decide:
- Is this in a file under `src/app/(app)/invoices/` OR is the surrounding code fetching from `public.invoices` / calling `useCustomerInvoices` / rendering AR-invoice data? → RENAME.
- Is this in a Telelink module (`src/app/(app)/telelink/**`) or a component fetching `tl_invoices`? → LEAVE ALONE.
- Is this a document-singular "Invoice" (e.g. an `<h1>Invoice</h1>` on the detail page for one invoice, or a PDF title)? → LEAVE ALONE. Only plurals / index-level headings become "SO Invoices".

Produce a short list of the exact file:line replacements before editing.

- [ ] **Step 2: Rename the identified plural / index-level occurrences**

Replace each occurrence with `"SO Invoices"`. Preserve casing style if used in an ALL CAPS constant. Preserve any surrounding punctuation.

Examples of what should change:
- Nav label `<span>Invoices</span>` under an AR-invoice icon → `<span>SO Invoices</span>`.
- `<PageHeader title="Invoices" />` on `/invoices/page.tsx` → `title="SO Invoices"`.
- Breadcrumb `"Invoices"` in the collections page ancestor chain → `"SO Invoices"`.

Examples of what should NOT change:
- `<DialogTitle>Invoice #{invoice_id}</DialogTitle>` — singular, document-level, unchanged.
- The PDF template's "INVOICE" header — a document title, unchanged.
- Any TypeScript identifier: `type Invoice`, `useCustomerInvoices`, `invoicesQuery` — unchanged.
- `/invoices/pending-payments/[customerId]` URL — unchanged.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```
No changes expected — the rename is display-string only.

- [ ] **Step 4: Ask the user to smoke-test**

Message the user:
> "Rename done. Please open the app and confirm:
> 1. The sidebar / nav item that used to read 'Invoices' (the one linking to sales-order AR invoices) now reads 'SO Invoices'.
> 2. The AR invoice list page header reads 'SO Invoices'.
> 3. The Telelink 'Invoices' menu / page still reads 'Invoices' (its own module is untouched).
> 4. Individual invoice document titles (e.g. 'Invoice #SO-2026-07-001-I') are unchanged.
> Flag any place where you still see 'Invoices' (plural) and would prefer 'SO Invoices', or vice versa."

- [ ] **Step 5: Commit — Task 2 + Task 2b together**

After user confirms both tasks work, one combined commit:

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(invoices): rip Dibsy from public.invoices; rename UI to "SO Invoices"

Option A — Dibsy has no place on public.invoices. Sales-order AR
invoices are paid via cash / bank transfer / cheque only. Also rename
plural / index-level UI labels from "Invoices" to "SO Invoices" so
public.invoices (sales orders) is unambiguous vs tl_invoices (Telelink).

Deleted:
- src/app/api/payments/dibsy/create-invoice-link/route.ts (dead — no callers)
- src/app/api/payments/dibsy/create-customer-batch-payment/route.ts (live
  batch-collection endpoint; feature retired for SO invoices)

Webhook (src/app/api/payments/dibsy/webhook/route.ts): removed both
invoice branches (metadata.invoice_id + metadata.customer_batch_invoice_ids).
Telelink branches untouched.

UI:
- Removed "send payment link" button from the collections page
  (src/components/invoices/CustomerInvoiceDetailContent.tsx).
- Renamed plural nav / page-title occurrences of "Invoices" that refer
  to public.invoices to "SO Invoices". Telelink module's "Invoices"
  label is unchanged. Singular "Invoice" on individual documents /
  dialogs / PDFs is unchanged. URL routes unchanged.

DB (staging only, prod paused):
- Migration 20260723105000_drop_invoice_dibsy_columns.sql drops
  public.invoices.dibsy_payment_id + dibsy_checkout_url.
- tl_invoices.dibsy_* columns and Telelink webhook flow untouched.

Preserved:
- src/lib/dibsy.ts, the webhook route file itself, all tl_invoices
  Dibsy paths.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Reset invoices.manually_paid and clear cached PDFs

**Files:**
- Create: `supabase/migrations/20260723110000_reset_invoice_manually_paid.sql`
- Create: `supabase/migrations-staging/20260723110000_reset_invoice_manually_paid.sql`

**Interfaces:**
- Produces: `invoices.manually_paid = false` on every row so the trigger's auto payment_status takes effect. Cached invoice PDF URLs cleared. Column preserved for future overrides.

- [ ] **Step 1: Write the migration**

```sql
-- Reset invoices.manually_paid so the trigger owns payment_status.
-- The manual "Mark as Paid" toggle (if any) is removed in a follow-up
-- code change; the column stays for one-off overrides but is no longer
-- written from the UI or the Dibsy webhook.

BEGIN;

UPDATE public.invoices SET manually_paid = false WHERE manually_paid = true;

UPDATE public.invoices SET pdf_url = NULL WHERE pdf_url IS NOT NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.invoices LOOP
    PERFORM public.recalculate_ar_invoice_payment_status(r.id);
  END LOOP;
END $$;

COMMIT;
```

- [ ] **Step 2: Mirror + apply**

```bash
cp supabase/migrations/20260723110000_reset_invoice_manually_paid.sql \
   supabase/migrations-staging/20260723110000_reset_invoice_manually_paid.sql
npx supabase db push
```

- [ ] **Step 3: Locate + remove any UI toggle**

```bash
grep -rn "useMarkInvoicePaid\|Mark as Paid.*invoice\|invoices.*manually_paid" src/ --include="*.ts" --include="*.tsx" | head
```

If a hook or button exists (mirrors of the AP-side ones), remove:
- The button JSX in `InvoiceDetailDocument.tsx` or `invoices/[id]/page.tsx`
- The mutation in `useCustomerInvoices.ts` (or wherever it lives)

If nothing matches, skip. Just note in the commit that no UI toggle was found.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "invoices/\[id\]|InvoiceDetailDocument|useCustomerInvoices" | head
```
Expected: no errors from the affected files.

- [ ] **Step 5: Ask the user to smoke-test**

Message the user:
> "manually_paid cleared. All invoice payment_status values recomputed from the payments table. If any AR invoice previously showed 'paid' because of a manual toggle, it now reflects reality. Please open a few invoices and confirm the status matches the sum of their Payments tab."

- [ ] **Step 6: Commit after confirmation**

```bash
git add supabase/migrations/20260723110000_reset_invoice_manually_paid.sql \
        supabase/migrations-staging/20260723110000_reset_invoice_manually_paid.sql
# plus any UI files if applicable
git commit -m "$(cat <<'EOF'
fix(invoices): reset manually_paid; drop manual toggle UI

Same pattern as the bills cleanup — the trigger is authoritative for
paid_amount + payment_status. manually_paid stays as a column for
future overrides but no code writes it now.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 2 — Enforce 1 SO = 1 Invoice

Goal: DB-level UNIQUE constraint on `invoices.sale_order_id` matches the RPC-level check in `generate_invoice_from_so`. Future violations fail at the DB, not just in one code path.

---

### Task 4: Add UNIQUE(sale_order_id) on invoices

**Files:**
- Create: `supabase/migrations/20260723120000_enforce_one_invoice_per_so.sql`
- Create: `supabase/migrations-staging/20260723120000_enforce_one_invoice_per_so.sql`

**Interfaces:**
- Produces: `invoices_sale_order_id_unique` constraint on `invoices(sale_order_id)`. Any second INSERT of an invoice for the same SO fails with a constraint error.

- [ ] **Step 1: Write the migration with pre-flight check**

```sql
-- Enforce 1 SO = 1 invoice at the DB level. generate_invoice_from_so
-- already refuses to create a second one, but the DB should be the
-- ultimate arbiter — a rogue INSERT via any other path also has to fail.

BEGIN;

DO $$
DECLARE
  v_dups int;
BEGIN
  SELECT COUNT(*) INTO v_dups FROM (
    SELECT sale_order_id
    FROM   public.invoices
    WHERE  sale_order_id IS NOT NULL
    GROUP  BY sale_order_id
    HAVING COUNT(*) > 1
  ) x;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'Refusing to add UNIQUE(sale_order_id): % SO(s) have more than one invoice. Reconcile before applying.', v_dups;
  END IF;
END $$;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_sale_order_id_unique UNIQUE (sale_order_id);

COMMIT;
```

- [ ] **Step 2: Mirror + apply**

```bash
cp supabase/migrations/20260723120000_enforce_one_invoice_per_so.sql \
   supabase/migrations-staging/20260723120000_enforce_one_invoice_per_so.sql
npx supabase db push
```

If the pre-flight raises the exception on staging, reconcile the duplicate manually before proceeding — the migration cannot land as-is.

- [ ] **Step 3: Ask the user to smoke-test**

Message the user:
> "UNIQUE constraint added. This is invisible to normal flows (the RPC still refuses duplicates before the DB does). Just confirm creating an invoice from an SO still works normally in staging."

- [ ] **Step 4: Commit after confirmation**

```bash
git add supabase/migrations/20260723120000_enforce_one_invoice_per_so.sql \
        supabase/migrations-staging/20260723120000_enforce_one_invoice_per_so.sql
git commit -m "$(cat <<'EOF'
feat(db): enforce 1 SO = 1 invoice at the schema level

Adds UNIQUE(sale_order_id) on invoices. Matches the RPC-level check in
generate_invoice_from_so and the AP-side UNIQUE(purchase_order_id) on
bills. Any future code path that tries to create a second invoice for
the same SO now fails at the DB.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 3 — Numbering Rework

Goal: SO number `SO-YYYY-MM-NNN`, Invoice number `<SO>-I`. Existing rows renumbered.

---

### Task 5: New SO number RPC + rewrite invoice number in generate_invoice_from_so

**Files:**
- Create: `supabase/migrations/20260723130000_invoice_monthly_numbering.sql`
- Create: `supabase/migrations-staging/20260723130000_invoice_monthly_numbering.sql`

**Interfaces:**
- Consumes: `generate_invoice_from_so(p_so_id uuid)` RPC (existing).
- Produces: `next_so_number()` returns `SO-YYYY-MM-NNN`. `generate_invoice_from_so` now sets `invoice_id = <so_number>-I` (uses the SO's number from the row it just looked up, no separate call needed).

- [ ] **Step 1: Confirm the current SO number generation location**

```bash
grep -A 15 "CREATE OR REPLACE FUNCTION.*next_so_number\|CREATE.*FUNCTION.*create_sale_order" supabase/migrations-staging/*.sql | head -30
```

Locate whichever RPC generates SO numbers today. Note the current signature — you're replacing the number-generation code path only, not the whole RPC.

- [ ] **Step 2: Write the migration**

```sql
-- SO number: SO-YYYY-MM-NNN. Invoice number: <SO number>-I.
-- Mirror of the PO/Bill numbering rework in 20260722200000.

BEGIN;

CREATE OR REPLACE FUNCTION public.next_so_number()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year   TEXT := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_month  TEXT := TO_CHAR(CURRENT_DATE, 'MM');
  v_prefix TEXT := 'SO-' || v_year || '-' || v_month || '-';
  v_next   INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('so_number_' || v_year || v_month));

  SELECT COUNT(*) + 1 INTO v_next
  FROM   public.sale_orders
  WHERE  so_number LIKE v_prefix || '%';

  RETURN v_prefix || LPAD(v_next::TEXT, 3, '0');
END $$;

GRANT EXECUTE ON FUNCTION public.next_so_number() TO authenticated;

-- Patch generate_invoice_from_so: invoice_id becomes <so_number>-I
-- instead of INV-NNNNN. Look up the so_number in the same query that
-- pulls the SO row (it's already selected).

-- NOTE: the existing generate_invoice_from_so body is large and shared
-- with several trailing behaviours. This migration rewrites only the
-- invoice_id assignment. Keep the rest identical.
--
-- The old code was:
--   SELECT COUNT(*) + 1 INTO v_inv_count FROM invoices;
--   v_invoice_id_str := 'INV-' || LPAD(v_inv_count::text, 5, '0');
--
-- The new code is:
--   v_invoice_id_str := v_so.so_number || '-I';

CREATE OR REPLACE FUNCTION public.generate_invoice_from_so(p_so_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_so               RECORD;
  v_invoice_id_str   TEXT;
  v_invoice_type     TEXT;
  v_issued_date      DATE;
  v_due_date         DATE;
  v_new_inv_id       uuid;
  v_new_inv_str      TEXT;
  v_paid_amount      NUMERIC;
  v_payment_status   TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoices_serial'));

  IF EXISTS (SELECT 1 FROM invoices WHERE sale_order_id = p_so_id) THEN
    RAISE EXCEPTION 'invoice_exists';
  END IF;

  SELECT
    so.id, so.so_number, so.status, so.customer_id, so.division_id,
    so.subtotal, COALESCE(so.tax, 0) AS tax,
    so.total AS total_amount,
    COALESCE(c.customer_type, 'credit') AS customer_type
  INTO v_so
  FROM sale_orders so
  JOIN customers c ON c.id = so.customer_id
  WHERE so.id = p_so_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'so_not_found'; END IF;
  IF v_so.status NOT IN ('confirmed', 'partial_delivery', 'delivered') THEN
    RAISE EXCEPTION 'so_not_invoiceable';
  END IF;

  SELECT COALESCE(SUM(amount), 0)  -- FIX: original currency, was COALESCE(amount_qar, amount)
    INTO v_paid_amount
  FROM   public.payments
  WHERE  source_type = 'sale_order'
    AND  source_id   = p_so_id
    AND  deleted_at IS NULL;

  v_payment_status := CASE
    WHEN v_paid_amount >= v_so.total_amount THEN 'paid'
    WHEN v_paid_amount > 0                  THEN 'partially_paid'
    ELSE                                          'unpaid'
  END;

  v_invoice_id_str := v_so.so_number || '-I';  -- NEW FORMAT

  v_invoice_type := v_so.customer_type;
  v_issued_date  := CURRENT_DATE;
  v_due_date     := CASE v_invoice_type
    WHEN 'cash' THEN CURRENT_DATE
    ELSE             CURRENT_DATE + 30
  END;

  INSERT INTO invoices (
    invoice_id, customer_id, sale_order_id, division_id,
    invoice_type, doc_status, status, payment_status, needs_refresh,
    total_amount, subtotal, tax, paid_amount,
    issued_date, due_date,
    source, source_id, source_label
  ) VALUES (
    v_invoice_id_str, v_so.customer_id, p_so_id, v_so.division_id,
    v_invoice_type::public.invoice_type, 'draft', 'draft', v_payment_status, false,
    v_so.total_amount, v_so.subtotal, v_so.tax, v_paid_amount,
    v_issued_date, v_due_date,
    'order', p_so_id::text, 'SO #' || v_so.so_number
  )
  RETURNING id, invoice_id INTO v_new_inv_id, v_new_inv_str;

  UPDATE public.payments
  SET    source_type = 'invoice',
         source_id   = v_new_inv_id
  WHERE  source_type = 'sale_order'
    AND  source_id   = p_so_id
    AND  deleted_at IS NULL;

  INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total)
  SELECT v_new_inv_id, sol.item_name, sol.qty, sol.unit_price, sol.total
  FROM   sale_order_lines sol
  WHERE  sol.sale_order_id = p_so_id;

  RETURN jsonb_build_object(
    'id',           v_new_inv_id,
    'invoice_id',   v_new_inv_str,
    'invoice_type', v_invoice_type,
    'paid_amount',  v_paid_amount
  );
END;
$$;

COMMIT;
```

- [ ] **Step 3: Mirror + apply**

```bash
cp supabase/migrations/20260723130000_invoice_monthly_numbering.sql \
   supabase/migrations-staging/20260723130000_invoice_monthly_numbering.sql
npx supabase db push
```

- [ ] **Step 4: Locate every client callsite of the old SO number RPC**

```bash
grep -rnE "next_so_number|so_number.*RPC|create_sale_order.*so_number" src/ | head
```

If any hook expects the old `SO-NNNNN` format (regex parsing, sorting assumptions), fix it. Most likely: no code depends on the format because SO numbers are stored + queried as strings.

- [ ] **Step 5: Ask the user to smoke-test**

Message the user:
> "New SO number RPC live: SO-YYYY-MM-NNN. Also generate_invoice_from_so now names the invoice <SO number>-I. Please:
> 1. Create a new SO — confirm the number is SO-2026-07-NNN.
> 2. Confirm it → convert to invoice — confirm invoice number is <that SO>-I.
> 3. Any existing SOs/invoices keep their old numbers for now (renumbered in Task 6)."

- [ ] **Step 6: Commit after confirmation**

```bash
git add supabase/migrations/20260723130000_invoice_monthly_numbering.sql \
        supabase/migrations-staging/20260723130000_invoice_monthly_numbering.sql
git commit -m "$(cat <<'EOF'
feat(numbering): SO-YYYY-MM-NNN + <SO>-I

Mirror of the PO/Bill numbering rework (20260722200000). next_so_number
rewritten with a monthly-reset advisory lock. generate_invoice_from_so
now derives invoice.invoice_id from the SO's own number:
  invoice_id = <so_number> || '-I'

Also fixes the amount_qar currency bug in the paid-so-far sum inside
generate_invoice_from_so.

Historical SOs and invoices keep their old numbers until Task 6.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Renumber existing SOs + Invoices

**Files:**
- Create: `supabase/migrations/20260723140000_renumber_existing_sos_and_invoices.sql`
- Create: `supabase/migrations-staging/20260723140000_renumber_existing_sos_and_invoices.sql`

**Interfaces:**
- Produces: every historical `sale_orders.so_number` is replaced by `SO-YYYY-MM-NNN` derived from its `created_at`. Every historical `invoices.invoice_id` follows to `<new so_number>-I`. Cached PDFs on sale_deliveries, returns, credit_notes cleared.

- [ ] **Step 1: Write the migration**

```sql
-- Renumber existing SOs to SO-YYYY-MM-NNN and invoices to <SO>-I.
-- Uses ROW_NUMBER() partitioned by year+month of created_at, ordered
-- by created_at + id for stable results.
--
-- Same rules as the PO renumber (20260722200000):
--   • Only touch rows in the old SO-NNNNN format.
--   • Invoices follow their SO.
--   • Clear cached PDFs (invoices, sale_deliveries, returns, credit_notes)
--     so future views regenerate with the new numbers.

BEGIN;

-- 1. Renumber SOs.
WITH ranked AS (
  SELECT
    id,
    'SO-' || TO_CHAR(created_at, 'YYYY-MM') || '-' ||
      LPAD(
        ROW_NUMBER() OVER (
          PARTITION BY DATE_TRUNC('month', created_at)
          ORDER BY created_at, id
        )::TEXT, 3, '0'
      ) AS new_so_number
  FROM public.sale_orders
  WHERE so_number ~ '^SO-[0-9]+$'
)
UPDATE public.sale_orders s
SET    so_number = r.new_so_number
FROM   ranked r
WHERE  s.id = r.id;

-- 2. Rewrite invoice numbers to <new SO number>-I.
UPDATE public.invoices i
SET    invoice_id = s.so_number || '-I'
FROM   public.sale_orders s
WHERE  i.sale_order_id = s.id
  AND  i.invoice_id ~ '^INV-[0-9]+$';  -- only touch old-format invoice numbers

-- 3. Clear cached PDFs so they regenerate with the new numbers.
UPDATE public.invoices        SET pdf_url = NULL WHERE pdf_url IS NOT NULL;
UPDATE public.sale_deliveries SET pdf_url = NULL WHERE pdf_url IS NOT NULL;
UPDATE public.returns         SET pdf_url = NULL WHERE pdf_url IS NOT NULL;
UPDATE public.credit_notes    SET pdf_url = NULL WHERE pdf_url IS NOT NULL;

COMMIT;
```

- [ ] **Step 2: Mirror + apply**

```bash
cp supabase/migrations/20260723140000_renumber_existing_sos_and_invoices.sql \
   supabase/migrations-staging/20260723140000_renumber_existing_sos_and_invoices.sql
npx supabase db push
```

- [ ] **Step 3: Ask the user to verify**

Message the user:
> "Existing SOs and invoices renumbered. Please:
> 1. Open the SO list — every historical SO now reads SO-YYYY-MM-NNN.
> 2. Open a few invoices — they now read <SO>-I.
> 3. Open a sale delivery or credit note — its PDF regenerates with the new SO number.
> Confirm nothing shows the old SO-NNNNN or INV-NNNNN anywhere."

- [ ] **Step 4: Commit after confirmation**

```bash
git add supabase/migrations/20260723140000_renumber_existing_sos_and_invoices.sql \
        supabase/migrations-staging/20260723140000_renumber_existing_sos_and_invoices.sql
git commit -m "$(cat <<'EOF'
chore(numbering): renumber historical SOs + invoices

Every existing SO with the old SO-NNNNN format is renumbered to
SO-YYYY-MM-NNN based on created_at. Invoices follow their SO, taking
the new <SO>-I form. Cached PDFs on invoices, sale_deliveries,
returns, and credit_notes cleared so future renders pick up the new
numbers.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

# Testing Strategy

No test infrastructure exists for these hooks / RPCs. Manual smoke suite per task, gated by user confirmation.

**Phase 1 (Tasks 1–3):**
1. Open the newest and oldest invoice in staging — confirm paid_amount and payment_status match reality.
2. Record a QAR payment against a USD invoice → confirm status recomputes correctly (no false "paid" from the QAR mirror).
3. Open `/invoices/pending-payments/[customerId]` — outstanding invoices list still renders; no "Send payment link" / Dibsy button anywhere.
4. Smoke-test **Telelink end-to-end** — `tl_invoices.dibsy_*` columns still exist, Telelink webhook branches still fire, generating a Telelink payment link + paying it still works.
5. Confirm SO invoice list / detail / PDF render normally.
6. Nav sidebar / index page header reads "SO Invoices" (not just "Invoices") for the sales-order AR module. Telelink module's "Invoices" label unchanged. Individual document titles ("Invoice #SO-YYYY-MM-NNN-I") unchanged.
7. Confirm no invoice UI shows "Mark as Paid" toggle.

**Phase 2 (Task 4):**
1. Create a fresh SO → convert to invoice → confirm it succeeds.
2. Try to manually INSERT a second `invoices` row for the same SO via the SQL editor → confirm it fails with the UNIQUE constraint error. (Not exposed via UI but worth verifying.)

**Phase 3 (Tasks 5–6):**
1. Create a new SO → confirm number is `SO-2026-07-NNN`.
2. Confirm → invoice → confirm invoice number is `<SO>-I`.
3. Open the SOs list → confirm historical SOs now use the new format.
4. Open the invoices list → confirm all invoices use `<SO>-I`.
5. Open a sale delivery, a return, a credit note → confirm their PDFs regenerate with the new SO/invoice numbers referenced correctly.

---

# Risks & Rollback

| Risk | Mitigation |
|---|---|
| Dibsy-linked invoices exist in staging today and their `dibsy_*` columns get dropped. | The batch endpoint that populated them is being deleted in the same task, so no live callers break. Pre-flight: `SELECT COUNT(*) FROM public.invoices WHERE dibsy_payment_id IS NOT NULL OR dibsy_checkout_url IS NOT NULL;` — if any rows exist, they were prior test-mode batch-payment links; audit before dropping so accounting has a record. |
| Task 2 accidentally touches `tl_invoices` or `tl_payment_batches` (Telelink is a live Dibsy consumer). | Migration explicitly drops from `public.invoices` ONLY. Webhook edit only removes branches keyed by `metadata.invoice_id` / `metadata.customer_batch_invoice_ids` — Telelink branches (`metadata.tl_*`) are untouched. Step 1 audit categorizes every touchpoint as public.invoices vs tl_invoices before any edit. Testing plan includes an explicit end-to-end Telelink smoke test. |
| Rename accidentally changes Telelink UI or singular document titles. | Task 2b's Step 1 categorization filters every hit: only plural/index-level occurrences under sales-order pages become "SO Invoices". Any file under `src/app/(app)/telelink/**` or a component fetching `tl_invoices` is out of scope. Singular "Invoice" on individual documents / PDFs / dialogs is unchanged. |
| A historical SO has a NULL `created_at` → renumbering skips it or crashes. | ROW_NUMBER() over `PARTITION BY DATE_TRUNC('month', created_at)` treats NULL as its own partition. Check pre-flight if the query returns any NULL created_at rows before running. If any, backfill created_at first. |
| Multiple invoices per SO exist in prod (unlikely but possible). | Task 4 pre-flight refuses to add the UNIQUE constraint and reports the count. Reconcile manually before proceeding. |
| Prod stays paused indefinitely. | All migrations are idempotent and safe to accumulate. `db push` against prod once it's unpaused applies them all in order. |
| Currency fix uncovers historical invoices that were "paid" by the buggy sum but aren't actually paid. | This is a data-correctness win, not a regression. The correct paid_amount is what shows up. Communicate with accounting: any invoice whose status changes as a result of the currency fix was misrepresented before. |

**Rollback per phase:**
- Phase 1: `git revert` the three commits; the DB functions revert too (they're `CREATE OR REPLACE`).
- Phase 2: `ALTER TABLE public.invoices DROP CONSTRAINT invoices_sale_order_id_unique;`
- Phase 3: The renumber is not easily reversible without a snapshot. Take a CSV of `SELECT id, so_number FROM sale_orders` and `SELECT id, invoice_id FROM invoices` before Task 6 as insurance.

---

# Self-Review Checklist

- ✅ **Spec coverage:** Currency fix (Task 1), Dibsy Option A removal from `public.invoices` (Task 2), rename to SO Invoices (Task 2b), manually_paid reset (Task 3), UNIQUE enforcement (Task 4), numbering RPC + generate_invoice rewrite (Task 5), historical renumbering (Task 6).
- ✅ **Placeholder scan:** No "TBD" / "similar to Task N" / "add appropriate error handling". Every step has concrete SQL or commands.
- ✅ **Type consistency:** `sale_order_id`, `invoice_id`, `so_number`, `next_so_number()` used consistently. `<SO>-I` format decided upfront and used in every task that produces or consumes it.
- ✅ **Prod-paused acknowledged:** Every DB task calls out staging-only application. Prod push explicitly deferred.
- ✅ **Dibsy scope isolated:** Task 2 removes only paths on `public.invoices`. `src/lib/dibsy.ts`, the webhook file, all Telelink branches, and `tl_invoices.dibsy_*` columns stay. Audit query in the risks table catches any orphaned Dibsy-linked invoice before columns drop.
- ✅ **Rename scope isolated:** Task 2b changes plural / index-level display strings only. Singular document titles, Telelink UI, URLs, and code identifiers are explicitly out of scope.

---

# Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints

Task 2 (Dibsy removal on `public.invoices` + column drop) is destructive. Audit query first (`SELECT COUNT(*) FROM public.invoices WHERE dibsy_payment_id IS NOT NULL OR dibsy_checkout_url IS NOT NULL;`) so any test-mode Dibsy links in staging are logged before the columns go. Telelink (`tl_invoices`) is a live Dibsy consumer and MUST be smoke-tested end-to-end after Task 2 to confirm its own Dibsy flow still works. Task 2b (rename) rides along in the same commit — do not commit either until user confirms both.
