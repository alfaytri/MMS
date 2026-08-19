# 03 · Operations

Top nav: **Operations** — dropdown gated by `operations.access`.
This is the **cost-gate focus** section (operator, 2026-08-19).

Legend: **View** = open + see non-financial content · **Manage** = create/act ·
**Show costs** = see QAR money on the surface. `— ` = not applicable.
`🆕` = proposed new key. `✅` = already exists and works. `⚠️` = exists but gap.

---

## Custody — `/warehouse/custody`
Route guard: `custody.view`. Per-warehouse visibility via dynamic
`custody.<warehouseId>.view` keys (the role editor pairs these itself).

| Node (page → tab) | View | Manage | Show costs | Notes |
|---|---|---|---|---|
| **Custody page** | `custody.view` | via the underlying flows (assign/return/consume RPCs) | 🆕 `custody.cost.view` | **Biggest gap: no cost gate today.** Team QAR totals + held-item values render for anyone with `custody.view`. |
| ↳ tab per custody warehouse (Kitchen / Maintenance / VAN / Projects) | `custody.<id>.view` (dynamic) | — | 🆕 `custody.cost.view` | Tabs are **data-driven** (one per custody warehouse), not static tabs. |
| ↳ "Show items" (held stock) | inherits | — | 🆕 `custody.cost.view` | Shows per-item `total_value` (QAR). |
| ↳ "Show tools (N)" (assigned tools) | inherits | — | — | Read-only; name + serial + Good/Fair condition badge. **No money** → no cost gate needed. |

**Money to hide when `custody.cost.view` is absent:** the per-card total value
(`QAR …`), the per-item value line in "Show items", and any value in the consume
dialog summary. Quantities, item names, teams, tools, and condition stay visible.

---

## Consumption — `/consumption`
Route guard: `consumption.view`.

| Node | View | Manage | Show costs | Notes |
|---|---|---|---|---|
| **Consumption page** | `consumption.view` | `consumption.create` (umbrella) · `consumption.create.custody` · `consumption.create.internal` · `consumption.cancel` | ✅ `consumption.cost.view` | **Reference implementation.** `canSeeCost` already hides unit cost / COGS / totals in the list, New dialog, and detail. |
| ↳ (in-dialog Service / Team toggle) | — | — | ✅ inherits | Not a permissioned tab; a mode switch. Page tabs were removed 2026-08-19 (one list + Type badge). |
| extra | `consumption.cross_division` | — | — | Book to a custody location in ANY division (financial oversight — Owner/Accountant). |

---

## Damaged Stock — `/warehouse/damaged-stock`
Route guard: any-of `damaged_stock.on_hand.view` / `damaged_stock.out_for_repair.view`.

| Node (page → tab) | View | Manage | Show costs | Notes |
|---|---|---|---|---|
| **Damaged Stock page** | (either tab key) | — | 🆕 `damaged_stock.cost.view` | Weighted unit cost currently shown to any tab viewer. |
| ↳ **On-hand** tab | `damaged_stock.on_hand.view` | `damaged_stock.on_hand.edit` (send-for-repair / write-off) | 🆕 `damaged_stock.cost.view` | Shows `weighted_unit_cost` + "Weighted Cost" card. Rows created by receival/return flows (no `.create`). |
| ↳ **Out for Repair** tab | `damaged_stock.out_for_repair.view` | `damaged_stock.out_for_repair.edit` (assign vendor / return) | 🆕 `damaged_stock.cost.view` | Also carries weighted cost. |

**Money to hide when `damaged_stock.cost.view` is absent:** the weighted-unit-cost
column + the "Weighted Cost" card. Quantities and dispositions stay visible.

---

## Tools & Assets — `/warehouse/tools-assets`
Route guard: `tools.assets.view`.

| Node (page → tab) | View | Manage | Show costs | Notes |
|---|---|---|---|---|
| **Tools & Assets hub** | `tools.assets.view` | `tools.assets.manage` | 🆕 `tools.assets.cost.view` | Minimal cost shown today; scrap → P&L is a downstream side-effect, not a display. Gate added for consistency + any future cost surface (e.g. scrap/repair value). |
| ↳ **Teams** tab | inherits | `tools.assets.manage` | 🆕 | Team → held tools (name/serial/condition). |
| ↳ **Repair** tab | inherits | `tools.assets.manage` | 🆕 | Awaiting-vendor + out-for-repair buckets. |
| ↳ **Checks** (Monthly Check) tab | inherits | `tools.assets.manage` | — | Good/Bad session; no money. |
| ↳ **History & Usage** tab | inherits | — | — | Timeline; no money. |

---

## (Not in the Operations dropdown, but operational) Transfer — `/warehouse/picture-transfer`
Covered in [05-transfer.md](05-transfer.md). **No money is shown anywhere** in the
picture flow → **no cost gate needed**; keep `warehouse.transfer.simple`.

---

## Proposed new keys for this section

Add under the matching `NAV_TREE` nodes (all are `*.cost.view`, mirroring
`consumption.cost.view`):

```
custody.cost.view          → under Operations ▸ Custody
damaged_stock.cost.view    → under Operations ▸ Damaged Stock
tools.assets.cost.view     → under Operations ▸ Tools & Assets
```

Wiring (phase 2 of the plan): a `const canSeeCost = useHasPermission('<key>')`
in each page, hiding every QAR surface. Custody is the priority (largest gap +
most day-to-day field use). Consumption is already done and is the copy source.
