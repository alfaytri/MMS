# Inventory Brands & Origin — Execution State (resume doc)

**Purpose:** durable state so context can be compacted and execution resumed freely.
Read this + the SDD ledger `.superpowers/sdd/progress.md` to continue. This is the
authoritative fact-set for Tasks 12–18 — do NOT re-derive what's captured here.

- **Branch:** `feature/inventory-brands-and-origin`  •  **DB target:** STAGING `mwvblpgbgxipvrevkeff`
- **Plan:** `docs/plans/2026-08-08-inventory-brands-origin.md`  •  **Spec:** `docs/specs/2026-08-08-inventory-brands-origin-design.md`
- **Method:** superpowers:subagent-driven-development (fresh implementer per task → task review → mark complete).
  Scripts: `task-brief PLAN N`, `review-package BASE HEAD` in the skill's `scripts/` dir.
- **Commit policy (user decision):** "commit per plan" — commit each code task when its task-review passes;
  tasks with `⏸ OPERATOR SMOKE` still wait for the user's confirm before the gated commit. Migrations/types commit immediately.
- **Every commit** ends with BOTH trailers (HEREDOC):
  `Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>` + `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- **Browser testing:** ALLOWED now (rule relaxed 2026-08-08) — may use browser to verify UI; still get user sign-off on operator-smoke gates.

## Reliable live-DB introspection
- `npx supabase db query --linked -o csv "<SQL>"` — direct catalog read, IMMUNE to PostgREST cache. Use this, NOT supabase-js.
- `npx supabase inspect db table-stats` — authoritative table existence/row counts.
- Do NOT trust: PostgREST/supabase-js for existence (schema-cache flaps; `head:true` returns no error on 404 = false "exists"); the stale `baseline_schema.sql`.
- Service-role key is in `.env.local` (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`) — bypasses RLS for read scripts (run scripts from repo root so node_modules resolves; `@supabase/supabase-js` is installed, `pg` is NOT; no DB password available for direct pg).

## Verified live-DB facts (do NOT re-derive)
- `inventory_item_brand_variants` columns: id, item_id, brand(text NOT NULL), code, cost_price, selling_price, stock_level(int), incoming, average_cost, created_at, updated_at, reserved_qty, linked_services_count, status, sort_order, reorder_point, damaged_qty, brand_id(uuid null), country_id(int null). **`margin_percent` DOES NOT EXIST** (removed) — never reference it.
- Forward-sync trigger EXISTS: `trg_sync_brand_variants_brand_text` / `sync_brand_variant_brand_text()` — `BEFORE INSERT OR UPDATE OF brand_id`, sets `brand = brands.name` WHEN brand_id non-null; does NOTHING when brand_id null. → **hooks/dialogs must write `brand=''` when brand_id is null** (covers insert NOT-NULL + un-set-brand clearing).
- `country_codes`: id(integer), code, iso, flag, name. Variant FK `inventory_item_brand_variants_country_id_fkey`.
- Tables `service_brands`, `brand_group_members`, `contract_services` DO NOT EXIST live (dropped outside migrations; baseline is stale). Only `brands` + `inventory_item_brand_variants` reference brands now.
- `brands`: 299 rows after dedup (was 302; merged case-dups HOMMER/Hommer, FREGO/Frego, china/CHINA — keepers d8ef.../46e9.../1ff2... with 6/5/3 variants).
- Helpers `_user_has_permission(uuid,text)` + `_current_user_data_id()`: SECURITY DEFINER, executable by authenticated.
- Seeded system-admin roles `Owner`(86 perms) + `exploit`(1) — both carry `system.admin` key (bypass validatePermissionSet) and got inventory.catalog.view/manage + pricing.manage. Owner/exploit did NOT get pricing.view (not needed — they bypass the validator).
- New RPCs (in regenerated types): `rpc_archive_inventory_category(p_category_id uuid)`, `rpc_update_inventory_sort_orders(p_updates jsonb)` — jsonb array of `{table_name, id, sort_order}`.
- Pricing guard `inventory_pricing_guard_trg` (BEFORE UPDATE) gates `cost_price`/`selling_price` only (via IS DISTINCT FROM), raises 42501 without `inventory.pricing.manage`. Does NOT gate average_cost/stock_level (receival/FIFO safe). It's UPDATE-only (INSERT ungated — plan-mandated, noted for final review).
- RLS: categories/items/variants/brands now SELECT-open + INS/UPD/DEL gated on `inventory.catalog.manage` (policies `inv_cat_*`, `inv_item_*`, `inv_var_*`, `inv_brand_*`). Photos bucket `inventory-item-photos` writes gated on catalog.manage.

## Key code facts
- Permissions: 4 keys registered in `src/lib/permissions.ts` + `src/components/master-data/PermissionTree.tsx`:
  `inventory.catalog.view`, `inventory.catalog.manage`, `inventory.pricing.view`, `inventory.pricing.manage`.
  `validatePermissionSet` (PermissionTree.tsx:731, called blocking in RoleFormDialog.tsx:251) requires a `.view` sibling for each `.manage` — that's WHY pricing.view was added.
- `useCreateBrand` (src/hooks/useBrands.ts) now returns `{ brand, created }` (created=false on ilike dup). Consumer BrandVariantFormDialog.tsx (DEAD/unimported) updated to destructure `.brand` + honest toast.
- `useInventory.ts`: `BrandVariantInsert` now has `brand?: string` (optional) + `country_id?: number|null` + `brand_id?: string|null`. `useBrandVariants` reads `*, brands(name), country_codes(name, flag, iso)` `.limit(500)`. `useCreateBrandVariant` defaults `brand: values.brand ?? ''`. `useArchiveInventoryCategory` → `rpc_archive_inventory_category`. `useUpdateSortOrders(table)` → `rpc_update_inventory_sort_orders` (maps rows to `{table_name: table, id, sort_order}`).
- **`useBrandVariants` has ZERO live callers** — the current tree renders variants via a "V2" hook (queryKeys reference `brandVariantsV2`/`brandVariantsV2ByItem`). **Task 13 must reconcile**: either wire `useBrandVariants` (with joins + `groupVariants`) into the tree, or bring the V2 hook up to carry brand_id/country_id/joins. Investigate the V2 hook first.
- Pure helpers ready (Phase 3): `src/lib/inventory/brandNormalize.ts` (normalizeBrandName, sameBrand), `groupVariants.ts` (groupVariants → BrandGroup[]; Unbranded last; null-origin last; '—' label is a RENDER concern), `categoryLevels.ts` (buildLevels, ancestorPath).
- `useCountryCodes()` (src/hooks/useCountryCodes.ts): `{ id:number, code, iso, flag, name }`, active + sorted. Use for Origin picker.

## Completed tasks (commits)
- T0 26ac2582 (PROGRESS marker) • T1 951cd7cc (origin+integrity, +brand dedup) • T2 bee2646f (backfill, 0 unmapped) •
  T3 510b64ca (null-safe unique swap) • T4 f3a278a8 (RLS lockdown, opus-reviewed) • T5 1689473b (types regen) •
  T6 00df4631 + ac9c5b7a (permissions incl. pricing.view) • T7 54edf48b (brandNormalize) • T8 a3af762b (groupVariants) •
  T9 bf856b90 (categoryLevels) • T10 b1eb1fa8 (useCreateBrand honest) • T11 b996cd52 (variant hooks + RPCs).

## Remaining tasks
- **T12 (UI, ⏸ SMOKE)** — `src/components/services/inventory/BrandVariantEditDialog.tsx`. Replace free-text brand `<Input>` (state `brand`, Input ~L219-226, required check ~L157-160, dirty ~L105, reset ~L76, payload ~L165) with a **Brand `<Select>`** from `useBrands()` (render `name`, optional "— none —") + inline "+ Add brand" via `useCreateBrand()` honest toast (`.created`). Add an **Origin `<Select>`** from `useCountryCodes()` rendering `flag name`, value=`id`, clearable/optional. State → `brandId: string|null`, `countryId: number|null`. Submit: pass `brand_id`, `country_id`, and `brand: ''` (trigger fills when brand_id set; '' when null). REMOVE the required-brand guard (brand optional now). Fix dirty-check to compare brandId/countryId. Reset from `variant?.brand_id`/`variant?.country_id`. PRESERVE `avgCostLocked` + warehouse-alloc logic; guard the load-window race — disable the cost input until `whStockData` resolves in edit mode. UI rules: dropdown UUID guard (labels not ids), side-by-side selects, layout stability (min-h), responsive, 44px touch targets. tsc clean → OPERATOR SMOKE (4 leaf types create/save; origin shows names+flags no UUID; duplicate combo rejected readably) → commit after user confirms `feat(inventory): brand + origin pickers in variant editor`.
- **T13 (UI, ⏸ SMOKE)** — ItemRow.tsx + create BrandGroupRow.tsx + OriginVariantRow.tsx (from BrandVariantRow.tsx). Group via `groupVariants`; price+stock always visible incl. mobile; origin row expands to FifoLayersTable + receivals. FIRST reconcile the V2-hook vs useBrandVariants (see above). Icon buttons need aria-label. Reserve heights (min-h-11).
- **T14** — ItemEditDialog.tsx: add `warrantyPolicyId` to isDirty (~L139-161; read ~L69, submitted ~L196). Commit `fix(inventory): ItemEditDialog dirty-check includes warranty`.
- **T15 (UI, ⏸ SMOKE)** — CategoryEditDialog.tsx (~L239-284): replace fixed 3-level parent picker with N side-by-side selects via `buildLevels(flat, selectedParentId)` + `ancestorPath` for edit pre-seed; uses `useAllCategoriesFlat` (src/hooks/useInventoryTree.ts:137-153). Side-by-side, name_en labels.
- **T16 (UI, ⏸ SMOKE)** — manual inventory-receival dialog (`grep -rn "useInventoryReceivals\|InventoryReceivalDialog" src/components`; hook src/hooks/useInventoryReceivals.ts): variant selector resolves (item, brand, origin) leaf so new stock+FIFO land on the right brand_variant_id.
- **T17** — flows-registry.md entries + 5-point security checklist row in PROGRESS.md `## 🔒 Security Audit Log` + PROGRESS Completed/InProgress + EOD. Docs commit.
- **T18** — full-branch verify: tsc clean; `npm run test:run` (inventory helper suites); `db push --dry-run` up to date; grep no `USING (true)` in the 4 new migrations; ⏸ full operator smoke incl. permission-negative cases.

## Pending Minor findings (for final whole-branch review)
- T4: pricing guard is BEFORE UPDATE only (spec §4.2) → catalog.manage user can set price on INSERT (plan-mandated). seed grant reorders permissions array (cosmetic). sort RPC silently ignores unknown table_name (could add ELSE RAISE).
- Operational callout to user (T4): non-admin roles that managed inventory lose write access until granted inventory.catalog.manage via the role UI.
- Portability caveat in docs/future-plans.md: the T1 brand-dedup only re-points inventory variants; harden before any prod/dev replay.

## task-observer
Observation log at `skill-observations/log.md` (Obs 1–3 logged: PostgREST unreliable for schema existence; reviewers must anchor to live catalog not baseline; controller should pre-verify live facts before dispatching migration implementers). last-review-date.txt = 2026-08-08.
