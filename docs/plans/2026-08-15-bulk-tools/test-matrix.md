# Bulk Tools (Phase 2) — Smoke Verification Matrix

**Date:** 2026-08-15
**Branch:** `feature/bulk-tools` (staging only — NOT merged, NOT on prod)
**Result:** ✅ **ALL PASS** (22 rows)

**How each row was verified**
- **Operator** — hands-on browser walkthrough by the operator, 2026-08-15 ("all clean").
- **DB** — live staging query this session via `supabase db query --linked` (`mwvblpgbgxipvrevkeff`).
- **Code** — `tsc --noEmit` / eslint + direct code read.
- **Probe** — rolled-back `DO`-block permission probe (no data change).

---

## Phase 2a — Bulk (qty-tracked) tools

| # | Check | Evidence | Verified by | Result |
|---|---|---|---|---|
| P2a-1 | Per-category tracking mode exists | enum `tool_tracking_mode = {serialized,bulk}`; `inventory_categories.tool_tracking_mode` NOT NULL default `'serialized'` | DB | ✅ Pass |
| P2a-2 | Bulk receival lands qty/FIFO stock, spawns **NO** `tool_asset_units` | receival trigger `create_tool_units_on_receival_layer` gates on `tool_tracking_mode='serialized'` (body confirmed); operator received a bulk PO → qty landed, no units | DB + Operator | ✅ Pass |
| P2a-3 | Mode switch blocked **server-side** while category populated | `guard_tool_tracking_mode_switch` counts `tool_asset_units` + FIFO remaining qty and raises | DB | ✅ Pass |
| P2a-4 | Bulk tool item variant management (add brand/origin → receivable) | expand row → **Add brand** → `BrandVariantEditDialog`; operator added a variant then received it | Operator (P2a smoke-fix) | ✅ Pass |
| P2a-5 | Tracking-mode box wraps / no truncation | trigger label shortened to `Bulk`/`Serialized` + `break-words` help copy; operator confirmed | Operator | ✅ Pass |
| P2a-6 | Buy-side picker: bulk tools **included**, serialized **excluded** | `useCascadeAccessibleItems` mode-aware (`.eq('…tool_tracking_mode','bulk')` for tools); operator saw the bulk tool pickable in a PO | Code + Operator | ✅ Pass |

## Phase 2b — Serialized-unit division ownership + transfer

| # | Check | Evidence | Verified by | Result |
|---|---|---|---|---|
| P2b-1 | `tool_asset_units.division_id` column (nullable, no backfill) | column present: `type=uuid notnull=f` | DB | ✅ Pass |
| P2b-2 | Set a unit's owning division via Edit dialog | Division select; operator set it — no Base UI console warning | Operator | ✅ Pass |
| P2b-3 | Transfer a unit to another division (person preserved) | `rpc_transfer_tool_unit` updates `division_id` only — `assigned_to` untouched; operator transferred a unit | DB + Operator | ✅ Pass |
| P2b-4 | Transfer dialog: controlled Select, no controlled/uncontrolled warning, not dirty-on-open | `value={toDivisionId}` (always a defined string); `isDirty` compares against the seeded value; operator confirmed no warning | Code + Operator | ✅ Pass |
| P2b-5 | `division_id` write gated by permission on **all** paths (Edit + RPC) | BEFORE UPDATE trigger `trg_guard_tool_unit_division_write` enabled, re-checks `inventory.catalog.manage`; probe: manager **allowed** / non-manager **blocked** / non-division edit **allowed** | DB + Probe | ✅ Pass |
| P2b-6 | Transfer RPC hardened | `rpc_transfer_tool_unit` is SECURITY DEFINER, `public_execute=false` (revoked from public) | DB | ✅ Pass |
| P2b-7 | Inactive owning division shows "Inactive division" (not "Unassigned") | all-divisions lookup fallback in unit row / edit dialog / transfer dialog; edit save never nulls a stale id | Code | ✅ Pass |

## Cross-cutting

| # | Check | Evidence | Verified by | Result |
|---|---|---|---|---|
| X-1 | Whole branch type-checks | `tsc --noEmit` exit **0** | Code | ✅ Pass |
| X-2 | Branch state clean | **22** commits since base `2338b6fb`; working tree clean (only 2 unrelated untracked files) | git | ✅ Pass |

## Phase 1 (already on prod) — regression confirmation

| # | Check | Evidence | Verified by | Result |
|---|---|---|---|---|
| P1-1 | `inventory_item_divisions` table + RLS | exists, `rls=true`, 4 policies (`iid_select`/`iid_ins`/`iid_upd`/`iid_del`) | DB | ✅ Pass |
| P1-2 | Assignment RPCs hardened | `rpc_set_item_divisions` + `rpc_item_divisions_by_stock` DEFINER, `public_execute=false` | DB | ✅ Pass |
| P1-3 | Old sharing column dropped (staging) | `inventory_items.shared_with_division_ids` → dropped | DB | ✅ Pass |
| P1-4 | Flow registered in `flows-registry.md` | "Assign Item to Divisions" present on `feature/item-division-assignment`, `deploy/warehouse-shipping`, `feature/bulk-tools` | git grep | ✅ Pass |

---

## Known / tracked (not failures)

- **`tool_asset_units` base RLS is `USING(true)`** for its non-division columns (condition/status/assigned_to) — a **pre-existing** posture, out of scope for this feature. The access-relevant column (`division_id`, division ownership) is now gated by `trg_guard_tool_unit_division_write`. The broad-RLS tightening is tracked as a separate spawned follow-up task.
- **Guard trigger functions show `public_execute=true`** — expected and harmless: trigger functions are invoked by the trigger machinery (not called directly by clients) and run as DEFINER; the permission gate lives inside the function body.

## Open items (not part of pass/fail)

- Bulk Tools is **staging-only**. Merge `feature/bulk-tools` → `deploy/warehouse-shipping` and apply migrations `20260826000000`–`000200` / `20260827000000`–`000100` / `20260827000200` to new-prod — **pending operator go-ahead**.
- Phase-1 new-prod **column drop** (`20260825000300`, `shared_with_division_ids`) deferred until the operator confirms the new prod frontend is live (staging already dropped it).
