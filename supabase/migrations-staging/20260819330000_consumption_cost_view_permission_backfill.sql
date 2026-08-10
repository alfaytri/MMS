-- Dedicated consumption-cost permission: `consumption.cost.view`.
--
-- Cost visibility on the Consumption surfaces (New dialog, list, detail) used to
-- reuse `inventory.pricing.view`. The operator asked for a separate key so a
-- role can be allowed to see item pricing but NOT consumption COGS (or the
-- reverse). The UI gates switch to `consumption.cost.view` in the same change.
--
-- Backfill: grant the new key to every non-deleted role that currently holds
-- `inventory.pricing.view`, so today's cost-visible roles (Accounting, etc.)
-- keep seeing consumption cost on deploy. System-admin / Owner roles bypass all
-- checks (custom_roles.is_system_admin), so they need no grant. Idempotent — the
-- NOT ANY guard makes a re-run a no-op.

UPDATE public.custom_roles
SET permissions = array_append(permissions, 'consumption.cost.view'),
    updated_at  = now()
WHERE 'inventory.pricing.view' = ANY(permissions)
  AND NOT ('consumption.cost.view' = ANY(permissions))
  AND deleted_at IS NULL;
