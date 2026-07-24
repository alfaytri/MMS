# Tool serial tracking — Option B primary, Option A fallback

**Status:** planning
**Date:** 2026-07-24
**Blocks:** clean audit trail per tool unit, return-to-supplier by serial, warranty history per unit

## Goal

Every physical tool that enters the warehouse gets exactly one row in `tool_asset_units`. No drift between `inventory_item_brand_variants.stock_level` and `COUNT(tool_asset_units WHERE item_id=X)`. The unit's origin (which receival brought it in) is recorded, so returns to supplier can identify specific units.

## Current gap (recap)

When a tool is received via PO:
- FIFO layer inserted ✅
- `stock_level += qty` ✅
- Movement row inserted ✅
- **`tool_asset_units` rows NOT created** ❌ — someone has to open the tool in master-data and click "Add Unit" N times

Result: `stock_level = 12` but `COUNT(tool_asset_units) = 8` is a common state. Serial history has silent gaps.

## Design decisions

Locked in before writing code:

| Decision | Choice | Reason |
|---|---|---|
| Placeholder marker | New `is_placeholder BOOLEAN` column on `tool_asset_units` | Cheap, queryable ("units pending serial entry"), explicit — beats overloading `condition` or `status` |
| Serial format for placeholders | `<item.sku>-<3-digit-ordinal>` (same as [20260723260000](../../supabase/migrations/20260723260000_renumber_tool_skus_and_serials.sql) real serials) | UI can render `<sku>-005 (placeholder)` — no ambiguity, upgrading to a real serial is a rename |
| Origin link | New `receival_item_id UUID NULL FK → receival_items(id)` on `tool_asset_units` | More precise than `receival_id` alone (a receival can have multiple lines) |
| Trigger surface | `AFTER INSERT ON fifo_cost_layers WHERE source_type='receival'` | Zero risk of missing a path — every receival approval writes exactly one layer per brand_variant |
| Return handling | On PO-return dispatch, `DELETE FROM tool_asset_units WHERE receival_item_id IN (…) AND status='available' LIMIT qty` | Symmetric to layer consumption; keeps unit count in sync with stock_level |
| Race handling | `pg_advisory_xact_lock(hashtext('tool_units_' \|\| item_id))` inside trigger | Two concurrent receivals for the same tool won't collide on serial ordinals |
| Existing manual units | Left alone — trigger only creates new placeholders going forward | No backfill migration; owners can rename placeholders anytime |
| API/legacy imports | Trigger runs regardless of who inserts the FIFO layer — placeholders always exist even if UI serial entry was skipped | Fallback A guaranteed |

## Phases

Each phase = one migration file so rollback stays scoped.

### Phase 1 — Schema + trigger (Option A fallback) — ~30 min

**Migration:** `20260724250000_tool_serial_tracking_schema_and_trigger.sql`

- Add `receival_item_id UUID NULL FK` on `tool_asset_units`
- Add `is_placeholder BOOLEAN NOT NULL DEFAULT false` on `tool_asset_units`
- Add unique partial index `(item_id, serial_number) WHERE serial_number IS NOT NULL` — prevents duplicates across manual+auto entries for the same item
- Create trigger fn `create_tool_units_on_receival_layer()` — reads variant→item→category, only fires for `category.type='tools'` items, generates N placeholder rows with next-ordinal serials, sets `receival_item_id`, `is_placeholder=true`
- Attach trigger: `AFTER INSERT ON fifo_cost_layers`

**Result after Phase 1:** buying 5 tools via a PO receival creates 5 placeholder `tool_asset_units` rows with serials like `VP-001-006 … VP-001-010` (assuming 5 units already existed). No UI change yet — someone can still enter real serials manually via master-data by editing each placeholder row and clearing `is_placeholder`.

**Smoke test:**
1. On staging: create a tool item (Master Data), create a PO for 3 units, approve receival
2. Verify: `SELECT * FROM tool_asset_units WHERE item_id=X` shows 3 new rows, `is_placeholder=true`, `receival_item_id` set
3. Verify: `stock_level = 3` matches count
4. Approve the same PO receival twice (shouldn't happen but test resilience) — verify no duplicate serials

**Rollback:** drop the trigger, drop the two columns, drop the unique index. Existing placeholder rows keep their serials as ordinary units.

### Phase 2 — `assign_tool_serials` RPC — ~20 min

**Migration:** `20260724250001_assign_tool_serials_rpc.sql`

RPC signature:
```sql
assign_tool_serials(
  p_receival_item_id uuid,
  p_serials jsonb    -- array of {serial: text, brand: text?, condition: text?, expiry: date?}
) RETURNS jsonb
```

Behavior:
- Fetch placeholder units for this receival_item_id where `is_placeholder=true` ORDER BY created_at
- Length of `p_serials` must be ≤ placeholder count (extras are still placeholders)
- For each provided serial:
  - `UPDATE tool_asset_units SET serial_number = <input>, is_placeholder=false, brand=COALESCE(<input.brand>, brand), condition=COALESCE(<input.condition>, condition), expiry=COALESCE(<input.expiry>, expiry) WHERE id = <nth placeholder>`
- If any provided serial collides with an existing non-placeholder serial for the same item: raise error (unique index catches it)
- Insert activity_log row per changed unit
- Return `{ updated_count: N, remaining_placeholders: M }`

**Rollback:** drop the function. Placeholders remain editable via existing master-data UI.

### Phase 3 — Receival approval UI (Option B primary) — ~2–3 hr

**Files touched:**
- `src/components/purchase/ReceivalFormDialog.tsx` (or wherever approval fires) — add a "Tool serials" expandable panel per tool-category line item
- New component `src/components/purchase/ToolSerialEntryPanel.tsx` — table of N rows (one per unit), each with fields for serial, brand, condition, expiry
- `src/hooks/useReceivals.ts` — after receival approval succeeds, if any tool lines are present, call `assign_tool_serials` for each

Flow:
1. User clicks "Approve receival" (existing button)
2. Modal appears asking to enter serials for each tool line (skip button available)
3. On submit: call existing `approve_receival_inventory` (creates placeholders via trigger), then loop through tool lines calling `assign_tool_serials`
4. Any un-entered rows stay as placeholders; badge in master-data shows "N placeholder(s) pending"

**Validation UX:**
- Serials must be unique per item (client-side check + server-side unique index catches races)
- Serial field placeholder shows the auto-generated one so user knows what it would be
- "Skip" button on modal — records nothing, all N rows remain placeholders

**Smoke test:** approve a receival with mixed lines (products + tools), enter serials for some tools, skip others. Verify DB state matches: entered serials have `is_placeholder=false`, skipped ones have `is_placeholder=true`.

### Phase 4 — Return-to-supplier symmetry — ~1 hr

**Migration:** `20260724250002_tool_units_return_symmetry.sql`

Modify `rpc_process_po_return_dispatch` — for each return line where the item's category is `tools`:
- Find `qty_returned` available units matching that brand_variant_id — prefer units from the same original receival if `return_lines.receival_item_id` is known, else oldest-first
- `UPDATE tool_asset_units SET status='returned_to_supplier' WHERE id IN (…) LIMIT qty_returned` — OR delete them; decide below

**Design question — keep or delete returned units?**
- **Keep with `status='returned_to_supplier'`:** preserves audit trail of every serial that ever existed. Count no longer matches `stock_level` — you'd query `WHERE status='available'` for the live count.
- **Delete:** count stays exactly aligned to `stock_level`, but the audit trail lives only in `activity_log`.

**Recommendation: keep with status change.** Serial audit is the whole point of this exercise — losing rows on return defeats it. Update any UI that shows "units count" to filter `status='available'` for the live number.

Similar symmetric handler on cancel-return-dispatch: revert the `qty_returned` units back to `status='available'`.

### Phase 5 — Sale/delivery symmetry (optional, later) — ~1 hr

When a tool is sold + delivered, mark `qty_delivered` units as `status='sold'`. Not urgent — most tools stay internal (assigned to teams, not sold to customers), but included here for completeness.

## Testing checklist (full flow)

Run on staging after Phase 1–3:

- [ ] Create new tool with SKU `TEST-01` via master-data → verify 0 units, stock_level=0
- [ ] Create PO for 3 units, approve receival with all 3 serials entered → verify 3 rows, no placeholders, correct serials, receival_item_id set
- [ ] Create PO for 5 more units, approve receival + click "Skip serials" → verify 5 placeholder rows (`TEST-01-004` … `TEST-01-008`)
- [ ] Rename one placeholder to a real serial via master-data → verify `is_placeholder=false`, unique constraint enforced
- [ ] Try to enter a duplicate serial → verify server rejects with unique-index error
- [ ] Return 2 units to supplier (Phase 4) → verify 2 units marked `status='returned_to_supplier'`, stock_level=6, available count=6
- [ ] Cancel the return dispatch → verify 2 units back to `status='available'`
- [ ] Add a spare-part receival (5 units) → verify 0 tool_asset_units rows created (trigger correctly filters)

## Risks

1. **Concurrent receivals for same tool → serial collision.** Mitigated by advisory lock inside trigger + unique index as backstop.
2. **Trigger fires on receival cancel + re-approve.** Cancel today deletes the FIFO layer — the trigger won't re-fire on cancel because it's INSERT-only, so cancel needs a matching AFTER DELETE trigger that removes placeholder units still linked to that receival_item_id. Add this to Phase 1 for safety.
3. **Existing tools with 0 units and stock_level > 0.** Not touched by this plan — count stays wrong. Optional Phase 6 backfill: for each tool, insert `(stock_level - existing_units_count)` placeholder rows.
4. **`assign_tool_serials` called twice with same payload** — idempotent by design: on the second call, no placeholders remain, no-op with `updated_count: 0`.

## Rollout

- Phase 1 + Phase 2 can be applied together (schema + RPC). Trigger safe to enable immediately.
- Phase 3 (UI) can ship a week later — placeholders will start accumulating from Phase 1 either way; owners rename via master-data until Phase 3 ships.
- Phase 4 (return symmetry) needs to ship before serials are trusted for audit; otherwise a returned tool's serial stays `available` forever.

## Success criteria

- `SELECT stock_level FROM inventory_item_brand_variants WHERE item_id IN (SELECT id FROM inventory_items WHERE category.type='tools')` equals `COUNT(*) FROM tool_asset_units WHERE item_id = same AND status='available'` for every tool item
- Every tool_asset_unit created after Phase 1 has a non-NULL `receival_item_id`
- No unique-serial-per-item violations across manual + auto entries
