# Future Plans — Backlog

Non-blocking work items surfaced during release checklists or ad-hoc sessions.
Remove items from this file once shipped (do not just strike through — delete).

---

## Open

### Security P1 — per-table value/state guards on remaining direct-write tables

**Surfaced:** 2026-08-09 (division-scope RLS audit) — continuation of the shipped P1 work
**Priority:** Medium-High — closes the same tamper class already fixed for `sale_orders` and `purchase_orders`

> **Update 2026-08-10:** a full per-table write-path audit + **draft** guard migrations
> now exist under `docs/plans/2026-08-10-overnight-backlog/` (audit `security-p1-audit.md`,
> drafts `draft-migrations/01–07`, `MORNING-CHECKLIST.md`). Drafts are NOT applied — each
> needs the attended pre-check + operator smoke in the checklist before shipping. Key
> refinements vs the notes below: `debit_notes` status IS client-legit (money-only guard);
> `so_po_returns` status machine is client-driven (only `dispatched_at`/`restocked_at`
> safe to lock); `po_line_items` can't take a `current_user` guard (`rpc_replace_po_lines`
> is INVOKER — needs a parent-PO-status guard instead); `payment_plans` → REVOKE not a
> trigger; `shipments` needs no guard. Trim this section once the guards ship.

**Problem.** The app-wide `division_scope_*` RLS pattern gates writes only on
`is_division_visible(division_id)` — not on *which column* or *state transition* is
being written. Several tables still have direct client write grants and no
value/state guard, so an authenticated division member could raw-PostgREST UPDATE
money or workflow fields, bypassing the DEFINER RPCs + audit trail. P0 revoked the
grants on the 7 RPC-only tables; P1 adds guard triggers to the tables that still
*need* some client writes but must protect specific columns/statuses.

Already shipped (the template to copy): `sale_orders` status guard
(`20260819110000`) and `purchase_orders` financial-column lock
(`20260819130000`) — both use a BEFORE INS/UPD trigger, `SECURITY INVOKER`,
`SET search_path=public`, and the `current_user IN ('authenticated','anon')` test so
only direct client writes are blocked while DEFINER workflow RPCs pass.

**Remaining tables + intended guard:**
- **`payments`** — block direct client edits to `amount` / `amount_qar` /
  `exchange_rate` / `direction` (and re-linking `invoice_id` / `bill_id` /
  `credit_note_id`). All legit edits go through `rpc_edit_*_payment` /
  `rpc_delete_*_payment` (DEFINER, permission-gated) shipped in the AP/AR payment
  edit work.
- **`so_invoices`** — block direct client writes to totals / balance
  (`total_amount`, `paid_amount`, `payment_status`); those are owned by the
  recompute triggers + invoice-generation/sync DEFINER RPCs only.
- **`so_po_returns`** — block forging workflow-only statuses directly (mirror the
  `sale_orders` guard: allow the creation/cancel states, block the rest).
- **`sale_deliveries`** — same: block direct writes to workflow-only delivery
  statuses; only `complete_delivery_inventory` / delivery RPCs may set them.
- **`credit_notes` / `debit_notes`** — lock amount + status against direct client
  writes; issuance/redemption/void flow through their DEFINER RPCs.

Also review (lower confidence, confirm each has direct grants + a real vector before
guarding): `po_line_items`, `payment_plans`, `receivals`, `shipments`.

**Required work (per table):**
1. Confirm the table still has direct `authenticated` write grants (if a P0-style
   full revoke is safe because every writer is DEFINER, prefer that over a guard).
2. Audit `src/` for any legit direct client write to the protected columns/statuses
   before adding the guard (don't break a real flow).
3. Add the guard trigger (INVOKER, `current_user IN ('authenticated','anon')`,
   `SET search_path=public`), STAGING-only + byte-identical mirror to
   `supabase/migrations-staging/`.
4. Live-verify (`prosecdef=false`, trigger enabled) + operator-smoke every legit
   write flow still succeeds before commit.

**Why deferred:** each table needs its own audit of legit write paths + an operator
smoke of the real flow; batching them blind risks blocking a legitimate RPC or UI
save. Do them one (or a small related group) at a time.

**Plan / full list:** `docs/security/2026-08-09-division-scope-rls-audit-remediation.md`.
Related shipped guards: `sale_orders` (`20260819110000`), `purchase_orders`
(`20260819130000`).

### fifo_cost_layers.receival_id — text → uuid FK

**Surfaced:** 2026-08-08 (inventory-tree audit)
**Priority:** Medium — fragile, but isolated and risky; needs its own careful branch

**Problem.** `fifo_cost_layers.receival_id` is stored as `text`, not a `uuid` FK to
`receivals(id)`. Every RPC that touches it has to cast text→uuid, which has already
caused three hotfix migrations (`20260728010000`, `20260724270000`,
`20260724280000`). No referential integrity — a layer can point at a
non-existent receival.

**Required work:**
1. Add a `receival_uuid uuid` column, backfill from the text column with validation
   (flag any rows whose text isn't a valid/existing receival id).
2. Add the FK to `receivals(id)` (choose ON DELETE policy — likely RESTRICT).
3. Rewrite every RPC that reads/writes `receival_id` to use the uuid column
   (source live bodies via `pg_get_functiondef` per the project rule — do NOT copy
   from stale baseline).
4. Swap reads to the new column, drop the text column in a later cleanup.

**Why deferred:** changing a column type on a live table with data + rewriting the
FIFO/receival RPC chain is high-blast-radius. Never fold into a feature branch.

### Dead inventory component deletion

**Surfaced:** 2026-08-08 (inventory-tree audit)
**Priority:** Low — dead weight, ~1000 unused lines

> **Update 2026-08-10 — DONE (pending merge):** all three files deleted on branch
> `chore/overnight-backlog-2026-08-10` (commit `222a5b67`); grep confirmed zero live
> imports, `tsc` clean. Delete this section after the branch merges.

**Problem.** Three components are imported nowhere:
- `src/components/services/inventory/InventoryColumnPicker.tsx` — standalone, safe to delete anytime.
- `src/components/master-data/BrandVariantFormDialog.tsx`
- `src/components/master-data/InventoryItemFormDialog.tsx`

The two form dialogs were historically the only writers of `brand_id`. Once the
brands/origin feature ships its live brand picker, they are fully superseded and
should be removed so there is one brand-writing path, not a dormant second one.

**Required work:** confirm zero imports (grep), delete the three files, run
`tsc --noEmit`. Do the two form dialogs **after** `feature/inventory-brands-and-origin`
merges (so the live picker exists first).

### Brand-dedup migration — cross-table safety if ever replayed

**Surfaced:** 2026-08-08 (Inventory Brands & Origin, Task 1 review)
**Priority:** Low on staging (moot), Medium before any prod/dev replay

**Problem.** Migration `20260819000000_inventory_origin_and_integrity.sql` includes a
brand-dedup pre-step (section 2a) that re-points ONLY
`inventory_item_brand_variants.brand_id` off duplicate `brands` rows before deleting
them. `public.brands` has (per the stale baseline) other cascade-dependent tables —
`service_brands.brand_id` / `brand_group_members.brand_id` (`ON DELETE CASCADE`),
`contract_services.brand_id` (`NO ACTION`). On the **current staging DB these three
tables do not exist** (verified 2026-08-08 via `supabase inspect db table-stats` — only
`public.brands` + `public.inventory_item_brand_variants` remain), so the dedup was safe
and lost nothing. But if this migration chain is ever replayed on a DB where those
tables exist and reference a merged duplicate brand, the delete could silently cascade
(CASCADE tables) or abort (NO ACTION table).

**Required work (only before a prod/dev replay):** harden the dedup to either re-point
ALL referencing tables, or `RAISE EXCEPTION` if a to-be-deleted brand is still
referenced outside `inventory_item_brand_variants`. Do NOT edit the already-applied
migration file (breaks staging migration history) — add a follow-up migration if needed.

### Inventory-tree low-priority nits (batch cleanup)

**Surfaced:** 2026-08-08 (inventory-tree audit)
**Priority:** Low — polish / consistency / accessibility, do as one pass

> **Update 2026-08-10 — mostly DONE (pending merge)** on branch
> `chore/overnight-backlog-2026-08-10` (commit `3bf35bc9`): `staleTime` fix,
> aria-labels, shared `filterTree`, sort-arrow consistency, and the
> `useVariantWarehouseStock` `.limit()` are shipped. **Still open** (kept in the list
> below): the FifoLayersTable skeleton was already matching (no change needed), the
> broad `.limit()` sweep of "show-all" hooks (e.g. `useInventoryItemsFlat` — needs a
> row-count-safe limit, not a blind one), and the **stale FK / RLS-policy names** from
> the rename (a DB migration — out of the code-only scope).

**Items:**
- `useVariantWarehouseStock` / `useVariantWarehouseStock`-style hooks with
  `staleTime: 0` → refetch noise on every hover/mount.
- Icon-only buttons using `title=` instead of `aria-label` across `CategoryRow`,
  `ItemRow`, `BrandVariantRow` (screen-reader gap).
- Duplicated `filterTree` helper in `ItemsListView.tsx` and `ToolsAssetsView.tsx`.
- `FifoLayersTable` skeleton widths don't match data columns → visible shift on load.
- Inconsistent sort-arrow placement (`CategoryRow` right vs `ToolCategoryRow` left).
- Stale FK / RLS-policy names left over from the `inventory_brand_variants` →
  `inventory_item_brand_variants` rename (functional, just confusing).
- `.limit()` gaps on inventory list hooks not touched by the brands/origin feature.
