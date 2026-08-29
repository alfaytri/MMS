# Reorder Point — Design & Implementation Plan

> Status: **PLAN FINALIZED 2026-08-29** (not built). All decisions resolved (§8).
> Waiting on the operator's current reorder Excel to seed initial rates (§10).

## 1. Goal

Automatically tell Purchase & Accounting when an item has run low enough that a
new order must be placed now to avoid a stock-out, accounting for how long
resupply takes.

**Formula** (from the operator's Heater example):

```
reorder_point = ceil( (lead_time_days / 30) × effective_monthly_usage × (1 + safety_margin%) )
```

Heater worked example: `(90/30) × 30 × (1 + 0.25) = 3 × 30 × 1.25 = 112.5 → 113`.
When available qty ≤ 113 → alert.

## 2. Locked decisions (operator, 2026-08-29)

1. **Level = per item.** Lead time, usage, margin, and the reorder point are all
   item-level (matches the operator's Excel + mental model: "Heater", not
   "Heater brand-X"). Available qty = the sum of the item's variants.
2. **Lead time = per item** (each item stores its own shipping days).
3. **Reorder point = auto-computed & stored**, refreshed daily.
4. **Trigger quantity = company-wide available** = Σ over the item's variants of
   `(stock_level − reserved_qty)` (total on hand across all warehouses, minus
   reserved) — the example's single "Available Qty 138".
5. **Usage window = last 3 months** of actual outflow.
6. **"Usage" = deliveries + consumption** (all real outflow), since spare parts
   leave a maintenance business via consumption, not only sales.
7. **Seed rate is a FLOOR** (see §4 + §6): `effective_monthly_usage = max(the
   Excel fixed rate, the computed 3-month rate)`. Starts from the Excel value on
   day one; rises automatically when real demand exceeds it.
8. **Re-alert = once per dip** (re-arm only after the item recovers above the
   point), not a daily nag.
9. **Rounding = ceil** (112.5 → 113). **Per-warehouse = deferred** (keep the
   `warehouse_reorder_points` table for a later phase, unused for now).

## 3. What already exists (reuse, don't rebuild)

- `inventory_item_brand_variants.reorder_point` (int) + `reserved_qty` +
  `stock_level` — the pieces behind "available vs. point".
- **Amber "low stock" badge** already lights when `available ≤ reorder_point`
  (ItemRow / pickers) — lights up for free once we compute the item point.
- `warehouse_reorder_points` (+ `last_notified_at`) — a per-warehouse variant
  prepped for notifications but never wired; parked for a future per-warehouse phase.
- **Notification infra** — role-routed alerts via `recipients_for_permission(key)`
  + the daily cron `/api/cron/notifications` (shipped 2026-08-26). We extend this.

## 4. The initial-data problem (why the seed matters)

The app has just been seeded with opening stock and has **almost no sales
history**, so a rate computed only from history would be ~0 → no useful reorder
points at launch. Conversely the operator's current **Excel uses a fixed rate per
item** that can't rise when demand spikes.

**Solution — seed + floor:**
- Store the Excel's fixed rate as **`expected_monthly_usage`** per item.
- The effective rate the formula uses is **`max(expected_monthly_usage, computed
  3-month rate)`**. Day 1: computed = 0 → uses the Excel rate. As real sales
  accumulate: if actual > the Excel rate, the point rises automatically (fixes the
  Excel cap); it never drops below the known baseline (safe from stock-out).
- The operator can lower/clear `expected_monthly_usage` later once they trust the
  live data, to let it be purely demand-driven.

## 5. Data model changes

**`inventory_items`** (item-level inputs + computed outputs):
- `lead_time_days` int NULL — shipping/resupply time. NULL = not configured → item
  is skipped (no point, no alert) until set.
- `safety_margin_pct` numeric NULL — per-item override; NULL → global default.
- `expected_monthly_usage` numeric NULL — the seed floor (from the Excel).
- `reorder_point` int NULL — **computed output** (what the alert + report + badges
  read).
- `effective_monthly_usage` numeric NULL — the rate used (for transparency in the
  report: shows whether the Excel floor or live demand won).
- `reorder_computed_at` timestamptz NULL — last recompute.
- `reorder_last_notified_at` timestamptz NULL — alert throttle (company-wide, so
  it lives on the item).

**`app_settings`** (global defaults):
- `reorder_default_safety_margin_pct` numeric, default `25`.
- `reorder_usage_window_months` int, default `3`.

*(The existing per-variant `reorder_point` field: the amber badges will be
repointed to read the item-level point in P2; the per-variant field is left in
place, unused, to avoid churn.)*

## 6. The daily calculation + alert job

One daily server job — a SECURITY DEFINER RPC the cron calls (extend
`/api/cron/notifications` or a sibling on the same schedule), in one pass:

**A. Recompute** for every item with `lead_time_days` set:
1. `computed = (Σ outflow qty over last 3 months) / 3`, where outflow =
   delivered qty (`sale_delivery_lines`) + consumed qty (`consumption_lines`) for
   the item's variants.
2. `effective_monthly_usage = max(COALESCE(expected_monthly_usage,0), computed)`.
3. `reorder_point = ceil( (lead_time_days/30) × effective_monthly_usage ×
   (1 + COALESCE(safety_margin_pct, global_default)/100) )`.
4. Store `reorder_point`, `effective_monthly_usage`, `reorder_computed_at`.

**B. Alert** in the same pass:
- Items where `reorder_point > 0` AND `available (Σ stock_level − reserved_qty) ≤
  reorder_point`.
- Notify **Purchase + Accounting** (routing §8-Q3), best-effort, one line each:
  "Heater — reorder point 113, available 108. Reorder now."
- **Throttle:** set `reorder_last_notified_at` on alert; clear it when the item
  recovers above the point → fires once per dip.

## 7. UI / surfaces

- **Item edit dialog** — add **Lead time (days)**, **Safety margin %** (blank =
  default), **Expected monthly usage** inputs; show the **auto reorder point
  read-only** with the breakdown ("113 = 3 mo × 30/mo × 1.25; rate = max(Excel 30,
  live 24)").
- **Admin → settings** — global default safety margin + usage window.
- **Reorder Report** (Reports menu, or a Dead-Stock tab) — item, available, expected
  vs. live usage, effective usage, lead time, margin, reorder point, status
  (OK / **REORDER**), suggested order qty *(P4)*; filter by division + "needs
  reorder"; Excel export. This is the requested summary.
- **Amber badges** — repointed to the item-level point (P2).
- *(Optional, P4)* Dashboard card "Items to reorder: N".

## 8. Resolved decisions

- **Q1 Window:** 3 months. ✅
- **Q2 Usage:** deliveries + consumption. ✅
- **Q3 Alert recipients:** route by permission — Purchase = roles with
  `purchase.orders.create`; Accounting = roles with a finance permission
  (confirm the exact key during build, likely `reports.payables.view`); add a
  `notify.reorder_point` on/off toggle in the role editor. ✅ *(confirm keys at build)*
- **Q4 Cadence:** once per dip. ✅
- **Q5 Suggested order qty:** yes, as **P4** — target = bring available up to
  "reorder point + one lead-time of cover"; not in P1. ✅
- **Q6 Bulk lead times / rates:** via the operator's Excel (§10). ✅
- **Q7 Rounding:** ceil. ✅
- **Q8 Per-warehouse:** deferred. ✅
- **Initial seed:** Excel fixed rate → `expected_monthly_usage` as a floor. ✅

## 9. Phasing

- **P1 — Inputs + calculation + seed:** migrations (item fields + global defaults);
  the compute RPC; item-dialog inputs; **import the operator's Excel** to seed
  `expected_monthly_usage` + `lead_time_days` (+ margin) per item. *Outcome:*
  reorder points populate from the Excel floor immediately; amber badges light.
- **P2 — Report + badges:** the Reorder Report + Excel export; repoint the amber
  badges to the item-level point.
- **P3 — Alerts:** the notify step in the daily job + the `notify.reorder_point`
  role toggle + throttle.
- **P4 (optional):** suggested order qty, Dashboard card, per-warehouse.

## 10. Initial data (needed from operator)

Send the **current reorder Excel**. Expected columns to map per item:
- item identifier (name / code) → matched to the catalog,
- fixed/expected monthly sales rate → `expected_monthly_usage`,
- shipping/lead time (days) → `lead_time_days`,
- safety margin, if it varies per item → `safety_margin_pct` (else the 25% default).

Loaded via a one-off seed script (match by name/code, same approach as the
opening-stock seed), dry-run → verify → commit.

## 11. Risks / notes

- **Zero-history + no seed = no point.** With the Excel seed this is avoided; items
  with neither a seed nor history simply don't alert (safe).
- **Stale lead times** → wrong points; blank lead time is safely skipped.
- **Floor can overstock** if real demand settles below the Excel guess — the
  operator lowers `expected_monthly_usage` when they trust the live rate.
- **No pricing guard** — the job writes reorder/usage fields, not cost/price; runs
  as a SECURITY DEFINER RPC.
- **Quota:** one extra daily pass over items; negligible (aligns with the existing
  daily cron; see `docs/supabase-budget.md`).
