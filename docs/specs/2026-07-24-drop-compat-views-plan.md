# Option 2 — Rewrite legacy functions and drop the three compat views

**Status:** planning
**Date:** 2026-07-24
**Blocked by:** none
**Blocks:** any future migration that assumes only `user_data` / `so_po_returns` / `inventory_item_brand_variants` exist

## Context

The 2026-07-24 rename batch introduced three backward-compat updatable views so legacy stored functions kept working without a rewrite:

| View | Underlying table | Created in |
|---|---|---|
| `public.profiles` | `user_data` | Batch C — `20260724180000` |
| `public.returns` | `so_po_returns` | Batch A — `20260724160002` |
| `public.inventory_brand_variants` | `inventory_item_brand_variants` | Batch C — `20260724180001` |

`security_invoker = on` was added later (`20260724210000`) so RLS is enforced through the views. They are safe today, but every future maintainer has to keep two names in mind for the same table. This plan removes the debt.

`customer_credit_summary` stays — it is a load-bearing computed view read by `useCustomerCredit`, not a rename compat shim.

## Functions that still reference the old names

Enumerated via `grep -B25 "FROM|UPDATE|INTO|DELETE FROM.*<old-name>" supabase/migrations/*.sql` and de-duplicating by the latest `CREATE OR REPLACE FUNCTION` per function.

### `profiles` — 12 functions

**Excluded-module (safe to drop, not rewrite)**
- `approve_service_change` — Services module
- `reject_service_change` — Services module
- `submit_service_change` — Services module
- `update_pending_service_change` — Services module
- `withdraw_service_change` — Services module
- `is_contract_visible` — Contracts module

**Live modules (rewrite)**
- `create_sale_order` (18-arg overload)
- `create_sale_order` (17-arg legacy overload)
- `resubmit_sale_order`
- `check_is_division_manager`
- `submit_credit_group_change`

**RLS / auth (delicate — rewrite last)**
- `has_admin_permission` — referenced by nearly every RLS policy
- `bootstrap_first_user` — trigger on `auth.users`, gates first-user setup

### `returns` — 7 functions

- `dispatch_return`
- `undispatch_return`
- `restock_return`
- `create_return_lines`
- `rpc_cancel_po_return_dispatch`
- `rpc_process_po_return_dispatch`
- `rpc_process_return_restock`

### `inventory_brand_variants` — 8 functions

- `batch_update_reserved_qty`
- `batch_update_variant_prices`
- `fn_refresh_incoming_qty`
- `fn_refresh_reserved_qty`
- `fn_update_linked_services_count`
- `recalc_average_cost`
- `update_reserved_qty`
- `create_tool_item_with_default_variant`

## Phases

Each phase is exactly one migration file so rollback stays scoped. Smoke-test on staging between phases; do not chain them.

### Phase 1 — Drop excluded-module functions — ~15 min

Migration: `20260725100000_drop_services_contracts_profile_functions.sql`

```
DROP FUNCTION IF EXISTS public.approve_service_change(...) CASCADE;
DROP FUNCTION IF EXISTS public.reject_service_change(...) CASCADE;
DROP FUNCTION IF EXISTS public.submit_service_change(...) CASCADE;
DROP FUNCTION IF EXISTS public.update_pending_service_change(...) CASCADE;
DROP FUNCTION IF EXISTS public.withdraw_service_change(...) CASCADE;
DROP FUNCTION IF EXISTS public.is_contract_visible(...) CASCADE;
```

**Rollback:** none needed — those tables/modules were dropped from staging in Batch A/B; the functions are dead code.

**Smoke test:** none required — functions have no callers under `src/`.

**Result:** `profiles` refs 12 → 6.

### Phase 2 — Rewrite sale-order functions — ~30 min

Migration: `20260725100001_rewrite_sale_order_functions_use_user_data.sql`

Rewrite three functions replacing `FROM profiles WHERE auth_user_id = auth.uid()` with `FROM user_data WHERE auth_user_id = auth.uid()`. Keep every attribute intact:
- `create_sale_order(...18 args...)`
- `create_sale_order(...17 args...)`
- `resubmit_sale_order(uuid)`

Attributes to preserve verbatim:
- `LANGUAGE plpgsql`
- `SECURITY DEFINER`
- `SET search_path TO 'public'`
- Full argument list, return type, and body (only the FROM clause changes)

**Rollback:** `CREATE OR REPLACE` back to the version from `20260724110001` / `20260724110002` / `20260627109000`.

**Smoke test:** create a cash SO and a credit SO from `sales/create-so`. Both must succeed and land in `sale_orders` with a fresh `so_number`.

**Result:** `profiles` refs 6 → 3.

### Phase 3 — Rewrite inventory triggers + utilities — ~45 min

Migration: `20260725100002_rewrite_inventory_brand_variant_functions.sql`

Rewrite the 8 functions, swapping `inventory_brand_variants` → `inventory_item_brand_variants` in every `FROM` / `UPDATE` / `INSERT INTO` clause. Do not change return types (`trigger`, `numeric`, `void`) — every trigger and every INSERT/UPDATE binding must continue to fire.

**Trigger-binding sanity check** (run after the migration):
```sql
SELECT tgname, tgrelid::regclass, proname
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE p.proname IN ('fn_refresh_incoming_qty', 'fn_refresh_reserved_qty',
                    'recalc_average_cost', 'update_reserved_qty',
                    'fn_update_linked_services_count')
  AND NOT tgisinternal;
```
Row count must be non-zero for each expected trigger.

**Smoke test:** create a PO with 2 line items, receive them, confirm `inventory_item_brand_variants` row's `average_cost`, `on_hand_qty`, and `reserved_qty` update as expected. Create an SO reserving one item, confirm `reserved_qty` moves.

**Result:** zero non-view references to `inventory_brand_variants` remain.

### Phase 4 — Rewrite return-workflow RPCs — ~45 min

Migration: `20260725100003_rewrite_return_functions_use_so_po_returns.sql`

Rewrite the 7 functions, swapping `returns` → `so_po_returns` in every clause. Watch for `RETURNS` keyword (part of function signature) — only bare `returns` used as a table name changes.

**Smoke test:** on staging, dispatch a PO return, verify status transitions to `dispatched`; restock the return, verify status transitions to `restocked`; cancel a dispatch, verify status reverts.

**Result:** zero non-view references to `returns` remain.

### Phase 5 — Rewrite RLS / auth functions — ~1 hr

Migration: `20260725100004_rewrite_admin_and_bootstrap_functions.sql`

Rewrite three delicate functions:
- `has_admin_permission(uuid) RETURNS boolean` — signature must not change; nearly every RLS policy references it by name
- `bootstrap_first_user() RETURNS trigger` — trigger on `auth.users`; must return `NEW` and complete without error even when the row already exists
- `check_is_division_manager(uuid) RETURNS boolean`
- `submit_credit_group_change(uuid, uuid, ...)`

**Extra care:**
- **Before applying**, `SELECT proname, prosecdef, prorettype::regtype FROM pg_proc WHERE proname IN (...)` to snapshot current attributes
- **After applying**, re-run the same query. Every prosecdef / prorettype must match
- Test login as a non-admin user: must still succeed
- Create a fresh auth user via Dashboard: bootstrap trigger must attach the profile and Admin role

**Rollback:** restore the previous body via `CREATE OR REPLACE` from the last known-good migration.

**Result:** zero non-view references to `profiles` remain.

### Phase 6 — Drop the three compat views + reload — ~15 min

Migration: `20260725100005_drop_compat_views.sql`

```
DROP VIEW public.profiles;
DROP VIEW public.returns;
DROP VIEW public.inventory_brand_variants;
NOTIFY pgrst, 'reload schema';
```

**Pre-flight:** re-run the survey greps and confirm zero function bodies still reference the old names. If any remain (someone added a new function referencing the compat view between phases), stop and go back.

**Smoke test after:**
- Nav renders for admin + non-admin users
- Create PO / SO / Return
- Master Data → Users list loads
- Warehouse stock adjustment
- Login as a non-admin user

**Rollback:** recreate the three views with the same body used in `20260724160002` / `20260724180000` / `20260724180001`, plus `WITH (security_invoker = on)`. Ten lines each.

## Guardrails

1. **One migration per phase.** No batching. Failed phases don't cascade.
2. **Preserve every function attribute verbatim.** `SECURITY DEFINER`, `SET search_path`, return type, argument list — a signature change silently detaches triggers and breaks policy references.
3. **After every phase:** `npm run lint && npm run build` locally. No TS impact expected but confirms.
4. **Manual smoke test after phases 3, 4, and 5.** These touch runtime paths users hit constantly.
5. **Phase 6 is the point of no easy return.** Only run it after phases 1–5 pass all smoke tests. Rollback exists but is fiddly.

## Estimated total effort

| Phase | Effort |
|---|---|
| 1 — drop excluded functions | 15 min |
| 2 — rewrite sale-order functions | 30 min |
| 3 — rewrite inventory triggers/utilities | 45 min |
| 4 — rewrite return RPCs | 45 min |
| 5 — rewrite RLS/auth functions | 60 min |
| 6 — drop views | 15 min |
| **Total** | **~3.5 hours** if smooth, **~4–5 hours** with testing |

## Known risks

- **`has_admin_permission` return type or argument list drift** would break every RLS policy attached to it. Snapshot with `pg_proc` before rewrite; assert unchanged after.
- **`bootstrap_first_user` trigger regression** would prevent new users from being created via Dashboard. Verify with a throwaway user.
- **Trigger detachment on inventory functions** — `pg_trigger` sanity check in Phase 3 catches this. If a trigger is missing, restore it manually via `CREATE TRIGGER ... ON <table> ... EXECUTE FUNCTION <name>`.
- **`RETURNS` keyword vs `returns` table name** in Phase 4 — use word-boundary regex in the rewrite (`\breturns\b`) to avoid mangling function signatures.

## Success criteria

- `SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname IN ('profiles', 'returns', 'inventory_brand_variants')` returns 0 rows
- Staging app: create PO, create SO, dispatch return, restock return, login as non-admin user, all pass without error
- Supabase Studio no longer shows any UNRESTRICTED tag on these tables/views (they're gone)
