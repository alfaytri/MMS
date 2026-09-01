# Inventory Cost Accounting — How the System Stores & Protects Cost

> **Audience:** developers and power operators who need to understand *how the
> numbers are stored*, not just how to click the UI.
> **Scope:** the FIFO cost-layer engine and every flow that reads or writes it —
> receival, landed cost, warehouse→warehouse transfer, consumption, sale
> delivery (COGS), returns, adjustments — plus the derived caches the app
> displays, reserved/available stock, the damaged-stock repair lifecycle, the
> procurement chain (PO → receival → bill → payment), and project-pool spend.
> Every example is **real data pulled from the staging database** (project
> `mwvblpgbgxipvrevkeff`) so you can re-run the queries and see it yourself.

---

## 0. The one big idea

Stock is not stored as a single "quantity × average cost". It is stored as a
**stack of cost layers** — one layer per batch of stock that entered at a
particular cost. Every outbound movement (sale, consumption, transfer, write-off)
**consumes layers oldest-first (FIFO)** and carries **each layer's exact cost**
with it.

The system **never blends two receival costs into one number and loses the
detail.** If you received 3 units at QAR 2,500 and 2 units at QAR 4,745, the
system knows — forever — that you have "3 @ 2,500 + 2 @ 4,745", not "5 @ 3,398
average". Averages are *computed on demand* for display; the truth is the layers.

This is what protects cost through the complex flows the rest of this document
walks through.

---

## 1. The foundation: `fifo_cost_layers`

This one table is the cost ledger. Everything else derives from it.

| Column | Meaning |
|---|---|
| `brand_variant_id` | which item-variant this layer belongs to |
| `warehouse_id`, `sub_container_id` | **where** the stock physically sits (a sub-container = a division's shelf inside a warehouse) |
| `date`, `receival_number`, `created_at`, `id` | the **FIFO sort key** (oldest first, in that tie-break order) |
| `qty` | how many units the layer was *born* with |
| `unit_cost` | the base purchase cost per unit |
| `landed_cost_per_unit` | freight/duty added later (starts 0) |
| `total_unit_cost` | **`unit_cost + landed_cost_per_unit`** — the true cost the system uses everywhere |
| `remaining_qty` | how many units of this layer are **still on hand** (the live balance) |
| `source_type` | how the layer was born: `receival`, `opening`, transfer-in, etc. |
| `source_currency`, `source_exchange_rate` | the currency the cost was booked in + its rate to QAR |

**The core invariant:** `remaining_qty` is the single source of truth for "how
much is left, and at what cost". A layer with `remaining_qty = 0` is spent but is
**kept** (history + retroactive landed-cost + reporting all need it).

Everything the UI shows about stock is *derived* from these layers:

| What the app shows | Where it comes from |
|---|---|
| Per-warehouse qty / value / avg cost | `warehouse_stock_summary` — a trigger rebuilds one row per (sub-container, variant) whenever layers change |
| "All divisions" qty (per variant) | `inventory_item_brand_variants.stock_level` — a denormalized company-wide total |
| Average cost | `inventory_item_brand_variants.average_cost` — recomputed after every layer change |

> These three are **caches**. They are only ever as correct as the layers behind
> them, which is why every flow below updates the layers first and the caches
> second.

---

## 2. How stock is born — Receival → a cost layer

When a receival is **approved**, each received line writes one
`fifo_cost_layers` row: `qty` and `unit_cost` from the PO/receival, `source_type
= 'receival'`, stamped with the `receival_number` and the destination
warehouse/sub-container. That layer *is* the stock.

**Staging example — `RCV-00030`, "3.0 TON — INVERTER | R410A":**

| receival | qty | unit_cost | landed/unit | **total_unit_cost** | remaining | currency | rate |
|---|---|---|---|---|---|---|---|
| RCV-00030 | 15 | 1,500 | 73.33 | **1,573.33** | 10 | QAR | 1 |

It was received at **QAR 1,500**; the `73.33` landed cost and the drop from 15→10
remaining came *later* (see §4 and §6). Receiving a *second* batch of the same
item at a different price simply adds a *second* layer — the two never merge.

---

## 3. The FIFO engine — `deduct_fifo_layers()`

Every outbound flow (transfer, consumption, sale, damaged write-off) calls this
one function. Understanding it is understanding the whole system.

```
deduct_fifo_layers(variant, warehouse, qty, is_transfer, sub_container)
  → returns one row PER LAYER consumed: (layer_id, qty_taken, unit_cost, total_cost, …)
```

What it does:

1. Selects that variant's layers in the warehouse/sub-container with
   `remaining_qty > 0`, **ordered oldest-first** (`date, receival_number,
   created_at, id`), and **locks them** (`FOR UPDATE`) so two operations can't
   double-spend the same units.
2. Walks them, taking `LEAST(still-needed, layer.remaining_qty)` from each,
   decrementing `remaining_qty`, and **emitting one result row per layer with
   that layer's exact `total_unit_cost`.**
3. If it runs out of layers before satisfying the qty → `RAISE 'Insufficient
   stock'` (the whole operation rolls back — you can never oversell).
4. If **not** a transfer, it also decrements the company-wide
   `variant.stock_level`. A transfer passes `is_transfer = true` and *skips* this
   — because a transfer doesn't change how much the company owns, only *where* it
   is (see §5).
5. Recomputes `average_cost`.

The key output is **"here are the exact per-layer costs of the units you just
took."** The caller decides what to do with them — record COGS, or re-create
layers elsewhere.

---

## 4. Warehouse → Warehouse transfer — cost preserved per layer

**This is the headline mechanic.** A transfer of 5 units that came from two
different receivals arrives at the destination as **two layers at their original
costs** — never as one blended layer.

It is a two-step handoff:

**Step 1 — Dispatch (`dispatch_transfer`)** at the source:
- Calls `deduct_fifo_layers(..., is_transfer := true)` → pulls the qty from the
  source layers oldest-first, getting back the per-layer split.
- Writes **one `transfer_out` movement per layer, at that layer's exact cost.**
- Skips the `stock_level` decrement (goods are *in transit*, still company-owned).

**Step 2 — Receive (`receive_transfer`)** at the destination:
- Walks those `transfer_out` movements in order and, for the received portion of
  each, **inserts a NEW `fifo_cost_layers` row at the destination with the same
  `unit_cost`** + a matching `transfer_in` movement.
- Any shortfall (received < dispatched) becomes a `transfer_shrinkage` movement
  on the source side and is deducted from `stock_level`.

**Staging example — `WT-2026-00016`** (Birkat Alawamer → Industrial Area
Accommodation), item **"Split AC 12000BTU" (DAIKIN, IMP-SPL-003)**, 5 units:

The 5 units spanned two source cost layers. Here is exactly what the transfer
recorded (`inventory_stock_movements` where `reference_id = the transfer`):

| movement | qty | unit_cost | side |
|---|---|---|---|
| `transfer_out` | −3 | **2,500** | source (Birkat) |
| `transfer_out` | −2 | **4,745** | source (Birkat) |
| `transfer_in` | +3 | **2,500** | destination |
| `transfer_in` | +2 | **4,745** | destination |

→ The destination received **two new layers: 3 @ 2,500 and 2 @ 4,745**, not
"5 @ 3,398". If those units are later sold or transferred again, they still leave
at 2,500 and 4,745 respectively. **Cost integrity survives any number of hops.**

Why this matters: a naive system would move "5 units at the average cost", and
after a few transfers the cost of a unit would drift away from what you actually
paid, corrupting margin and stock valuation. This design makes that impossible.

---

## 5. Warehouse → Consumption — COGS booked per layer

Consumption (issuing stock to a team, a project, or internal use) is an
*outbound* flow, so it drains layers the same FIFO way — but instead of
re-creating layers, it books **cost of goods**.

`rpc_post_consumption`:
1. Creates a `consumption_entries` header (source, consumer, project/discipline/
   milestone tags, division).
2. For each line, calls `deduct_fifo_layers(..., is_transfer := false)` (so
   `stock_level` *does* drop).
3. For **each layer consumed**, writes:
   - a **`cogs_entries`** row at that layer's exact cost (this is what the P&L
     reads), and
   - a `consumption` stock movement (`qty` negative).
4. Stores one `consumption_lines` row with the **weighted-average** unit cost
   (`Σ layer costs ÷ qty`) — purely for display on the document.

**Staging example — `CE-Custody-2026-08-05`, "1 STAGE 4 CFM VP-135 YANGYI":**

| line qty | line unit_cost (display) | → COGS rows booked |
|---|---|---|
| 1 | 259.99 | `1 @ 259.99 = 259.99` (`source_type = consumption`) |

Here 1 unit came from a single layer, so line cost = layer cost. **If a
consumption of, say, 5 units straddled two layers** (like the transfer in §4 or
the sale in §6), you'd get **two `cogs_entries` rows** — e.g. `3 @ 2,500` and
`2 @ 4,745` — and the consumption line would show the weighted average
`(3·2500 + 2·4745) / 5 = 3,398`. The COGS is always the *true* FIFO cost; the
averaged number is only a label.

---

## 6. Sale delivery → COGS (the same engine, multi-layer in the wild)

A confirmed sale delivery deducts FIFO layers and books `cogs_entries` exactly
like consumption — this is where a single sale routinely spans multiple cost
layers.

**Staging example — one delivery of "3.0 TON — INVERTER | R410A", 7 units:**

| COGS row | qty | unit_cost | total_cost |
|---|---|---|---|
| layer A | 4 | 1,500 | 6,000 |
| layer B | 3 | 1,600 | 4,800 |
| **sale COGS** | **7** | — | **10,800** |

The 7 sold units drained two cost layers oldest-first — units received at 1,500
and at 1,600 — for COGS = QAR 10,800, booked at the real cost of each layer. The
revenue−COGS margin on this line is therefore exact, not smeared by an average.

---

## 7. Landed cost — retroactive cost on stock already received (and already sold)

Freight, customs, and clearing bills usually arrive **after** the goods. Landed
cost (`allocate_landed_cost`) reaches back and corrects the cost of stock that
was already received — including units that were **already sold** before the bill
came.

How it allocates:
1. Sum the QAR value of every eligible receival item attached to the LC (each
   converted at its PO's booked exchange rate — a mixed-currency LC still splits
   correctly). That's the **value base**.
2. Each variant's share of the LC = `LC total × (variant value ÷ value base)` —
   **proportional to value.** Per-unit = share ÷ qty received.
3. Split that share by where the units are now:
   - **Still on hand** → bump those layers: `landed_cost_per_unit += per-unit`
     and `total_unit_cost += per-unit`. Future valuation & COGS now include
     freight. (Recorded as a `cost_adjustment` movement.)
   - **Already sold** → write a retroactive **`cogs_entries`** row
     (`source_type = 'landed_cost'`) so the P&L reflects the true landed cost for
     units sold before the bill existed.
4. Snapshot the deltas into `landed_costs.revert_snapshot` so the LC can be
   cleanly reverted.

**Staging example — `LC-2026-0003` on "3.0 TON — INVERTER | R410A":**

| received | remaining at LC | sold at LC | original cost | LC / unit | **updated cost** | → inventory | → retro COGS |
|---|---|---|---|---|---|---|---|
| 15 | 15 | 0 | 1,500.00 | 73.33 | **1,573.33** | 1,100.00 | 0.00 |

All 15 units were still on hand when the freight bill landed, so the whole QAR
1,100 folded into the layer cost (1,500 → 1,573.33) and nothing was booked as
retroactive COGS. Had 5 already been sold, ~QAR 366 of it would have posted as a
`landed_cost` COGS entry against those 5 units instead. This is the same
`RCV-00030` layer from §2 — you can see the `73.33` and `1,573.33` there.

---

## 8. Returns — reversing cost cleanly

A **sale return** puts stock back and reverses the margin. Rather than guessing a
cost, the system reuses the sale's own FIFO cost basis
(`_return_line_fifo_unit_cost`) so what comes back matches what went out.

**Staging example — a "Capacitor" return line:**

| COGS row | qty | unit_cost | total_cost |
|---|---|---|---|
| return | −5 | 7.63 | −38.15 |

A **negative** COGS entry (−38.15) — the earlier COGS is unwound at the same unit
cost, and the units re-enter stock. A **purchase return** is the mirror on the
buy side (stock leaves, supplier balance adjusts).

---

## 9. Stock adjustments — increase / decrease / damage / write-off

Adjustments (`create_stock_adjustment_v2` → approval → `approve_stock_adjustment
_inventory`) are the manual corrections, and they respect the layer model too:

- **Increase / Found** → adds a layer (or a zero/known-cost layer) at the chosen
  sub-container.
- **Decrease / Lost / Damage / Write-off** → drains FIFO layers (via the same
  engine) and books the cost as a loss.
- **Damaged write-off** specifically consumes the *damaged* pile
  (`inventory_damaged_stock`, tracked per warehouse) via
  `_consume_damaged_stock_fifo`, logging a `damaged_write_off` movement — no
  good-stock FIFO deduction.

> The adjustment **type** (`increase/decrease/damage/write_off`) is a fixed enum
> that drives the approval workflow and the ledger effect — it is separate from
> the admin-managed **reason** text. See the reason lists in *Master Data ›
> Reason Lists*.

---

## 10. The derived numbers — how the displayed figures are computed

- **`average_cost`** (`recalc_average_cost`): `Σ(remaining_qty × total_unit_cost)
  ÷ Σ(remaining_qty)` over layers with `remaining_qty > 0` **and**
  `total_unit_cost > 0` — free/zero-cost layers are excluded so they don't
  dilute the displayed unit cost. Recomputed after every layer change.
- **`warehouse_stock_summary`** (trigger `trg_fifo_stock_summary` →
  `refresh_stock_summary_row`): after any layer insert/update/delete, one row per
  `(warehouse, sub-container, variant)` is rebuilt with `qty = Σ remaining`,
  `avg_cost` over *paid* layers, and `total_value`. This is what the division-
  scoped Inventory views read. **Never insert into it by hand** — the trigger
  owns it.
- **`stock_level`** on the variant is the company-wide `Σ remaining` across all
  warehouses; it is the "All divisions" number.

---

## 11. Multi-currency

Each layer carries `source_currency` + `source_exchange_rate`, and costs are
normalized to **QAR** as the base. Landed-cost allocation converts every item to
QAR at **its PO's booked rate** before splitting, so a single LC spanning items
bought in different currencies still allocates by true relative value.

---

## 12. Reserved / available stock — how committed units are held

On-hand quantity and *available* quantity are not the same. When units are
committed to an in-flight operation, they are **reserved** so they can't be
double-spent, without yet leaving stock.

The reservation lives in **`warehouse_stock_allocations.allocated_qty`**, one row
per `(warehouse, sub-container, variant)`. The stock summary then exposes:

```
available_qty  =  qty (on hand)  −  allocated_qty (reserved)
```

In this system the reservation is **transfer-driven**:

- **`create_transfer_v2`** (transfer created, still `pending`) → **reserves** the
  qty at the source. The units are still physically there, but `available_qty`
  drops so nothing else can commit them.
- **`dispatch_transfer`** → **releases** the reservation *and* deducts the FIFO
  layers (the goods actually leave; see §4).
- **`cancel_transfer` / `reject_transfer_v2`** → **release** the reservation with
  no deduction (the units become available again).

> Sale deliveries do **not** reserve here — they deduct FIFO directly on confirm/
> complete. Reservation is specifically the "a pending transfer is holding these"
> mechanism.

**Staging example — three live reservations:**

| Item | On hand | Reserved | **Available** |
|---|---|---|---|
| Fan Motor YDK60-6Z | 24 | 5 | **19** |
| 13AMP Socket — Tenby | 5 | 3 | **2** |
| AC Converted — 2 Ton | 2 | 2 | **0** (fully held by a pending transfer) |

The AC Converted line shows why this matters: all 2 units are spoken for by a
pending transfer, so the item reads **0 available** — a second transfer or issue
can't grab them until the first one dispatches or is cancelled.

---

## 13. Damaged-stock lifecycle — a separate pile, in and out of repair

Damaged units are **not** FIFO layers. They live in their own ledger —
**`inventory_damaged_stock`** (a per-*warehouse* balance; no sub-container /
division) with **`inventory_damaged_movements`** as the signed history. Good
stock and damaged stock never mix.

The lifecycle (movement types in `inventory_damaged_movements`):

1. **Born** — `restock_as_damaged_in`: units enter the damaged pile, usually from
   a sale return whose disposition marks them damaged (or a damaged receival),
   carrying their unit cost.
2. **Sent for repair** — `rpc_send_damaged_for_repair` moves them out
   (`send_for_repair_out`) to a **repair vendor's virtual warehouse** (the vendor
   is a sub-container of the structural *Repair* warehouse) via a transfer of
   kind `damaged_repair_out`.
3. **Returned from repair** — `rpc_return_damaged_from_repair`, outcome
   **good / writeoff / mixed** (and `qty_good + qty_writeoff` must equal what went
   out):
   - **Good** → re-enters **good FIFO stock** as a **new `fifo_cost_layers` row at
     the ORIGINAL unit cost** (`source_type = 'damaged_repair_return'`), plus a
     `damaged_return_from_repair_as_good` movement. **Repair cost is deliberately
     *not* amortized** into the unit cost.
   - **Write-off** → a `return_from_repair_as_writeoff` entry in the damaged
     ledger — the units are unrecoverable and leave the system as a loss.
4. **Written off from the pile directly** — `damaged_write_off` (see §9), or
   `damaged_adjust` for manual corrections.

**Staging example — "PVC Roll" (unit cost QAR 180.49):**

| date | movement | qty |
|---|---|---|
| 2026-07-30 | `restock_as_damaged_in` | +1 |
| 2026-07-31 | `send_for_repair_out` | −1 |
| 2026-08-02 | `restock_as_damaged_in` | +1 |
| 2026-08-02 | `send_for_repair_out` | −1 |

Each unit is tracked at its cost through the pile → repair → return cycle,
entirely separate from the FIFO good-stock ledger; only a *good* repair outcome
mints a new FIFO layer back into sellable stock.

---

## 14. Procurement chain — PO → receival → landed cost → bill → payment

This is where cost enters the system and where the money owed is tracked. The
key idea: **inventory cost and the supplier liability are two linked-but-separate
ledgers.**

| Stage | Table(s) | What it records |
|---|---|---|
| **Purchase order** | `purchase_orders` | the order — supplier, division, `initial_exchange_rate` (the booked FX rate) |
| **Receival** | `receivals` (`po_id`), `receival_items` | goods in → **creates FIFO cost layers** at the PO's unit cost (§2) |
| **Landed cost** | `landed_costs` (§7) | freight/duty **bumps the layer cost** retroactively |
| **Bill** | `bills` (`rpc_create_purchase_bill`) | the **AP liability** — links PO + (optionally) receival + supplier; `bill_number = <PO>-B`; subtotal/discount/total; `payment_status` |
| **Payment** | `payments` + `payment_bill_allocations` (`allocate_payment_to_bill`) | money out, **allocated** to bills |

Payments are **many-to-many** with bills: one payment can be split across several
bills, and one bill can be settled by several payments. `allocate_payment_to_bill`
guards that a payment can't be allocated beyond its own amount, then flips the
bill to `partially_paid` / `paid` from the running total.

> **Cost vs. liability are distinct.** The FIFO layers (what a unit *costs* for
> valuation & COGS) come from the receival + landed cost. The bill (what you
> *owe*) is a separate document. They are linked by the PO/receival but move on
> their own ledgers — paying a bill does not touch inventory cost, and a landed
> cost bumps inventory value without changing what you owe.

**Staging example — `PO-2026-07-013`:**

| PO | Bill | Supplier | Bill total | Payments | Status |
|---|---|---|---|---|---|
| PO-2026-07-013 | PO-2026-07-013-B | Test INt | QAR 12,750 | 2 × QAR 1,500 (debit_note) | **partially_paid** (3,000 / 12,750) |

Two 1,500 allocations bring the bill to 3,000 paid, so it reads
`partially_paid`; the remaining QAR 9,750 keeps the supplier balance open. (The
cost side of this PO's goods lands as FIFO layers on its receival, exactly like
`RCV-00030` in §2 / §7.)

---

## 15. Project-pool consumption — discipline / milestone spend

A project is **one stock-pool sub-container** (a `warehouse_sub_containers` row
with `project_id` set). **Disciplines and milestones are cost *tags* on
consumption**, not separate stock pools — so project spend is tracked without
fragmenting the inventory.

When stock is consumed *to* a project (`rpc_post_consumption` with the project
sub-container as consumer + `p_discipline_id` + `p_milestone_id`), it drains FIFO
and books `cogs_entries` exactly as in §5 — but each COGS row is **stamped with
the division, discipline, and milestone**. Guards enforce integrity:

- the discipline must belong to the consumer project;
- the milestone must belong to that `(consumer sub-container, discipline)`.

`rpc_report_project_consumption` then rolls spend up by discipline and milestone
for the project cost report.

**Staging example — the project structure exists:**

| Project | Disciplines | Milestones |
|---|---|---|
| Smoke Test Project | 2 | 1 |
| "no need" | 3 | 0 |

(Discipline catalog: Automation, Electrical, Plumbing.)

> No project-tagged consumption has been posted on staging yet, so there is no
> live COGS example to show here — but the booking path is identical to §5's
> consumption (`deduct_fifo_layers` → `cogs_entries`), with the
> division/discipline/milestone stamped onto each COGS row so the project report
> can group by them.

---

## 16. Invariants the system guarantees

1. **No blended cost.** Two receivals at different prices stay two layers; their
   costs never merge into one number that loses the detail.
2. **FIFO, always.** Every outbound flow consumes oldest-first, deterministically
   (tie-broken by receival number, then creation time, then id).
3. **Cost survives movement.** A transfer re-creates layers at the destination at
   their exact source costs — through any number of hops.
4. **You cannot oversell.** `deduct_fifo_layers` raises and rolls back the whole
   transaction if the layers can't cover the requested qty; row locks prevent two
   operations double-spending the same units.
5. **Company stock is conserved by transfers.** A transfer never changes
   `stock_level` (only location); only genuine loss (shrinkage, write-off,
   consumption, sale) reduces it.
6. **Cost can be corrected after the fact.** Landed cost retroactively adjusts
   both on-hand layer costs and already-sold COGS, and is fully revertible.
7. **Displayed numbers are derived, and rebuilt on every change** — so the caches
   can't silently drift from the layer truth.
8. **Committed units are reserved, not double-spent.** A pending transfer holds
   stock (`available = on-hand − reserved`) until it dispatches or is cancelled.
9. **Damaged stock is a separate ledger.** It never mixes with good FIFO stock;
   only a *good* repair outcome mints a new FIFO layer back into sellable stock,
   at the original cost.
10. **Cost and liability are separate ledgers.** What a unit *costs* (FIFO layers)
    and what you *owe* (bills / payments) are linked by the PO/receival but move
    independently — paying a bill doesn't change inventory cost, and a landed cost
    doesn't change what you owe.

---

## Appendix — verify any transaction yourself

Every worked example above is queryable on staging. The pattern:

```sql
-- the per-layer story of any transfer / consumption / delivery:
SELECT movement_type, qty, unit_cost, sub_container_id, notes
FROM   inventory_stock_movements
WHERE  reference_id = '<transfer|consumption|delivery id>'
ORDER  BY created_at, id;

-- what cost basis a sale/consumption actually used:
SELECT qty, unit_cost, total_cost, source_type
FROM   cogs_entries
WHERE  consumption_id = '<…>'  -- or sale_delivery_id / landed_cost_id
ORDER  BY unit_cost;

-- the live cost layers of an item-variant (the truth behind every number):
SELECT date, receival_number, qty, unit_cost, landed_cost_per_unit,
       total_unit_cost, remaining_qty, warehouse_id, sub_container_id
FROM   fifo_cost_layers
WHERE  brand_variant_id = '<variant id>'
ORDER  BY date, created_at;
```

*Source of truth is the live database function bodies (`pg_get_functiondef`), not
this document — if a function changes, update this file in the same PR.*
