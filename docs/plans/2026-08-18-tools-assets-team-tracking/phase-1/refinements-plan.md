# Tools & Assets — Phase 1 Refinements (post-smoke) Implementation Plan

> **Source:** operator staging smoke of Phase 1 (2026-08-18). Core assign / move / return / history flows PASSED ("all other are good"). This plan captures the follow-ups the operator raised, plus one deferred item. Read `../design.md` + `../issues.md` first.
>
> **Scope discipline:** these fold into the **still-unshipped** Phase 1 (commits `4f9b3e62..3c327d7d`, nothing pushed). They ride the SAME single new-prod apply + single push — no extra deploy. Commit locally only; **ask before pushing / before new-prod**.

**Approved design (chat, 2026-08-18):**
- **R1 — Dialog footer float (bug).** `AssignToolUnitDialog` + `MoveToolUnitDialog` use `DialogFooter className="sticky bottom-0 …"` over a nested double-scroll → the footer floats over the list mid-content. Fix = canonical three-row flex dialog.
- **R2 — Assign dialog tree.** Replace the flat unit list with a **category → item → unit** (3-level) collapsible tree, mirroring the Master-Data catalog. Keep the search box.
- **R3 — Teams tab grouping.** Group team cards by **division** with collapsible section headers (mirror the Custody page), already wired to the top division bar.
- **Deferred — Custody-page tools.** "Show tools (N)" collapsible on `/warehouse/custody` team cards → **ISSUE-10**, a follow-up AFTER this ships. Not built here.

**Decisions locked in chat:** division sections **default expanded**; the tree's grouping level is each item's **leaf category** (name + breadcrumb subtitle), not nested folders.

## Global constraints (unchanged from `plan.md`)

- Migrations → **staging** `mwvblpgbgxipvrevkeff` via `npx supabase db push`; **mirror** into `supabase/migrations-staging/`; new-prod via the guarded flow at ship time only.
- Live DB is the only authority — fetch live bodies / confirm columns before writing SQL; sweep for overloads; rolled-back probe before/after.
- Co-authorship trailer on every commit; commit only when it works; **one push per deploy, ask first**.
- UI: responsive 4 breakpoints; human-readable labels only; `min-h-*` on dynamic regions (layout stability); dialog standards (one scroll region, non-floating footer); 44px touch targets.
- Error surfacing: `toDbError` wrap (already in `useToolAssignments.ts`).
- `impeccable` drives the UI (product register). Don't run `next build`. Hand UI smoke to the operator.

---

## Task R1: Fix the floating dialog footer (bug)

**Files:** `src/components/warehouse/tools-assets/AssignToolUnitDialog.tsx`, `src/components/warehouse/tools-assets/MoveToolUnitDialog.tsx`

**Cause:** both footers are `sticky bottom-0 bg-background` while the body is `flex-1 min-h-0` wrapping an inner `max-h-[50vh] overflow-y-auto` list — two nested scrollers, so the sticky footer pins to the scroll viewport and floats over the list.

**Fix (both dialogs):**
- `DialogContent`: keep `flex flex-col`; **add `overflow-hidden`** so nothing spills past the rounded container. Base already gives `max-h-[90vh]`; mobile keeps `h-full`.
- Header: unchanged (base `DialogHeader` is already `flex-shrink-0`).
- Body: the **single** scroll region — `flex-1 min-h-0 overflow-y-auto`. Remove the inner list's own `max-h-[50vh] overflow-y-auto`; the body owns the scroll now.
- Footer: **drop `sticky bottom-0 bg-background`** — a normal `flex-shrink-0` row (base `DialogFooter` styling stands: `border-t bg-muted/50`, `-mx-4 -mb-4`).

- [ ] **Step 1** — Assign dialog: rework the content/body/footer per above.
- [ ] **Step 2** — Move dialog: same (its body is `flex-1 overflow-y-auto`; make footer non-sticky, add `overflow-hidden` to content).
- [ ] **Step 3** — `npx tsc --noEmit` + `eslint` on both files. Operator confirms the footer sits pinned at the bottom with the list scrolling above it (part of the R-smoke).

---

## Task R2: `get_assignable_tool_units` returns category + item (for the tree)

**Files:** `supabase/migrations/20260921000000_assignable_tool_units_tree.sql` (+ mirror `supabase/migrations-staging/`)

**Why:** the tree needs each unit's item + category. The live function returns flat `(unit_id, item_name, serial_number, brand, condition)` with no `item_id`/category. Signature (return-table) change ⇒ **DROP + CREATE** (Postgres can't `CREATE OR REPLACE` a changed return type). Params stay `(p_division_id uuid, p_search text DEFAULT NULL)`.

**Produces:** `get_assignable_tool_units(p_division_id uuid, p_search text DEFAULT NULL)` →
`(unit_id uuid, item_id uuid, item_name text, category_id uuid, category_name text, serial_number text, brand text, condition text)`.
Join `inventory_items.category_id → inventory_categories.name_en` (both confirmed live). Preserve: `division_id = p_division_id OR division_id IS NULL` (ISSUE-9), `status <> 'retired'`, no open assignment, optional `p_search`, `ORDER BY i.name_en, u.serial_number`, `LIMIT 200`. Re-`REVOKE ALL … FROM public` + `GRANT EXECUTE … TO authenticated, service_role`.

- [ ] **Step 1: Sweep overloads** — `npx supabase db query --linked "SELECT oid::regprocedure FROM pg_proc WHERE proname='get_assignable_tool_units';"` — confirm exactly one, the `(uuid, text)` overload. DROP targets that exact signature.
- [ ] **Step 2: Confirm columns** — `inventory_items.category_id` + `inventory_categories.name_en` exist (verified 2026-08-18; re-confirm inline). Also confirm `inventory_categories` PK is `id`.
- [ ] **Step 3: Write the migration** — `BEGIN; DROP FUNCTION IF EXISTS public.get_assignable_tool_units(uuid,text); CREATE FUNCTION … ; REVOKE/GRANT; COMMIT;` (LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public).
- [ ] **Step 4: Apply to staging** — `npx supabase db push` (no errors).
- [ ] **Step 5: Smoke + shape probe** — `SELECT unit_id, item_name, category_name, serial_number FROM public.get_assignable_tool_units((SELECT division_id FROM public.company_divisions LIMIT 1), NULL) LIMIT 3;` returns the new columns; and a NULL-division unit still appears (ISSUE-9). Confirm grants exclude anon: `SELECT proacl FROM pg_proc WHERE proname='get_assignable_tool_units';`.
- [ ] **Step 6: Mirror + commit** — `feat(db): get_assignable_tool_units returns item+category for the assign tree`.

---

## Task R3: Assign dialog — category → item → unit tree

**Files:** `src/hooks/useToolAssignments.ts`, `src/components/warehouse/tools-assets/AssignToolUnitDialog.tsx`

**Interfaces:**
- Extend `AssignableToolUnit` with `item_id: string | null; category_id: string | null; category_name: string | null`. (The hook already casts the RPC result, so no `database.types.ts` regen — consistent with the file's own pattern.)
- Build the tree client-side from the flat rows (grouping helper, kept in the component or a small pure fn):
  - group by `category_id` (fallback key for NULL → `'__uncat'`, label "Uncategorised"); within each, group by `item_id` (fallback item_name); leaves = units.
  - sort categories by `category_name` (COLLATOR), items by `item_name`, units by `serial_number` (numeric collation).

**UI (mirror the catalog's disclosure + product register — no invented affordances):**
- Keep the search `Input` (server-side filter via `useAssignableToolUnits(divisionId, search)`); the tree renders from whatever returns.
- Level 1 — category header row: chevron + category name + muted breadcrumb path (optional: if category has a parent, we only have the leaf name from the RPC → show leaf name only; breadcrumb requires the categories tree, out of scope — show leaf name + item count). Count = units under it.
- Level 2 — item row (indented): chevron + item name + unit count.
- Level 3 — unit row (indented): selectable (single-select, radio semantics via highlighted state as today) showing `serial_number` (mono) + `condition`; clicking sets `selected = unit_id`.
- **Default:** all collapsed when the list is large; **auto-expand** the path to results when searching (search implies intent). Keep it simple: when `search` is non-empty, expand all; otherwise categories collapsed. Selection persists across expand/collapse.
- Layout stability: fixed row heights (`h-*`/`min-h-*`), `truncate` on names; the scroll region is the dialog body (from R1). Empty state unchanged ("No available tools …").
- Keep the footer Assign button gated on `selected`.

- [ ] **Step 1** — extend the type + hook return cast.
- [ ] **Step 2** — write a pure `buildAssignTree(units)` (module-local) → `{ category, items: [{ item, units: [] }] }[]`.
- [ ] **Step 3** — render the 3-level disclosure with local `expandedCats`/`expandedItems` `Set<string>` state; search auto-expands.
- [ ] **Step 4** — `npx tsc --noEmit` + `eslint`. Operator smokes the tree (part of R-smoke).

---

## Task R4: Teams tab — group by division, collapsible

**Files:** `src/components/warehouse/tools-assets/TeamsTab.tsx`

**Interfaces:** unchanged data — `useTeamsWithToolCounts(divisionIds)` already returns `division_id` + `division_name`; the top-bar `viewDivisionIds` filter is already wired.

**UI (mirror `CustodyTab` in `src/app/(dashboard)/warehouse/custody/page.tsx:186-251`):**
- Replace the single flat grid with sections: `grouped = Map<division_name, TeamToolCount[]>` (sorted by division name; `null` → "Unassigned"), teams inside each sorted by the existing numeric `COLLATOR`.
- Each section: an uppercase muted header (`text-sm font-semibold text-muted-foreground uppercase tracking-wide`) + a **chevron toggle** + a team count on the right; below it the existing responsive card grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4`).
- **Default expanded**; collapse state in a local `useState<Set<string>>` keyed by division name (no persistence). Reduced-motion respected (instant show/hide is fine; no height animation required).
- Selecting a team still swaps to `TeamToolsDetail` (unchanged). Loading skeleton + empty state unchanged (empty state already explains the top-bar filter).

- [ ] **Step 1** — add the `grouped` memo + collapse state.
- [ ] **Step 2** — render sections + toggle; keep card markup identical inside.
- [ ] **Step 3** — `npx tsc --noEmit` + `eslint`. Operator smokes grouping + top-bar filter (part of R-smoke).

---

## Task R5: Verify, docs, hand smoke, then ship (ASK FIRST)

- [ ] **Step 1** — `npx tsc --noEmit` + `eslint` on all touched files, clean.
- [ ] **Step 2** — flow-registry: the assign flow's read now returns item+category; update the [[Assign / Move / Return Tool Unit (team custody)]] entry's read-RPC note if it names columns. No new flow.
- [ ] **Step 3** — `PROGRESS.md` (completion) + EOD lines. Security-audit: no new table/route; note the RPC still revokes public + gates unchanged; layout-stability improved (footer). Append a short row.
- [ ] **Step 4: Operator R-smoke (hand off — do NOT self-drive for sign-off):**
  - Assign dialog: footer pinned at bottom, list scrolls above it (no float); tree shows category → item → serial; search filters + auto-expands; picking a serial + Assign works.
  - Move dialog: footer pinned; picker unchanged.
  - Teams tab: cards grouped under division headers; collapse/expand a division; top bar set to one division shows only that group, "All" shows every group.
  - Layout: no row/header jump on interaction; reflows on phone width.
- [ ] **Step 5: Ship (only on explicit go-ahead)** — apply `20260921000000` to new-prod via the guarded flow (drift-check the live `get_assignable_tool_units` first — it should be the staging base created by `20260920000300`), post-apply shape probe, then push the batched commits (one Vercel build). Confirm green; hand prod smoke to the operator.

---

## Self-review

1. **Coverage:** footer (R1) ✔, tree (R2 DB + R3 UI) ✔, division grouping (R4) ✔, deferred custody-tools logged (ISSUE-10) ✔.
2. **DB honesty:** column names verified live; DROP+CREATE justified by return-type change; overload sweep + grants + rolled-back probe all explicit steps.
3. **No regen needed:** RPC params unchanged; hook casts results, type extended locally — matches the file's pattern.
4. **Layout stability:** single scroll region + non-floating footer (R1); fixed row heights + truncate in the tree (R3); default-expanded collapsible sections (R4).
5. **Ship discipline:** one migration folds into the existing 4; one new-prod apply, one push, both gated on operator go-ahead.
