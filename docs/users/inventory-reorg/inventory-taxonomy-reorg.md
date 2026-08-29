# Inventory Taxonomy Reorg — Tracker

**Status:** ✅ **Pass 1 LOADED to new-prod (2026-08-15)** — `449 categories / 950 items / 1044 variants` from `Inventory_Corrected.xlsx`. Reload script is now durably kept at [`reload_inventory.py`](reload_inventory.py) (dry-run default; `--commit` = atomic wipe+reload, aborts if any stock movements exist, snapshots categories first). Remaining reorg passes (HVAC 4-bucket, Pest→Consumables, water-systems placement) still pending — apply to the file, then re-run the loader.

> **Load notes (2026-08-15):** Branches/Default-Container columns use full division **names** (not codes). Brands↔Origins pair positionally; 1-brand/N-origins → N variants; ambiguous N-brands/M-origins (13.6kg refrigerant, CTO cartridge) keep all brands with best-effort origins. `Scotland`→United Kingdom, `USA/UK/UAE`→full names. Mixed-type split branches (e.g. consumables `Refrigerant` with spare-parts children) load correctly — parents resolve by **path**, not by the child's type.

---

## Resume in 30 seconds
- We're reorganizing the **new-prod** inventory taxonomy based on testing-team feedback.
- new-prod inventory is **empty of items** (447-category tree only). The working source of truth is the Excel **`D:\ERP\Inventory Works\Inventory_Corrected.xlsx`** (950 items, sheets: `Items`, `Categories`).
- **Pass 1 (7 category changes) is DONE in that file. Nothing is live yet.**
- To finish: settle the pending decisions → apply to the file → reload the file into new-prod.

## Key locations
| What | Path |
|---|---|
| Corrected catalog (working source) | `D:\ERP\Inventory Works\Inventory_Corrected.xlsx` |
| Transform script (copy kept here) | `docs/inventory-reorg/reorg_apply.py` |
| Latest file backup | session scratchpad `source_backup/Inventory_Corrected.20260814_204243.bak.xlsx` *(ephemeral — the durable copy is the Excel itself)* |
| Pre-clear item snapshot (restore items) | session scratchpad `snapshot_pre_clearitems_20260814_181829.json` |
| new-prod DB | project `optishfnnctrhffpoywg`; conn `NEW_DB_URL` in `D:\MMS\supabase\.temp\migrate.env` |
| Long-form context/history | `~/.claude/projects/D--MMS/memory/project_inventory_data_quality.md` |

## How the tabs work (important constraints)
- The 4 tabs = `inventory_categories.type` → `products` / `spare-parts` / `consumables` / `tools`.
- **The app cannot move a category between tabs** (Type is fixed at creation — `CategoryEditDialog` disables it). Cross-tab moves must go via **file + reload** (or a direct DB update).
- **Consumption is stock-driven, not type-driven** — any item with stock can be consumed regardless of tab. There is **no per-item "consumable" flag**; the tab is the only classification (drives stock-value reports + PO/SO line grouping).

---

## ✅ Applied — Pass 1 (in the file; DB untouched)
1. **Home Automation** (whole KNX/Buspro subtree) → **Products**. Fixes the old spare-parts/products split.
2. **CCTV / Network / Door Intercom / Phone Intercom** → unchanged (top-level Products, **no ELV parent** — owner: "no combing").
3. **Pump Control**: `Pressure Switch > Pump Control` → `Plumbing > Pressure Switch > Pump Control`. HP/LP stay on the top-level `Pressure Switch` (pending HVAC).
4. Folded top-level **`Pressure Washers`** → `Cleaning Machines > Pressure Washer` (`> Accessories` under it). **AC Cleaning Machine kept as a sibling.**
5. Split **`Cleaning Supplies`** by durability:
   - Tools side **RENAMED `Cleaning Equipment`** → Air Freshener, Brooms & Brushes, Pads & Cloths, Wipers & Squeegees, + `Accessories` (Bucket / Funnel / Spray Bottle).
   - **New Consumables parent `Cleaning Supplies`** → Carpet & Stain Care, Chemicals, Garbage Bag, Table Roll.
6. **Safety & PPE** → Consumables.
7. Renamed the Bucket/Funnel/Spray Bottle wrapper `Consumables` → **`Accessories`** (under Cleaning Equipment).

**Verified:** 950 items intact — products 94 / spare-parts 614 / consumables 105 / tools 137. **0 new** parent/child type mismatches.

## ⏳ Parked — small, reversible (owner to decide)
- `Applicator` + `Bone Scraper` (durable) rode into Consumables at `Cleaning Supplies > Carpet & Stain Care > Tools` → **pull back to Tools?**
- `Air Freshener` stayed in Tools → **move to Consumables?**

## ⏸ Pending decisions
- **HVAC 4-bucket regroup of Spare Parts — NEEDS SHENIL.** Group the ~29 AC/refrigeration top-level cats under a new **`HVAC`** parent; leave **Plumbing / Electrical / Measuring Instruments** as siblings. `Pressure Switch` (HP/LP) → HVAC.
  - **Proposed HVAC members:** Anti-Vibration, Axial Fan, Bearing, Belt, Bracket, Brass Fittings, Chemicals & Lubricants, Compressor, Copper Fittings, Copper Pipe & Coil, Drainage Hose, Duct Material, Fan Blades & Blowers, Fan Motor, Filter Drier, Filter Strainer, Gauges, Insulation, Oil Separator, Pressure Switch, Refrigerant, Refrigeration Oil, Remote Controls & PCB, Sight Glass, Tapes, Thermostat, Valves, Ventilation, Welding & Brazing.
- **Pest Control → Consumables** (testing team asked; confirm).
- **Water systems placement:** Water Filter / Water Heater / Water Pump / Water Tank Cooler → Plumbing, a new **"Water Systems"** bucket, or HVAC?

## 🐞 Pre-existing split-branch issues (fold into the pending decisions)
- `Electrical > Lighting > LED Light > Strip` — typed `products` under a spare-parts branch.
- `Pest Control > Bed Bug` — typed `products`.
- **`Refrigerant` exists in BOTH tabs** — consumables (R22 / R410A / R422D / R467A) and spare-parts (R134A / R141B / R290 / R404A / R407C / R417A) → pick one tab.
- Water Filter / Heater / Pump / Tank-Cooler `Accessories` + leaves — mixed products/spare-parts/consumables.

---

## ▶️ How to finish (when un-parked)
1. Collect the pending decisions (HVAC from Shenil, Pest Control, Water systems, 2 parked items).
2. Extend the `route()` function in `reorg_apply.py` with the new rules → run to a **temp** file (`REORG_OUT=<temp> python reorg_apply.py`) → verify affected branches, per-tab counts, and **0 new mismatches**.
3. Close Excel → run with no `REORG_OUT` to write the canonical `Inventory_Corrected.xlsx` (always backs up first).
4. Reload into new-prod (empty DB): snapshot first, then the reload script; verify counts.

## Transform rules already encoded (Pass 1)
The `route(path, type)` function rewrites `Category Path` + `Type` on **both** sheets:
- under `Home Automation` → type `products`
- under `Safety & PPE` → type `consumables`
- under `Pressure Switch > Pump Control` → prefix `Plumbing > ` (stays `spare-parts`)
- `Pressure Washers[ > …]` → `Cleaning Machines > Pressure Washer[ > …]` (stays `tools`)
- under `Cleaning Supplies`:
  - `Cleaning Supplies` itself → `Cleaning Equipment` (`tools`)
  - `… > Carpet & Stain Care[ > …]` → type `consumables` (path kept)
  - `… > Chemicals[ > …]` → type `consumables` (path kept)
  - `… > Consumables > Garbage Bag[ > …]` / `… > Table Roll[ > …]` → `Cleaning Supplies > <leaf>` (`consumables`)
  - else → `Cleaning Equipment…` (`tools`); leftover `Cleaning Equipment > Consumables` wrapper → `Cleaning Equipment > Accessories`
- new category rows added: `Plumbing > Pressure Switch` (`spare-parts`), `Cleaning Supplies` (`consumables`)

## Decisions log
- **2026-08-14** — ELV parent rejected; keep CCTV/Network/Door Intercom/Phone Intercom as individual Products (owner).
- **2026-08-14** — Home Automation → Products (owner).
- **2026-08-14** — Pump Control → Plumbing (owner).
- **2026-08-14** — Bucket/Funnel/Spray Bottle = Tools; wrapper renamed "Accessories" (owner).
- **2026-08-14** — Cleaning Chemicals / Carpet & Stain Care / Safety & PPE / Garbage Bag / Table Roll → Consumables (owner, from testing-team notes).
