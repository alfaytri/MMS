# Origin-aware PO & SO pickers — Execution State (resume after /clear)

**Purpose:** durable state so context can be `/clear`ed and the task resumed. Read
THIS first, then the Phase 1 spec. Authoritative — do NOT re-derive what's here.

**Last updated:** 2026-08-09

---

## Where we are RIGHT NOW

- **Task:** Origin-aware PO & SO pickers (make PO/SO line pickers resolve item → brand → origin to one priced/stocked leaf). Follow-up to the shipped Inventory Brands & Origin feature.
- **Phase model:** TWO phases, **PO slice first** (Phase 1), SO slice second (Phase 2).
- **Stage:** Brainstorming DONE + **Phase 1 design approved by user**. Spec WRITTEN. Implementation NOT started.
- **Next step:** user reviews the Phase 1 spec → invoke `superpowers:writing-plans` to create the Phase 1 plan → execute via `superpowers:subagent-driven-development`.

## Branch & git state

- **Working branch:** `feature/inventory-origin-po-so-pickers` (created off `deploy/warehouse-shipping` @ `d17fa503`). These docs are the first commit on it.
- **`deploy/warehouse-shipping` @ d17fa503** = merge commit that integrated BOTH the Inventory Brands & Origin feature AND the Inventory Permissions Cleanup. **NOT pushed to origin** (user chose "don't push yet"; deploy is 34 commits ahead of origin). Do not push without asking.
- Prior completed branches (kept, not deleted): `feature/inventory-brands-and-origin` (final `b5afd24d`), `feature/inventory-permissions-cleanup` (final `db7bd43f`). Both are ancestors of the deploy merge.

## Locked scope decisions (user, 2026-08-09)

1. **Two phases — PO first.**
2. **Manual origin pick** — operator chooses origin on the line (no auto-select).
3. **Quotations lock origin + price at quote time** (Phase 2).
4. **Delivery/invoice PDFs show origin per line** (Phase 2).

## Phase 1 (PO) — what to build

Full design: [`phase-1-po-picker-design.md`](phase-1-po-picker-design.md). Summary:

- **Key finding:** the PO pickers ALREADY resolve to a specific `brand_variant_id` and default cost from that leaf (`CascadeInventorySelector.handleVariantSelect`, `InventoryItemLookup`). PO lines already store the exact variant, and receival books FIFO against `po_line_items.brand_variant_id`. So Phase 1 is mostly a **display/selection** change, not a money-path rewrite.
- **Recommended approach:** show origin (country name) in the existing "Brand / Variant" popover rows (Brand · Origin · code · avail), grouped by brand; the `country_codes(name)` join already exists on `useInventoryBrandVariants`.
- **Components:** `CascadeInventorySelector.tsx` (show origin), `InventoryItemLookup.tsx` (origin in search rows + select the join), `CascadeInlineForms.tsx` (inline add must carry `brand_id`+`country_id` — reuse `BrandCombobox`/`OriginCombobox`), `PoReceiveTab.tsx` (verify receives against the line's `brand_variant_id`).
- **No DB migration expected** (data + display only).
- **Acceptance criteria + testing:** in the spec. ⏸ operator smoke on branded+origin / origin-only / generic items (needs a human login — agent can't do it).

## Phase 2 (SO) — deferred, not yet specced

SO/quotation line picker (same brand→origin resolution), **selling price flows from the origin leaf**, quotations lock at quote, origin on delivery/invoice PDFs. Surfaces per the tracker: `SoLineItemsEditor.tsx`, shared `InventoryItemLookup`, quotation line editor, PDF generators. Write a Phase 2 spec after Phase 1 ships.

## Standing rules (project)

- Migrations STAGING only + byte-identical mirror to `supabase/migrations-staging/`; apply via `npx supabase db push`; live-DB checks via `npx supabase db query --linked -o csv "SQL"`.
- Every commit ends with BOTH trailers via HEREDOC: `Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>` + `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- Commit code tasks when their review passes; **UI tasks with ⏸ OPERATOR SMOKE commit only after the user confirms "works".**
- Browser testing allowed (dev server on :3000; user logs in — agent cannot type passwords).
- Do NOT push any branch without explicit user approval.
- Session-start skills (AGENTS.md): task-observer; impeccable for UI work. Graphify the codebase for architecture questions.
- Spec location convention = `docs/specs/` or a task folder like this one; plan location = `docs/plans/`.

## Reference files

- Parent tracker (all PO+SO scope + open questions): [`../inventory-brands-origin-po-so-followup.md`](../inventory-brands-origin-po-so-followup.md)
- Catalog feature spec (dependency): `docs/specs/2026-08-08-inventory-brands-origin-design.md`
- Catalog UI to reuse: `src/components/services/inventory/BrandCombobox.tsx`, `OriginCombobox.tsx`
- Variant hook with the origin join: `useInventoryBrandVariants` in `src/hooks/useInventory.ts`
