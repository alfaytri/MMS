# Required Data — codebase & data map (handover)

Everything a fresh session (any account) needs to execute this module without re-exploring. Verified 2026-08-18.

## Read order to resume
1. `design.md` — what we're building and why.
2. `required-data.md` — this file: where everything lives.
3. `issues.md` — open risks/blockers/decisions (living log — read before coding).
4. `phase-1/plan.md` (then `phase-2/plan.md`) — the task list.

---

## DB targets & migration workflow

| DB | Ref | Use |
|---|---|---|
| **Staging (PRIMARY)** | `mwvblpgbgxipvrevkeff` | All migrations go here first (`npx supabase db push`). |
| **New-prod** | `optishfnnctrhffpoywg` | App `alfaytriinventory.vercel.app`, builds from `deploy/warehouse-shipping`. Apply via the guarded `db query --linked` flow (drift-check the live function body FIRST). |
| **Dev (FROZEN)** | `wkmvjxxmzstsvahuiwsz` | Do **NOT** push during the deploy/warehouse-shipping window. |

- Migration files: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`, **mirror every file** into `supabase/migrations-staging/`.
- CLI is linked via `supabase/config.toml`. Only `db query --linked` is authoritative — `baseline_schema.sql` and `database.types.ts` are stale.
- After `supabase gen types … > database.types.ts`, re-append the 4 DBTable/DBInsert/DBUpdate/AllTables helper aliases (CLI wipes them).

---

## Existing serialized tool-unit model

### `public.tool_asset_units` — current full columns
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `item_id` | uuid | FK → **`inventory_items(id)`** ON DELETE SET NULL (remapped `20260723220000`). Catalog lives in `inventory_items`, NOT `tool_asset_items`. |
| `serial_number` | text | UNIQUE partial `uq_tool_asset_units_item_serial (item_id, serial_number) WHERE serial_number IS NOT NULL` (`20260724250000`) |
| `brand` | text | placeholder default `'Default'` |
| `condition` | enum `tool_condition` | default `Good` |
| `status` | enum `tool_status` | default `available` |
| `expiry` | date | |
| `assigned_to` | uuid | **bare uuid, NO FK.** A staff person (`user_data.id`) via `useStaffProfiles`. NOT a team. |
| `division_id` | uuid | FK → `company_divisions(id)` — the **owning** division (`20260827000000`) |
| `receival_item_id` | uuid | FK → `receival_items(id)` ON DELETE SET NULL — **cost source for scrap** (`20260724250000`) |
| `is_placeholder` | boolean | NOT NULL default false |
| `created_at` | timestamptz | |

**No cost/value/purchase_price column exists** — decisive for scrap valuation (see `issues.md` ISSUE-1).

### Enums (baseline `20240101000000`)
- `tool_condition` = `New`, `Good`, `Fair`, `Maintenance` (no CHECK; the enum IS the constraint). UI mirror: `CONDITIONS` in `ToolAssetEditDialog.tsx:99`.
- `tool_status` = `available`, `assigned`, `maintenance`, `retired`.

### Triggers / RLS / RPCs on `tool_asset_units`
- `create_tool_units_on_receival_layer()` — AFTER INSERT ON `fifo_cost_layers` (`20260724250000:47-142`): auto-spawns `qty` placeholder units for `type='tools'` items (serial `<sku>-NNN`, `is_placeholder=true`, condition `Good`, status `available`). Mirror: `remove_tool_placeholders_on_layer_delete()`.
- `guard_tool_unit_division_write()` — BEFORE UPDATE (`20260827000200`): requires `inventory.catalog.manage` when `division_id` changes; other edits ungated.
- RLS (`20260828000000`): `tau_select` open to authenticated; `tau_ins/upd/del` require `inventory.catalog.manage`.
- RPCs: `rpc_transfer_tool_unit(p_unit_id, p_to_division_id, p_notes)` (division only, no ledger row), `rpc_confirm_tool_serial(...)`, `auto_generate_tool_serials(p_item_id)`.

---

## Teams = custody locations (reuse — do not invent a team entity)

- A "team" = a **`warehouse_sub_containers` row under a warehouse with `warehouse_kind='custody'`**, scoped to a division.
- `warehouses.warehouse_kind ∈ {general, repair, custody}` (`20260820000100`; teams+places collapsed to `custody`).
- `CustodyLocationRow` fields (`src/hooks/useCustodyLocations.ts:20-33`): `id, name, warehouse_id, warehouse_name, division_id, division_name, is_active, responsible_person_profile_id (+_name, +_phone), created_at, updated_at`. Unique `(warehouse_id, division_id, name)`.
- Hooks: `src/hooks/useCustodyLocations.ts`, `src/hooks/useCustodyMoves.ts`. Read RPC: `get_custody_master_list(p_warehouse_id?)`. Write RPC: `rpc_upsert_warehouse_sub_container`.
- Components: `src/components/master-data/CustodyLocationsManager.tsx`, `CustodyLocationFormDialog.tsx`; `src/components/warehouse/custody/{CustodyAssignDialog,AcceptCustodyDialog,CustodyReturnDialog}.tsx`.
- The consumption **`is_team_item`** flag is UNRELATED to `tool_asset_units` — a UI routing flag on consumables only.
- DEAD: the old `teams` table was dropped (`20260724000000`); `warehouse_sub_containers.team_id` is an unused placeholder.

---

## Existing tool UI + hooks (Master-Data catalog — leave as-is)

### Hooks — `src/hooks/useInventory.ts`
- `useToolAssetUnits(itemId)` :770 · `useCreateToolAssetUnit()` :789 · `useUpdateToolAssetUnit()` :815 (direct table writes + `activity_log`)
- `useConfirmToolSerial()` :851 · `usePlaceholderUnitsByReceival()` :883 · `useAutoGenerateToolSerials()` :917
- `useTransferToolUnit()` :940 (→ `rpc_transfer_tool_unit`) · `useStaffProfiles()` :1043 (→ `user_data`)
- Tool catalog uses `useInventoryItemsByCategory` / `useCreateToolItem` (there is **no** `useToolAssetItems`).

### Components — `src/components/services/inventory/`
- `ToolsAssetsView.tsx` — the Master-Data Tools & Assets catalog page (`useInventoryTree('tools', …)`).
- `ToolCategoryRow.tsx` — recursive tree; `ToolUnitRows` render serial/brand/condition/status/division/expiry + Transfer/Edit; `BulkToolItemRow` for bulk categories.
- `ToolAssetEditDialog.tsx` — `ToolAssetItemEditDialog` + `ToolAssetUnitEditDialog` (:114-286); `assigned_to` picker shown only when `status='assigned'`.
- `ToolUnitTransferDialog.tsx` — changes owning division only. `BulkToolItemRow.tsx`, `PlaceholderUnitRow.tsx`.

---

## FIFO / write-off / P&L path (scrap target — Phase 2)

- P&L RPC: `rpc_report_pnl(p_start, p_end, p_basis, p_division_ids, p_warehouse_ids)`. Current definition: `supabase/migrations/20260914000000_pnl_lc_variation_cogs_line.sql`.
- The **"Scrap & Defective"** line (`v_scrap`) has exactly two feeds:
  1. **Good pile:** `inventory_stock_movements` (`movement_type='adjustment'`, `reference_type='adjustment'`) → `stock_adjustments` (`adjustment_type='write_off'`, `status='approved'`); value `SUM(ABS(qty)*unit_cost)`; division via `sub_container → warehouse_sub_containers.division_id`.
  2. **Damaged pile:** `inventory_damaged_movements` (`movement_type='damaged_write_off'`); value `SUM(qty*unit_cost)`; division via `dm.division_id`.
- Canonical write-off flow: "Write Off" → `stock_adjustments` (`write_off`) → approval → movement. Dialogs `WhAdjustmentDialog` (good) / `WriteOffDamagedStockDialog` (damaged). Flow registry: **Create Stock Adjustment** (`docs/flows-registry.md:595`).
- Value ALWAYS from the FIFO layer `unit_cost` (stamped onto the movement by `deduct_fifo_layers`). **No cost = no scrap value.**
- Serialized tool units currently never enter `v_scrap` — retiring one writes no movement. The new scrap path (design §8) must derive cost from `receival_item_id`'s FIFO layer and post through path #1.

---

## Where new files go

- **Migrations:** `supabase/migrations/` + mirror `supabase/migrations-staging/`.
- **Nav:** add a **Tools & Assets** entry to the **Operations** menu. Custody is the model (route `/warehouse/custody`). Nav/permission tree is `NAV_TREE` (see `PermissionTree.tsx`; memory `reference_permission_catalog`). → confirm exact route group (`issues.md` ISSUE-5).
- **Route:** mirror the Custody page's app-router group.
- **Hooks:** new files under `src/hooks/` (e.g. `useToolAssignments.ts`, `useToolUnitHistory.ts`).
- **Components:** new folder (e.g. `src/components/warehouse/tools-assets/` or `.../operations/tools-assets/`).

---

## Prior art (dropped, but exactly the shape we want)

The old `tool_assignments` table (dropped `20260724000000`, defined `20260723300000_restore_teams_module_tables.sql:118-131`): `tool_unit_id` FK, `assigned_to` CHECK(`team`/`employee`), `team_id`, `employee_id`, `assigned_at`, `notes`, one-target CHECK. Our `tool_unit_assignments` is the **team-only + temporal (released_at)** evolution of this.

---

## Key reference docs
- This folder's `design.md`.
- `docs/plans/2026-08-15-bulk-tools/{design,plan}.md` — serialized/bulk + transfer-tool-unit.
- `docs/superpowers/specs/2026-08-12-virtual-warehouses-custody-repair-design.md` — custody/teams model.
- `docs/consumption/2026-08-18-team-vs-service-consumption-design.md` — `is_team_item`.
- Flow registry entries: Transfer Serialized Tool Unit (`:947`), Bulk Tools (`:931`), Custody & Consumption (`:193`), Create Stock Adjustment (`:595`).
