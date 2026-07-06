-- =============================================================================
-- Fresh Database Bootstrap
-- =============================================================================
-- Makes a freshly-created Supabase project self-sufficient after `db push`.
--
-- Solves three problems that exist on a brand-new DB:
--   1. No system roles are seeded (Admin, warehouse roles, approval-slot roles)
--      were previously in migrations_archive/ and never re-applied.
--   2. Auth signup does not create a profiles row → user hits "no profile linked".
--   3. Even with ADMIN_BOOTSTRAP_EMAIL, the very first user has no role assigned
--      → RLS blocks their reads/writes on real tables.
--
-- After this migration + a fresh db push, the onboarding flow is:
--   a) Supabase Studio → Authentication → Add User (email + password)
--   b) Log into the app → profile auto-created, Admin role auto-assigned
--   c) Use the app normally to create additional users
--
-- Every INSERT is idempotent (ON CONFLICT DO NOTHING) so re-running is safe.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Seed the built-in "Admin" role.
--    is_system = true → locked in UI (cannot be edited or deleted).
-- -----------------------------------------------------------------------------
INSERT INTO public.custom_roles (name, description, color, permissions, is_system)
VALUES (
  'Admin',
  'Full system access — all modules and all actions.',
  'bg-rose-500/15 text-rose-600 border-rose-500/30',
  ARRAY[
    -- Master Data
    'master_data.companies.view',  'master_data.companies.manage',
    'master_data.divisions.view',  'master_data.divisions.manage',
    'master_data.warehouses.view', 'master_data.warehouses.manage',
    'master_data.inventory.view',  'master_data.inventory.manage',
    'master_data.suppliers.view',  'master_data.suppliers.manage',
    'master_data.users.view',      'master_data.users.manage',
    'master_data.roles.view',      'master_data.roles.manage',
    'master_data.audit.view',
    'master_data.admin.view',      'master_data.admin.manage',
    -- Purchase
    'purchase.orders.view', 'purchase.orders.create', 'purchase.orders.edit',
    'purchase.approvals.view', 'purchase.approvals.manage',
    'purchase.shipments.view', 'purchase.shipments.manage',
    'purchase.landed_costs.view', 'purchase.landed_costs.manage',
    'purchase.warehouses.view', 'purchase.warehouses.manage',
    'purchase.returns.view', 'purchase.returns.manage',
    'purchase.dead_stock.view',
    -- Sales
    'sales.orders.view', 'sales.orders.create', 'sales.orders.edit',
    'sales.returns.view', 'sales.returns.manage',
    -- Orders
    'orders.view', 'orders.create', 'orders.edit', 'orders.assign',
    -- Contracts
    'contracts.view', 'contracts.create', 'contracts.edit',
    -- Invoices & Payments
    'invoices.view', 'invoices.create', 'invoices.edit',
    'payments.view', 'payments.manage',
    -- Teams & Employees
    'teams.view', 'teams.manage',
    'employees.view', 'employees.manage',
    -- System
    'system.admin', 'system.import', 'system.export'
  ],
  true
)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      permissions = EXCLUDED.permissions,
      is_system   = true;

-- -----------------------------------------------------------------------------
-- 2. Seed warehouse system roles: field_rp + inventory_manager.
-- -----------------------------------------------------------------------------
INSERT INTO public.custom_roles (name, description, is_system, permissions, color)
VALUES (
  'field_rp',
  'Field Responsible Person — physically manages a warehouse',
  true,
  ARRAY[
    'warehouse.stock.view',
    'warehouse.transfer.create',
    'warehouse.transfer.dispatch',
    'warehouse.transfer.receive',
    'warehouse.adjustment.request',
    'warehouse.check.count'
  ],
  'bg-blue-500/15 text-blue-700 border-blue-500/30'
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.custom_roles (name, description, is_system, permissions, color)
VALUES (
  'inventory_manager',
  'Inventory Manager — global oversight, approvals, and settings',
  true,
  ARRAY[
    'warehouse.stock.view',
    'warehouse.transfer.create',
    'warehouse.transfer.approve',
    'warehouse.adjustment.request',
    'warehouse.adjustment.approve',
    'warehouse.check.count',
    'warehouse.check.create',
    'warehouse.check.approve',
    'warehouse.settings.manage'
  ],
  'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
)
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Seed approval-slot roles used in workflow chains.
-- -----------------------------------------------------------------------------
INSERT INTO public.custom_roles (name, description, color, permissions, is_system, is_approval_slot)
VALUES
  ('Purchase Manager',  'Approval slot — Purchase Manager (PO chains)',      'bg-blue-500/15 text-blue-700 border-blue-500/30',     ARRAY[]::text[], true, true),
  ('Accountant',        'Approval slot — Accountant',                        'bg-amber-500/15 text-amber-700 border-amber-500/30',  ARRAY[]::text[], true, true),
  ('Brand Manager',     'Approval slot — Brand Manager (damage/write-off)',  'bg-purple-500/15 text-purple-700 border-purple-500/30', ARRAY[]::text[], true, true),
  ('Employee',          'Approval slot — Employee',                          'bg-slate-500/15 text-slate-700 border-slate-500/30',  ARRAY[]::text[], true, true),
  ('Warehouse Manager', 'Approval slot — Warehouse Manager',                 'bg-teal-500/15 text-teal-700 border-teal-500/30',     ARRAY[]::text[], true, true)
ON CONFLICT (name) DO NOTHING;

-- Flip the is_approval_slot flag on any pre-existing roles that also serve as slots.
UPDATE public.custom_roles
SET    is_approval_slot = true
WHERE  name IN ('Owner', 'Inventory Manager')
  AND  deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 4. Seed baseline payment methods (cash, pos) and the "Cash Customers"
--    credit group. The customer dialog looks up this group by name to bucket
--    cash-type customers. Without it, cash customers cannot be saved.
--    payment_methods was migrated to a junction table (see 20260629110000),
--    so we link the group to the two methods via credit_group_payment_methods.
-- -----------------------------------------------------------------------------
INSERT INTO public.payment_methods (name, slug, is_active, sort_order)
VALUES
  ('Cash', 'cash', true, 1),
  ('POS',  'pos',  true, 2)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.credit_groups (id, name, credit_limit, max_days)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Cash Customers',
  0,
  0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.credit_group_payment_methods (credit_group_id, payment_method_id)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, pm.id
FROM public.payment_methods pm
WHERE pm.slug IN ('cash', 'pos')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Trigger: auto-create a profile + assign Admin role for the FIRST auth user.
--
--    Fires only when there are zero profiles in the DB. For every subsequent
--    auth user, the trigger is a no-op — the admin API route handles profile
--    creation with full field data (title, is_division_manager, etc.).
--
--    Runs as SECURITY DEFINER so it can write to public.profiles and
--    public.user_custom_roles even though the trigger is on auth.users.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bootstrap_first_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_count int;
  v_admin_role_id uuid;
  v_new_profile_id uuid;
  v_full_name text;
BEGIN
  -- Only the very first auth user gets auto-bootstrapped.
  SELECT COUNT(*) INTO v_profile_count FROM public.profiles;
  IF v_profile_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Prefer full_name from user_metadata, fall back to email local-part.
  v_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(SPLIT_PART(NEW.email, '@', 1)), ''),
    'Admin'
  );

  INSERT INTO public.profiles (auth_user_id, email, full_name, user_type, is_active)
  VALUES (NEW.id, NEW.email, v_full_name, 'internal', true)
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO v_new_profile_id;

  -- If ON CONFLICT skipped, fetch the existing profile id so we can still assign the role.
  IF v_new_profile_id IS NULL THEN
    SELECT id INTO v_new_profile_id
    FROM public.profiles
    WHERE auth_user_id = NEW.id;
  END IF;

  SELECT id INTO v_admin_role_id
  FROM public.custom_roles
  WHERE name = 'Admin' AND deleted_at IS NULL
  LIMIT 1;

  IF v_new_profile_id IS NOT NULL AND v_admin_role_id IS NOT NULL THEN
    INSERT INTO public.user_custom_roles (profile_id, role_id)
    VALUES (v_new_profile_id, v_admin_role_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_first_user() FROM PUBLIC;

-- Drop any prior version of the trigger before recreating.
DROP TRIGGER IF EXISTS bootstrap_first_user_trg ON auth.users;

CREATE TRIGGER bootstrap_first_user_trg
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.bootstrap_first_user();

COMMIT;
