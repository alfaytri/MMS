# Landed Cost — How It Works

## 1. Allocation Method — By Received Value (Proportional)

Not by quantity, not by weight — by **monetary value share**:

```
Item's LC share = Total LC × (item_received_value / grand_total_received_value)
```

### Example

Total LC = **11,000 QAR**

| Item | Qty Received | Unit Cost | Received Value | % Share | LC Allocated |
|------|-------------|-----------|----------------|---------|-------------|
| A    | 10          | 200       | 2,000          | 20.3%   | 2,232.11    |
| B    | 5           | 1,000     | 5,000          | 50.8%   | 5,580.28    |
| C    | 15          | 190.33    | 2,855          | 29.0%   | 3,187.61    |
| **Total** |        |           | **9,855**      | **100%**| **11,000**  |

---

## 2. The "Late LC" Rule — Remaining Qty Only

LC often arrives 2–3 months after receival. Some units are already sold. The system allocates over **remaining stock only**, not original quantity.

### Example

Item A received 10 units, 3 already sold → 7 remaining

```
Item A's LC share = 2,232.11 QAR
LC per unit = 2,232.11 / 7 remaining = 318.87 QAR per unit
```

The 3 sold units' COGS is already frozen — they don't absorb any LC. The remaining 7 units each get a higher per-unit LC as a result.

---

## 3. How It Hits FIFO Layers

When applied, every FIFO layer with `remaining_qty > 0` gets updated:

```sql
landed_cost_per_unit += lc_per_unit
total_unit_cost      += lc_per_unit   -- (unit_cost + landed_cost_per_unit)
```

Then `recalc_average_cost()` runs → new weighted average including LC.

---

## 4. Multi-Currency Support

Each cost line can be in a different currency (USD, EUR, GBP, AED, SAR, KWD). Everything is converted to QAR before allocation:

```
total_amount = SUM(line.amount × line.exchange_rate)
```

---

## 5. Post-Apply: Price Review

After allocation, a **Price Review dialog** auto-opens showing:

- New avg cost per item (post-LC)
- User picks per item: **markup-based** (new_price = avg_cost × (1 + markup%)) or **fixed** (keep current price)
- Batch updates all selling prices in one transaction

---

## 6. Safe Revert (Delta-Based)

If multiple LCs hit the same FIFO layers, reverting LC #1 must not corrupt LC #2. The system stores a **delta snapshot** per LC — on revert it subtracts only that LC's delta, leaving other LCs intact.

Reversals insert negative stock movements (never deletes — audit trail preserved).

---

## 7. All-Items-Sold Scenario

If all units are sold before LC is applied:

- `all_items_sold = true`
- No FIFO updates, no avg_cost change
- LC becomes a pure bookkeeping/expense entry

---

## 8. Lifecycle

```
Created (draft) → Applied (allocate to FIFO) → Price Review
                → Voided (mistake, only if not applied)
Applied         → Reverted (delta subtracted, back to draft)
```

---

## 9. Avg Cost Recalculation (How It Works With LC)

The `recalc_average_cost()` RPC calculates:

```
avg_cost = SUM(remaining_qty × total_unit_cost) / SUM(remaining_qty)
```

Where `total_unit_cost = unit_cost + landed_cost_per_unit`.

Free/zero-cost layers are excluded so margins aren't distorted.

### Full Example With Two Receivals + Sale + LC

**Receival 1:** 10 units at 500 QAR each
**Receival 2:** 12 units at 1,200 QAR each
**Sale:** 3 units sold (FIFO — oldest first, from Receival 1)

#### After Receival 1

| FIFO Layer | Remaining | Unit Cost | Total Unit Cost |
|-----------|-----------|-----------|-----------------|
| Layer 1   | 10        | 500       | 500             |

```
avg_cost = (10 × 500) / 10 = 500.00
```

#### After Receival 2

| FIFO Layer | Remaining | Unit Cost | Total Unit Cost |
|-----------|-----------|-----------|-----------------|
| Layer 1   | 10        | 500       | 500             |
| Layer 2   | 12        | 1,200     | 1,200           |

```
avg_cost = (10 × 500 + 12 × 1,200) / (10 + 12) = 19,400 / 22 = 881.82
```

#### After Selling 3 Units (FIFO — oldest first)

| FIFO Layer | Remaining | Unit Cost | Total Unit Cost |
|-----------|-----------|-----------|-----------------|
| Layer 1   | 7         | 500       | 500             |
| Layer 2   | 12        | 1,200     | 1,200           |

```
avg_cost = (7 × 500 + 12 × 1,200) / (7 + 12) = 17,900 / 19 = 942.11
```

Avg cost went UP because the 3 cheap units were sold first.

#### After Applying LC of 5,000 QAR (19 remaining units)

```
LC per unit = 5,000 / 19 = 263.16 QAR
```

| FIFO Layer | Remaining | Unit Cost | LC / Unit | Total Unit Cost |
|-----------|-----------|-----------|-----------|-----------------|
| Layer 1   | 7         | 500       | 263.16    | 763.16          |
| Layer 2   | 12        | 1,200     | 263.16    | 1,463.16        |

```
avg_cost = (7 × 763.16 + 12 × 1,463.16) / (7 + 12)
         = (5,342.12 + 17,557.92) / 19
         = 22,900.04 / 19
         = 1,205.26
```

---

## 10. Key Database Objects

| Object | Purpose |
|--------|---------|
| `landed_costs` table | Stores LC records with lines, attached receivals, allocations |
| `fifo_cost_layers` table | Per-receival cost layers with `landed_cost_per_unit` |
| `allocate_landed_cost` RPC | Applies LC to FIFO layers, records snapshot |
| `revert_landed_cost` RPC | Reverses LC using delta snapshot |
| `recalc_average_cost` RPC | Weighted average from remaining FIFO layers |
| `validate_lc_allocation` RPC | Pre-flight check before apply |
| `batch_update_variant_prices` RPC | Post-apply selling price updates |
| `cogs_entries` table | Records cost of sold units for COGS tracking |

---

## 11. Key Business Rules

1. **Allocation Method:** By received value weight (proportional), NOT quantity or weight
2. **Late LC:** Allocated over remaining qty only, not original qty received
3. **All-Sold:** LC becomes expense entry; no inventory impact
4. **Multi-Currency:** All costs converted to QAR before allocation
5. **Revert Safety:** Delta-based snapshot ensures multiple LCs don't conflict
6. **Audit Trail:** Reversals insert new negative movements, never delete
7. **Price Review:** Auto-prompted post-apply; user decides markup vs. fixed per item
8. **Float Precision:** All calculations use NUMERIC type (not float) to avoid rounding
9. **Lock after PO:** Avg cost field locks after first receival — fully system-managed
10. **Free items excluded:** Zero-cost layers don't affect avg cost calculation
