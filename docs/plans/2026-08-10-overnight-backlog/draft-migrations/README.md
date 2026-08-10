# DRAFT guard migrations — Security P1 (2026-08-10)

> ✅ **SUPERSEDED — ALL APPLIED to staging 2026-08-10.** After the operator opted to
> proceed, each draft was re-validated against the LIVE DB (`supabase db query --linked`)
> and shipped as a real migration in `supabase/migrations/` (+ staging mirror):
> `20260819140000` sale_deliveries · `…150000` payments · `…160000` so_invoices ·
> `…170000` credit_notes · `…180000` debit_notes · `…190000` so_po_returns ·
> `…200000` payment_plans. Each was object-verified (trigger enabled, guard
> `prosecdef=false`, anon revoked). **These draft files are historical** — the applied
> migrations are authoritative and differ where live checks demanded:
> - **payments**: `invoice_id`/linkage columns are NOT guarded — `attach_payment_to_invoice`
>   / `detach_payment_from_invoice` are SECURITY INVOKER and client-called, so guarding
>   `invoice_id` would break attach/detach. Only pure money/value columns are locked.
>   (Follow-up: harden attach/detach to DEFINER+auth, then lock linkage.)
> - **so_invoices**: `paid_amount`/`payment_status` are NOT guarded — the INVOKER
>   `invoice_recompute_paid_fn` (AFTER trigger on payments) writes them as the caller;
>   guarding them would break payment recording. Totals + linkage + non-void status are locked.
> - **payment_plans**: `TRUNCATE` remains granted to `authenticated` (pre-existing, table-wide
>   P2 sweep item — not addressed here).
>
> The only remaining step is the per-table **behavioral operator smoke** in
> `../MORNING-CHECKLIST.md` (needs a logged-in session; the agent cannot do it).

> ⚠️ **[Original draft notice] THESE ARE DRAFTS. NOT APPLIED. NOT PUSHED.** They live here, **outside**
> `supabase/migrations/`, on purpose so `supabase db push` can never pick them up.
> Do NOT `db push` from this folder. The attended morning session reviews each
> file, runs the pre-checks in `../MORNING-CHECKLIST.md`, then copies the approved
> ones into `supabase/migrations/YYYYMMDDHHMMSS_*.sql` **and** the byte-identical
> mirror in `supabase/migrations-staging/`, and only then applies + smokes them.

Each guard follows the shipped template exactly
(`supabase/migrations/20260819110000_guard_so_privileged_status.sql`,
`..._20260819130000_guard_po_locked_columns.sql`): a `SECURITY INVOKER` BEFORE
trigger with `SET search_path TO 'public'` and the
`IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;` gate,
so every SECURITY DEFINER workflow RPC (and the service role) passes and only
direct PostgREST client writes are blocked.

Findings and column lists come from the per-table write-path audit in
`../security-p1-audit.md`.

## Files (ship order = confidence order)

| # | File | Table | Shape | Confidence |
|---|------|-------|-------|-----------|
| 01 | `01-guard-sale-deliveries-status.sql` | `sale_deliveries` | BEFORE INS/UPD status guard (mirror of SO) | highest |
| 02 | `02-guard-payments-immutable-columns.sql` | `payments` | BEFORE UPDATE money/link/status lock | very high |
| 03 | `03-guard-so-invoices-amounts.sql` | `so_invoices` | BEFORE UPDATE totals + status(≠void) lock | very high ⚠ verify table name |
| 04 | `04-guard-credit-notes-immutable.sql` | `credit_notes` | BEFORE UPDATE amount+status+link lock | high |
| 05 | `05-guard-debit-notes-money-columns.sql` | `debit_notes` | BEFORE UPDATE **money-only** lock (status is client-legit) | high |
| 06 | `06-guard-so-po-returns-rpc-timestamps.sql` | `so_po_returns` | BEFORE UPDATE narrow `dispatched_at`/`restocked_at` lock | low (status machine is client-driven) |
| 07 | `07-revoke-payment-plans-client-writes.sql` | `payment_plans` | REVOKE UPDATE/DELETE (no legit client edit) | medium |

## Deliberately NOT drafted (documented in `../security-p1-audit.md`)

- **`po_line_items`** — a `current_user` guard would break BOTH `rpc_replace_po_lines`
  (it is **SECURITY INVOKER**, runs as the caller) and `useAwardQuote` (writes prices
  directly during RFQ award). The viable protection is a guard keyed on the *parent
  PO's status* (block line edits when the PO is in a locked state) — a separate design,
  not a drop-in template. Deferred.
- **`receivals`** — only benign flag columns (`is_replacement`, `source_debit_note_id`)
  are client-written; no financial column is directly client-writable. Marginal value;
  optional narrow allowlist + `REVOKE INSERT,DELETE` if desired. Deferred.
- **`shipments`** — no financial/privileged column; every write (status, events,
  archived) is a legitimate logistics edit. **No guard needed.**

## Corrected assumption (vs the plan)

Migration `20260806000000_lock_money_table_rls.sql` already gates
`payments` / `so_invoices` / `credit_notes` / `debit_notes` write policies on the
module's `*.manage` permission (not just division visibility). So the threat actor
for those four is "a user holding `*.manage`", not "any division member" — narrower
blast radius, but the guards are still warranted (a permitted clerk can still rewrite
amounts/totals via raw PostgREST). `payment_plans`, `sale_deliveries`, `so_po_returns`
remain on the wide-open baseline `USING(true)` policy.
