# Handover — Teams + Places + Consumption

**Branch:** `feature/field-inventory-and-consumption`
**Base:** `deploy/warehouse-shipping`
**Plan:** [docs/plans/2026-08-03-teams-places-consumption.md](docs/plans/2026-08-03-teams-places-consumption.md)
**Last touched:** 2026-08-03

## How to resume

1. Read [PROGRESS.md](PROGRESS.md) — the `## 🔄 In Progress` block points at Task 9.
2. Read the plan doc above end-to-end. It's been amended twice this session; the current version is authoritative.
3. Read this handover for what changed vs. the plan and where the sharp edges are.
4. Skim `git log --oneline` from `b83d420c` forward — every commit has a self-contained message explaining what it did.

## Status

- ✅ **Task 1** — warehouse_kind enum + team_id column (`20260815000100`)
- ✅ **Task 2** — transfer_kind + stock_movement_type enum extensions (`20260815000200`)
- ✅ **Task 3** — consumption_entries + consumption_lines + cogs_entries extension (`20260815000300`)
- ✅ **Task 4** — `rpc_post_consumption` + `rpc_cancel_consumption` (`20260815000400`)
- ✅ **Task 5** — types regen
- ✅ **Task 6** — `useWarehouses({ kinds })` filter (already existed as `excludeKinds`)
- ✅ **Task 7** — Master Data → Places page (later removed in the consolidation step, see below)
- ✅ **Task 8** — `/warehouse/custody` page + assign/return dialogs (shipped in 3 sub-commits, then twice revised — see chronology below)
- ⏭️ **Task 9** — `/consumption` page + New Consumption dialog with 3-sec cooldown ← **NEXT**
- ⏭️ **Task 10** — nav + routing polish
- ⏭️ **Task 11** — manual smoke on staging + security audit

## Task 8 chronology (8 commits worth reading)

| Commit | Scope |
|---|---|
| `1217a39d` | 8a — `responsible_person_profile_id` column on warehouse_sub_containers + master-list RPC extension + Teams/Places master-data pickers |
| `b3ec0c92` | Activate/Deactivate confirm dialog on Teams + Places pages (later moot after consolidation) |
| `c59f9c93` | 8b — `rpc_create_custody_assign` / `rpc_accept_custody_assign` / `rpc_create_custody_return` (initial 2-step model) |
| `8b23c7ae` | 8c — `/warehouse/custody` page, CustodyAssignDialog, CustodyReturnDialog, useCustodyMoves hook, nav wiring, admin bypass in RPCs, friendly error strings |
| `19423ce6` | **Reshape to 3-step flow** — `rpc_create_custody_assign` rewritten to be REQUEST-ONLY (no FIFO deduct); new `rpc_dispatch_custody_assign` for the middle step. Card banner now shows "Awaiting dispatch" (amber) vs "In transit" (blue) with correct action button gating |
| `63502422` | Fix cross-division item visibility on the standard Transfers page — `sub_container_scope_select_r` on `warehouse_transfer_items` widened to admit rows visible via either endpoint's sub, mirroring the parent transfer's policy |
| `fe21bb83` | WhMovementRefDialog shows sub-container names under warehouse names in From/To boxes |
| (latest) | **Consolidation refactor** — deleted `/master-data/teams`, `/master-data/places`, `/warehouse/repair-vendors` pages + their nav entries. Enhanced `SubContainerFormDialog` with responsible-person picker + `WarehouseSubContainersSection` with responsible-person display + reactivate flow. New `rpc_upsert_warehouse_sub_container` (generic upsert) + `get_warehouse_sub_containers_admin` (cross-division list). All sub-container management now happens on the Warehouses admin page. |

## Key state to know before touching anything

### Custody flow — final shape

1. **Request** — `rpc_create_custody_assign(source_wh, source_sub, dest_sub, items, ...)`. Called by destination custody sub's responsible person OR `_has_custody_admin_role`. Inserts `warehouse_transfers` header + line items only, `status='pending'`. **No FIFO movement.**
2. **Dispatch** — `rpc_dispatch_custody_assign(transfer_id, ...)`. Called by source WH field RP (`is_field_rp_of`) OR `_has_custody_admin_role`. Deducts source FIFO scoped to source sub, emits `transfer_out` movements, stamps weighted `unit_cost` on line items, flips to `in_transit`.
3. **Accept** — `rpc_accept_custody_assign(transfer_id, ...)`. Called by destination sub responsible person OR `_has_custody_admin_role`. Creates FIFO layers on destination sub + `transfer_in` movements, flips to `received`.

Return direction is a 2-step flow: `rpc_create_custody_return` (deducts custody FIFO + creates `in_transit` transfer) → standard `receive_transfer` on the destination real WH (the existing app rule "same person cannot dispatch and receive" applies — that's intentional).

`_has_custody_admin_role(profile_id)` returns true for `inventory_manager` role OR any `custom_roles.is_system_admin=true` (Owner, Admin).

### Sub-container admin

- **Read (admin)**: `useWarehouseSubContainersAdmin(warehouseId)` via `get_warehouse_sub_containers_admin` — bypasses RLS, joins responsible person, cross-division. Used only by `WarehouseSubContainersSection`.
- **Read (operator-facing)**: `useWarehouseSubContainers(warehouseId)` — direct-table, RLS-scoped. Used by transfer / delivery / custody pickers. Do NOT swap these to the admin variant; they need division scoping.
- **Write**: `useCreateWarehouseSubContainer` / `useUpdateWarehouseSubContainer` / `useReactivateWarehouseSubContainer` / `useDeactivateWarehouseSubContainer` all go through `rpc_upsert_warehouse_sub_container` (generic upsert). Deactivate/reactivate now take `{id, warehouse_id}` (changed from just `id`).
- Legacy `useTeams`, `usePlaces`, `useRepairVendors` still exist — Custody page + damaged-repair flow depend on them. Do NOT delete.

### Migrations landed

| Version | What |
|---|---|
| `20260815000100` | warehouse_kind enum (teams, places) + team_id column + seed rows |
| `20260815000200` | transfer_kind extension (custody_assign, custody_return) + stock_movement_type extension (consumption) |
| `20260815000300` | consumption_entries + consumption_lines tables + cogs_entries columns + RLS |
| `20260815000400` | rpc_post_consumption + rpc_cancel_consumption |
| `20260815000500` | get_teams_master_list + get_places_master_list |
| `20260815000600` | rpc_upsert_team_or_place |
| `20260815000700` | param reorder fix |
| `20260815000800` | responsible_person_profile_id column + extended upsert + extended master-list RPCs |
| `20260815000900` | rpc_create_custody_assign + rpc_accept_custody_assign + rpc_create_custody_return (initial 2-step; superseded by 001100) |
| `20260815001000` | `_has_custody_admin_role` helper + friendly error strings on all custody RPCs |
| `20260815001100` | 3-step flow: rewrote rpc_create_custody_assign to request-only + added rpc_dispatch_custody_assign |
| `20260815001200` | Widened `sub_container_scope_select_r` policy on warehouse_transfer_items so cross-division transfers show items to both sides |
| `20260815001300` | rpc_upsert_warehouse_sub_container + get_warehouse_sub_containers_admin — powers the consolidated Warehouses admin page |

## Sharp edges — must know before Task 9

- **`_has_custody_admin_role(profile_id)`** — reuse for any Task 9 permission gates.
- **`rpc_post_consumption`** has NO role gate — any signed-in user can post. That's per plan design; do NOT tighten without asking the operator.
- **`generate_consumption_number()`** returns `CE-#####`.
- **`cogs_entries`** columns `consumer_type` / `consumer_team_sub_id` / `consumer_place_sub_id` / `consumer_customer_id` / `consumption_id` are all in place. RPC stamps them per line.
- **Attachments storage bucket**: `consumption-attachments` — **NOT confirmed created**. Check on Supabase Storage before wiring the file upload UI; create with `public: false` + RLS policies restricting to authenticated users.

## Task 9 — what to build

Per the plan's UI section for `/consumption`:

- List page: table of consumption entries (CE-##### · date · source · consumer · total). Filters: status, date range, consumer_type.
- Top-right **New Consumption** → dialog:
  - **Source** — Warehouse dropdown (all kinds including teams / places — plan says "the Consumption dialog's source picker sees all four") + sub-container picker.
  - **Consumer** — segmented control: Team / Customer Site / Customer / Internal + matching picker.
  - **Lines** — cascade item picker + qty column. Weighted FIFO cost preview once source sub is set.
  - **Notes + attachments** — Supabase Storage upload.
  - **Amber warning** — "Posting a consumption immediately deducts stock and books COGS. Not reversible without manual cancellation."
  - **Confirm button** with a 3-second cooldown countdown chip. Disabled for the first 3s of dialog open OR after every edit.

Also wire the **Consume** button on the Custody card (currently a `handleConsumeStub` toast in `src/app/(dashboard)/warehouse/custody/page.tsx`) to open this dialog pre-filled with the sub as source.

## Files most likely to touch in Task 9

- `src/app/(dashboard)/consumption/page.tsx` (new)
- `src/components/consumption/NewConsumptionDialog.tsx` (new)
- `src/components/consumption/ConsumptionDetailDialog.tsx` (new — for row click)
- `src/hooks/useConsumption.ts` (new — wraps `rpc_post_consumption` + `rpc_cancel_consumption` + list query)
- `src/app/(dashboard)/warehouse/custody/page.tsx` — replace the `handleConsumeStub` toast with a real open handler
- `src/components/layout/nav-config.ts` — add Consumption entry (under Purchase & Sales, near Custody)
- `src/lib/queryKeys.ts` — `consumption` namespace already exists

## Testing status

- ✅ Task 8 fully verified by operator on staging: request → dispatch → accept round-trip, return round-trip (including the standard Transfers page receival), admin bypass works, non-admin can't act on someone else's card, cross-division transfer items visible on Transfers page, sub-container names appear in From/To boxes.
- ⏭️ Consolidated Warehouses admin page — pending operator verification. Test path: Master Data → Warehouses admin page → expand Teams virtual warehouse → click Add → new form has responsible-person picker → save → row appears with responsible person shown → activate/deactivate toggle with confirm dialog. Repeat for Places virtual + Repair virtual (Repair should hide the Division picker in the form).
- ⏭️ Task 9 UI — not started.

## Commit protocol reminders

- Every task = code commit + separate PROGRESS.md commit. Do not batch.
- Commit trailer must have both authors:
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```
- `npx supabase db push` for every migration. Never ask the user to run SQL.
- After every `supabase gen types` run, re-append the DBTable / DBInsert / DBUpdate / AllTables helper aliases at the bottom of `src/types/database.types.ts`.

## Environment gotchas

- Type gen: `npx supabase gen types typescript --linked --schema public` (use `--linked`, not `--project-id` — that path 500s intermittently and clobbers the file).
- Never use `Date.now()` / `Math.random()` in migrations; use `now()` inside SQL.
- Windows line endings — git will warn "LF will be replaced by CRLF" on every commit. Ignore.

## Open questions for the operator

- Consumption attachments bucket — does it exist? If not, create as `consumption-attachments` (public: false; RLS restricting to authenticated users).
- Nav placement for `/consumption` — under Purchase & Sales? Same group as Custody? Plan says "Purchase & Sales (or Operations)" — go with Purchase & Sales unless operator says otherwise.
