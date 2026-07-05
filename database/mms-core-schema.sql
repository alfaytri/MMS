-- ============================================================================
-- MMS Core Schema — Inventory + Sales + Purchase
-- ============================================================================
-- Generated: 2026-07-05
-- Source: Live production schema (pg_dump) filtered to core modules
--
-- Modules included:
--   Foundation (companies, divisions, profiles, RBAC, settings)
--   Customers (customers, addresses, phones, credit groups)
--   Inventory (categories, items, brand variants, FIFO, stock movements)
--   Warehouses (warehouses, transfers, adjustments, checks)
--   Purchase (suppliers, POs, receivals, shipments, landed costs)
--   Sales (sale orders, deliveries, returns, approvals)
--   Finance (invoices, payments, credit notes, payment plans)
--   Audit (activity log, notification trail)
--
-- Excluded modules:
--   Orders & Contracts, Services, Teams & Employees, Contact Centre,
--   Promotions & Subscriptions, Quality Control, QuickBooks sync
--
-- Usage:
--   1. Create a new Supabase project
--   2. Run this file against the database:
--      psql -h db.<ref>.supabase.co -U postgres -d postgres -f mms-core-schema.sql
--   3. Configure .env.local with the new project URL and keys
-- ============================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

-- ============================================================================
-- SECTION 1: ENUM TYPES
-- ============================================================================

CREATE TYPE public.address_type AS ENUM (
    'blue-plate',
    'google-coords'
);

CREATE TYPE public.approval_source_type AS ENUM (
    'sale_order',
    'order'
);

CREATE TYPE public.approval_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

CREATE TYPE public.approval_type AS ENUM (
    'margin',
    'credit'
);

CREATE TYPE public.campaign_status AS ENUM (
    'active',
    'scheduled',
    'expired',
    'disabled'
);

CREATE TYPE public.confirmation_status AS ENUM (
    'not_sent',
    'sent',
    'confirmed',
    'no_response',
    'manually_confirmed'
);

CREATE TYPE public.contract_status AS ENUM (
    'active',
    'expiring_soon',
    'overdue_payment',
    'cancelled',
    'completed',
    'draft',
    'manager_review',
    'customer_pending',
    'approved',
    'rejected',
    'expired'
);

CREATE TYPE public.contract_type AS ENUM (
    'preventive',
    'area',
    'general'
);

CREATE TYPE public.credit_note_status AS ENUM (
    'draft',
    'approved',
    'issued',
    'redeemed'
);

CREATE TYPE public.division AS ENUM (
    'maintenance',
    'cleaning',
    'kitchen',
    'pest-control'
);

CREATE TYPE public.employee_status AS ENUM (
    'active',
    'vacation',
    'archived',
    'unassigned',
    'on-task'
);

CREATE TYPE public.follow_up_request_status AS ENUM (
    'pending',
    'confirmed',
    'cancelled',
    'rejected'
);

CREATE TYPE public.instruction_content_type AS ENUM (
    'text',
    'pdf'
);

CREATE TYPE public.instruction_type AS ENUM (
    'pre-service',
    'post-service'
);

CREATE TYPE public.inventory_type AS ENUM (
    'products',
    'spare-parts',
    'consumables',
    'tools'
);

CREATE TYPE public.invoice_source AS ENUM (
    'order',
    'contract',
    'quotation'
);

CREATE TYPE public.invoice_status AS ENUM (
    'draft',
    'sent',
    'partially_paid',
    'paid',
    'overdue',
    'cancelled',
    'void'
);

CREATE TYPE public.message_source AS ENUM (
    'whatsapp',
    'whatsapp_api',
    'phone',
    'sms',
    'email',
    'whatsapp_whapi',
    '3cx_call',
    'manual'
);

CREATE TYPE public.notification_category AS ENUM (
    'order',
    'contract',
    'invoice',
    'payment',
    'system',
    'reminder'
);

CREATE TYPE public.notification_channel AS ENUM (
    'whatsapp',
    'sms',
    'email',
    'push'
);

CREATE TYPE public.notification_status AS ENUM (
    'sent',
    'failed',
    'pending',
    'delivered'
);

CREATE TYPE public.notification_trigger AS ENUM (
    'manual',
    'scheduled',
    'event',
    'reminder'
);

CREATE TYPE public.order_quotation_status AS ENUM (
    'draft',
    'sent',
    'pending_approval',
    'approved',
    'customer_approved',
    'rejected',
    'expired',
    'converted',
    'cancelled'
);

CREATE TYPE public.order_status AS ENUM (
    'scheduled',
    'confirmed',
    'in-progress',
    'completed',
    'pending-approval',
    'cancelled',
    'waitlist',
    'pending-confirmation',
    'customer-unavailable'
);

CREATE TYPE public.payment_status AS ENUM (
    'completed',
    'pending',
    'failed',
    'refunded',
    'processing'
);

CREATE TYPE public.po_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'partially_received',
    'received',
    'completed',
    'cancelled'
);

CREATE TYPE public.po_type AS ENUM (
    'rfq',
    'draft',
    'confirmed'
);

CREATE TYPE public.promotion_rule_type AS ENUM (
    'percentage',
    'fixed',
    'buy_one_get_one',
    'buy_x_get_y',
    'buy_x_discount_get_y'
);

CREATE TYPE public.qc_priority AS ENUM (
    'high',
    'medium',
    'low'
);

CREATE TYPE public.qc_schedule_status AS ENUM (
    'pending',
    'in-progress',
    'completed',
    'missed'
);

CREATE TYPE public.receival_status AS ENUM (
    'pending_approval',
    'approved',
    'rejected'
);

CREATE TYPE public.reminder_channel AS ENUM (
    'Email',
    'SMS',
    'WhatsApp'
);

CREATE TYPE public.return_source_type AS ENUM (
    'sale_order',
    'order',
    'purchase_order'
);

CREATE TYPE public.return_status AS ENUM (
    'pending',
    'received',
    'restocked',
    'closed',
    'dispatched',
    'supplier_confirmed',
    'cancelled'
);

CREATE TYPE public.rfq_status AS ENUM (
    'draft',
    'sent',
    'received',
    'cancelled'
);

CREATE TYPE public.sale_delivery_status AS ENUM (
    'pending',
    'in_progress',
    'delivered',
    'cancelled'
);

CREATE TYPE public.sale_order_status AS ENUM (
    'quotation',
    'confirmed',
    'in_progress',
    'delivered',
    'cancelled',
    'pending_approval',
    'partial_delivery',
    'invoiced',
    'closed'
);

CREATE TYPE public.service_category AS ENUM (
    'Repair',
    'Installation',
    'Maintenance',
    'Cleaning',
    'Quick Service'
);

CREATE TYPE public.service_change_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

CREATE TYPE public.service_change_type AS ENUM (
    'add',
    'edit',
    'delete'
);

CREATE TYPE public.service_status AS ENUM (
    'active',
    'inactive'
);

CREATE TYPE public.service_type AS ENUM (
    'standard',
    'configurable'
);

CREATE TYPE public.shipment_mode AS ENUM (
    'air',
    'sea',
    'land',
    'manual'
);

CREATE TYPE public.shipment_status AS ENUM (
    'booked',
    'in_transit',
    'customs',
    'delivered',
    'delayed'
);

CREATE TYPE public.team_tag AS ENUM (
    'normal',
    'emergency',
    'qc',
    'site-visit'
);

CREATE TYPE public.tl_order_type AS ENUM (
    'order',
    'site-visit-single',
    'site-visit-contract',
    'contract',
    'backwork',
    'follow-up',
    'qc'
);

CREATE TYPE public.tool_condition AS ENUM (
    'New',
    'Good',
    'Fair',
    'Maintenance'
);

CREATE TYPE public.tool_status AS ENUM (
    'available',
    'assigned',
    'maintenance',
    'retired'
);

CREATE TYPE public.transfer_status AS ENUM (
    'pending',
    'in_transit',
    'pending_approval',
    'approved',
    'rejected',
    'received',
    'cancelled'
);

CREATE TYPE public.user_type AS ENUM (
    'internal',
    'customer',
    'employee',
    'team-leader'
);

CREATE TYPE public.voucher_type AS ENUM (
    'single_use',
    'multi_use',
    'limited'
);


-- ============================================================================
-- SECTION 2: FUNCTIONS (triggers + RPCs)
-- ============================================================================

CREATE FUNCTION public._set_lc_number() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.lc_number IS NULL OR NEW.lc_number = '' THEN
    NEW.lc_number := 'LC-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
      LPAD(nextval('lc_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public._user_has_permission(p_profile_id uuid, p_permission text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
    WHERE ucr.profile_id = p_profile_id
      AND (cr.is_system = true OR p_permission = ANY(cr.permissions))
  );
$$;

CREATE FUNCTION public.action_stock_adjustment_step(p_step_id uuid, p_action text, p_profile_id uuid, p_profile_name text, p_notes text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_step          RECORD;
  v_warehouse_id  UUID;
  v_remaining     INTEGER;
BEGIN
  IF p_action NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'p_action must be approved or rejected';
  END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile is required to action an approval step';
  END IF;

  -- NEW: mandatory rejection reason
  IF p_action = 'rejected' AND COALESCE(TRIM(p_notes), '') = '' THEN
    RAISE EXCEPTION 'A reason is required when rejecting an approval step';
  END IF;

  SELECT *
  INTO   v_step
  FROM   stock_adjustment_approvals
  WHERE  id = p_step_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval step not found';
  END IF;

  IF v_step.status <> 'pending' THEN
    RAISE EXCEPTION 'Step is not pending (current status: %)', v_step.status;
  END IF;

  SELECT warehouse_id
  INTO   v_warehouse_id
  FROM   stock_adjustments
  WHERE  id = v_step.adjustment_id;

  IF NOT user_can_action_adjustment_step(p_profile_id, v_step.step_role, v_warehouse_id) THEN
    RAISE EXCEPTION 'You do not have the % role required to action this step', v_step.step_label;
  END IF;

  UPDATE stock_adjustment_approvals
  SET    status       = p_action,
         profile_id   = p_profile_id,
         profile_name = COALESCE(p_profile_name, profile_name),
         action_at    = now(),
         notes        = NULLIF(p_notes,'')
  WHERE  id = p_step_id;

  IF p_action = 'rejected' THEN
    UPDATE stock_adjustment_approvals
    SET    status = 'rejected',
           notes  = 'Auto-rejected due to previous step rejection'
    WHERE  adjustment_id = v_step.adjustment_id
      AND  status = 'pending'
      AND  id <> p_step_id;

    UPDATE stock_adjustments
    SET    status            = 'rejected',
           approved_by       = p_profile_id,
           approved_by_name  = p_profile_name,
           approved_at       = now(),
           updated_at        = now()
    WHERE  id = v_step.adjustment_id;

    RETURN 'chain_rejected';
  END IF;

  SELECT COUNT(*) INTO v_remaining
  FROM   stock_adjustment_approvals
  WHERE  adjustment_id = v_step.adjustment_id
    AND  status = 'pending';

  IF v_remaining = 0 THEN
    PERFORM approve_stock_adjustment_inventory(
      p_adjustment_id => v_step.adjustment_id,
      p_approved_by   => p_profile_name
    );
    RETURN 'chain_completed';
  END IF;

  RETURN 'step_approved';
END;
$$;

CREATE FUNCTION public.add_workflow_step(p_workflow text, p_role_name text, p_role_desc text DEFAULT ''::text, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role_id   UUID;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
BEGIN
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit','credit_group','receival_edit') THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;
  IF TRIM(p_role_name) = '' THEN
    RAISE EXCEPTION 'Role name cannot be empty';
  END IF;

  SELECT id INTO v_role_id
  FROM custom_roles
  WHERE name = p_role_name AND deleted_at IS NULL;

  IF v_role_id IS NULL THEN
    INSERT INTO custom_roles (name, description, is_approval_slot, is_system, permissions)
    VALUES (TRIM(p_role_name), NULLIF(TRIM(p_role_desc),''), true, false, '[]'::jsonb)
    RETURNING id INTO v_role_id;
  ELSE
    UPDATE custom_roles SET is_approval_slot = true WHERE id = v_role_id;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(p_role_name), '\s+', '_', 'g'));

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM approval_workflow_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types
  ) VALUES (
    p_workflow, v_role_id, v_step_key, TRIM(p_role_name), v_max_order + 1,
    p_is_conditional, p_condition_types
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$$;

CREATE FUNCTION public.add_workflow_step(p_workflow text, p_role_name text, p_role_desc text DEFAULT ''::text, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[], p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role_id   UUID;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
  v_group_id  uuid := p_group_id;
BEGIN
  IF p_workflow NOT IN (
    'po','inv_check','stock_adj','sales_margin','sales_credit',
    'credit_group','receival_edit'
  ) THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;
  IF TRIM(p_role_name) = '' THEN
    RAISE EXCEPTION 'Role name cannot be empty';
  END IF;

  SELECT id INTO v_role_id
  FROM   custom_roles
  WHERE  name = p_role_name AND deleted_at IS NULL;

  IF v_role_id IS NULL THEN
    INSERT INTO custom_roles (name, description, is_approval_slot, is_system, permissions)
    VALUES (TRIM(p_role_name), NULLIF(TRIM(p_role_desc),''), true, false, '[]'::jsonb)
    RETURNING id INTO v_role_id;
  ELSE
    UPDATE custom_roles SET is_approval_slot = true WHERE id = v_role_id;
  END IF;

  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id
    FROM   approval_workflow_groups
    WHERE  workflow = p_workflow AND is_active = true
    ORDER BY group_order
    LIMIT  1;

    IF v_group_id IS NULL THEN
      INSERT INTO approval_workflow_groups (workflow, group_label, group_order, mode)
      VALUES (p_workflow, 'Default', 1, 'any_one')
      RETURNING id INTO v_group_id;
    END IF;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(p_role_name), '\s+', '_', 'g'));

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM   approval_workflow_steps
  WHERE  workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types, group_id
  ) VALUES (
    p_workflow, v_role_id, v_step_key, TRIM(p_role_name), v_max_order + 1,
    p_is_conditional, p_condition_types, v_group_id
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$$;

CREATE FUNCTION public.add_workflow_step_for_role(p_workflow text, p_role_id uuid, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role_name TEXT;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
BEGIN
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit','credit_group','receival_edit') THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;

  SELECT name INTO v_role_name
  FROM custom_roles
  WHERE id = p_role_id
    AND is_approval_slot = true
    AND deleted_at IS NULL;

  IF v_role_name IS NULL THEN
    RAISE EXCEPTION 'Role not found or is not an approval-slot role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE workflow = p_workflow
      AND role_id  = p_role_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This role is already a step in the % workflow', p_workflow;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(v_role_name), '\s+', '_', 'g'));

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE workflow = p_workflow AND step_key = v_step_key
      AND archived_at IS NULL
  ) THEN
    v_step_key := v_step_key || '_' || substr(gen_random_uuid()::text, 1, 4);
  END IF;

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM approval_workflow_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types
  ) VALUES (
    p_workflow, p_role_id, v_step_key, v_role_name, v_max_order + 1,
    p_is_conditional, p_condition_types
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$$;

CREATE FUNCTION public.add_workflow_step_for_role(p_workflow text, p_role_id uuid, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[], p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role_name TEXT;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
  v_group_id  uuid := p_group_id;
BEGIN
  IF p_workflow NOT IN (
    'po','inv_check','stock_adj','sales_margin','sales_credit',
    'credit_group','receival_edit'
  ) THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;

  SELECT name INTO v_role_name
  FROM   custom_roles
  WHERE  id = p_role_id
    AND  is_approval_slot = true
    AND  deleted_at IS NULL;

  IF v_role_name IS NULL THEN
    RAISE EXCEPTION 'Role not found or is not an approval-slot role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE  workflow = p_workflow
      AND  role_id  = p_role_id
      AND  archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This role is already a step in the % workflow', p_workflow;
  END IF;

  -- Auto-detect group when not provided
  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id
    FROM   approval_workflow_groups
    WHERE  workflow = p_workflow AND is_active = true
    ORDER BY group_order
    LIMIT  1;

    IF v_group_id IS NULL THEN
      INSERT INTO approval_workflow_groups (workflow, group_label, group_order, mode)
      VALUES (p_workflow, 'Default', 1, 'any_one')
      RETURNING id INTO v_group_id;
    END IF;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(v_role_name), '\s+', '_', 'g'));

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE  workflow = p_workflow AND step_key = v_step_key
      AND  archived_at IS NULL
  ) THEN
    v_step_key := v_step_key || '_' || substr(gen_random_uuid()::text, 1, 4);
  END IF;

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM   approval_workflow_steps
  WHERE  workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types, group_id
  ) VALUES (
    p_workflow, p_role_id, v_step_key, v_role_name, v_max_order + 1,
    p_is_conditional, p_condition_types, v_group_id
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$$;

CREATE FUNCTION public.advance_po_approval_tier(p_po_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_iteration  INT;
  v_next_rank  INT;
  v_all_done   BOOLEAN;
BEGIN
  -- C1: advisory lock to prevent concurrent execution for the same PO
  PERFORM pg_advisory_xact_lock(hashtext(p_po_id::text));

  -- C2: existence guard — bail if no approval rows exist for this PO
  IF NOT EXISTS (SELECT 1 FROM po_approvals WHERE po_id = p_po_id AND iteration = (
    SELECT COALESCE(MAX(iteration), 1) FROM po_approvals WHERE po_id = p_po_id
  )) THEN
    RETURN;
  END IF;

  -- I3: do not advance if PO is in a terminal non-pending state
  IF NOT EXISTS (
    SELECT 1 FROM purchase_orders
    WHERE id = p_po_id AND status = 'pending_approval'
  ) THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM po_approvals WHERE po_id = p_po_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM po_approvals
    WHERE po_id = p_po_id
      AND iteration = v_iteration
      AND is_active = true
      AND status NOT IN ('approved')
  ) INTO v_all_done;

  IF NOT v_all_done THEN RETURN; END IF;

  SELECT MIN(tier_rank) INTO v_next_rank
  FROM po_approvals
  WHERE po_id = p_po_id
    AND iteration = v_iteration
    AND is_active = false
    AND status = 'pending';

  IF v_next_rank IS NOT NULL THEN
    UPDATE po_approvals
    SET is_active = true
    WHERE po_id = p_po_id
      AND iteration = v_iteration
      AND tier_rank = v_next_rank;
  ELSE
    UPDATE purchase_orders SET status = 'approved' WHERE id = p_po_id;
  END IF;
END;
$$;

CREATE FUNCTION public.advance_sales_approval(p_so_id uuid, p_approval_type public.approval_type) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_iteration  INT;
  v_all_done   BOOLEAN;
  v_open_other BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_so_id::text || p_approval_type::text));

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM   sale_order_approvals
  WHERE  source_id = p_so_id AND approval_type = p_approval_type;

  SELECT NOT EXISTS (
    SELECT 1 FROM sale_order_approvals
    WHERE  source_id     = p_so_id
      AND  approval_type = p_approval_type
      AND  iteration     = v_iteration
      AND  status        <> 'approved'
  ) INTO v_all_done;

  IF NOT v_all_done THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM sale_order_approvals
    WHERE  source_id     = p_so_id
      AND  approval_type <> p_approval_type
      AND  status        = 'pending'
  ) INTO v_open_other;

  IF NOT v_open_other THEN
    UPDATE sale_orders SET status = 'confirmed' WHERE id = p_so_id;
  END IF;
END;
$$;

CREATE FUNCTION public.allocate_landed_cost(p_lc_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_lc                RECORD;
  v_apply_time        TIMESTAMPTZ := now();   -- single timestamp captured at entry
  v_grand_total       NUMERIC := 0;
  v_total_remaining   BIGINT  := 0;
  v_allocations       JSONB   := '[]'::JSONB;
  v_snapshot          JSONB   := '[]'::JSONB;
  v_bv                RECORD;
  v_bv_lc_share       NUMERIC;
  v_bv_remaining      BIGINT;
  v_sold              BIGINT;
  v_per_unit_lc       NUMERIC;
  v_inventory_portion NUMERIC;
  v_cogs_portion      NUMERIC;
BEGIN
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Landed cost % has already been applied', v_lc.lc_number;
  END IF;
  IF v_lc.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot apply voided landed cost %', v_lc.lc_number;
  END IF;

  SELECT COALESCE(SUM(ri.qty_received * ri.unit_cost), 0)
    INTO v_grand_total
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free          = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received     > 0;

  IF v_grand_total = 0 THEN
    RAISE EXCEPTION 'No eligible receival items found for landed cost %', v_lc.lc_number;
  END IF;

  FOR v_bv IN (
    SELECT
      ri.brand_variant_id,
      MAX(ri.item_name)                   AS item_name,
      MAX(ri.sku)                          AS sku,
      SUM(ri.qty_received)::BIGINT         AS qty_received,
      SUM(ri.qty_received * ri.unit_cost)  AS total_value,
      CASE WHEN SUM(ri.qty_received) > 0
        THEN SUM(ri.qty_received * ri.unit_cost) / SUM(ri.qty_received)
        ELSE 0 END                         AS avg_unit_cost
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free          = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received     > 0
   GROUP BY ri.brand_variant_id
  ) LOOP
    v_bv_lc_share := v_lc.total_amount * (v_bv.total_value / v_grand_total);

    -- Lock remaining FIFO layers; sum remaining qty.
    WITH locked_layers AS (
      SELECT remaining_qty
        FROM fifo_cost_layers
       WHERE brand_variant_id = v_bv.brand_variant_id
         AND remaining_qty    > 0
       FOR UPDATE
    )
    SELECT COALESCE(SUM(remaining_qty), 0)
      INTO v_bv_remaining
      FROM locked_layers;

    v_sold        := GREATEST(v_bv.qty_received - v_bv_remaining, 0);
    v_per_unit_lc := v_bv_lc_share / NULLIF(v_bv.qty_received, 0);

    -- Penny-safe split with explicit extremes (avoids 1-cent ghost rows).
    IF v_sold <= 0 THEN
      v_inventory_portion := v_bv_lc_share;
      v_cogs_portion      := 0;
    ELSIF v_bv_remaining <= 0 THEN
      v_inventory_portion := 0;
      v_cogs_portion      := v_bv_lc_share;
    ELSE
      v_inventory_portion := ROUND(v_bv_remaining * v_per_unit_lc, 2);
      v_cogs_portion      := v_bv_lc_share - v_inventory_portion;
    END IF;

    -- Allocation snapshot (rendered by the LC detail UI)
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'brand_variant_id',     v_bv.brand_variant_id,
      'item_name',            v_bv.item_name,
      'sku',                  v_bv.sku,
      'qty_received',         v_bv.qty_received,
      'qty_remaining_at_lc',  v_bv_remaining,
      'sold_qty',             v_sold,
      'original_unit_cost',   ROUND(v_bv.avg_unit_cost, 4),
      'per_unit_lc',          ROUND(COALESCE(v_per_unit_lc, 0), 4),
      'lc_per_unit',          ROUND(COALESCE(v_per_unit_lc, 0), 4),  -- legacy alias kept for existing UI
      'inventory_portion',    ROUND(v_inventory_portion, 2),
      'cogs_portion',         ROUND(v_cogs_portion, 2),
      'allocated_lc_total',   ROUND(v_bv_lc_share, 2),
      'updated_unit_cost',    ROUND(v_bv.avg_unit_cost + COALESCE(v_per_unit_lc, 0), 4),
      'allocated_cost',       ROUND(v_bv_lc_share / GREATEST(v_bv.qty_received, 1), 4)
    ));

    -- ── Inventory side ──────────────────────────────────────────────────────
    IF v_bv_remaining > 0 THEN
      -- Snapshot per-layer deltas before update (revert safety)
      SELECT v_snapshot || COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'layer_id',          id::TEXT,
          'brand_variant_id',  brand_variant_id::TEXT,
          'lc_per_unit_delta', v_per_unit_lc
        ))
        FROM fifo_cost_layers
        WHERE brand_variant_id = v_bv.brand_variant_id
          AND remaining_qty    > 0),
        '[]'::JSONB
      )
      INTO v_snapshot;

      UPDATE fifo_cost_layers
         SET landed_cost_per_unit = landed_cost_per_unit + v_per_unit_lc,
             total_unit_cost      = total_unit_cost      + v_per_unit_lc
       WHERE brand_variant_id = v_bv.brand_variant_id
         AND remaining_qty    > 0;

      PERFORM recalc_average_cost(v_bv.brand_variant_id);

      INSERT INTO inventory_stock_movements
        (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
         reference_type, reference_id, notes)
      VALUES
        (v_bv.brand_variant_id, v_bv.item_name, v_bv.sku,
         'cost_adjustment', v_bv_remaining, v_per_unit_lc,
         'landed_cost', p_lc_id,
         'LC ' || v_lc.lc_number || ': '
           || ROUND(v_inventory_portion, 2) || ' ' || v_lc.currency
           || ' over ' || v_bv_remaining || ' remaining units');

      v_total_remaining := v_total_remaining + v_bv_remaining;
    END IF;

    -- ── COGS side ───────────────────────────────────────────────────────────
    IF v_sold > 0 THEN
      INSERT INTO cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id, landed_cost_id,
        qty, unit_cost, total_cost, date, notes
      ) VALUES (
        v_bv.brand_variant_id, NULL, NULL, p_lc_id,
        v_sold, ROUND(COALESCE(v_per_unit_lc, 0), 4),
        ROUND(v_cogs_portion, 2),
        v_apply_time::DATE,
        'LC ' || v_lc.lc_number || ' applied ' || v_apply_time::DATE
          || ' over ' || v_sold || ' sold units'
      );
    END IF;
  END LOOP;

  UPDATE landed_costs
     SET item_allocations = v_allocations,
         applied_at       = v_apply_time,
         all_items_sold   = (v_total_remaining = 0),
         revert_snapshot  = v_snapshot,
         updated_at       = v_apply_time
   WHERE id = p_lc_id;

  RETURN v_allocations;
END;
$$;

CREATE FUNCTION public.allocate_payment_to_bill(p_payment_id uuid, p_bill_id uuid, p_amount numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_payment_total   NUMERIC;
  v_already_alloc   NUMERIC;
  v_bill_total      NUMERIC;
  v_manually_paid   BOOLEAN;
  v_total_paid      NUMERIC;
  v_new_status      TEXT;
BEGIN
  -- Lock payment row to serialize concurrent allocations
  SELECT amount INTO v_payment_total
  FROM payments WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;

  -- Verify bill exists and get manually_paid flag
  SELECT total_amount, manually_paid INTO v_bill_total, v_manually_paid
  FROM invoices WHERE id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill % does not exist', p_bill_id;
  END IF;

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than zero';
  END IF;

  -- Check total allocations would not exceed payment amount
  SELECT COALESCE(SUM(amount), 0) INTO v_already_alloc
  FROM payment_bill_allocations
  WHERE payment_id = p_payment_id
    AND bill_id != p_bill_id;

  IF v_already_alloc + p_amount > v_payment_total THEN
    RAISE EXCEPTION 'Allocation of % exceeds remaining payment balance of %',
      p_amount, v_payment_total - v_already_alloc;
  END IF;

  -- Upsert allocation
  INSERT INTO payment_bill_allocations (payment_id, bill_id, amount)
  VALUES (p_payment_id, p_bill_id, p_amount)
  ON CONFLICT (payment_id, bill_id)
  DO UPDATE SET amount = EXCLUDED.amount;

  -- Always recalculate the cached totals on the bill, even when manually_paid
  -- so the displayed paid_amount + balance stay correct.
  SELECT COALESCE(SUM(pba.amount), 0)
    INTO v_total_paid
    FROM payment_bill_allocations pba
   WHERE pba.bill_id = p_bill_id;

  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'
    WHEN v_total_paid > 0             THEN 'partially_paid'
    ELSE                                   'unpaid'
  END;

  UPDATE invoices
     SET paid_amount    = v_total_paid,
         payment_status = CASE WHEN v_manually_paid THEN payment_status ELSE v_new_status END
   WHERE id = p_bill_id;
END;
$$;

CREATE FUNCTION public.allocate_warehouse_stock(p_brand_variant_id uuid, p_warehouse_id uuid, p_target_qty integer, p_unit_cost numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_current_qty    INT;
  v_delta          INT;
  v_unassigned     INT;
  v_total_fifo     INT;
  v_stock_level    INT;
  v_opening_gap    INT;
  v_to_reassign    INT;
  v_from_gap       INT;
  v_to_create      INT;
  r                RECORD;
  v_remaining      INT;
  v_take           INT;
  v_final_qty      INT;
BEGIN
  SELECT COALESCE(SUM(remaining_qty), 0)
  INTO v_current_qty
  FROM fifo_cost_layers
  WHERE brand_variant_id = p_brand_variant_id
    AND warehouse_id = p_warehouse_id
    AND remaining_qty > 0;

  v_delta := p_target_qty - v_current_qty;

  -- ── No quantity change ───────────────────────────────────────────────────
  IF v_delta = 0 THEN
    IF p_unit_cost > 0 THEN
      UPDATE fifo_cost_layers
      SET unit_cost       = p_unit_cost,
          total_unit_cost = p_unit_cost
      WHERE brand_variant_id = p_brand_variant_id
        AND warehouse_id     = p_warehouse_id
        AND receival_id      IS NULL
        AND remaining_qty    > 0;

      PERFORM recalc_average_cost(p_brand_variant_id);
    END IF;
    RETURN;
  END IF;

  -- ── Quantity increase ────────────────────────────────────────────────────
  IF v_delta > 0 THEN

    SELECT COALESCE(SUM(remaining_qty), 0)
    INTO v_unassigned
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_brand_variant_id
      AND warehouse_id IS NULL
      AND remaining_qty > 0;

    SELECT COALESCE(SUM(remaining_qty), 0)
    INTO v_total_fifo
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_brand_variant_id
      AND remaining_qty > 0;

    SELECT stock_level INTO v_stock_level
    FROM inventory_brand_variants
    WHERE id = p_brand_variant_id;

    v_opening_gap := GREATEST(0, v_stock_level - v_total_fifo);

    v_to_reassign := LEAST(v_delta, v_unassigned);
    v_from_gap    := LEAST(v_delta - v_to_reassign, v_opening_gap);
    v_to_create   := v_delta - v_to_reassign - v_from_gap;

    IF v_to_reassign > 0 THEN
      v_remaining := v_to_reassign;
      FOR r IN
        SELECT id, remaining_qty
        FROM fifo_cost_layers
        WHERE brand_variant_id = p_brand_variant_id
          AND warehouse_id IS NULL
          AND remaining_qty > 0
        ORDER BY date ASC, created_at ASC, id ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining = 0;
        v_take := LEAST(v_remaining, r.remaining_qty);

        IF v_take = r.remaining_qty THEN
          UPDATE fifo_cost_layers SET warehouse_id = p_warehouse_id WHERE id = r.id;
        ELSE
          UPDATE fifo_cost_layers
          SET remaining_qty = remaining_qty - v_take
          WHERE id = r.id;

          INSERT INTO fifo_cost_layers (
            brand_variant_id, warehouse_id, receival_id, receival_number,
            date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
          )
          SELECT
            brand_variant_id, p_warehouse_id, receival_id, receival_number,
            date, v_take, unit_cost, landed_cost_per_unit, total_unit_cost, v_take
          FROM fifo_cost_layers WHERE id = r.id;
        END IF;

        v_remaining := v_remaining - v_take;
      END LOOP;
    END IF;

    IF v_from_gap > 0 THEN
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        p_brand_variant_id, p_warehouse_id, '2000-01-01'::DATE,
        v_from_gap, p_unit_cost, 0, p_unit_cost, v_from_gap
      );
    END IF;

    IF v_to_create > 0 THEN
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        p_brand_variant_id, p_warehouse_id, CURRENT_DATE,
        v_to_create, p_unit_cost, 0, p_unit_cost, v_to_create
      );

      UPDATE inventory_brand_variants
      SET stock_level = stock_level + v_to_create, updated_at = now()
      WHERE id = p_brand_variant_id;
    END IF;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      p_warehouse_id, p_brand_variant_id, '', 'adjustment',
      v_delta, p_unit_cost, 'initial_allocation', p_brand_variant_id,
      CASE
        WHEN v_to_reassign > 0 AND v_from_gap > 0 AND v_to_create > 0
          THEN format('Reassigned %s unassigned + %s opening stock + %s new', v_to_reassign, v_from_gap, v_to_create)
        WHEN v_to_reassign > 0 AND v_from_gap > 0
          THEN format('Reassigned %s unassigned + %s opening stock', v_to_reassign, v_from_gap)
        WHEN v_from_gap > 0 AND v_to_create > 0
          THEN format('Allocated %s opening stock + %s new', v_from_gap, v_to_create)
        WHEN v_from_gap > 0
          THEN format('Allocated %s units from opening stock (pre-FIFO)', v_from_gap)
        WHEN v_to_reassign > 0
          THEN format('Reassigned %s from unassigned stock', v_to_reassign)
        ELSE 'Initial stock allocation'
      END
    );

  -- ── Quantity decrease ────────────────────────────────────────────────────
  ELSE
    PERFORM deduct_fifo_layers(p_brand_variant_id, p_warehouse_id, ABS(v_delta), false);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      p_warehouse_id, p_brand_variant_id, '', 'adjustment',
      v_delta, p_unit_cost, 'initial_allocation', p_brand_variant_id,
      'Stock allocation adjustment'
    );
  END IF;

  -- Update cost on all opening-stock layers for this warehouse
  IF p_unit_cost > 0 THEN
    UPDATE fifo_cost_layers
    SET unit_cost       = p_unit_cost,
        total_unit_cost = p_unit_cost
    WHERE brand_variant_id = p_brand_variant_id
      AND warehouse_id     = p_warehouse_id
      AND receival_id      IS NULL
      AND remaining_qty    > 0;
  END IF;

  PERFORM recalc_average_cost(p_brand_variant_id);

  -- Verify final qty matches target
  SELECT COALESCE(SUM(remaining_qty), 0)
  INTO v_final_qty
  FROM fifo_cost_layers
  WHERE brand_variant_id = p_brand_variant_id
    AND warehouse_id     = p_warehouse_id
    AND remaining_qty    > 0;

  IF v_final_qty <> p_target_qty THEN
    RAISE EXCEPTION
      'allocate_warehouse_stock: qty mismatch — expected %, got % (delta %, reassigned %, from_gap %, new %)',
      p_target_qty, v_final_qty, v_delta, v_to_reassign, v_from_gap, v_to_create;
  END IF;
END;
$$;

CREATE FUNCTION public.apply_adjustment(p_adjustment_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_adj    RECORD;
  v_qty    INT;
  v_bv     RECORD;
BEGIN
  SELECT * INTO v_adj
  FROM inventory_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment not found';
  END IF;

  IF v_adj.status <> 'pending' THEN
    RAISE EXCEPTION 'Adjustment already processed';
  END IF;

  v_qty := ABS(v_adj.qty);

  IF v_adj.adjustment_type = 'increase' THEN
    SELECT average_cost INTO v_bv
    FROM inventory_brand_variants WHERE id = v_adj.brand_variant_id;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty,
      'adjustment'
    );

    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_adj.brand_variant_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    )
    SELECT
      v_adj.warehouse_id, v_adj.brand_variant_id,
      ibv.item_name, ibv.sku,
      'adjustment_in', v_qty, COALESCE(v_bv.average_cost, 0),
      'adjustment', p_adjustment_id
    FROM inventory_brand_variants ibv
    WHERE ibv.id = v_adj.brand_variant_id;

  ELSE
    PERFORM deduct_fifo_layers(v_adj.brand_variant_id, v_adj.warehouse_id, v_qty, TRUE);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    )
    SELECT
      v_adj.warehouse_id, v_adj.brand_variant_id,
      ibv.item_name, ibv.sku,
      'adjustment_out', -v_qty, ibv.average_cost,
      'adjustment', p_adjustment_id
    FROM inventory_brand_variants ibv
    WHERE ibv.id = v_adj.brand_variant_id;
  END IF;

  PERFORM recalc_average_cost(v_adj.brand_variant_id);

  UPDATE inventory_adjustments
  SET status = 'applied', updated_at = now()
  WHERE id = p_adjustment_id;
END;
$$;

CREATE FUNCTION public.apply_inventory_check_adjustments(p_check_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_check     RECORD;
  v_item      RECORD;
  v_bv        RECORD;
  v_result    RECORD;
  v_variance  INT;
BEGIN
  SELECT id, warehouse_id, status
  INTO v_check
  FROM inventory_checks
  WHERE id = p_check_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory check % not found', p_check_id;
  END IF;

  IF v_check.status <> 'approved' THEN
    RAISE EXCEPTION 'Check % is not approved (status: %)', p_check_id, v_check.status;
  END IF;

  -- Freeze the system stock snapshot before any FIFO/cost mutations
  PERFORM snapshot_inventory_check_system_qty(p_check_id);

  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, system_qty, counted_qty, variance, variance_type
    FROM inventory_check_items
    WHERE check_id = p_check_id
      AND is_counted = true
      AND variance IS NOT NULL
      AND variance <> 0
  LOOP
    v_variance := v_item.variance::INT;

    IF v_variance > 0 THEN
      SELECT average_cost INTO v_bv
      FROM inventory_brand_variants WHERE id = v_item.brand_variant_id;

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_item.brand_variant_id, v_check.warehouse_id, CURRENT_DATE,
        v_variance, COALESCE(v_bv.average_cost, 0), 0,
        COALESCE(v_bv.average_cost, 0), v_variance
      );

      UPDATE inventory_brand_variants
      SET stock_level = stock_level + v_variance, updated_at = now()
      WHERE id = v_item.brand_variant_id;

      PERFORM recalc_average_cost(v_item.brand_variant_id);

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        v_check.warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'inventory_check', v_variance, COALESCE(v_bv.average_cost, 0),
        'inventory_check', p_check_id,
        'Inventory check adjustment (increase): counted ' || v_item.counted_qty || ' vs system ' || v_item.system_qty
      );

    ELSIF v_variance < 0 THEN
      SELECT total_cost, weighted_unit_cost
      INTO v_result
      FROM deduct_fifo_layers(v_item.brand_variant_id, v_check.warehouse_id, ABS(v_variance), false);

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        v_check.warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'inventory_check', v_variance, v_result.weighted_unit_cost,
        'inventory_check', p_check_id,
        'Inventory check adjustment (decrease): counted ' || v_item.counted_qty || ' vs system ' || v_item.system_qty
      );
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.apply_receival_edit(p_edit_request_id uuid, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_req             RECORD;
  v_receival        RECORD;
  v_item_input      JSONB;
  v_bv_id           UUID;
  v_pli_id          UUID;
  v_old_qty         INT;
  v_new_qty         INT;
  v_old_cost        NUMERIC;
  v_new_cost        NUMERIC;
  v_delta           INT;
  v_layer_remaining BIGINT;
  v_sold_qty        BIGINT;
  v_has_applied_lc  BOOLEAN;
  v_lc_rec          RECORD;
  v_total_remaining BIGINT;
  v_receival_date   DATE;
  v_stock_level     INT;
  v_reserved_qty    INT;
BEGIN
  -- ── 1. Lock and validate the edit request ──────────────────────────────────
  SELECT * INTO v_req FROM receival_edit_requests WHERE id = p_edit_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edit request % not found', p_edit_request_id;
  END IF;
  IF v_req.status <> 'approved' THEN
    RAISE EXCEPTION 'Edit request % is not approved (status: %)', p_edit_request_id, v_req.status;
  END IF;
  IF v_req.expires_at IS NOT NULL AND v_req.expires_at < now() THEN
    UPDATE receival_edit_requests SET status = 'expired' WHERE id = p_edit_request_id;
    RAISE EXCEPTION 'Edit window expired. Please request a new edit.';
  END IF;

  -- ── 2. Lock the receival ────────────────────────────────────────────────────
  SELECT id, date INTO v_receival FROM receivals WHERE id = v_req.receival_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receival % not found', v_req.receival_id;
  END IF;
  v_receival_date := v_receival.date;

  -- ── 3. Pre-flight LC check ──────────────────────────────────────────────────
  PERFORM 1 FROM landed_costs
  WHERE v_req.receival_id = ANY(attached_receival_ids)
    AND applied_at IS NOT NULL AND voided_at IS NULL
  FOR SHARE;

  SELECT EXISTS(
    SELECT 1 FROM landed_costs
    WHERE v_req.receival_id = ANY(attached_receival_ids)
      AND applied_at IS NOT NULL AND voided_at IS NULL
  ) INTO v_has_applied_lc;

  -- ── 4. Process each item ────────────────────────────────────────────────────
  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items) LOOP

    SELECT ri.qty_received, ri.unit_cost, ri.brand_variant_id, ri.po_line_item_id
    INTO v_old_qty, v_old_cost, v_bv_id, v_pli_id
    FROM receival_items ri
    WHERE ri.id = (v_item_input->>'receival_item_id')::UUID
      AND ri.receival_id = v_req.receival_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'receival_item % not found (or does not belong to receival %)',
        v_item_input->>'receival_item_id', v_req.receival_id;
    END IF;

    v_new_qty  := (v_item_input->>'new_qty')::INT;
    v_new_cost := (v_item_input->>'new_unit_cost')::NUMERIC;
    v_delta    := v_new_qty - v_old_qty;

    IF v_new_qty IS NULL OR v_new_qty <= 0 THEN
      RAISE EXCEPTION 'new_qty must be a positive integer for item %', v_item_input->>'receival_item_id';
    END IF;
    IF v_new_cost IS NULL OR v_new_cost < 0 THEN
      RAISE EXCEPTION 'new_unit_cost must be non-negative for item %', v_item_input->>'receival_item_id';
    END IF;

    -- Sync PO line item received_qty (always, regardless of inventory linkage)
    IF v_delta <> 0 AND v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = GREATEST(0, received_qty + v_delta)
      WHERE id = v_pli_id;
    END IF;

    CONTINUE WHEN v_bv_id IS NULL;

    -- ── QTY CHANGE ────────────────────────────────────────────────────────────
    IF v_delta <> 0 THEN
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change qty: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      IF v_delta > 0 THEN
        UPDATE fifo_cost_layers
        SET qty           = qty           + v_delta,
            remaining_qty = remaining_qty + v_delta
        WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;

        UPDATE inventory_brand_variants
        SET stock_level = stock_level + v_delta, updated_at = now()
        WHERE id = v_bv_id;

        INSERT INTO inventory_stock_movements
          (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_bv_id, ii.name_en, ii.sku,
               'receival_edit', v_delta, v_old_cost,
               'receival_edit_request', p_edit_request_id,
               'Qty increase edit on receival ' || v_req.receival_id
        FROM inventory_brand_variants ibv
        JOIN inventory_items ii ON ii.id = ibv.item_id
        WHERE ibv.id = v_bv_id;

      ELSE  -- v_delta < 0
        SELECT COALESCE(SUM(remaining_qty), 0) INTO v_layer_remaining
        FROM (
          SELECT remaining_qty FROM fifo_cost_layers
          WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id
          ORDER BY id ASC FOR UPDATE
        ) sub;

        IF v_layer_remaining < ABS(v_delta) THEN
          RAISE EXCEPTION
            'Cannot reduce qty by %: only % units remain from this receival (% were sold)',
            ABS(v_delta), v_layer_remaining, v_old_qty - v_layer_remaining;
        END IF;

        SELECT COALESCE(stock_level, 0), COALESCE(reserved_qty, 0)
        INTO v_stock_level, v_reserved_qty
        FROM inventory_brand_variants
        WHERE id = v_bv_id
        FOR UPDATE;

        IF (v_stock_level - ABS(v_delta)) < v_reserved_qty THEN
          RAISE EXCEPTION
            'Cannot reduce qty by % for variant %: new stock level (%) would be below reserved qty (%)',
            ABS(v_delta), v_bv_id,
            v_stock_level - ABS(v_delta),
            v_reserved_qty;
        END IF;

        UPDATE fifo_cost_layers
        SET qty           = qty           - ABS(v_delta),
            remaining_qty = remaining_qty - ABS(v_delta)
        WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;

        UPDATE inventory_brand_variants
        SET stock_level = stock_level - ABS(v_delta), updated_at = now()
        WHERE id = v_bv_id;

        INSERT INTO inventory_stock_movements
          (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_bv_id, ii.name_en, ii.sku,
               'receival_edit', -ABS(v_delta), v_old_cost,
               'receival_edit_request', p_edit_request_id,
               'Qty decrease edit on receival ' || v_req.receival_id
        FROM inventory_brand_variants ibv
        JOIN inventory_items ii ON ii.id = ibv.item_id
        WHERE ibv.id = v_bv_id;
      END IF;
    END IF;

    -- ── UNIT COST CHANGE ──────────────────────────────────────────────────────
    IF v_new_cost <> v_old_cost THEN
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change unit cost: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      SELECT COALESCE(SUM(qty - remaining_qty), 0) INTO v_sold_qty
      FROM fifo_cost_layers
      WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;

      IF v_sold_qty > 0 THEN
        UPDATE cogs_entries
        SET unit_cost  = v_new_cost,
            total_cost = v_new_cost * qty
        WHERE id IN (
          SELECT id FROM cogs_entries
          WHERE brand_variant_id = v_bv_id
            AND unit_cost = v_old_cost
            AND date >= v_receival_date
          ORDER BY date ASC
          LIMIT v_sold_qty
        );
      END IF;

      UPDATE fifo_cost_layers
      SET unit_cost       = v_new_cost,
          total_unit_cost = v_new_cost + landed_cost_per_unit
      WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;
    END IF;

    PERFORM recalc_average_cost(v_bv_id);

    IF v_delta < 0 THEN
      FOR v_lc_rec IN
        SELECT id, attached_receival_ids FROM landed_costs
        WHERE v_req.receival_id = ANY(attached_receival_ids)
          AND applied_at IS NULL AND voided_at IS NULL
      LOOP
        SELECT COALESCE(SUM(fcl.remaining_qty), 0) INTO v_total_remaining
        FROM fifo_cost_layers fcl
        WHERE fcl.receival_id = ANY(
          SELECT unnest(v_lc_rec.attached_receival_ids)::TEXT
        );
        IF v_total_remaining = 0 THEN
          UPDATE landed_costs SET all_items_sold = TRUE, updated_at = now()
          WHERE id = v_lc_rec.id;
        END IF;
      END LOOP;
    END IF;

    UPDATE receival_items
    SET qty_received = v_new_qty, unit_cost = v_new_cost
    WHERE id = (v_item_input->>'receival_item_id')::UUID;

  END LOOP;

  -- ── 5. Mark edit request as completed ──────────────────────────────────────
  UPDATE receival_edit_requests
  SET status = 'completed'
  WHERE id = p_edit_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE FUNCTION public.approve_credit_group_change(p_approval_id uuid, p_comment text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row            RECORD;
  v_request        RECORD;
  v_profile_id     uuid;
  v_full_name      TEXT;
  v_all_done       BOOLEAN;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_row FROM customer_credit_group_approvals
    WHERE id = p_approval_id FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'pending' OR NOT v_row.is_active THEN
    RAISE EXCEPTION 'Approval step not actionable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id        = v_profile_id
      AND  cr.name               = v_row.step_role
      AND  cr.is_approval_slot   = true
      AND  cr.deleted_at         IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR 'credit_group' = ANY(ucr.approval_scopes))
  ) THEN
    RAISE EXCEPTION 'You do not hold the role required for this approval step';
  END IF;

  IF EXISTS (
    SELECT 1 FROM customer_credit_group_approvals
    WHERE  request_id  = v_row.request_id
      AND  iteration   = v_row.iteration
      AND  decided_by  = v_profile_id
      AND  id          <> p_approval_id
  ) THEN
    RAISE EXCEPTION 'You have already actioned another step on this request';
  END IF;

  UPDATE customer_credit_group_approvals
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         decided_at      = now(),
         comment         = p_comment
  WHERE  id = p_approval_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM customer_credit_group_approvals
    WHERE  request_id  = v_row.request_id
      AND  iteration   = v_row.iteration
      AND  status     <> 'approved'
  ) INTO v_all_done;

  IF v_all_done THEN
    SELECT * INTO v_request FROM customer_credit_group_requests
      WHERE id = v_row.request_id FOR UPDATE;

    UPDATE customers
       SET credit_group_id = v_request.requested_group_id,
           customer_type   = 'credit',
           is_blocked      = false,
           block_reason    = NULL
     WHERE id = v_request.customer_id;

    UPDATE customer_credit_group_requests
       SET status     = 'approved',
           decided_by = v_profile_id,
           decided_at = now()
     WHERE id = v_request.id;

    INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
    VALUES (
      'Credit Group Change Approved',
      'customers',
      'customer',
      v_request.customer_id,
      v_full_name,
      'info',
      jsonb_build_object('request_id', v_request.id)::text
    );
  END IF;
END;
$$;

CREATE FUNCTION public.approve_receival_inventory(p_receival_id uuid, p_action text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_receival   RECORD;
  v_item       RECORD;
  v_bv_ids     UUID[] := '{}';
  v_bv_id      UUID;
BEGIN
  SELECT id, po_id, receival_number, warehouse_id, date, status
  INTO v_receival
  FROM receivals
  WHERE id = p_receival_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receival % not found', p_receival_id;
  END IF;

  IF v_receival.status NOT IN ('pending', 'pending_approval', 'draft') THEN
    RAISE EXCEPTION 'Receival % already processed with status %', p_receival_id, v_receival.status;
  END IF;

  UPDATE receivals SET status = p_action WHERE id = p_receival_id;

  IF p_action = 'rejected' THEN
    UPDATE po_line_items pli
    SET received_qty = GREATEST(0, pli.received_qty - ri.qty_received)
    FROM receival_items ri
    WHERE ri.receival_id = p_receival_id
      AND ri.po_line_item_id = pli.id
      AND ri.is_free = FALSE;

    RETURN v_receival.po_id;
  END IF;

  FOR v_item IN
    SELECT item_name, sku, qty_received, unit_cost, brand_variant_id
    FROM receival_items
    WHERE receival_id = p_receival_id
      AND is_free = FALSE
      AND brand_variant_id IS NOT NULL
      AND qty_received > 0
  LOOP
    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_item.brand_variant_id, v_receival.warehouse_id, p_receival_id, v_receival.receival_number,
      v_receival.date, v_item.qty_received, v_item.unit_cost, 0, v_item.unit_cost, v_item.qty_received
    );

    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_item.qty_received,
        updated_at  = now()
    WHERE id = v_item.brand_variant_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES (
      v_receival.warehouse_id, v_item.brand_variant_id, v_item.item_name, v_item.sku,
      'purchase_receival', v_item.qty_received, v_item.unit_cost, 'receival', p_receival_id
    );

    IF NOT (v_item.brand_variant_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_item.brand_variant_id;
    END IF;
  END LOOP;

  FOREACH v_bv_id IN ARRAY v_bv_ids
  LOOP
    PERFORM recalc_average_cost(v_bv_id);
  END LOOP;

  RETURN v_receival.po_id;
END;
$$;

CREATE FUNCTION public.approve_sales_request(p_request_id uuid, p_comment text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_req         RECORD;
  v_profile_id  uuid;
  v_full_name   TEXT;
  v_scope       TEXT;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_req FROM sale_order_approvals WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' OR NOT v_req.is_active THEN
    RAISE EXCEPTION 'Request not actionable';
  END IF;

  v_scope := CASE v_req.approval_type
    WHEN 'margin' THEN 'sales_margin'
    WHEN 'credit' THEN 'sales_credit'
  END;
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'Unknown sales approval type %', v_req.approval_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id        = v_profile_id
      AND  cr.name               = v_req.step_role
      AND  cr.is_approval_slot   = true
      AND  cr.deleted_at         IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR v_scope = ANY(ucr.approval_scopes))
  ) THEN
    RAISE EXCEPTION 'You do not hold the role required for this approval step';
  END IF;

  IF EXISTS (
    SELECT 1 FROM sale_order_approvals
    WHERE  source_id     = v_req.source_id
      AND  approval_type = v_req.approval_type
      AND  iteration     = v_req.iteration
      AND  decided_by    = v_profile_id
      AND  id            <> p_request_id
  ) THEN
    RAISE EXCEPTION 'You have already approved another role on this slip';
  END IF;

  UPDATE sale_order_approvals
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         comment         = p_comment
  WHERE  id = p_request_id;

  PERFORM public.advance_sales_approval(v_req.source_id, v_req.approval_type);
END;
$$;

CREATE FUNCTION public.approve_stock_adjustment_inventory(p_adjustment_id uuid, p_approved_by text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_adj     RECORD;
  v_bv      RECORD;
  v_result  RECORD;
  v_qty     INT;
BEGIN
  SELECT brand_variant_id, warehouse_id, adjustment_type, qty::INT, reason, status
  INTO v_adj
  FROM stock_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment % not found', p_adjustment_id;
  END IF;

  IF v_adj.status NOT IN ('pending', 'pending_approval') THEN
    RAISE EXCEPTION 'Adjustment % already processed with status %', p_adjustment_id, v_adj.status;
  END IF;

  v_qty := v_adj.qty;

  UPDATE stock_adjustments
  SET status = 'approved', approved_by_name = p_approved_by, approved_at = now()
  WHERE id = p_adjustment_id;

  IF v_adj.adjustment_type = 'increase' THEN
    SELECT average_cost INTO v_bv
    FROM inventory_brand_variants WHERE id = v_adj.brand_variant_id;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty
    );

    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_qty, updated_at = now()
    WHERE id = v_adj.brand_variant_id;

    PERFORM recalc_average_cost(v_adj.brand_variant_id);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
      v_qty, COALESCE(v_bv.average_cost, 0), 'adjustment', p_adjustment_id, v_adj.reason
    );

  ELSIF v_adj.adjustment_type IN ('decrease', 'damage', 'write_off') THEN
    SELECT total_cost, weighted_unit_cost
    INTO v_result
    FROM deduct_fifo_layers(v_adj.brand_variant_id, v_adj.warehouse_id, v_qty, false);

    -- Damage moves stock from sellable → damaged bucket; write_off removes entirely
    IF v_adj.adjustment_type = 'damage' THEN
      UPDATE inventory_brand_variants
      SET damaged_qty = damaged_qty + v_qty, updated_at = now()
      WHERE id = v_adj.brand_variant_id;
    END IF;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
      -v_qty, v_result.weighted_unit_cost, 'adjustment', p_adjustment_id, v_adj.reason
    );

  ELSE
    RAISE EXCEPTION 'Unknown adjustment_type: %', v_adj.adjustment_type;
  END IF;
END;
$$;

CREATE FUNCTION public.approve_warehouse_transfer_inventory(p_transfer_id uuid, p_approved_by text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_transfer  RECORD;
  v_item      JSONB;
  v_bv_id     UUID;
  v_qty       INT;
  v_result    RECORD;
BEGIN
  SELECT from_warehouse_id, to_warehouse_id, date, items, status
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status NOT IN ('pending', 'in_transit', 'pending_approval') THEN
    RAISE EXCEPTION 'Transfer % already processed with status %', p_transfer_id, v_transfer.status;
  END IF;

  -- Mark as approved
  UPDATE warehouse_transfers
  SET status = 'approved',
      approved_by_name = p_approved_by,
      approved_date = CURRENT_DATE
  WHERE id = p_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_transfer.items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    -- Deduct from source warehouse; p_is_transfer=true skips global stock_level change
    SELECT total_cost, weighted_unit_cost
    INTO v_result
    FROM deduct_fifo_layers(v_bv_id, v_transfer.from_warehouse_id, v_qty, TRUE);

    -- Create new FIFO layer in destination warehouse at the same weighted cost
    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_bv_id, v_transfer.to_warehouse_id, COALESCE(v_transfer.date, CURRENT_DATE),
      v_qty, v_result.weighted_unit_cost, 0, v_result.weighted_unit_cost, v_qty
    );

    -- Two movement records: out from source, in to destination
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES
    (
      v_transfer.from_warehouse_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''), v_item->>'sku',
      'transfer_out', -v_qty, v_result.weighted_unit_cost, 'transfer', p_transfer_id
    ),
    (
      v_transfer.to_warehouse_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''), v_item->>'sku',
      'transfer_in', v_qty, v_result.weighted_unit_cost, 'transfer', p_transfer_id
    );
  END LOOP;
END;
$$;

CREATE FUNCTION public.archive_workflow_step(p_step_id uuid, p_profile_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id
    WHERE ucr.profile_id = p_profile_id
      AND cr.name = 'Owner'
      AND cr.is_approval_slot = true
      AND cr.deleted_at IS NULL
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only owners can archive approval chain steps';
  END IF;

  UPDATE approval_workflow_steps
  SET archived_at = now(), archived_by = p_profile_id
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;

CREATE FUNCTION public.attach_payment_to_bill(p_payment_id uuid, p_bill_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_payment_amount NUMERIC;
BEGIN
  SELECT amount INTO v_payment_amount
  FROM payments WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;

  PERFORM allocate_payment_to_bill(p_payment_id, p_bill_id, v_payment_amount);
END;
$$;

CREATE FUNCTION public.attach_payment_to_invoice(p_payment_id uuid, p_invoice_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_payment RECORD;
  v_invoice RECORD;
BEGIN
  SELECT id, direction, invoice_id, customer_id
  INTO   v_payment
  FROM   payments
  WHERE  id = p_payment_id
  FOR UPDATE;                           -- row-level lock prevents concurrent attach

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;
  IF v_payment.direction != 'incoming' THEN
    RAISE EXCEPTION 'Payment must be direction=incoming';
  END IF;
  IF v_payment.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Payment is already linked to an invoice';
  END IF;

  SELECT id, customer_id
  INTO   v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  -- Ownership guard: skip check for NULL customer_id (legacy backfill miss)
  IF v_payment.customer_id IS NOT NULL
     AND v_payment.customer_id IS DISTINCT FROM v_invoice.customer_id THEN
    RAISE EXCEPTION 'Payment customer does not match invoice customer';
  END IF;

  UPDATE payments SET invoice_id = p_invoice_id WHERE id = p_payment_id;
  -- Trigger fires automatically → recalculate_ar_invoice_payment_status
END;
$$;

CREATE FUNCTION public.batch_increment_received_qty(p_updates jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  rec JSONB;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE po_line_items
    SET received_qty = GREATEST(0, received_qty + (rec->>'delta')::INT)
    WHERE id = (rec->>'id')::UUID;
  END LOOP;
END;
$$;

CREATE FUNCTION public.batch_update_reserved_qty(p_updates jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  rec JSONB;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE inventory_brand_variants
    SET reserved_qty = GREATEST(0, reserved_qty + (rec->>'delta')::INT),
        updated_at   = now()
    WHERE id = (rec->>'bv_id')::UUID;
  END LOOP;
END;
$$;

CREATE FUNCTION public.batch_update_variant_prices(p_updates jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_update JSONB;
BEGIN
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates) LOOP
    UPDATE inventory_brand_variants
       SET selling_price  = (v_update->>'selling_price')::NUMERIC,
           margin_percent = (v_update->>'margin_percent')::NUMERIC
     WHERE id = (v_update->>'id')::UUID;
  END LOOP;
END;
$$;

CREATE FUNCTION public.build_inv_check_approval_chain(p_has_damage_or_writeoff boolean DEFAULT false, p_has_variance boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_steps JSONB;
BEGIN
  IF NOT p_has_variance THEN
    SELECT jsonb_agg(jsonb_build_object(
      'step_order', 1,
      'step_role',  step_key,
      'step_label', step_label
    ))
    INTO v_steps
    FROM approval_workflow_steps
    WHERE workflow = 'inv_check'
      AND step_key = 'inventory_manager'
      AND is_active = true
      AND archived_at IS NULL;

    RETURN COALESCE(v_steps, '[]'::jsonb);
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'step_order', rn,
      'step_role',  step_key,
      'step_label', step_label
    ) ORDER BY rn
  )
  INTO v_steps
  FROM (
    SELECT step_key, step_label,
           ROW_NUMBER() OVER (ORDER BY step_order) AS rn
    FROM   approval_workflow_steps
    WHERE  workflow = 'inv_check'
      AND  is_active = true
      AND  archived_at IS NULL
      AND  (
        NOT is_conditional
        OR (is_conditional AND p_has_damage_or_writeoff)
      )
  ) sub;

  RETURN COALESCE(v_steps, '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.build_sales_approval_chain(p_so_id uuid, p_approval_type public.approval_type, p_payload jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_workflow    TEXT;
  v_iteration   INT;
  v_step        RECORD;
BEGIN
  v_workflow := CASE p_approval_type
    WHEN 'margin' THEN 'sales_margin'
    WHEN 'credit' THEN 'sales_credit'
  END;

  SELECT COALESCE(MAX(iteration), 0) + 1 INTO v_iteration
  FROM   sale_order_approvals
  WHERE  source_id     = p_so_id
    AND  approval_type = p_approval_type;

  FOR v_step IN
    SELECT was.step_order, cr.name AS role_name
    FROM   approval_workflow_steps was
    JOIN   custom_roles cr ON cr.id = was.role_id
    WHERE  was.workflow   = v_workflow
      AND  was.is_active  = true
      AND  was.archived_at IS NULL
    ORDER  BY was.step_order
  LOOP
    INSERT INTO sale_order_approvals (
      source_type, source_id, approval_type, status,
      requested_by, reason,
      step_role, step_order, is_active, iteration
    ) VALUES (
      'sale_order', p_so_id, p_approval_type, 'pending',
      (p_payload->>'requested_by')::uuid,
      p_payload::text,
      v_step.role_name, v_step.step_order,
      true,
      v_iteration
    );
  END LOOP;
END;
$$;

CREATE FUNCTION public.cancel_delivery_inventory(p_delivery_id uuid, p_so_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_delivery  RECORD;
  v_cogs      RECORD;
  v_item      JSONB;
  v_bv_id     UUID;
  v_qty       INT;
  v_wh_id     UUID;
  v_total_qty INT;
  v_delivered INT;
BEGIN
  SELECT warehouse_id, date, items, status
  INTO   v_delivery
  FROM   sale_deliveries
  WHERE  id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  IF v_delivery.status = 'cancelled' THEN
    RAISE EXCEPTION 'Delivery % is already cancelled', p_delivery_id;
  END IF;

  v_wh_id := v_delivery.warehouse_id;

  UPDATE sale_deliveries
  SET    status = 'cancelled', updated_at = now()
  WHERE  id = p_delivery_id;

  IF v_delivery.status = 'delivered' THEN

    -- ── Reverse delivered_qty on SO lines (match by bv_id, same as complete_delivery_inventory) ──
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_delivery.items)
    LOOP
      v_bv_id := (v_item->>'brand_variant_id')::UUID;
      v_qty   := (v_item->>'qty_delivered')::INT;

      CONTINUE WHEN v_qty IS NULL OR v_qty <= 0;

      IF v_bv_id IS NOT NULL THEN
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_qty)
        WHERE  sale_order_id = p_so_id
          AND  brand_variant_id = v_bv_id;
      ELSE
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_qty)
        WHERE  id = (
          SELECT id FROM sale_order_lines
          WHERE  sale_order_id = p_so_id
            AND  item_name = (v_item->>'item_name')
          ORDER  BY id
          LIMIT  1
        );
      END IF;
    END LOOP;

    -- ── Restore FIFO layers from cogs_entries (one entry per item, weighted avg cost) ──
    FOR v_cogs IN
      SELECT brand_variant_id, qty, unit_cost
      FROM   cogs_entries
      WHERE  sale_delivery_id = p_delivery_id
    LOOP
      -- Restore FIFO layer using delivery date (preserves chronological queue order)
      -- total_unit_cost is per-unit in this schema (unit_cost + landed_cost_per_unit)
      -- landed_cost_per_unit = 0: cogs_entries.unit_cost is already the blended weighted cost
      -- (unit_cost + original landed cost), so total_unit_cost is correct for FIFO deductions.
      -- Audit queries reading landed_cost_per_unit directly will see 0 on restored layers.
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_cogs.brand_variant_id, v_wh_id, COALESCE(v_delivery.date, CURRENT_DATE),
        v_cogs.qty, v_cogs.unit_cost, 0, v_cogs.unit_cost, v_cogs.qty
      );

      UPDATE inventory_brand_variants
      SET    stock_level = stock_level + v_cogs.qty,
             updated_at  = now()
      WHERE  id = v_cogs.brand_variant_id;

      PERFORM recalc_average_cost(v_cogs.brand_variant_id);

      -- Delete outbound stock movement for this item
      DELETE FROM inventory_stock_movements
      WHERE  reference_type   = 'sale_delivery'
        AND  reference_id     = p_delivery_id
        AND  brand_variant_id = v_cogs.brand_variant_id;
    END LOOP;

    -- Delete all COGS entries for this delivery
    DELETE FROM cogs_entries
    WHERE  sale_delivery_id = p_delivery_id;

    -- ── Recalculate SO status ────────────────────────────────────────────────
    SELECT COALESCE(SUM(qty), 0), COALESCE(SUM(delivered_qty), 0)
    INTO   v_total_qty, v_delivered
    FROM   sale_order_lines
    WHERE  sale_order_id = p_so_id;

    IF v_delivered >= v_total_qty AND v_total_qty > 0 THEN
      UPDATE sale_orders
      SET    status = 'delivered', updated_at = now()
      WHERE  id = p_so_id
        AND  status NOT IN ('cancelled', 'invoiced', 'closed');
    -- 'delivered' is intentionally absent from the exclusion list here: cancelling one delivery
    -- on a fully-delivered SO should demote it back to partial_delivery. This differs from
    -- complete_delivery_inventory which guards against 'delivered' to prevent re-delivering.
    ELSIF v_delivered > 0 THEN
      UPDATE sale_orders
      SET    status = 'partial_delivery', updated_at = now()
      WHERE  id = p_so_id
        AND  status NOT IN ('cancelled', 'invoiced', 'closed');
    ELSE
      UPDATE sale_orders
      SET    status = 'confirmed', updated_at = now()
      WHERE  id = p_so_id
        AND  status NOT IN ('cancelled', 'invoiced', 'closed');
    END IF;

  END IF;
END;
$$;

CREATE FUNCTION public.cancel_transfer(p_transfer_id uuid, p_cancelled_by_profile_id uuid, p_cancelled_by_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_avg_cost NUMERIC;
BEGIN
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         created_by_profile_id
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status NOT IN ('pending', 'in_transit') THEN
    RAISE EXCEPTION 'Transfer % cannot be cancelled — current status: %', p_transfer_id, v_transfer.status;
  END IF;

  -- Auth: only creator or inventory_manager can cancel
  IF v_transfer.created_by_profile_id != p_cancelled_by_profile_id
     AND NOT has_inventory_manager_role(p_cancelled_by_profile_id) THEN
    RAISE EXCEPTION 'Only the creator or an Inventory Manager can cancel a transfer';
  END IF;

  -- Update status
  UPDATE warehouse_transfers
  SET status = 'cancelled',
      cancelled_by_profile_id = p_cancelled_by_profile_id,
      cancelled_by_name = p_cancelled_by_name,
      cancelled_at = now()
  WHERE id = p_transfer_id;

  -- ORDER BY brand_variant_id to prevent deadlocks when concurrent transfers
  -- share items — both transactions lock rows in the same deterministic order.
  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    IF v_transfer.status = 'pending' THEN
      -- Release allocation only
      UPDATE warehouse_stock_allocations
      SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
          updated_at = now()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND brand_variant_id = v_item.brand_variant_id;

    ELSIF v_transfer.status = 'in_transit' THEN
      -- Stock was already deducted — reverse it by creating a new FIFO layer
      SELECT ABS(unit_cost) INTO v_avg_cost
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out'
      LIMIT 1;

      v_avg_cost := COALESCE(v_avg_cost, v_item.unit_cost);

      -- Add stock back to source warehouse
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_item.brand_variant_id, v_transfer.from_warehouse_id,
        CURRENT_DATE,
        v_item.requested_qty, v_avg_cost, 0, v_avg_cost, v_item.requested_qty
      );

      -- Reversal movement
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_in', v_item.requested_qty, v_avg_cost,
        'transfer', p_transfer_id,
        'Transfer cancelled — stock returned'
      );
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.check_is_division_manager(p_profile_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(is_division_manager, false) FROM public.profiles WHERE id = p_profile_id;
$$;

CREATE FUNCTION public.check_low_stock_and_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_new_qty INT;
  v_reorder RECORD;
  v_old_qty INT;
  v_other_wh RECORD;
  v_field_rp RECORD;
  v_item_label TEXT;
  v_wh_name TEXT;
BEGIN
  -- Only fire on stock-reducing movements (negative qty)
  IF NEW.qty >= 0 THEN RETURN NEW; END IF;

  -- Get current stock qty in this warehouse for this item
  SELECT COALESCE(SUM(remaining_qty), 0)::INT INTO v_new_qty
  FROM fifo_cost_layers
  WHERE brand_variant_id = NEW.brand_variant_id
    AND warehouse_id = NEW.warehouse_id
    AND remaining_qty > 0;

  -- Check if a reorder point is configured
  SELECT * INTO v_reorder
  FROM warehouse_reorder_points
  WHERE warehouse_id = NEW.warehouse_id
    AND brand_variant_id = NEW.brand_variant_id;

  -- No reorder point configured → skip
  IF NOT FOUND OR v_reorder.reorder_point <= 0 THEN RETURN NEW; END IF;

  -- Compute previous qty (before this movement)
  v_old_qty := v_new_qty - NEW.qty; -- qty is negative, so subtracting adds

  -- Threshold crossing check: was above, now at or below
  IF NOT (v_old_qty > v_reorder.reorder_point AND v_new_qty <= v_reorder.reorder_point) THEN
    RETURN NEW;
  END IF;

  -- 24-hour cooldown
  IF v_reorder.last_notified_at IS NOT NULL
     AND v_reorder.last_notified_at > now() - INTERVAL '24 hours' THEN
    RETURN NEW;
  END IF;

  -- Find another warehouse with stock for this item
  SELECT f.warehouse_id, w.name, COALESCE(SUM(f.remaining_qty), 0)::INT AS qty
  INTO v_other_wh
  FROM fifo_cost_layers f
  JOIN warehouses w ON w.id = f.warehouse_id
  WHERE f.brand_variant_id = NEW.brand_variant_id
    AND f.warehouse_id != NEW.warehouse_id
    AND f.remaining_qty > 0
  GROUP BY f.warehouse_id, w.name
  ORDER BY SUM(f.remaining_qty) DESC
  LIMIT 1;

  -- No other warehouse has stock → skip notification
  IF NOT FOUND OR v_other_wh.qty <= 0 THEN RETURN NEW; END IF;

  -- Get warehouse name and item label
  SELECT name INTO v_wh_name FROM warehouses WHERE id = NEW.warehouse_id;
  v_item_label := NEW.item_name;

  -- Notify all Field RPs of this warehouse
  FOR v_field_rp IN
    SELECT wfr.profile_id
    FROM warehouse_field_rps wfr
    WHERE wfr.warehouse_id = NEW.warehouse_id
  LOOP
    INSERT INTO notifications (profile_id, type, title, body, related_type)
    VALUES (
      v_field_rp.profile_id,
      'low_stock_alert',
      'Low Stock Alert',
      'Low Stock Alert — ' || v_item_label || ' is at ' || v_new_qty || ' units in '
        || COALESCE(v_wh_name, 'warehouse') || ' (reorder point: ' || v_reorder.reorder_point
        || '). ' || v_other_wh.name || ' has ' || v_other_wh.qty
        || ' units available. Consider requesting a transfer.',
      'warehouse_stock'
    );
  END LOOP;

  -- Update cooldown
  UPDATE warehouse_reorder_points
  SET last_notified_at = now()
  WHERE id = v_reorder.id;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.complete_delivery_inventory(p_delivery_id uuid, p_so_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_delivery  RECORD;
  v_item      JSONB;
  v_bv_id     UUID;
  v_qty       INT;
  v_wh_id     UUID;
  v_date      DATE;
  v_result    RECORD;
  v_all_delivered BOOLEAN;
  v_any_delivered BOOLEAN;
BEGIN
  SELECT warehouse_id, date, items, status
  INTO v_delivery
  FROM sale_deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  IF v_delivery.status <> 'pending' THEN
    RAISE EXCEPTION 'Delivery % already processed with status %', p_delivery_id, v_delivery.status;
  END IF;

  v_wh_id := v_delivery.warehouse_id;
  v_date  := COALESCE(v_delivery.date, CURRENT_DATE);

  UPDATE sale_deliveries SET status = 'delivered', updated_at = now() WHERE id = p_delivery_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_delivery.items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty_delivered')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    SELECT total_cost, weighted_unit_cost
    INTO v_result
    FROM deduct_fifo_layers(v_bv_id, v_wh_id, v_qty, false);

    UPDATE inventory_brand_variants
    SET reserved_qty = GREATEST(0, reserved_qty - v_qty),
        updated_at   = now()
    WHERE id = v_bv_id;

    UPDATE sale_order_lines
    SET    delivered_qty = COALESCE(delivered_qty, 0) + v_qty
    WHERE  sale_order_id = p_so_id
      AND  brand_variant_id = v_bv_id;

    INSERT INTO cogs_entries (
      brand_variant_id, sale_delivery_id, sale_order_id,
      qty, unit_cost, total_cost, date
    ) VALUES (
      v_bv_id, p_delivery_id, p_so_id,
      v_qty, v_result.weighted_unit_cost, v_result.total_cost, v_date
    );

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    ) VALUES (
      v_wh_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''),
      v_item->>'sku',
      'sale_delivery', -v_qty, v_result.weighted_unit_cost,
      'sale_delivery', p_delivery_id
    );
  END LOOP;

  -- Update SO status based on delivery progress
  SELECT
    bool_and(COALESCE(delivered_qty, 0) >= qty),
    bool_or(COALESCE(delivered_qty, 0) > 0)
  INTO v_all_delivered, v_any_delivered
  FROM sale_order_lines
  WHERE sale_order_id = p_so_id;

  IF v_all_delivered THEN
    UPDATE sale_orders
    SET    status = 'delivered', updated_at = now()
    WHERE  id = p_so_id
      AND  status IN ('confirmed', 'partial_delivery');
  ELSIF v_any_delivered THEN
    UPDATE sale_orders
    SET    status = 'partial_delivery', updated_at = now()
    WHERE  id = p_so_id
      AND  status = 'confirmed';
  END IF;
END;
$$;

CREATE FUNCTION public.create_and_approve_receival(p_po_id uuid, p_warehouse_id uuid, p_date date, p_received_by_name text, p_receival_number text, p_notes text, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_receival_id UUID;
  v_item        JSONB;
  v_bv_id       UUID;
  v_bv_ids      UUID[] := '{}';
  v_bv_id_elem  UUID;
  v_qty         INT;
  v_cost        NUMERIC;
  v_pli_id      UUID;
BEGIN
  INSERT INTO receivals (
    receival_number, po_id, warehouse_id, date,
    received_by_name, notes, status
  ) VALUES (
    p_receival_number, p_po_id, p_warehouse_id, p_date,
    p_received_by_name, p_notes, 'approved'
  ) RETURNING id INTO v_receival_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN (v_item->>'qty_received') IS NULL OR (v_item->>'unit_cost') IS NULL;

    v_bv_id  := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty    := (v_item->>'qty_received')::INT;
    v_cost   := (v_item->>'unit_cost')::NUMERIC;
    v_pli_id := NULLIF(v_item->>'po_line_item_id', '')::UUID;

    INSERT INTO receival_items (
      receival_id, po_line_item_id, brand_variant_id,
      item_name, sku, qty_received, unit_cost, is_free
    ) VALUES (
      v_receival_id, v_pli_id, v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      v_qty, v_cost,
      COALESCE((v_item->>'is_free')::BOOLEAN, false)
    );

    CONTINUE WHEN COALESCE((v_item->>'is_free')::BOOLEAN, false) = TRUE
               OR v_bv_id IS NULL
               OR v_qty <= 0;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_bv_id, p_warehouse_id, v_receival_id::TEXT, p_receival_number,
      p_date, v_qty, v_cost, 0, v_cost, v_qty
    );

    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_bv_id;

    IF v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = received_qty + v_qty
      WHERE id = v_pli_id;
    END IF;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES (
      p_warehouse_id, v_bv_id,
      v_item->>'item_name', NULLIF(v_item->>'sku', ''),
      'purchase_receival', v_qty, v_cost,
      'receival', v_receival_id
    );

    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  FOREACH v_bv_id_elem IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id_elem);
  END LOOP;

  -- Auto-progress PO status based on received quantities
  PERFORM refresh_po_status(p_po_id);

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', p_receival_number);
END;
$$;

CREATE FUNCTION public.create_and_confirm_delivery(p_so_id uuid, p_warehouse_id uuid, p_warehouse_name text, p_date date, p_items jsonb) RETURNS TABLE(id uuid, delivery_number text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_delivery_number TEXT;
  v_new_id          UUID;
BEGIN
  v_delivery_number := 'DEL-' || LPAD(nextval('sale_delivery_number_seq')::TEXT, 5, '0');

  INSERT INTO sale_deliveries (
    delivery_number, sale_order_id,
    warehouse_id, warehouse_name, date, items, status
  ) VALUES (
    v_delivery_number, p_so_id,
    p_warehouse_id, p_warehouse_name, p_date, p_items, 'pending'
  )
  RETURNING sale_deliveries.id INTO v_new_id;

  -- Runs in the same transaction — fully atomic
  PERFORM complete_delivery_inventory(v_new_id, p_so_id);

  RETURN QUERY SELECT v_new_id, v_delivery_number;
END;
$$;

CREATE FUNCTION public.create_customer_with_phone(p_name text, p_phone text, p_link_phone text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_customer_id   uuid;
  v_phone_id      uuid;
  v_existing_cid  uuid;
BEGIN
  -- Normalise phones
  p_phone      := regexp_replace(p_phone, '\s+', '', 'g');
  p_link_phone := regexp_replace(COALESCE(p_link_phone, ''), '\s+', '', 'g');

  -- If linkPhone already exists, use that customer
  IF p_link_phone <> '' THEN
    SELECT customer_id INTO v_existing_cid
      FROM customer_phones WHERE phone = p_link_phone;
  END IF;

  IF v_existing_cid IS NOT NULL THEN
    v_customer_id := v_existing_cid;
  ELSE
    INSERT INTO customers (name, phone, customer_type)
    VALUES (p_name, p_phone, 'cash')
    RETURNING id INTO v_customer_id;

    -- Also insert the linkPhone under the new customer if it doesn't exist yet
    IF p_link_phone <> '' THEN
      INSERT INTO customer_phones (customer_id, phone, is_primary)
      VALUES (v_customer_id, p_link_phone, false)
      ON CONFLICT (phone) DO NOTHING;
    END IF;
  END IF;

  -- Insert primary phone (ON CONFLICT: if phone already exists, return existing record)
  INSERT INTO customer_phones (customer_id, phone, is_primary)
  VALUES (v_customer_id, p_phone, true)
  ON CONFLICT (phone) DO UPDATE
    SET customer_id = EXCLUDED.customer_id
  RETURNING id INTO v_phone_id;

  RETURN jsonb_build_object(
    'customer_id',   v_customer_id,
    'phone_id',      v_phone_id,
    'customer_name', p_name
  );
END;
$$;

CREATE FUNCTION public.create_landed_cost(p_description text, p_date date, p_currency text, p_lines jsonb, p_attached_receival_ids uuid[], p_attached_po_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_total_amount NUMERIC;
  v_id           UUID;
BEGIN
  IF p_lines IS NULL THEN
    RAISE EXCEPTION 'p_lines must not be null';
  END IF;

  -- Sum in NUMERIC — no JavaScript float rounding (Fix #4)
  SELECT COALESCE(SUM(
    (line->>'amount')::NUMERIC * COALESCE(NULLIF((line->>'exchange_rate')::NUMERIC, 0), 1)
  ), 0)
  INTO v_total_amount
  FROM jsonb_array_elements(p_lines) AS line;

  INSERT INTO landed_costs (
    description, total_amount, currency,
    lines, attached_receival_ids, attached_po_ids,
    all_items_sold, date
  ) VALUES (
    p_description, v_total_amount, p_currency,
    p_lines, p_attached_receival_ids, p_attached_po_ids,
    false, p_date
  ) RETURNING id INTO v_id;

  RETURN (SELECT row_to_json(lc)::JSONB FROM landed_costs lc WHERE lc.id = v_id);
END;
$$;

CREATE FUNCTION public.create_sale_order(p_customer_id uuid, p_intent text, p_currency text, p_exchange_rate numeric, p_expected_delivery date, p_payment_terms text, p_payment_terms_notes text, p_payment_milestones jsonb, p_delivery_terms text, p_delivery_terms_notes text, p_customer_notes text, p_validity_days integer, p_discount_amount numeric, p_discount_label text, p_discount_type text, p_line_items jsonb, p_division_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_so_number         TEXT;
  v_count             INTEGER;
  v_subtotal          NUMERIC;
  v_discount_resolved NUMERIC;
  v_total             NUMERIC;
  v_total_qar         NUMERIC;
  v_credit_limit      NUMERIC;
  v_group_name        TEXT;
  v_open_total        NUMERIC;
  v_available         NUMERIC;
  v_so_status         sale_order_status;
  v_so_id             UUID;
  v_profile_id        UUID;
  v_customer_type     TEXT;
  v_exceeds_credit    BOOLEAN := false;
  v_has_below_cost    BOOLEAN := false;
  v_below_cost_lines  JSONB   := '[]'::jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_customer_id::text), 1, 15))::bit(60)::bigint
  );

  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();

  SELECT COUNT(*) + 1 INTO v_count FROM sale_orders;
  v_so_number := 'SO-' || LPAD(v_count::text, 5, '0');

  SELECT COALESCE(SUM((item->>'total')::NUMERIC), 0)
  INTO   v_subtotal
  FROM   jsonb_array_elements(p_line_items) AS item;

  v_discount_resolved := CASE p_discount_type
    WHEN 'percentage' THEN (v_subtotal * p_discount_amount) / 100
    ELSE p_discount_amount
  END;
  v_total     := v_subtotal - v_discount_resolved;
  v_total_qar := v_total * p_exchange_rate;

  SELECT c.customer_type, cg.credit_limit, cg.name
  INTO   v_customer_type, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  -- ── Margin gate (below cost) — runs for EVERY submission, cash or credit
  IF p_intent = 'confirm' THEN
    SELECT jsonb_agg(item) FILTER (
      WHERE (item->>'avg_cost')::NUMERIC > 0
        AND (item->>'unit_price')::NUMERIC < (item->>'avg_cost')::NUMERIC
    )
    INTO v_below_cost_lines
    FROM jsonb_array_elements(p_line_items) AS item;

    IF v_below_cost_lines IS NOT NULL AND jsonb_array_length(v_below_cost_lines) > 0 THEN
      v_has_below_cost := true;
    END IF;
  END IF;

  -- ── Credit gate (over limit) — credit customers only
  IF COALESCE(v_customer_type, 'credit') = 'cash' THEN
    v_credit_limit := 0;
    v_group_name   := 'Cash';
    v_open_total   := 0;
    v_available    := 0;
  ELSE
    IF v_credit_limit IS NULL THEN
      RAISE EXCEPTION 'no_credit_group';
    END IF;

    SELECT COALESCE(SUM(total), 0)
    INTO   v_open_total
    FROM   sale_orders
    WHERE  customer_id = p_customer_id
      AND  status      NOT IN ('cancelled')
      AND  deleted_at  IS NULL;

    v_available := v_credit_limit - v_open_total;

    IF p_intent = 'confirm' AND v_total_qar > v_available THEN
      v_exceeds_credit := true;
    END IF;
  END IF;

  -- ── Compute final SO status
  v_so_status := CASE
    WHEN p_intent <> 'confirm'                       THEN 'quotation'::sale_order_status
    WHEN v_exceeds_credit OR v_has_below_cost        THEN 'pending_approval'::sale_order_status
    ELSE                                                  'confirmed'::sale_order_status
  END;

  -- Insert SO
  INSERT INTO sale_orders (
    so_number, customer_id, status,
    subtotal, tax, total,
    discount_amount, discount_label, discount_type, discount_amount_resolved,
    currency, exchange_rate, expected_delivery,
    payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes,
    customer_notes, validity_days,
    division_id,
    created_by
  ) VALUES (
    v_so_number, p_customer_id, v_so_status,
    v_subtotal, 0, v_total,
    p_discount_amount, p_discount_label, p_discount_type, v_discount_resolved,
    p_currency, p_exchange_rate, p_expected_delivery,
    p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes,
    p_customer_notes, p_validity_days,
    p_division_id,
    v_profile_id
  )
  RETURNING id INTO v_so_id;

  -- Insert lines (unchanged)
  INSERT INTO sale_order_lines (
    sale_order_id, item_name, sku, qty, unit,
    unit_price, total, line_type,
    brand_variant_id, tool_asset_item_id, avg_cost, created_by
  )
  SELECT
    v_so_id,
    item->>'item_name',
    NULLIF(item->>'sku', ''),
    (item->>'qty')::INTEGER,
    COALESCE(NULLIF(item->>'unit', ''), 'pcs'),
    (item->>'unit_price')::NUMERIC,
    (item->>'total')::NUMERIC,
    COALESCE(NULLIF(item->>'line_type', ''), 'products'),
    CASE
      WHEN (item->>'brand_variant_id') IS NOT NULL
        AND (item->>'brand_variant_id') NOT IN ('', 'null')
      THEN (item->>'brand_variant_id')::UUID
      ELSE NULL
    END,
    CASE
      WHEN (item->>'tool_asset_item_id') IS NOT NULL
        AND (item->>'tool_asset_item_id') NOT IN ('', 'null')
      THEN (item->>'tool_asset_item_id')::UUID
      ELSE NULL
    END,
    COALESCE(NULLIF(item->>'avg_cost', '')::NUMERIC, 0),
    v_profile_id
  FROM jsonb_array_elements(p_line_items) AS item;

  -- Reserve stock (unchanged)
  PERFORM batch_update_reserved_qty(
    (SELECT jsonb_agg(
       jsonb_build_object(
         'bv_id', (item->>'brand_variant_id')::UUID,
         'delta', (item->>'qty')::INTEGER))
     FROM   jsonb_array_elements(p_line_items) AS item
     WHERE  (item->>'brand_variant_id') IS NOT NULL
       AND  (item->>'brand_variant_id') NOT IN ('', 'null')
       AND  (item->>'qty')::INTEGER > 0)
  );

  -- ── Build approval slip rows for each gate that fired
  IF v_exceeds_credit THEN
    PERFORM public.build_sales_approval_chain(
      v_so_id, 'credit',
      jsonb_build_object(
        'available', GREATEST(v_available, 0),
        'overage',   v_total_qar - v_available,
        'requested_by', v_profile_id
      )
    );
  END IF;

  IF v_has_below_cost THEN
    PERFORM public.build_sales_approval_chain(
      v_so_id, 'margin',
      jsonb_build_object(
        'lines',       v_below_cost_lines,
        'requested_by', v_profile_id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'so_id',          v_so_id,
    'so_number',      v_so_number,
    'status',         v_so_status,
    'credit_limit',   v_credit_limit,
    'group_name',     v_group_name,
    'open_total',     v_open_total,
    'available',      GREATEST(v_available, 0),
    'exceeds_credit', v_exceeds_credit,
    'has_below_cost', v_has_below_cost
  );
END;
$$;

CREATE FUNCTION public.create_sale_order(p_customer_id uuid, p_intent text, p_currency text, p_exchange_rate numeric, p_subtotal numeric, p_discount_amount numeric, p_discount_label text, p_discount_type text, p_payment_terms text, p_payment_terms_notes text, p_payment_milestones jsonb, p_delivery_terms text, p_delivery_terms_notes text, p_customer_notes text, p_validity_days integer, p_notes text, p_line_items jsonb, p_division_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_customer_type     TEXT;
  v_subtotal          NUMERIC := COALESCE(p_subtotal, 0);
  v_discount_resolved NUMERIC;
  v_total             NUMERIC;
  v_total_qar         NUMERIC;
  v_credit_limit      NUMERIC;
  v_group_name        TEXT;
  v_open_total        NUMERIC;
  v_available         NUMERIC;
  v_so_status         sale_order_status;
  v_so_id             UUID;
  v_profile_id        UUID;
  v_so_number         TEXT;
  v_exceeds_credit    BOOLEAN := false;
  v_has_below_cost    BOOLEAN := false;
  v_below_cost_lines  JSONB := '[]'::jsonb;
  v_line              JSONB;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();

  v_discount_resolved := COALESCE(p_discount_amount, 0);
  v_total     := v_subtotal - v_discount_resolved;
  v_total_qar := v_total * p_exchange_rate;

  SELECT c.customer_type, cg.credit_limit, cg.name
  INTO   v_customer_type, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  -- ── Margin gate (below-cost) ──────────────────────────────────────────
  SELECT jsonb_agg(jsonb_build_object(
           'item_name',  (li->>'item_name'),
           'unit_price', (li->>'unit_price')::numeric,
           'avg_cost',   COALESCE((li->>'avg_cost')::numeric, 0)
         )) FILTER (WHERE COALESCE((li->>'avg_cost')::numeric, 0) > 0
                       AND (li->>'unit_price')::numeric < COALESCE((li->>'avg_cost')::numeric, 0))
  INTO   v_below_cost_lines
  FROM   jsonb_array_elements(p_line_items) li;

  IF v_below_cost_lines IS NOT NULL AND jsonb_array_length(v_below_cost_lines) > 0 THEN
    v_has_below_cost := true;
  END IF;

  -- ── Credit gate (over limit) — credit customers only
  IF COALESCE(v_customer_type, 'credit') = 'cash' THEN
    v_credit_limit := 0;
    v_group_name   := 'Cash';
    v_open_total   := 0;
    v_available    := 0;
  ELSE
    IF v_credit_limit IS NULL THEN
      RAISE EXCEPTION 'no_credit_group';
    END IF;

    -- New formula: outstanding on AR invoices + uninvoiced open SOs.
    v_open_total := public.customer_credit_used(p_customer_id, NULL);
    v_available  := v_credit_limit - v_open_total;

    IF p_intent = 'confirm' AND v_total_qar > v_available THEN
      v_exceeds_credit := true;
    END IF;
  END IF;

  -- ── Decide SO status
  IF p_intent = 'save_quote' THEN
    v_so_status := 'quotation';
  ELSIF v_exceeds_credit OR v_has_below_cost THEN
    v_so_status := 'pending_approval';
  ELSE
    v_so_status := 'confirmed';
  END IF;

  -- ── Insert SO
  v_so_number := generate_so_id();
  INSERT INTO sale_orders (
    so_number, customer_id, status, currency, exchange_rate,
    subtotal, discount_amount, discount_amount_resolved, discount_label, discount_type,
    total, validity_days, payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes, customer_notes, notes,
    created_by, division_id
  ) VALUES (
    v_so_number, p_customer_id, v_so_status, p_currency, p_exchange_rate,
    v_subtotal, v_discount_resolved, v_discount_resolved, p_discount_label, p_discount_type,
    v_total, p_validity_days, p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes, p_customer_notes, p_notes,
    v_profile_id, p_division_id
  ) RETURNING id INTO v_so_id;

  -- ── Insert lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_line_items) LOOP
    INSERT INTO sale_order_lines (
      sale_order_id, item_name, sku, qty, unit, unit_price, total,
      line_type, brand_variant_id, tool_asset_item_id, avg_cost
    ) VALUES (
      v_so_id,
      (v_line->>'item_name'),
      (v_line->>'sku'),
      (v_line->>'qty')::numeric,
      (v_line->>'unit'),
      (v_line->>'unit_price')::numeric,
      (v_line->>'total')::numeric,
      (v_line->>'line_type'),
      NULLIF((v_line->>'brand_variant_id'), '')::uuid,
      NULLIF((v_line->>'tool_asset_item_id'), '')::uuid,
      COALESCE((v_line->>'avg_cost')::numeric, 0)
    );
  END LOOP;

  -- ── Build approval chains
  IF v_exceeds_credit THEN
    PERFORM public.build_sales_approval_chain(
      v_so_id, 'credit',
      jsonb_build_object(
        'available',     GREATEST(v_available, 0),
        'overage',       v_total_qar - v_available,
        'requested_by',  v_profile_id
      )
    );
  END IF;
  IF v_has_below_cost THEN
    PERFORM public.build_sales_approval_chain(
      v_so_id, 'margin',
      jsonb_build_object(
        'lines',         v_below_cost_lines,
        'requested_by',  v_profile_id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'so_id',          v_so_id,
    'so_number',      v_so_number,
    'status',         v_so_status,
    'credit_limit',   v_credit_limit,
    'group_name',     v_group_name,
    'open_total',     v_open_total,
    'available',      GREATEST(v_available, 0),
    'exceeds_credit', v_exceeds_credit,
    'has_below_cost', v_has_below_cost
  );
END;
$$;

CREATE FUNCTION public.credit_notes_invalidate_pdf_cache_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.pdf_url := NULL;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_type    TEXT;
  v_division_ids UUID[];
  claims         JSONB;
BEGIN
  SELECT
    CASE
      WHEN bool_or(cr.name = 'Owner')            THEN 'owner'
      WHEN bool_or(cr.name = 'Accountant')        THEN 'accountant'
      WHEN bool_or(cr.name = 'Purchase Manager') THEN 'purchase_manager'
      WHEN bool_or(cr.name = 'Employee')          THEN 'employee'
      ELSE 'employee'
    END,
    ARRAY_AGG(DISTINCT ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL)
  INTO   v_user_type, v_division_ids
  FROM   profiles p
  LEFT JOIN user_custom_roles      ucr ON ucr.profile_id = p.id
  LEFT JOIN custom_roles           cr  ON cr.id          = ucr.role_id
                                       AND cr.is_approval_slot = true
                                       AND cr.deleted_at IS NULL
  LEFT JOIN user_company_divisions ud  ON ud.profile_id  = p.id
  WHERE  p.auth_user_id = (event ->> 'user_id')::UUID
  GROUP BY p.id;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_type}',    to_jsonb(COALESCE(v_user_type, 'employee')));
  claims := jsonb_set(claims, '{division_ids}', to_jsonb(COALESCE(v_division_ids, '{}'::UUID[])));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

CREATE FUNCTION public.customer_credit_used(p_customer_id uuid, p_exclude_so_id uuid DEFAULT NULL::uuid) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH invoiced AS (
    SELECT COALESCE(SUM(GREATEST(i.total_amount - COALESCE(i.paid_amount, 0), 0)), 0) AS outstanding
    FROM   invoices i
    WHERE  i.customer_id = p_customer_id
      AND  i.direction   = 'ar'
      AND  COALESCE(i.status, 'draft') <> 'cancelled'
      AND  (p_exclude_so_id IS NULL OR COALESCE(i.sale_order_id, gen_random_uuid()) <> p_exclude_so_id)
  ),
  uninvoiced AS (
    SELECT COALESCE(SUM(so.total * COALESCE(so.exchange_rate, 1)), 0) AS open_total
    FROM   sale_orders so
    LEFT   JOIN invoices i
           ON  i.sale_order_id = so.id
           AND i.direction     = 'ar'
    WHERE  so.customer_id = p_customer_id
      AND  so.status      NOT IN ('cancelled')
      AND  so.deleted_at  IS NULL
      AND  (p_exclude_so_id IS NULL OR so.id <> p_exclude_so_id)
      AND  i.id IS NULL
  )
  SELECT (SELECT outstanding FROM invoiced)
       + (SELECT open_total  FROM uninvoiced);
$$;

CREATE FUNCTION public.deduct_fifo_layers(p_bv_id uuid, p_wh_id uuid, p_qty integer, p_is_transfer boolean DEFAULT false) RETURNS TABLE(total_cost numeric, weighted_unit_cost numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  r            RECORD;
  remaining    INT := p_qty;
  v_total_cost NUMERIC := 0;
  v_take       INT;
BEGIN
  -- Walk oldest layers first, locking each row before touching it.
  -- receival_number added between date and created_at so same-date receivals
  -- drain in arrival sequence (RCV-00010 before RCV-00011, etc.)
  FOR r IN
    SELECT id, remaining_qty, total_unit_cost
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_bv_id
      AND (
        (p_wh_id IS NOT NULL AND warehouse_id = p_wh_id)
        OR (p_wh_id IS NULL AND warehouse_id IS NULL)
      )
      AND remaining_qty > 0
    ORDER BY date ASC, receival_number ASC, created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining = 0;

    v_take := LEAST(remaining, r.remaining_qty);

    UPDATE fifo_cost_layers
    SET remaining_qty = remaining_qty - v_take
    WHERE id = r.id;

    v_total_cost := v_total_cost + (v_take * r.total_unit_cost);
    remaining    := remaining - v_take;
  END LOOP;

  -- Guard: if we couldn't satisfy the full quantity, roll everything back
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock: requested %, missing % units for variant %',
      p_qty, remaining, p_bv_id;
  END IF;

  -- Skip global stock_level update for warehouse-to-warehouse transfers
  IF NOT p_is_transfer THEN
    UPDATE inventory_brand_variants
    SET stock_level = stock_level - p_qty,
        updated_at  = now()
    WHERE id = p_bv_id;
  END IF;

  -- Recalculate weighted average after deduction
  PERFORM recalc_average_cost(p_bv_id);

  RETURN QUERY SELECT
    v_total_cost,
    CASE WHEN p_qty = 0 THEN 0::NUMERIC ELSE v_total_cost / p_qty END;
END;
$$;

CREATE FUNCTION public.detach_payment_from_invoice(p_payment_id uuid, p_invoice_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_payment RECORD;
  v_invoice RECORD;
BEGIN
  SELECT id, direction, invoice_id, customer_id
  INTO   v_payment
  FROM   payments
  WHERE  id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;
  IF v_payment.direction != 'incoming' THEN
    RAISE EXCEPTION 'Payment must be direction=incoming';
  END IF;
  IF v_payment.invoice_id IS DISTINCT FROM p_invoice_id THEN
    RAISE EXCEPTION 'Payment is not linked to this invoice';
  END IF;

  SELECT id, customer_id
  INTO   v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  IF v_payment.customer_id IS NOT NULL
     AND v_payment.customer_id IS DISTINCT FROM v_invoice.customer_id THEN
    RAISE EXCEPTION 'Payment customer does not match invoice customer';
  END IF;

  UPDATE payments SET invoice_id = NULL WHERE id = p_payment_id;
  -- Trigger fires automatically → recalculate_ar_invoice_payment_status
END;
$$;

CREATE FUNCTION public.dispatch_transfer(p_transfer_id uuid, p_dispatched_by_profile_id uuid, p_dispatched_by_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_result RECORD;
BEGIN
  -- Lock transfer row
  SELECT id, from_warehouse_id, to_warehouse_id, status, date
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer % cannot be dispatched — current status: %', p_transfer_id, v_transfer.status;
  END IF;

  -- Auth check: must be Field RP of source warehouse OR inventory_manager
  IF NOT is_field_rp_of(p_dispatched_by_profile_id, v_transfer.from_warehouse_id)
     AND NOT has_inventory_manager_role(p_dispatched_by_profile_id) THEN
    RAISE EXCEPTION 'User is not authorized to dispatch from this warehouse';
  END IF;

  -- Update transfer status
  UPDATE warehouse_transfers
  SET status = 'in_transit',
      dispatched_by_profile_id = p_dispatched_by_profile_id,
      dispatched_by_name = p_dispatched_by_name,
      dispatched_at = now()
  WHERE id = p_transfer_id;

  -- Process each item: deduct FIFO, release allocation, create movements
  -- ORDER BY brand_variant_id to prevent deadlocks when concurrent transfers
  -- share items — both transactions lock rows in the same deterministic order.
  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    -- Deduct from FIFO layers (p_is_transfer = TRUE skips global stock_level change)
    SELECT total_cost, weighted_unit_cost
    INTO v_result
    FROM deduct_fifo_layers(v_item.brand_variant_id, v_transfer.from_warehouse_id, v_item.requested_qty, TRUE);

    -- Release allocation
    UPDATE warehouse_stock_allocations
    SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
        updated_at = now()
    WHERE warehouse_id = v_transfer.from_warehouse_id
      AND brand_variant_id = v_item.brand_variant_id;

    -- Record dispatched_qty
    UPDATE warehouse_transfer_items
    SET dispatched_qty = v_item.requested_qty
    WHERE id = v_item.id;

    -- Create transfer_out movement
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES (
      v_transfer.from_warehouse_id, v_item.brand_variant_id,
      v_item.item_name, v_item.sku,
      'transfer_out', -v_item.requested_qty, v_result.weighted_unit_cost,
      'transfer', p_transfer_id
    );
  END LOOP;
END;
$$;

CREATE FUNCTION public.fn_refresh_incoming_qty(p_bv_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE inventory_brand_variants
  SET incoming   = (
        SELECT COALESCE(
          SUM(GREATEST(pli.qty - COALESCE(pli.received_qty, 0), 0)),
          0
        )
        FROM po_line_items  pli
        JOIN purchase_orders po ON po.id = pli.po_id
        WHERE pli.brand_variant_id = p_bv_id
          AND po.status IN ('approved', 'partially_received')
          AND po.deleted_at IS NULL
      ),
      updated_at = now()
  WHERE id = p_bv_id;
END;
$$;

CREATE FUNCTION public.fn_refresh_reserved_qty(p_bv_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE inventory_brand_variants
  SET reserved_qty = (
        SELECT COALESCE(SUM(sol.qty), 0)
        FROM sale_order_lines sol
        JOIN sale_orders so ON so.id = sol.sale_order_id
        WHERE sol.brand_variant_id = p_bv_id
          AND so.status IN ('confirmed', 'partial_delivery')
          AND so.deleted_at IS NULL
      ),
      updated_at = now()
  WHERE id = p_bv_id;
END;
$$;

CREATE FUNCTION public.fn_refresh_warehouse_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_wh_id UUID;
BEGIN
  -- When a row moves from warehouse A → warehouse B, refresh BOTH sides
  IF (TG_OP = 'UPDATE') AND (OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id) THEN
    IF OLD.warehouse_id IS NOT NULL THEN
      UPDATE warehouses SET
        item_count  = (SELECT COUNT(DISTINCT brand_variant_id) FROM fifo_cost_layers
                       WHERE warehouse_id = OLD.warehouse_id AND remaining_qty > 0),
        total_value = (SELECT COALESCE(SUM(remaining_qty * total_unit_cost), 0) FROM fifo_cost_layers
                       WHERE warehouse_id = OLD.warehouse_id AND remaining_qty > 0),
        updated_at  = now()
      WHERE id = OLD.warehouse_id;
    END IF;
    IF NEW.warehouse_id IS NOT NULL THEN
      UPDATE warehouses SET
        item_count  = (SELECT COUNT(DISTINCT brand_variant_id) FROM fifo_cost_layers
                       WHERE warehouse_id = NEW.warehouse_id AND remaining_qty > 0),
        total_value = (SELECT COALESCE(SUM(remaining_qty * total_unit_cost), 0) FROM fifo_cost_layers
                       WHERE warehouse_id = NEW.warehouse_id AND remaining_qty > 0),
        updated_at  = now()
      WHERE id = NEW.warehouse_id;
    END IF;
    RETURN NULL;
  END IF;

  -- Normal case: INSERT, DELETE, or UPDATE where warehouse_id did not change
  v_wh_id := COALESCE(NEW.warehouse_id, OLD.warehouse_id);
  IF v_wh_id IS NULL THEN RETURN NULL; END IF;

  UPDATE warehouses SET
    item_count  = (SELECT COUNT(DISTINCT brand_variant_id) FROM fifo_cost_layers
                   WHERE warehouse_id = v_wh_id AND remaining_qty > 0),
    total_value = (SELECT COALESCE(SUM(remaining_qty * total_unit_cost), 0) FROM fifo_cost_layers
                   WHERE warehouse_id = v_wh_id AND remaining_qty > 0),
    updated_at  = now()
  WHERE id = v_wh_id;

  RETURN NULL;
END;
$$;

CREATE FUNCTION public.force_approve_credit_group_change(p_request_id uuid, p_comment text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_profile_id   uuid;
  v_full_name    TEXT;
  v_is_owner     BOOLEAN;
  v_request      RECORD;
  v_iteration    INT;
  v_count        INT;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id      = v_profile_id
      AND  cr.name             = 'Owner'
      AND  cr.is_approval_slot = true
      AND  cr.deleted_at       IS NULL
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only users with the Owner role can force-approve';
  END IF;

  SELECT * INTO v_request FROM customer_credit_group_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit-group request not found';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is no longer pending (status: %)', v_request.status;
  END IF;

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM   customer_credit_group_approvals
  WHERE  request_id = p_request_id;

  UPDATE customer_credit_group_approvals
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         decided_at      = now(),
         force_approved  = true,
         force_comment   = NULLIF(TRIM(COALESCE(p_comment, '')), ''),
         comment         = COALESCE(comment, p_comment)
  WHERE  request_id = p_request_id
    AND  iteration  = v_iteration
    AND  status     = 'pending'
    AND  is_active  = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No pending steps to force-approve on this request';
  END IF;

  UPDATE customers
     SET credit_group_id = v_request.requested_group_id,
         customer_type   = 'credit',
         is_blocked      = false,
         block_reason    = NULL
   WHERE id = v_request.customer_id;

  UPDATE customer_credit_group_requests
     SET status     = 'approved',
         decided_by = v_profile_id,
         decided_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.activity_log (
    action, module, entity_type, entity_id, performer_name, severity, details
  ) VALUES (
    'Credit Group Change Force-Approved',
    'customers',
    'customer',
    v_request.customer_id,
    v_full_name,
    'critical',
    jsonb_build_object(
      'request_id',     v_request.id,
      'iteration',      v_iteration,
      'forced_count',   v_count,
      'force_comment',  NULLIF(TRIM(COALESCE(p_comment, '')), '')
    )::text
  );

  RETURN v_count;
END;
$$;

CREATE FUNCTION public.force_approve_sales_request(p_so_id uuid, p_approval_type public.approval_type, p_comment text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_profile_id  uuid;
  v_full_name   TEXT;
  v_is_owner    BOOLEAN;
  v_iteration   INT;
  v_count       INT;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id      = v_profile_id
      AND  cr.name             = 'Owner'
      AND  cr.is_approval_slot = true
      AND  cr.deleted_at       IS NULL
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only users with the Owner role can force-approve';
  END IF;

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM   sale_order_approvals
  WHERE  source_type   = 'sale_order'
    AND  source_id     = p_so_id
    AND  approval_type = p_approval_type;

  UPDATE sale_order_approvals
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         comment         = COALESCE(comment, p_comment),
         force_approved  = true,
         force_comment   = NULLIF(TRIM(COALESCE(p_comment, '')), ''),
         is_active       = true
  WHERE  source_type   = 'sale_order'
    AND  source_id     = p_so_id
    AND  approval_type = p_approval_type
    AND  iteration     = v_iteration
    AND  status        = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No pending steps to force-approve on this slip';
  END IF;

  PERFORM public.advance_sales_approval(p_so_id, p_approval_type);

  RETURN v_count;
END;
$$;

CREATE FUNCTION public.generate_brand_variant_sku() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
  v_cat_name  text;
  v_item_name text;
  v_cat_abbr  text;
  v_item_abbr text;
  v_prefix    text;
  v_next_seq  integer;
BEGIN
  -- Only generate if code is null or empty
  IF NEW.code IS NOT NULL AND trim(NEW.code) <> '' THEN
    RETURN NEW;
  END IF;

  -- Look up item and category names
  SELECT i.name_en, c.name_en
    INTO v_item_name, v_cat_name
    FROM public.inventory_items i
    LEFT JOIN public.inventory_categories c ON c.id = i.category_id
   WHERE i.id = NEW.item_id;

  -- Build abbreviations (fallback to 'XXX' if null/empty)
  v_cat_abbr  := coalesce(nullif(public.sku_abbreviation(v_cat_name, 3), ''), 'XXX');
  v_item_abbr := coalesce(nullif(public.sku_abbreviation(v_item_name, 3), ''), 'XXX');
  v_prefix    := v_cat_abbr || '-' || v_item_abbr || '-';

  -- Find next sequential number for this prefix
  SELECT coalesce(max(
    (regexp_match(code, v_prefix || '(\d+)$'))[1]::integer
  ), 0) + 1
    INTO v_next_seq
    FROM public.inventory_brand_variants
   WHERE code LIKE v_prefix || '%';

  NEW.code := v_prefix || lpad(v_next_seq::text, 3, '0');

  RETURN NEW;
END;
$_$;

CREATE FUNCTION public.generate_check_number() RETURNS text
    LANGUAGE sql
    AS $$
  SELECT 'IC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('inventory_check_seq')::TEXT, 5, '0')
$$;

CREATE FUNCTION public.generate_invoice_from_so(p_so_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_so               RECORD;
  v_invoice_id_str   TEXT;
  v_invoice_type     TEXT;
  v_issued_date      DATE;
  v_due_date         DATE;
  v_inv_count        INT;
  v_new_inv_id       uuid;
  v_new_inv_str      TEXT;
  v_paid_amount      NUMERIC;
  v_payment_status   TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoices_serial'));

  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE  sale_order_id = p_so_id AND direction = 'ar'
  ) THEN
    RAISE EXCEPTION 'invoice_exists';
  END IF;

  SELECT
    so.id, so.so_number, so.status, so.customer_id,
    so.subtotal,
    COALESCE(so.tax, 0)                 AS tax,
    so.total                            AS total_amount,
    COALESCE(c.customer_type, 'credit') AS customer_type
  INTO v_so
  FROM sale_orders so
  JOIN customers   c  ON c.id = so.customer_id
  WHERE so.id = p_so_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'so_not_found';
  END IF;

  IF v_so.status NOT IN ('confirmed', 'partial_delivery', 'delivered') THEN
    RAISE EXCEPTION 'so_not_invoiceable';
  END IF;

  -- Sum payments already recorded against the SO (QAR-equivalent if present).
  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
    INTO v_paid_amount
  FROM   public.payments
  WHERE  source_type = 'sale_order'
    AND  source_id   = p_so_id
    AND  deleted_at IS NULL;

  v_payment_status := CASE
    WHEN v_paid_amount >= v_so.total_amount THEN 'paid'
    WHEN v_paid_amount > 0                  THEN 'partially_paid'
    ELSE                                          'unpaid'
  END;

  SELECT COUNT(*) + 1 INTO v_inv_count FROM invoices;
  v_invoice_id_str := 'INV-' || LPAD(v_inv_count::text, 5, '0');

  v_invoice_type := v_so.customer_type;
  v_issued_date  := CURRENT_DATE;
  v_due_date     := CASE v_invoice_type
    WHEN 'cash' THEN CURRENT_DATE
    ELSE             CURRENT_DATE + 30
  END;

  INSERT INTO invoices (
    invoice_id, customer_id, direction, sale_order_id,
    invoice_type, doc_status, status, payment_status, needs_refresh,
    total_amount, subtotal, tax, paid_amount,
    issued_date, due_date,
    source, source_id, source_label
  ) VALUES (
    v_invoice_id_str, v_so.customer_id, 'ar', p_so_id,
    v_invoice_type, 'draft', 'draft', v_payment_status, false,
    v_so.total_amount, v_so.subtotal, v_so.tax, v_paid_amount,
    v_issued_date, v_due_date,
    'order', p_so_id::text, 'SO #' || v_so.so_number
  )
  RETURNING id, invoice_id INTO v_new_inv_id, v_new_inv_str;

  -- Re-point the SO's payments at the new invoice so the invoice's payment
  -- history surfaces them. New payments from here on go on the invoice too.
  UPDATE public.payments
  SET    source_type = 'invoice',
         source_id   = v_new_inv_id
  WHERE  source_type = 'sale_order'
    AND  source_id   = p_so_id
    AND  deleted_at IS NULL;

  INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total)
  SELECT v_new_inv_id, sol.item_name, sol.qty, sol.unit_price, sol.total
  FROM   sale_order_lines sol
  WHERE  sol.sale_order_id = p_so_id;

  RETURN jsonb_build_object(
    'id',           v_new_inv_id,
    'invoice_id',   v_new_inv_str,
    'invoice_type', v_invoice_type,
    'paid_amount',  v_paid_amount
  );
END;
$$;

CREATE FUNCTION public.generate_transfer_number() RETURNS text
    LANGUAGE sql
    AS $$
  SELECT 'WT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('warehouse_transfer_seq')::TEXT, 5, '0')
$$;

CREATE FUNCTION public.get_category_stock_aggregates(p_type text) RETURNS TABLE(category_id uuid, total_stock bigint, total_reserved bigint, total_damaged bigint, total_incoming bigint, avg_cost numeric, variant_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH RECURSIVE cat_tree AS (
    SELECT id, parent_id
    FROM inventory_categories
    WHERE type = p_type::inventory_type AND status <> 'archived'

    UNION ALL

    SELECT child.id, child.parent_id
    FROM inventory_categories child
    JOIN cat_tree parent ON child.parent_id = parent.id
    WHERE child.status <> 'archived'
  ),
  -- Map each leaf category to all its ancestors (including itself)
  leaf_cats AS (
    SELECT id FROM inventory_categories
    WHERE type = p_type::inventory_type AND status <> 'archived'
  ),
  -- Get stock per leaf category from brand variants
  leaf_stock AS (
    SELECT
      ii.category_id,
      COALESCE(SUM(ibv.stock_level), 0) AS total_stock,
      COALESCE(SUM(ibv.reserved_qty), 0) AS total_reserved,
      COALESCE(SUM(ibv.damaged_qty), 0) AS total_damaged,
      COALESCE(SUM(ibv.incoming), 0) AS total_incoming,
      CASE WHEN COUNT(ibv.id) > 0
        THEN ROUND(SUM(ibv.average_cost * ibv.stock_level) / NULLIF(SUM(ibv.stock_level), 0), 2)
        ELSE 0
      END AS avg_cost,
      COUNT(ibv.id) AS variant_count
    FROM inventory_items ii
    JOIN inventory_brand_variants ibv ON ibv.item_id = ii.id
    WHERE ii.status <> 'archived'
      AND ibv.status <> 'archived'
    GROUP BY ii.category_id
  ),
  -- Expand: for each ancestor, sum the stock of all its descendant leaf categories
  ancestors_expanded AS (
    SELECT
      ancestor.id AS ancestor_id,
      ls.total_stock,
      ls.total_reserved,
      ls.total_damaged,
      ls.total_incoming,
      ls.avg_cost,
      ls.variant_count,
      ls.total_stock AS weighted_cost_numerator
    FROM leaf_stock ls
    JOIN (
      WITH RECURSIVE climb AS (
        SELECT id, id AS leaf_id FROM leaf_cats
        UNION ALL
        SELECT ic.parent_id, climb.leaf_id
        FROM climb
        JOIN inventory_categories ic ON ic.id = climb.id
        WHERE ic.parent_id IS NOT NULL
      )
      SELECT id AS id, leaf_id FROM climb
    ) ancestor ON ancestor.leaf_id = ls.category_id
  )
  SELECT
    ae.ancestor_id AS category_id,
    SUM(ae.total_stock)::BIGINT AS total_stock,
    SUM(ae.total_reserved)::BIGINT AS total_reserved,
    SUM(ae.total_damaged)::BIGINT AS total_damaged,
    SUM(ae.total_incoming)::BIGINT AS total_incoming,
    CASE WHEN SUM(ae.total_stock) > 0
      THEN ROUND(SUM(ae.avg_cost * ae.total_stock) / SUM(ae.total_stock), 2)
      ELSE 0
    END AS avg_cost,
    SUM(ae.variant_count)::BIGINT AS variant_count
  FROM ancestors_expanded ae
  GROUP BY ae.ancestor_id;
$$;

CREATE FUNCTION public.get_cogs_breakdown(p_brand_variant_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sold_at_sale  NUMERIC;
  v_lc_list       JSONB;
  v_total         NUMERIC;
BEGIN
  -- Sale-time COGS total (rows with no landed_cost_id)
  SELECT COALESCE(SUM(total_cost), 0)
    INTO v_sold_at_sale
    FROM cogs_entries
   WHERE brand_variant_id = p_brand_variant_id
     AND landed_cost_id IS NULL;

  -- Per-LC net total. Original + any reversal pair cancels to zero — filter out.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'lc_id',       lc.id,
        'lc_number',   lc.lc_number,
        'applied_at',  lc.applied_at,
        'total_cost',  agg.net_total
      )
      ORDER BY lc.applied_at NULLS LAST
    ),
    '[]'::JSONB
  )
  INTO v_lc_list
  FROM (
    SELECT landed_cost_id, SUM(total_cost) AS net_total
      FROM cogs_entries
     WHERE brand_variant_id = p_brand_variant_id
       AND landed_cost_id  IS NOT NULL
     GROUP BY landed_cost_id
    HAVING SUM(total_cost) <> 0
  ) agg
  JOIN landed_costs lc ON lc.id = agg.landed_cost_id;

  v_total := v_sold_at_sale + COALESCE(
    (SELECT SUM((entry->>'total_cost')::NUMERIC) FROM jsonb_array_elements(v_lc_list) AS entry),
    0
  );

  RETURN jsonb_build_object(
    'sold_at_sale',    v_sold_at_sale,
    'lc_adjustments',  v_lc_list,
    'total',           v_total
  );
END;
$$;

CREATE FUNCTION public.get_customer_pending_balances() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(grouped))
  INTO result
  FROM (
    SELECT
      c.id                                        AS customer_id,
      c.name                                      AS customer_name,
      (
        SELECT COALESCE(
                 jsonb_agg(
                   jsonb_build_object(
                     'id',         cp.id,
                     'phone',      cp.phone,
                     'is_primary', cp.is_primary,
                     'label',      cp.label
                   )
                   ORDER BY cp.is_primary DESC, cp.created_at ASC
                 ),
                 '[]'::jsonb
               )
        FROM   customer_phones cp
        WHERE  cp.customer_id = c.id
      )                                           AS phones,
      i.division_id,
      d.name                                      AS division_name,
      SUM(COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0))
                                                  AS total_pending,
      COUNT(i.id)                                 AS invoice_count,
      COUNT(i.id) FILTER (WHERE i.payment_status = 'overdue')
                                                  AS overdue_count,
      jsonb_agg(
        jsonb_build_object(
          'id',             i.id,
          'invoice_id',     i.invoice_id,
          'phone_id',       i.phone_id,
          'division_id',    i.division_id,
          'division_name',  d.name,
          'source_type',    i.source::text,
          'source_id',      i.source_id,
          'source_label',   i.source_label,
          'issued_date',    i.issued_date,
          'due_date',       i.due_date,
          'total_amount',   i.total_amount,
          'paid_amount',    COALESCE(i.paid_amount, 0),
          'payment_status', i.payment_status
        )
        ORDER BY i.due_date ASC
      )                                           AS invoices
    FROM   invoices i
    JOIN   customers c          ON c.id = i.customer_id
    LEFT JOIN company_divisions d ON d.id = i.division_id
    WHERE  i.direction = 'ar'
      AND  i.status NOT IN ('void', 'cancelled')
      AND  i.payment_status NOT IN ('paid')
      AND  (COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0)) > 0
    GROUP BY c.id, c.name, i.division_id, d.name
    ORDER BY total_pending DESC
  ) grouped;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.get_dead_stock_report() RETURNS TABLE(brand_variant_id uuid, item_name text, category_name text, brand text, sku text, stock_level numeric, average_cost numeric, total_value numeric, last_movement_date timestamp with time zone, last_movement_source text, days_idle integer, status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH
  latest_movements AS (
    SELECT brand_variant_id, MAX(created_at) AS last_movement_at
    FROM   inventory_stock_movements
    GROUP  BY brand_variant_id
  ),
  oldest_fifo AS (
    SELECT brand_variant_id, MIN(date) AS oldest_layer_date
    FROM   fifo_cost_layers
    WHERE  remaining_qty > 0
    GROUP  BY brand_variant_id
  ),
  computed AS (
    SELECT
      ibv.id                                                      AS brand_variant_id,
      ii.name_en                                                  AS item_name,
      ic.name_en                                                  AS category_name,
      ibv.brand,
      ibv.code                                                    AS sku,
      ibv.stock_level,
      COALESCE(ibv.average_cost, 0)                              AS average_cost,
      ibv.stock_level * COALESCE(ibv.average_cost, 0)            AS total_value,
      -- Priority: last movement → oldest FIFO layer → variant created_at
      COALESCE(lm.last_movement_at,
               of.oldest_layer_date::timestamptz,
               ibv.created_at)                                   AS last_movement_date,
      CASE
        WHEN lm.last_movement_at  IS NOT NULL THEN 'movement'
        WHEN of.oldest_layer_date IS NOT NULL THEN 'fifo'
        WHEN ibv.created_at       IS NOT NULL THEN 'created'
        ELSE NULL
      END                                                         AS last_movement_source,
      EXTRACT(DAY FROM
        CURRENT_TIMESTAMP -
        COALESCE(lm.last_movement_at,
                 of.oldest_layer_date::timestamptz,
                 ibv.created_at)
      )::int                                                      AS days_idle
    FROM       inventory_brand_variants ibv
    JOIN       inventory_items          ii ON ii.id = ibv.item_id
    LEFT JOIN  inventory_categories     ic ON ic.id = ii.category_id
    LEFT JOIN  latest_movements         lm ON lm.brand_variant_id = ibv.id
    LEFT JOIN  oldest_fifo              of ON of.brand_variant_id = ibv.id
    WHERE ibv.stock_level > 0
  )
  SELECT
    brand_variant_id,
    item_name,
    category_name,
    brand,
    sku,
    stock_level,
    average_cost,
    total_value,
    last_movement_date,
    last_movement_source,
    days_idle,
    CASE
      WHEN days_idle <= 30  THEN 'active'
      WHEN days_idle <= 90  THEN 'slow_moving'
      WHEN days_idle <= 180 THEN 'at_risk'
      ELSE                       'dead'
    END AS status
  FROM computed;
$$;

CREATE FUNCTION public.get_invoice_summary() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'status_counts', (
      SELECT jsonb_object_agg(payment_status, cnt)
      FROM (
        SELECT payment_status, COUNT(*)::int AS cnt
        FROM   invoices
        WHERE  direction = 'ar'
          AND  status NOT IN ('void', 'cancelled')
        GROUP BY payment_status
      ) sc
    ),
    'outstanding', (
      SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
      FROM   invoices
      WHERE  direction = 'ar'
        AND  status NOT IN ('void', 'cancelled')
        AND  payment_status != 'paid'
    )
  );
$$;

CREATE FUNCTION public.get_payment_summary() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'status_counts', (
      SELECT jsonb_object_agg(COALESCE(status, 'pending'), cnt)
      FROM (
        SELECT status, COUNT(*)::int AS cnt
        FROM   payments
        WHERE  direction = 'incoming' AND deleted_at IS NULL
        GROUP BY status
      ) sc
    ),
    'collected', (
      SELECT COALESCE(SUM(amount), 0)
      FROM   payments
      WHERE  direction = 'incoming' AND deleted_at IS NULL AND status = 'completed'
    ),
    'method_totals', (
      SELECT COALESCE(jsonb_object_agg(method, total), '{}'::jsonb)
      FROM (
        SELECT method, SUM(amount) AS total
        FROM   payments
        WHERE  direction = 'incoming' AND deleted_at IS NULL AND status = 'completed'
        GROUP BY method
      ) mt
    )
  );
$$;

CREATE FUNCTION public.get_stock_value_cogs_summary(p_brand_variant_ids uuid[] DEFAULT NULL::uuid[]) RETURNS TABLE(brand_variant_id uuid, sold_at_sale_total numeric, lc_adjustments_total numeric, lc_adjustment_count integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH per_lc AS (
    SELECT
      brand_variant_id,
      landed_cost_id,
      SUM(total_cost) AS lc_net_total
    FROM cogs_entries
    WHERE landed_cost_id IS NOT NULL
      AND (p_brand_variant_ids IS NULL OR brand_variant_id = ANY(p_brand_variant_ids))
    GROUP BY brand_variant_id, landed_cost_id
    HAVING SUM(total_cost) <> 0
  ),
  lc_agg AS (
    SELECT
      brand_variant_id,
      COALESCE(SUM(lc_net_total), 0)        AS lc_adjustments_total,
      COUNT(DISTINCT landed_cost_id)::INT   AS lc_adjustment_count
    FROM per_lc
    GROUP BY brand_variant_id
  ),
  sale_agg AS (
    SELECT
      brand_variant_id,
      COALESCE(SUM(total_cost), 0) AS sold_at_sale_total
    FROM cogs_entries
    WHERE landed_cost_id IS NULL
      AND (p_brand_variant_ids IS NULL OR brand_variant_id = ANY(p_brand_variant_ids))
    GROUP BY brand_variant_id
  )
  SELECT
    bv.id                                          AS brand_variant_id,
    COALESCE(sale_agg.sold_at_sale_total, 0)       AS sold_at_sale_total,
    COALESCE(lc_agg.lc_adjustments_total, 0)       AS lc_adjustments_total,
    COALESCE(lc_agg.lc_adjustment_count, 0)        AS lc_adjustment_count
  FROM inventory_brand_variants bv
  LEFT JOIN sale_agg ON sale_agg.brand_variant_id = bv.id
  LEFT JOIN lc_agg   ON lc_agg.brand_variant_id   = bv.id
  WHERE (p_brand_variant_ids IS NULL OR bv.id = ANY(p_brand_variant_ids))
    AND (
      COALESCE(sale_agg.sold_at_sale_total, 0) <> 0
      OR COALESCE(lc_agg.lc_adjustments_total, 0) <> 0
    );
$$;

CREATE FUNCTION public.has_admin_permission() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_custom_roles ur ON ur.profile_id = p.id
    JOIN public.custom_roles      cr ON cr.id        = ur.role_id
    WHERE p.auth_user_id = auth.uid()
      AND (
        cr.is_system = true
        OR 'master_data.users.manage' = ANY (cr.permissions)
      )
  );
$$;

CREATE FUNCTION public.has_inventory_manager_role(p_profile_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id
    WHERE ucr.profile_id = p_profile_id
      AND cr.name = 'inventory_manager'
      AND cr.deleted_at IS NULL
  );
$$;

CREATE FUNCTION public.increment_credit_balance(p_customer_id uuid, p_amount numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE customers
  SET credit_balance = COALESCE(credit_balance, 0) + p_amount,
      updated_at = now()
  WHERE id = p_customer_id;
END;
$$;

CREATE FUNCTION public.invoice_line_items_invalidate_parent_pdf_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_invoice_id UUID;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.invoices
     SET pdf_url = NULL
   WHERE id = v_invoice_id
     AND pdf_url IS NOT NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE FUNCTION public.invoice_recompute_paid_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_invoice_id     uuid;
  v_old_invoice_id uuid;
BEGIN
  -- Pick the invoice this row points at, regardless of which shape it uses.
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type = 'invoice' THEN v_invoice_id := OLD.source_id;
    ELSIF OLD.invoice_id IS NOT NULL THEN v_invoice_id := OLD.invoice_id;
    END IF;
  ELSE
    IF NEW.source_type = 'invoice' THEN v_invoice_id := NEW.source_id;
    ELSIF NEW.invoice_id IS NOT NULL THEN v_invoice_id := NEW.invoice_id;
    END IF;
  END IF;

  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  WITH summed AS (
    SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0) AS paid
    FROM   public.payments
    WHERE  (
             (source_type = 'invoice' AND source_id = v_invoice_id)
             OR invoice_id = v_invoice_id
           )
      AND  deleted_at IS NULL
      AND  direction  = 'incoming'
  )
  UPDATE public.invoices i
  SET    paid_amount    = summed.paid,
         payment_status = CASE
           WHEN summed.paid >= i.total_amount THEN 'paid'
           WHEN summed.paid > 0               THEN 'partially_paid'
           ELSE                                    'unpaid'
         END
  FROM   summed
  WHERE  i.id = v_invoice_id;

  -- UPDATE that moves a payment between invoices: resync the prior invoice too.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.source_type = 'invoice' THEN v_old_invoice_id := OLD.source_id;
    ELSIF OLD.invoice_id IS NOT NULL THEN v_old_invoice_id := OLD.invoice_id;
    END IF;

    IF v_old_invoice_id IS NOT NULL AND v_old_invoice_id <> v_invoice_id THEN
      WITH summed AS (
        SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0) AS paid
        FROM   public.payments
        WHERE  (
                 (source_type = 'invoice' AND source_id = v_old_invoice_id)
                 OR invoice_id = v_old_invoice_id
               )
          AND  deleted_at IS NULL
          AND  direction  = 'incoming'
      )
      UPDATE public.invoices i
      SET    paid_amount    = summed.paid,
             payment_status = CASE
               WHEN summed.paid >= i.total_amount THEN 'paid'
               WHEN summed.paid > 0               THEN 'partially_paid'
               ELSE                                    'unpaid'
             END
      FROM   summed
      WHERE  i.id = v_old_invoice_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE FUNCTION public.invoices_invalidate_pdf_cache_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.pdf_url := NULL;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.is_division_visible(row_division_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT (
    row_division_id IS NULL
    OR (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR row_division_id = ANY(
      ARRAY(
        SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids')
      )::UUID[]
    )
  );
$$;

CREATE FUNCTION public.is_field_rp_of(p_profile_id uuid, p_warehouse_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM warehouse_field_rps
    WHERE profile_id = p_profile_id AND warehouse_id = p_warehouse_id
  );
$$;

CREATE FUNCTION public.log_sales_approval_decision() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_action  TEXT;
  v_details TEXT;
BEGIN
  IF NEW.source_type <> 'sale_order' THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status      THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;

  IF NEW.status = 'approved' AND NEW.force_approved THEN
    v_action := format('Sales Approval Force-Approved — %s (%s)',
                       INITCAP(REPLACE(NEW.step_role, '_', ' ')),
                       NEW.approval_type);
  ELSIF NEW.status = 'approved' THEN
    v_action := format('Sales Approval Approved — %s (%s)',
                       INITCAP(REPLACE(NEW.step_role, '_', ' ')),
                       NEW.approval_type);
  ELSE
    v_action := format('Sales Approval Rejected — %s (%s)',
                       INITCAP(REPLACE(NEW.step_role, '_', ' ')),
                       NEW.approval_type);
  END IF;

  v_details := jsonb_build_object(
    'approval_type', NEW.approval_type,
    'step_role',     NEW.step_role,
    'iteration',     NEW.iteration,
    'comment',       NULLIF(NEW.comment, ''),
    'reason',        CASE WHEN NEW.status = 'rejected' THEN NEW.reason ELSE NULL END,
    'force',         NEW.force_approved
  )::text;

  INSERT INTO public.activity_log (
    action, module, entity_type, entity_id,
    performer_name, severity, details
  ) VALUES (
    v_action,
    'sale_orders',
    'sale_order',
    NEW.source_id,
    NEW.decided_by_name,
    CASE
      WHEN NEW.status = 'rejected'        THEN 'warning'
      WHEN NEW.force_approved              THEN 'critical'
      ELSE                                       'info'
    END,
    v_details
  );

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.mark_overdue_invoices() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE invoices
  SET    payment_status = 'overdue'
  WHERE  direction = 'ar'
    AND  payment_status NOT IN ('paid')
    AND  status NOT IN ('void', 'cancelled')
    AND  due_date < NOW();
END;
$$;

CREATE FUNCTION public.next_delivery_number() RETURNS text
    LANGUAGE sql
    AS $$
  SELECT 'DEL-' || LPAD(nextval('delivery_number_seq')::TEXT, 5, '0');
$$;

CREATE FUNCTION public.payments_redirect_to_invoice_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  IF NEW.source_type <> 'sale_order' OR NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_invoice_id
  FROM   public.invoices
  WHERE  sale_order_id = NEW.source_id AND direction = 'ar'
  LIMIT  1;
  IF v_invoice_id IS NOT NULL THEN
    NEW.source_type := 'invoice';
    NEW.source_id   := v_invoice_id;
    NEW.invoice_id  := v_invoice_id;        -- keep legacy column aligned
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.payments_sync_invoice_id_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.source_type = 'invoice' AND NEW.source_id IS NOT NULL THEN
    NEW.invoice_id := NEW.source_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.po_line_items_invalidate_parent_pdf_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_po_id UUID;
BEGIN
  v_po_id := COALESCE(NEW.po_id, OLD.po_id);
  IF v_po_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.purchase_orders
     SET pdf_rfq_url       = NULL,
         pdf_draft_url     = NULL,
         pdf_po_url        = NULL,
         pdf_confirmed_url = NULL,
         pdf_payment_hash  = NULL
   WHERE id = v_po_id
     AND (pdf_rfq_url IS NOT NULL
       OR pdf_draft_url IS NOT NULL
       OR pdf_po_url IS NOT NULL
       OR pdf_confirmed_url IS NOT NULL
       OR pdf_payment_hash IS NOT NULL);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE FUNCTION public.purchase_orders_invalidate_pdf_cache_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.pdf_rfq_url       := NULL;
  NEW.pdf_draft_url     := NULL;
  NEW.pdf_po_url        := NULL;
  NEW.pdf_confirmed_url := NULL;
  NEW.pdf_payment_hash  := NULL;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.reason_list_categories_no_orphan_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Hard delete blocked when reasons exist; soft delete still works because
  -- it's an UPDATE not a DELETE, and reasons can also be soft-archived
  -- separately by toggling reason_lists.active.
  SELECT COUNT(*) INTO v_count
  FROM   public.reason_lists
  WHERE  category = OLD.slug AND deleted_at IS NULL;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete category "%": % active reason(s) still reference it. Soft-delete (set deleted_at) or move the reasons first.',
      OLD.slug, v_count
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

CREATE FUNCTION public.reason_lists_category_must_exist() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.reason_list_categories
    WHERE slug = NEW.category AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unknown reason category: %. Add it to reason_list_categories first.', NEW.category
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.recalc_average_cost(p_bv_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_avg NUMERIC;
BEGIN
  SELECT
    CASE
      WHEN SUM(remaining_qty) = 0 THEN 0
      ELSE SUM(remaining_qty * total_unit_cost) / SUM(remaining_qty)
    END
  INTO v_avg
  FROM fifo_cost_layers
  WHERE brand_variant_id = p_bv_id
    AND remaining_qty > 0
    AND total_unit_cost > 0;  -- exclude free/zero-cost layers

  UPDATE inventory_brand_variants
  SET average_cost = COALESCE(v_avg, 0),
      updated_at   = now()
  WHERE id = p_bv_id;
END;
$$;

CREATE FUNCTION public.recalculate_ar_invoice_payment_status(p_invoice_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_total    NUMERIC;
  v_manually BOOLEAN;
  v_paid     NUMERIC;
  v_status   TEXT;
BEGIN
  SELECT total_amount, COALESCE(manually_paid, FALSE)
  INTO   v_total, v_manually
  FROM   invoices
  WHERE  id = p_invoice_id;

  IF v_total IS NULL THEN RETURN; END IF;
  IF v_manually THEN RETURN; END IF;

  SELECT COALESCE(ROUND(SUM(amount), 2), 0)
  INTO   v_paid
  FROM   payments
  WHERE  invoice_id = p_invoice_id
    AND  direction  = 'incoming'
    AND  deleted_at IS NULL;

  v_status := CASE
    WHEN v_paid >= ROUND(v_total, 2) THEN 'paid'
    WHEN v_paid > 0                   THEN 'partially_paid'
    ELSE 'unpaid'
  END;

  UPDATE invoices SET payment_status = v_status WHERE id = p_invoice_id;
END;
$$;

CREATE FUNCTION public.receival_items_invalidate_parent_pdf_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_receival_id UUID;
BEGIN
  v_receival_id := COALESCE(NEW.receival_id, OLD.receival_id);
  IF v_receival_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE public.receivals
     SET check_sheet_pdf_url = NULL
   WHERE id = v_receival_id
     AND check_sheet_pdf_url IS NOT NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE FUNCTION public.receivals_invalidate_check_pdf_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.check_sheet_pdf_url := NULL;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.receive_transfer(p_transfer_id uuid, p_received_by_profile_id uuid, p_received_by_name text, p_received_items jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_transfer RECORD;
  v_ri JSONB;
  v_item RECORD;
  v_received_qty INT;
  v_shrinkage INT;
  v_avg_cost NUMERIC;
BEGIN
  -- Lock transfer row
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         dispatched_by_profile_id
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status != 'in_transit' THEN
    RAISE EXCEPTION 'Transfer % cannot be received — current status: %', p_transfer_id, v_transfer.status;
  END IF;

  -- Auth check: must be Field RP of destination warehouse OR inventory_manager
  IF NOT is_field_rp_of(p_received_by_profile_id, v_transfer.to_warehouse_id)
     AND NOT has_inventory_manager_role(p_received_by_profile_id) THEN
    RAISE EXCEPTION 'User is not authorized to receive at this warehouse';
  END IF;

  -- Self-approval guard: dispatcher and receiver must be different unless inventory_manager
  IF v_transfer.dispatched_by_profile_id = p_received_by_profile_id
     AND NOT has_inventory_manager_role(p_received_by_profile_id) THEN
    RAISE EXCEPTION 'Same person cannot dispatch and receive a transfer';
  END IF;

  -- Update transfer header
  UPDATE warehouse_transfers
  SET status = 'received',
      received_by_profile_id = p_received_by_profile_id,
      received_by_name = p_received_by_name,
      received_at = now()
  WHERE id = p_transfer_id;

  -- Process each received item
  FOR v_ri IN SELECT * FROM jsonb_array_elements(p_received_items)
  LOOP
    -- Fetch the transfer item
    SELECT * INTO v_item
    FROM warehouse_transfer_items
    WHERE id = (v_ri->>'transfer_item_id')::UUID
      AND transfer_id = p_transfer_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    v_received_qty := COALESCE((v_ri->>'received_qty')::INT, v_item.dispatched_qty);
    v_shrinkage := COALESCE(v_item.dispatched_qty, 0) - v_received_qty;

    -- Update the transfer item
    UPDATE warehouse_transfer_items
    SET received_qty = v_received_qty,
        shrinkage_qty = GREATEST(v_shrinkage, 0),
        shrinkage_reason = CASE WHEN v_shrinkage > 0 THEN COALESCE(v_ri->>'shrinkage_reason', 'missing') ELSE NULL END
    WHERE id = v_item.id;

    -- Compute average cost from the dispatch movement
    SELECT ABS(unit_cost) INTO v_avg_cost
    FROM inventory_stock_movements
    WHERE reference_id = p_transfer_id
      AND brand_variant_id = v_item.brand_variant_id
      AND movement_type = 'transfer_out'
    LIMIT 1;

    v_avg_cost := COALESCE(v_avg_cost, v_item.unit_cost);

    -- Add received stock to destination warehouse (UPSERT for virgin stock)
    IF v_received_qty > 0 THEN
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_item.brand_variant_id, v_transfer.to_warehouse_id,
        COALESCE(v_transfer.date, CURRENT_DATE),
        v_received_qty, v_avg_cost, 0, v_avg_cost, v_received_qty
      );

      -- Create transfer_in movement
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id
      ) VALUES (
        v_transfer.to_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_in', v_received_qty, v_avg_cost,
        'transfer', p_transfer_id
      );
    END IF;

    -- Handle shrinkage
    IF v_shrinkage > 0 THEN
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_shrinkage', -v_shrinkage, v_avg_cost,
        'transfer', p_transfer_id,
        'Shrinkage: ' || COALESCE(v_ri->>'shrinkage_reason', 'missing')
      );
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.refresh_po_status(p_po_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_current_status  po_status;
  v_total_qar       NUMERIC;
  v_total_paid_qar  NUMERIC;
  v_line_count      INT;
  v_fully_received  INT;
  v_any_received    INT;
  v_new_status      po_status;
BEGIN
  SELECT status, COALESCE(total_qar, 0)
  INTO   v_current_status, v_total_qar
  FROM   purchase_orders
  WHERE  id = p_po_id;

  IF v_current_status IN ('draft', 'pending_approval', 'cancelled') THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*)                                                 AS total_lines,
    COUNT(*) FILTER (WHERE received_qty > 0)                 AS any_received,
    COUNT(*) FILTER (WHERE received_qty >= qty AND qty > 0)  AS fully_received
  INTO v_line_count, v_any_received, v_fully_received
  FROM po_line_items
  WHERE po_id = p_po_id;

  SELECT COALESCE(SUM(amount_qar), 0)
  INTO   v_total_paid_qar
  FROM   payments
  WHERE  source_type = 'purchase_order'
    AND  source_id   = p_po_id
    AND  status NOT IN ('failed', 'refunded');

  v_new_status := v_current_status;

  IF v_current_status = 'approved' AND v_any_received > 0 THEN
    IF v_line_count > 0 AND v_fully_received = v_line_count THEN
      v_new_status := 'received';
    ELSE
      v_new_status := 'partially_received';
    END IF;
  END IF;

  IF v_new_status = 'partially_received'
     AND v_line_count > 0
     AND v_fully_received = v_line_count
  THEN
    v_new_status := 'received';
  END IF;

  IF v_new_status = 'received'
     AND v_total_qar > 0
     AND v_total_paid_qar >= v_total_qar
  THEN
    v_new_status := 'completed';
  END IF;

  IF v_new_status <> v_current_status THEN
    UPDATE purchase_orders
    SET    status     = v_new_status,
           updated_at = now()
    WHERE  id = p_po_id;
  END IF;
END;
$$;

CREATE FUNCTION public.reject_credit_group_change(p_approval_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row        RECORD;
  v_request    RECORD;
  v_profile_id uuid;
  v_full_name  TEXT;
BEGIN
  IF NULLIF(TRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required when rejecting';
  END IF;

  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_row FROM customer_credit_group_approvals
    WHERE id = p_approval_id FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'pending' OR NOT v_row.is_active THEN
    RAISE EXCEPTION 'Approval step not actionable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id        = v_profile_id
      AND  cr.name               = v_row.step_role
      AND  cr.is_approval_slot   = true
      AND  cr.deleted_at         IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR 'credit_group' = ANY(ucr.approval_scopes))
  ) THEN
    RAISE EXCEPTION 'You do not hold the role required for this approval step';
  END IF;

  -- Mark this step as rejected
  UPDATE customer_credit_group_approvals
  SET    status          = 'rejected',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         decided_at      = now(),
         reason          = p_reason
  WHERE  id = p_approval_id;

  -- Cancel all sibling pending steps in the same iteration
  UPDATE customer_credit_group_approvals
  SET    status    = 'rejected',
         reason    = 'Cancelled — sibling step rejected',
         is_active = false
  WHERE  request_id = v_row.request_id
    AND  iteration  = v_row.iteration
    AND  status     = 'pending'
    AND  id        <> p_approval_id;

  -- Close the request as rejected
  SELECT * INTO v_request FROM customer_credit_group_requests
    WHERE id = v_row.request_id FOR UPDATE;

  UPDATE customer_credit_group_requests
     SET status     = 'rejected',
         decided_by = v_profile_id,
         decided_at = now()
   WHERE id = v_request.id;

  -- Unblock customer (if they were blocked for pending approval)
  UPDATE customers
     SET is_blocked   = false,
         block_reason = NULL
   WHERE id = v_request.customer_id
     AND is_blocked   = true
     AND block_reason = 'Pending credit group approval';

  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Credit Group Change Rejected',
    'customers',
    'customer',
    v_request.customer_id,
    v_full_name,
    'warning',
    jsonb_build_object(
      'request_id', v_request.id,
      'step_role',  v_row.step_role,
      'reason',     p_reason
    )::text
  );
END;
$$;

CREATE FUNCTION public.reject_sales_request(p_request_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_req         RECORD;
  v_profile_id  uuid;
  v_full_name   TEXT;
  v_scope       TEXT;
BEGIN
  IF COALESCE(TRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to reject';
  END IF;

  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_req FROM sale_order_approvals WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' OR NOT v_req.is_active THEN
    RAISE EXCEPTION 'Request not actionable';
  END IF;

  v_scope := CASE v_req.approval_type
    WHEN 'margin' THEN 'sales_margin'
    WHEN 'credit' THEN 'sales_credit'
  END;
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'Unknown sales approval type %', v_req.approval_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id        = v_profile_id
      AND  cr.name               = v_req.step_role
      AND  cr.is_approval_slot   = true
      AND  cr.deleted_at         IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR v_scope = ANY(ucr.approval_scopes))
  ) THEN
    RAISE EXCEPTION 'You do not hold the role required to reject this approval step';
  END IF;

  UPDATE sale_order_approvals
  SET    status          = 'rejected',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         reason          = p_reason
  WHERE  id = p_request_id;

  UPDATE sale_order_approvals
  SET    status   = 'rejected',
         reason   = 'Cancelled — sibling step rejected'
  WHERE  source_id     = v_req.source_id
    AND  approval_type = v_req.approval_type
    AND  iteration     = v_req.iteration
    AND  status        = 'pending'
    AND  id            <> p_request_id;

  UPDATE sale_orders SET status = 'quotation' WHERE id = v_req.source_id;
END;
$$;

CREATE FUNCTION public.rename_payment_method(p_id uuid, p_new_name text, p_new_slug text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = p_id) THEN
    RAISE EXCEPTION 'payment method % not found', p_id;
  END IF;

  UPDATE payment_methods
     SET name = p_new_name, slug = p_new_slug
   WHERE id = p_id;
END;
$$;

CREATE FUNCTION public.replace_user_custom_roles(p_user_id uuid, p_role_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM user_custom_roles WHERE profile_id = p_user_id;
  IF p_role_ids IS NOT NULL AND array_length(p_role_ids, 1) IS NOT NULL THEN
    INSERT INTO user_custom_roles (profile_id, role_id)
    SELECT p_user_id, unnest(p_role_ids);
  END IF;
END;
$$;

CREATE FUNCTION public.replace_warehouse_field_rps(p_warehouse_id uuid, p_profile_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM warehouse_field_rps WHERE warehouse_id = p_warehouse_id;
  IF p_profile_ids IS NOT NULL AND array_length(p_profile_ids, 1) IS NOT NULL THEN
    INSERT INTO warehouse_field_rps (warehouse_id, profile_id)
    SELECT p_warehouse_id, unnest(p_profile_ids);
  END IF;
END;
$$;

CREATE FUNCTION public.resubmit_sale_order(p_so_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_so               RECORD;
  v_customer         RECORD;
  v_total_qar        NUMERIC;
  v_open_total       NUMERIC;
  v_available        NUMERIC;
  v_exceeds_credit   BOOLEAN := false;
  v_has_below_cost   BOOLEAN := false;
  v_below_cost_lines JSONB := '[]'::jsonb;
  v_profile_id       uuid;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();

  SELECT * INTO v_so FROM sale_orders WHERE id = p_so_id;
  IF NOT FOUND OR v_so.status <> 'quotation' THEN
    RAISE EXCEPTION 'SO not resubmittable';
  END IF;

  SELECT c.customer_type, cg.credit_limit
  INTO   v_customer
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = v_so.customer_id;

  v_total_qar := v_so.total * COALESCE(v_so.exchange_rate, 1);

  SELECT jsonb_agg(jsonb_build_object(
           'item_name', item_name, 'unit_price', unit_price, 'avg_cost', avg_cost
         )) FILTER (WHERE avg_cost > 0 AND unit_price < avg_cost)
  INTO   v_below_cost_lines
  FROM   sale_order_lines WHERE sale_order_id = p_so_id;

  IF v_below_cost_lines IS NOT NULL AND jsonb_array_length(v_below_cost_lines) > 0 THEN
    v_has_below_cost := true;
  END IF;

  IF COALESCE(v_customer.customer_type, 'credit') <> 'cash'
     AND v_customer.credit_limit IS NOT NULL THEN
    -- Exclude THIS SO so we don't double-count it
    v_open_total := public.customer_credit_used(v_so.customer_id, p_so_id);
    v_available  := v_customer.credit_limit - v_open_total;
    IF v_total_qar > v_available THEN v_exceeds_credit := true; END IF;
  END IF;

  IF v_exceeds_credit OR v_has_below_cost THEN
    UPDATE sale_orders SET status = 'pending_approval' WHERE id = p_so_id;
    IF v_exceeds_credit THEN
      PERFORM public.build_sales_approval_chain(
        p_so_id, 'credit',
        jsonb_build_object('available', GREATEST(v_available,0),
                           'overage',   v_total_qar - COALESCE(v_available, 0),
                           'requested_by', v_profile_id)
      );
    END IF;
    IF v_has_below_cost THEN
      PERFORM public.build_sales_approval_chain(
        p_so_id, 'margin',
        jsonb_build_object('lines', v_below_cost_lines, 'requested_by', v_profile_id)
      );
    END IF;
  ELSE
    UPDATE sale_orders SET status = 'confirmed' WHERE id = p_so_id;
  END IF;

  RETURN jsonb_build_object(
    'exceeds_credit', v_exceeds_credit,
    'has_below_cost', v_has_below_cost
  );
END;
$$;

CREATE FUNCTION public.revert_landed_cost(p_lc_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_lc      RECORD;
  v_layer   JSONB;
  v_bv_ids  UUID[] := '{}';
  v_bv_id   UUID;
BEGIN
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NULL THEN
    RAISE EXCEPTION 'Landed cost % has not been applied', p_lc_id;
  END IF;
  IF v_lc.revert_snapshot IS NULL OR jsonb_array_length(v_lc.revert_snapshot) = 0 THEN
    RAISE EXCEPTION 'No revert snapshot available for landed cost %', p_lc_id;
  END IF;

  -- Restore each FIFO layer to its pre-apply state
  FOR v_layer IN SELECT * FROM jsonb_array_elements(v_lc.revert_snapshot) LOOP
    UPDATE fifo_cost_layers
       SET landed_cost_per_unit = (v_layer->>'old_landed_cost_per_unit')::NUMERIC,
           total_unit_cost      = (v_layer->>'old_total_unit_cost')::NUMERIC
     WHERE id = (v_layer->>'layer_id')::UUID;

    -- Accumulate distinct brand_variant_ids for recalc
    v_bv_id := (v_layer->>'brand_variant_id')::UUID;
    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  -- Recalculate average_cost for each affected variant
  FOREACH v_bv_id IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id);
  END LOOP;

  -- Remove the cost_adjustment movements generated by this LC
  DELETE FROM inventory_stock_movements
   WHERE reference_type = 'landed_cost'
     AND reference_id   = p_lc_id
     AND movement_type  = 'cost_adjustment';

  -- Reset the landed_cost record
  UPDATE landed_costs
     SET applied_at       = NULL,
         all_items_sold   = FALSE,
         item_allocations = NULL,
         revert_snapshot  = NULL,
         updated_at       = now()
   WHERE id = p_lc_id;
END;
$$;

CREATE FUNCTION public.revert_landed_cost(p_lc_id uuid, p_performer_name text DEFAULT 'System'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_lc      RECORD;
  v_layer   JSONB;
  v_bv_ids  UUID[] := '{}';
  v_bv_id   UUID;
  v_now     TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NULL THEN
    RAISE EXCEPTION 'Landed cost % has not been applied', p_lc_id;
  END IF;

  -- ── Inventory side: subtract per-layer delta from snapshot ────────────────
  IF v_lc.revert_snapshot IS NOT NULL AND jsonb_array_length(v_lc.revert_snapshot) > 0 THEN
    FOR v_layer IN SELECT * FROM jsonb_array_elements(v_lc.revert_snapshot) LOOP
      UPDATE fifo_cost_layers
         SET landed_cost_per_unit = landed_cost_per_unit - (v_layer->>'lc_per_unit_delta')::NUMERIC,
             total_unit_cost      = total_unit_cost      - (v_layer->>'lc_per_unit_delta')::NUMERIC
       WHERE id = (v_layer->>'layer_id')::UUID;

      v_bv_id := (v_layer->>'brand_variant_id')::UUID;
      IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
        v_bv_ids := v_bv_ids || v_bv_id;
      END IF;
    END LOOP;

    FOREACH v_bv_id IN ARRAY v_bv_ids LOOP
      PERFORM recalc_average_cost(v_bv_id);
    END LOOP;

    -- Reversing inventory_stock_movements (audit-friendly; never deletes)
    INSERT INTO inventory_stock_movements
      (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
       reference_type, reference_id, notes)
    SELECT
      brand_variant_id, item_name, sku, 'cost_adjustment', qty,
      -unit_cost, 'landed_cost', p_lc_id,
      'Reversal of LC ' || v_lc.lc_number || ' — reverted by ' || p_performer_name
    FROM inventory_stock_movements
    WHERE reference_type = 'landed_cost'
      AND reference_id   = p_lc_id
      AND movement_type  = 'cost_adjustment'
      AND unit_cost      > 0;   -- only original positives; never re-reverse a prior reversal
  END IF;

  -- ── COGS side: insert reversing rows for each original LC-adjustment row ──
  INSERT INTO cogs_entries (
    brand_variant_id, sale_delivery_id, sale_order_id, landed_cost_id,
    qty, unit_cost, total_cost, date, notes
  )
  SELECT
    brand_variant_id, NULL, NULL, p_lc_id,
    -qty, unit_cost, -total_cost, v_now::DATE,
    'Reversal of LC ' || v_lc.lc_number || ' — reverted by ' || p_performer_name
  FROM cogs_entries
  WHERE landed_cost_id = p_lc_id
    AND total_cost     > 0;   -- only original positives; never re-reverse a prior reversal

  -- ── Reset the LC ──────────────────────────────────────────────────────────
  UPDATE landed_costs
     SET applied_at       = NULL,
         all_items_sold   = FALSE,
         item_allocations = NULL,
         revert_snapshot  = NULL,
         updated_at       = v_now
   WHERE id = p_lc_id;
END;
$$;

CREATE FUNCTION public.rpc_cancel_po_return_dispatch(p_return_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_return  RECORD;
  v_item    JSONB;
  v_bv_id   UUID;
  v_qty     INT;
BEGIN
  SELECT id, items, restock_warehouse_id, dispatched_at
  INTO   v_return
  FROM   returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NULL THEN
    RETURN;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_return.items) LOOP
    v_bv_id := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty   := COALESCE((v_item->>'qty')::INT, 0);

    IF v_bv_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE inventory_brand_variants
    SET    stock_level = stock_level + v_qty
    WHERE  id = v_bv_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes
    ) VALUES (
      v_return.restock_warehouse_id,
      v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      'purchase_return_cancelled',
      v_qty,
      0,
      'po_return',
      p_return_id,
      'PO return cancelled — stock restored'
    );
  END LOOP;

  UPDATE returns SET dispatched_at = NULL WHERE id = p_return_id;
END;
$$;

CREATE FUNCTION public.rpc_financial_dashboard() RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  result jsonb;

  receivables_total          numeric;
  receivables_overdue        numeric;
  receivables_overdue_count  bigint;

  payables_total             numeric;
  payables_overdue           numeric;
  payables_overdue_count     bigint;

  -- Cash actually moved this month
  cash_in_this_month         numeric;
  cash_out_this_month        numeric;
  cash_in_last_month         numeric;
  cash_out_last_month        numeric;

  -- Docs raised this month
  invoiced_this_month        numeric;
  billed_this_month          numeric;

  monthly_trend              jsonb;
  top_overdue_customers      jsonb;
  top_overdue_suppliers      jsonb;

  v_month_start              date := DATE_TRUNC('month', CURRENT_DATE)::date;
  v_last_month_start         date := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::date;
BEGIN
  -- Receivables (AR)
  SELECT
    COALESCE(SUM(total_amount - paid_amount), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total_amount - paid_amount END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO receivables_total, receivables_overdue, receivables_overdue_count
  FROM invoices
  WHERE direction = 'ar'
    AND payment_status != 'paid'
    AND doc_status != 'rejected'
    AND total_amount - paid_amount > 0;

  -- Payables (AP)
  SELECT
    COALESCE(SUM(total_amount - paid_amount), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total_amount - paid_amount END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO payables_total, payables_overdue, payables_overdue_count
  FROM invoices
  WHERE direction = 'ap'
    AND payment_status != 'paid'
    AND doc_status != 'rejected'
    AND total_amount - paid_amount > 0;

  -- Cash this month (real payments)
  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_in_this_month
  FROM payments
  WHERE direction = 'incoming'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_month_start
    AND date <= CURRENT_DATE;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_out_this_month
  FROM payments
  WHERE direction = 'outgoing'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_month_start
    AND date <= CURRENT_DATE;

  -- Cash last month (for MoM %)
  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_in_last_month
  FROM payments
  WHERE direction = 'incoming'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_last_month_start
    AND date < v_month_start;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_out_last_month
  FROM payments
  WHERE direction = 'outgoing'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_last_month_start
    AND date < v_month_start;

  -- Docs raised this month (for card sub-line)
  SELECT COALESCE(SUM(total_amount), 0)
  INTO invoiced_this_month
  FROM invoices
  WHERE direction = 'ar'
    AND doc_status != 'rejected'
    AND issued_date >= v_month_start
    AND issued_date <= CURRENT_DATE;

  SELECT COALESCE(SUM(total_amount), 0)
  INTO billed_this_month
  FROM invoices
  WHERE direction = 'ap'
    AND doc_status != 'rejected'
    AND issued_date >= v_month_start
    AND issued_date <= CURRENT_DATE;

  -- Monthly trend — invoiced vs collected on each side (last 6 months)
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.month), '[]'::jsonb)
  INTO monthly_trend
  FROM (
    SELECT
      TO_CHAR(m.month, 'YYYY-MM') AS month,
      TO_CHAR(m.month, 'Mon') AS label,
      COALESCE((
        SELECT SUM(total_amount) FROM invoices
        WHERE direction = 'ar'
          AND DATE_TRUNC('month', issued_date) = m.month
          AND doc_status != 'rejected'
      ), 0) AS invoiced,
      COALESCE((
        SELECT SUM(total_amount) FROM invoices
        WHERE direction = 'ap'
          AND DATE_TRUNC('month', issued_date) = m.month
          AND doc_status != 'rejected'
      ), 0) AS billed,
      COALESCE((
        SELECT SUM(COALESCE(amount_qar, amount)) FROM payments
        WHERE direction = 'incoming'
          AND DATE_TRUNC('month', date) = m.month
          AND status IN ('completed', 'pending', 'processing')
          AND deleted_at IS NULL
      ), 0) AS collected,
      COALESCE((
        SELECT SUM(COALESCE(amount_qar, amount)) FROM payments
        WHERE direction = 'outgoing'
          AND DATE_TRUNC('month', date) = m.month
          AND status IN ('completed', 'pending', 'processing')
          AND deleted_at IS NULL
      ), 0) AS paid_out
    FROM generate_series(
      DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
      DATE_TRUNC('month', CURRENT_DATE),
      '1 month'
    ) AS m(month)
  ) t;

  -- Top overdue customers (with id for drill-down)
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO top_overdue_customers
  FROM (
    SELECT
      c.id,
      c.name,
      SUM(i.total_amount - i.paid_amount) AS amount,
      COUNT(*) AS invoice_count,
      MIN(i.due_date) AS oldest_due,
      (CURRENT_DATE - MIN(i.due_date))::int AS days_overdue
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.direction = 'ar'
      AND i.due_date < CURRENT_DATE
      AND i.payment_status != 'paid'
      AND i.doc_status != 'rejected'
      AND i.total_amount - i.paid_amount > 0
    GROUP BY c.id, c.name
    ORDER BY amount DESC
    LIMIT 5
  ) t;

  -- Top overdue suppliers (with id for drill-down)
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO top_overdue_suppliers
  FROM (
    SELECT
      s.id,
      s.name,
      SUM(i.total_amount - i.paid_amount) AS amount,
      COUNT(*) AS bill_count,
      MIN(i.due_date) AS oldest_due,
      (CURRENT_DATE - MIN(i.due_date))::int AS days_overdue
    FROM invoices i
    JOIN suppliers s ON s.id = i.supplier_id
    WHERE i.direction = 'ap'
      AND i.due_date < CURRENT_DATE
      AND i.payment_status != 'paid'
      AND i.doc_status != 'rejected'
      AND i.total_amount - i.paid_amount > 0
    GROUP BY s.id, s.name
    ORDER BY amount DESC
    LIMIT 5
  ) t;

  result := jsonb_build_object(
    'receivables', jsonb_build_object(
      'total', receivables_total,
      'overdue', receivables_overdue,
      'overdue_count', receivables_overdue_count
    ),
    'payables', jsonb_build_object(
      'total', payables_total,
      'overdue', payables_overdue,
      'overdue_count', payables_overdue_count
    ),
    'cash_this_month', jsonb_build_object(
      'in',  cash_in_this_month,
      'out', cash_out_this_month,
      'net', cash_in_this_month - cash_out_this_month,
      'in_prev',  cash_in_last_month,
      'out_prev', cash_out_last_month,
      'invoiced', invoiced_this_month,
      'billed',   billed_this_month
    ),
    'monthly_trend', monthly_trend,
    'top_overdue_customers', top_overdue_customers,
    'top_overdue_suppliers', top_overdue_suppliers
  );

  RETURN result;
END;
$$;

CREATE FUNCTION public.rpc_process_po_return_dispatch(p_return_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_return  RECORD;
  v_item    JSONB;
  v_bv_id   UUID;
  v_qty     INT;
  v_sku     TEXT;
  v_result  RECORD;
BEGIN
  SELECT id, items, restock_warehouse_id, status, dispatched_at
  INTO   v_return
  FROM   returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status != 'dispatched' THEN
    RAISE EXCEPTION 'Return must have status=dispatched before processing inventory';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_return.items) LOOP
    v_bv_id := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty   := COALESCE((v_item->>'qty')::INT, 0);

    IF v_bv_id IS NULL THEN
      v_sku := NULLIF(trim(v_item->>'sku'), '');
      IF v_sku IS NOT NULL THEN
        SELECT id INTO v_bv_id
        FROM   inventory_brand_variants
        WHERE  code = v_sku
        LIMIT  1;
      END IF;
    END IF;

    IF v_bv_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    -- Deduct FIFO layers so warehouse_stock_view reflects the decrease.
    -- deduct_fifo_layers already updates stock_level and recalculates avg cost.
    SELECT total_cost, weighted_unit_cost
    INTO   v_result
    FROM   deduct_fifo_layers(v_bv_id, v_return.restock_warehouse_id, v_qty, false);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes
    ) VALUES (
      v_return.restock_warehouse_id,
      v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      'purchase_return',
      -v_qty,
      v_result.weighted_unit_cost,
      'po_return',
      p_return_id,
      'Returned to supplier'
    );
  END LOOP;

  UPDATE returns SET dispatched_at = now() WHERE id = p_return_id;
END;
$$;

CREATE FUNCTION public.rpc_process_return_restock(p_return_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_return   RECORD;
  v_item     JSONB;
  v_bv_id    UUID;
  v_qty      INT;
  v_cond     TEXT;
  v_avg_cost NUMERIC;
BEGIN
  SELECT id, items, restock_warehouse_id, status, restocked_at
  INTO   v_return
  FROM   returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.restocked_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status != 'restocked' THEN
    RAISE EXCEPTION 'Return must have status=restocked before processing inventory';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_return.items) LOOP
    v_bv_id := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty   := COALESCE((v_item->>'qty')::INT, 0);
    v_cond  := LOWER(COALESCE(v_item->>'condition', ''));

    IF v_bv_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_cond = 'good' THEN
      -- Look up current weighted-average cost for this variant.
      SELECT COALESCE(average_cost, 0) INTO v_avg_cost
      FROM   inventory_brand_variants
      WHERE  id = v_bv_id;

      -- Create a new FIFO layer so warehouse_stock_view reflects the increase.
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type
      ) VALUES (
        v_bv_id, v_return.restock_warehouse_id, CURRENT_DATE,
        v_qty, v_avg_cost, 0, v_avg_cost, v_qty,
        'sale_return'
      );

      UPDATE inventory_brand_variants
      SET    stock_level = stock_level + v_qty,
             updated_at  = now()
      WHERE  id = v_bv_id;

      PERFORM recalc_average_cost(v_bv_id);

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        v_return.restock_warehouse_id,
        v_bv_id,
        v_item->>'item_name',
        NULLIF(v_item->>'sku', ''),
        'sale_return',
        v_qty,
        v_avg_cost,
        'return',
        p_return_id,
        'Restocked from sale return'
      );

    ELSIF v_cond = 'damaged' THEN
      -- Damaged items go to damaged_qty, not sellable stock.
      -- No FIFO layer needed — they are not sellable inventory.
      UPDATE inventory_brand_variants
      SET    damaged_qty = damaged_qty + v_qty
      WHERE  id = v_bv_id;

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        v_return.restock_warehouse_id,
        v_bv_id,
        v_item->>'item_name',
        NULLIF(v_item->>'sku', ''),
        'sale_return_damaged',
        v_qty,
        0,
        'return',
        p_return_id,
        'Damaged item from sale return — awaiting assessment'
      );
    END IF;
  END LOOP;

  UPDATE returns SET restocked_at = now() WHERE id = p_return_id;
END;
$$;

CREATE FUNCTION public.rpc_purchase_aging_report() RETURNS TABLE(supplier_id uuid, supplier_name text, current_amt numeric, days_1_30 numeric, days_31_60 numeric, days_61_90 numeric, days_over_90 numeric, total_outstanding numeric, bill_count bigint)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    i.supplier_id,
    s.name AS supplier_name,
    COALESCE(SUM(CASE WHEN i.due_date >= CURRENT_DATE THEN i.total_amount - i.paid_amount END), 0) AS current_amt,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN i.total_amount - i.paid_amount END), 0) AS days_1_30,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31 THEN i.total_amount - i.paid_amount END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61 THEN i.total_amount - i.paid_amount END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE - 90 THEN i.total_amount - i.paid_amount END), 0) AS days_over_90,
    COALESCE(SUM(i.total_amount - i.paid_amount), 0) AS total_outstanding,
    COUNT(*) AS bill_count
  FROM invoices i
  JOIN suppliers s ON s.id = i.supplier_id
  WHERE i.direction = 'ap'
    AND i.payment_status != 'paid'
    AND i.doc_status != 'rejected'
    AND i.total_amount - i.paid_amount > 0
  GROUP BY i.supplier_id, s.name
  ORDER BY total_outstanding DESC;
$$;

CREATE FUNCTION public.rpc_sales_aging_report() RETURNS TABLE(customer_id uuid, customer_name text, current_amt numeric, days_1_30 numeric, days_31_60 numeric, days_61_90 numeric, days_over_90 numeric, total_outstanding numeric, invoice_count bigint)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    i.customer_id,
    c.name AS customer_name,
    COALESCE(SUM(CASE WHEN i.due_date >= CURRENT_DATE THEN i.total_amount - i.paid_amount END), 0) AS current_amt,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN i.total_amount - i.paid_amount END), 0) AS days_1_30,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31 THEN i.total_amount - i.paid_amount END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61 THEN i.total_amount - i.paid_amount END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE - 90 THEN i.total_amount - i.paid_amount END), 0) AS days_over_90,
    COALESCE(SUM(i.total_amount - i.paid_amount), 0) AS total_outstanding,
    COUNT(*) AS invoice_count
  FROM invoices i
  JOIN customers c ON c.id = i.customer_id
  WHERE i.direction = 'ar'
    AND i.payment_status != 'paid'
    AND i.doc_status != 'rejected'
    AND i.total_amount - i.paid_amount > 0
  GROUP BY i.customer_id, c.name
  ORDER BY total_outstanding DESC;
$$;

CREATE FUNCTION public.sale_order_lines_invalidate_parent_pdf_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_so_id UUID;
BEGIN
  v_so_id := COALESCE(NEW.sale_order_id, OLD.sale_order_id);
  IF v_so_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.sale_orders
     SET quotation_pdf_url = NULL
   WHERE id = v_so_id
     AND quotation_pdf_url IS NOT NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE FUNCTION public.sale_orders_invalidate_pdf_cache_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.quotation_pdf_url := NULL;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.save_inventory_check_item_count(p_item_id uuid, p_counted_qty numeric, p_variance_type text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE inventory_check_items
  SET
    counted_qty   = p_counted_qty,
    is_counted    = true,
    variance_type = p_variance_type,
    updated_at    = now()
  WHERE id = p_item_id;
END;
$$;

CREATE FUNCTION public.set_approval_request_decided_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status <> 'pending' AND OLD.status = 'pending' THEN
    NEW.decided_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.set_credit_note_pdf_url(p_id uuid, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.credit_notes SET pdf_url = p_url WHERE id = p_id;
END;
$$;

CREATE FUNCTION public.set_invoice_pdf_url(p_id uuid, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.invoices SET pdf_url = p_url WHERE id = p_id;
END;
$$;

CREATE FUNCTION public.set_po_pdf_url(p_id uuid, p_variant text, p_url text, p_payment_hash text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);

  IF p_variant = 'rfq' THEN
    UPDATE public.purchase_orders SET pdf_rfq_url = p_url WHERE id = p_id;
  ELSIF p_variant = 'draft' THEN
    UPDATE public.purchase_orders SET pdf_draft_url = p_url WHERE id = p_id;
  ELSIF p_variant = 'po' THEN
    UPDATE public.purchase_orders
       SET pdf_po_url = p_url, pdf_payment_hash = p_payment_hash
     WHERE id = p_id;
  ELSIF p_variant = 'confirmed' THEN
    UPDATE public.purchase_orders
       SET pdf_confirmed_url = p_url, pdf_payment_hash = p_payment_hash
     WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Invalid PDF variant: %', p_variant;
  END IF;
END;
$$;

CREATE FUNCTION public.set_receival_check_pdf_url(p_id uuid, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.receivals SET check_sheet_pdf_url = p_url WHERE id = p_id;
END;
$$;

CREATE FUNCTION public.set_sale_order_pdf_url(p_id uuid, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.sale_orders SET quotation_pdf_url = p_url WHERE id = p_id;
END;
$$;

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.sku_abbreviation(input text, len integer DEFAULT 3) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT upper(left(regexp_replace(input, '[^A-Za-z]', '', 'g'), len))
$$;

CREATE FUNCTION public.snapshot_inventory_check_system_qty(p_check_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_warehouse_id UUID;
BEGIN
  SELECT warehouse_id INTO v_warehouse_id
  FROM inventory_checks
  WHERE id = p_check_id;
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Inventory check % not found', p_check_id;
  END IF;

  -- Snapshot from the warehouse stock view (live qty per brand_variant)
  UPDATE inventory_check_items ici
  SET system_qty_at_close = COALESCE(wsv.qty, 0)
  FROM warehouse_stock_view wsv
  WHERE ici.check_id = p_check_id
    AND ici.is_counted = true
    AND ici.system_qty_at_close IS NULL
    AND wsv.warehouse_id = v_warehouse_id
    AND wsv.brand_variant_id = ici.brand_variant_id;

  -- Items absent from the stock view (zero stock with no movements
  -- yet) — pin them at 0 so the recon row still has a frozen value
  UPDATE inventory_check_items
  SET system_qty_at_close = 0
  WHERE check_id = p_check_id
    AND is_counted = true
    AND system_qty_at_close IS NULL;
END;
$$;

CREATE FUNCTION public.storage_customer_credit_docs_write_allowed() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   profiles p
    JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
    JOIN   custom_roles cr      ON cr.id           = ucr.role_id
    WHERE  p.auth_user_id = auth.uid()
    AND    (
      cr.is_system = true
      OR 'master_data.customers.manage' = ANY(cr.permissions)
      OR 'master_data.customers.change_credit_group' = ANY(cr.permissions)
    )
  )
$$;

CREATE FUNCTION public.storage_lc_bills_write_allowed() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   profiles p
    JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
    JOIN   custom_roles cr      ON cr.id            = ucr.role_id
    WHERE  p.auth_user_id = auth.uid()
    AND    p.is_active = true
    AND    cr.deleted_at IS NULL
    AND    (
      cr.is_system = true
      OR 'purchase.landed_costs.manage' = ANY(cr.permissions)
    )
  )
$$;

CREATE FUNCTION public.submit_credit_group_change(p_customer_id uuid, p_requested_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_customer        RECORD;
  v_new_group       RECORD;
  v_profile_id      uuid;
  v_request_id      uuid;
  v_step            RECORD;
  v_step_count      integer := 0;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT id, credit_group_id, entity_type,
         cr_url,
         establishment_id_url,
         signed_credit_form_url
    INTO v_customer
  FROM customers
  WHERE id = p_customer_id;
  IF v_customer.id IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  SELECT id, name, credit_limit INTO v_new_group
  FROM credit_groups WHERE id = p_requested_group_id;
  IF v_new_group.id IS NULL THEN
    RAISE EXCEPTION 'Credit group not found';
  END IF;

  IF COALESCE(v_new_group.credit_limit, 0) = 0 THEN
    RAISE EXCEPTION 'Approval only required for credit groups with a non-zero limit. Assign this group directly.';
  END IF;

  IF v_customer.credit_group_id = p_requested_group_id THEN
    RAISE EXCEPTION 'Customer is already on this credit group';
  END IF;

  -- Doc gate: business needs all 3, individual needs only signed credit form
  IF COALESCE(v_customer.entity_type, 'individual') = 'business' THEN
    IF v_customer.cr_url IS NULL
       OR v_customer.establishment_id_url IS NULL
       OR v_customer.signed_credit_form_url IS NULL THEN
      RAISE EXCEPTION 'Upload all 3 required docs (CR, Establishment ID, Signed Credit Form) for business customers'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_customer.signed_credit_form_url IS NULL THEN
      RAISE EXCEPTION 'Upload the Signed Credit Form before requesting a credit group'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM customer_credit_group_requests
    WHERE customer_id = p_customer_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'There is already a pending credit-group change for this customer';
  END IF;

  INSERT INTO customer_credit_group_requests (
    customer_id, requested_group_id, previous_group_id, status, requested_by
  ) VALUES (
    p_customer_id, p_requested_group_id, v_customer.credit_group_id, 'pending', v_profile_id
  )
  RETURNING id INTO v_request_id;

  FOR v_step IN
    SELECT was.step_order, cr.name AS role_name
    FROM   approval_workflow_steps was
    JOIN   custom_roles            cr ON cr.id = was.role_id
    WHERE  was.workflow    = 'credit_group'
      AND  was.is_active   = true
      AND  was.archived_at IS NULL
    ORDER BY was.step_order
  LOOP
    INSERT INTO customer_credit_group_approvals (
      request_id, step_role, step_order, status, is_active, iteration
    ) VALUES (
      v_request_id, v_step.role_name, v_step.step_order, 'pending', true, 1
    );
    v_step_count := v_step_count + 1;
  END LOOP;

  IF v_step_count = 0 THEN
    -- No steps configured → auto-approve
    UPDATE customers
       SET credit_group_id = p_requested_group_id,
           customer_type   = 'credit',
           is_blocked      = false,
           block_reason    = NULL
     WHERE id = p_customer_id;
    UPDATE customer_credit_group_requests
      SET status = 'approved', decided_by = v_profile_id, decided_at = now()
      WHERE id = v_request_id;
  ELSE
    -- Block new customers (no previous group) while approval is pending
    IF v_customer.credit_group_id IS NULL THEN
      UPDATE customers
         SET is_blocked   = true,
             block_reason = 'Pending credit group approval'
       WHERE id = p_customer_id;
    END IF;
  END IF;

  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Credit Group Change Requested',
    'customers',
    'customer',
    p_customer_id,
    (SELECT full_name FROM profiles WHERE id = v_profile_id),
    'info',
    jsonb_build_object(
      'request_id',       v_request_id,
      'requested_group',  v_new_group.name,
      'previous_group_id',v_customer.credit_group_id,
      'auto_approved',    v_step_count = 0
    )::text
  );

  RETURN jsonb_build_object(
    'request_id',  v_request_id,
    'step_count',  v_step_count,
    'status',      CASE WHEN v_step_count = 0 THEN 'approved' ELSE 'pending' END
  );
END;
$$;

CREATE FUNCTION public.toggle_workflow_step(p_step_id uuid, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE approval_workflow_steps
  SET is_active = p_active
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;

CREATE FUNCTION public.trg_fn_po_line_items_incoming() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.brand_variant_id IS NOT NULL THEN
      PERFORM fn_refresh_incoming_qty(OLD.brand_variant_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.brand_variant_id IS NOT NULL THEN
    PERFORM fn_refresh_incoming_qty(NEW.brand_variant_id);
  END IF;

  -- If variant changed on UPDATE, refresh the old variant too
  IF TG_OP = 'UPDATE'
     AND OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id
     AND OLD.brand_variant_id IS NOT NULL
  THEN
    PERFORM fn_refresh_incoming_qty(OLD.brand_variant_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.trg_fn_purchase_orders_incoming() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM fn_refresh_incoming_qty(pli.brand_variant_id)
    FROM po_line_items pli
    WHERE pli.po_id          = NEW.id
      AND pli.brand_variant_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.trg_fn_so_reserved_qty() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM fn_refresh_reserved_qty(sol.brand_variant_id)
    FROM sale_order_lines sol
    WHERE sol.sale_order_id   = NEW.id
      AND sol.brand_variant_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.trg_fn_sol_reserved_qty() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.brand_variant_id IS NOT NULL THEN
      PERFORM fn_refresh_reserved_qty(OLD.brand_variant_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.brand_variant_id IS NOT NULL THEN
    PERFORM fn_refresh_reserved_qty(NEW.brand_variant_id);
  END IF;

  -- If variant changed on UPDATE, refresh the old variant too
  IF TG_OP = 'UPDATE'
     AND OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id
     AND OLD.brand_variant_id IS NOT NULL
  THEN
    PERFORM fn_refresh_reserved_qty(OLD.brand_variant_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.trg_recalc_ar_payment_status() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_invoice_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
    -- If invoice_id was re-pointed, recalc the old invoice too
    IF TG_OP = 'UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      IF OLD.invoice_id IS NOT NULL THEN
        PERFORM recalculate_ar_invoice_payment_status(OLD.invoice_id);
      END IF;
    END IF;
  END IF;

  IF v_invoice_id IS NOT NULL THEN
    PERFORM recalculate_ar_invoice_payment_status(v_invoice_id);
  END IF;

  RETURN NULL;
END;
$$;

CREATE FUNCTION public.update_reserved_qty(p_bv_id uuid, p_delta integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE inventory_brand_variants
  SET reserved_qty = GREATEST(0, reserved_qty + p_delta),
      updated_at   = now()
  WHERE id = p_bv_id;
END;
$$;

CREATE FUNCTION public.update_workflow_step_conditions(p_step_id uuid, p_is_conditional boolean, p_condition_types text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE approval_workflow_steps
  SET is_conditional  = p_is_conditional,
      condition_types = CASE
        WHEN p_is_conditional THEN COALESCE(p_condition_types, ARRAY[]::TEXT[])
        ELSE ARRAY[]::TEXT[]
      END
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;

CREATE FUNCTION public.update_workflow_step_role(p_step_id uuid, p_role_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role_name TEXT;
BEGIN
  SELECT name INTO v_role_name
  FROM custom_roles
  WHERE id = p_role_id
    AND is_approval_slot = true
    AND deleted_at IS NULL;

  IF v_role_name IS NULL THEN
    RAISE EXCEPTION 'Role not found or is not an approval-slot role';
  END IF;

  UPDATE approval_workflow_steps
  SET role_id    = p_role_id,
      step_label = v_role_name
  WHERE id = p_step_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;

CREATE FUNCTION public.user_can_action_adjustment_step(p_profile_id uuid, p_step_role text, p_warehouse_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM   user_custom_roles ucr
      JOIN   custom_roles cr ON cr.id = ucr.role_id
      WHERE  ucr.profile_id = p_profile_id
        AND  cr.name = 'Admin'
        AND  cr.deleted_at IS NULL
    )
    OR (
      p_step_role = 'responsible_person'
      AND EXISTS (
        SELECT 1 FROM warehouse_field_rps
        WHERE  profile_id   = p_profile_id
          AND  warehouse_id = p_warehouse_id
      )
    )
    OR (
      p_step_role <> 'responsible_person'
      AND EXISTS (
        SELECT 1
        FROM   approval_workflow_steps was
        JOIN   user_custom_roles      ucr ON ucr.role_id = was.role_id
        WHERE  was.workflow    = 'stock_adj'
          AND  was.step_key    = p_step_role
          AND  was.archived_at IS NULL
          AND  ucr.profile_id  = p_profile_id
      )
    )
$$;

CREATE FUNCTION public.user_has_approval_role_in_scope(p_profile_id uuid, p_role_names text[], p_scope text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id = p_profile_id
      AND  cr.name = ANY(p_role_names)
      AND  cr.is_approval_slot = true
      AND  cr.deleted_at IS NULL
      AND  (ucr.approval_scopes IS NULL OR p_scope = ANY(ucr.approval_scopes))
  )
$$;

CREATE FUNCTION public.validate_lc_allocation(p_lc_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_lc RECORD;
BEGIN
  SELECT id, applied_at, voided_at, attached_receival_ids
    INTO v_lc
    FROM landed_costs
   WHERE id = p_lc_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Landed cost is voided and cannot be applied';
  END IF;
  IF v_lc.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Already applied on %', v_lc.applied_at;
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        ri.brand_variant_id::TEXT           AS brand_variant_id,
        MAX(ri.item_name)                   AS item_name,
        MAX(ri.sku)                         AS sku,
        SUM(ri.qty_received)                AS qty_received,
        COALESCE(fl_agg.remaining, 0)       AS qty_remaining_in_layers,
        CASE WHEN COALESCE(fl_agg.remaining, 0) = 0
          THEN 'All units already sold — LC cost not applicable to this item'
          ELSE NULL
        END                                 AS warning
      FROM receival_items ri
      JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
      LEFT JOIN LATERAL (
        SELECT SUM(fl.remaining_qty) AS remaining
        FROM   fifo_cost_layers fl
        WHERE  fl.brand_variant_id = ri.brand_variant_id
          AND  fl.remaining_qty > 0
      ) fl_agg ON true
      WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
        AND ri.is_free = false
        AND ri.brand_variant_id IS NOT NULL
        AND ri.qty_received > 0
      GROUP BY ri.brand_variant_id, fl_agg.remaining
    ) t
  );
END;
$$;


-- ============================================================================
-- SECTION 3: TABLES, SEQUENCES, INDEXES, CONSTRAINTS, TRIGGERS
-- ============================================================================

--
-- Name: notifications; Type: TABLE
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    related_id uuid,
    related_type text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

CREATE INDEX idx_notifications_profile_read ON public.notifications USING btree (profile_id, read_at);
CREATE INDEX idx_notifications_profile_unread_created ON public.notifications USING btree (profile_id, created_at DESC) WHERE (read_at IS NULL);
CREATE INDEX idx_notifications_related_id ON public.notifications USING btree (related_id);

--
--






--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    details text,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    module text,
    severity text DEFAULT 'info'::text NOT NULL,
    performer_name text,
    old_data jsonb,
    new_data jsonb,
    ip_address text
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: approval_workflow_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_workflow_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow text NOT NULL,
    group_label text DEFAULT 'Default'::text NOT NULL,
    group_order integer DEFAULT 1 NOT NULL,
    mode text DEFAULT 'any_one'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_workflow_groups_mode_check CHECK ((mode = ANY (ARRAY['any_one'::text, 'all_must'::text]))),
    CONSTRAINT approval_workflow_groups_workflow_check CHECK ((workflow = ANY (ARRAY['po'::text, 'inv_check'::text, 'stock_adj'::text, 'sales_margin'::text, 'sales_credit'::text, 'credit_group'::text, 'receival_edit'::text])))
);


--
-- Name: approval_workflow_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_workflow_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow text NOT NULL,
    role_id uuid NOT NULL,
    step_key text NOT NULL,
    step_label text NOT NULL,
    step_order integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_conditional boolean DEFAULT false NOT NULL,
    condition_types text[] DEFAULT '{}'::text[],
    archived_at timestamp with time zone,
    archived_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_id uuid,
    CONSTRAINT positive_order CHECK ((step_order > 0)),
    CONSTRAINT workflow_approval_steps_workflow_check CHECK ((workflow = ANY (ARRAY['po'::text, 'inv_check'::text, 'stock_adj'::text, 'sales_margin'::text, 'sales_credit'::text, 'credit_group'::text, 'receival_edit'::text])))
);


--
-- Name: company_divisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_divisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    short_name text,
    color text DEFAULT '#2563eb'::text NOT NULL,
    css_classes text,
    company_name_en text,
    company_name_ar text,
    address_en text,
    address_ar text,
    logo_url text,
    stamp_url text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    footer_motto text,
    default_currency character varying(3) DEFAULT 'QAR'::character varying NOT NULL,
    default_tax_rate numeric DEFAULT 0 NOT NULL,
    company_id uuid,
    name_ar text,
    address text,
    calendar_schedule_id uuid
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    name_ar text,
    phone text NOT NULL,
    email text,
    customer_type text DEFAULT 'individual'::text,
    subscription_tag text,
    is_blocked boolean DEFAULT false,
    block_reason text,
    pending_balance numeric DEFAULT 0,
    credit_limit numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    credit_balance numeric(12,2) DEFAULT 0 NOT NULL,
    credit_group_id uuid,
    entity_type text DEFAULT 'individual'::text,
    cr_url text,
    cr_uploaded_at timestamp with time zone,
    establishment_id_url text,
    establishment_id_uploaded_at timestamp with time zone,
    signed_credit_form_url text,
    signed_credit_form_uploaded_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT customers_entity_type_check CHECK ((entity_type = ANY (ARRAY['individual'::text, 'business'::text]))),
    CONSTRAINT customers_type_check CHECK (((customer_type = ANY (ARRAY['cash'::text, 'credit'::text])) OR (customer_type IS NULL)))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid NOT NULL,
    user_type public.user_type DEFAULT 'internal'::public.user_type NOT NULL,
    full_name text NOT NULL,
    full_name_ar text,
    phone text,
    email text,
    avatar_url text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    cx_extension text,
    division_id uuid,
    must_change_password boolean DEFAULT false NOT NULL,
    is_division_manager boolean DEFAULT false NOT NULL,
    title text DEFAULT 'Mr.'::text NOT NULL,
    feature_flags text[] DEFAULT '{}'::text[] NOT NULL,
    threecx_extension text,
    has_contact_centre_access boolean DEFAULT false NOT NULL
);


--
-- Name: cogs_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cogs_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_variant_id uuid NOT NULL,
    sale_delivery_id uuid,
    sale_order_id uuid,
    qty integer NOT NULL,
    unit_cost numeric NOT NULL,
    total_cost numeric NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    landed_cost_id uuid,
    notes text,
    CONSTRAINT cogs_entries_source_check CHECK ((NOT ((sale_delivery_id IS NOT NULL) AND (landed_cost_id IS NOT NULL))))
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name_en text NOT NULL,
    name_ar text,
    cr_number text,
    vat_id text,
    default_currency character varying(3) DEFAULT 'QAR'::character varying NOT NULL,
    default_tax_rate numeric DEFAULT 0 NOT NULL,
    logo_url text,
    address_en text,
    address_ar text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: country_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.country_codes (
    id integer NOT NULL,
    code text NOT NULL,
    iso text NOT NULL,
    flag text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 999 NOT NULL
);


--
-- Name: country_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.country_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: country_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.country_codes_id_seq OWNED BY public.country_codes.id;


--
-- Name: credit_group_payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_group_payment_methods (
    credit_group_id uuid NOT NULL,
    payment_method_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: credit_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    credit_limit numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    max_days integer,
    default_payment_terms text,
    CONSTRAINT credit_groups_default_payment_terms_chk CHECK (((default_payment_terms IS NULL) OR (default_payment_terms = ANY (ARRAY['100% Advance'::text, '100% After Delivery'::text, '50/50'::text, 'Net 30'::text, 'Net 60'::text, 'Custom'::text]))))
);


--
-- Name: credit_note_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_note_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    credit_note_id uuid NOT NULL,
    invoice_line_id uuid,
    description text NOT NULL,
    qty numeric(10,2) NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    total numeric(12,2) GENERATED ALWAYS AS ((qty * unit_price)) STORED,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: credit_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    credit_note_id text NOT NULL,
    invoice_id uuid,
    customer_name text,
    phone text,
    type text DEFAULT 'full'::text NOT NULL,
    reason text NOT NULL,
    line_items jsonb DEFAULT '[]'::jsonb,
    total_amount numeric DEFAULT 0 NOT NULL,
    status public.credit_note_status DEFAULT 'draft'::public.credit_note_status,
    approved_by text,
    refund_method text,
    refund_reference text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    note_type text DEFAULT 'credit'::text NOT NULL,
    source_return_id uuid,
    supplier_name text,
    original_total numeric,
    new_total numeric,
    pdf_url text,
    resolution_type text,
    purchase_order_id uuid,
    CONSTRAINT credit_notes_resolution_type_check CHECK ((resolution_type = ANY (ARRAY['refund'::text, 'replacement'::text, 'store_credit'::text])))
);


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    symbol text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: custom_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT 'bg-primary/15 text-primary border-primary/30'::text,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    is_system boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    deleted_at timestamp with time zone,
    is_approval_slot boolean DEFAULT false NOT NULL,
    is_field_rp boolean DEFAULT false NOT NULL
);


--
-- Name: customer_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    label text,
    address_type character varying(20) NOT NULL,
    unit_no text,
    building_no text,
    street_no text,
    zone_no text,
    lat numeric,
    lng numeric,
    created_at timestamp with time zone DEFAULT now(),
    phone_id uuid,
    is_primary boolean DEFAULT false NOT NULL,
    blue_plate_no character varying
);


--
-- Name: customer_credit_group_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_credit_group_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    step_role text NOT NULL,
    step_order integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_by uuid,
    decided_by_name text,
    decided_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    iteration integer DEFAULT 1 NOT NULL,
    comment text,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    force_approved boolean DEFAULT false NOT NULL,
    force_comment text,
    CONSTRAINT customer_credit_group_approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: customer_credit_group_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_credit_group_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    requested_group_id uuid NOT NULL,
    previous_group_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by uuid,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_credit_group_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id text NOT NULL,
    customer_id uuid,
    source public.invoice_source NOT NULL,
    source_id text NOT NULL,
    source_label text,
    issued_date date NOT NULL,
    due_date date NOT NULL,
    status public.invoice_status DEFAULT 'draft'::public.invoice_status,
    subtotal numeric DEFAULT 0,
    tax numeric DEFAULT 0,
    total_amount numeric DEFAULT 0,
    paid_amount numeric DEFAULT 0,
    agent_name text,
    division text,
    notes text,
    qb_synced boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    direction text DEFAULT 'ar'::text NOT NULL,
    supplier_id uuid,
    purchase_order_id uuid,
    receival_id uuid,
    sale_order_id uuid,
    sale_delivery_id uuid,
    needs_refresh boolean DEFAULT false NOT NULL,
    doc_status text DEFAULT 'draft'::text NOT NULL,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    invoice_type text DEFAULT 'credit'::text NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    discount_label text,
    manually_paid boolean DEFAULT false NOT NULL,
    dibsy_payment_id text,
    dibsy_checkout_url text,
    phone_id uuid,
    pdf_url text,
    CONSTRAINT invoices_direction_check CHECK ((direction = ANY (ARRAY['ar'::text, 'ap'::text]))),
    CONSTRAINT invoices_doc_status_check CHECK ((doc_status = ANY (ARRAY['draft'::text, 'ready_to_send'::text, 'sent'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT invoices_invoice_type_check CHECK ((invoice_type = ANY (ARRAY['cash'::text, 'credit'::text]))),
    CONSTRAINT invoices_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'partially_paid'::text, 'paid'::text, 'overdue'::text])))
);


--
-- Name: customer_phones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_phones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    phone character varying(20) NOT NULL,
    label character varying(50),
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_type text NOT NULL,
    content_ar text DEFAULT ''::text NOT NULL,
    content_en text DEFAULT ''::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    division_id uuid
);


--
-- Name: fifo_cost_layers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fifo_cost_layers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_variant_id uuid NOT NULL,
    receival_id text,
    receival_number text,
    date date NOT NULL,
    qty integer NOT NULL,
    unit_cost numeric NOT NULL,
    landed_cost_per_unit numeric DEFAULT 0,
    total_unit_cost numeric NOT NULL,
    remaining_qty integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    warehouse_id uuid,
    source_type text DEFAULT 'receival'::text
);


--
-- Name: inventory_brand_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_brand_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    brand text NOT NULL,
    code text,
    cost_price numeric DEFAULT 0,
    selling_price numeric DEFAULT 0,
    stock_level integer DEFAULT 0,
    incoming integer DEFAULT 0,
    incoming_eta date,
    average_cost numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reserved_qty integer DEFAULT 0 NOT NULL,
    linked_services_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    reorder_point integer DEFAULT 0 NOT NULL,
    margin_percent numeric(8,4) DEFAULT 0 NOT NULL,
    damaged_qty integer DEFAULT 0 NOT NULL
);


--
-- Name: inventory_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name_en text NOT NULL,
    name_ar text,
    sku text,
    type public.inventory_type NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'active'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    parent_id uuid,
    description text
);


--
-- Name: inventory_check_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_check_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_id uuid NOT NULL,
    step_order integer NOT NULL,
    step_role text NOT NULL,
    step_label text NOT NULL,
    profile_id uuid,
    profile_name text,
    status text DEFAULT 'pending'::text NOT NULL,
    action_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inv_check_approvals_rejected_needs_notes_chk CHECK (((status <> 'rejected'::text) OR (COALESCE(TRIM(BOTH FROM notes), ''::text) <> ''::text)))
);


--
-- Name: inventory_check_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_check_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    profile_name text NOT NULL,
    assigned_categories text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_check_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_check_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_id uuid NOT NULL,
    brand_variant_id uuid NOT NULL,
    item_name text NOT NULL,
    brand text NOT NULL,
    sku text,
    system_qty numeric DEFAULT 0 NOT NULL,
    counted_qty numeric,
    is_counted boolean DEFAULT false NOT NULL,
    variance numeric GENERATED ALWAYS AS ((COALESCE(counted_qty, (0)::numeric) - system_qty)) STORED,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assignment_id uuid,
    category_name text,
    assigned_profile_id uuid,
    assigned_profile_name text,
    variance_type text,
    system_qty_at_close numeric
);


--
-- Name: inventory_check_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_check_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_id uuid NOT NULL,
    event_type text NOT NULL,
    profile_id uuid,
    profile_name text,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_number text NOT NULL,
    warehouse_id uuid NOT NULL,
    warehouse_name text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    submitted_by uuid,
    submitted_by_name text,
    submitted_at timestamp with time zone,
    reviewed_by uuid,
    reviewed_by_name text,
    reviewed_at timestamp with time zone,
    review_notes text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    initiated_by_profile_id uuid,
    initiated_by_name text,
    started_at timestamp with time zone
);


--
-- Name: inventory_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name_en text NOT NULL,
    name_ar text,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    name_en text NOT NULL,
    name_ar text,
    sku text NOT NULL,
    unit text NOT NULL,
    cost_price numeric DEFAULT 0,
    markup_percent numeric,
    linked_services_count integer DEFAULT 0,
    total_stock integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'active'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: inventory_stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid,
    brand_variant_id uuid NOT NULL,
    item_name text NOT NULL,
    sku text,
    movement_type text NOT NULL,
    qty integer NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    reference_type text,
    reference_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_stock_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['purchase_receival'::text, 'sale_delivery'::text, 'adjustment'::text, 'transfer_in'::text, 'transfer_out'::text, 'cost_adjustment'::text, 'receival_edit'::text, 'free_receival'::text, 'sale_return'::text, 'sale_return_damaged'::text, 'purchase_return'::text, 'purchase_return_cancelled'::text, 'inventory_check'::text])))
);


--
-- Name: invoice_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    description text NOT NULL,
    qty integer DEFAULT 1,
    unit_price numeric DEFAULT 0,
    total numeric DEFAULT 0,
    team_name text,
    created_at timestamp with time zone DEFAULT now(),
    match_status text,
    match_note text,
    CONSTRAINT invoice_line_items_match_status_check CHECK ((match_status = ANY (ARRAY['matched'::text, 'qty_discrepancy'::text, 'price_discrepancy'::text, 'unmatched'::text, 'accepted_with_note'::text])))
);


--
-- Name: landed_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landed_costs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lc_number text NOT NULL,
    description text,
    total_amount numeric DEFAULT 0,
    currency text DEFAULT 'QAR'::text,
    lines jsonb DEFAULT '[]'::jsonb,
    attached_receival_ids uuid[] DEFAULT '{}'::uuid[],
    attached_po_ids uuid[] DEFAULT '{}'::uuid[],
    all_items_sold boolean DEFAULT false,
    date date NOT NULL,
    item_allocations jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    voided_at timestamp with time zone,
    voided_reason text,
    applied_at timestamp with time zone,
    revert_snapshot jsonb
);


--
-- Name: notification_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    label_ar text,
    category text NOT NULL,
    trigger_type text NOT NULL,
    timing_description text,
    template_slug text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    requires_portal boolean DEFAULT false NOT NULL,
    portal_purpose text,
    has_media_followup boolean DEFAULT false NOT NULL,
    media_description text,
    sort_order integer DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    wati_template_name text DEFAULT ''::text NOT NULL,
    description text,
    media_type text DEFAULT 'none'::text NOT NULL,
    has_buttons boolean DEFAULT false NOT NULL,
    button_type text,
    button_url_suffix_param text,
    param_count integer DEFAULT 0 NOT NULL,
    param_names jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    body_text text
);


--
-- Name: notification_trail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_trail (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_type text NOT NULL,
    notification_label text NOT NULL,
    category public.notification_category NOT NULL,
    channel public.notification_channel NOT NULL,
    recipient_name text NOT NULL,
    recipient_phone text NOT NULL,
    trigger_type public.notification_trigger NOT NULL,
    trigger_detail text,
    order_id text,
    status public.notification_status NOT NULL,
    error_message text,
    message_preview text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    provider text,
    external_message_id text,
    delivery_status text
);


--
-- Name: payment_bill_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_bill_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    amount numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_bill_allocations_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: payment_installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_installments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    due_date date,
    amount numeric(12,2) NOT NULL,
    paid_amount numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payment_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payment_installments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'overdue'::text, 'partial'::text])))
);


--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    requires_payment_link boolean DEFAULT false NOT NULL
);


--
-- Name: payment_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    plan_type text NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payment_plans_plan_type_check CHECK ((plan_type = ANY (ARRAY['schedule'::text, 'adhoc'::text]))),
    CONSTRAINT payment_plans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: payment_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dibsy_payment_id text,
    customer_id uuid NOT NULL,
    amount numeric NOT NULL,
    currency text DEFAULT 'QAR'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    checkout_url text,
    redirect_url text,
    receipt_sent boolean DEFAULT false NOT NULL,
    dibsy_response jsonb,
    invoice_allocations jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id text,
    invoice_id uuid,
    amount numeric NOT NULL,
    method text NOT NULL,
    status public.payment_status DEFAULT 'pending'::public.payment_status,
    date date NOT NULL,
    reference text,
    cheque_number text,
    cheque_date date,
    bank_name text,
    transaction_id text,
    agent_name text,
    notes text,
    qb_synced boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    direction text DEFAULT 'incoming'::text NOT NULL,
    source_type text,
    source_id uuid,
    supplier_id uuid,
    currency text DEFAULT 'QAR'::text NOT NULL,
    exchange_rate numeric DEFAULT 1 NOT NULL,
    amount_qar numeric,
    deleted_at timestamp with time zone,
    customer_id uuid,
    CONSTRAINT payments_direction_check CHECK ((direction = ANY (ARRAY['incoming'::text, 'outgoing'::text])))
);


--
-- Name: po_approval_chain_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.po_approval_chain_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chain_id uuid NOT NULL,
    rank integer NOT NULL,
    min_amount numeric NOT NULL,
    max_amount numeric,
    required_roles text[] NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT chk_amount_range CHECK (((max_amount IS NULL) OR (max_amount > min_amount))),
    CONSTRAINT chk_required_roles_nonempty CHECK ((cardinality(required_roles) > 0))
);


--
-- Name: po_approval_chains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.po_approval_chains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    division_id uuid,
    name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    archived_at timestamp with time zone
);


--
-- Name: po_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.po_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    po_id uuid NOT NULL,
    role text NOT NULL,
    status public.approval_status DEFAULT 'pending'::public.approval_status,
    approved_by text,
    date date,
    comment text,
    created_at timestamp with time zone DEFAULT now(),
    tier_rank integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    iteration integer DEFAULT 1 NOT NULL,
    force_approved boolean DEFAULT false NOT NULL,
    force_comment text,
    CONSTRAINT po_approvals_rejected_needs_comment_chk CHECK (((status <> 'rejected'::public.approval_status) OR (COALESCE(TRIM(BOTH FROM comment), ''::text) <> ''::text)))
);


--
-- Name: po_edit_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.po_edit_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    po_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_comment text,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT po_edit_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text, 'used'::text])))
);


--
-- Name: po_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.po_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    po_id uuid NOT NULL,
    item_name text NOT NULL,
    sku text,
    qty integer NOT NULL,
    received_qty integer DEFAULT 0,
    unit text NOT NULL,
    unit_price numeric NOT NULL,
    total_price numeric NOT NULL,
    fifo_layers jsonb,
    created_at timestamp with time zone DEFAULT now(),
    brand_variant_id uuid,
    tool_asset_item_id uuid,
    free_qty integer DEFAULT 0 NOT NULL,
    brand_id uuid
);


--
-- Name: po_rfq_quote_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.po_rfq_quote_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_id uuid NOT NULL,
    po_line_item_id uuid NOT NULL,
    quoted_price numeric DEFAULT 0 NOT NULL,
    quoted_qty integer,
    notes text
);


--
-- Name: po_rfq_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.po_rfq_quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    po_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    currency text DEFAULT 'QAR'::text NOT NULL,
    total_amount numeric DEFAULT 0,
    status text DEFAULT 'pending'::text NOT NULL,
    received_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT po_rfq_quotes_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'received'::text, 'awarded'::text, 'rejected'::text])))
);


--
-- Name: po_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.po_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    po_id uuid NOT NULL,
    version_number integer NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_by uuid,
    supplier_id text NOT NULL,
    supplier_name text NOT NULL,
    currency text NOT NULL,
    exchange_rate numeric NOT NULL,
    subtotal numeric NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    discount_label text,
    payment_terms text,
    payment_terms_notes text,
    payment_milestones jsonb,
    delivery_terms text,
    delivery_terms_notes text,
    expected_delivery date,
    vendor_notes text,
    line_items jsonb NOT NULL,
    snapshot_label text DEFAULT 'manual'::text NOT NULL,
    stage text NOT NULL,
    CONSTRAINT po_versions_stage_check CHECK ((stage = ANY (ARRAY['rfq'::text, 'draft'::text, 'po'::text])))
);


--
-- Name: pricing_factors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_factors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    label text NOT NULL,
    label_ar text,
    factor numeric DEFAULT 1.0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    division_id uuid,
    deleted_at timestamp with time zone
);


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    po_number text NOT NULL,
    rfq_id uuid,
    supplier_id text NOT NULL,
    supplier_name text NOT NULL,
    status public.po_status DEFAULT 'draft'::public.po_status,
    currency text DEFAULT 'QAR'::text,
    exchange_rate numeric DEFAULT 1,
    subtotal numeric DEFAULT 0,
    total_qar numeric DEFAULT 0,
    created_date date NOT NULL,
    expected_delivery date,
    approval_level integer DEFAULT 1,
    warehouse_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    payment_terms text,
    payment_terms_notes text,
    payment_milestones jsonb,
    delivery_terms text,
    delivery_terms_notes text,
    vendor_notes text,
    discount_amount numeric DEFAULT 0 NOT NULL,
    discount_label text,
    created_by uuid,
    deleted_at timestamp with time zone,
    version_number integer DEFAULT 1 NOT NULL,
    division_id uuid,
    po_type public.po_type DEFAULT 'draft'::public.po_type NOT NULL,
    pdf_rfq_url text,
    pdf_draft_url text,
    pdf_po_url text,
    pdf_confirmed_url text,
    pdf_payment_hash text,
    rfq_supplier_ids uuid[] DEFAULT '{}'::uuid[]
);


--
-- Name: reason_list_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reason_list_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reason_list_categories_slug_check CHECK ((slug ~ '^[a-z][a-z0-9_]*$'::text))
);


--
-- Name: reason_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reason_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    label text NOT NULL,
    active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    deleted_at timestamp with time zone,
    division_ids uuid[]
);


--
-- Name: receival_edit_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receival_edit_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    receival_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_by uuid,
    rejection_note text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    CONSTRAINT receival_edit_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'expired'::text])))
);


--
-- Name: receival_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receival_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    receival_id uuid NOT NULL,
    po_line_item_id uuid,
    item_name text NOT NULL,
    sku text,
    qty_received integer NOT NULL,
    unit_cost numeric NOT NULL,
    is_free boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    brand_variant_id uuid
);


--
-- Name: receivals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receivals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    receival_number text NOT NULL,
    po_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    received_by uuid,
    received_by_name text,
    date date NOT NULL,
    status public.receival_status DEFAULT 'pending_approval'::public.receival_status,
    landed_cost_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    check_sheet_pdf_url text,
    receipt_pdf_url text,
    is_replacement boolean DEFAULT false NOT NULL,
    source_debit_note_id uuid
);


--
-- Name: returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.returns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_number text NOT NULL,
    source_type public.return_source_type NOT NULL,
    source_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    restock_warehouse_id uuid,
    credit_note_id uuid,
    notes text,
    status public.return_status DEFAULT 'pending'::public.return_status NOT NULL,
    division_id uuid,
    created_by uuid,
    created_by_name text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    restocked_at timestamp with time zone,
    dispatched_at timestamp with time zone,
    pdf_url text
);


--
-- Name: sale_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_number text NOT NULL,
    sale_order_id uuid NOT NULL,
    warehouse_id uuid,
    warehouse_name text,
    date date NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    status public.sale_delivery_status DEFAULT 'pending'::public.sale_delivery_status,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    created_by_name text,
    type text DEFAULT 'standard'::text NOT NULL,
    return_id uuid,
    pdf_url text,
    source_credit_note_id uuid,
    CONSTRAINT sale_deliveries_type_check CHECK ((type = ANY (ARRAY['standard'::text, 'replacement'::text])))
);


--
-- Name: sale_order_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_order_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_type public.approval_source_type NOT NULL,
    source_id uuid NOT NULL,
    approval_type public.approval_type NOT NULL,
    status public.approval_status DEFAULT 'pending'::public.approval_status,
    requested_by uuid,
    decided_by uuid,
    decided_by_name text,
    reason text,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    step_role text,
    step_order integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    iteration integer DEFAULT 1 NOT NULL,
    decided_at timestamp with time zone,
    force_approved boolean DEFAULT false NOT NULL,
    force_comment text
);


--
-- Name: sale_order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_order_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_order_id uuid NOT NULL,
    item_id text,
    item_name text NOT NULL,
    sku text,
    qty integer DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    delivered_qty integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    brand_variant_id uuid,
    line_type text DEFAULT 'products'::text NOT NULL,
    unit text DEFAULT 'pcs'::text NOT NULL,
    tool_asset_item_id uuid,
    avg_cost numeric DEFAULT 0 NOT NULL
);


--
-- Name: sale_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    so_number text NOT NULL,
    customer_id uuid NOT NULL,
    status public.sale_order_status DEFAULT 'quotation'::public.sale_order_status,
    subtotal numeric DEFAULT 0,
    tax numeric DEFAULT 0,
    total numeric DEFAULT 0,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    notes text,
    discount_amount numeric DEFAULT 0,
    discount_label text,
    created_by_name text,
    discount_type text DEFAULT 'fixed'::text,
    discount_amount_resolved numeric DEFAULT 0,
    voucher_id uuid,
    campaign_id uuid,
    currency text DEFAULT 'QAR'::text NOT NULL,
    exchange_rate numeric DEFAULT 1 NOT NULL,
    expected_delivery date,
    payment_terms text,
    payment_terms_notes text,
    payment_milestones jsonb,
    delivery_terms text,
    delivery_terms_notes text,
    customer_notes text,
    validity_days integer DEFAULT 30 NOT NULL,
    division_id uuid,
    quotation_pdf_url text
);


--
-- Name: shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tracking_number text NOT NULL,
    po_id uuid NOT NULL,
    receival_id uuid,
    mode public.shipment_mode NOT NULL,
    carrier text,
    status public.shipment_status DEFAULT 'booked'::public.shipment_status,
    origin text,
    destination text,
    etd date,
    eta date,
    events jsonb DEFAULT '[]'::jsonb,
    archived boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_synced_at timestamp with time zone,
    sync_error text,
    carrier_code text,
    is_syncing boolean DEFAULT false NOT NULL
);


--
-- Name: stock_adjustment_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_adjustment_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    adjustment_id uuid NOT NULL,
    step_order integer NOT NULL,
    step_role text NOT NULL,
    step_label text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    profile_id uuid,
    profile_name text,
    action_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_adjustment_approvals_role_chk CHECK ((step_role = ANY (ARRAY['accounting_manager'::text, 'inventory_manager'::text, 'responsible_person'::text, 'brand_manager'::text, 'owner'::text]))),
    CONSTRAINT stock_adjustment_approvals_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: stock_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    brand_variant_id uuid NOT NULL,
    adjustment_type text NOT NULL,
    qty numeric NOT NULL,
    reason text NOT NULL,
    notes text,
    photo_urls text[],
    status text DEFAULT 'pending_approval'::text NOT NULL,
    requested_by uuid,
    requested_by_name text,
    approved_by uuid,
    approved_by_name text,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    deleted_at timestamp with time zone
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text,
    contact_name text,
    phone text,
    email text,
    address text,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    currency_id uuid,
    supplier_type text DEFAULT 'local'::text,
    country text,
    CONSTRAINT suppliers_supplier_type_check CHECK ((supplier_type = ANY (ARRAY['local'::text, 'international'::text])))
);


--
-- Name: user_company_divisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_company_divisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    division_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: user_custom_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_custom_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    approval_scopes text[],
    CONSTRAINT user_custom_roles_approval_scopes_chk CHECK (((approval_scopes IS NULL) OR (approval_scopes <@ ARRAY['po'::text, 'inv_check'::text, 'stock_adj'::text, 'sales_margin'::text, 'sales_credit'::text, 'credit_group'::text])))
);


--
-- Name: user_ui_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ui_preferences (
    user_id uuid NOT NULL,
    hide_3cx_mobile_note boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warehouse_field_rps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_field_rps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warehouse_manager_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_manager_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    manager_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    removed_at timestamp with time zone,
    assigned_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warehouse_reorder_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_reorder_points (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    brand_variant_id uuid NOT NULL,
    reorder_point integer DEFAULT 0 NOT NULL,
    last_notified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warehouse_stock_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_stock_allocations (
    warehouse_id uuid NOT NULL,
    brand_variant_id uuid NOT NULL,
    allocated_qty integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warehouse_transfer_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_transfer_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transfer_id uuid NOT NULL,
    brand_variant_id uuid NOT NULL,
    item_name text NOT NULL,
    sku text,
    requested_qty integer NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    dispatched_qty integer,
    received_qty integer,
    shrinkage_qty integer DEFAULT 0 NOT NULL,
    shrinkage_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warehouse_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transfer_number text NOT NULL,
    from_warehouse_id uuid NOT NULL,
    to_warehouse_id uuid NOT NULL,
    status public.transfer_status DEFAULT 'pending'::public.transfer_status,
    created_by text,
    created_by_name text,
    approved_by text,
    approved_by_name text,
    date date NOT NULL,
    approved_date date,
    items jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by_profile_id uuid,
    dispatched_by_profile_id uuid,
    dispatched_by_name text,
    dispatched_at timestamp with time zone,
    received_by_profile_id uuid,
    received_by_name text,
    received_at timestamp with time zone,
    cancelled_by_profile_id uuid,
    cancelled_by_name text,
    cancelled_at timestamp with time zone,
    CONSTRAINT check_different_warehouses CHECK ((from_warehouse_id <> to_warehouse_id))
);


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    location text,
    item_count integer DEFAULT 0,
    total_value numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: country_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_codes ALTER COLUMN id SET DEFAULT nextval('public.country_codes_id_seq'::regclass);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_key_key UNIQUE (key);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: po_approval_chain_tiers approval_chain_tiers_chain_id_rank_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_approval_chain_tiers
    ADD CONSTRAINT approval_chain_tiers_chain_id_rank_key UNIQUE (chain_id, rank);


--
-- Name: po_approval_chain_tiers approval_chain_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_approval_chain_tiers
    ADD CONSTRAINT approval_chain_tiers_pkey PRIMARY KEY (id);


--
-- Name: po_approval_chains approval_chains_division_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_approval_chains
    ADD CONSTRAINT approval_chains_division_id_key UNIQUE (division_id);


--
-- Name: po_approval_chains approval_chains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_approval_chains
    ADD CONSTRAINT approval_chains_pkey PRIMARY KEY (id);


--
-- Name: sale_order_approvals approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_approvals
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: approval_workflow_groups approval_workflow_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflow_groups
    ADD CONSTRAINT approval_workflow_groups_pkey PRIMARY KEY (id);


--
-- Name: cogs_entries cogs_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: country_codes country_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_codes
    ADD CONSTRAINT country_codes_code_key UNIQUE (code);


--
-- Name: country_codes country_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_codes
    ADD CONSTRAINT country_codes_pkey PRIMARY KEY (id);


--
-- Name: credit_group_payment_methods credit_group_payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_group_payment_methods
    ADD CONSTRAINT credit_group_payment_methods_pkey PRIMARY KEY (credit_group_id, payment_method_id);


--
-- Name: credit_groups credit_groups_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_groups
    ADD CONSTRAINT credit_groups_name_key UNIQUE (name);


--
-- Name: credit_groups credit_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_groups
    ADD CONSTRAINT credit_groups_pkey PRIMARY KEY (id);


--
-- Name: credit_note_lines credit_note_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_note_lines
    ADD CONSTRAINT credit_note_lines_pkey PRIMARY KEY (id);


--
-- Name: credit_notes credit_notes_credit_note_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_credit_note_id_key UNIQUE (credit_note_id);


--
-- Name: credit_notes credit_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_pkey PRIMARY KEY (id);


--
-- Name: currencies currencies_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_code_key UNIQUE (code);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);


--
-- Name: custom_roles custom_roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_roles
    ADD CONSTRAINT custom_roles_name_key UNIQUE (name);


--
-- Name: custom_roles custom_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_roles
    ADD CONSTRAINT custom_roles_pkey PRIMARY KEY (id);


--
-- Name: customer_addresses customer_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_pkey PRIMARY KEY (id);


--
-- Name: customer_credit_group_approvals customer_credit_group_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_group_approvals
    ADD CONSTRAINT customer_credit_group_approvals_pkey PRIMARY KEY (id);


--
-- Name: customer_credit_group_requests customer_credit_group_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_group_requests
    ADD CONSTRAINT customer_credit_group_requests_pkey PRIMARY KEY (id);


--
-- Name: customer_phones customer_phones_phone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_phones
    ADD CONSTRAINT customer_phones_phone_unique UNIQUE (phone);


--
-- Name: customer_phones customer_phones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_phones
    ADD CONSTRAINT customer_phones_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: company_divisions divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_divisions
    ADD CONSTRAINT divisions_pkey PRIMARY KEY (id);


--
-- Name: company_divisions divisions_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_divisions
    ADD CONSTRAINT divisions_slug_key UNIQUE (slug);


--
-- Name: document_terms document_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_terms
    ADD CONSTRAINT document_terms_pkey PRIMARY KEY (id);


--
-- Name: fifo_cost_layers fifo_cost_layers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fifo_cost_layers
    ADD CONSTRAINT fifo_cost_layers_pkey PRIMARY KEY (id);


--
-- Name: inventory_brand_variants inventory_brand_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_brand_variants
    ADD CONSTRAINT inventory_brand_variants_pkey PRIMARY KEY (id);


--
-- Name: inventory_categories inventory_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_categories
    ADD CONSTRAINT inventory_categories_pkey PRIMARY KEY (id);


--
-- Name: inventory_check_approvals inventory_check_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_approvals
    ADD CONSTRAINT inventory_check_approvals_pkey PRIMARY KEY (id);


--
-- Name: inventory_check_assignments inventory_check_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_assignments
    ADD CONSTRAINT inventory_check_assignments_pkey PRIMARY KEY (id);


--
-- Name: inventory_check_items inventory_check_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_items
    ADD CONSTRAINT inventory_check_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_check_log inventory_check_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_log
    ADD CONSTRAINT inventory_check_log_pkey PRIMARY KEY (id);


--
-- Name: inventory_checks inventory_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_checks
    ADD CONSTRAINT inventory_checks_pkey PRIMARY KEY (id);


--
-- Name: inventory_groups inventory_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_groups
    ADD CONSTRAINT inventory_groups_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_stock_movements inventory_stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock_movements
    ADD CONSTRAINT inventory_stock_movements_pkey PRIMARY KEY (id);


--
-- Name: invoice_line_items invoice_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_id_key UNIQUE (invoice_id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: landed_costs landed_costs_lc_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landed_costs
    ADD CONSTRAINT landed_costs_lc_number_key UNIQUE (lc_number);


--
-- Name: landed_costs landed_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landed_costs
    ADD CONSTRAINT landed_costs_pkey PRIMARY KEY (id);


--
-- Name: notification_config notification_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_config
    ADD CONSTRAINT notification_config_pkey PRIMARY KEY (id);


--
-- Name: notification_config notification_config_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_config
    ADD CONSTRAINT notification_config_slug_key UNIQUE (slug);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_slug_key UNIQUE (slug);


--
-- Name: notification_trail notification_trail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_trail
    ADD CONSTRAINT notification_trail_pkey PRIMARY KEY (id);


--
-- Name: payment_bill_allocations payment_bill_allocations_payment_id_bill_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_bill_allocations
    ADD CONSTRAINT payment_bill_allocations_payment_id_bill_id_key UNIQUE (payment_id, bill_id);


--
-- Name: payment_bill_allocations payment_bill_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_bill_allocations
    ADD CONSTRAINT payment_bill_allocations_pkey PRIMARY KEY (id);


--
-- Name: payment_installments payment_installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_installments
    ADD CONSTRAINT payment_installments_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_slug_key UNIQUE (slug);


--
-- Name: payment_plans payment_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_plans
    ADD CONSTRAINT payment_plans_pkey PRIMARY KEY (id);


--
-- Name: payment_sessions payment_sessions_dibsy_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_sessions
    ADD CONSTRAINT payment_sessions_dibsy_payment_id_key UNIQUE (dibsy_payment_id);


--
-- Name: payment_sessions payment_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_sessions
    ADD CONSTRAINT payment_sessions_pkey PRIMARY KEY (id);


--
-- Name: payments payments_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_payment_id_key UNIQUE (payment_id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: po_approvals po_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_approvals
    ADD CONSTRAINT po_approvals_pkey PRIMARY KEY (id);


--
-- Name: po_edit_requests po_edit_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_edit_requests
    ADD CONSTRAINT po_edit_requests_pkey PRIMARY KEY (id);


--
-- Name: po_line_items po_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_line_items
    ADD CONSTRAINT po_line_items_pkey PRIMARY KEY (id);


--
-- Name: po_rfq_quote_items po_rfq_quote_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_rfq_quote_items
    ADD CONSTRAINT po_rfq_quote_items_pkey PRIMARY KEY (id);


--
-- Name: po_rfq_quotes po_rfq_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_rfq_quotes
    ADD CONSTRAINT po_rfq_quotes_pkey PRIMARY KEY (id);


--
-- Name: po_versions po_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_versions
    ADD CONSTRAINT po_versions_pkey PRIMARY KEY (id);


--
-- Name: pricing_factors pricing_factors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_factors
    ADD CONSTRAINT pricing_factors_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_po_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number);


--
-- Name: reason_list_categories reason_list_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reason_list_categories
    ADD CONSTRAINT reason_list_categories_pkey PRIMARY KEY (id);


--
-- Name: reason_list_categories reason_list_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reason_list_categories
    ADD CONSTRAINT reason_list_categories_slug_key UNIQUE (slug);


--
-- Name: reason_lists reason_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reason_lists
    ADD CONSTRAINT reason_lists_pkey PRIMARY KEY (id);


--
-- Name: receival_edit_requests receival_edit_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receival_edit_requests
    ADD CONSTRAINT receival_edit_requests_pkey PRIMARY KEY (id);


--
-- Name: receival_items receival_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receival_items
    ADD CONSTRAINT receival_items_pkey PRIMARY KEY (id);


--
-- Name: receivals receivals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivals
    ADD CONSTRAINT receivals_pkey PRIMARY KEY (id);


--
-- Name: receivals receivals_receival_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivals
    ADD CONSTRAINT receivals_receival_number_key UNIQUE (receival_number);


--
-- Name: returns returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_pkey PRIMARY KEY (id);


--
-- Name: sale_deliveries sale_deliveries_delivery_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_deliveries
    ADD CONSTRAINT sale_deliveries_delivery_number_key UNIQUE (delivery_number);


--
-- Name: sale_deliveries sale_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_deliveries
    ADD CONSTRAINT sale_deliveries_pkey PRIMARY KEY (id);


--
-- Name: sale_order_lines sale_order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_lines
    ADD CONSTRAINT sale_order_lines_pkey PRIMARY KEY (id);


--
-- Name: sale_orders sale_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_orders
    ADD CONSTRAINT sale_orders_pkey PRIMARY KEY (id);


--
-- Name: sale_orders sale_orders_so_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_orders
    ADD CONSTRAINT sale_orders_so_number_key UNIQUE (so_number);


--
-- Name: shipments shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);


--
-- Name: stock_adjustment_approvals stock_adjustment_approvals_adjustment_id_step_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustment_approvals
    ADD CONSTRAINT stock_adjustment_approvals_adjustment_id_step_order_key UNIQUE (adjustment_id, step_order);


--
-- Name: stock_adjustment_approvals stock_adjustment_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustment_approvals
    ADD CONSTRAINT stock_adjustment_approvals_pkey PRIMARY KEY (id);


--
-- Name: stock_adjustments stock_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: user_custom_roles user_custom_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_roles
    ADD CONSTRAINT user_custom_roles_pkey PRIMARY KEY (id);


--
-- Name: user_custom_roles user_custom_roles_profile_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_roles
    ADD CONSTRAINT user_custom_roles_profile_id_role_id_key UNIQUE (profile_id, role_id);


--
-- Name: user_company_divisions user_divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_company_divisions
    ADD CONSTRAINT user_divisions_pkey PRIMARY KEY (id);


--
-- Name: user_ui_preferences user_ui_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ui_preferences
    ADD CONSTRAINT user_ui_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: warehouse_field_rps warehouse_field_rps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_field_rps
    ADD CONSTRAINT warehouse_field_rps_pkey PRIMARY KEY (id);


--
-- Name: warehouse_field_rps warehouse_field_rps_warehouse_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_field_rps
    ADD CONSTRAINT warehouse_field_rps_warehouse_id_profile_id_key UNIQUE (warehouse_id, profile_id);


--
-- Name: warehouse_manager_log warehouse_manager_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_manager_log
    ADD CONSTRAINT warehouse_manager_log_pkey PRIMARY KEY (id);


--
-- Name: warehouse_reorder_points warehouse_reorder_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_reorder_points
    ADD CONSTRAINT warehouse_reorder_points_pkey PRIMARY KEY (id);


--
-- Name: warehouse_reorder_points warehouse_reorder_points_warehouse_id_brand_variant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_reorder_points
    ADD CONSTRAINT warehouse_reorder_points_warehouse_id_brand_variant_id_key UNIQUE (warehouse_id, brand_variant_id);


--
-- Name: warehouse_stock_allocations warehouse_stock_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_allocations
    ADD CONSTRAINT warehouse_stock_allocations_pkey PRIMARY KEY (warehouse_id, brand_variant_id);


--
-- Name: warehouse_transfer_items warehouse_transfer_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfer_items
    ADD CONSTRAINT warehouse_transfer_items_pkey PRIMARY KEY (id);


--
-- Name: warehouse_transfers warehouse_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_pkey PRIMARY KEY (id);


--
-- Name: warehouse_transfers warehouse_transfers_transfer_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_transfer_number_key UNIQUE (transfer_number);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: approval_workflow_steps workflow_approval_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflow_steps
    ADD CONSTRAINT workflow_approval_steps_pkey PRIMARY KEY (id);


--
-- Name: approval_workflow_steps workflow_approval_steps_workflow_step_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflow_steps
    ADD CONSTRAINT workflow_approval_steps_workflow_step_key_key UNIQUE (workflow, step_key);


--
-- Name: approval_requests_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_requests_pending_idx ON public.sale_order_approvals USING btree (source_id, approval_type, iteration) WHERE ((status = 'pending'::public.approval_status) AND (is_active = true));


--
-- Name: approval_requests_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_requests_source_idx ON public.sale_order_approvals USING btree (source_type, source_id, approval_type, iteration);


--
-- Name: ccga_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ccga_pending_idx ON public.customer_credit_group_approvals USING btree (request_id) WHERE ((status = 'pending'::text) AND is_active);


--
-- Name: ccga_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ccga_request_idx ON public.customer_credit_group_approvals USING btree (request_id);


--
-- Name: ccgr_customer_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ccgr_customer_pending_idx ON public.customer_credit_group_requests USING btree (customer_id) WHERE (status = 'pending'::text);


--
-- Name: idx_activity_log_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_entity ON public.activity_log USING btree (entity_type, entity_id);


--
-- Name: idx_activity_log_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_module ON public.activity_log USING btree (module);


--
-- Name: idx_approval_chains_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_chains_division ON public.po_approval_chains USING btree (division_id);


--
-- Name: idx_approval_chains_single_global; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_approval_chains_single_global ON public.po_approval_chains USING btree ((true)) WHERE (division_id IS NULL);


--
-- Name: idx_brand_variants_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brand_variants_item ON public.inventory_brand_variants USING btree (item_id);


--
-- Name: idx_cogs_delivery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cogs_delivery ON public.cogs_entries USING btree (sale_delivery_id) WHERE (sale_delivery_id IS NOT NULL);


--
-- Name: idx_cogs_entries_lc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cogs_entries_lc ON public.cogs_entries USING btree (landed_cost_id) WHERE (landed_cost_id IS NOT NULL);


--
-- Name: idx_cogs_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cogs_variant ON public.cogs_entries USING btree (brand_variant_id);


--
-- Name: idx_cogs_variant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cogs_variant_date ON public.cogs_entries USING btree (brand_variant_id, date);


--
-- Name: idx_credit_notes_po_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_notes_po_id ON public.credit_notes USING btree (purchase_order_id) WHERE (purchase_order_id IS NOT NULL);


--
-- Name: idx_credit_notes_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_notes_type ON public.credit_notes USING btree (note_type);


--
-- Name: idx_customer_addresses_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_addresses_customer ON public.customer_addresses USING btree (customer_id);


--
-- Name: idx_customer_addresses_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_addresses_phone ON public.customer_addresses USING btree (phone_id);


--
-- Name: idx_customer_phones_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_phones_customer ON public.customer_phones USING btree (customer_id);


--
-- Name: idx_customer_phones_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_phones_phone ON public.customer_phones USING btree (phone);


--
-- Name: idx_customers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_name ON public.customers USING btree (name);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);


--
-- Name: idx_fifo_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fifo_brand ON public.fifo_cost_layers USING btree (brand_variant_id);


--
-- Name: idx_fifo_warehouse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fifo_warehouse ON public.fifo_cost_layers USING btree (brand_variant_id, warehouse_id);


--
-- Name: idx_inventory_categories_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_categories_parent_id ON public.inventory_categories USING btree (parent_id);


--
-- Name: idx_inventory_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_category ON public.inventory_items USING btree (category_id);


--
-- Name: idx_inventory_items_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_sku ON public.inventory_items USING btree (sku);


--
-- Name: idx_invoices_ar_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_ar_status ON public.invoices USING btree (direction, status, payment_status) WHERE (direction = 'ar'::text);


--
-- Name: idx_invoices_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_customer ON public.invoices USING btree (customer_id);


--
-- Name: idx_invoices_customer_phone_ar; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_customer_phone_ar ON public.invoices USING btree (customer_id, phone_id) WHERE (direction = 'ar'::text);


--
-- Name: idx_invoices_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_due_date ON public.invoices USING btree (due_date);


--
-- Name: idx_invoices_qb_synced; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_qb_synced ON public.invoices USING btree (qb_synced) WHERE (qb_synced = false);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_date ON public.payments USING btree (date);


--
-- Name: idx_payments_incoming; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_incoming ON public.payments USING btree (direction, deleted_at) WHERE (direction = 'incoming'::text);


--
-- Name: idx_payments_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_invoice ON public.payments USING btree (invoice_id);


--
-- Name: idx_payments_qb_synced; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_qb_synced ON public.payments USING btree (qb_synced) WHERE (qb_synced = false);


--
-- Name: idx_payments_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_source ON public.payments USING btree (source_type, source_id);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_pba_bill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pba_bill ON public.payment_bill_allocations USING btree (bill_id);


--
-- Name: idx_pba_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pba_payment ON public.payment_bill_allocations USING btree (payment_id);


--
-- Name: idx_po_approvals_active_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_approvals_active_pending ON public.po_approvals USING btree (po_id, is_active, status);


--
-- Name: idx_po_approvals_po_iteration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_approvals_po_iteration ON public.po_approvals USING btree (po_id, iteration);


--
-- Name: idx_po_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_status ON public.purchase_orders USING btree (status);


--
-- Name: idx_purchase_orders_po_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_po_type ON public.purchase_orders USING btree (po_type);


--
-- Name: idx_rer_receival; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rer_receival ON public.receival_edit_requests USING btree (receival_id);


--
-- Name: idx_rer_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rer_status ON public.receival_edit_requests USING btree (status);


--
-- Name: idx_saa_adjustment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saa_adjustment ON public.stock_adjustment_approvals USING btree (adjustment_id);


--
-- Name: idx_saa_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saa_pending ON public.stock_adjustment_approvals USING btree (adjustment_id, step_order) WHERE (status = 'pending'::text);


--
-- Name: idx_sale_deliveries_credit_note_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_deliveries_credit_note_id ON public.sale_deliveries USING btree (source_credit_note_id) WHERE (source_credit_note_id IS NOT NULL);


--
-- Name: idx_shipments_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipments_po ON public.shipments USING btree (po_id);


--
-- Name: idx_shipments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipments_status ON public.shipments USING btree (status);


--
-- Name: idx_stock_mvmt_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_mvmt_ref ON public.inventory_stock_movements USING btree (reference_type, reference_id);


--
-- Name: idx_stock_mvmt_ref_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_mvmt_ref_id ON public.inventory_stock_movements USING btree (reference_id);


--
-- Name: idx_stock_mvmt_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_mvmt_variant ON public.inventory_stock_movements USING btree (brand_variant_id);


--
-- Name: idx_user_divisions_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_divisions_profile_id ON public.user_company_divisions USING btree (profile_id);


--
-- Name: po_edit_requests_one_approved_per_po; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX po_edit_requests_one_approved_per_po ON public.po_edit_requests USING btree (po_id) WHERE (status = 'approved'::text);


--
-- Name: po_edit_requests_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX po_edit_requests_pending_idx ON public.po_edit_requests USING btree (po_id) WHERE (status = 'pending'::text);


--
-- Name: po_edit_requests_po_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX po_edit_requests_po_idx ON public.po_edit_requests USING btree (po_id);


--
-- Name: po_rfq_quote_items_quote_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX po_rfq_quote_items_quote_idx ON public.po_rfq_quote_items USING btree (quote_id);


--
-- Name: po_rfq_quotes_po_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX po_rfq_quotes_po_idx ON public.po_rfq_quotes USING btree (po_id);


--
-- Name: po_versions_po_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX po_versions_po_stage_idx ON public.po_versions USING btree (po_id, stage);


--
-- Name: po_versions_po_stage_version_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX po_versions_po_stage_version_uidx ON public.po_versions USING btree (po_id, stage, version_number);


--
-- Name: profiles_feature_flags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_feature_flags_idx ON public.profiles USING gin (feature_flags);


--
-- Name: profiles_threecx_extension_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_threecx_extension_uq ON public.profiles USING btree (threecx_extension) WHERE (threecx_extension IS NOT NULL);


--
-- Name: returns_return_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX returns_return_number_unique ON public.returns USING btree (return_number) WHERE (deleted_at IS NULL);


--
-- Name: credit_notes credit_notes_invalidate_pdf_cache; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER credit_notes_invalidate_pdf_cache BEFORE UPDATE ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.credit_notes_invalidate_pdf_cache_fn();


--
-- Name: invoice_line_items invoice_line_items_cascade_pdf_invalidation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER invoice_line_items_cascade_pdf_invalidation AFTER INSERT OR DELETE OR UPDATE ON public.invoice_line_items FOR EACH ROW EXECUTE FUNCTION public.invoice_line_items_invalidate_parent_pdf_fn();


--
-- Name: invoices invoices_invalidate_pdf_cache; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER invoices_invalidate_pdf_cache BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoices_invalidate_pdf_cache_fn();


--
-- Name: payments payments_recalc_ar_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payments_recalc_ar_status AFTER INSERT OR DELETE OR UPDATE OF amount, invoice_id, deleted_at ON public.payments FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_ar_payment_status();


--
-- Name: po_line_items po_line_items_cascade_pdf_invalidation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER po_line_items_cascade_pdf_invalidation AFTER INSERT OR DELETE OR UPDATE ON public.po_line_items FOR EACH ROW EXECUTE FUNCTION public.po_line_items_invalidate_parent_pdf_fn();


--
-- Name: purchase_orders purchase_orders_invalidate_pdf_cache; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER purchase_orders_invalidate_pdf_cache BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.purchase_orders_invalidate_pdf_cache_fn();


--
-- Name: receival_items receival_items_cascade_check_pdf_invalidation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER receival_items_cascade_check_pdf_invalidation AFTER INSERT OR DELETE OR UPDATE ON public.receival_items FOR EACH ROW EXECUTE FUNCTION public.receival_items_invalidate_parent_pdf_fn();


--
-- Name: receivals receivals_invalidate_check_pdf; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER receivals_invalidate_check_pdf BEFORE UPDATE ON public.receivals FOR EACH ROW EXECUTE FUNCTION public.receivals_invalidate_check_pdf_fn();


--
-- Name: sale_order_lines sale_order_lines_cascade_pdf_invalidation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sale_order_lines_cascade_pdf_invalidation AFTER INSERT OR DELETE OR UPDATE ON public.sale_order_lines FOR EACH ROW EXECUTE FUNCTION public.sale_order_lines_invalidate_parent_pdf_fn();


--
-- Name: sale_orders sale_orders_invalidate_pdf_cache; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sale_orders_invalidate_pdf_cache BEFORE UPDATE ON public.sale_orders FOR EACH ROW EXECUTE FUNCTION public.sale_orders_invalidate_pdf_cache_fn();


--
-- Name: custom_roles set_custom_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_custom_roles_updated_at BEFORE UPDATE ON public.custom_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_check_items set_inventory_check_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_inventory_check_items_updated_at BEFORE UPDATE ON public.inventory_check_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_checks set_inventory_checks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_inventory_checks_updated_at BEFORE UPDATE ON public.inventory_checks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: payment_sessions set_payment_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_payment_sessions_updated_at BEFORE UPDATE ON public.payment_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: pricing_factors set_pricing_factors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_pricing_factors_updated_at BEFORE UPDATE ON public.pricing_factors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: stock_adjustments set_stock_adjustments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_stock_adjustments_updated_at BEFORE UPDATE ON public.stock_adjustments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: credit_groups set_updated_at_credit_groups; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_credit_groups BEFORE UPDATE ON public.credit_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sale_deliveries set_updated_at_sale_deliveries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_sale_deliveries BEFORE UPDATE ON public.sale_deliveries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sale_orders set_updated_at_sale_orders; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_sale_orders BEFORE UPDATE ON public.sale_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: warehouse_manager_log set_warehouse_manager_log_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_warehouse_manager_log_updated_at BEFORE UPDATE ON public.warehouse_manager_log FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sale_order_approvals trg_approval_requests_decided_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_approval_requests_decided_at BEFORE UPDATE ON public.sale_order_approvals FOR EACH ROW EXECUTE FUNCTION public.set_approval_request_decided_at();


--
-- Name: sale_order_approvals trg_approval_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_approval_requests_updated_at BEFORE UPDATE ON public.sale_order_approvals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_brand_variants trg_auto_brand_variant_sku; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_brand_variant_sku BEFORE INSERT OR UPDATE ON public.inventory_brand_variants FOR EACH ROW EXECUTE FUNCTION public.generate_brand_variant_sku();


--
-- Name: customer_credit_group_requests trg_ccgr_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ccgr_updated_at BEFORE UPDATE ON public.customer_credit_group_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: companies trg_companies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: credit_notes trg_credit_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_credit_notes_updated_at BEFORE UPDATE ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: currencies trg_currencies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_currencies_updated_at BEFORE UPDATE ON public.currencies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: company_divisions trg_divisions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_divisions_updated_at BEFORE UPDATE ON public.company_divisions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: document_terms trg_document_terms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_document_terms_updated_at BEFORE UPDATE ON public.document_terms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: payments trg_invoice_recompute_paid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_recompute_paid AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.invoice_recompute_paid_fn();


--
-- Name: sale_order_approvals trg_log_sales_approval_decision; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_sales_approval_decision AFTER UPDATE ON public.sale_order_approvals FOR EACH ROW EXECUTE FUNCTION public.log_sales_approval_decision();


--
-- Name: inventory_stock_movements trg_low_stock_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_low_stock_notify AFTER INSERT ON public.inventory_stock_movements FOR EACH ROW EXECUTE FUNCTION public.check_low_stock_and_notify();


--
-- Name: notification_config trg_notification_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_config_updated_at BEFORE UPDATE ON public.notification_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notification_templates trg_notification_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_templates_updated_at BEFORE UPDATE ON public.notification_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: payments trg_payments_redirect_to_invoice; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payments_redirect_to_invoice BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payments_redirect_to_invoice_fn();


--
-- Name: payments trg_payments_sync_invoice_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payments_sync_invoice_id BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payments_sync_invoice_id_fn();


--
-- Name: po_line_items trg_po_line_items_incoming; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_po_line_items_incoming AFTER INSERT OR DELETE OR UPDATE ON public.po_line_items FOR EACH ROW EXECUTE FUNCTION public.trg_fn_po_line_items_incoming();


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: purchase_orders trg_purchase_orders_incoming; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchase_orders_incoming AFTER UPDATE OF status ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.trg_fn_purchase_orders_incoming();


--
-- Name: reason_list_categories trg_reason_list_categories_no_orphan_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reason_list_categories_no_orphan_delete BEFORE DELETE ON public.reason_list_categories FOR EACH ROW EXECUTE FUNCTION public.reason_list_categories_no_orphan_delete();


--
-- Name: reason_lists trg_reason_lists_category_must_exist; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reason_lists_category_must_exist BEFORE INSERT OR UPDATE OF category ON public.reason_lists FOR EACH ROW EXECUTE FUNCTION public.reason_lists_category_must_exist();


--
-- Name: reason_lists trg_reason_lists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reason_lists_updated_at BEFORE UPDATE ON public.reason_lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: returns trg_returns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_returns_updated_at BEFORE UPDATE ON public.returns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: landed_costs trg_set_lc_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_lc_number BEFORE INSERT ON public.landed_costs FOR EACH ROW EXECUTE FUNCTION public._set_lc_number();


--
-- Name: sale_orders trg_so_reserved_qty; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_so_reserved_qty AFTER UPDATE OF status ON public.sale_orders FOR EACH ROW EXECUTE FUNCTION public.trg_fn_so_reserved_qty();


--
-- Name: sale_order_lines trg_sol_reserved_qty; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sol_reserved_qty AFTER INSERT OR DELETE OR UPDATE ON public.sale_order_lines FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sol_reserved_qty();


--
-- Name: suppliers trg_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: fifo_cost_layers trg_warehouse_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_warehouse_stats AFTER INSERT OR DELETE OR UPDATE ON public.fifo_cost_layers FOR EACH ROW EXECUTE FUNCTION public.fn_refresh_warehouse_stats();


--
-- Name: app_settings app_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: po_approval_chain_tiers approval_chain_tiers_chain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_approval_chain_tiers
    ADD CONSTRAINT approval_chain_tiers_chain_id_fkey FOREIGN KEY (chain_id) REFERENCES public.po_approval_chains(id) ON DELETE CASCADE;


--
-- Name: po_approval_chains approval_chains_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_approval_chains
    ADD CONSTRAINT approval_chains_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id);


--
-- Name: sale_order_approvals approval_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_approvals
    ADD CONSTRAINT approval_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.profiles(id);


--
-- Name: sale_order_approvals approval_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_approvals
    ADD CONSTRAINT approval_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id);


--
-- Name: approval_workflow_steps approval_workflow_steps_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflow_steps
    ADD CONSTRAINT approval_workflow_steps_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.approval_workflow_groups(id) ON DELETE SET NULL;


--
-- Name: cogs_entries cogs_entries_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id);


--
-- Name: cogs_entries cogs_entries_landed_cost_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_landed_cost_id_fkey FOREIGN KEY (landed_cost_id) REFERENCES public.landed_costs(id);


--
-- Name: companies companies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: credit_group_payment_methods credit_group_payment_methods_credit_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_group_payment_methods
    ADD CONSTRAINT credit_group_payment_methods_credit_group_id_fkey FOREIGN KEY (credit_group_id) REFERENCES public.credit_groups(id) ON DELETE CASCADE;


--
-- Name: credit_group_payment_methods credit_group_payment_methods_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_group_payment_methods
    ADD CONSTRAINT credit_group_payment_methods_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE CASCADE;


--
-- Name: credit_note_lines credit_note_lines_credit_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_note_lines
    ADD CONSTRAINT credit_note_lines_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES public.credit_notes(id) ON DELETE CASCADE;


--
-- Name: credit_note_lines credit_note_lines_invoice_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_note_lines
    ADD CONSTRAINT credit_note_lines_invoice_line_id_fkey FOREIGN KEY (invoice_line_id) REFERENCES public.invoice_line_items(id);


--
-- Name: credit_notes credit_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: credit_notes credit_notes_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);


--
-- Name: credit_notes credit_notes_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);


--
-- Name: credit_notes credit_notes_source_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_source_return_id_fkey FOREIGN KEY (source_return_id) REFERENCES public.returns(id) ON DELETE SET NULL;


--
-- Name: custom_roles custom_roles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_roles
    ADD CONSTRAINT custom_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: customer_addresses customer_addresses_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_addresses customer_addresses_phone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES public.customer_phones(id) ON DELETE CASCADE;


--
-- Name: customer_credit_group_approvals customer_credit_group_approvals_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_group_approvals
    ADD CONSTRAINT customer_credit_group_approvals_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.profiles(id);


--
-- Name: customer_credit_group_approvals customer_credit_group_approvals_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_group_approvals
    ADD CONSTRAINT customer_credit_group_approvals_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.customer_credit_group_requests(id) ON DELETE CASCADE;


--
-- Name: customer_credit_group_requests customer_credit_group_requests_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_group_requests
    ADD CONSTRAINT customer_credit_group_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_credit_group_requests customer_credit_group_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_group_requests
    ADD CONSTRAINT customer_credit_group_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.profiles(id);


--
-- Name: customer_credit_group_requests customer_credit_group_requests_previous_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_group_requests
    ADD CONSTRAINT customer_credit_group_requests_previous_group_id_fkey FOREIGN KEY (previous_group_id) REFERENCES public.credit_groups(id);


--
-- Name: customer_credit_group_requests customer_credit_group_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_group_requests
    ADD CONSTRAINT customer_credit_group_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id);


--
-- Name: customer_credit_group_requests customer_credit_group_requests_requested_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_group_requests
    ADD CONSTRAINT customer_credit_group_requests_requested_group_id_fkey FOREIGN KEY (requested_group_id) REFERENCES public.credit_groups(id);


--
-- Name: customer_phones customer_phones_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_phones
    ADD CONSTRAINT customer_phones_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customers customers_credit_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_credit_group_id_fkey FOREIGN KEY (credit_group_id) REFERENCES public.credit_groups(id);


--
--



--
-- Name: company_divisions divisions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_divisions
    ADD CONSTRAINT divisions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: company_divisions divisions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_divisions
    ADD CONSTRAINT divisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: document_terms document_terms_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_terms
    ADD CONSTRAINT document_terms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: document_terms document_terms_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_terms
    ADD CONSTRAINT document_terms_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id);


--
-- Name: fifo_cost_layers fifo_cost_layers_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fifo_cost_layers
    ADD CONSTRAINT fifo_cost_layers_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id) ON DELETE CASCADE;


--
-- Name: fifo_cost_layers fifo_cost_layers_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fifo_cost_layers
    ADD CONSTRAINT fifo_cost_layers_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: inventory_brand_variants inventory_brand_variants_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_brand_variants
    ADD CONSTRAINT inventory_brand_variants_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: inventory_categories inventory_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_categories
    ADD CONSTRAINT inventory_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.inventory_categories(id) ON DELETE RESTRICT;


--
-- Name: inventory_check_approvals inventory_check_approvals_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_approvals
    ADD CONSTRAINT inventory_check_approvals_check_id_fkey FOREIGN KEY (check_id) REFERENCES public.inventory_checks(id) ON DELETE CASCADE;


--
-- Name: inventory_check_approvals inventory_check_approvals_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_approvals
    ADD CONSTRAINT inventory_check_approvals_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: inventory_check_assignments inventory_check_assignments_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_assignments
    ADD CONSTRAINT inventory_check_assignments_check_id_fkey FOREIGN KEY (check_id) REFERENCES public.inventory_checks(id) ON DELETE CASCADE;


--
-- Name: inventory_check_assignments inventory_check_assignments_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_assignments
    ADD CONSTRAINT inventory_check_assignments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: inventory_check_items inventory_check_items_assigned_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_items
    ADD CONSTRAINT inventory_check_items_assigned_profile_id_fkey FOREIGN KEY (assigned_profile_id) REFERENCES public.profiles(id);


--
-- Name: inventory_check_items inventory_check_items_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_items
    ADD CONSTRAINT inventory_check_items_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.inventory_check_assignments(id) ON DELETE SET NULL;


--
-- Name: inventory_check_items inventory_check_items_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_items
    ADD CONSTRAINT inventory_check_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id);


--
-- Name: inventory_check_items inventory_check_items_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_items
    ADD CONSTRAINT inventory_check_items_check_id_fkey FOREIGN KEY (check_id) REFERENCES public.inventory_checks(id);


--
-- Name: inventory_check_log inventory_check_log_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_log
    ADD CONSTRAINT inventory_check_log_check_id_fkey FOREIGN KEY (check_id) REFERENCES public.inventory_checks(id) ON DELETE CASCADE;


--
-- Name: inventory_check_log inventory_check_log_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_log
    ADD CONSTRAINT inventory_check_log_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: inventory_checks inventory_checks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_checks
    ADD CONSTRAINT inventory_checks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: inventory_checks inventory_checks_initiated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_checks
    ADD CONSTRAINT inventory_checks_initiated_by_profile_id_fkey FOREIGN KEY (initiated_by_profile_id) REFERENCES public.profiles(id);


--
-- Name: inventory_checks inventory_checks_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_checks
    ADD CONSTRAINT inventory_checks_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);


--
-- Name: inventory_checks inventory_checks_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_checks
    ADD CONSTRAINT inventory_checks_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(id);


--
-- Name: inventory_checks inventory_checks_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_checks
    ADD CONSTRAINT inventory_checks_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: inventory_items inventory_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.inventory_categories(id);


--
-- Name: inventory_stock_movements inventory_stock_movements_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock_movements
    ADD CONSTRAINT inventory_stock_movements_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id);


--
-- Name: inventory_stock_movements inventory_stock_movements_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock_movements
    ADD CONSTRAINT inventory_stock_movements_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: invoice_line_items invoice_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: invoices invoices_phone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES public.customer_phones(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);


--
-- Name: invoices invoices_receival_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES public.receivals(id);


--
-- Name: invoices invoices_sale_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_sale_delivery_id_fkey FOREIGN KEY (sale_delivery_id) REFERENCES public.sale_deliveries(id);


--
-- Name: invoices invoices_sale_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES public.sale_orders(id);


--
-- Name: invoices invoices_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: notification_config notification_config_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_config
    ADD CONSTRAINT notification_config_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: notification_config notification_config_template_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_config
    ADD CONSTRAINT notification_config_template_slug_fkey FOREIGN KEY (template_slug) REFERENCES public.notification_templates(slug);


--
-- Name: notification_templates notification_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: notification_trail notification_trail_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_trail
    ADD CONSTRAINT notification_trail_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: payment_bill_allocations payment_bill_allocations_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_bill_allocations
    ADD CONSTRAINT payment_bill_allocations_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: payment_bill_allocations payment_bill_allocations_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_bill_allocations
    ADD CONSTRAINT payment_bill_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payment_installments payment_installments_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_installments
    ADD CONSTRAINT payment_installments_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: payment_installments payment_installments_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_installments
    ADD CONSTRAINT payment_installments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.payment_plans(id) ON DELETE CASCADE;


--
-- Name: payment_plans payment_plans_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_plans
    ADD CONSTRAINT payment_plans_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: payment_sessions payment_sessions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_sessions
    ADD CONSTRAINT payment_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: payment_sessions payment_sessions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_sessions
    ADD CONSTRAINT payment_sessions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: payments payments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: payments payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);


--
-- Name: payments payments_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: po_approvals po_approvals_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_approvals
    ADD CONSTRAINT po_approvals_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: po_edit_requests po_edit_requests_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_edit_requests
    ADD CONSTRAINT po_edit_requests_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: po_edit_requests po_edit_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_edit_requests
    ADD CONSTRAINT po_edit_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id);


--
-- Name: po_edit_requests po_edit_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_edit_requests
    ADD CONSTRAINT po_edit_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);


--
-- Name: po_line_items po_line_items_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_line_items
    ADD CONSTRAINT po_line_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id) ON DELETE SET NULL;


--
-- Name: po_line_items po_line_items_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_line_items
    ADD CONSTRAINT po_line_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
--



--
-- Name: po_rfq_quote_items po_rfq_quote_items_po_line_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_rfq_quote_items
    ADD CONSTRAINT po_rfq_quote_items_po_line_item_id_fkey FOREIGN KEY (po_line_item_id) REFERENCES public.po_line_items(id) ON DELETE CASCADE;


--
-- Name: po_rfq_quote_items po_rfq_quote_items_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_rfq_quote_items
    ADD CONSTRAINT po_rfq_quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.po_rfq_quotes(id) ON DELETE CASCADE;


--
-- Name: po_rfq_quotes po_rfq_quotes_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_rfq_quotes
    ADD CONSTRAINT po_rfq_quotes_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: po_rfq_quotes po_rfq_quotes_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_rfq_quotes
    ADD CONSTRAINT po_rfq_quotes_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: po_versions po_versions_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_versions
    ADD CONSTRAINT po_versions_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: po_versions po_versions_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_versions
    ADD CONSTRAINT po_versions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pricing_factors pricing_factors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_factors
    ADD CONSTRAINT pricing_factors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: pricing_factors pricing_factors_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_factors
    ADD CONSTRAINT pricing_factors_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id);


--
-- Name: profiles profiles_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id);


--
-- Name: purchase_orders purchase_orders_created_by_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_profiles_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: purchase_orders purchase_orders_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id) ON DELETE RESTRICT;


--
--



--
-- Name: purchase_orders purchase_orders_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: reason_lists reason_lists_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reason_lists
    ADD CONSTRAINT reason_lists_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: receival_edit_requests receival_edit_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receival_edit_requests
    ADD CONSTRAINT receival_edit_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: receival_edit_requests receival_edit_requests_receival_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receival_edit_requests
    ADD CONSTRAINT receival_edit_requests_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES public.receivals(id);


--
-- Name: receival_edit_requests receival_edit_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receival_edit_requests
    ADD CONSTRAINT receival_edit_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id);


--
-- Name: receival_items receival_items_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receival_items
    ADD CONSTRAINT receival_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id);


--
-- Name: receival_items receival_items_po_line_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receival_items
    ADD CONSTRAINT receival_items_po_line_item_id_fkey FOREIGN KEY (po_line_item_id) REFERENCES public.po_line_items(id);


--
-- Name: receival_items receival_items_receival_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receival_items
    ADD CONSTRAINT receival_items_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES public.receivals(id) ON DELETE CASCADE;


--
-- Name: receivals receivals_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivals
    ADD CONSTRAINT receivals_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id);


--
--



--
-- Name: receivals receivals_source_debit_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivals
    ADD CONSTRAINT receivals_source_debit_note_id_fkey FOREIGN KEY (source_debit_note_id) REFERENCES public.credit_notes(id);


--
-- Name: receivals receivals_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivals
    ADD CONSTRAINT receivals_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: returns returns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: returns returns_credit_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES public.credit_notes(id);


--
-- Name: returns returns_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id);


--
-- Name: returns returns_restock_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_restock_warehouse_id_fkey FOREIGN KEY (restock_warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: sale_deliveries sale_deliveries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_deliveries
    ADD CONSTRAINT sale_deliveries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: sale_deliveries sale_deliveries_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_deliveries
    ADD CONSTRAINT sale_deliveries_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.returns(id) ON DELETE SET NULL;


--
-- Name: sale_deliveries sale_deliveries_sale_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_deliveries
    ADD CONSTRAINT sale_deliveries_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES public.sale_orders(id);


--
-- Name: sale_deliveries sale_deliveries_source_credit_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_deliveries
    ADD CONSTRAINT sale_deliveries_source_credit_note_id_fkey FOREIGN KEY (source_credit_note_id) REFERENCES public.credit_notes(id);


--
-- Name: sale_deliveries sale_deliveries_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_deliveries
    ADD CONSTRAINT sale_deliveries_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: sale_order_lines sale_order_lines_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_lines
    ADD CONSTRAINT sale_order_lines_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id);


--
-- Name: sale_order_lines sale_order_lines_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_lines
    ADD CONSTRAINT sale_order_lines_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: sale_order_lines sale_order_lines_sale_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_lines
    ADD CONSTRAINT sale_order_lines_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES public.sale_orders(id);


--
--



--
--



--
-- Name: sale_orders sale_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_orders
    ADD CONSTRAINT sale_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: sale_orders sale_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_orders
    ADD CONSTRAINT sale_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: sale_orders sale_orders_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_orders
    ADD CONSTRAINT sale_orders_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id) ON DELETE RESTRICT;


--
--



--
-- Name: shipments shipments_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id);


--
-- Name: shipments shipments_receival_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES public.receivals(id);


--
-- Name: stock_adjustment_approvals stock_adjustment_approvals_adjustment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustment_approvals
    ADD CONSTRAINT stock_adjustment_approvals_adjustment_id_fkey FOREIGN KEY (adjustment_id) REFERENCES public.stock_adjustments(id) ON DELETE CASCADE;


--
-- Name: stock_adjustment_approvals stock_adjustment_approvals_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustment_approvals
    ADD CONSTRAINT stock_adjustment_approvals_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: stock_adjustments stock_adjustments_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: stock_adjustments stock_adjustments_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id);


--
-- Name: stock_adjustments stock_adjustments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: stock_adjustments stock_adjustments_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id);


--
-- Name: stock_adjustments stock_adjustments_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: suppliers suppliers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: suppliers suppliers_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: user_custom_roles user_custom_roles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_roles
    ADD CONSTRAINT user_custom_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: user_custom_roles user_custom_roles_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_roles
    ADD CONSTRAINT user_custom_roles_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: user_custom_roles user_custom_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_roles
    ADD CONSTRAINT user_custom_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.custom_roles(id) ON DELETE CASCADE;


--
-- Name: user_company_divisions user_divisions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_company_divisions
    ADD CONSTRAINT user_divisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: user_company_divisions user_divisions_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_company_divisions
    ADD CONSTRAINT user_divisions_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id);


--
-- Name: user_company_divisions user_divisions_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_company_divisions
    ADD CONSTRAINT user_divisions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: user_ui_preferences user_ui_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ui_preferences
    ADD CONSTRAINT user_ui_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: warehouse_field_rps warehouse_field_rps_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_field_rps
    ADD CONSTRAINT warehouse_field_rps_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: warehouse_field_rps warehouse_field_rps_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_field_rps
    ADD CONSTRAINT warehouse_field_rps_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: warehouse_manager_log warehouse_manager_log_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_manager_log
    ADD CONSTRAINT warehouse_manager_log_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id);


--
--



--
-- Name: warehouse_manager_log warehouse_manager_log_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_manager_log
    ADD CONSTRAINT warehouse_manager_log_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: warehouse_reorder_points warehouse_reorder_points_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_reorder_points
    ADD CONSTRAINT warehouse_reorder_points_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id) ON DELETE CASCADE;


--
-- Name: warehouse_reorder_points warehouse_reorder_points_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_reorder_points
    ADD CONSTRAINT warehouse_reorder_points_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: warehouse_stock_allocations warehouse_stock_allocations_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_allocations
    ADD CONSTRAINT warehouse_stock_allocations_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id) ON DELETE CASCADE;


--
-- Name: warehouse_stock_allocations warehouse_stock_allocations_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_allocations
    ADD CONSTRAINT warehouse_stock_allocations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: warehouse_transfer_items warehouse_transfer_items_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfer_items
    ADD CONSTRAINT warehouse_transfer_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id);


--
-- Name: warehouse_transfer_items warehouse_transfer_items_transfer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfer_items
    ADD CONSTRAINT warehouse_transfer_items_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES public.warehouse_transfers(id) ON DELETE CASCADE;


--
-- Name: warehouse_transfers warehouse_transfers_cancelled_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_cancelled_by_profile_id_fkey FOREIGN KEY (cancelled_by_profile_id) REFERENCES public.profiles(id);


--
-- Name: warehouse_transfers warehouse_transfers_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id);


--
-- Name: warehouse_transfers warehouse_transfers_dispatched_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_dispatched_by_profile_id_fkey FOREIGN KEY (dispatched_by_profile_id) REFERENCES public.profiles(id);


--
-- Name: warehouse_transfers warehouse_transfers_from_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_from_warehouse_id_fkey FOREIGN KEY (from_warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: warehouse_transfers warehouse_transfers_received_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_received_by_profile_id_fkey FOREIGN KEY (received_by_profile_id) REFERENCES public.profiles(id);


--
-- Name: warehouse_transfers warehouse_transfers_to_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_to_warehouse_id_fkey FOREIGN KEY (to_warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: approval_workflow_steps workflow_approval_steps_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflow_steps
    ADD CONSTRAINT workflow_approval_steps_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id);


--
-- Name: approval_workflow_steps workflow_approval_steps_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflow_steps
    ADD CONSTRAINT workflow_approval_steps_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.custom_roles(id);


--
-- Name: credit_notes Accounting/admin can insert credit_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Accounting/admin can insert credit_notes" ON public.credit_notes FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.profiles p
     JOIN public.user_custom_roles ucr ON ((ucr.profile_id = p.id)))
     JOIN public.custom_roles cr ON ((cr.id = ucr.role_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cr.deleted_at IS NULL) AND ((cr.is_system = true) OR ('invoices.manage'::text = ANY (cr.permissions)))))));


--
-- Name: company_divisions Admin can delete divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can delete divisions" ON public.company_divisions FOR DELETE TO authenticated USING (true);


--
-- Name: app_settings Admin can insert app_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can insert app_settings" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: companies Admin can insert companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can insert companies" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: company_divisions Admin can insert divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can insert divisions" ON public.company_divisions FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: document_terms Admin can manage document_terms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage document_terms" ON public.document_terms TO authenticated USING (true) WITH CHECK (true);


--
-- Name: reason_lists Admin can manage reason_lists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage reason_lists" ON public.reason_lists TO authenticated USING (true) WITH CHECK (true);


--
-- Name: app_settings Admin can update app_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update app_settings" ON public.app_settings FOR UPDATE TO authenticated USING (true);


--
-- Name: companies Admin can update companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update companies" ON public.companies FOR UPDATE TO authenticated USING (true);


--
-- Name: company_divisions Admin can update divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update divisions" ON public.company_divisions FOR UPDATE TO authenticated USING (true);


--
-- Name: custom_roles Admins can manage custom_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage custom_roles" ON public.custom_roles TO authenticated USING (true) WITH CHECK (true);


--
-- Name: notification_config Admins can manage notification_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage notification_config" ON public.notification_config TO authenticated USING (true) WITH CHECK (true);


--
-- Name: notification_templates Admins can manage notification_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage notification_templates" ON public.notification_templates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: reason_list_categories Admins can manage reason_list_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage reason_list_categories" ON public.reason_list_categories TO authenticated USING (true) WITH CHECK (true);


--
-- Name: user_custom_roles Admins can manage user_custom_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage user_custom_roles" ON public.user_custom_roles TO authenticated USING (true) WITH CHECK (true);


--
-- Name: user_company_divisions Admins can manage user_divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage user_divisions" ON public.user_company_divisions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: invoices Authenticated can delete invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can delete invoices" ON public.invoices FOR DELETE TO authenticated USING (true);


--
-- Name: approval_workflow_groups Authenticated can delete workflow groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can delete workflow groups" ON public.approval_workflow_groups FOR DELETE TO authenticated USING (true);


--
-- Name: invoices Authenticated can insert invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: approval_workflow_groups Authenticated can insert workflow groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can insert workflow groups" ON public.approval_workflow_groups FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: customer_credit_group_approvals Authenticated can read credit-group approval slips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read credit-group approval slips" ON public.customer_credit_group_approvals FOR SELECT TO authenticated USING (true);


--
-- Name: customer_credit_group_requests Authenticated can read credit-group requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read credit-group requests" ON public.customer_credit_group_requests FOR SELECT TO authenticated USING (true);


--
-- Name: reason_list_categories Authenticated can read reason_list_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read reason_list_categories" ON public.reason_list_categories FOR SELECT TO authenticated USING (true);


--
-- Name: approval_workflow_groups Authenticated can read workflow groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read workflow groups" ON public.approval_workflow_groups FOR SELECT TO authenticated USING (true);


--
-- Name: invoices Authenticated can select invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can select invoices" ON public.invoices FOR SELECT TO authenticated USING (true);


--
-- Name: invoices Authenticated can update invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (((status IS DISTINCT FROM 'void'::public.invoice_status) OR ((status = 'void'::public.invoice_status) AND (EXISTS ( SELECT 1
   FROM ((public.profiles p
     JOIN public.user_custom_roles ucr ON ((ucr.profile_id = p.id)))
     JOIN public.custom_roles cr ON ((cr.id = ucr.role_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cr.deleted_at IS NULL) AND ((cr.is_system = true) OR ('invoices.manage'::text = ANY (cr.permissions)))))))));


--
-- Name: approval_workflow_groups Authenticated can update workflow groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can update workflow groups" ON public.approval_workflow_groups FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: warehouse_reorder_points Authenticated users can delete warehouse_reorder_points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete warehouse_reorder_points" ON public.warehouse_reorder_points FOR DELETE TO authenticated USING (true);


--
-- Name: country_codes Authenticated users can insert country codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert country codes" ON public.country_codes FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: currencies Authenticated users can insert currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert currencies" ON public.currencies FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: payment_methods Authenticated users can insert payment_methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert payment_methods" ON public.payment_methods FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: warehouse_reorder_points Authenticated users can insert warehouse_reorder_points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert warehouse_reorder_points" ON public.warehouse_reorder_points FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: credit_group_payment_methods Authenticated users can manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage" ON public.credit_group_payment_methods TO authenticated USING (true) WITH CHECK (true);


--
-- Name: credit_group_payment_methods Authenticated users can read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read" ON public.credit_group_payment_methods FOR SELECT TO authenticated USING (true);


--
-- Name: country_codes Authenticated users can read country codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read country codes" ON public.country_codes FOR SELECT TO authenticated USING (true);


--
-- Name: payment_methods Authenticated users can read payment_methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read payment_methods" ON public.payment_methods FOR SELECT TO authenticated USING (true);


--
-- Name: warehouse_field_rps Authenticated users can read warehouse_field_rps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read warehouse_field_rps" ON public.warehouse_field_rps FOR SELECT TO authenticated USING (true);


--
-- Name: warehouse_reorder_points Authenticated users can read warehouse_reorder_points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read warehouse_reorder_points" ON public.warehouse_reorder_points FOR SELECT TO authenticated USING (true);


--
-- Name: warehouse_stock_allocations Authenticated users can read warehouse_stock_allocations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read warehouse_stock_allocations" ON public.warehouse_stock_allocations FOR SELECT TO authenticated USING (true);


--
-- Name: warehouse_transfer_items Authenticated users can read warehouse_transfer_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read warehouse_transfer_items" ON public.warehouse_transfer_items FOR SELECT TO authenticated USING (true);


--
-- Name: country_codes Authenticated users can update country codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update country codes" ON public.country_codes FOR UPDATE TO authenticated USING (true);


--
-- Name: currencies Authenticated users can update currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update currencies" ON public.currencies FOR UPDATE TO authenticated USING (true);


--
-- Name: payment_methods Authenticated users can update payment_methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update payment_methods" ON public.payment_methods FOR UPDATE TO authenticated USING (true);


--
-- Name: warehouse_reorder_points Authenticated users can update warehouse_reorder_points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update warehouse_reorder_points" ON public.warehouse_reorder_points FOR UPDATE TO authenticated USING (true);


--
-- Name: currencies Authenticated users can view currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view currencies" ON public.currencies FOR SELECT TO authenticated USING (true);


--
-- Name: sale_order_approvals Internal can insert approval_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can insert approval_requests" ON public.sale_order_approvals FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: notification_trail Internal can insert notification_trail; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can insert notification_trail" ON public.notification_trail FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: returns Internal can insert returns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can insert returns" ON public.returns FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: sale_deliveries Internal can insert sale_deliveries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can insert sale_deliveries" ON public.sale_deliveries FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: sale_order_lines Internal can insert sale_order_lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can insert sale_order_lines" ON public.sale_order_lines FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: cogs_entries Internal can read cogs_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can read cogs_entries" ON public.cogs_entries FOR SELECT TO authenticated USING (true);


--
-- Name: inventory_stock_movements Internal can read stock_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can read stock_movements" ON public.inventory_stock_movements FOR SELECT TO authenticated USING (true);


--
-- Name: sale_order_approvals Internal can select approval_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can select approval_requests" ON public.sale_order_approvals FOR SELECT TO authenticated USING (true);


--
-- Name: credit_notes Internal can select credit_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can select credit_notes" ON public.credit_notes FOR SELECT TO authenticated USING (true);


--
-- Name: notification_trail Internal can select notification_trail; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can select notification_trail" ON public.notification_trail FOR SELECT TO authenticated USING (true);


--
-- Name: returns Internal can select returns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can select returns" ON public.returns FOR SELECT TO authenticated USING (true);


--
-- Name: sale_deliveries Internal can select sale_deliveries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can select sale_deliveries" ON public.sale_deliveries FOR SELECT TO authenticated USING (true);


--
-- Name: sale_order_lines Internal can select sale_order_lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can select sale_order_lines" ON public.sale_order_lines FOR SELECT TO authenticated USING (true);


--
-- Name: sale_order_approvals Internal can update approval_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can update approval_requests" ON public.sale_order_approvals FOR UPDATE TO authenticated USING (true);


--
-- Name: credit_notes Internal can update credit_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can update credit_notes" ON public.credit_notes FOR UPDATE TO authenticated USING (true);


--
-- Name: returns Internal can update returns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can update returns" ON public.returns FOR UPDATE TO authenticated USING (true);


--
-- Name: sale_deliveries Internal can update sale_deliveries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can update sale_deliveries" ON public.sale_deliveries FOR UPDATE TO authenticated USING (true);


--
-- Name: sale_order_lines Internal can update sale_order_lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can update sale_order_lines" ON public.sale_order_lines FOR UPDATE TO authenticated USING (true);


--
-- Name: stock_adjustments Internal users can create adjustments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can create adjustments" ON public.stock_adjustments FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: pricing_factors Internal users can delete pricing_factors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can delete pricing_factors" ON public.pricing_factors FOR DELETE TO authenticated USING (true);


--
-- Name: warehouses Internal users can delete warehouses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can delete warehouses" ON public.warehouses FOR DELETE TO authenticated USING (true);


--
-- Name: pricing_factors Internal users can insert pricing_factors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can insert pricing_factors" ON public.pricing_factors FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: suppliers Internal users can insert suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can insert suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: warehouse_manager_log Internal users can insert warehouse manager log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can insert warehouse manager log" ON public.warehouse_manager_log FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: warehouses Internal users can insert warehouses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can insert warehouses" ON public.warehouses FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: activity_log Internal users can manage activity_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage activity_log" ON public.activity_log TO authenticated USING (true) WITH CHECK (true);


--
-- Name: credit_note_lines Internal users can manage credit_note_lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage credit_note_lines" ON public.credit_note_lines TO authenticated USING (true) WITH CHECK (true);


--
-- Name: customer_addresses Internal users can manage customer_addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage customer_addresses" ON public.customer_addresses TO authenticated USING (true) WITH CHECK (true);


--
-- Name: customer_phones Internal users can manage customer_phones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage customer_phones" ON public.customer_phones TO authenticated USING (true) WITH CHECK (true);


--
-- Name: customers Internal users can manage customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage customers" ON public.customers TO authenticated USING (true) WITH CHECK (true);


--
-- Name: fifo_cost_layers Internal users can manage fifo_cost_layers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage fifo_cost_layers" ON public.fifo_cost_layers TO authenticated USING (true) WITH CHECK (true);


--
-- Name: inventory_brand_variants Internal users can manage inventory_brand_variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage inventory_brand_variants" ON public.inventory_brand_variants TO authenticated USING (true) WITH CHECK (true);


--
-- Name: inventory_categories Internal users can manage inventory_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage inventory_categories" ON public.inventory_categories TO authenticated USING (true) WITH CHECK (true);


--
-- Name: inventory_check_items Internal users can manage inventory_check_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage inventory_check_items" ON public.inventory_check_items TO authenticated USING (true) WITH CHECK (true);


--
-- Name: inventory_checks Internal users can manage inventory_checks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage inventory_checks" ON public.inventory_checks TO authenticated USING (true) WITH CHECK (true);


--
-- Name: inventory_groups Internal users can manage inventory_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage inventory_groups" ON public.inventory_groups TO authenticated USING (true) WITH CHECK (true);


--
-- Name: inventory_items Internal users can manage inventory_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage inventory_items" ON public.inventory_items TO authenticated USING (true) WITH CHECK (true);


--
-- Name: invoice_line_items Internal users can manage invoice_line_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage invoice_line_items" ON public.invoice_line_items TO authenticated USING (true) WITH CHECK (true);


--
-- Name: landed_costs Internal users can manage landed_costs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage landed_costs" ON public.landed_costs TO authenticated USING (true) WITH CHECK (true);


--
-- Name: payment_sessions Internal users can manage payment sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage payment sessions" ON public.payment_sessions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: payment_bill_allocations Internal users can manage payment_bill_allocations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage payment_bill_allocations" ON public.payment_bill_allocations TO authenticated USING (true) WITH CHECK (true);


--
-- Name: payment_installments Internal users can manage payment_installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage payment_installments" ON public.payment_installments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: payment_plans Internal users can manage payment_plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage payment_plans" ON public.payment_plans TO authenticated USING (true) WITH CHECK (true);


--
-- Name: payments Internal users can manage payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage payments" ON public.payments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: po_approvals Internal users can manage po_approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage po_approvals" ON public.po_approvals TO authenticated USING (true) WITH CHECK (true);


--
-- Name: po_line_items Internal users can manage po_line_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage po_line_items" ON public.po_line_items TO authenticated USING (true) WITH CHECK (true);


--
-- Name: po_versions Internal users can manage po_versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage po_versions" ON public.po_versions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: receival_items Internal users can manage receival_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage receival_items" ON public.receival_items TO authenticated USING (true) WITH CHECK (true);


--
-- Name: receivals Internal users can manage receivals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage receivals" ON public.receivals TO authenticated USING (true) WITH CHECK (true);


--
-- Name: shipments Internal users can manage shipments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage shipments" ON public.shipments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: warehouse_transfers Internal users can manage warehouse_transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage warehouse_transfers" ON public.warehouse_transfers TO authenticated USING (true) WITH CHECK (true);


--
-- Name: app_settings Internal users can read app_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can read app_settings" ON public.app_settings FOR SELECT TO authenticated USING (true);


--
-- Name: companies Internal users can read companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can read companies" ON public.companies FOR SELECT TO authenticated USING (true);


--
-- Name: company_divisions Internal users can read divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can read divisions" ON public.company_divisions FOR SELECT TO authenticated USING (true);


--
-- Name: pricing_factors Internal users can read pricing_factors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can read pricing_factors" ON public.pricing_factors FOR SELECT TO authenticated USING (true);


--
-- Name: stock_adjustments Internal users can update adjustments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can update adjustments" ON public.stock_adjustments FOR UPDATE TO authenticated USING (true);


--
-- Name: pricing_factors Internal users can update pricing_factors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can update pricing_factors" ON public.pricing_factors FOR UPDATE TO authenticated USING (true);


--
-- Name: suppliers Internal users can update suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true);


--
-- Name: warehouse_manager_log Internal users can update warehouse manager log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can update warehouse manager log" ON public.warehouse_manager_log FOR UPDATE TO authenticated USING (true);


--
-- Name: warehouses Internal users can update warehouses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can update warehouses" ON public.warehouses FOR UPDATE TO authenticated USING (true);


--
-- Name: stock_adjustments Internal users can view adjustments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can view adjustments" ON public.stock_adjustments FOR SELECT TO authenticated USING (true);


--
-- Name: suppliers Internal users can view suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can view suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);


--
-- Name: warehouse_manager_log Internal users can view warehouse manager log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can view warehouse manager log" ON public.warehouse_manager_log FOR SELECT TO authenticated USING (true);


--
-- Name: warehouses Internal users can view warehouses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can view warehouses" ON public.warehouses FOR SELECT TO authenticated USING (true);


--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: po_approval_chain_tiers allow_all_approval_chain_tiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_approval_chain_tiers ON public.po_approval_chain_tiers TO authenticated USING (true) WITH CHECK (true);


--
-- Name: po_approval_chains allow_all_approval_chains; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_approval_chains ON public.po_approval_chains TO authenticated USING (true) WITH CHECK (true);


--
-- Name: app_settings anon read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon read" ON public.app_settings FOR SELECT TO anon USING (true);


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_workflow_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_workflow_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_workflow_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_workflow_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_groups authenticated can delete credit_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated can delete credit_groups" ON public.credit_groups FOR DELETE TO authenticated USING (true);


--
-- Name: credit_groups authenticated can insert credit_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated can insert credit_groups" ON public.credit_groups FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: inventory_check_approvals authenticated can manage inventory_check_approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated can manage inventory_check_approvals" ON public.inventory_check_approvals TO authenticated USING (true) WITH CHECK (true);


--
-- Name: inventory_check_assignments authenticated can manage inventory_check_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated can manage inventory_check_assignments" ON public.inventory_check_assignments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: inventory_check_log authenticated can manage inventory_check_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated can manage inventory_check_log" ON public.inventory_check_log TO authenticated USING (true) WITH CHECK (true);


--
-- Name: receival_edit_requests authenticated can manage receival_edit_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated can manage receival_edit_requests" ON public.receival_edit_requests TO authenticated USING (true) WITH CHECK (true);


--
-- Name: stock_adjustment_approvals authenticated can manage stock_adjustment_approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated can manage stock_adjustment_approvals" ON public.stock_adjustment_approvals TO authenticated USING (true) WITH CHECK (true);


--
-- Name: credit_groups authenticated can read credit_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated can read credit_groups" ON public.credit_groups FOR SELECT TO authenticated USING (true);


--
-- Name: credit_groups authenticated can update credit_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated can update credit_groups" ON public.credit_groups FOR UPDATE TO authenticated USING (true);


--
-- Name: cogs_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cogs_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: company_divisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_divisions ENABLE ROW LEVEL SECURITY;

--
-- Name: country_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.country_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_group_payment_methods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_group_payment_methods ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_note_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_note_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: currencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_credit_group_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_credit_group_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_credit_group_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_credit_group_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_phones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_phones ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders division_scope_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete ON public.purchase_orders FOR DELETE USING (public.is_division_visible(division_id));


--
-- Name: sale_orders division_scope_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete ON public.sale_orders FOR DELETE USING (public.is_division_visible(division_id));


--
-- Name: purchase_orders division_scope_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert ON public.purchase_orders FOR INSERT WITH CHECK (public.is_division_visible(division_id));


--
-- Name: sale_orders division_scope_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert ON public.sale_orders FOR INSERT WITH CHECK (public.is_division_visible(division_id));


--
-- Name: purchase_orders division_scope_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select ON public.purchase_orders FOR SELECT USING (public.is_division_visible(division_id));


--
-- Name: sale_orders division_scope_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select ON public.sale_orders FOR SELECT USING (public.is_division_visible(division_id));


--
-- Name: purchase_orders division_scope_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update ON public.purchase_orders FOR UPDATE USING (public.is_division_visible(division_id));


--
-- Name: sale_orders division_scope_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update ON public.sale_orders FOR UPDATE USING (public.is_division_visible(division_id));


--
-- Name: document_terms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_terms ENABLE ROW LEVEL SECURITY;

--
-- Name: fifo_cost_layers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fifo_cost_layers ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_brand_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_brand_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_check_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_check_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_check_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_check_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_check_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_check_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_check_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_check_log ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_checks ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: landed_costs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landed_costs ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_config ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_trail; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_trail ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_bill_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_bill_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_installments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_installments ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_methods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: po_approval_chain_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_approval_chain_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: po_approval_chains; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_approval_chains ENABLE ROW LEVEL SECURITY;

--
-- Name: po_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: po_edit_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_edit_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: po_edit_requests po_edit_requests_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY po_edit_requests_insert ON public.po_edit_requests FOR INSERT TO authenticated WITH CHECK ((requested_by = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.auth_user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: po_edit_requests po_edit_requests_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY po_edit_requests_select ON public.po_edit_requests FOR SELECT TO authenticated USING (true);


--
-- Name: po_edit_requests po_edit_requests_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY po_edit_requests_update ON public.po_edit_requests FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.user_custom_roles ucr
     JOIN public.custom_roles cr ON ((cr.id = ucr.role_id)))
     JOIN public.profiles p ON ((p.id = ucr.profile_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cr.is_approval_slot = true) AND (cr.deleted_at IS NULL)))));


--
-- Name: po_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: po_rfq_quote_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_rfq_quote_items ENABLE ROW LEVEL SECURITY;

--
-- Name: po_rfq_quote_items po_rfq_quote_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY po_rfq_quote_items_delete ON public.po_rfq_quote_items FOR DELETE TO authenticated USING (true);


--
-- Name: po_rfq_quote_items po_rfq_quote_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY po_rfq_quote_items_insert ON public.po_rfq_quote_items FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: po_rfq_quote_items po_rfq_quote_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY po_rfq_quote_items_select ON public.po_rfq_quote_items FOR SELECT TO authenticated USING (true);


--
-- Name: po_rfq_quote_items po_rfq_quote_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY po_rfq_quote_items_update ON public.po_rfq_quote_items FOR UPDATE TO authenticated USING (true);


--
-- Name: po_rfq_quotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_rfq_quotes ENABLE ROW LEVEL SECURITY;

--
-- Name: po_rfq_quotes po_rfq_quotes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY po_rfq_quotes_delete ON public.po_rfq_quotes FOR DELETE TO authenticated USING (true);


--
-- Name: po_rfq_quotes po_rfq_quotes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY po_rfq_quotes_insert ON public.po_rfq_quotes FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: po_rfq_quotes po_rfq_quotes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY po_rfq_quotes_select ON public.po_rfq_quotes FOR SELECT TO authenticated USING (true);


--
-- Name: po_rfq_quotes po_rfq_quotes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY po_rfq_quotes_update ON public.po_rfq_quotes FOR UPDATE TO authenticated USING (true);


--
-- Name: po_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_factors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_delete_admin ON public.profiles FOR DELETE TO authenticated USING (public.has_admin_permission());


--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: profiles profiles_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_all ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING (((auth_user_id = ( SELECT auth.uid() AS uid)) OR public.has_admin_permission())) WITH CHECK (((auth_user_id = ( SELECT auth.uid() AS uid)) OR public.has_admin_permission()));


--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: reason_list_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reason_list_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: reason_lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reason_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: receival_edit_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.receival_edit_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: receival_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.receival_items ENABLE ROW LEVEL SECURITY;

--
-- Name: receivals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.receivals ENABLE ROW LEVEL SECURITY;

--
-- Name: returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_order_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_order_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_order_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_order_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: shipments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_adjustment_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_adjustment_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: user_company_divisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_company_divisions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_custom_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_ui_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_ui_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_ui_preferences user_ui_preferences_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ui_preferences_self_select ON public.user_ui_preferences FOR SELECT USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_ui_preferences user_ui_preferences_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ui_preferences_self_update ON public.user_ui_preferences FOR UPDATE USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_ui_preferences user_ui_preferences_self_upsert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ui_preferences_self_upsert ON public.user_ui_preferences FOR INSERT WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: warehouse_field_rps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_field_rps ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse_manager_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_manager_log ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse_reorder_points; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_reorder_points ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse_stock_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_stock_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse_transfer_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_transfer_items ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_workflow_steps workflow_steps_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_steps_select ON public.approval_workflow_steps FOR SELECT TO authenticated USING (true);


--
-- PostgreSQL database dump complete
--



-- ============================================================================
-- SECTION 4: VIEWS
-- ============================================================================

CREATE VIEW public.credit_group_customer_counts WITH (security_invoker='true') AS
 SELECT credit_group_id,
    (count(*))::integer AS customer_count
   FROM public.customers
  WHERE (credit_group_id IS NOT NULL)
  GROUP BY credit_group_id;

CREATE VIEW public.customer_credit_summary AS
 SELECT c.id AS customer_id,
    c.name AS customer_name,
    c.name_ar AS customer_name_ar,
    c.customer_type,
    c.is_blocked,
    c.credit_group_id,
    cg.name AS credit_group_name,
        CASE
            WHEN (c.customer_type = 'cash'::text) THEN (0)::numeric
            WHEN (cg.credit_limit IS NOT NULL) THEN cg.credit_limit
            ELSE COALESCE(c.credit_limit, (0)::numeric)
        END AS credit_limit,
    public.customer_credit_used(c.id, NULL::uuid) AS credit_used,
    GREATEST((
        CASE
            WHEN (c.customer_type = 'cash'::text) THEN (0)::numeric
            WHEN (cg.credit_limit IS NOT NULL) THEN cg.credit_limit
            ELSE COALESCE(c.credit_limit, (0)::numeric)
        END - public.customer_credit_used(c.id, NULL::uuid)), (0)::numeric) AS credit_available,
        CASE
            WHEN (COALESCE(
            CASE
                WHEN (c.customer_type = 'cash'::text) THEN (0)::numeric
                WHEN (cg.credit_limit IS NOT NULL) THEN cg.credit_limit
                ELSE COALESCE(c.credit_limit, (0)::numeric)
            END, (0)::numeric) = (0)::numeric) THEN NULL::numeric
            ELSE LEAST(round(((public.customer_credit_used(c.id, NULL::uuid) / NULLIF(
            CASE
                WHEN (c.customer_type = 'cash'::text) THEN (0)::numeric
                WHEN (cg.credit_limit IS NOT NULL) THEN cg.credit_limit
                ELSE COALESCE(c.credit_limit, (0)::numeric)
            END, (0)::numeric)) * (100)::numeric), 1), (100)::numeric)
        END AS credit_utilization_pct
   FROM (public.customers c
     LEFT JOIN public.credit_groups cg ON ((cg.id = c.credit_group_id)));

CREATE VIEW public.customer_invoices WITH (security_invoker='true') AS
 SELECT id,
    invoice_id,
    customer_id,
    source,
    source_id,
    source_label,
    issued_date,
    due_date,
    status,
    subtotal,
    tax,
    total_amount,
    paid_amount,
    agent_name,
    division,
    notes,
    qb_synced,
    created_at,
    updated_at,
    direction,
    supplier_id,
    purchase_order_id,
    receival_id,
    sale_order_id,
    sale_delivery_id,
    needs_refresh,
    doc_status,
    payment_status,
    invoice_type,
    discount_amount,
    discount_label,
    manually_paid
   FROM public.invoices
  WHERE (direction = 'ar'::text);

CREATE VIEW public.customers_with_multi_phones WITH (security_invoker='true') AS
 SELECT customer_id
   FROM public.customer_phones
  GROUP BY customer_id
 HAVING (count(*) > 1);

CREATE VIEW public.supplier_bills WITH (security_invoker='true') AS
 SELECT id,
    invoice_id,
    customer_id,
    source,
    source_id,
    source_label,
    issued_date,
    due_date,
    status,
    subtotal,
    tax,
    total_amount,
    paid_amount,
    agent_name,
    division,
    notes,
    qb_synced,
    created_at,
    updated_at,
    direction,
    supplier_id,
    purchase_order_id,
    receival_id,
    sale_order_id,
    sale_delivery_id,
    needs_refresh,
    doc_status,
    payment_status,
    invoice_type,
    discount_amount,
    discount_label,
    manually_paid
   FROM public.invoices
  WHERE (direction = 'ap'::text);

CREATE VIEW public.warehouse_stock_view WITH (security_invoker='true') AS
 SELECT f.warehouse_id,
    f.brand_variant_id,
    ii.name_en AS item_name,
    ibv.brand,
    ii.sku,
    ii.unit,
    (sum(f.remaining_qty))::integer AS qty,
        CASE
            WHEN (sum(f.remaining_qty) > 0) THEN (sum(((f.remaining_qty)::numeric * f.total_unit_cost)) / (sum(f.remaining_qty))::numeric)
            ELSE (0)::numeric
        END AS avg_cost,
    sum(((f.remaining_qty)::numeric * f.total_unit_cost)) AS total_value,
    COALESCE(ic_parent.name_en, ic.name_en) AS category_name,
        CASE
            WHEN (ic_parent.id IS NOT NULL) THEN ic.name_en
            ELSE NULL::text
        END AS subcategory_name,
    (COALESCE(ic.type, ic_parent.type))::text AS item_type,
    COALESCE(wsa.allocated_qty, 0) AS allocated_qty,
    GREATEST(((sum(f.remaining_qty))::integer - COALESCE(wsa.allocated_qty, 0)), 0) AS available_qty
   FROM (((((public.fifo_cost_layers f
     JOIN public.inventory_brand_variants ibv ON ((ibv.id = f.brand_variant_id)))
     JOIN public.inventory_items ii ON ((ii.id = ibv.item_id)))
     LEFT JOIN public.inventory_categories ic ON ((ic.id = ii.category_id)))
     LEFT JOIN public.inventory_categories ic_parent ON ((ic_parent.id = ic.parent_id)))
     LEFT JOIN public.warehouse_stock_allocations wsa ON (((wsa.warehouse_id = f.warehouse_id) AND (wsa.brand_variant_id = f.brand_variant_id))))
  WHERE ((f.remaining_qty > 0) AND (f.warehouse_id IS NOT NULL))
  GROUP BY f.warehouse_id, f.brand_variant_id, ic_parent.id, ic_parent.name_en, ic.name_en, ic.type, ic_parent.type, ii.name_en, ibv.brand, ii.sku, ii.unit, wsa.allocated_qty;


-- ============================================================================
-- SECTION 5: ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_workflow_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cogs_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_group_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_note_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credit_group_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credit_group_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fifo_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_brand_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_check_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_check_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_check_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_check_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landed_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_bill_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_approval_chain_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_approval_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_edit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rfq_quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rfq_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reason_list_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reason_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receival_edit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receival_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_order_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_company_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ui_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_field_rps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_manager_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_reorder_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- RLS Policies



























































-- Deferred FK: notifications → profiles
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
