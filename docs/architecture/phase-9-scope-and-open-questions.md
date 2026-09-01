# Phase 9 — Scope, open questions, prerequisites

> This is NOT a plan. It's the discovery doc that has to exist before someone can write the Phase 9 plan. Same shape as `docs/phase-7-dual-ledger-damaged-units.md` was for Phase 7.

Phase 8 retired the legacy single-ledger for CN/customer returns. Phase 9 fills the two gaps Phase 7/8 explicitly deferred, plus one gap they didn't name.

---

## 1. What Phase 9 is expected to cover

### 1a. `restock_as_damaged` disposition (definite)
When damaged units come back from a customer, sometimes we can still sell them — at a lower price, marked as "B-grade" or "as-is". Right now the only implemented disposition is `write_off`. `restock_as_damaged` and `send_for_repair` both raise `not yet implemented` in the RPC bodies (see the `raise exception` strings in `20260731000700`).

### 1b. `send_for_repair` disposition (definite)
Damaged units leave the warehouse temporarily to a vendor/repair partner. They come back either as good stock (successful repair) or as a permanent write-off (unrepairable). Needs a transfer-out / return-from-vendor flow.

### 1c. DN dual-ledger mirror of Phase 7 (worth considering, not required)
The exact same customer + inventory dimension split we built for CN/sale returns applies conceptually to DN/purchase returns:
- **Supplier dimension** — refund / supplier credit / replacement shipment
- **Inventory dimension** — units shipped back / write-off / kept as damaged / awaiting shipment
Currently DNs use flat manual `status` transitions. Same shape of problem CNs had before Phase 7. See section 3 for the argument to defer.

---

## 2. Design decisions that MUST happen before writing the plan

### Decision A — Where does damaged stock live?

Two options. Pick one before writing any migration.

**Option A1 — Condition flag on `inventory_stock`**
Add a `condition` column (`good` / `damaged`) or extend an existing one. Damaged units live in the same rows/layers as good units but with a marker.

- Pros: Fewer tables. FIFO layer math already understands "reduce qty from this layer". Reporting is one query with a group-by.
- Cons: Every SO delivery / warehouse picker / stock-check / adjustment query needs a `where condition = 'good'` filter added. Missing that filter anywhere = damaged units sold as good. High blast radius.
- Cons: Existing `inventory_stock_movements.movement_type` enum probably needs a `damaged_grade` axis or a parallel `condition_change` movement type when good stock is downgraded to damaged.

**Option A2 — Dedicated `inventory_damaged_stock` table (or `inventory_stock` split by condition)**
Damaged units live in a separate table with the same shape (warehouse × brand_variant × qty × unit_cost × FIFO layer). All existing good-stock queries stay unaffected.

- Pros: Zero blast radius on existing sale/delivery/picker code. New surface only touches new code.
- Pros: Conceptually cleaner — damaged stock IS a different product-line grade in this business (different SKU suffix? different sale channel?).
- Cons: Duplicated FIFO layer logic. Movements table needs new types (`sale_return_damaged_restock`, `damaged_ship_out_for_repair`, `damaged_return_from_repair_as_good`, `damaged_write_off`). More surface.
- Cons: Cross-table joins whenever a report wants "total qty across grades".

**Recommendation to explore in the brainstorm:** A2 (dedicated table) — the "damaged stock is a separate sale channel" framing seems to match the business intent better, and the blast-radius argument is a big one. But A1 might win if the business actually wants damaged units in the same picker with a badge.

**Ask the user before deciding:** does the sales team pick from a separate "damaged stock" list, or from the main list with damaged badges? That answer forces A1 vs A2.

### Decision B — Does `send_for_repair` model the vendor as a supplier or as a service partner?

If the repair vendor is already in `suppliers`, `send_for_repair` can be modeled as a `warehouse_transfer` OUT to the vendor's virtual warehouse + a `warehouse_transfer` IN when they return.

If the repair vendor is a new entity type (service partner ≠ supplier), we need a new `service_partners` table + its own transfer flow.

**Ask the user:** are repair vendors already tracked, and if so, where?

### Decision C — Is DN dual-ledger in scope, or deferred again?

Arguments for scope:
- Same shape of problem, so building it while the Phase 7 knowledge is fresh is cheaper than doing it later
- Purchase returns will eventually need the same partial-resolution + "supplier owes us but box is still in the warehouse" state that CN dual-ledger enables

Arguments against scope:
- DN volume is roughly 1/10th of CN volume in this business — ROI is lower
- Would double Phase 9's size (~1.5 days added)
- Phase 9 without DN dual-ledger is still a coherent shipment; DN can be its own Phase 10

**Recommendation:** defer DN dual-ledger to Phase 10 unless the current DN status flat-model has already caused an incident. If it hasn't bitten anyone, don't preemptively build it.

---

## 3. Prerequisites — things that must be in place before we write the plan

- [ ] User picks A1 or A2 (damaged stock storage model)
- [ ] User confirms whether repair vendors are already modeled somewhere
- [ ] User picks: include DN dual-ledger in Phase 9, or defer to Phase 10
- [ ] Confirm no active feature freeze or incident work that would push Phase 9 later
- [ ] Confirm dev DB is caught up with staging migrations — Phase 6/7/8 push is still deferred per `project_dev_db_pending_migrations` memory. Any new Phase 9 migration would land on top of a stale dev DB otherwise.

---

## 4. Scope boundary — what Phase 9 does NOT include

- **New CN/DN types.** Phase 9 uses the enums we already have.
- **UI redesign of the return dialog.** Add the two new disposition options + wire the flows behind them; do not restructure the dialog.
- **Historical backfill.** All existing returns closed under `write_off` stay `write_off`. Damaged stock is only tracked going forward.
- **Reporting.** Damaged-stock-value reports, aging, resale margin — separate follow-up (Phase 10+).

---

## 5. Rough sizing (before planning)

| Piece | Effort |
|---|---|
| Decision A + B + C (brainstorm) | 30–60 min |
| Damaged-stock storage migrations | ~4 h |
| `restock_as_damaged` — RPC impl + dispatch in `rpc_create_partial_replacement` + UI enable | ~6 h |
| `send_for_repair` — vendor transfer flow + RPC impl + UI enable + return-from-repair flow | ~10 h (dominant cost) |
| DN dual-ledger (IF in scope) | ~12 h |
| Verification sweep + 8.7-shape walkthrough | ~4 h |
| Security audit close-out | ~1 h |

**Total without DN:** ~3 working days.
**Total with DN:** ~5 working days.

---

## 6. Known unknowns (things we discover during the plan, not before)

- How does `send_for_repair` interact with `sale_deliveries` if the customer expected a replacement while the unit is out for repair?
- Does the operator need visibility on "this unit went out for repair on X date, expected back Y" from the return card?
- Do we surface damaged stock in the SO/DO picker at all, or is it only visible on a dedicated damaged-stock page?
- What movement_type strings should `damaged_ship_out_for_repair` / `damaged_return_from_repair_as_good` / `damaged_return_from_repair_as_writeoff` use? Enum extension needed?

These are plan-time questions. Do NOT try to answer them here — they get answered during the plan write, or (better) during a 30-min brainstorm that the plan writer facilitates.

---

## 7. Recommended next steps

1. **Brainstorm session** — resolve Decision A, Decision B, Decision C. 45 minutes with the user.
2. **Write the plan** — using the resolved decisions, produce `docs/superpowers/plans/YYYY-MM-DD-phase-9-damaged-stock-dispositions.md` (mirror Phase 8 plan's structure).
3. **Sub-task 9.0 — dev DB catch-up** — before any Phase 9 migration lands, push the 20+ deferred migrations from staging to dev. Otherwise dev drifts further.
