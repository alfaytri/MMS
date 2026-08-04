# Handover — Category Attributes Phases 1-4 done, Phase 5 partial + Brand-name refactor

**Date:** 2026-08-04
**Branch:** `feature/category-attributes` (forked from `deploy/warehouse-shipping`)
**Plan:** [docs/plans/2026-08-04-category-attributes-plan.md](docs/plans/2026-08-04-category-attributes-plan.md)
**Previous handover:** [HANDOVER-2026-08-04-category-attributes.md](HANDOVER-2026-08-04-category-attributes.md) (covers Phase 0)

## Current position

**Phase 5 is partially wired.** Task 5.4 (Consumption) and Task 5.1 (SO Create + Edit) shipped. Two surfaces remain:
- **Task 5.2:** Quotations (sales + contract quotations line pickers)
- **Task 5.3:** Service Links (Master Data → Services admin, `InventoryTableView`)

Awaiting operator smoke on Task 5.1 before starting 5.2.

## What shipped this session — 51 commits since branch fork

### Phase 1 — DB layer (5 migrations, all on staging)

| Task | Migration | Notes |
|---|---|---|
| 1.1 | `20260804120000_attribute_definitions_table.sql` | `inventory_attribute_definitions` + branch-uniqueness trigger. Trigger walks ancestors + descendants (depth cap 10) so an `attribute_key` is unique across each top-level tree. **Uses `public.set_updated_at()` because `touch_updated_at` doesn't exist in this project.** |
| 1.2 | `20260804120100_attribute_options_table.sql` | Options + `is_archived` soft-hide + case-insensitive UNIQUE on `(definition_id, lower(value_en))`. |
| 1.3 | `20260804120200_item_attributes_table.sql` | Per-item picked value. `ON DELETE RESTRICT` on `option_id` so archived-in-use options can't be hard-deleted. |
| 1.4 | `20260804120300_effective_attributes_function.sql` | `get_effective_attributes(category_id)` — recursive walk with `is_inherited` flag, ordered by `sort_order` then `depth`. |
| 1.5 | `20260804120400_picker_step_rpc.sql` | `rpc_attribute_picker_step` — one-round-trip candidates/next-attribute/next-options. |
| **fix** | `20260804123000_fix_attribute_branch_uniqueness_trigger.sql` | Alias `c` was out of scope in the outer SELECT; changed to `a`. Also excluded `depth=1` from the ancestor check (local UNIQUE covers own-category conflict). |
| **fix** | `20260804140000_fix_picker_step_unassigned_record.sql` | `v_next_def` declared as `record` and only populated in the >1-candidate branch — reading it when unpopulated blew up with "record not assigned yet" (500). Replaced with individual nullable scalars. Also lifted the ancestor CTE out of a nested WITH-in-subquery. |
| **fix** | `20260804140100_fix_picker_step_column_alias.sql` | `SELECT id FROM get_effective_attributes(...)` — but the RPC's `RETURNS TABLE` names the column `definition_id`, not `id`. Only fired when >1 candidates remained, so leaf categories worked and parent categories 400'd. |

### Phase 2 — Definition editor UI

| Task | Files | Notes |
|---|---|---|
| 2.1 | `src/lib/permissions.ts`, `src/components/master-data/PermissionTree.tsx` | Trio `master_data.inventory.attributes.{view,create,edit}` added. Total keys 121 → 124. |
| 2.2 | `src/hooks/useAttributes.ts`, `src/lib/queryKeys.ts` | `useAttributeDefinitionsForCategory`, `useEffectiveAttributes` (RPC), upsert/delete definition + option hooks. Cache keys under `queryKeys.attributes`. |
| 2.3 + 2.4 | `src/components/master-data/attributes/{AttributesTab,AttributeFormDialog,AttributeOptionsEditor,CategoryAttributesDialog}.tsx`, `src/components/services/inventory/CategoryRow.tsx` | **Adaptation:** `/master-data/inventory` uses a category tree (no split pane), so plan's `<Tabs>` approach didn't fit — each row instead gets a `Tags` icon that opens `CategoryAttributesDialog`. Inherited/local sections, snake_case auto-slug, options editor with archive/reorder. Trigger 23505 and FK RESTRICT errors surface as friendly toasts. |
| **fix** | `src/components/master-data/attributes/AttributeFormDialog.tsx` | Subsequent saves after first create were sending `id: undefined` because `savedDefinitionId` wasn't fed back into the upsert payload → fresh INSERTs → 23505 duplicate key. Fixed with `id: editing?.id ?? savedDefinitionId ?? undefined`. Also surfaced raw DB errors as toasts. |

### Phase 3 — Item-level values

| Task | Files | Notes |
|---|---|---|
| 3.1a | `src/hooks/useAttributes.ts` | Appended `useItemAttributes` + `useUpsertItemAttributes`. Full-desired-state semantics: `option_id: null` deletes, set upserts. |
| 3.1b + 3.2 | `src/components/master-data/attributes/ItemAttributesSection.tsx`, `src/components/services/inventory/ItemEditDialog.tsx`, `src/hooks/useInventory.ts`, `src/lib/queryKeys.ts` | New section renders every effective attribute as a Select. **Race-guard:** propagates to parent only after `useItemAttributes.isSuccess` — a mid-fetch Save no longer wipes existing rows. Removed the dead chip UI (`chips`, `chipInput`, `addChip/removeChip`) + `useUpsertInventoryItemAttributes` hook + `queryKeys.inventory.itemAttributes`. `handleSubmit` switched to async — awaits both mutations. |
| 3.3 | `src/components/shared/AttributeChipStrip.tsx`, `src/components/services/inventory/ItemRow.tsx` | Compact read-only strip under each item name. **Batched option lookup** via single `useOptionsForDefinitionsBatch` query — avoids N-per-row fan-out. Up to 4 chips + "+N more" tail. Keeps archived-but-picked values visible. |

### Phase 4 — Picker

| Task | Files | Notes |
|---|---|---|
| 4.1 | `src/hooks/useAttributes.ts` | `useAttributePickerStep(categoryId, picks)`. `JSON.stringify(picks)` in cache key. Wraps PostgrestError into a real `Error` so callers see the full `[code] · message · details · hint` diagnostic instead of a generic fallback. |
| 4.2 | `src/components/shared/ProductAttributePicker.tsx` (~290 LOC) | Guided item picker: optional built-in category `Select` (skipped when `categoryFilter` prop is passed), current-picks chip row with per-chip clear-from-here, next-attribute button row with per-option `item_count`, candidate items grid with brand-variant stock chips. `onPick(itemId, brandVariantId)` completes the pick. `pickHistory: string[]` lets us clear "everything after this pick" without client-side `sort_order`. |
| scratch | `src/app/(dashboard)/dev/attribute-picker-preview/page.tsx` | Preview route for smoke-testing the picker in isolation before wiring into production surfaces. Not linked from nav. **DELETE after Phase 5 lands.** |

### Phase 5 — Surface wire-ups (partial)

| Task | Files | Status |
|---|---|---|
| **5.4 Consumption** | `src/components/consumption/NewConsumptionDialog.tsx` | ✅ Shipped. `[Browse / Guided]` toggle at top of Items section, persisted in `localStorage['consumption.pickerMode']`. Guided mode opens a **sub-Dialog** (not a popover — first attempt was a popover but it overflowed the parent dialog width; sub-Dialog matches parent dimensions for a clean visual). onPick validates `stockedVariantIds` (client-side WH filter) + cross-line duplicate before calling `updateRow`. |
| **5.1 SO Create + Edit** | `src/components/sales/SoLineItemsEditor.tsx` | ✅ Shipped. Same toggle + sub-Dialog pattern. Added `resolveLookupByBrandVariant()` helper that joins `inventory_item_brand_variants → inventory_items → inventory_categories` so the guided picker's minimal `(itemId, brandVariantId)` output can feed the same `handleInventorySelect(InventoryLookupResult)` path the cascade uses. Applies to both `/sales/create-so` and `/sales/edit-so` (shared component). Awaiting operator smoke. |
| **5.2 Quotations** | TBD | Not started. Find via `grep -rn "SoLineItemsEditor\|CascadeInventorySelector" src/app/\(dashboard\)/sales/quotations src/app/\(dashboard\)/contracts`. Persistence key: `quotations.pickerMode`. |
| **5.3 Service Links** | TBD | Not started. `InventoryTableView` in Master Data → Services. Persistence key: `service-links.pickerMode`. |

### Migration target policy — staging only during this window

Mid-session (commit `0bbce08f`) the migration target was switched. Every migration in this session went to staging (`mwvblpgbgxipvrevkeff`) **only**. Dev DB (`wkmvjxxmzstsvahuiwsz`) is frozen until `deploy/warehouse-shipping` ships. Updated:
- [AGENTS.md](AGENTS.md) → Database Migrations section names staging as primary
- Memory: [reference-staging-db](../.claude/projects/D--MMS/memory/reference_staging_db.md) rewritten

**Do not push migrations to dev DB during this window.** After `deploy/warehouse-shipping` ships, re-evaluate whether to resync dev or retire it entirely.

### Brand-name refactor — bonus scope (commit `da46334c`)

The operator saw "Al Faytri" hardcoded in the Division dropdown / TopNav / PDFs and asked to make it DB-driven so what they type in Master Data → Companies flows everywhere.

- New `usePrimaryCompanyName()` in `src/hooks/useCompanies.ts` — returns the first `companies.name_en`.
- `TopNav.tsx` fetches server-side via the existing supabase server client.
- `TopNavSkeleton.tsx` swapped hardcoded text for a shimmer placeholder.
- `BillDetailDocument.tsx`, `InvoiceDetailDocument.tsx` — use the hook / passed company data.
- 6 PDF `<title>` tags depersonalised (`Al Faytri — X` → `X`); PDF bodies pull from `brand_resolver` already.
- `app/layout.tsx` metadata description depersonalised.

**Invariant:** `grep 'Al Faytri\|Alfaytri' src/` now returns zero. Enforced by [feedback-no-hardcoded-brand-name](../.claude/projects/D--MMS/memory/feedback_no_hardcoded_brand_name.md).

## Bugs found + fixed this session (three of them)

All three shared the same shape: I trusted intermediate signals (tsc pass, first path worked, plan-spec code compiled) instead of tracing every code path.

1. **Trigger CTE alias out of scope** (`20260804123000`) — outer SELECT referenced `c.name_en`, but `c` was only defined inside the recursive CTE. Every INSERT hit `42P01 missing FROM-clause entry for table "c"`.
2. **AttributeFormDialog upsert path** — `savedDefinitionId` tracked in local state but never sent as `id` on subsequent saves → repeated 23505 dup-key errors.
3. **rpc_attribute_picker_step trilogy** — first `v_next_def record` was unassigned in the ≤1-candidate branch (500), then even after the record fix `SELECT id FROM get_effective_attributes(...)` used a column name that doesn't exist on that function's `RETURNS TABLE` (`definition_id` is the real name) (400).

Two feedback memories filed as a result:
- [feedback-mutation-path-verification](../.claude/projects/D--MMS/memory/feedback_mutation_path_verification.md) — trace EVERY write path before claiming done.
- [feedback-surface-raw-db-errors](../.claude/projects/D--MMS/memory/feedback_surface_raw_db_errors.md) — `PostgrestError` isn't an `Error` subclass; wrap it so `error.message` always has the full DB context.

## Scope decisions to respect

1. **Tree flattening deferred.** The operator's existing categories encode specs into names (`1.5 Ton`, `10 UF`, `80 Gallon`) — so the guided picker's category dropdown looks noisy on their data. We discussed flattening the tree so categories become generic and attributes carry the specs, but the operator explicitly said "no need for flatten it, just keep both no issues" (2026-08-04). Attributes now co-exist with size-in-name categories; the picker works but its category dropdown lists more noise than the design intended. Not a blocker.

2. **`InventoryItemFormDialog.tsx` (dead file) untouched.** Defined but never imported anywhere. Only `ItemEditDialog.tsx` is the live edit path. Left alone to keep the diff focused; separate dead-code pass welcome.

3. **PDF `<title>` tags depersonalised, not brand-injected.** The server-side PDF builders (`src/lib/**/*-pdf-html.ts`) don't currently receive the company name. Rather than plumb it through 6 builders + all their callers, we dropped the `Al Faytri — ` prefix entirely. Visible PDF bodies already pull from `brand_resolver`. If we ever want the brand back in title metadata, add a `brandName: string` to the builder inputs — don't re-hardcode.

4. **Chip labels in `ProductAttributePicker` show short id prefix.** e.g. `ton → 5aeb1a` — a known cosmetic limit noted in the commit. Human labels need a follow-up cache keyed by `(definition_id × option_id)`; deferred.

5. **`warehouseScope` prop on the picker is reserved but unwired.** Consumption filters client-side against `stockedVariantIds` in the onPick handler — that's the "keep the RPC simple" v1 per plan §Task 5.4.

## What's next — Task 5.2 + 5.3

### Task 5.2 — Quotations

Files (to be identified by grep):
```bash
grep -rn "SoLineItemsEditor\|CascadeInventorySelector" src/app/\(dashboard\)/sales/quotations src/app/\(dashboard\)/contracts 2>/dev/null
```

Pattern: identical to 5.1. If quotations share `SoLineItemsEditor`, this may already be wired (verify). If they use a distinct component, mirror the exact pattern:
1. Import `ProductAttributePicker` + `Dialog, DialogContent, DialogHeader, DialogTitle`
2. Add `pickerMode` lazy-init state + effect writing `quotations.pickerMode` to localStorage
3. Add toggle bar
4. Swap the per-row picker between browse (existing) and guided (button + sub-Dialog)
5. Reuse `resolveLookupByBrandVariant` if it also feeds an `InventoryLookupResult` sink

### Task 5.3 — Service Links

Files:
- `src/components/services/InventoryTableView.tsx` (per plan)

Pattern is similar but the sink shape may differ (service-link creation rather than an SO line). Adapt `resolveLookupByBrandVariant`'s return type as needed.

### After 5.2 + 5.3 ship

1. Delete the scratch route: `src/app/(dashboard)/dev/attribute-picker-preview/page.tsx`
2. Task 6.1 flow-registry entry
3. Task 6.2 four-point security audit → PROGRESS.md `## 🔒 Security Audit Log`
4. Task 6.3 final smoke + merge readiness

## Working conventions used this session

- **PROGRESS.md protocol** — start commits + complete commits, alone, never batched with code.
- **EOD** — `EOD/EOD-2026-08-04.md` maintained across the session (numbered items 7–23).
- **Commits** — HEREDOC with both trailers (`Co-Authored-By: Mohamed Ismail` + `Co-Authored-By: Claude Opus 4.7`).
- **Inline execution mode** — user prefers moving through tasks without pausing for smoke on pure-code changes (helpers, validators, types). Smoke required for anything with real UI + writes. Explicit "working" before continuing on user-facing surfaces.
- **tsc gate** — `npx tsc --noEmit 2>&1 | grep -E "<pattern>" | head -N` before every commit. Zero output = pass.
- **Every migration went to staging via `npx supabase db push`**; types regenerated via `npx supabase gen types typescript --linked --schema public > src/types/database.types.ts` (with stderr redirected to `/dev/null` to avoid `Initialising login role...` and CLI-update-notice leaks corrupting the file). Helper aliases re-appended manually after each gen.

## Follow-ups queued (not for this branch)

1. **Delete `/dev/attribute-picker-preview`** — scratch route to be removed after Phase 5 lands.
2. **`InventoryItemFormDialog.tsx`** — dead file. Not imported anywhere. Can be deleted in a separate cleanup pass.
3. **Attribute chip labels in `ProductAttributePicker`** — cache real labels by `(definition_id × option_id)` so chips show `ton → 4` instead of `ton → 5aeb1a`.
4. **`warehouseScope` prop wiring** — currently accepted but ignored; consumption filters client-side.
5. **Tree flattening (long-term)** — operator opted to keep both categories AND attributes in parallel. If we ever want the picker to feel clean, flatten size-encoded leaf categories into generic parents + attributes.
6. **Multi-tenant company lookup** — `usePrimaryCompanyName()` returns the first companies row alphabetically. If we go multi-tenant, this needs an active-company concept in the DivisionProvider.
7. **Dev DB catch-up** — after `deploy/warehouse-shipping` ships, decide whether to resync dev with staging or retire the dev DB.
8. **RPC perf pass** — `rpc_attribute_picker_step` was noted as complex; first cut ships as-is per plan §1.5. Measure with real data before caching.

## Resume checklist

Next session should:
1. Read this handover
2. Read `docs/plans/2026-08-04-category-attributes-plan.md` §Phase 5 (Tasks 5.2 + 5.3)
3. Confirm Task 5.1 smoke result with the operator (SO Create/Edit — the current in-progress marker in PROGRESS.md)
4. Grep for the picker sink in Quotations and Service Links surfaces
5. Wire Task 5.2 following the exact 5.1 pattern; then Task 5.3
6. Delete the scratch preview route
7. Move to Phase 6 (flow registry, security audit, final smoke)

## Applied to staging (`mwvblpgbgxipvrevkeff`) this session

- `20260804120000_attribute_definitions_table.sql`
- `20260804120100_attribute_options_table.sql`
- `20260804120200_item_attributes_table.sql`
- `20260804120300_effective_attributes_function.sql`
- `20260804120400_picker_step_rpc.sql`
- `20260804123000_fix_attribute_branch_uniqueness_trigger.sql`
- `20260804140000_fix_picker_step_unassigned_record.sql`
- `20260804140100_fix_picker_step_column_alias.sql`

Nothing pending in the migrations folder — everything up to date on staging. Dev DB frozen (see policy above).

## Commits this session (51 total, since fork from `deploy/warehouse-shipping`)

Latest first — organized by phase.

**Phase 5 (partial) + brand refactor:**
- `da46334c` refactor: brand name is now DB-driven — no more hardcoded 'Al Faytri'
- `255a2838` feat(sales): [Browse / Guided] toggle on SO line items — Task 5.1
- `ebe5d8f6` fix(consumption): guided sub-dialog matches parent size, stable min height
- `5641d04b` fix(consumption): move guided picker to a sub-Dialog, not a Popover
- `ffb2ee60` feat(consumption): [Browse / Guided] toggle wires ProductAttributePicker — Task 5.4

**Phase 4 + fixes:**
- `f936fa67` fix(db+client): picker RPC used wrong column name; surface real error text
- `3f86963c` fix(db): rpc_attribute_picker_step — unassigned record + cleaner ancestor CTE
- `d16725c1` chore(dev): scratch preview route for ProductAttributePicker
- `9a47ddcd` docs: update PROGRESS.md — Phase 4 built, deciding smoke path
- `0fff3734` feat(attributes): ProductAttributePicker — guided item picker — Task 4.2
- `ef6695e4` feat(attributes): useAttributePickerStep hook — Task 4.1

**Phase 3:**
- `c52cae4d` docs: update PROGRESS.md — Phase 3 complete, awaiting smoke
- `b3d811ed` feat(attributes): item-row chip strip — Task 3.3
- `c9d872ea` feat(attributes): ItemAttributesSection + wire into ItemEditDialog — Task 3.1b + 3.2
- `4a9ba251` feat(attributes): item-value hooks — Task 3.1a

**Phase 2 + fixes:**
- `a20af88b` fix(attributes): AttributeFormDialog — subsequent saves inserted instead of updating
- `fb215260` fix(db): attribute branch-uniqueness trigger — alias out of scope
- `36b004b4` docs: update PROGRESS.md — Tasks 2.2/2.3/2.4 complete
- `68bbdebd` feat(attributes): AttributesTab + FormDialog + OptionsEditor + row entry — Tasks 2.3 + 2.4
- `1b868fd9` feat(attributes): useAttributes hooks — Task 2.2
- `9979f372` docs: update PROGRESS.md — Task 2.1 complete
- `511391b3` feat(permissions): master_data.inventory.attributes.{view,create,edit} trio — Task 2.1

**Phase 1 + policy switch:**
- `7fd5df78` docs: update PROGRESS.md — Task 1.5 complete, Phase 1 done
- `70946560` feat(db): rpc_attribute_picker_step — Task 1.5
- `dda1731d` docs: update PROGRESS.md — Task 1.4 complete
- `a558124b` feat(db): get_effective_attributes(category_id) RPC — Task 1.4
- `13015940` docs: update PROGRESS.md — Task 1.3 complete
- `8ac09dcc` feat(db): inventory_item_attributes — Task 1.3
- `96d7bf86` docs: update PROGRESS.md — Task 1.2 complete
- `69eba8fb` feat(db): inventory_attribute_options — Task 1.2
- `2dab5909` docs: update PROGRESS.md — Task 1.1 complete
- `0bbce08f` docs: switch migration target to staging until warehouse-shipping ships
- `f71d0e31` feat(db): inventory_attribute_definitions + branch-uniqueness trigger — Task 1.1

**Phase 0 (from previous handover — recap):**
- `36bfab15` docs: handover for Phase 0 completion
- `82da86f4`–`50f8685d` (13 commits) — 3-state permission split + consumption granularity + plan docs

Full list: `git log --oneline deploy/warehouse-shipping..feature/category-attributes`.

## Files added this session

- `src/hooks/useAttributes.ts`
- `src/components/master-data/attributes/AttributesTab.tsx`
- `src/components/master-data/attributes/AttributeFormDialog.tsx`
- `src/components/master-data/attributes/AttributeOptionsEditor.tsx`
- `src/components/master-data/attributes/CategoryAttributesDialog.tsx`
- `src/components/master-data/attributes/ItemAttributesSection.tsx`
- `src/components/shared/AttributeChipStrip.tsx`
- `src/components/shared/ProductAttributePicker.tsx`
- `src/app/(dashboard)/dev/attribute-picker-preview/page.tsx` **(scratch — delete after Phase 5)**
- 8 migration SQL files

## Files modified this session

- `src/hooks/useCompanies.ts` — `usePrimaryCompanyName()` added
- `src/hooks/useInventory.ts` — dead `useUpsertInventoryItemAttributes` removed
- `src/lib/queryKeys.ts` — `queryKeys.attributes` added, dead `queryKeys.inventory.itemAttributes` removed
- `src/lib/permissions.ts` — new attribute permission trio
- `src/components/master-data/PermissionTree.tsx` — new attribute node under md-inventory
- `src/components/services/inventory/CategoryRow.tsx` — Tags icon + attributes dialog wire
- `src/components/services/inventory/ItemRow.tsx` — chip strip
- `src/components/services/inventory/ItemEditDialog.tsx` — ItemAttributesSection + dead chip UI removed
- `src/components/consumption/NewConsumptionDialog.tsx` — Task 5.4 toggle + sub-dialog
- `src/components/sales/SoLineItemsEditor.tsx` — Task 5.1 toggle + sub-dialog + lookup helper
- `src/components/layout/TopNav.tsx`, `TopNavSkeleton.tsx` — brand from DB
- `src/components/purchase/BillDetailDocument.tsx` — brand from DB
- `src/components/sales/InvoiceDetailDocument.tsx` — FALLBACK_COMPANY removed
- `src/lib/purchase/*-pdf-html.ts`, `src/lib/returns/return-pdf-html.ts`, `src/lib/sales/delivery-note-pdf-html.ts` — brand removed from `<title>` tags
- `src/app/layout.tsx` — metadata description depersonalised
- `src/types/database.types.ts` — regenerated after each migration
- `AGENTS.md` — Database Migrations section updated for staging target
- `PROGRESS.md` — Phase updates + in-progress markers
- `EOD/EOD-2026-08-04.md` — numbered items 7–23

## Memory files added / updated this session

Under `C:\Users\IT\.claude\projects\D--MMS\memory\`:
- `feedback_mutation_path_verification.md` (new)
- `feedback_surface_raw_db_errors.md` (new)
- `feedback_no_hardcoded_brand_name.md` (new)
- `reference_staging_db.md` (rewritten — staging is now primary)
- `MEMORY.md` (index updated)
