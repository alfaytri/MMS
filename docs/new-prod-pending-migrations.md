# New-prod — Pending Migration Batch (Warehouse Item Requests + Notification Routing)

- **Created:** 2026-08-13
- **Target:** new-prod `optishfnnctrhffpoywg` (app `alfaytriinventory.vercel.app`, builds from `deploy/warehouse-shipping`)
- **Status:** ⏸ NOT applied to new-prod. Applied + verified on **staging** (`mwvblpgbgxipvrevkeff`) only.
- **Prerequisite:** rotate the exposed new-prod DB password + service-role key, then set `NEW_DB_URL` (pooler connection string) in the environment.

## ⚠️ Frontend ↔ DB coupling (read before pushing)

The frontend for both phases is on `feature/item-requests-and-notifications`. Once that lands on `deploy/warehouse-shipping` and is pushed, **new-prod rebuilds**. The pushed frontend calls the DB objects created by the migrations below. **If the frontend deploys to new-prod before these migrations are applied:**

- Requested Items tab, custody buy-new request, resolve/fulfil → error (missing `warehouse_item_requests`, changed `rpc_request_warehouse_item` signature, missing `rpc_resolve_item_request`).
- **Notification routing on EXISTING flows breaks** — PO approval submit/amend, PO edit-request, receival edit, transfers, stock-adjustment, inventory-check, credit-group all now call `recipients_for_permission`, which won't exist on new-prod. The onSuccess-based sites fail the notification silently; the PO-submit path (notification inside the mutation) surfaces an error after the status already changed.

**Therefore: apply this batch to new-prod BEFORE (or in the same window as) pushing the frontend to `deploy/warehouse-shipping`.**

## The batch — apply in filename order (new-prod is currently ~`20260820001300`)

**Phase 1 — Warehouse Item Requests (7):**
1. `20260821000000_warehouse_item_requests_table.sql`
2. `20260821000100_rpc_request_warehouse_item_persist.sql`
3. `20260821000200_rpc_resolve_item_request.sql`
4. `20260821000300_warehouse_item_requests_permissions.sql`
5. `20260821000400_request_group_id.sql`
6. `20260821000500_custody_assign_request_group.sql`
7. `20260821000600_request_item_request_group.sql`

**Phase 2 — Notification routing (3):**
8. `20260822000000_recipients_for_permission.sql`
9. `20260822000100_item_request_use_resolver.sql`  (depends on #2 + #8)
10. `20260822000200_low_stock_use_resolver.sql`  (depends on #8)

All ten are committed in `supabase/migrations/` (and mirrored in `supabase/migrations-staging/`).

## Apply (once `NEW_DB_URL` is set)

```bash
npx supabase db push --db-url "$NEW_DB_URL"
```

(`db push` applies every pending migration in order; new-prod already has everything through `20260820001300`.)

## Post-apply verification

- `recipients_for_permission` exists, `prosecdef=true`, granted to `authenticated,service_role`.
- `warehouse_item_requests` table + RLS present; `rpc_resolve_item_request` present.
- `rpc_request_warehouse_item` has the 6-arg signature (incl. `p_request_group_id`) and sources recipients from the resolver.
- `request_group_id` column present on `warehouse_transfers` + `warehouse_item_requests`.
- `check_low_stock_and_notify` sources recipients from the resolver (message text intact).
- Smoke on new-prod: submit a PO for approval (notification sends), create an item request, confirm the Requested Items tab loads.

## Notes

- `notify.*` permission keys need no migration — they are plain strings stored in `custom_roles.permissions` when granted in the role editor.
- No `NEXT_PUBLIC_ENABLED_MODULES` change needed — that gating was removed; the permission UI is driven by `NAV_TREE`.
