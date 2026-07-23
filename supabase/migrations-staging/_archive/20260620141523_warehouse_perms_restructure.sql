-- Restructure Warehouse permissions: add a top-level access gate +
-- per-tab view keys. Existing action keys (warehouse.transfer.create,
-- warehouse.check.count, warehouse.adjustment.request, etc.) are kept
-- as-is so no existing role loses anything.
--
-- For every role that already holds a related action permission, we
-- seed the matching new view-key here so the tab keeps showing up after
-- the UI starts gating on it.
--
-- New keys introduced:
--   warehouse.access              — master gate (Master Data ▸ Warehouse link)
--   warehouse.warehouses.view     — Warehouses tab
--   warehouse.transfers.view      — Transfers tab
--   warehouse.adjustments.view    — Adjustments tab
--   warehouse.checks.view         — Inv. Checks tab
--   warehouse.stock_value.view    — Stock Value tab
--   warehouse.movements.view      — Movements tab
--   warehouse.receivals.view      — Receivals & Deliveries tab

BEGIN;

-- Helper: idempotent array-append (only adds the key if it isn't there yet).
-- Implemented inline per role / per key so the migration is re-runnable.

-- 1. warehouse.access — anyone with ANY warehouse.* perm
UPDATE custom_roles
SET    permissions = permissions || ARRAY['warehouse.access']
WHERE  deleted_at IS NULL
  AND  NOT ('warehouse.access' = ANY(permissions))
  AND  EXISTS (SELECT 1 FROM unnest(permissions) p WHERE p LIKE 'warehouse.%');

-- 2. warehouse.warehouses.view — anyone who can manage warehouse settings
UPDATE custom_roles
SET    permissions = permissions || ARRAY['warehouse.warehouses.view']
WHERE  deleted_at IS NULL
  AND  NOT ('warehouse.warehouses.view' = ANY(permissions))
  AND  'warehouse.settings.manage' = ANY(permissions);

-- 3. warehouse.transfers.view — anyone with ANY transfer action perm
UPDATE custom_roles
SET    permissions = permissions || ARRAY['warehouse.transfers.view']
WHERE  deleted_at IS NULL
  AND  NOT ('warehouse.transfers.view' = ANY(permissions))
  AND  EXISTS (SELECT 1 FROM unnest(permissions) p WHERE p LIKE 'warehouse.transfer.%');

-- 4. warehouse.adjustments.view — anyone who can request adjustments
UPDATE custom_roles
SET    permissions = permissions || ARRAY['warehouse.adjustments.view']
WHERE  deleted_at IS NULL
  AND  NOT ('warehouse.adjustments.view' = ANY(permissions))
  AND  'warehouse.adjustment.request' = ANY(permissions);

-- 5. warehouse.checks.view — anyone with ANY check perm
UPDATE custom_roles
SET    permissions = permissions || ARRAY['warehouse.checks.view']
WHERE  deleted_at IS NULL
  AND  NOT ('warehouse.checks.view' = ANY(permissions))
  AND  EXISTS (SELECT 1 FROM unnest(permissions) p WHERE p LIKE 'warehouse.check.%');

-- 6. warehouse.stock_value.view — anyone who can view stock
UPDATE custom_roles
SET    permissions = permissions || ARRAY['warehouse.stock_value.view']
WHERE  deleted_at IS NULL
  AND  NOT ('warehouse.stock_value.view' = ANY(permissions))
  AND  'warehouse.stock.view' = ANY(permissions);

-- 7. warehouse.movements.view — anyone who can view stock
UPDATE custom_roles
SET    permissions = permissions || ARRAY['warehouse.movements.view']
WHERE  deleted_at IS NULL
  AND  NOT ('warehouse.movements.view' = ANY(permissions))
  AND  'warehouse.stock.view' = ANY(permissions);

-- 8. warehouse.receivals.view — anyone with purchase.receivals.view or sales.deliveries.view
UPDATE custom_roles
SET    permissions = permissions || ARRAY['warehouse.receivals.view']
WHERE  deleted_at IS NULL
  AND  NOT ('warehouse.receivals.view' = ANY(permissions))
  AND  ('purchase.receivals.view' = ANY(permissions) OR 'sales.deliveries.view' = ANY(permissions));

COMMIT;
