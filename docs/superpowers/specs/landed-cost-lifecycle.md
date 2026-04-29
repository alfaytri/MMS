# Landed Cost (LC) — Business Rules & Lifecycle

> Reference document — captures the full LC business logic so it does not need to be re-explained.  
> Source: Mohamed Ismail verbal walkthrough + `LC - Life cycle.xlsx`

---

## What Is a Landed Cost?

A **Landed Cost** is any additional cost incurred to physically receive goods:  
freight, customs/clearance, bank charges, handling fees, etc.  
These costs are NOT on the purchase invoice — they arrive separately (often weeks or months later).

The LC must be **allocated back to each unit of product** received, so the true cost of that inventory is known.

---

## 1. Scope: Single or Multi-PO

One LC record can cover **one or many POs** in a single shipment.  
The cost is split among the POs by **PO value weight**:

```
PO weight = PO total value / Sum of all attached PO values

Example (from LC - Life cycle.xlsx):
  PO1 = QAR 9,855     → weight = 93.91%
  PO2 = QAR 638.75    → weight =  6.09%
  LC total = QAR 11,000
  → PO1 gets QAR 10,330.43
  → PO2 gets QAR   669.57
```

---

## 2. Within Each PO — Product-Level Split

Within a single PO, the LC share is further split among products by **product value weight**:

```
Product weight = (product_unit_cost × qty_received) / PO total value

Example (Unit A, B, C in PO1):
  Unit A: QAR 2,000 → 20.29%  → gets QAR 2,096.49 of PO1's LC share
  Unit B: QAR 5,000 → 50.74%
  Unit C: QAR 2,855 → 28.97%
```

---

## 3. Per-Unit Cost After LC

```
Per-unit LC add-on  = product's LC share / qty_remaining (see §4)
New unit cost       = original purchase unit cost + per-unit LC add-on
Selling price       = new unit cost × (1 + profit margin %)
```

The **per-unit LC add-on updates the FIFO layer cost** for all remaining stock.  
Average cost on the brand_variant is recalculated after the update.

---

## 4. The Late LC Scenario (Key Business Rule)

LCs frequently arrive **2–3 months after the PO receival**.  
By then, some units may already have been sold.

**Rule: Allocate only over the REMAINING qty at the time the LC is applied.**

```
Example:
  PO received: 50 units
  LC arrives 2 months later
  Units sold so far: 20
  Units remaining: 30

  → LC per-unit = PO's LC share / 30   (NOT 50)
  → The 20 already-sold units absorb no LC markup (their COGS is already booked)
  → The 30 remaining FIFO layer units get their unit_cost bumped by this per-unit LC amount
  → average_cost on brand_variant is recalculated
```

**Why not spread over all 50?**  
The sold units' COGS is already posted. Retroactively changing it would corrupt the P&L.  
The entire LC cost is absorbed by remaining inventory.

---

## 5. The All-Sold Scenario

If **all units from that PO are already sold** by the time the LC arrives:

```
→ LC cannot be applied to any inventory (nothing left to mark up)
→ Set landed_costs.all_items_sold = TRUE
→ Record in QuickBooks: "LC [month] — [amount]" as a standalone expense line
→ No FIFO layer update needed
→ No average_cost change
```

This is purely a bookkeeping entry — the cost becomes a period expense, not an inventory markup.

---

## 6. Full LC Cost Lines

An LC can have multiple cost components. Each is a separate line:

| Type | Example | Allocated how |
|------|---------|---------------|
| Freight / Shipping | Air freight, sea freight | By PO value weight → by product weight |
| Customs / Clearance | Import duty, clearance fees | Same |
| Bank charges | LC bank fees, wire fees | Same |
| Handling | Port handling, unloading | Same |

All lines are summed into `total_amount`. The **split calculation uses the grand total**, not per-line.

---

## 7. Multi-Currency

Each cost line can be in a different currency (USD, QAR, EUR, GBP, AED).  
Before allocation, all lines are converted to the **base currency (QAR)** using the exchange rate at the LC date.

---

## 8. LC Status Lifecycle

```
Created (draft)
    │
    ▼
Applied to Inventory  ← runs allocate_landed_cost RPC
    │                    updates FIFO layers, recalcs average_cost
    │
    ├──→ all_items_sold = TRUE  (if nothing left in stock)
    │
    └──→ Voided (with reason)   (reverses the layer cost update)
```

---

## 9. Data Model Impact

| Table | What changes |
|-------|-------------|
| `fifo_cost_layers` | `unit_cost` bumped by per-unit LC add-on for remaining layers |
| `inventory_brand_variants` | `average_cost` recalculated via `recalc_average_cost` RPC |
| `inventory_stock_movements` | New row: `movement_type = 'cost_adjustment'`, records the delta |
| `landed_costs` | `item_allocations` JSONB filled with per-variant breakdown; `applied_at` set |
| `cogs_entries` | No change — already-sold units are NOT retroactively adjusted |

---

## 10. item_allocations Record (per brand_variant)

After applying an LC, each `item_allocations` entry should store:

```json
{
  "brand_variant_id": "uuid",
  "item_name": "Product name",
  "sku": "SKU-001",
  "qty_received":  50,
  "qty_remaining_at_lc":  30,
  "original_unit_cost": 100.00,
  "lc_per_unit": 20.94,
  "updated_unit_cost": 120.94,
  "allocated_lc_total": 628.30
}
```

Note `qty_remaining_at_lc` vs `qty_received` — only remaining units bear the cost.

---

## 11. Selling Price Impact

After LC is applied, the selling price on the brand_variant **should be reviewed** (not auto-updated):

```
Suggested updated price = new unit_cost × (1 + margin %)
```

This is a manual decision — the system surfaces the new cost; pricing is a user action.

---

## 12. QuickBooks Integration Note

When `all_items_sold = TRUE`:  
→ QuickBooks entry: `Landed Cost Expense | [LC month] | [total_amount]`  
No product cost update. Full amount is a period expense.

When LC is applied to remaining inventory:  
→ QuickBooks entry reflects higher inventory valuation (balance sheet, not P&L)

---

## 13. What Was Already Built

| Component | Status | Notes |
|-----------|--------|-------|
| `landed_costs` DB table | ✅ Done | `lines` JSONB, `attached_receival_ids`, `all_items_sold`, `item_allocations` |
| `voided_at`, `voided_reason` columns | ⚠️ In code, missing in migration | Need migration |
| `applied_at` column | ❌ Missing | Tracks when LC was applied to inventory |
| `qty_remaining_at_lc` in item_allocations | ❌ Missing | Currently only `qty_received` |
| `useLandedCosts` hook | ✅ Done | Create + Void |
| LC list + detail page | ✅ Done | Shows cost lines + item_allocations |
| `allocate_landed_cost` RPC | ❌ Missing | The atomic Postgres RPC that applies LC to FIFO layers |
| "Apply to Inventory" UI action | ❌ Missing | Button in LcDetailDialog to trigger allocation |
| FIFO layer cost update | ❌ Missing | RPC must UPDATE `fifo_cost_layers.unit_cost` for remaining layers |
| `recalc_average_cost` after LC | ❌ Needs wiring | RPC exists, just needs to be called from allocate_landed_cost |
| `cost_adjustment` stock movement | ❌ Missing | Movement recording after LC application |
| All-sold detection | ⚠️ Partial | `all_items_sold` flag exists; logic to auto-detect not implemented |
