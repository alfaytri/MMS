# Reorder Point — Design & Implementation Plan

> Status: **PLAN v2, 2026-08-29** (not built). Rewritten after reviewing the
> operator's real reorder Excel (`D:\007\Ismail.xlsx`). One decision still open:
> the final seasonal-selection rule (§4) — deliberately deferred until real
> per-season data exists.

## 1. Goal + real formula

Tell Purchase & Accounting when an item is low enough to reorder now, given how
long resupply takes — and give them a **page that mirrors the current Excel plus a
live "upcoming (on-order) qty" column**.

**Formula (reverse-engineered from the Excel; checks out on Water Heater
3.68 × 28 × 1.3 ≈ 135):**

```
reorder_point = ceil( lead_time_months × peak_seasonal_rate × (1 + safety_margin) )
```

- `lead_time_months` = average PO→receival time (the Excel's "average po to
  receival months").
- `peak_seasonal_rate` = the **higher of the winter / summer monthly rates**
  (Excel behaviour; e.g. Rotary-2ton uses summer 17).
- `safety_margin` = per item (Excel = 0.30).

## 2. The operator's Excel (`Ismail.xlsx`, ~29 key items) → fields

| Excel column | Maps to |
|---|---|
| Products | matched to a catalog item |
| Local (Y/N) | `is_local` (imported = long lead / container) |
| Reorder Safety Margin (0.3) | `safety_margin_pct` seed |
| Up to date Stock Level | **replaced by live Available** |
| avg selling rate **winter**/month | `expected_winter_usage` seed |
| avg selling rate **summer**/month | `expected_summer_usage` seed |
| Container 20ft minimum QTY | `container_moq` (display now; order-qty later) |
| Reorder Point | **computed output** |
| average **po to receival months** | `lead_time_months` seed |

Only ~29 curated items are managed today; the feature covers those first and can
extend to more later.

## 3. Locked decisions

1. **Level = per item** (matches the Excel). Available = Σ over the item's variants
   of `(stock_level − reserved_qty)`, company-wide.
2. **Reorder point = auto-computed & stored**, refreshed daily.
3. **Lead time = auto from PO→receival history, Excel value as floor** →
   `effective_lead = max(seed, actual)`. Self-updating.
4. **Suggested order qty = deferred** (no order-qty column for now; keep the
   `container_moq` value for a later phase).
5. **Rounding = ceil; margin default = 25%** for non-Excel items (Excel items carry
   their own 0.30).
6. **Seed = floor everywhere:** `effective = max(Excel seed, live computed)` for
   each rate and the lead time — works day one on the Excel numbers, rises when
   real demand/lead time exceeds them.

## 4. Seasons — track + validate (final rule OPEN)

The operator's insight: the winter/summer split was a manual estimate; now we can
**measure it**. So:
- Classify each outflow by month into **winter (Nov–Mar) / summer (Apr–Oct)**
  [Qatar]; compute `actual_winter_rate` + `actual_summer_rate` from real
  deliveries + consumption.
- Store/display **seed vs. actual** for each season so the operator can see whether
  the seasonal assumption holds.
- **Interim reorder rule = peak:** `peak_rate = max(effective_winter,
  effective_summer)` where `effective_season = max(seed_season, actual_season)`.
  Safe (never under-stocks) and matches the current Excel.
- **OPEN:** once a few months of per-season data exist, the operator decides the
  final rule — keep peak, or switch to the *current/upcoming* season's rate. No
  code lock-in; it's one line in the compute function.

## 5. Data model changes

**`inventory_items`** (seeds + computed outputs, item-level):
- Seeds: `lead_time_months` numeric, `safety_margin_pct` numeric, `is_local` bool,
  `expected_winter_usage` numeric, `expected_summer_usage` numeric, `container_moq`
  numeric — all NULL-able (NULL lead time = item skipped until configured).
- Computed: `reorder_point` int, `effective_winter_usage`, `effective_summer_usage`,
  `effective_lead_months`, `reorder_computed_at` tstz, `reorder_last_notified_at` tstz.

**`app_settings`:** `reorder_default_safety_margin_pct` (25), season month
boundaries (winter start/end) for easy tuning.

*(Existing per-variant `reorder_point` field + amber badges: repointed to the
item-level value in P2; the per-variant field left in place, unused.)*

## 6. Daily calculation + alert job (one SECURITY DEFINER RPC, called by cron)

**A. Recompute** each item with a lead time (seed or computable):
1. `actual_lead = avg(receival_date − po_date)` in months over that item's
   received POs; `effective_lead = max(seed_lead, actual_lead)`.
2. `actual_winter/summer = (Σ outflow in that season's months over last N months)
   / (season months elapsed)`, outflow = `sale_delivery_lines` + `consumption_lines`
   for the item's variants; `effective_season = max(seed_season, actual_season)`.
3. `peak = max(effective_winter, effective_summer)`.
4. `reorder_point = ceil( effective_lead × peak × (1 + COALESCE(margin, default)) )`.
5. Store the computed fields.

**B. Alert:** items where `reorder_point > 0` AND `available (Σ stock_level −
reserved_qty) ≤ reorder_point` → notify **Purchase + Accounting** (routing §8),
once per dip (`reorder_last_notified_at`, cleared on recovery).

## 7. The Reorder page (Reports menu)

A table mirroring the Excel, **plus live columns**. Columns:

| Product | Local | Safety margin | **Available** (live) | **Upcoming** (on order) | Winter (seed / actual) | Summer (seed / actual) | Container MOQ | Lead time mo (seed / actual) | **Reorder point** | **Status** |

- **Available** = live company-wide (Σ stock_level − reserved).
- **Upcoming** = on-order qty not yet received = Σ over the item's variants of open
  PO `(ordered − received)` (or `inventory_item_brand_variants.incoming` if it
  already tracks this — verify at build). ← the column the operator asked for.
- **Status** = OK / **REORDER** (available ≤ reorder point); filter "needs reorder".
- **seed / actual** shown together for winter, summer, and lead time so the operator
  can validate the seasonal + lead-time assumptions against real data.
- Division filter + Excel export. Amber badges elsewhere reflect the same point.

## 8. Alert routing

Route by permission + a `notify.reorder_point` on/off toggle in the role editor:
Purchase = roles with `purchase.orders.create`; Accounting = roles with a finance
permission (confirm exact key at build, likely `reports.payables.view`).

## 9. Phasing

- **P1 — Data + calc + seed:** migrations (item fields + settings); the compute RPC
  (lead time from PO history, per-season rates, peak, effective=max(seed,live));
  **import `Ismail.xlsx`** to seed the ~29 items (after item-name → catalog mapping,
  §10). Item-dialog inputs for the seeds. *Outcome:* reorder points populate from
  the Excel floor immediately.
- **P2 — The page + badges:** the Reorder page (Excel-mirror + Available + Upcoming
  + Status + seed/actual) + Excel export; repoint amber badges to the item point.
- **P3 — Alerts:** the notify step + `notify.reorder_point` toggle + throttle.
- **P4 (later):** suggested order qty (round up to `container_moq`), finalize the
  seasonal rule from real data, Dashboard card, per-warehouse.

## 10. Seeding from `Ismail.xlsx` (needed for P1)

Item-name → catalog mapping is the one manual step: the Excel names
("Water Cooler (Piston) - 1.5 ton") don't all match catalog items 1:1. I'll:
1. Fuzzy-match each of the ~29 names to a catalog item; produce a review sheet of
   matches + any misses for the operator to confirm/correct.
2. On confirmation, seed `lead_time_months`, `safety_margin_pct`, `is_local`,
   `expected_winter_usage`, `expected_summer_usage`, `container_moq` per matched
   item (dry-run → verify → commit, same discipline as the opening-stock seed).

## 11. Risks / notes

- **Sparse history now** → per-season actuals ≈ 0 at launch; the Excel seeds carry
  it (peak of seed winter/summer). Correct by design.
- **Season boundaries** are configurable (app_settings) if Qatar's split differs.
- **Item mapping** is the main accuracy risk — hence the review-sheet step.
- **No pricing guard** (writes reorder/usage fields, not price); SECURITY DEFINER RPC.
- **Quota:** one daily pass over ~items; negligible (see `docs/supabase-budget.md`).
