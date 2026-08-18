# Phase 2 — Required Data (codebase & data map for Health & Disposal)

Everything a fresh session (any account) needs to build **Phase 2** (design.md §8–9: on-demand monthly condition checks + Repair bucket + scrap→P&L) without re-exploring. Investigated against the **live staging DB** 2026-08-18. Read `../design.md` §4.2/§5.2/§6/§7/§8/§11 + `../issues.md` (ISSUE-1/2/7) first, then this file, then `phase-2/plan.md`.

> **Phase 1 is done** (assign/move/return/history) — shipped to new-prod DB (frontend push held). Phase 2 layers onto the same hub + ledger. Do NOT rebuild Phase-1 pieces.

---

## DB targets & workflow (unchanged from Phase 1)

| DB | Ref | Use |
|---|---|---|
| **Staging (PRIMARY)** | `mwvblpgbgxipvrevkeff` | migrations via `npx supabase db push`; reads via `npx supabase db query --linked` (linked = staging; **one-line SQL only**, JSON serializer drops FROM-less scalar SELECTs → use row-returning / `RAISE NOTICE`). |
| **New-prod** | `optishfnnctrhffpoywg` | guarded apply at ship time via **`psql`** using `NEW_DB_URL` from `supabase/.temp/migrate.env` (multi-statement files → psql; direct host `db.<ref>.supabase.co:5432`). Drift-check each live object FIRST. |
| **Dev (FROZEN)** | `wkmvjxxmzstsvahuiwsz` | do NOT push. |

- Mirror every migration into `supabase/migrations-staging/` in the same commit.
- **psql lives at** `C:\Program Files\PostgreSQL\18\bin\psql.exe`. `NEW_DB_URL` (new-prod) is a ready connection string; the **staging** pooler-url has **no embedded password** (psql hangs) — for staging use `db query --linked`, or build `postgresql://postgres:<STAGING_DB_PASSWORD>@db.mwvblpgbgxipvrevkeff.supabase.co:5432/postgres` **via `PGPASSWORD` env** (the password has URL-special chars — do NOT inline it into the URL).
- **cwd trap:** the Bash tool's cwd persists across calls; a stray `cd` breaks later relative paths. Use absolute paths or `git -C /d/MMS`.
- Admin sub for impersonated write-probes: **staging** `e9dc82d6-64eb-453c-b8f5-a5a4bbc91f00`; **new-prod** `ef36d9ca-421d-4d6d-adcd-895ae2d733de` (both hold `inventory.catalog.manage`). `auth.uid()` reads `request.jwt.claim.sub`; set via `SELECT set_config('request.jwt.claim.sub', '<sub>', true);` inside the probe transaction.

---

## ISSUE-1 (🔴→RESOLVED-in-principle): serialized-tool scrap→P&L plumbing EXISTS

**Finding: serialized tools DO carry the standard qty-stock plumbing in parallel to the unit records.** On staging, for the item set behind `tool_asset_units`:
- **138** `inventory_item_brand_variants` rows (tool items have brand-variants).
- **140** `warehouse_stock_summary` rows, **total qty 1,124** (`item_type='tools'`) — tools maintain per-`(brand_variant_id, sub_container_id)` qty stock.
- **160** `fifo_cost_layers` (cost source: `unit_cost` + `landed_cost_per_unit` = `total_unit_cost`).

So the design §8 path (scrap → `stock_adjustments` write-off → `inventory_stock_movements` → P&L `v_scrap`) is **viable** — it is keyed on `(brand_variant_id, sub_container_id)`, and tools have both.

### Unit → stock-position mapping (clean)
`tool_asset_units.receival_item_id → receival_items(brand_variant_id, sub_container_id)`. The FIFO layer is `fifo_cost_layers WHERE brand_variant_id = ri.brand_variant_id AND receival_id = ri.receival_id` → `total_unit_cost`, `remaining_qty`, `sub_container_id`. A received unit's brand-variant, its stock sub-container, its unit cost, and a live `warehouse_stock_summary` row all resolve from `receival_item_id`. **Verified by end-to-end trace** (e.g. serial `AD-001-136` → cost 2.46, layer_rem 1, a `tools` stock row qty 1).

### ⚠️ Coverage reality (decisive for valuation)
- **Only 26 of 1,326** staging units have a `receival_item_id` (→ FIFO layer → cost). **1,300 have none** (seed/`inventory_import` data) → **no cost on record** → design §8 edge = **scrap retires the unit but posts ZERO value with a note** (do NOT fail the scrap).
- **16** placeholder units (`is_placeholder=true`); placeholders that came through a real receival ARE costed (trace shows `ph=true, has_layer=true`).
- **new-prod has 0 tool units** — every future tool arrives via PO→receival (→ FIFO layer) → scrap will value correctly there. The zero-value majority is a **staging seed artifact only.**

### 🟠 DESIGN FORK for the operator (valuation of no-cost units)
1. **(design §8) zero + note** — retire, post 0 to P&L, show "no cost on record". Simplest; truthful for legacy seed.
2. **average-cost fallback** — when no FIFO layer, value the scrap at the brand-variant's `average_cost` (`inventory_item_brand_variants.average_cost` / `warehouse_stock_summary.avg_cost`). Non-zero P&L for the 1,300 legacy units. Slightly more code.
> Recommend **(1)** for correctness (legacy units genuinely have no recorded cost; new-prod is unaffected). Confirm before building.

### Write-off path to REUSE (do not write new P&L code)
- `create_stock_adjustment_v2(p_warehouse_id, p_brand_variant_id, p_adjustment_type 'write_off', p_qty, p_reason, p_notes, p_photo_urls, p_requested_by, p_requested_by_name, p_sub_container_id)` — creates the `stock_adjustments` header + approval chain.
- Applier on final approval books `inventory_stock_movements` (`movement_type='adjustment'`, `reference_type='adjustment'`, `unit_cost` FIFO-stamped) + `deduct_fifo_layers`: `action_stock_adjustment_step` / `apply_adjustment(p_adjustment_id)` / `force_approve_stock_adjustment(p_adjustment_id, p_comment)`.
- **Scrap needs an ATOMIC post** (no human approval step). Two options to pin in the plan: (a) `create_stock_adjustment_v2` then `force_approve_stock_adjustment`/`apply_adjustment` inside the scrap RPC; or (b) the scrap RPC inserts an `approved` write-off row + calls the core applier directly. **Read `apply_adjustment` + `action_stock_adjustment_step` live bodies before choosing** (feedback: rewrite-from-live-DB). Prefer reusing `apply_adjustment` so P&L logic stays single-sourced.
- P&L `v_scrap` feed #1 (confirmed in Phase-1 `required-data.md`): `inventory_stock_movements` (`movement_type='adjustment'`, `reference_type='adjustment'`) → `stock_adjustments` (`write_off`, `status='approved'`), value `SUM(ABS(qty)*unit_cost)`, division via `sub_container → warehouse_sub_containers.division_id`. RPC `rpc_report_pnl` (def in `supabase/migrations/20260914000000_pnl_lc_variation_cogs_line.sql`).

---

## ISSUE-2 (🟠→addressed by path reuse): FIFO qty vs unit count

- Tool receival: `create_tool_units_on_receival_layer()` fires **AFTER INSERT ON `fifo_cost_layers`** and spawns `qty` units (serial `<sku>-NNN`, `is_placeholder=true`). So a layer of qty N ↔ N units at receival.
- **Unit custody (Phase 1) and qty stock are decoupled** — assign/move/return only touch `tool_asset_units` (+ pointer), never `warehouse_stock_summary` qty. The qty stays at the **receival** sub-container; the unit's "location" is `current_custody_location_id`. They are two parallel ledgers that **only need to reconcile on scrap**.
- **Scrap reconciles both:** the reused write-off path already decrements `warehouse_stock_summary` qty + `fifo_cost_layers.remaining_qty` (via `deduct_fifo_layers`) for the `(brand_variant, sub_container)`; the scrap RPC additionally retires **1 unit** + closes its ledger row. Net: −1 unit, −1 qty, −1 FIFO remaining, +cost to `v_scrap`.
- **Build note:** deduct is FIFO-oldest for the `(brand_variant, sub_container)`, not necessarily the scrapped unit's own layer. Acceptable (matches every other write-off). If the qty stock at the receival sub-container is already 0 (manual drift), the write-off must **not** hard-fail the scrap — retire the unit + surface a warning. Add a rolled-back probe.

## ISSUE-7 (🟡→addressed): placeholder units

Placeholders are **valid** units (auto serial `<sku>-NNN`, confirmed later via `rpc_confirm_tool_serial`). They can be inspected + scrapped like any unit and are costed if received through a real layer. UI: allow inspection/scrap; show an "unconfirmed serial" badge (already the Phase-1 convention). No special DB handling.

---

## New table — `tool_unit_inspections` (design §4.2)

`id uuid pk · unit_id uuid NOT NULL FK→tool_asset_units(id) · custody_location_id uuid NULL (team at check time, snapshot) · inspected_at timestamptz default now() · inspected_by uuid NULL · verdict text NOT NULL CHECK IN ('good','bad','under_repair') · notes text NULL`. RLS on + SELECT to authenticated + write gated on `inventory.catalog.manage` (mirror `tool_unit_assignments` policies exactly). "Last checked" = `MAX(inspected_at)` per unit; "due this month" = no inspection in the current calendar month.

## Lifecycle vocabulary (design §6) — NO new enums (§4.4)

| User word | Persisted | RPC |
|---|---|---|
| Good | `condition='Good'` | `rpc_record_tool_inspection(unit, 'good', notes)` |
| Bad / Needs attention | `condition='Fair'` (reused) | `…'bad'…` |
| Under-repair | `status='maintenance'` | `…'under_repair'…` |
| Repaired | `status='assigned'` (or `available` if unheld) + `condition='Good'` | `rpc_resolve_tool_repair(unit, 'repaired', notes)` |
| Scrap | `status='retired'` + ledger row closed `release_reason='scrapped'` + pointer NULL + P&L write-off | `rpc_resolve_tool_repair(unit, 'scrap', notes)` |

Live enums to **re-confirm before writing SQL** (per Phase-1 `required-data.md`): `tool_condition` = New/Good/Fair/Maintenance; `tool_status` = available/assigned/maintenance/retired. `tool_unit_assignments.release_reason` CHECK already allows `'scrapped'` (added in `20260920000000`).

## Frontend to extend (Phase-1 files — reuse, don't duplicate)

- `src/components/warehouse/tools-assets/ToolsAssetsHub.tsx` — add a **Repair** tab (§5.2) beside Teams / History & Usage.
- `src/components/warehouse/tools-assets/TeamToolsDetail.tsx` — add per-row **verdict buttons** (Good / Bad / Under-repair) + a "last checked / due this month" hint (§5.1).
- New: `RepairTab.tsx` (bucket of `status='maintenance'` units → Repaired / Scrap), `ScrapToolDialog.tsx` (confirm + optional cost note), inspection controls.
- New hooks: `useToolInspections.ts` (record-inspection, last-checked), `useToolRepair.ts` (resolve-repair incl. scrap). Mirror `useToolAssignments.ts` (createClient import, `toDbError`, `queryKeys.toolAssignments` invalidation pattern).
- RPCs all `SECURITY DEFINER`, permission-gated in-body (`_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage')`), `REVOKE ALL … FROM public` + `GRANT … TO authenticated, service_role`.

## Watch-list when building
- **ISSUE-1 valuation fork** — get the operator's zero-vs-average-cost decision before the scrap RPC.
- **ISSUE-2 drift** — scrap must not hard-fail if qty stock is already 0/short at the receival sub-container.
- Read `apply_adjustment` + `action_stock_adjustment_step` live bodies before writing the scrap RPC (single-source the P&L posting).
- Same-division / establish-on-assign rules from Phase 1 do not apply to inspections/scrap (those don't move divisions).
