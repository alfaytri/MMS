# Item → Division Assignment (rip out "Sharing") — Design

**Date:** 2026-08-15
**Status:** Approved (direction) — pending spec review before planning execution
**Owner:** Mohamed Ismail
**Author:** Claude (Opus 4.8)

---

## 1. Problem

The inventory model today says *"items don't belong to a division — ownership is derived from whoever physically holds stock, and a division can be granted **share** access to consume another division's stock without a transfer."* This has three concrete failures:

1. **"Shared" reads wrong.** A freshly-loaded catalog item (e.g. "3 Ton") has **zero stock**, so no division qualifies as an *Owner*; the importer wrote the item's division into `shared_with_division_ids`, so the Item dialog shows Maintenance as **"Shared"** — even though the operator thinks of it as simply *belonging to Maintenance*. The model has no concept of *"belongs to Maintenance"* other than "has stock" or "is shared."

2. **Shared consumption ≠ how the business works.** The operator wants **separate quantity pools per division** and **movement via transfer only** — not one division silently drawing down another division's stock.

3. **One column doing two jobs.** `inventory_items.shared_with_division_ids` is simultaneously (a) the *share-consume grant* and (b) the *only "which items does this division deal with" signal* that makes the PO picker work on a zero-stock catalog. So it can't simply be deleted.

## 2. Goals

- Replace *"ownership-derived-from-stock + shares"* with **explicit item→division assignment**.
- Keep **separate stock pools per division** (already true — stock lives in per-division `warehouse_sub_containers`).
- **Remove cross-division consumption.** A division consumes/sells only from its own pool; movement between divisions is **transfer-only** (existing transfer flow, unchanged).
- Support the **same physical item filed under a different category per division** (e.g. *Products* in Maintenance, *Spare-parts* in Trading) **without forking stock** — the "Option B" per-division category overlay.
- Do it as a **staged, zero-downtime cutover** — nothing breaks mid-flight.

## 3. Non-goals

- No change to the transfer engine itself (it already moves brand-variants between sub-containers, carrying FIFO cost).
- No change to how stock, cost layers, or valuation are keyed (single stock identity per brand-variant is preserved).
- **Tools stay single-type.** Tools are asset-tracked; an item must not be "a tool in one division, a product in another." The per-division category overlay is only for the interchangeable trio: **Products / Spare-parts / Consumables**.
- No new approval/permission surface — assignment management reuses the existing `inventory.catalog.manage` permission.

## 4. Blast-radius findings (verified against live schema)

Verified on staging (`db query --linked`) — the reason this is low-risk:

| Layer | Finding |
|---|---|
| **RLS** | `inventory_items` SELECT policy is `qual = true` — the catalog is **globally readable**; division scoping is **app-layer only**. **0** RLS policies reference `shared_with_division_ids`. |
| **Views** | **0** views reference it. |
| **Functions** | **Exactly one** — `rpc_item_divisions_by_stock` (STABLE SECURITY DEFINER, read-only). No write-path RPC (create SO, consumption, delivery) gates on shares. |
| **Column** | Exists on **only** `inventory_items` (`uuid[]`). No FK, no CHECK, no default. |
| **App consumers** | 6 files (below) + `database.types.ts`. |

**App consumers of `shared_with_division_ids`:**
- [src/hooks/useCascadeAccessibleItems.ts](../../../src/hooks/useCascadeAccessibleItems.ts) — picker membership **and** consume filter (`owned ∪ shared∩has_stock`).
- [src/hooks/useItemDivisionMembership.ts](../../../src/hooks/useItemDivisionMembership.ts) — `sharedWithMeIds` / `sharedByMeIds` chips.
- [src/hooks/useItemDivisionsByStock.ts](../../../src/hooks/useItemDivisionsByStock.ts) — inventory-list division filter (via the RPC).
- [src/hooks/useDeliveryLineItemShares.ts](../../../src/hooks/useDeliveryLineItemShares.ts) — widens the delivery sub-container picker to another division when every line is shared.
- [src/hooks/useInventoryImport.ts](../../../src/hooks/useInventoryImport.ts) — writes shares on import.
- [src/components/services/inventory/ItemEditDialog.tsx](../../../src/components/services/inventory/ItemEditDialog.tsx) — the "Access & Sharing" section.

## 5. The new model

### 5.1 One join table replaces both jobs

```
inventory_item_divisions
┌───────────┬──────────────┬──────────────────────────────────────────────┐
│ item_id   │ division_id  │ category_id  (how THIS division files it; NULL │
│           │              │              = use the item's canonical category)│
└───────────┴──────────────┴──────────────────────────────────────────────┘
PRIMARY KEY (item_id, division_id)
```

- **Row exists** → this division *deals with* this item → it appears in that division's PO picker, inventory list, and consume/sell pickers. **This is the membership signal** that replaces `shared_with_division_ids`.
- **`category_id`** → the per-division category overlay (Option B). `NULL` = fall back to `inventory_items.category_id`.
- The item **keeps** its single canonical `inventory_items.category_id` (the default, and the classification used for anything not division-aware).

### 5.2 Stock, pools, and transfers

- Stock stays **one identity per brand-variant**, held in per-division `warehouse_sub_containers` — unchanged.
- **No cross-division consumption.** A division's pickers show items where it has an assignment **and** (for the consume/sell side) where **it owns stock**. It cannot draw another division's stock.
- **Transfers are unchanged.** Moving 5 units Maintenance→Trading is the existing sub-container move (qty −5 / +5, FIFO layer travels). It's the **same variant** throughout. When Trading browses, those units appear **under Trading's category** for the item (via the overlay in §5.3) — not because a new "spare-parts" record was created, but because that's Trading's *lens* on the one item.

### 5.3 Per-division category overlay (Option B) — "where does a transfer land?"

The category is a **display lens**, not a second stock record:

- Maintenance's assignment row files the 3 Ton under a *Products* category; Trading's row files the **same** item under a *Spare-parts* category.
- Pickers, the inventory browse tree, and consumption/spend reports resolve an item's category **for the active division** as `assignment.category_id ?? item.category_id`.
- A transfer to Trading lands as the same item in Trading's pool; because Trading's overlay files it under *Spare-parts*, Trading **sees** it there. Maintenance keeps seeing its units under *Products*. No re-classification, no second SKU, no cost re-derivation.

## 6. Behavioral changes (explicit)

| Surface | Today | After |
|---|---|---|
| PO picker (buy) | items where division is in `shared_with_division_ids` | items where an **assignment** row exists |
| Consume/sell picker | `owned ∪ (shared ∩ has_stock)` | **owned only** (assigned **and** holds stock) |
| Delivery sub-container picker | widened to other divisions when all lines shared | **own division's sub-containers only** |
| Inventory list division filter | assignment(shares) ∪ stock | assignment(new table) ∪ stock |
| Item dialog | "Access & Sharing" (Owner/Shared) | **"Assigned divisions"** (+ per-division category in Phase 2) |
| Importer | writes `shared_with_division_ids` | writes `inventory_item_divisions` rows |

**Cutover note:** removing cross-division consumption is a real behavioral shift. On fresh new-prod nothing relies on share-selling yet; before the prod cutover we confirm no live SO/delivery depends on it.

## 7. Phasing

- **Phase 1 — Rip out sharing → explicit assignment (owned-only + transfer).** Adds the table (with `category_id` populated by backfill, but display still uses the canonical category), repoints all 7 readers, flips consume to owned-only, removes delivery widening, swaps the Item dialog to "Assigned divisions", drops the column last. **Delivers the core value.**
- **Phase 2 — Per-division category overlay (Option B).** Makes the pickers/tree/reports resolve category per active division via `assignment.category_id`, and adds a per-division category picker to the Item dialog. Ships independently on top of Phase 1.

## 8. Migration & cutover strategy (safe order)

1. **Add** `inventory_item_divisions` (+ RLS + indexes) and **backfill** from `shared_with_division_ids` (`category_id` = item's current category).
2. **Rewrite** `rpc_item_divisions_by_stock` to read the new table (union with stock unchanged).
3. **Repoint** the app readers to the new table; flip consume-side to owned-only; remove the delivery-widening hook + its dialog usage.
4. **Swap** the Item dialog UI to "Assigned divisions" (writes the new table); importer writes the new table.
5. **Only after every reader is off the column:** drop `inventory_items.shared_with_division_ids` and regen `database.types.ts`.
6. **Phase 2** on top: category overlay in tree/pickers/reports + dialog picker.

The column stays alive until step 5, so each intermediate state is fully working (dual-source is not needed because backfill makes the new table authoritative from step 1, and readers switch atomically per file).

## 9. Data model detail

```sql
create table public.inventory_item_divisions (
  item_id     uuid not null references public.inventory_items(id)     on delete cascade,
  division_id uuid not null references public.company_divisions(id)   on delete cascade,
  category_id uuid          references public.inventory_categories(id) on delete set null,
  created_at  timestamptz not null default now(),
  created_by  uuid          references public.user_data(id),
  primary key (item_id, division_id)
);
create index idx_iid_division on public.inventory_item_divisions(division_id);
create index idx_iid_category on public.inventory_item_divisions(category_id) where category_id is not null;
```

**RLS (mirrors `inventory_items`):**
- SELECT: `using (true)` — catalog metadata is globally readable; the app filters by active division.
- INSERT / UPDATE / DELETE: `_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage')`.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Picker/list goes empty after column drop | Backfill first (step 1); drop column **last** (step 5); verify every reader repointed. |
| Losing existing assignments | Backfill copies every `shared_with_division_ids` element into the table before anything is removed. |
| Cross-division consumption silently removed under a live flow | Pre-cutover check: no SO/delivery currently relies on share-selling; behavior change is documented and intentional. |
| Overlay makes tree/report grouping inconsistent (Phase 2) | Resolve category as `assignment.category_id ?? item.category_id` in a single shared helper; tools excluded. |
| RLS regression | None expected — 0 policies reference the column; new table gets its own mirror policies (verified). |

## 11. Defaults chosen (confirm during review)

- **Table name:** `inventory_item_divisions` (matches `inventory_item_brand_variants`).
- **Permission:** reuse `inventory.catalog.manage` (no new key).
- **Overlay scope:** Products / Spare-parts / Consumables only; **tools single-type**.
- **Backfill category:** the item's current `category_id` (so display is identical until an overlay is set in Phase 2).
- **Delivery:** own-division sub-containers only; the `soDivisionId === null` legacy fallback (show all active) is preserved.
