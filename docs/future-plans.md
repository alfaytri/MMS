# Future Plans — Backlog

Non-blocking work items surfaced during release checklists or ad-hoc sessions.
Remove items from this file once shipped (do not just strike through — delete).

---

## Open

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
