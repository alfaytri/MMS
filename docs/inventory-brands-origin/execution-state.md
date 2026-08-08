# Inventory Brands & Origin — Execution State (resume doc)

**Purpose:** durable state so context can be `/clear`ed and execution resumed. Read
THIS + the SDD ledger `.superpowers/sdd/progress.md` (git-ignored, survives on disk)
to continue. Authoritative fact-set — do NOT re-derive what's here.

- **Branch:** `feature/inventory-brands-and-origin`  •  **DB:** STAGING `mwvblpgbgxipvrevkeff`
- **Plan:** `docs/plans/2026-08-08-inventory-brands-origin.md`  •  **Spec:** `docs/specs/2026-08-08-inventory-brands-origin-design.md`
- **Method:** superpowers:subagent-driven-development (fresh implementer per task → task review → mark complete in the ledger). Scripts in the skill dir: `scripts/task-brief PLAN N`, `scripts/review-package BASE HEAD`.
- **Commit policy (user):** commit each code task when its review passes; UI tasks with `⏸ OPERATOR SMOKE` commit only after the user confirms "works". Migrations/types commit immediately. Every commit ends with BOTH trailers (HEREDOC):
  `Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>` + `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- **Browser testing ALLOWED** (rule relaxed). Dev server usually running on **localhost:3000**. To test UI: open the in-app Browser to :3000; the login screen appears — the USER logs in (owner / their password) because Claude must NOT type passwords. Then drive via read_page/computer (screenshots need the pane displayed; ref-churn from `staleTime:0` refetches — re-read before each click).
- **Reliable live-DB introspection:** `npx supabase db query --linked -o csv "<SQL>"` (direct catalog, immune to PostgREST cache). `npx supabase inspect db table-stats` for table existence. Do NOT trust supabase-js for existence (schema-cache flaps; `head:true` = false "exists") or the stale `baseline_schema.sql`. Service-role key in `.env.local` for read scripts (run from repo root).

## Verified live-DB facts (do NOT re-derive)
- `inventory_item_brand_variants` cols: id, item_id, brand(text NOT NULL), code, cost_price, selling_price, stock_level(int, nullable, DEFAULT 0), incoming, average_cost, created_at, updated_at, reserved_qty, linked_services_count, status, sort_order, reorder_point, damaged_qty, brand_id(uuid null), country_id(int null). **`margin_percent` DOES NOT EXIST.**
- Trigger `trg_sync_brand_variants_brand_text` (`BEFORE INSERT OR UPDATE OF brand_id`) sets `brand`=brands.name WHEN brand_id non-null; does NOTHING when null. → writing `brand=''` when brand_id null is needed on CREATE/clear, but on EDIT of an already-null-brand leaf you must OMIT `brand` to preserve legacy text (done in the dialog).
- `country_codes`: 33 active real countries; cols id(int), code(+974), iso(QA), flag(🇶🇦 emoji — Windows renders as "QA"), name(Qatar). Variant FK `inventory_item_brand_variants_country_id_fkey`.
- Tables `service_brands`, `brand_group_members`, `contract_services` DO NOT EXIST live (baseline stale). Only `brands` + `inventory_item_brand_variants` reference brands now. `brands` = 299 rows (many are junk part-CODES like "00","032F1204" — data cleanup is a possible follow-up).
- Helpers `_user_has_permission(uuid,text)` + `_current_user_data_id()`: SECURITY DEFINER, executable by authenticated.
- Seeded admin roles `Owner`(86) + `exploit`(1) both carry `system.admin` key (bypass validatePermissionSet) and got inventory.catalog.view/manage + pricing.manage.
- RPCs (in types): `rpc_archive_inventory_category(p_category_id uuid)`, `rpc_update_inventory_sort_orders(p_updates jsonb)` (jsonb array `{table_name,id,sort_order}`).
- Pricing guard `inventory_pricing_guard_trg` (BEFORE UPDATE) gates cost_price/selling_price only (IS DISTINCT FROM), raises 42501 without pricing.manage; UPDATE-only.
- RLS: categories/items/variants/brands = SELECT-open + INS/UPD/DEL gated on `inventory.catalog.manage` (`inv_cat_*`/`inv_item_*`/`inv_var_*`/`inv_brand_*`). Photos bucket writes gated too.
- **401 on `rpc/get_effective_attributes`** seen during smoke = pre-existing: it's the attribute-chips N+1 (SECURITY INVOKER, EXECUTE granted to authenticated), 401 = expired session/anon → re-login fixes. NOT caused by this feature. (Deferred: batch the N+1.)

## Code facts
- Permissions (4 keys) in `src/lib/permissions.ts` + `PermissionTree.tsx`: `inventory.catalog.view/manage`, `inventory.pricing.view/manage`. `validatePermissionSet` (blocking in RoleFormDialog.tsx:251) requires a `.view` per `.manage`.
- `useCreateBrand` (useBrands.ts) returns `{ brand, created }`.
- `useInventory.ts`: `BrandVariantInsert` has `brand?:string`, `brand_id?:string|null`, `country_id?:number|null`. `useInventoryBrandVariants` (the TREE's hook) selects `*, brands(name), country_codes(name, flag, iso)` `.limit(500)`; `useCreateBrandVariant` invalidates BARE `queryKeys.inventory.brandVariantsV2` (reload-bug fix) + defaults `brand ??''`. `useArchiveInventoryCategory`→`rpc_archive_inventory_category`; `useUpdateSortOrders(table)`→`rpc_update_inventory_sort_orders`. (Note: the older `useBrandVariants` hook — modified in Task 11 — has ZERO callers; tree uses `useInventoryBrandVariants`.)
- Pure helpers: `src/lib/inventory/{brandNormalize,groupVariants,categoryLevels}.ts` (+ tests). `groupVariants` → BrandGroup[] (Unbranded last, null-origin last). `buildLevels`/`ancestorPath` for the N-level category picker (Task 15).
- `useCountryCodes()` (src/hooks/useCountryCodes.ts): `{id:number, code, iso, flag, name}` active.
- **Redesign components (committed bdcd2185):** `BrandCombobox.tsx` (searchable, A–Z, always-visible "Add new brand"), `OriginCombobox.tsx` (searchable, A–Z, `flag name`), `BrandGroupRow.tsx` (brand header + "+ Add origin", cells mirror data columns for responsive), `OriginVariantRow.tsx` (origin label or "—"; price+available always visible; receival/edit/archive/FIFO-expand; has vestigial ↑/↓ arrows — offered to remove), `BrandVariantEditDialog.tsx` (3 modes via `fixedBrand?: {id:string|null; name:string}`; warehouse-alloc REMOVED; conditional brand write; friendly 23505). `BrandVariantRow.tsx` now unused by ItemRow (delete later). `ItemRow.tsx` maps variants→VariantLite→groupVariants→BrandGroupRow + item-level "+ Add brand".

## Completed tasks (commits)
T0 26ac2582 • T1 951cd7cc (origin+integrity, +brand dedup) • T2 bee2646f • T3 510b64ca • T4 f3a278a8 (RLS, opus-reviewed) • T5 1689473b (types) • T6 00df4631+ac9c5b7a (perms incl pricing.view) • T7 54edf48b (brandNormalize) • T8 a3af762b (groupVariants) • T9 bf856b90 (categoryLevels) • T10 b1eb1fa8 (useCreateBrand honest) • T11 b996cd52 (variant hooks+RPCs) • **T12+T13 bdcd2185 (nested brand→origin tree + searchable pickers — user smoke-confirmed "works great")**. Docs: 9a6ab244.

## Remaining tasks
- **T14 (small, non-smoke, NEXT — brief at `.superpowers/sdd/task-14-brief.md`):** `src/components/services/inventory/ItemEditDialog.tsx` — add `warrantyPolicyId` to the `isDirty` comparison. Refs: state `warrantyPolicyId` L47; seeded from `item?.warranty_policy_id` L69; submitted L196; `isDirty` block starts L139 (currently `const isDirty = isEdit && item` … a chain of `||` comparisons ~L139-172, `warrantyPolicyId` MISSING). Add `|| warrantyPolicyId !== (item?.warranty_policy_id ?? null)`. tsc clean → commit `fix(inventory): ItemEditDialog dirty-check includes warranty`.
- **T15 (UI, ⏸ SMOKE):** `CategoryEditDialog.tsx` (~L239-284) — replace fixed 3-level parent picker with N side-by-side selects via `buildLevels(flat, selectedParentId)` + `ancestorPath` (pre-seed edit); flat cats from `useAllCategoriesFlat` (src/hooks/useInventoryTree.ts:137-153). Side-by-side, name_en labels, never id. (This is the dialog that opens when you click a category NAME in the tree.)
- **T16 (UI, ⏸ SMOKE):** manual inventory-receival dialog (`grep -rn "useInventoryReceivals\\|InventoryReceivalDialog" src/components`; hook src/hooks/useInventoryReceivals.ts) — its item/variant selector resolves the (item, brand, origin) leaf so new stock+FIFO land on the right brand_variant_id (reuse BrandCombobox/OriginCombobox).
- **T17 (docs):** `docs/flows-registry.md` entries (Create/Edit Brand-Origin Variant, Archive Category RPC, Update Sort Orders RPC, Manual Receival origin-aware) + 5-point security checklist row in PROGRESS.md `## 🔒 Security Audit Log` + PROGRESS Completed/InProgress + `EOD/EOD-2026-08-08.md`. Docs commit.
- **T18 (verify):** tsc clean; `npm run test:run` (inventory helper suites); `npx supabase db push --dry-run` up to date; grep no `USING (true)` in the 4 new migrations; ⏸ full operator smoke incl. permission-negative (no catalog.manage → API write refused; catalog.manage w/o pricing.manage → price change 42501).

## Optional follow-ups OFFERED (user said redesign "works great" without them)
- Drop flag emoji so origins read just "Qatar" (Windows shows "QA Qatar").
- Push code-like brand names (00, 032F1204…) below real names in the picker, and/or a brands-table data cleanup.
- Remove the vestigial origin-row ↑/↓ arrows (origins auto-sort by country).

## Pending Minor findings (for final whole-branch review, T18)
- T4: pricing guard BEFORE UPDATE only (spec §4.2) → catalog.manage can set price on INSERT (plan-mandated). seed grant reorders permissions array (cosmetic). sort RPC ignores unknown table_name silently.
- OPERATIONAL callout to user (T4): non-admin roles that managed inventory lose write access until granted inventory.catalog.manage in the role UI.
- Portability caveat in docs/future-plans.md: T1 brand-dedup only re-points inventory variants; harden before any prod/dev replay.
- OriginCombobox: a deactivated country on an existing variant shows placeholder (legacy edge); popover width var is a base-ui vs radix mismatch (repo-wide pattern).

## task-observer
Log `skill-observations/log.md` (Obs 1–3: PostgREST unreliable for schema existence; reviewers must anchor to live catalog; controller pre-verify live facts before dispatching migration implementers). last-review-date.txt = 2026-08-08.
