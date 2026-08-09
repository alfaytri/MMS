# Origin-aware PO & SO pickers — Execution State (resume after /clear)

**Purpose:** durable state so context can be `/clear`ed and the task resumed. Read
THIS first, then the Phase 1 spec. Authoritative — do NOT re-derive what's here.

**Last updated:** 2026-08-09

---

## Where we are RIGHT NOW

- **Task:** Origin-aware PO & SO pickers (make PO/SO line pickers resolve item → brand → origin to one priced/stocked leaf). Follow-up to the shipped Inventory Brands & Origin feature.
- **Phase model:** TWO phases, **PO slice first** (Phase 1), SO slice second (Phase 2).
- **Stage:** Phase 1 **CODE-COMPLETE + committed via subagent-driven-development** (all 5 tasks + whole-feature review fixes). Breadcrumb-origin: KEPT (user chose). `tsc` clean; `variantPickerLabel` 7/7 vitest; eslint 0/0; whole-feature review (opus) READY-WITH-FIXES → fixes applied.
- **Commits (on `feature/inventory-origin-po-so-pickers`):** plan `311a8ca7`; T1 `3be4e850`; T2 `7dd7acd1`; T3 `92a5bad1`; T4 `29a63352`; review fixes `aa977a76`; docs `da37aaca`+`41135c2f`. Ledger: `.superpowers/sdd/progress.md`.
- **What shipped:** origin in the PO cascade popover rows (pooled+non-pooled) + breadcrumb (`variantPickerLabel` helper, `BrandVariantWithJoins` type, `country_codes(name)` on the ancestry hook); inline add-variant form → `BrandCombobox`+`OriginCombobox` (brand_id+country_id); brand·origin in the (unused) `InventoryItemLookup`; T5 verified live that `create_and_approve_receival` books FIFO on the chosen `brand_variant_id`.
- **Next step (needs a human):** OPERATOR SMOKE then merge/keep decision. Smoke checklist: (T2) picker rows read brand→origin→code→avail, cost still defaults per leaf, origin-only + generic items selectable with no dead-end, no row-height shift, breadcrumb shows origin; (T3) inline form brand+origin comboboxes, brand-only/origin-only create both work, Save disabled until brand OR origin chosen, **Enter while a combobox is open must NOT submit the form** and Escape closes only the combobox; (T5) receive a branded+origin PO line → FIFO layer lands on that exact leaf, sibling origins untouched. On pass → `superpowers:finishing-a-development-branch` (user picks merge/PR/keep; branch is NOT pushed).
- **Deferred follow-up (chip spawned):** remove dead `useAllBrandNames` (its only consumer was the old free-text inline form); optionally tighten `useInventoryBrandVariants` return type to `BrandVariantWithJoins[]`.
- **Phase 2 (STARTED 2026-08-09 — brainstormed):** SO/quotation origin work. Key findings: the SO picker ALREADY shows origin (Phase 1 Task 2 combined-list applies to all callers) AND availability, and origin-based selling price ALREADY works (`handleInventorySelect` sets `unit_price = item.selling_price` from the resolved leaf; each leaf has its own selling_price). So those two "headline" items are effectively done.
  - **Decision:** KEEP the SO picker as the combined list (NOT the cascade) — it shows origin + per-division avail together, which selling needs. No SO picker change.
  - **Remaining Phase 2 work, in this order:** (1) origin (country) on delivery-note + invoice PDFs; (2) quotation locks origin + selling price at quote time (freeze so later catalog/price edits don't move a quoted number) — money-path, map the quotation flow first; (3) Brand·Origin in SO detail + quotation line summaries (mirror the PO detail/receival displays).
  - Prior locked decisions still hold: manual origin pick; quotations lock origin+price at quote; PDFs show origin per line.

- **SECURITY (separate workstream, done this session):** PO approval authz hardened — RPC now uses auth.uid()+role checks (commit 589bf3de), and a status-transition guard trigger blocks the direct `purchase_orders.status='approved'` bypass (commit 49d15dce, live-verified). Finding A (po_approvals INSERT/DELETE → needs server-side chain RPC) + the broad `division_scope_*` field-level authz are folded into a deliberate redesign (chips task_2b0dcdf4 / task_6ce10551; memory `project_po_approval_security`).

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
