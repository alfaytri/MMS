# WS4 Security P1 — operator smoke checklist

> ✅ **ALL 7 APPLIED + object-verified on staging (2026-08-10)** — migrations
> `20260819140000`–`20260819200000` (+ mirrors), committed on
> `chore/overnight-backlog-2026-08-10` (not pushed). Each was live-validated before
> apply (columns/enums exist, writers DEFINER or handled) and verified after (trigger
> enabled, guard `prosecdef=false`, anon revoked). See `draft-migrations/README.md`
> for the deviations the live checks forced (payments linkage, so_invoices recompute
> columns).
>
> **The only thing left is the behavioral smoke below** — it needs a logged-in
> session (the guards only fire on the `authenticated`/`anon` role with a real
> JWT+division, which the agent's `db query` role cannot simulate). Run each; every
> legit flow must still succeed, and a raw-PostgREST tamper on a guarded column must
> fail with `42501`. If any legit flow breaks, tell Claude — the fix is a follow-up
> migration to drop/adjust that one guard (reversible).

## Per-table smoke flows

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
