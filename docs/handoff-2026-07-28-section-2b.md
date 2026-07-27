# Handoff — Section 2B (next session)

**Date written:** 2026-07-27 end of day
**Branch:** `deploy/warehouse-shipping`
**Last commit before handoff:** `ffaa2b28` (docs: PROGRESS.md Section 10 hotfixes + 2A verified)

---

## Where we are

- **Section 10 (subsumes Scenario 2A)** — SHIPPED. `deduct_fifo_layers` retyped to return per-layer breakdown; 6 downstream RPCs rewritten so every ledger (`cogs_entries`, `inventory_stock_movements`, destination transfer layers) now carries per-receival cost detail instead of a single collapsed weighted-avg row.
- **Section 2A staging verify** — PARTIALLY DONE. See "Verification status" below.
- **Section 2B** — NOT STARTED. That's this session's task.

---

## What actually got verified (and what didn't)

### ✅ Verified

Direct call of the new `deduct_fifo_layers` on a real 2-layer variant returned the expected per-layer breakdown:

- **Test variant:** 80 Gallon Water Heater (bv_id `9d8c0d6a-a61b-5507-8276-bdf99b2fff86`) at Industrial Area Accommodation (wh_id `b2905b30-2a78-5488-9416-3c4614b17fa6`)
- **Before state:** L1 = 8 remaining @ 1363.21 (2026-07-11); L2 = 5 remaining @ 436.23 (2026-07-25)
- **Called:** `SELECT * FROM deduct_fifo_layers('9d8c0d6a…', 'b2905b30…', 10, false)` inside `BEGIN…ROLLBACK`
- **Returned:** 2 rows — `(L1, qty=8, cost=1363.21, total=10905.68)` + `(L2, qty=2, cost=436.23, total=872.46)`. FIFO order correct (oldest drained first).
- **After ROLLBACK:** layers back to 8 + 5. No permanent change.

Full test output is in the chat transcript at that timestamp. Also in commit message `063c6814`.

### ❌ NOT yet verified end-to-end

**The "2 COGS rows written" claim was never proven with real COGS rows.** The RPC return shape is right, and by inspection each caller does `FOR v_layer IN SELECT … FROM deduct_fifo_layers(…) LOOP INSERT INTO cogs_entries …` — so the math has to work out. But no actual `cogs_entries` row was written and inspected.

**To close this properly**, next session should either:

1. **Do a real sale** — pick a variant/warehouse with a multi-layer FIFO (see "Multi-layer candidates" below), create an SO in the UI, deliver it, then run:
   ```sql
   SELECT qty, unit_cost, total_cost
   FROM cogs_entries
   WHERE sale_delivery_id = '<the delivery uuid>'
   ORDER BY unit_cost;
   ```
   Expect ≥2 rows with different `unit_cost` values.

2. **OR synthetic end-to-end** — create an SO + sale_order_line + sale_delivery + sale_delivery_line via SQL inside a `BEGIN…ROLLBACK`, call `complete_delivery_inventory`, query `cogs_entries` mid-transaction, rollback. More work upfront but no permanent data. Requires knowing a valid customer_id + a bunch of FKs.

### 🔎 Multi-layer candidates in the DB (as of 2026-07-27)

I already ran the discovery query. Only ONE variant/warehouse in the whole DB has ≥2 live layers with **different unit costs** — the 80-gallon heater above. Every other multi-layer combo has all layers at the same cost, which means a real sale delivery there would still write N COGS rows but they'd all look identical — not a useful demo.

If you want a more visible demo, seed some diverse-cost receivals first (or fall back to the synthetic transaction path).

---

## Migrations that shipped today (chronological)

| Migration | Section | What it does |
|---|---|---|
| `20260727000000` | 1.11 | Drop `inventory_categories.description` |
| `20260727010000` | 1.12 | Wire `user_started` event for inv-check assignments |
| `20260727020000` | 1.13 | Drop 3 dead cols from `inventory_check_items` |
| `20260727030000` | 1.14 | Drop 6 dead cols from `inventory_checks` |
| `20260727040000` | 1.15 | Add `set_updated_at` trigger on `inventory_check_assignments` |
| `20260727050000` | 1.17 | Add `user_started` to `inventory_check_event_type` enum (latent 1.12 bug) |
| `20260727060000` | 1.18 | Drop 3 dead cols from `stock_adjustments` |
| **`20260727070000`** | **10 / 2A** | **Retype `deduct_fifo_layers` + sweep 6 callers** |
| **`20260727080000`** | 10 hotfix 1 | Fix `source_type`/`source_id` ambiguous column |
| **`20260727090000`** | 10 hotfix 2 | Sweep stale `inventory_brand_variants` refs in 7 fns |

All applied to remote via `npx supabase db push`.

---

## Section 2B — your next task

### The scenario (from `docs/next-work-plan.md` line 65-77)

**Setup:**
- Item 1, Receival 1: received 100, remaining 5, cost 12
- Item 1, Receival 2: received 100, remaining 100, cost 14

**Action:** SO sells Item 1 × 10 units (draws from both). Customer returns 8 units.

**Question:** how are the 8 returned units placed back into FIFO?

### What to do

1. **Trace `rpc_process_return_restock`** — this is the sale-return restock RPC. Its current definition was rewritten by hotfix 2 today (`20260727090000`) to fix a stale `inventory_brand_variants` ref, but nothing else about its logic has been touched.
   - Latest body in migrations: `supabase/migrations/20260715170000_update_rpcs_for_normalized_tables.sql:648` (function name search) — but that's stale text; live body is via `pg_get_functiondef` (see below).
   - **IMPORTANT** — pull the live body via:
     ```bash
     npx supabase db query --linked "SELECT pg_get_functiondef('public.rpc_process_return_restock'::regproc);"
     ```
     Do NOT copy from `baseline_schema.sql` — that's stale and caused Section 10's hotfix 2. Memory entry: `feedback_rewrite_functions_from_live_db.md`.

2. **Document what the RPC does today** — how it places returned units back into FIFO. Options in the wild:
   - Proportional split back into the original consumed layers?
   - LIFO into the most-recently-consumed layer?
   - Fresh layer at weighted-avg cost?
   - Fresh layer at some other cost?
   - Something else entirely?

3. **Ask the user which rule they want.** They haven't decided — that's why the plan status is 🔍 "need your rule."

4. **If current ≠ desired**, propose a fix. Same pattern as Section 10 — CREATE OR REPLACE the RPC, staging-verify, commit.

### Adjacent context worth knowing

- The `so_po_returns` table (renamed from `returns` on 2026-07-24) is where sale returns live. `return_lines` holds the per-item lines.
- Section 1.10 (already shipped) added `fifo_cost_layers.source_id` — so when the return-restock creates a new layer, it can (and does — see `4f6fa59e`) stamp `source_type='sale_return'` + `source_id=<return_id>`. The FifoLayersTable already renders sale_return layers in emerald.
- Sales returns → credit notes flow lives in `useSaleReturns.createCreditNoteForReturn` (Section 1.5).

---

## Other things queued (lower priority)

- **Section 1.19** — DONE this session (approvals-tab bypass removed). Reference commit: `fcff50ba`.
- **Section 1.20 candidate** — drop dead `inventory_adjustments` table + `apply_adjustment` RPC (surfaced during Section 10 pre-flight; no app callers).
- **Section 2A end-to-end proof** — the actual COGS-write demo, see "❌ NOT yet verified" above.
- **Section 10 wider proof** — the sweep touched 6 RPCs but only `deduct_fifo_layers` was directly tested. Consider spot-checking one delivery + one warehouse dispatch + one PO return + one warehouse receive with real or synthetic data.
- **Section 3** — `stock_adjustments.status` → enum. Small; queued as ⚙️ ready.
- **Section 6** — Warehouse transfers cleanup (remove `unit_cost` duplication, remove "receive less qty" option, add shrinkage tracking). Note: Section 10 already improved shrinkage attribution — worth revisiting scope of Section 6 in light of that.

---

## Where the data I collected lives

- **This handoff doc:** `docs/handoff-2026-07-28-section-2b.md` (you're reading it)
- **PROGRESS.md:** every section 1.11 → 10 has its own "Completed" entry with commit hash, in reverse chronological order at the top of `## ✅ Completed`
- **EOD:** `EOD/EOD-2026-07-27.md` — 11 tasks listed
- **Plan:** `docs/next-work-plan.md` — updated status for all sections we closed today
- **Migrations:** `supabase/migrations/2026072700*.sql` and `2026072708-09*.sql` (10 files)
- **Chat transcript:** the actual test queries + outputs live only in this session's chat log — worth grepping if you need the raw output
- **Memory:** `~/.claude/projects/D--MMS/memory/feedback_rewrite_functions_from_live_db.md` — the "always use pg_get_functiondef" lesson from the hotfix

---

## Quick sanity checks to run first thing next session

```bash
# 1. Make sure you're on the right branch + up to date
git status
git log --oneline -20

# 2. Confirm the 10 migrations are all applied
npx supabase migration list --linked | head -30

# 3. Confirm deduct_fifo_layers has the new shape
npx supabase db query --linked "SELECT proname, pg_get_function_result(oid) FROM pg_proc WHERE proname = 'deduct_fifo_layers';"
# Expect: TABLE(layer_id uuid, source_type text, source_id uuid, qty_taken numeric, unit_cost numeric, total_cost numeric)

# 4. Confirm no functions still reference the old table name
npx supabase db query --linked "SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosrc ~ '\minventory_brand_variants\M';"
# Expect: 0
```

If any of those look wrong, read the relevant PROGRESS.md entry to reconstruct.
