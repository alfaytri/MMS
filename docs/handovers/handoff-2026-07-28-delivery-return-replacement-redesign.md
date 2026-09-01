# Handoff — Delivery / Return / Replacement redesign

**Date written:** 2026-07-28
**Branch:** `deploy/warehouse-shipping`
**Context:** After the Section 2B two-flow returns dialog + hotfixes shipped today, testing on SO-00014 surfaced structural gaps in how deliveries, returns, and replacements link. This doc captures the research and a proposed 5-phase redesign so we can pick it up cleanly next session.

---

## Where we are

- **Section 2B** — DONE. Sale-return restock reverses exact FIFO/COGS + damaged units tracked. Verified end-to-end on SR-00003.
- **Two-flow return dialog** — DONE. Direct + Inspection modes. Verified with SR-00004 pending_inspection + Complete Inspection flow.
- **create_inventory_receival** — 3 hotfixes shipped (uuid cast, movement_type enum cast, carve semantics).
- **Edit Delivery dialog** — now shows per-warehouse stock chips.
- **Replacement dialog** — now aggregates return lines by variant + surfaces stock shortfalls (blocks Send when short).

**Left open — the topic of this doc.**

---

## What broke on SO-00014 (with screenshots the user showed)

| # | Symptom | Root cause |
|---|---|---|
| 1 | Delivery bar showed `17/10` (100%) | `complete_delivery_inventory` **unconditionally** adds to `sale_order_lines.delivered_qty` for every delivery incl. `type='replacement'`. Returns never decrement it. `delivered_qty` is a shipment counter, not a fulfillment number. |
| 2 | "Return SR-00004 needs resolution" banner stayed lit even after inspection complete + replacement sent | Banner reads `credit_notes.resolution_type IS NULL`. Only `useCreateReplacementDelivery` writes `resolution_type='replacement'`. If credit note doesn't yet exist, OR replacement was created any other way, banner never clears. |
| 3 | Returns tab doesn't show its linked replacement; Delivery detail doesn't show its source return | `sale_deliveries.return_id` and `source_credit_note_id` FKs exist since June (`20260628200000_credit_note_resolution.sql`, `20260703140000_sale_delivery_credit_note_fk.sql`) but nothing reads them. The chain `DEL-00012 → SR-00004 → DEL-00002` isn't rendered from either end. |
| 4 | No way to tell which of two shipments a return came from | `so_po_returns` has **no `source_delivery_id`**. Returns bind to the SO only. Multi-shipment SOs can't attribute returns to specific deliveries. |
| 5 | `return_status` has a `closed` value but nothing ever writes it | No canonical "return done" state. Banner uses credit-note resolution as a de-facto signal — fragile. |
| 6 | (Already fixed) Duplicate delivery lines per variant on replacement | Was symptom of two-flow model producing multiple `return_lines` per variant. Fixed via aggregation in `useCreateReplacementDelivery`. |
| 7 | Damaged-return + replacement combos silently pull fresh stock | `rpc_process_return_restock` treats damaged as movement-only (no stock_level change). Replacement then pulls fresh from FIFO with no distinction — replacements for damaged goods look like new sales in the ledger. |

---

## The underlying pattern

Each lifecycle event (**deliver → return → restock → resolve → replace**) writes its own state without a counter that reconciles them:

- `delivered_qty` is raw shipments-out-the-door
- Nothing computes "net delivered to customer" (`10 − 9 + 7 = 8` for SO-00014)
- Relationships that would let the UI render the chain (`sale_deliveries.return_id`, `so_po_returns.source_delivery_id`) either exist and are unread, or don't exist at all

---

## Schema state (as of today)

### `sale_deliveries`
- `type text NOT NULL DEFAULT 'standard'` CHECK IN (`'standard','replacement'`)
- `return_id uuid REFERENCES returns(id) ON DELETE SET NULL` ← unused by UI
- `source_credit_note_id uuid REFERENCES credit_notes(id)` ← redundant with `return_id`, unused
- `sale_delivery_lines` (variant, qty_delivered) — normalized from JSONB in `20260715160000`

### `so_po_returns` (renamed from `returns` on 2026-07-24)
- Source: `source_type` + `source_id` only (points at SO, not delivery)
- **NO `source_delivery_id`** — grepped whole repo, zero matches
- `credit_note_id`, `restock_warehouse_id` (set at inspection time), `status`, `restocked_at`
- `return_status` enum: `pending, pending_inspection, received, restocked, closed, dispatched, supplier_confirmed, cancelled`
- `return_lines` (variant, qty, `condition text` = `good|damaged|inspection`, `condition_notes`)

### `credit_notes`
- Links: `source_return_id`, `invoice_id`, `customer_id`, `reason_id`, `refund_method_id`
- `resolution_type text` CHECK IN (`'refund','replacement','store_credit'`) — nullable; NULL = unresolved
- `status credit_note_status` (draft/issued/…)

### `sale_order_lines.delivered_qty`
- Written by `complete_delivery_inventory` — unconditional `+=` at `20260727070000:210-213`
- **Does not branch on `sale_deliveries.type`** → replacements inflate it
- Decremented only by `cancel_delivery_inventory`. **Not** decremented by `rpc_process_return_restock` — a customer return leaves `delivered_qty` untouched

### Triggers
- **None** maintain `delivered_qty` or return/credit-note state (no `bill_recompute_paid_fn`-style automation). All done imperatively by RPCs or app-side mutations.

---

## Where the bugs manifest (file refs)

- **Unresolved banner:** `src/hooks/useSaleReturns.ts:541-565` (`useUnresolvedReturns`). Rendered in `src/components/sales/SoDetailDialog.tsx:97, :276-292`.
- **Delivery progress badge:** `src/app/(dashboard)/sales/orders/page.tsx:49-72`. `getDeliveryPct` clamps to 100% via `Math.min`; `getDeliveryText` has NO clamp → renders raw `17/10`. All three helpers sum `sale_order_lines.delivered_qty` verbatim.
- **Returns tab shows no linked replacement:** `src/components/sales/SoReturnsTab.tsx` — never queries `sale_deliveries WHERE return_id = ret.id`.
- **Delivery detail shows no source return:** `src/components/sales/DeliveryDetailDialog.tsx` — grep `return_id|source_credit_note_id|return_number` returns zero matches.
- **Deliveries list distinguishes replacement only by amber tint:** `src/app/(dashboard)/sales/deliveries/page.tsx:59, :193`.
- **Replacement delivery aggregator + hook:** `src/hooks/useSaleDeliveries.ts:203-306` (`useCreateReplacementDelivery`). Aggregation of return_lines by variant added today.

---

## Business-logic gaps (from the survey report)

1. **No "net delivered" is computed anywhere.** For SO-00014 (order=10, returned=9 good, replaced=7), the net delivered to the customer is 8. Nothing in the schema/RPCs/hooks expresses that number.

2. **Damaged / partial-restock ↔ replacement qty is not enforced.** `useCreateReplacementDelivery` aggregates all `return_lines` regardless of condition. There's no rule saying "you can only replace what was returned good" or "damaged replacement is a special case." Downstream, replacement dispatch pulls fresh from FIFO with no marker distinguishing it from a new sale.

3. **No canonical "return closed" status.** The enum has `closed` but nothing writes it. Termination is inferred from `credit_notes.resolution_type`. A restocked return with no credit note yet is INVISIBLE to the banner (unresolved query returns only rows with a credit note).

4. **Return ↔ specific delivery link missing.** No `source_delivery_id` on returns. Consequences: restock-warehouse choice is manual at inspection time even though it could be inferred; UI can't render the chain from either end; multi-shipment SOs can't attribute returns to specific deliveries.

5. **Redundant back-links on `sale_deliveries`.** Both `return_id` and `source_credit_note_id` exist. Migration `20260703140000` comment acknowledges the redundancy ("for faster queries"). Neither is used by UI.

---

## Proposed redesign — 5 focused phases

Each phase is independently shippable. Order matters: 1 → 2 → 3 → 4 → 5.

### Phase 1 — Add `so_po_returns.source_delivery_id` FK + backfill
Every return should know which specific shipment it came from. Backfill existing rows by matching return items to the SO's deliveries in date order. Once populated:
- Restock warehouse defaults from `source_delivery.warehouse_id`
- Returns/Deliveries tabs can render the chain from either end
- Multi-shipment SOs can attribute returns correctly

**Deliverables:** 1 migration (column + FK + backfill), 0 UI changes (used in Phase 4).

### Phase 2 — Track net-delivered separately from shipped-out
**Two options, need user's call:**

- **A. Compute view.** Add `sale_order_lines_summary` view:
  - `qty`
  - `shipped_qty` (sum of standard deliveries)
  - `returned_good_qty` (sum of good return_lines through restocked returns)
  - `replacement_qty` (sum of type=replacement deliveries)
  - `net_delivered_qty = shipped − returned_good + replacement`
  - Progress bar reads `net_delivered / qty`. Zero migration cost, zero risk to existing counters, backwards-compatible.

- **B. Real columns + triggers.** Add columns to `sale_order_lines`, maintain via triggers on `sale_deliveries` and `so_po_returns`. Denormalized, faster reads, but three new triggers to keep in sync.

**Recommend A** — cheaper, safer, backwards-compatible. Progress-bar hooks read from the new view; existing consumers of raw `delivered_qty` keep working during transition.

**Deliverables:** 1 migration (view), update `getDeliveryPct` / `getDeliveryText` / `getDeliveryStatus` in the orders page + wherever else `delivered_qty` is displayed.

### Phase 3 — Formalize return resolution status
Add explicit "resolution" to returns instead of inferring from credit notes:

- New `return_status` enum values: `resolved_credit`, `resolved_replacement`, `resolved_partial` (partial = some replaced, some credited)
- New RPC `rpc_close_return(return_id, resolution_type)` — atomically sets status AND writes `credit_notes.resolution_type`. Only path that closes a return.
- Banner `useUnresolvedReturns` filters on `status = 'restocked'` (not resolved). Clear semantics.
- `useCreateReplacementDelivery` calls `rpc_close_return('resolved_replacement')` at the end.
- Credit-note issuance for refund/store_credit calls `rpc_close_return('resolved_credit')`.

**Deliverables:** 1 migration (enum values + new RPC), update `useUnresolvedReturns`, `useCreateReplacementDelivery`, credit-note dialogs.

### Phase 4 — Wire the chain in the UI
- **Returns tab card:** if a linked replacement delivery exists (query `sale_deliveries WHERE return_id = ret.id`), show a "Replacement: DEL-XXXXX" chip with click-through to the delivery detail.
- **Delivery detail:** if `type='replacement'`, show a "Fulfills return SR-XXXXX (was DEL-YYYYY via source_delivery_id)" banner at the top with click-throughs to both.
- **SO delivery-progress badge:** switch numerator to `net_delivered_qty` (from Phase 2 view). Also show raw sub-labels: `8/10 delivered · 10 shipped · 9 returned · 7 replaced`.

**Deliverables:** UI-only in `SoReturnsTab.tsx`, `DeliveryDetailDialog.tsx`, `sales/orders/page.tsx`, `SoDetailDialog.tsx`. No DB changes.

### Phase 5 — Damaged-replacement policy (needs user's call)
The damaged-return + replacement case is a business question:

- **Option X (current):** replacement always = full return qty regardless of good/damaged. Damaged units silently disappear from the ledger, replacement pulls fresh from FIFO with no marker. Simple; opaque.
- **Option Y:** replacement defaults to *only the good qty*. Damaged qty gets its own written-off record on the return itself (a `write_off_movement` or a debit note against the vendor/loss account). Operator can override to include damaged if wanted.
- **Option Z:** editable qtys in the replacement dialog + a separate "write off damaged" checkbox. Most flexible, most UI work.

**Recommend Y** — reflects real business intent (damaged goods aren't a customer's problem, but they ARE a P&L event that should be booked).

**Deliverables:** varies with option chosen. Y is ~1 migration (write-off entry table or extend inventory_stock_movements enum) + `ReplacementDeliveryDialog` update + `useCreateReplacementDelivery` update.

---

## What we need from the user before building

Three answers:

1. **Delivery-progress semantics** — Option A (view) or B (real columns)?
2. **Damaged-replacement policy** — Option X (current), Y (default good-only + write-off), or Z (editable)?
3. **Existing SO-00014 mess** — leave as-is (existing docs stay wrong under old model), or run a one-off cleanup after Phase 2 lands?

Once those are answered, next session should write a proper implementation plan with migration IDs, file lists, and phase-by-phase acceptance criteria before touching code.

---

## Where the collected data lives

- **This handoff doc:** `docs/handoff-2026-07-28-delivery-return-replacement-redesign.md` (you're reading it)
- **Section 2B migration:** `supabase/migrations/20260728000000_section_2b_return_restock_reverse_fifo.sql`
- **Two-flow returns migration:** `supabase/migrations/20260728040000_two_flow_returns_pending_inspection.sql`
- **Receival hotfix migrations:** `supabase/migrations/20260728010000` / `20260728020000` / `20260728030000`
- **PROGRESS.md:** all today's entries are in the top of `## ✅ Completed`
- **EOD:** `EOD/EOD-2026-07-27.md` (16 tasks)
- **Related components/hooks:** see the "Where the bugs manifest" section above for file paths

---

## Sanity checks to run first thing next session

```bash
# 1. Branch + recent commits
git status
git log --oneline -15

# 2. Confirm the 5 today's migrations applied
npx supabase migration list --linked | head -30

# 3. Confirm the new pending_inspection status is live
npx supabase db query --linked "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.return_status'::regtype ORDER BY enumsortorder;"

# 4. Confirm rpc_complete_return_inspection exists
npx supabase db query --linked "SELECT proname FROM pg_proc WHERE proname = 'rpc_complete_return_inspection';"

# 5. Confirm no functions still reference the old table name
npx supabase db query --linked "SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosrc ~ '\\minventory_brand_variants\\M';"
# Expect: 0
```
