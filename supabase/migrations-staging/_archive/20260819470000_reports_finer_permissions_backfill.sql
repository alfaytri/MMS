-- Finer report permissions: reports.inventory.view (Product Cost, Revenue/COGS)
-- + reports.accounting.view (AR, AP, Cash, P&L). The report pages + nav now gate
-- on these instead of the blanket reports.view (PDF requirements §3 rule 3).
--
-- Backfill so nobody loses access on deploy: grant BOTH new keys to every
-- non-deleted role that currently holds reports.view. Owners fine-tune per role
-- afterward (e.g. drop reports.accounting.view from an Inventory-Manager role so
-- it sees inventory reports only). System-admin / Owner roles bypass all checks
-- (custom_roles.is_system_admin), so they need no grant. Idempotent — the
-- NOT ANY guards make a re-run a no-op.

UPDATE public.custom_roles
SET permissions = array_append(permissions, 'reports.inventory.view'),
    updated_at  = now()
WHERE 'reports.view' = ANY(permissions)
  AND NOT ('reports.inventory.view' = ANY(permissions))
  AND deleted_at IS NULL;

UPDATE public.custom_roles
SET permissions = array_append(permissions, 'reports.accounting.view'),
    updated_at  = now()
WHERE 'reports.view' = ANY(permissions)
  AND NOT ('reports.accounting.view' = ANY(permissions))
  AND deleted_at IS NULL;
