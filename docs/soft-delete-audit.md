# Soft-Delete Audit — Shipping Build (deploy/warehouse-shipping)

**Date:** 2026-08-23 · **Scope:** new-prod (`optishfnnctrhffpoywg`) schema + `src/hooks` delete/archive paths
**Ask:** "check where we have soft delete and change it to hard delete — soft delete causes issues and pollutes the data."

## TL;DR — do **not** blanket-convert to hard delete

Almost every soft-delete here is **load-bearing** — it exists precisely because the row has FK dependents (`NO ACTION`/`RESTRICT`) and/or is a financial or audit record. Converting them to hard delete would either **fail at the database** (FK violation the moment the record has any downstream data) or **destroy history/ledger integrity**. And they are **not actually polluting views** — every read path already filters them (`.is('deleted_at', null)`, `status='archived'` hidden behind a "Show archived" toggle).

The app **already hard-deletes wherever it's safe** (config tables, unassigned roles, empty draft tiers, RFQ quotes, workflow groups, warehouses, credit groups, attribute defs). So the split is deliberate, not accidental.

**The real "pollution" you hit was specific, and is already fixed** — a deleted *role* lingering in the PO Approval Bands (fixed today with the cascade trigger), and approval-*tier* rank collisions (the tier editor already hard-deletes). Those were targeted bugs, not a reason to rip out soft-delete everywhere.

---

## Every soft-delete mechanism, classified

| Table · mechanism | How the app uses it | Inbound FKs | Hard-delete risk | Recommendation |
|---|---|---|---|---|
| **inventory_categories** `status='archived'` | Archive category ([`useInventory.ts`](../src/hooks/useInventory.ts)); hidden behind "Show archived" | 4 (incl. **RESTRICT**) | Can't hard-delete a category that has items/sub-categories — FK RESTRICT blocks it. | **KEEP** |
| **inventory items / brands** `status='archived'` | Archive item / brand-variant | via categories + stock/movement/warranty refs | Stock movements, FIFO layers, warranty records reference variants — hard-delete would orphan or destroy history. | **KEEP** |
| **inventory_attribute_options** `is_archived` | Archive an attribute option | 1 (**RESTRICT**) | Items using the option block deletion. | **KEEP** |
| **purchase_orders** `deleted_at` | `useSoftDeletePO` (draft/RFQ removal); read-filtered | **9** (NO ACTION + CASCADE) | Once a PO has line items / approvals / receivals / bills / snapshots, `NO ACTION` FKs block a hard delete. | **KEEP** (optional: allow hard delete only for a *zero-dependent draft*) |
| **sale_orders** `deleted_at` | SO removal; read-filtered | 5 (**RESTRICT** + NO ACTION) | Deliveries / invoices / returns / line items block deletion. | **KEEP** |
| **payments** `deleted_at` | Payment void (RPC); read-filtered | 2 | **Financial ledger** — allocations reference payments; hard delete breaks AR/AP history + audit. | **KEEP (never hard-delete)** |
| **so_po_returns** `deleted_at` | Return void; read-filtered | 5 (CASCADE/NO ACTION/SET NULL) | Return lines + credit/debit notes reference returns. | **KEEP** |
| **reason_lists / reason_list_categories** `deleted_at` | Retire a reason option | 2 each (**NO ACTION**) | Historical stock-adjustments / returns store the reason — hard delete would fail once used and would erase the label on old records. | **KEEP** |
| **po_approval_chains** `archived_at` | `useArchiveApprovalChain` (guards active approvals) | 1 (CASCADE → tiers) | Archiving preserves *which chain backed past approvals*; hard delete loses that lineage. | **KEEP** |
| **approval_workflow_steps** `archived_at` | Archive a workflow step | — | Preserves history of steps that governed past approvals. | **KEEP** |
| **shipments** `archived` (bool) | `useShipments` archive | — | Low stakes, but archive keeps tracking-event history. | **KEEP** (harden only if you never want shipment history) |
| **custom_roles** `deleted_at` | **App already HARD-deletes** (`useDeleteRole`) | 2 | Column is effectively **vestigial** — the UI hard-deletes; today's cascade trigger cleans the tier arrays. | **Already hard** — column can be dropped later (harmless if left) |
| **po_approval_chain_tiers** `deleted_at` | **App already HARD-deletes** (frees the `UNIQUE(chain_id,rank)` slot) | 0 | Column **vestigial**; the tier editor hard-deletes by design. | **Already hard** — column can be dropped later |

> The many `is_active` columns (customers, suppliers, divisions, currencies, payment_methods, po_approval_chains, …) are **enable/disable toggles, not deletes** — out of scope; leave as-is.

---

## Why hard-delete is the wrong tool here

1. **FK integrity.** These tables sit at the top of dependency trees. Postgres `NO ACTION`/`RESTRICT` FKs will *refuse* a hard delete once any downstream row exists — so a "convert to hard delete" either silently only works on empty drafts, or throws `23503` in the operator's face on everything real.
2. **Financial + audit history.** Payments, invoices-via-returns, approval lineage, stock movements, warranty records — regulators and your own P&L depend on these staying referenceable. A soft-deleted payment still balances the ledger; a hard-deleted one corrupts it.
3. **They don't pollute.** Every list/report already filters soft-deleted rows. The visible-data problem you saw was the role→tier cascade, now fixed at the DB level.

## If you still want to reduce soft-delete clutter — the safe levers

- **Purge truly-orphan soft-deleted rows** (a maintenance job): hard-delete only rows where `deleted_at is not null` AND no inbound FK rows exist. Safe, reversible to design, and keeps integrity. I can write this per-table on request.
- **Drop the 2 vestigial columns** (`custom_roles.deleted_at`, `po_approval_chain_tiers.deleted_at`) since the app hard-deletes those already — pure cleanup, no behavior change.
- **Targeted cascade fixes** (like today's role→tier trigger) for any *specific* place a removed record lingers — tell me where and I'll fix that one.
- **Allow hard-delete for zero-dependent drafts** (PO/SO) if you want draft removal to leave no trace — a guarded RPC that hard-deletes only when the draft has no children.

**Blanket soft→hard conversion is not recommended and would break FK integrity + destroy financial/audit history.**

---

## Definitive verdict — would converting to HARD delete break?

### 🔴 WOULD BREAK — keep soft-delete
Hard delete throws a foreign-key error (`23503`) the moment the record has real data, or destroys financial/audit history.

| Path | Blocking inbound dependents (ON DELETE) |
|---|---|
| **inventory_item_brand_variants** | 10× `NO ACTION` (stock_movements, cogs_entries, receival_items, sale_order_lines, sale_delivery_lines, return_lines, warehouse_transfer_items, inventory_check_items, stock_adjustments, landed_cost_item_allocations) + 5× `RESTRICT` (fifo_cost_layers, consumption_lines, inventory_damaged_stock ×3) — breaks the instant a variant has any stock or history |
| **inventory_items** | cascades into its brand-variants → hits the variant blockers above → breaks |
| **inventory_categories** | `NO ACTION` (inventory_items) + `RESTRICT` (sub-categories) |
| **inventory_attribute_options** | `RESTRICT` (inventory_item_attributes) |
| **purchase_orders** | `NO ACTION` (bills, receivals, debit_notes, shipments) — once received/billed |
| **sale_orders** | `NO ACTION` (sale_order_lines, sale_deliveries, so_invoices, cogs_entries) + `RESTRICT` (warranty_records) |
| **payments** | `NO ACTION` (payment_installments) + AR/AP ledger integrity |
| **so_po_returns** | `NO ACTION` (debit_notes, warranty_claims) |
| **reason_lists / reason_list_categories** | `NO ACTION` (credit_notes, debit_notes) — breaks once a reason has been used |

### 🟢 WON'T BREAK — safe to hard-delete
No blocking dependents; soft-delete here is a *choice* (history-keeping), not an FK necessity.

| Path | Why safe |
|---|---|
| **po_approval_chain_tiers** | **0 inbound FKs** — and the app **already hard-deletes** these; the `deleted_at` column is vestigial |
| **custom_roles** | app **already hard-deletes** (`useDeleteRole`); only blocks if the role still backs an `approval_workflow_steps` row (`NO ACTION`) — otherwise clean; today's trigger clears the tier arrays |
| **approval_workflow_steps** | no inbound FKs — `archived_at` is history-keeping only |
| **po_approval_chains** | only `CASCADE` to its own tiers, no external refs — safe, but you'd lose the chain's config history |
| **shipments** | no blocking inbound FKs — `archived` is history-keeping only |

**Net:** the only paths that are *both* safe to convert *and* not already hard are **approval_workflow_steps, po_approval_chains, shipments** — and each keeps its archive flag on purpose (to preserve the history of what governed past records). Everything financial, inventory, or order-related **must stay soft.** Two columns (`custom_roles.deleted_at`, `po_approval_chain_tiers.deleted_at`) are already-hard vestigial and can simply be dropped.
