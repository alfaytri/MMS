-- Expand permission system from module-level to per-page view+manage granularity.
-- This migration:
--   1. Maps old permission slugs → new slugs in all custom_roles.permissions arrays
--   2. Adds new page-level permissions for pages that previously shared a parent permission
--   3. Updates the Owner role to include every permission
--   4. Updates RLS functions/policies that reference old permission slugs

BEGIN;

-- ─── 1. Slug renames: consolidate create+edit → manage ──────────────────────

-- Helper: replace one slug with another in all roles
CREATE OR REPLACE FUNCTION _perm_rename(old_slug TEXT, new_slug TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE custom_roles
  SET permissions = array_append(array_remove(permissions, old_slug), new_slug),
      updated_at  = now()
  WHERE old_slug = ANY(permissions)
    AND NOT (new_slug = ANY(permissions));

  -- Also remove old slug from roles that already have the new one
  UPDATE custom_roles
  SET permissions = array_remove(permissions, old_slug),
      updated_at  = now()
  WHERE old_slug = ANY(permissions)
    AND new_slug = ANY(permissions);
END;
$$;

-- Purchase: create+edit → manage
SELECT _perm_rename('purchase.orders.create', 'purchase.orders.manage');
SELECT _perm_rename('purchase.orders.edit',   'purchase.orders.manage');

-- Sales: create+edit → manage
SELECT _perm_rename('sales.orders.create', 'sales.orders.manage');
SELECT _perm_rename('sales.orders.edit',   'sales.orders.manage');

-- Orders: create+edit+assign → manage
SELECT _perm_rename('orders.create', 'orders.manage');
SELECT _perm_rename('orders.edit',   'orders.manage');
SELECT _perm_rename('orders.assign', 'orders.manage');

-- Quotations: create+edit → manage
SELECT _perm_rename('quotations.create', 'quotations.manage');
SELECT _perm_rename('quotations.edit',   'quotations.manage');

-- Invoices: create+edit → manage
SELECT _perm_rename('invoices.create', 'invoices.manage');
SELECT _perm_rename('invoices.edit',   'invoices.manage');

-- Calendar: edit-order+swap-teams → manage
SELECT _perm_rename('calendar.edit-order', 'calendar.manage');
SELECT _perm_rename('calendar.swap-teams', 'calendar.manage');

-- Reports: export → manage
SELECT _perm_rename('reports.export', 'reports.manage');

-- ─── 2. Contracts split: contracts.view → per-page ──────────────────────────

-- Any role with contracts.view gets both contracts.quotations.view + contracts.live.view
UPDATE custom_roles
SET permissions = array_cat(
      array_remove(permissions, 'contracts.view'),
      ARRAY['contracts.quotations.view', 'contracts.live.view']
    ),
    updated_at = now()
WHERE 'contracts.view' = ANY(permissions);

-- contracts.create → contracts.quotations.manage
SELECT _perm_rename('contracts.create', 'contracts.quotations.manage');

-- contracts.edit → contracts.live.manage + contracts.quotations.manage (if not already present)
UPDATE custom_roles
SET permissions = CASE
      WHEN NOT ('contracts.live.manage' = ANY(permissions))
        THEN array_append(permissions, 'contracts.live.manage')
      ELSE permissions
    END,
    updated_at = now()
WHERE 'contracts.edit' = ANY(permissions);

UPDATE custom_roles
SET permissions = CASE
      WHEN NOT ('contracts.quotations.manage' = ANY(permissions))
        THEN array_append(permissions, 'contracts.quotations.manage')
      ELSE permissions
    END,
    updated_at = now()
WHERE 'contracts.edit' = ANY(permissions);

-- Remove the old contracts.edit slug
UPDATE custom_roles
SET permissions = array_remove(permissions, 'contracts.edit'),
    updated_at  = now()
WHERE 'contracts.edit' = ANY(permissions);

-- ─── 3. New page permissions — grant to roles that had related access ────────

-- Roles with purchase.orders.view also get receivals + payments view
UPDATE custom_roles
SET permissions = array_cat(permissions, ARRAY['purchase.receivals.view', 'purchase.payments.view']),
    updated_at  = now()
WHERE 'purchase.orders.view' = ANY(permissions)
  AND NOT ('purchase.receivals.view' = ANY(permissions));

-- Roles with purchase.orders.manage also get receivals + payments manage
UPDATE custom_roles
SET permissions = array_cat(permissions, ARRAY['purchase.receivals.manage', 'purchase.payments.manage']),
    updated_at  = now()
WHERE 'purchase.orders.manage' = ANY(permissions)
  AND NOT ('purchase.receivals.manage' = ANY(permissions));

-- Roles with sales.orders.view also get sales.invoices.view
UPDATE custom_roles
SET permissions = array_append(permissions, 'sales.invoices.view'),
    updated_at  = now()
WHERE 'sales.orders.view' = ANY(permissions)
  AND NOT ('sales.invoices.view' = ANY(permissions));

-- Roles with sales.orders.manage also get sales.invoices.manage
UPDATE custom_roles
SET permissions = array_append(permissions, 'sales.invoices.manage'),
    updated_at  = now()
WHERE 'sales.orders.manage' = ANY(permissions)
  AND NOT ('sales.invoices.manage' = ANY(permissions));

-- Roles with teams.team_leader.view get teams.team_leader.manage
UPDATE custom_roles
SET permissions = array_append(permissions, 'teams.team_leader.manage'),
    updated_at  = now()
WHERE 'teams.team_leader.view' = ANY(permissions)
  AND NOT ('teams.team_leader.manage' = ANY(permissions));

-- Roles with teams.map.view get teams.map.manage
UPDATE custom_roles
SET permissions = array_append(permissions, 'teams.map.manage'),
    updated_at  = now()
WHERE 'teams.map.view' = ANY(permissions)
  AND NOT ('teams.map.manage' = ANY(permissions));

-- ─── 4. Update Owner role with ALL permissions ──────────────────────────────

UPDATE custom_roles
SET permissions = ARRAY[
  -- Master Data
  'master_data.companies.view', 'master_data.companies.manage',
  'master_data.divisions.view', 'master_data.divisions.manage',
  'master_data.warehouses.view', 'master_data.warehouses.manage',
  'master_data.inventory.view', 'master_data.inventory.manage',
  'master_data.suppliers.view', 'master_data.suppliers.manage',
  'master_data.customers.view', 'master_data.customers.manage',
  'master_data.service_customers.view', 'master_data.service_customers.manage',
  'master_data.services.view', 'master_data.services.manage', 'master_data.services.approve',
  'master_data.subscriptions.view', 'master_data.subscriptions.manage',
  'master_data.users.view', 'master_data.users.manage',
  'master_data.roles.view', 'master_data.roles.manage',
  'master_data.audit.view',
  'master_data.admin.view', 'master_data.admin.manage',
  -- Purchase
  'purchase.orders.view', 'purchase.orders.manage',
  'purchase.approvals.view', 'purchase.approvals.manage',
  'purchase.approvals.chain.manage', 'purchase.approvals.bypass',
  'purchase.shipments.view', 'purchase.shipments.manage',
  'purchase.landed_costs.view', 'purchase.landed_costs.manage',
  'purchase.warehouses.view', 'purchase.warehouses.manage',
  'purchase.returns.view', 'purchase.returns.manage',
  'purchase.receivals.view', 'purchase.receivals.manage',
  'purchase.payments.view', 'purchase.payments.manage',
  'purchase.dead_stock.view',
  'purchase.bills.view', 'purchase.bills.manage',
  'purchase.rfq.view', 'purchase.rfq.manage',
  -- Sales
  'sales.orders.view', 'sales.orders.manage',
  'sales.invoices.view', 'sales.invoices.manage',
  'sales.returns.view', 'sales.returns.manage',
  'sales.deliveries.view', 'sales.deliveries.manage',
  'sales.credit_notes.view', 'sales.credit_notes.manage',
  -- Orders
  'orders.view', 'orders.manage',
  -- Quotations
  'quotations.view', 'quotations.manage',
  -- Contracts
  'contracts.quotations.view', 'contracts.quotations.manage',
  'contracts.live.view', 'contracts.live.manage',
  'contracts.activate',
  -- Invoices & Payments
  'invoices.view', 'invoices.manage',
  'payments.view', 'payments.manage',
  -- Teams
  'teams.view', 'teams.manage',
  'employees.view', 'employees.manage',
  'teams.team_leader.view', 'teams.team_leader.manage',
  'teams.map.view', 'teams.map.manage',
  -- System
  'system.admin', 'system.import', 'system.export',
  -- Calendar
  'calendar.view', 'calendar.manage',
  -- Reports
  'reports.view', 'reports.manage',
  -- Contact Centre
  'contact_centre.view'
],
updated_at = now()
WHERE name = 'Owner';

-- Also update the system Admin role (is_system = true)
UPDATE custom_roles
SET permissions = ARRAY[
  'master_data.companies.view', 'master_data.companies.manage',
  'master_data.divisions.view', 'master_data.divisions.manage',
  'master_data.warehouses.view', 'master_data.warehouses.manage',
  'master_data.inventory.view', 'master_data.inventory.manage',
  'master_data.suppliers.view', 'master_data.suppliers.manage',
  'master_data.customers.view', 'master_data.customers.manage',
  'master_data.service_customers.view', 'master_data.service_customers.manage',
  'master_data.services.view', 'master_data.services.manage', 'master_data.services.approve',
  'master_data.subscriptions.view', 'master_data.subscriptions.manage',
  'master_data.users.view', 'master_data.users.manage',
  'master_data.roles.view', 'master_data.roles.manage',
  'master_data.audit.view',
  'master_data.admin.view', 'master_data.admin.manage',
  'purchase.orders.view', 'purchase.orders.manage',
  'purchase.approvals.view', 'purchase.approvals.manage',
  'purchase.approvals.chain.manage', 'purchase.approvals.bypass',
  'purchase.shipments.view', 'purchase.shipments.manage',
  'purchase.landed_costs.view', 'purchase.landed_costs.manage',
  'purchase.warehouses.view', 'purchase.warehouses.manage',
  'purchase.returns.view', 'purchase.returns.manage',
  'purchase.receivals.view', 'purchase.receivals.manage',
  'purchase.payments.view', 'purchase.payments.manage',
  'purchase.dead_stock.view',
  'purchase.bills.view', 'purchase.bills.manage',
  'purchase.rfq.view', 'purchase.rfq.manage',
  'sales.orders.view', 'sales.orders.manage',
  'sales.invoices.view', 'sales.invoices.manage',
  'sales.returns.view', 'sales.returns.manage',
  'sales.deliveries.view', 'sales.deliveries.manage',
  'sales.credit_notes.view', 'sales.credit_notes.manage',
  'orders.view', 'orders.manage',
  'quotations.view', 'quotations.manage',
  'contracts.quotations.view', 'contracts.quotations.manage',
  'contracts.live.view', 'contracts.live.manage',
  'contracts.activate',
  'invoices.view', 'invoices.manage',
  'payments.view', 'payments.manage',
  'teams.view', 'teams.manage',
  'employees.view', 'employees.manage',
  'teams.team_leader.view', 'teams.team_leader.manage',
  'teams.map.view', 'teams.map.manage',
  'system.admin', 'system.import', 'system.export',
  'calendar.view', 'calendar.manage',
  'reports.view', 'reports.manage',
  'contact_centre.view'
],
updated_at = now()
WHERE is_system = true;

-- ─── 5. Update RLS: is_contract_visible function ────────────────────────────

CREATE OR REPLACE FUNCTION public.is_contract_visible(p_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- (a) System Admin role
    EXISTS (
      SELECT 1
      FROM profiles p
      JOIN user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
      WHERE p.auth_user_id = auth.uid()
        AND cr.is_system = true
    )
    OR
    -- (b) Super-viewer (owner / accountant) via JWT
    (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR
    -- (c) Has any contracts permission AND division overlap
    EXISTS (
      SELECT 1
      FROM contracts c
      JOIN profiles p ON p.auth_user_id = auth.uid()
      JOIN user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
      JOIN user_divisions ud ON ud.profile_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = p_contract_id
        AND d.slug = ANY(c.divisions)
        AND (
          'contracts.quotations.view'   = ANY(cr.permissions) OR
          'contracts.quotations.manage' = ANY(cr.permissions) OR
          'contracts.live.view'         = ANY(cr.permissions) OR
          'contracts.live.manage'       = ANY(cr.permissions) OR
          'contracts.activate'          = ANY(cr.permissions)
        )
    )
    OR
    -- (d) Legacy JWT-based division match
    EXISTS (
      SELECT 1
      FROM contracts c
      JOIN divisions d ON d.slug = ANY(c.divisions)
      WHERE c.id = p_contract_id
        AND d.id = ANY(
          ARRAY(
            SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids')
          )::UUID[]
        )
    )
  );
$$;

-- ─── 6. Update RLS: invoice void policy (invoices.edit → invoices.manage) ───

DROP POLICY IF EXISTS "Accounting/admin can void invoices" ON invoices;
CREATE POLICY "Accounting/admin can void invoices"
  ON invoices FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    status = 'void'
    AND EXISTS (
      SELECT 1
      FROM   profiles p
      JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN   custom_roles cr       ON cr.id           = ucr.role_id
      WHERE  p.auth_user_id = (SELECT auth.uid())
        AND  cr.deleted_at IS NULL
        AND  (cr.is_system = true OR 'invoices.manage' = ANY(cr.permissions))
    )
  );

DROP POLICY IF EXISTS "Accounting/admin can insert credit_notes" ON credit_notes;
CREATE POLICY "Accounting/admin can insert credit_notes"
  ON credit_notes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM   profiles p
      JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN   custom_roles cr       ON cr.id           = ucr.role_id
      WHERE  p.auth_user_id = (SELECT auth.uid())
        AND  cr.deleted_at IS NULL
        AND  (cr.is_system = true OR 'invoices.manage' = ANY(cr.permissions))
    )
  );

-- ─── 7. Update storage policies (contracts.activate stays unchanged) ────────
-- No changes needed — contracts.activate slug is preserved.

-- ─── 8. Clean up helper function ────────────────────────────────────────────

DROP FUNCTION IF EXISTS _perm_rename(TEXT, TEXT);

COMMIT;
