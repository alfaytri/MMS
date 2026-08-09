# Follow-up: Origin-aware PO & SO pickers

**Status:** Deferred (tracked, not started)
**Depends on:** `feature/inventory-brands-and-origin` (catalog + receivals) merged first
**Created:** 2026-08-08

---

## Why this exists

The `feature/inventory-brands-and-origin` branch adds **origin** as a priced/stocked
dimension of a brand-variant. After that ships, the catalog holds prices per
**(item + brand + origin)** leaf — but the Purchase Order and Sale Order line
editors still pick a variant *without* knowing about origin. Until they do,
origin-based pricing is only visible in the catalog, not usable when buying or
selling.

This file captures everything the PO/SO slice needs so it isn't lost. It is the
scope for a **separate branch** (`feature/inventory-origin-po-so-pickers` or
similar) once the catalog branch is merged.

---

## The pricing model (recap)

```
category (tree) → item → [brand?] → [origin?] → priced/stocked leaf
```

- The priced+stocked row is `inventory_item_brand_variants`, now carrying a
  nullable `brand_id` AND a nullable `country_id`.
- Every unique (item, brand, origin) combo is one leaf with its own cost,
  selling price, stock, and FIFO layers.
- Both dimensions are optional — an item may have brand-only variants,
  origin-only variants, both, or neither (generic).

The pickers must let the operator resolve down to **one leaf** and read that
leaf's price/cost.

---

## PO picker — what to change

**Surfaces:**
- `src/components/purchase/CascadeInventorySelector.tsx`
- `src/components/purchase/CascadeInlineForms.tsx` (inline add-brand path — must
  point at the `brands` master, not free-text)
- `src/components/purchase/PoLineItemsEditor.tsx`
- `src/components/purchase/InventoryItemLookup.tsx`

**Behaviour:**
1. After the operator picks item → brand (optional), show an **Origin** select
   sourced from the variant's available origins (or the full `country_codes`
   list if creating a new leaf).
2. Resolve the chosen (item, brand, origin) to a single variant; default the
   PO line's unit cost from that leaf's last cost / avg cost.
3. Handle the mixed cases: brand-only, origin-only, neither. The picker must not
   force an origin when the item has none.
4. PO-driven receivals (`PoReceiveTab`) must receive **against the chosen
   origin variant**, so FIFO layers land on the right leaf.

## SO picker — what to change

**Surfaces:**
- The SO line editor (find the sales equivalent of `PoLineItemsEditor`)
- `InventoryItemLookup` (shared) if used on the sales side
- Any quotation line editor that reuses the same selector

**Behaviour:**
1. Same item → brand → origin resolution as PO.
2. **Selling price flows from the origin-level leaf** — this is the whole point:
   different origin → different price.
3. Handle the mixed cases identically.
4. Confirm credit/'margin' approval flows still read the resolved leaf price.

## Cross-cutting

- **Permissions:** viewing prices in the picker needs no new permission; only
  editing catalog prices is gated (`inventory.pricing.manage`, added in the
  catalog branch).
- **Cache keys:** picker queries must invalidate/read the same variant keys the
  catalog branch establishes so a price edit shows up in the picker.
- **Dropdown UUID guard:** brand + origin selects must render names
  (`brands.name`, `country_codes.name`), never ids.
- **Layout stability:** adding the origin select must not shift the line-editor
  rows (reserve height / min-h).

---

## Acceptance criteria

- [ ] On a PO line, operator can pick item → brand → origin and the unit cost
      defaults from that leaf.
- [ ] On an SO line, the selling price reflects the chosen origin.
- [ ] Items with no brand / no origin still selectable without dead-end selects.
- [ ] PO receival lands FIFO on the correct (brand, origin) leaf.
- [ ] No raw UUIDs in any brand/origin dropdown.
- [ ] `tsc --noEmit` clean; operator smoke on one branded+origin item, one
      origin-only item, one generic item.

---

## Open questions to resolve when this branch starts

1. When an SO is for an item that has multiple origins, does the operator pick
   the origin, or does the system auto-pick cheapest/most-stock? (Assume manual
   pick until told otherwise.)
2. Should quotations lock the origin at quote time, or re-resolve price at SO
   conversion? (Likely lock at quote.)
3. Does the delivery/invoice PDF need to show origin per line?
