# Follow-up: Batch the inventory attribute-chip fetches (N+1)

> **Update 2026-08-10 — IMPLEMENTED (pending operator verification)** on branch
> `chore/overnight-backlog-2026-08-10` (commit `5acf68b4`, Option A). `CategoryRow`
> now loads its existing `useItemAttributesByCategory` map whenever expanded and
> feeds it to the chip strips via a new optional `ItemAttributesContext`;
> `AttributeChipStrip` reads the batch and only falls back to the per-item query when
> no provider is present (non-list callers unaffected). `tsc`+eslint clean. **Morning
> gate:** confirm in the Network panel that expanding a large category fires ONE
> `inventory_item_attributes` request for chips (not N) and chips render identically.
> Delete this doc once verified.

**Status:** Deferred (tracked, important) — its own task/branch
**Surfaced:** 2026-08-08 (inventory-tree pre-brands/origin audit)
**Priority:** High — performance + Supabase-quota cost (project has hit Free-plan
quota twice; see `docs/supabase-budget.md`)

---

## The problem

The inventory list renders an `AttributeChipStrip` for **every** item row
(`src/components/services/inventory/ItemRow.tsx:87`). Inside that strip,
`useItemAttributes(itemId)` in `src/components/shared/AttributeChipStrip.tsx:27`
fires **one query per item**. Expanding a category with 100 items =
**~100 round-trips** just to draw the little attribute chips.

`useEffectiveAttributes(categoryId)` already dedupes the *category-level* attribute
definitions across siblings, so the remaining N+1 is specifically the **per-item
attribute values** query.

This is not a correctness bug — the chips are right — it's a latency + quota drain
that scales linearly with catalog size.

---

## The fix (options)

**Option A — batch hook (recommended, smallest change).**
Add `useItemAttributesBatch(itemIds: string[])` that fetches all attribute values
for the currently-rendered item set in **one** `.in('item_id', ids)` query, keyed
by `item_id` into a map. `AttributeChipStrip` reads from a context/prop map instead
of firing its own query. One query per expanded category, not per item.

**Option B — server-side view/RPC.**
A view (e.g. `inventory_item_attribute_chips`) that returns pre-joined
`item_id → [ {label, value} ]` so the list hook selects chips alongside items in the
same round-trip. More work, but removes the second query entirely.

Recommendation: **Option A** first (localized, low risk); consider B only if the
list query itself becomes the bottleneck.

---

## Acceptance criteria

- [ ] Expanding a category with N items fires **one** attribute query, not N.
- [ ] Chips render identically to today (same labels/values/order).
- [ ] `.limit()` present on the batch query (Supabase-budget rule).
- [ ] Verified in the network panel: query count is flat as item count grows.

## Notes / dependencies

- Independent of the brands/origin feature — can ship before or after.
- Touches `AttributeChipStrip` (shared) — check other consumers before changing its
  data-fetching contract; prefer making the batch map optional so non-list callers
  keep working.
