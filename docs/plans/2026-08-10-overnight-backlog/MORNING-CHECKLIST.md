# WS4 Security P1 — attended morning checklist

**Do NOT skip any step.** Each guard is a BEFORE trigger that *blocks* writes; a
mis-audited guard silently breaks a legitimate RPC/UI save. Drafts live in
`draft-migrations/` (outside `supabase/migrations/`). Ship **one table at a time**,
smoke it, then the next — never batch.

## Global pre-checks (once, before any table)

- [ ] Confirm the CLI still targets staging `mwvblpgbgxipvrevkeff`
      (`npx supabase migration list` / `db push --dry-run`).
- [ ] For each table below, fetch live grants + policies + writer-RPC `prosecdef`:
      confirm every function that writes the table is `prosecdef=true`
      (SECURITY DEFINER). If any writer is INVOKER, STOP — the `current_user` gate
      would block it (this is exactly why `po_line_items` is deferred).

## Per-table ship loop (repeat for each shipping table)

For draft `NN-*.sql`:

1. [ ] Read the draft's header + its section in `security-p1-audit.md`.
2. [ ] Re-grep `src/` for any direct client write to the guarded columns that the
       audit might have missed (`.from('<table>').update(` / `.insert(` / `.delete(`).
3. [ ] Validate every `NEW.<col>` referenced by the draft exists on the LIVE table
       (`\d public.<table>` or an information_schema query). Fix column names.
4. [ ] Copy the draft to `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` AND a
       byte-identical mirror in `supabase/migrations-staging/`.
5. [ ] `npx supabase db push`.
6. [ ] Live-verify: trigger enabled (`pg_trigger.tgenabled='O'`) and the guard
       function `prosecdef=false` (INVOKER).
7. [ ] Operator-smoke every legit write flow for that table (below). Each must
       still succeed; a raw-PostgREST tamper attempt on a guarded column must fail
       with `42501`.
8. [ ] Commit (dual trailer), update PROGRESS.md `## 🔒 Security Audit Log` +
       flows-registry if a flow changed, and this checklist's box.

## Table-specific pre-checks + smoke flows

### 01 `sale_deliveries` (draft 01)
- [ ] Pre-check: `rpc_create_partial_replacement` is DEFINER + inserts a delivery
      whose status is set only by a DEFINER path (passes the gate). Confirm.
- [ ] Pre-check: table still on baseline `USING(true)` policy.
- [ ] Smoke: confirm an SO → creates a `pending` delivery ✓; complete a delivery
      (COGS/stock move) ✓; cancel a delivery (inventory reversal) ✓; edit a
      delivery's warehouse/date ✓; raw `update sale_deliveries set status='delivered'`
      → `42501` ✗.

### 02 `payments` (draft 02)
- [ ] Smoke: record a customer payment ✓; record a PO payment ✓; record an SO
      payment ✓; edit a payment via the edit dialog (DEFINER RPC) ✓; bulk QB-sync
      toggle ✓; raw `update payments set amount=…` → `42501` ✗.

### 03 `so_invoices` (draft 03) — ⚠ BLOCKING pre-check
- [ ] Pre-check: confirm the live base table the app writes is `public.so_invoices`
      (NOT legacy `public.invoices`). If it's a view, the trigger target is wrong —
      STOP and re-scope.
- [ ] Pre-check: confirm exact total column names; add `total`/`tax_amount`/
      `discount_*`/`issued_date`/`due_date` to the guard only if they exist and are
      trigger/RPC-owned.
- [ ] Smoke: issue an invoice from an SO ✓; record a payment → paid_amount recomputes ✓;
      void an invoice ✓; dismiss "needs refresh" ✓; bulk QB-sync ✓; raw
      `update so_invoices set total_amount=…` → `42501` ✗.

### 04 `credit_notes` (draft 04)
- [ ] Smoke: issue a credit note ✓; create CN for a sale return ✓; resolve a CN
      (refund method/reference) ✓; redeem a CN (DEFINER RPC → status resolved) ✓;
      raw `update credit_notes set total_amount=…`/`status='resolved'` → `42501` ✗.

### 05 `debit_notes` (draft 05)
- [ ] Smoke: create a DN for a purchase return ✓; resolve DN as supplier credit
      (status='resolved') ✓; resolve as replacement ✓; apply DN to a bill (DEFINER) ✓;
      raw `update debit_notes set total_amount=…` → `42501` ✗; raw
      `update debit_notes set status='resolved'` → **still allowed** (client-legit).

### 06 `so_po_returns` (draft 06)
- [ ] Smoke: create a PO/SO return ✓; run the full return status machine
      (pending→dispatched→…/received→restocked→closed, cancel) ✓ (status writes must
      still pass); dispatch/restock RPCs stamp `dispatched_at`/`restocked_at` ✓; raw
      `update so_po_returns set dispatched_at=now()` → `42501` ✗.

### 07 `payment_plans` (draft 07) — REVOKE
- [ ] Pre-check: re-grep `src/` — confirm zero `.from('payment_plans').update(/.delete(`.
- [ ] Smoke: create a payment plan (INSERT still granted) ✓; settle an installment
      (DEFINER → status completed) ✓; a raw client `update`/`delete payment_plans`
      → permission denied ✗.

## Deferred (do NOT ship tonight or blind)

- **`po_line_items`** — design a parent-PO-status guard (NOT current_user-gated;
  `rpc_replace_po_lines` is INVOKER). Its own task.
- **`receivals`** — optional narrow allowlist + `REVOKE INSERT,DELETE`. Low value.
- **`shipments`** — no guard needed.
