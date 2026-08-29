# Session Handover — 2026-07-24 → next session

**Purpose:** Give the next session enough context to pick up 3 queued tasks without re-discovering everything. Use this as the primary resumption doc.

**Read these first (in order):**
1. This document
2. `PROGRESS.md` — see `## 🔄 In Progress` and the latest `## ✅ Completed` entries
3. `AGENTS.md` — project rules (co-authorship, PROGRESS.md ritual, commit policy)
4. `C:\Users\IT\.claude\projects\D--MMS\memory\MEMORY.md` — user preferences

---

## What was accomplished this session (2026-07-24)

Commits landed on `deploy/warehouse-shipping` and pushed to origin:

| SHA | Title |
|---|---|
| `f21023f9` | fix(db-security): enforce security_invoker on compat views |
| `14000259` | fix(purchase+sales): 3 straggler `.from('returns')` refs |
| `576fa116` | fix(audit): point entity-name lookup to user_data |
| `a986a592` | refactor(db+app): enum tightening + drop redundant columns |
| `1c416334` | feat(db): tool serial tracking phase 1 + inventory division_id + receival_id cast fixes |
| `96612689` | chore: payment confirm dialog spacing + queue 4 planning specs |
| `f8a5344b` | docs: update PROGRESS.md |
| `d1942e72` | fix(inventory): show direct items on non-leaf categories |
| `24082521` | docs: update PROGRESS.md — category rollup verify complete |

**Key deliverables:**
- `po_versions.stage` → enum
- `bills.doc_status` dropped entirely (unused approval workflow)
- `customers.entity_type` → enum
- `customers.is_blocked` dropped (derived from `block_reason IS NOT NULL`)
- Tool serial tracking phase 1 (DB triggers auto-create placeholder `tool_asset_units` on receival for `category.type='tools'` items; `serial_number = NULL`; new RPC `auto_generate_tool_serials(item_id)` fills NULL serials with `<sku>-<3-digit-ordinal>`)
- Inventory `division_id` phase 1 (added to `receivals`, `receival_items`, `fifo_cost_layers`, `inventory_stock_movements`, `cogs_entries`, `warehouse_transfers`; auto-populated via BEFORE INSERT triggers; backfilled)
- Root-cause fix for the "column receival_id is of type uuid but expression is of type text" bug that had been silently breaking every PO receival (stale `::TEXT` cast in `create_and_approve_receival` + `apply_receival_edit`)
- 3 credit-approval RPCs rewritten to remove writes to already-dropped `customer_type` and now-dropped `is_blocked`; also `profiles` → `user_data` refs
- Nested category level-2 totals bug fixed (tree row was hiding direct items on categories that also had sub-categories)
- Payment Confirm dialog spacing fix (Go Back / Confirm Payment no longer hip-to-hip)

**DB migrations applied on remote:** through `20260724280000_apply_receival_edit_uuid_cast_and_null_serial.sql`

**Types regenerated:** `src/types/database.types.ts` — includes `customer_entity_type`, `po_stage` enums, `is_placeholder`, `receival_item_id` on `tool_asset_units`, `division_id` columns

---

## Task 1 — Placeholder tool-serial UI (~2 hr, small)

**Spec:** [docs/specs/2026-07-24-tool-serial-tracking-plan.md](specs/2026-07-24-tool-serial-tracking-plan.md) — phases 2-4 described

**Current DB state after this session:**
- Trigger `trg_create_tool_units_on_receival` on `fifo_cost_layers` INSERT — creates N placeholder `tool_asset_units` rows for tool-category items, with `serial_number = NULL`, `is_placeholder = true`, `receival_item_id` FK set
- Trigger `trg_remove_tool_placeholders_on_layer_delete` on `fifo_cost_layers` DELETE — removes still-placeholder units when a receival is cancelled
- RPC `auto_generate_tool_serials(p_item_id uuid) RETURNS jsonb` — fills NULL serials with `<sku>-<3-digit-ordinal>`. Returns `{updated_count, sku_prefix}`.

**UX target (user confirmed):**
- When a tool receival lands, placeholder rows exist with empty serial cell
- Each row shows an inline `<Input>` for the serial + a "Confirm" button
- Unconfirmed rows (where `is_placeholder = true` OR `serial_number IS NULL`) render disabled/greyed with an amber "pending serial" pill
- Above the units table, a subtle text link (not a button, muted-foreground, underline on hover): `Auto-generate serials for N pending units` — calls `auto_generate_tool_serials(item_id)`
- Once a serial is entered + confirmed, flip `is_placeholder = false` via `useUpdateToolAssetUnit`

**Files to modify:**
- Find the tool-units section — likely inside `src/components/services/inventory/ToolCategoryRow.tsx` or a `ToolUnitsSection.tsx` component. Search: `grep -l 'tool_asset_units' src/components -r`. `useToolAssetUnits(itemId)` lives in `src/hooks/useInventory.ts:656`.
- Existing hooks in `src/hooks/useInventory.ts`:
  - `useToolAssetUnits(itemId)` — reads all units for an item (line ~656)
  - `useCreateToolAssetUnit()` — manual add (line ~675)
  - `useUpdateToolAssetUnit()` — edit (line ~701)
- Add new hook `useAutoGenerateToolSerials()` in `src/hooks/useInventory.ts` — mutation calling `supabase.rpc('auto_generate_tool_serials', { p_item_id })`
- Add new component / inline block for the "confirm serial" input if not already present

**Implementation order:**
1. Add `useAutoGenerateToolSerials` hook
2. In the tool units section: filter placeholder units, show them with disabled input + amber pill
3. Add the subtle "Auto-generate" text link (only visible if any placeholders exist)
4. On save serial: call `useUpdateToolAssetUnit` with `{ serial_number: value, is_placeholder: false }`
5. Add uniqueness client-side check (`(item_id, serial_number)` is DB-uniqued via partial index)
6. Test: fresh PO receival → 5 placeholder rows appear → enter 2 serials manually → click auto-generate for the other 3 → all 5 unlocked

**Data cleanup opt-in for existing units:** the 5 `TOOL-e39d02b7-001…005` placeholders on `Test Tool 1` are still marked `is_placeholder=true`. If the user wants them shown as pending in the new UI, run:

```sql
UPDATE tool_asset_units
SET serial_number = NULL
WHERE is_placeholder = true AND serial_number LIKE 'TOOL-%';
```

Otherwise leave — the user can rename each via master-data if they care about the format.

---

## Task 2 — Credit-group approval dialog (~1 day, medium)

**Spec:** [docs/specs/2026-07-24-credit-group-request-dialog-plan.md](specs/2026-07-24-credit-group-request-dialog-plan.md) — full plan

**Correction to the spec (found while gathering context):** the current dropdown **DOES** already trigger the approval workflow via `submit_credit_group_change` — see [customers/page.tsx:70-86](../src/app/(dashboard)/master-data/customers/page.tsx#L70). Line 70: `const needsApproval = (group?.credit_limit ?? 0) > 0`. So credit-limit-bearing groups go through PM → AM → Owner. Zero-limit ("cash") groups are still direct-assigned via `assignGroup.mutate(...)`.

**What's actually missing:**
1. **Doc-upload UI before submission.** The RPC `submit_credit_group_change` requires CR + Establishment ID + Signed Credit Form (business) or just Signed Credit Form (individual) URLs on the customer row, BUT the current UI doesn't provide an upload dropzone as part of the assign flow. Users have to upload docs separately in `CustomerDialog.tsx` before assigning, then hit assign. Broken UX — RPC errors with "Upload all 3 required docs…" and the user has to backtrack.
2. **Pending state pill on customer row.** Once a request is submitted, the row should show `<Group Name> ⚠ Pending` instead of continuing to render the dropdown as "Assign group…".
3. **Cancel request affordance.** If the requester wants to withdraw, there's no UI path today. New RPC `cancel_credit_group_change(p_request_id uuid, p_reason text)` needed — spec has the skeleton.
4. **Owner force-assign menu.** Direct force-approve via `force_approve_credit_group_change(request_id, comment)` exists as an RPC but no UI trigger except through the approvals page.

**Files to touch (per spec):**
- New: `src/components/master-data/CreditGroupRequestDialog.tsx` — combines doc upload + submit
- New: `src/components/master-data/CreditGroupPendingDialog.tsx` — read-only pending status view
- New: `src/hooks/useCreditGroupRequest.ts` — combined docs-upload + submit mutation
- New: `src/lib/customer-docs.ts` — Supabase Storage upload helper
- Modify: `src/hooks/useCreditGroups.ts` — remove the direct-write `useAssignCustomerToCreditGroup` mutation (used for zero-limit groups today); keep only the API for calling the request flow
- Modify: [customers/page.tsx](../src/app/(dashboard)/master-data/customers/page.tsx) — swap the dropdown for a 3-state widget (cash / pending / assigned) that opens the new dialog
- New RPC: `cancel_credit_group_change` — see spec section "Server changes needed"
- Storage bucket check: `customer-docs` bucket may or may not exist; migration for policies if missing

**Server RPC signatures (already deployed today):**
- `submit_credit_group_change(p_customer_id uuid, p_requested_group_id uuid) RETURNS jsonb` — creates the request, validates docs by entity_type, blocks new customers, starts chain
- `approve_credit_group_change(p_approval_id uuid, p_comment text DEFAULT NULL) RETURNS void` — approver clicks approve
- `reject_credit_group_change(p_approval_id uuid, p_reason text) RETURNS void` — approver rejects
- `force_approve_credit_group_change(p_request_id uuid, p_comment text) RETURNS integer` — Owner bypass

**Existing consumers:**
- `src/hooks/useCreditGroupApprovals.ts` — approvals page consumer
- `src/components/master-data/CreditGroupApprovalsContent.tsx` — approvals page UI (no change needed; already receives more requests)
- `src/components/master-data/CustomerDialog.tsx` — has doc upload today (per feedback memory `feedback_dialog_ui_standards`, use existing PhoneInputWithCode etc.)

**Feature flag strategy (recommended per spec):** `NEXT_PUBLIC_CREDIT_APPROVAL_FLOW=v2` env var. Fall back to old dropdown if unset, so rollback is one env change.

---

## Task 3 — Drop the 3 compat views (medium, ~3–5 hr)

**Spec:** [docs/specs/2026-07-24-drop-compat-views-plan.md](specs/2026-07-24-drop-compat-views-plan.md) — 6 phases, one migration each

**Context:** The 2026-07-24 rename batch (batches A/B/C, commits pre-session) introduced three backward-compat views so old stored functions kept working:

| View | Underlying table |
|---|---|
| `public.profiles` | `user_data` |
| `public.returns` | `so_po_returns` |
| `public.inventory_brand_variants` | `inventory_item_brand_variants` |

**Session updates to note:**
- All 6 credit-approval RPCs (`submit_credit_group_change`, `approve_credit_group_change`, `reject_credit_group_change`, force-approve, `apply_receival_edit`, `create_and_approve_receival`) NOW reference `user_data` and `inventory_item_brand_variants` directly — no view. Cross out these from the plan's "Functions to rewrite" list.

**Remaining functions still referencing view names (per the plan):**

`profiles` (12 → currently ~8 after this session's rewrites):
- Services module functions (`approve_service_change`, `reject_service_change`, `submit_service_change`, `update_pending_service_change`, `withdraw_service_change`) — safe to DROP (module deprecated)
- `is_contract_visible` (Contracts) — safe to DROP
- `check_is_division_manager` — rewrite
- `has_admin_permission` — **delicate, RLS policies reference it** — snapshot pg_proc before + after
- `bootstrap_first_user` — trigger on auth.users; ensure signature/return unchanged

`returns` (7 functions):
- `dispatch_return`, `undispatch_return`, `restock_return`, `create_return_lines`, `rpc_cancel_po_return_dispatch`, `rpc_process_po_return_dispatch`, `rpc_process_return_restock`

`inventory_brand_variants` (8 functions):
- `batch_update_reserved_qty`, `batch_update_variant_prices`, `fn_refresh_incoming_qty`, `fn_refresh_reserved_qty`, `fn_update_linked_services_count`, `recalc_average_cost`, `update_reserved_qty`, `create_tool_item_with_default_variant`

**Phases (per plan):**
1. Drop excluded-module functions (~15 min)
2. Rewrite sale-order functions — `create_sale_order` overloads already rewritten in `20260724170001`. Verify.
3. Rewrite inventory triggers + utilities (~45 min)
4. Rewrite return-workflow RPCs (~45 min)
5. Rewrite RLS/auth functions (~1 hr) — delicate, snapshot pg_proc
6. Drop the 3 compat views + `NOTIFY pgrst` (~15 min)

**Migration file locations (do NOT bundle phases into one file):**
- `supabase/migrations/20260725100000_drop_services_contracts_profile_functions.sql`
- `supabase/migrations/20260725100001_rewrite_sale_order_functions_use_user_data.sql`
- `supabase/migrations/20260725100002_rewrite_inventory_brand_variant_functions.sql`
- `supabase/migrations/20260725100003_rewrite_return_functions_use_so_po_returns.sql`
- `supabase/migrations/20260725100004_rewrite_admin_and_bootstrap_functions.sql`
- `supabase/migrations/20260725100005_drop_compat_views.sql`

**Smoke tests between phases:** the plan lists specific scenarios per phase; run them on the app before proceeding to the next migration.

---

## Environment + workflow rules (for the next session)

**DB migration workflow:** always via CLI. Do NOT ask user to run SQL manually.
```bash
npx supabase db push
# or if a file is out of order:
npx supabase db push --include-all
```
Project ref: `wkmvjxxmzstsvahuiwsz` — config in `supabase/config.toml`.

**After each DB schema change:** regenerate types with helper aliases re-appended (CLI wipes them):
```bash
npx supabase gen types typescript --linked > /tmp/types.new.ts
# Manually re-append AllTables / DBTable / DBInsert / DBUpdate — see feedback_supabase_gen_types.md
```

**Commit trailers:** every commit MUST have both authors:
```
Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

**PROGRESS.md ritual (Hard Constraint per `AGENTS.md`):**
- ON START of a task: update `## 🔄 In Progress` with `🚀 Starting: [Task Name]`, then commit **only** PROGRESS.md with `docs: update PROGRESS.md — starting [Task Name]`
- ON COMPLETION: commit code first, then update `## ✅ Completed` with a dated entry, then commit **only** PROGRESS.md with `docs: update PROGRESS.md — [Task Name] complete`

**Commit policy:** never commit until user confirms the change works. Applies to git commits only, not `supabase db push`.

**No visual companion** — this project uses text-only brainstorming.

**No `npm run build`** unless the user explicitly asks. No `git clean -fd`. No browser eval tools.

**Dropdown UUID Guard:** every `<Select>` renders `name`/`label` not `id`. Pre-check when touching customer/credit-group dropdowns in Task 2.

**Phone inputs:** use `PhoneInputWithCode` component + `useCountryCodes` hook. Save as `${countryCode}${digits}` concatenated.

**Responsive:** every UI change must work at mobile / tablet / laptop / TV breakpoints (see AGENTS.md rules).

**Security checklist:** after finishing each module, run the 5-point check documented in AGENTS.md and record in `## 🔒 Security Audit Log`.

---

## Quick reference — session-relevant DB objects

**New enums:**
- `po_stage` — `'rfq' | 'draft' | 'po'`
- `customer_entity_type` — `'individual' | 'business'`

**New/modified columns:**
- `tool_asset_units.receival_item_id UUID FK → receival_items(id)` (nullable)
- `tool_asset_units.is_placeholder BOOLEAN NOT NULL DEFAULT false`
- `receivals.division_id UUID FK` (nullable, auto-populated via BEFORE INSERT trigger)
- Same for `receival_items`, `fifo_cost_layers`, `inventory_stock_movements`, `cogs_entries`, `warehouse_transfers`

**New RPCs:**
- `auto_generate_tool_serials(p_item_id uuid) RETURNS jsonb`
- `diag_list_receival_triggers() RETURNS jsonb` — diagnostic, can be deleted later

**Dropped columns:**
- `bills.doc_status`
- `customers.is_blocked`
- `customers.customer_type` (dropped earlier by 20260724170001; consumer refs cleaned in this session)

**Views that still exist (to be dropped in Task 3):**
- `public.profiles` (over `user_data`)
- `public.returns` (over `so_po_returns`)
- `public.inventory_brand_variants` (over `inventory_item_brand_variants`)

**Key file paths:**
- Customers list: `src/app/(dashboard)/master-data/customers/page.tsx`
- Customer dialog: `src/components/master-data/CustomerDialog.tsx`
- Credit approvals list page consumer: `src/hooks/useCreditGroupApprovals.ts`
- Credit approvals UI: `src/components/master-data/CreditGroupApprovalsContent.tsx`
- Credit group assign (current, direct-write): `src/hooks/useCreditGroups.ts`
- Tools tab renderer: `src/components/services/inventory/ToolCategoryRow.tsx`
- Tool units section: search for `useToolAssetUnits` in `src/components/services/inventory/**`
- Master data tools view: `src/components/services/inventory/ToolsAssetsView.tsx`
- Payment confirm dialog (just polished): `src/components/shared/PaymentConfirmationDialog.tsx`
- Inventory items by category hook: `src/hooks/useInventory.ts:424` (`useInventoryItemsByCategory`)
- Category rollup RPC consumer: `src/hooks/useInventory.ts:635` (`useCategoryStockAggregates`)

**Documented specs (repo):**
- `docs/specs/2026-07-24-tool-serial-tracking-plan.md`
- `docs/specs/2026-07-24-inventory-division-denormalization-plan.md`
- `docs/specs/2026-07-24-credit-group-request-dialog-plan.md`
- `docs/specs/2026-07-24-drop-compat-views-plan.md`

---

## Suggested order for the next session

1. **Task 1 first** (2 hr, self-contained UI polish). Deliverable: user can enter or auto-generate serials from Master Data → Tools. Confirms the whole tool-serial phase-1 chain is production-ready.
2. **Task 3 next** (medium, mostly SQL). Landing this unblocks any future contributor from having to remember the compat views exist. Do it while the mental model is still fresh.
3. **Task 2 last** (~1 day, most UI-heavy + compliance-facing). Bigger review surface; do when you have contiguous time.

If the next session is short (<2 hr): start Task 1 only.
If the next session has 3–5 hr: Task 1 + start Task 3.
If a full day: all three, in the order above.
