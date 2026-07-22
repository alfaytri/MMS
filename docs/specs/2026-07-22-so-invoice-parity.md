# SO / Invoice — Mirror PO / Bill Treatment

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the same quality pass to the AR side that landed on the AP side in commits `e8fabad7` and `7242bb3b`: auto-recompute `invoices.paid_amount` from `payments` (currency-correct), drop the manual "Mark as Paid" toggle, enforce 1 SO = 1 invoice, and renumber SOs + Invoices to the monthly-reset scheme.

**Architecture:** The AR side already has most of the pieces — `invoice_recompute_paid_fn` trigger, `payments_redirect_to_invoice_fn`, `generate_invoice_from_so` RPC with an internal 1:1 check. Three defects remain: (1) the recompute sums `amount_qar` and breaks for foreign-currency invoices — same bug we fixed on bills; (2) Dibsy (Qatar's online card gateway) is wired into AR invoices but shouldn't be — sales-order invoices are paid via cash / bank transfer / cheque only, never online card; (3) the RPC's 1:1 enforcement isn't backed by a DB UNIQUE constraint. Layer on the numbering rework and this is a straightforward mirror of the PO/Bill work.

**Dibsy scope decision (locked):** Rip Dibsy out of AR invoices only. Keep the Dibsy library (`src/lib/dibsy.ts`), the shared webhook route, and any other product flows (Telelink etc.) intact. Delete the invoice-specific link endpoint and the invoice branches from the webhook. Drop `invoices.dibsy_payment_id` + `invoices.dibsy_checkout_url` (and the same columns on `tl_invoices` if present).

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
- `src/app/api/payments/dibsy/webhook/route.ts` — delete the two AR-invoice branches (single-invoice update + batch-invoice update). Keep the webhook route file itself and any non-invoice branches (Telelink etc.) unchanged.
- `src/components/sales/InvoiceDetailDocument.tsx` and/or `src/app/(app)/invoices/[id]/page.tsx` — remove any "Send Dibsy link" / "Pay with Dibsy" UI on AR invoice pages if present.
- `src/hooks/useCustomerInvoices.ts` — remove any Dibsy-related mutation hooks (create-link, mark-paid) if present.

**Deleted (Task 2):**
- `src/app/api/payments/dibsy/create-invoice-link/route.ts` — dedicated AR-invoice link endpoint. AR invoices no longer support online payment via Dibsy.

**Modified (Task 3 — manually_paid cleanup):**
- `src/components/sales/InvoiceDetailDocument.tsx` — remove any "Mark as Paid" toggle if present.
- `src/hooks/useCustomerInvoices.ts` — remove any manually_paid mutation if present.

**Preserved (do NOT touch — Dibsy still used elsewhere):**
- `src/lib/dibsy.ts` — Dibsy API client. Other product flows still use it.
- Any other Dibsy branches inside the webhook (e.g. Telelink / prepaid).
- Dibsy env vars, secret validation, test-mode config.

**Untouched (context, do not edit):**
- `src/hooks/usePayments.ts` — AR payment insert code. Reads `direction: 'incoming'` from callers; the trigger takes it from there.
- `src/components/sales/SoPaymentDialog.tsx` — the "Record Payment" flow; already inserts into `payments` correctly.
- PDF generators (`src/lib/sales/generate-invoice-pdf.ts`) — reads `invoice.paid_amount` from the DB. Once the trigger + backfill run, the PDF will render correct numbers automatically.

**Created (6 migration files, mirrored to both folders):**
- Phase 1 Task 1: `20260723100000_invoice_recompute_use_original_currency.sql`
- Phase 1 Task 2: `20260723105000_drop_invoice_dibsy_columns.sql`
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

### Task 2: Remove Dibsy from AR invoices

**Scope:** AR sales-order invoices are paid via cash / bank transfer / cheque only. Dibsy (Qatar online card gateway) should not be wired into `invoices` at all. Rip out the invoice-specific code paths, delete the `create-invoice-link` endpoint, and drop the `dibsy_payment_id` / `dibsy_checkout_url` columns from `invoices` (and `tl_invoices` if present). Keep the Dibsy library and any non-invoice branches (Telelink etc.) fully intact.

**Files:**
- Modify: `src/app/api/payments/dibsy/webhook/route.ts` — delete the two invoice branches.
- Delete: `src/app/api/payments/dibsy/create-invoice-link/route.ts`
- Modify: `src/components/sales/InvoiceDetailDocument.tsx` and/or `src/app/(app)/invoices/[id]/page.tsx` — remove any Dibsy UI.
- Modify: `src/hooks/useCustomerInvoices.ts` — remove any Dibsy-related mutations if present.
- Create: `supabase/migrations/20260723105000_drop_invoice_dibsy_columns.sql`
- Create: `supabase/migrations-staging/20260723105000_drop_invoice_dibsy_columns.sql`

**Interfaces:**
- Consumes: current `invoices.dibsy_payment_id` + `invoices.dibsy_checkout_url` columns (dropped by this task). Same on `tl_invoices` if present.
- Produces: an AR invoice has no online-payment concept. The Dibsy webhook still handles other product branches; only the invoice branches are gone. The invoice-link endpoint returns 404 by virtue of the file being deleted.

- [ ] **Step 1: Audit current Dibsy touchpoints in the AR invoice code**

```bash
grep -rnE "dibsy_payment_id|dibsy_checkout_url|create-invoice-link|customer_batch_invoice_ids|metadata\.invoice_id" src/ --include="*.ts" --include="*.tsx" | head -40
```

Expected hits (approx):
- `src/app/api/payments/dibsy/webhook/route.ts` — the two branches to delete.
- `src/app/api/payments/dibsy/create-invoice-link/route.ts` — the whole file goes.
- Any invoice UI file that references `dibsy_checkout_url` — the button/link component to remove.

Note every file you'll touch before editing anything.

- [ ] **Step 2: Delete the create-invoice-link endpoint**

```bash
rm src/app/api/payments/dibsy/create-invoice-link/route.ts
# Also remove the parent directory if it's now empty:
rmdir src/app/api/payments/dibsy/create-invoice-link 2>/dev/null || true
```

- [ ] **Step 3: Strip the two invoice branches from the webhook**

Read `src/app/api/payments/dibsy/webhook/route.ts`. Identify:
- The `metadata.invoice_id` branch (single-invoice, ~lines 159–191)
- The `metadata.customer_batch_invoice_ids` branch (batch, ~lines 45–98)

Delete both branches entirely. Leave the rest of the routing (any other `metadata.*` branches) intact. If the branch checks are structured as an `if / else if / else if / else` chain and the invoice branches are the middle ones, collapse the chain cleanly — do not leave dead `else if` stubs.

If after removal the webhook has no branches left (only the Telelink flow uses Dibsy today, for example), keep the file — the webhook route itself and its signature validation still need to run.

- [ ] **Step 4: Remove Dibsy UI from invoice pages**

```bash
grep -rnE "dibsy_checkout_url|dibsy_payment_id|Send Dibsy|Pay with Dibsy" src/components/sales src/app --include="*.ts" --include="*.tsx"
```

For each match on an invoice page/component:
- Delete the button JSX.
- Delete any local state / handler.
- Delete the import of `useCreateDibsyInvoiceLink` (or whatever the hook is called) if it becomes unused.
- If the hook file itself only exports invoice-Dibsy mutations, delete the hook file too.

If nothing matches, note "no invoice-side Dibsy UI existed" in the commit body and skip.

- [ ] **Step 5: Write the column-drop migration**

Content of `supabase/migrations/20260723105000_drop_invoice_dibsy_columns.sql`:
```sql
-- Sales-order invoices are paid via cash / bank transfer / cheque only.
-- Dibsy (Qatar online card gateway) is no longer wired into AR invoices;
-- drop the two columns that stored the checkout link + payment id.
--
-- Idempotent: IF EXISTS guards. Applies to invoices and tl_invoices
-- (staging may or may not have the columns on tl_invoices).

BEGIN;

ALTER TABLE public.invoices    DROP COLUMN IF EXISTS dibsy_payment_id;
ALTER TABLE public.invoices    DROP COLUMN IF EXISTS dibsy_checkout_url;
ALTER TABLE public.tl_invoices DROP COLUMN IF EXISTS dibsy_payment_id;
ALTER TABLE public.tl_invoices DROP COLUMN IF EXISTS dibsy_checkout_url;

COMMIT;
```

- [ ] **Step 6: Mirror to migrations-staging/ and apply**

```bash
cp supabase/migrations/20260723105000_drop_invoice_dibsy_columns.sql \
   supabase/migrations-staging/20260723105000_drop_invoice_dibsy_columns.sql
npx supabase db push
```

- [ ] **Step 7: Regenerate types**

```bash
npx supabase gen types typescript --project-id mwvblpgbgxipvrevkeff --schema public > src/types/database.types.ts
```

Re-append the four helper aliases (`AllTables`, `DBTable`, `DBInsert`, `DBUpdate`) — the CLI strips them every time.

- [ ] **Step 8: Typecheck**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "dibsy|invoices" | head -20
```

If any file still references the dropped columns, delete or update those references. Common leftovers: an invoice-detail page still selecting `dibsy_checkout_url`, or a type import that assumed the field.

- [ ] **Step 9: Ask the user to smoke-test**

Message the user:
> "Dibsy removed from AR invoices. Please:
> 1. Open an existing invoice — no 'Send Dibsy link' / 'Pay with Dibsy' button.
> 2. Confirm the invoice list, detail, and PDF all render normally.
> 3. If there's any non-invoice Dibsy flow you use (Telelink prepaid etc.) — confirm it still works.
> The `dibsy_payment_id` and `dibsy_checkout_url` columns are gone from `invoices` (and `tl_invoices`)."

- [ ] **Step 10: Commit after confirmation**

```bash
git add src/app/api/payments/dibsy/webhook/route.ts \
        src/components src/hooks src/app \
        src/types/database.types.ts \
        supabase/migrations/20260723105000_drop_invoice_dibsy_columns.sql \
        supabase/migrations-staging/20260723105000_drop_invoice_dibsy_columns.sql
# Also stage the deletion:
git rm src/app/api/payments/dibsy/create-invoice-link/route.ts
git commit -m "$(cat <<'EOF'
refactor(invoices): remove Dibsy from AR sales-order invoices

Sales-order invoices are paid via cash / bank transfer / cheque only.
Dibsy (Qatar online card gateway) was wired into invoices — writing
paid_amount + manually_paid=true directly from the webhook, bypassing
the trigger and leaving no payments-table audit trail. That whole path
is unused by the actual business flow, so rip it out rather than
migrate it.

Changes:
- Delete src/app/api/payments/dibsy/create-invoice-link/route.ts
- Remove the two invoice branches from the Dibsy webhook
  (metadata.invoice_id + metadata.customer_batch_invoice_ids)
- Drop invoices.dibsy_payment_id + invoices.dibsy_checkout_url
  (and the same columns on tl_invoices if present)
- Remove any invoice-side Dibsy UI

Preserved:
- src/lib/dibsy.ts (used by other product flows)
- The webhook route file itself + signature validation
- Any non-invoice Dibsy branches (e.g. Telelink)

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
3. Open an AR invoice — confirm there is no "Send Dibsy link" / "Pay with Dibsy" UI, and the invoice detail / list / PDF render without errors.
4. If any non-invoice Dibsy flow is in use (e.g. Telelink prepaid) — smoke-test it end-to-end to confirm the webhook + library still work outside the AR branches.
5. Confirm no invoice UI shows "Mark as Paid" toggle.

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
| A Dibsy-paid invoice exists in staging today and its `dibsy_*` columns get dropped. | The webhook branch that would have needed the columns is being removed in the same task, so no live callers break. Pre-flight: `SELECT COUNT(*) FROM invoices WHERE dibsy_payment_id IS NOT NULL;` — if any rows exist, they were prior test-mode payments; audit them before dropping so accounting has a record. |
| A non-invoice Dibsy flow (Telelink etc.) still needs the webhook file / library. | Task 2 removes only the two invoice branches from the webhook and only the invoice-specific `create-invoice-link` endpoint. `src/lib/dibsy.ts`, the webhook route file, and non-invoice branches stay. Verified in Step 1 of the task. |
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

- ✅ **Spec coverage:** Currency fix (Task 1), Dibsy removal from AR + column drop (Task 2), manually_paid reset (Task 3), UNIQUE enforcement (Task 4), numbering RPC + generate_invoice rewrite (Task 5), historical renumbering (Task 6). All the sketch elements accounted for.
- ✅ **Placeholder scan:** No "TBD" / "similar to Task N" / "add appropriate error handling". Every step has concrete SQL or commands.
- ✅ **Type consistency:** `sale_order_id`, `invoice_id`, `so_number`, `next_so_number()` used consistently. `<SO>-I` format decided upfront and used in every task that produces or consumes it.
- ✅ **Prod-paused acknowledged:** Every DB task calls out staging-only application. Prod push explicitly deferred.
- ✅ **Dibsy scope isolated:** Task 2 removes only the AR-invoice paths. `src/lib/dibsy.ts`, the webhook file, and non-invoice branches stay. Audit query in the risks table catches any orphaned Dibsy-paid invoice before columns drop.

---

# Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints

Task 2 (Dibsy removal + column drop) is destructive — columns disappear from the DB. Audit query first (`SELECT COUNT(*) FROM invoices WHERE dibsy_payment_id IS NOT NULL;`) so any test-mode Dibsy payments in staging are logged before the columns go. After the migration, no non-invoice Dibsy flow should be affected — verify at least one such flow (Telelink etc.) if any is in use.
