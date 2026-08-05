-- Enum Conversion Pass 1: Native-enum retypes (safe columns)
--
-- Converts 8 text columns to native Postgres enum types. Values in code
-- and CHECK constraints already conform to the target enums; this migration
-- adds structural type-safety at the DB level.
--
-- Pre-flight guards below abort with a clear error if any legacy row has
-- a value outside the target enum set. Safer than a silent USING cast.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New enum types
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.audit_severity AS ENUM ('info', 'warning', 'error', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.credit_group_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inventory_check_step_role AS ENUM (
    'accounting_manager',
    'inventory_manager',
    'responsible_person',
    'brand_manager',
    'owner'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. Pre-flight: verify all existing values fit the target enums
--    Aborts the whole migration if any row has an unexpected value.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  bad_values text;
BEGIN
  -- activity_log.severity -> audit_severity
  SELECT string_agg(DISTINCT severity, ', ') INTO bad_values
  FROM public.activity_log
  WHERE severity NOT IN ('info', 'warning', 'error', 'critical');
  IF bad_values IS NOT NULL THEN
    RAISE EXCEPTION 'activity_log.severity has unexpected values: %', bad_values;
  END IF;

  -- tool_asset_units.condition -> tool_condition
  SELECT string_agg(DISTINCT condition, ', ') INTO bad_values
  FROM public.tool_asset_units
  WHERE condition IS NOT NULL
    AND condition NOT IN ('New', 'Good', 'Fair', 'Maintenance');
  IF bad_values IS NOT NULL THEN
    RAISE EXCEPTION 'tool_asset_units.condition has unexpected values: %', bad_values;
  END IF;

  -- tool_asset_units.status -> tool_status
  SELECT string_agg(DISTINCT status, ', ') INTO bad_values
  FROM public.tool_asset_units
  WHERE status IS NOT NULL
    AND status NOT IN ('available', 'assigned', 'maintenance', 'retired');
  IF bad_values IS NOT NULL THEN
    RAISE EXCEPTION 'tool_asset_units.status has unexpected values: %', bad_values;
  END IF;

  -- bills.status -> invoice_status
  SELECT string_agg(DISTINCT status, ', ') INTO bad_values
  FROM public.bills
  WHERE status IS NOT NULL
    AND status NOT IN ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'void');
  IF bad_values IS NOT NULL THEN
    RAISE EXCEPTION 'bills.status has unexpected values: %', bad_values;
  END IF;

  -- bills.payment_status -> invoice_payment_status
  SELECT string_agg(DISTINCT payment_status, ', ') INTO bad_values
  FROM public.bills
  WHERE payment_status NOT IN ('unpaid', 'partially_paid', 'paid', 'overdue');
  IF bad_values IS NOT NULL THEN
    RAISE EXCEPTION 'bills.payment_status has unexpected values: %', bad_values;
  END IF;

  -- customer_credit_group_requests.status -> credit_group_request_status
  SELECT string_agg(DISTINCT status, ', ') INTO bad_values
  FROM public.customer_credit_group_requests
  WHERE status NOT IN ('pending', 'approved', 'rejected', 'cancelled');
  IF bad_values IS NOT NULL THEN
    RAISE EXCEPTION 'customer_credit_group_requests.status has unexpected values: %', bad_values;
  END IF;

  -- customer_credit_group_approvals.status -> approval_status
  SELECT string_agg(DISTINCT status, ', ') INTO bad_values
  FROM public.customer_credit_group_approvals
  WHERE status NOT IN ('pending', 'approved', 'rejected');
  IF bad_values IS NOT NULL THEN
    RAISE EXCEPTION 'customer_credit_group_approvals.status has unexpected values: %', bad_values;
  END IF;

  -- inventory_check_approvals.step_role -> inventory_check_step_role
  SELECT string_agg(DISTINCT step_role, ', ') INTO bad_values
  FROM public.inventory_check_approvals
  WHERE step_role NOT IN ('accounting_manager', 'inventory_manager', 'responsible_person', 'brand_manager', 'owner');
  IF bad_values IS NOT NULL THEN
    RAISE EXCEPTION 'inventory_check_approvals.step_role has unexpected values: %', bad_values;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Drop constraints, indexes, and views that reference the target columns
--    (partial-index predicates and view column types conflict with type change)
-- ---------------------------------------------------------------------------

ALTER TABLE public.customer_credit_group_requests
  DROP CONSTRAINT IF EXISTS customer_credit_group_requests_status_check;

ALTER TABLE public.customer_credit_group_approvals
  DROP CONSTRAINT IF EXISTS customer_credit_group_approvals_status_check;

ALTER TABLE public.bills
  DROP CONSTRAINT IF EXISTS bills_payment_status_check;

ALTER TABLE public.bills
  DROP CONSTRAINT IF EXISTS bills_status_check;

-- Partial index predicates compare column to text literals; must be recreated
-- after the type change so the literals are cast to the new enum.
DROP INDEX IF EXISTS public.idx_bills_payment_status;
DROP INDEX IF EXISTS public.ccgr_customer_pending_idx;
DROP INDEX IF EXISTS public.ccga_pending_idx;

-- supplier_bills view was already dropped by 20260721150000; nothing to do.

-- Drop DEFAULTs before the type change; re-add typed defaults after.
ALTER TABLE public.activity_log                     ALTER COLUMN severity       DROP DEFAULT;
ALTER TABLE public.tool_asset_units                 ALTER COLUMN condition      DROP DEFAULT;
ALTER TABLE public.tool_asset_units                 ALTER COLUMN status         DROP DEFAULT;
ALTER TABLE public.bills                            ALTER COLUMN status         DROP DEFAULT;
ALTER TABLE public.bills                            ALTER COLUMN payment_status DROP DEFAULT;
ALTER TABLE public.customer_credit_group_requests   ALTER COLUMN status         DROP DEFAULT;
ALTER TABLE public.customer_credit_group_approvals  ALTER COLUMN status         DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- 4. ALTER COLUMN ... TYPE using explicit enum cast
-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_log
  ALTER COLUMN severity TYPE public.audit_severity USING severity::public.audit_severity;

ALTER TABLE public.tool_asset_units
  ALTER COLUMN condition TYPE public.tool_condition USING condition::public.tool_condition;

ALTER TABLE public.tool_asset_units
  ALTER COLUMN status TYPE public.tool_status USING status::public.tool_status;

ALTER TABLE public.bills
  ALTER COLUMN status TYPE public.invoice_status USING status::public.invoice_status;

ALTER TABLE public.bills
  ALTER COLUMN payment_status TYPE public.invoice_payment_status USING payment_status::public.invoice_payment_status;

ALTER TABLE public.customer_credit_group_requests
  ALTER COLUMN status TYPE public.credit_group_request_status USING status::public.credit_group_request_status;

ALTER TABLE public.customer_credit_group_approvals
  ALTER COLUMN status TYPE public.approval_status USING status::public.approval_status;

ALTER TABLE public.inventory_check_approvals
  ALTER COLUMN step_role TYPE public.inventory_check_step_role USING step_role::public.inventory_check_step_role;

-- ---------------------------------------------------------------------------
-- 5. Restore DEFAULTs (typed to the new enum)
-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_log                     ALTER COLUMN severity       SET DEFAULT 'info'::public.audit_severity;
ALTER TABLE public.tool_asset_units                 ALTER COLUMN condition      SET DEFAULT 'Good'::public.tool_condition;
ALTER TABLE public.tool_asset_units                 ALTER COLUMN status         SET DEFAULT 'available'::public.tool_status;
ALTER TABLE public.bills                            ALTER COLUMN status         SET DEFAULT 'draft'::public.invoice_status;
ALTER TABLE public.bills                            ALTER COLUMN payment_status SET DEFAULT 'unpaid'::public.invoice_payment_status;
ALTER TABLE public.customer_credit_group_requests   ALTER COLUMN status         SET DEFAULT 'pending'::public.credit_group_request_status;
ALTER TABLE public.customer_credit_group_approvals  ALTER COLUMN status         SET DEFAULT 'pending'::public.approval_status;

-- ---------------------------------------------------------------------------
-- 6. Recreate the partial index and view dropped in step 3
-- ---------------------------------------------------------------------------

CREATE INDEX idx_bills_payment_status
  ON public.bills(payment_status)
  WHERE payment_status <> 'paid'::public.invoice_payment_status;

CREATE INDEX ccgr_customer_pending_idx
  ON public.customer_credit_group_requests (customer_id)
  WHERE status = 'pending'::public.credit_group_request_status;

CREATE INDEX ccga_pending_idx
  ON public.customer_credit_group_approvals (request_id)
  WHERE status = 'pending'::public.approval_status AND is_active;

COMMIT;
