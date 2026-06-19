-- ============================================================================
-- BASELINE SCHEMA  -  generated from production
-- ============================================================================
-- This file captures the full production schema as it exists today:
--   • 144 tables   • 270 foreign keys  • 246 RLS policies  • 144 RLS enabled
--   • 123 functions/RPCs  • 47 triggers  • 162 indexes  •  52 enum types
--
-- The 345 prior incremental migrations were squashed into this single file
-- because several of them referenced objects created via manual SQL outside
-- the migration system, making a fresh `supabase db push` impossible.
--
-- Historical migrations are preserved in supabase/migrations_archive/ for
-- reference but are no longer applied. Any NEW schema change must be a new
-- migration file dated AFTER this baseline (i.e. 20260619xxxxxx_<name>.sql).
--
-- To recreate prod's schema on any empty Supabase project:
--   npx supabase db push
-- That's it. This file applies cleanly with zero errors.
-- ============================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: address_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.address_type AS ENUM (
    'blue-plate',
    'google-coords'
);


--
-- Name: approval_source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.approval_source_type AS ENUM (
    'sale_order',
    'order'
);


--
-- Name: approval_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.approval_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: approval_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.approval_type AS ENUM (
    'margin',
    'credit'
);


--
-- Name: campaign_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_status AS ENUM (
    'active',
    'scheduled',
    'expired',
    'disabled'
);


--
-- Name: confirmation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.confirmation_status AS ENUM (
    'not_sent',
    'sent',
    'confirmed',
    'no_response',
    'manually_confirmed'
);


--
-- Name: contract_status; Type: TYPE; Schema: public; Owner: -
--

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


--
-- Name: contract_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contract_type AS ENUM (
    'preventive',
    'area',
    'general'
);


--
-- Name: credit_note_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.credit_note_status AS ENUM (
    'draft',
    'approved',
    'issued',
    'redeemed'
);


--
-- Name: division; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.division AS ENUM (
    'maintenance',
    'cleaning',
    'kitchen',
    'pest-control'
);


--
-- Name: employee_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.employee_status AS ENUM (
    'active',
    'vacation',
    'archived',
    'unassigned',
    'on-task'
);


--
-- Name: follow_up_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.follow_up_request_status AS ENUM (
    'pending',
    'confirmed',
    'cancelled',
    'rejected'
);


--
-- Name: instruction_content_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.instruction_content_type AS ENUM (
    'text',
    'pdf'
);


--
-- Name: instruction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.instruction_type AS ENUM (
    'pre-service',
    'post-service'
);


--
-- Name: inventory_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_type AS ENUM (
    'products',
    'spare-parts',
    'consumables',
    'tools'
);


--
-- Name: invoice_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_source AS ENUM (
    'order',
    'contract',
    'quotation'
);


--
-- Name: invoice_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_status AS ENUM (
    'draft',
    'sent',
    'partially_paid',
    'paid',
    'overdue',
    'cancelled',
    'void'
);


--
-- Name: message_source; Type: TYPE; Schema: public; Owner: -
--

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


--
-- Name: notification_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_category AS ENUM (
    'order',
    'contract',
    'invoice',
    'payment',
    'system',
    'reminder'
);


--
-- Name: notification_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_channel AS ENUM (
    'whatsapp',
    'sms',
    'email',
    'push'
);


--
-- Name: notification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_status AS ENUM (
    'sent',
    'failed',
    'pending',
    'delivered'
);


--
-- Name: notification_trigger; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_trigger AS ENUM (
    'manual',
    'scheduled',
    'event',
    'reminder'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

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


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'online',
    'pay_later',
    'fawran',
    'online_transfer',
    'cheque',
    'bank_transfer',
    'cash',
    'pos'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'completed',
    'pending',
    'failed',
    'refunded',
    'processing'
);


--
-- Name: po_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.po_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'partially_received',
    'received',
    'completed',
    'cancelled'
);


--
-- Name: po_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.po_type AS ENUM (
    'rfq',
    'draft',
    'confirmed'
);


--
-- Name: promotion_rule_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.promotion_rule_type AS ENUM (
    'percentage',
    'fixed',
    'buy_one_get_one',
    'buy_x_get_y',
    'buy_x_discount_get_y'
);


--
-- Name: qc_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.qc_priority AS ENUM (
    'high',
    'medium',
    'low'
);


--
-- Name: qc_schedule_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.qc_schedule_status AS ENUM (
    'pending',
    'in-progress',
    'completed',
    'missed'
);


--
-- Name: quotation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.quotation_status AS ENUM (
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


--
-- Name: receival_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.receival_status AS ENUM (
    'pending_approval',
    'approved',
    'rejected'
);


--
-- Name: reminder_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reminder_channel AS ENUM (
    'Email',
    'SMS',
    'WhatsApp'
);


--
-- Name: return_source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.return_source_type AS ENUM (
    'sale_order',
    'order',
    'purchase_order'
);


--
-- Name: return_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.return_status AS ENUM (
    'pending',
    'received',
    'restocked',
    'closed',
    'dispatched',
    'supplier_confirmed',
    'cancelled'
);


--
-- Name: rfq_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rfq_status AS ENUM (
    'draft',
    'sent',
    'received',
    'cancelled'
);


--
-- Name: sale_delivery_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sale_delivery_status AS ENUM (
    'pending',
    'in_progress',
    'delivered',
    'cancelled'
);


--
-- Name: sale_order_status; Type: TYPE; Schema: public; Owner: -
--

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


--
-- Name: service_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_category AS ENUM (
    'Repair',
    'Installation',
    'Maintenance',
    'Cleaning',
    'Quick Service'
);


--
-- Name: service_change_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_change_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: service_change_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_change_type AS ENUM (
    'add',
    'edit',
    'delete'
);


--
-- Name: service_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_status AS ENUM (
    'active',
    'inactive'
);


--
-- Name: service_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_type AS ENUM (
    'standard',
    'configurable'
);


--
-- Name: shipment_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.shipment_mode AS ENUM (
    'air',
    'sea',
    'land',
    'manual'
);


--
-- Name: shipment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.shipment_status AS ENUM (
    'booked',
    'in_transit',
    'customs',
    'delivered',
    'delayed'
);


--
-- Name: team_tag; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.team_tag AS ENUM (
    'normal',
    'emergency',
    'qc',
    'site-visit'
);


--
-- Name: tl_order_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tl_order_type AS ENUM (
    'order',
    'site-visit-single',
    'site-visit-contract',
    'contract',
    'backwork',
    'follow-up',
    'qc'
);


--
-- Name: tool_condition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tool_condition AS ENUM (
    'New',
    'Good',
    'Fair',
    'Maintenance'
);


--
-- Name: tool_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tool_status AS ENUM (
    'available',
    'assigned',
    'maintenance',
    'retired'
);


--
-- Name: transfer_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transfer_status AS ENUM (
    'pending',
    'in_transit',
    'pending_approval',
    'approved',
    'rejected',
    'received',
    'cancelled'
);


--
-- Name: user_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_type AS ENUM (
    'internal',
    'customer',
    'employee',
    'team-leader'
);


--
-- Name: voucher_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.voucher_type AS ENUM (
    'single_use',
    'multi_use',
    'limited'
);


--
-- Name: _set_lc_number(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: _user_has_permission(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: action_stock_adjustment_step(uuid, text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: add_workflow_step(text, text, text, boolean, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_workflow_step(p_workflow text, p_role_name text, p_role_desc text DEFAULT ''::text, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role_id  UUID;
  v_max_order INT;
  v_step_key TEXT;
  v_step     workflow_approval_steps;
BEGIN
  IF p_workflow NOT IN ('po','inv_check','stock_adj') THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;
  IF TRIM(p_role_name) = '' THEN
    RAISE EXCEPTION 'Role name cannot be empty';
  END IF;

  -- Check if role already exists
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

  -- Derive step_key: lowercase, spaces to underscores
  v_step_key := LOWER(REGEXP_REPLACE(TRIM(p_role_name), '\s+', '_', 'g'));

  -- Next step_order
  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM workflow_approval_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO workflow_approval_steps (
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


--
-- Name: add_workflow_step_for_role(text, uuid, boolean, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_workflow_step_for_role(p_workflow text, p_role_id uuid, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role_name TEXT;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      workflow_approval_steps;
BEGIN
  IF p_workflow NOT IN ('po','inv_check','stock_adj') THEN
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

  -- Prevent duplicate role in same workflow (active or inactive, not archived)
  IF EXISTS (
    SELECT 1 FROM workflow_approval_steps
    WHERE workflow = p_workflow
      AND role_id  = p_role_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This role is already a step in the % workflow', p_workflow;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(v_role_name), '\s+', '_', 'g'));

  -- Ensure step_key uniqueness within the workflow
  IF EXISTS (
    SELECT 1 FROM workflow_approval_steps
    WHERE workflow = p_workflow AND step_key = v_step_key
  ) THEN
    v_step_key := v_step_key || '_' || substr(gen_random_uuid()::text, 1, 6);
  END IF;

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM workflow_approval_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO workflow_approval_steps (
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


--
-- Name: advance_po_approval_tier(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: allocate_landed_cost(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: allocate_payment_to_bill(uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

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

  -- Skip status recalculation if user manually set the status
  IF v_manually_paid THEN
    RETURN;
  END IF;

  -- Recalculate bill payment_status from allocations
  SELECT COALESCE(SUM(pba.amount), 0)
    INTO v_total_paid
    FROM payment_bill_allocations pba
   WHERE pba.bill_id = p_bill_id;

  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'
    WHEN v_total_paid > 0             THEN 'partially_paid'
    ELSE                                   'unpaid'
  END;

  UPDATE invoices SET payment_status = v_new_status WHERE id = p_bill_id;
END;
$$;


--
-- Name: allocate_warehouse_stock(uuid, uuid, integer, numeric); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: append_shipment_events(uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.append_shipment_events(p_shipment_id uuid, p_events jsonb, p_status_map jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_current_status  TEXT;
  v_current_weight  NUMERIC;
  v_max_new_weight  NUMERIC   := 0;
  v_best_new_status TEXT      := NULL;
  v_existing_events JSONB;
  v_events_to_add   JSONB     := '[]'::JSONB;
  v_updated_events  JSONB;
  v_event           JSONB;
  v_existing_evt    JSONB;
  v_hash            TEXT;
  v_ts              TEXT;
  v_loc             TEXT;
  v_status          TEXT;
  v_new_weight      NUMERIC;
  v_match_found     BOOLEAN;
  v_supersede_idx   INT;
  i                 INT;
  j                 INT;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'p_events must be a non-null JSON array';
  END IF;
  IF p_status_map IS NULL OR jsonb_typeof(p_status_map) <> 'object' THEN
    RAISE EXCEPTION 'p_status_map must be a non-null JSON object';
  END IF;

  SELECT status, events
  INTO v_current_status, v_existing_events
  FROM shipments
  WHERE id = p_shipment_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_existing_events IS NULL THEN v_existing_events := '[]'::JSONB; END IF;

  v_current_weight := COALESCE((p_status_map->>v_current_status)::NUMERIC, 0);

  FOR i IN 0 .. jsonb_array_length(p_events) - 1 LOOP
    v_event         := p_events->i;
    v_hash          := v_event->>'hash';
    v_ts            := v_event->>'normalizedTimestamp';
    v_loc           := v_event->>'location';
    v_status        := v_event->>'status';
    v_match_found   := FALSE;
    v_supersede_idx := -1;

    FOR j IN 0 .. jsonb_array_length(v_existing_events) - 1 LOOP
      v_existing_evt := v_existing_events->j;
      IF NULLIF(v_existing_evt->>'normalizedTimestamp', '')::TIMESTAMPTZ
         = NULLIF(v_ts, '')::TIMESTAMPTZ
         AND v_existing_evt->>'location' = v_loc THEN
        IF v_existing_evt->>'hash' = v_hash THEN
          v_match_found := TRUE;
          EXIT;
        ELSE
          v_supersede_idx := j;
          EXIT;
        END IF;
      END IF;
    END LOOP;

    IF v_match_found THEN CONTINUE; END IF;

    IF v_supersede_idx >= 0 THEN
      v_updated_events := '[]'::JSONB;
      FOR j IN 0 .. jsonb_array_length(v_existing_events) - 1 LOOP
        IF j = v_supersede_idx THEN
          v_updated_events := v_updated_events || jsonb_build_array(v_event);
        ELSE
          v_updated_events := v_updated_events || jsonb_build_array(v_existing_events->j);
        END IF;
      END LOOP;
      v_existing_events := v_updated_events;
    ELSE
      v_events_to_add := v_events_to_add || jsonb_build_array(v_event);
    END IF;

    IF v_status IS NOT NULL AND p_status_map ? v_status THEN
      v_new_weight := (p_status_map->>v_status)::NUMERIC;
      IF v_new_weight > v_max_new_weight THEN
        v_max_new_weight  := v_new_weight;
        v_best_new_status := v_status;
      END IF;
    END IF;
  END LOOP;

  UPDATE shipments
  SET
    events         = v_existing_events || v_events_to_add,
    is_syncing     = false,
    sync_error     = NULL,
    status         = CASE
                       WHEN v_best_new_status IS NOT NULL
                            AND v_max_new_weight > v_current_weight
                            AND v_best_new_status IN ('booked','in_transit','customs','delayed','delivered')
                       THEN v_best_new_status::shipment_status
                       ELSE status
                     END,
    updated_at     = NOW(),
    last_synced_at = NOW()
  WHERE id = p_shipment_id;
END;
$$;


--
-- Name: apply_inventory_check_adjustments(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: apply_receival_edit(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

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
        SELECT v_bv_id, ibv.item_name, ibv.sku,
               'receival_edit', v_delta, v_old_cost,
               'receival_edit_request', p_edit_request_id,
               'Qty increase edit on receival ' || v_req.receival_id
        FROM inventory_brand_variants ibv WHERE ibv.id = v_bv_id;

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

        -- ATP guard: new stock_level must not fall below reserved_qty.
        -- Lock this row now (before any mutation) to prevent a TOCTOU race
        -- against concurrent update_reserved_qty calls.
        -- Lock ordering: fifo_cost_layers locked above → inventory_brand_variants
        -- locked here — consistent with approve_receival_inventory convention.
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
        SELECT v_bv_id, ibv.item_name, ibv.sku,
               'receival_edit', -ABS(v_delta), v_old_cost,
               'receival_edit_request', p_edit_request_id,
               'Qty decrease edit on receival ' || v_req.receival_id
        FROM inventory_brand_variants ibv WHERE ibv.id = v_bv_id;
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

  UPDATE receival_edit_requests SET status = 'completed' WHERE id = p_edit_request_id;

  RETURN jsonb_build_object('ok', true, 'edit_request_id', p_edit_request_id);
END;
$$;


--
-- Name: approve_receival_inventory(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: approve_service_change(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_service_change(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_profile_id    UUID;
  v_req           RECORD;
  v_live          RECORD;
  v_key           TEXT;
  v_old_val       TEXT;
  v_live_val      TEXT;
  v_new_service_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  IF NOT _user_has_permission(v_profile_id, 'master_data.services.approve') THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.approve required';
  END IF;

  SELECT * INTO v_req FROM service_change_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change request not found'; END IF;
  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (status: %)', v_req.status;
  END IF;

  CASE v_req.change_type
    WHEN 'edit' THEN
      SELECT * INTO v_live FROM services WHERE id = v_req.service_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Service no longer exists'; END IF;

      FOR v_key IN SELECT jsonb_object_keys(v_req.changes) LOOP
        v_old_val := v_req.changes->v_key->>'old';
        EXECUTE format('SELECT ($1.%I)::TEXT', v_key) INTO v_live_val USING v_live;
        IF v_old_val IS DISTINCT FROM v_live_val THEN
          RAISE EXCEPTION 'Stale data: "%" has changed since this request was submitted (expected "%" but found "%"). Reject this request and ask for a new one.',
            v_key, v_old_val, v_live_val;
        END IF;
      END LOOP;

      UPDATE services SET
        name_en           = CASE WHEN v_req.changes ? 'name_en'           THEN v_req.changes->'name_en'->>'new'                   ELSE name_en           END,
        name_ar           = CASE WHEN v_req.changes ? 'name_ar'           THEN v_req.changes->'name_ar'->>'new'                   ELSE name_ar           END,
        code              = CASE WHEN v_req.changes ? 'code'              THEN v_req.changes->'code'->>'new'                      ELSE code              END,
        price             = CASE WHEN v_req.changes ? 'price'             THEN (v_req.changes->'price'->>'new')::NUMERIC           ELSE price             END,
        emergency_price   = CASE WHEN v_req.changes ? 'emergency_price'   THEN (v_req.changes->'emergency_price'->>'new')::NUMERIC ELSE emergency_price   END,
        discount          = CASE WHEN v_req.changes ? 'discount'          THEN (v_req.changes->'discount'->>'new')::NUMERIC        ELSE discount          END,
        duration          = CASE WHEN v_req.changes ? 'duration'          THEN (v_req.changes->'duration'->>'new')::INT            ELSE duration          END,
        warranty          = CASE WHEN v_req.changes ? 'warranty'          THEN (v_req.changes->'warranty'->>'new')::INT            ELSE warranty          END,
        status            = CASE WHEN v_req.changes ? 'status'            THEN (v_req.changes->'status'->>'new')::service_status   ELSE status            END,
        item_kind         = CASE WHEN v_req.changes ? 'item_kind'         THEN v_req.changes->'item_kind'->>'new'                  ELSE item_kind         END,
        pricing_mode      = CASE WHEN v_req.changes ? 'pricing_mode'      THEN v_req.changes->'pricing_mode'->>'new'               ELSE pricing_mode      END,
        discount_scope    = CASE WHEN v_req.changes ? 'discount_scope'    THEN v_req.changes->'discount_scope'->>'new'             ELSE discount_scope    END,
        invoice_text_en   = CASE WHEN v_req.changes ? 'invoice_text_en'   THEN v_req.changes->'invoice_text_en'->>'new'            ELSE invoice_text_en   END,
        invoice_text_ar   = CASE WHEN v_req.changes ? 'invoice_text_ar'   THEN v_req.changes->'invoice_text_ar'->>'new'            ELSE invoice_text_ar   END,
        catalog_image_url = CASE WHEN v_req.changes ? 'catalog_image_url' THEN v_req.changes->'catalog_image_url'->>'new'          ELSE catalog_image_url END,
        updated_at        = now()
      WHERE id = v_req.service_id;

    WHEN 'add' THEN
      v_new_service_id := gen_random_uuid();
      BEGIN
        INSERT INTO services (
          id, parent_id, tree_type, sort_order, division,
          name_en, name_ar, code,
          price, emergency_price, duration, warranty,
          status, category, service_type, contract_type,
          item_kind, pricing_mode, discount_scope,
          invoice_text_en, invoice_text_ar, photo_requirement
        ) VALUES (
          v_new_service_id,
          (v_req.changes->'parent_id'->>'new')::UUID,
          v_req.changes->'tree_type'->>'new',
          0,
          v_req.division,
          v_req.changes->'name_en'->>'new',
          v_req.changes->'name_ar'->>'new',
          v_req.changes->'code'->>'new',
          (v_req.changes->'price'->>'new')::NUMERIC,
          (v_req.changes->'emergency_price'->>'new')::NUMERIC,
          (v_req.changes->'duration'->>'new')::INT,
          (v_req.changes->'warranty'->>'new')::INT,
          COALESCE(v_req.changes->'status'->>'new', 'active')::service_status,
          CASE WHEN v_req.changes ? 'category' AND v_req.changes->'category'->>'new' IS NOT NULL
               THEN (v_req.changes->'category'->>'new')::service_category
               ELSE NULL END,
          CASE WHEN v_req.changes ? 'service_type' AND v_req.changes->'service_type'->>'new' IS NOT NULL
               THEN (v_req.changes->'service_type'->>'new')::service_type
               ELSE NULL END,
          CASE WHEN v_req.changes ? 'contract_type' AND v_req.changes->'contract_type'->>'new' IS NOT NULL
               THEN (v_req.changes->'contract_type'->>'new')::contract_type
               ELSE NULL END,
          v_req.changes->'item_kind'->>'new',
          v_req.changes->'pricing_mode'->>'new',
          v_req.changes->'discount_scope'->>'new',
          v_req.changes->'invoice_text_en'->>'new',
          v_req.changes->'invoice_text_ar'->>'new',
          v_req.changes->'photo_requirement'->>'new'
        );
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'A service with this name already exists in this division. Reject this request instead.';
      END;
      UPDATE service_change_requests SET service_id = v_new_service_id WHERE id = p_request_id;

    WHEN 'delete' THEN
      IF EXISTS (
        SELECT 1 FROM order_services os
        JOIN orders o ON o.id = os.order_id
        WHERE os.service_id = v_req.service_id
          AND o.status NOT IN ('completed', 'cancelled')
          AND o.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Cannot delete: service has active orders. Reject this request instead.';
      END IF;
      UPDATE services
      SET deleted_at = now(), status = 'inactive'::service_status, updated_at = now()
      WHERE id = v_req.service_id;

  END CASE;

  UPDATE service_change_requests
  SET status = 'approved', reviewed_by = v_profile_id, reviewed_at = now(), updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'service_id', COALESCE(v_new_service_id, v_req.service_id));
END;
$_$;


--
-- Name: approve_stock_adjustment_inventory(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: approve_warehouse_transfer_inventory(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: archive_workflow_step(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

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

  UPDATE workflow_approval_steps
  SET archived_at = now(), archived_by = p_profile_id
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;


--
-- Name: assign_team_leader(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_team_leader(p_team_id uuid, p_employee_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE employees SET team_id = p_team_id, status = 'active'
  WHERE id = p_employee_id;

  UPDATE teams SET leader_id = p_employee_id WHERE id = p_team_id;

  INSERT INTO team_activity_log (action, entity_type, entity_id, after_data)
  VALUES (
    'leader-assigned', 'team', p_team_id,
    jsonb_build_object('leader_id', p_employee_id)
  );
END;
$$;


--
-- Name: attach_payment_to_bill(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: attach_payment_to_invoice(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: auto_reject_pending_on_service_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_reject_pending_on_service_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE service_change_requests
    SET status = 'rejected',
        rejection_reason = 'Service was deleted',
        reviewed_at = now(),
        updated_at = now()
    WHERE service_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: backfill_conversation_last_messages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.backfill_conversation_last_messages() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE chat_conversations cc
  SET
    last_message    = sub.last_msg,
    last_message_at = GREATEST(
      COALESCE(cc.last_message_at, '1970-01-01'::timestamptz),
      sub.created_at
    )
  FROM (
    SELECT
      cc2.id AS conversation_id,
      COALESCE(NULLIF(m.text, ''), '[message]') AS last_msg,
      m.created_at
    FROM chat_conversations cc2
    CROSS JOIN LATERAL (
      SELECT text, created_at
      FROM chat_messages
      WHERE conversation_id = cc2.id
        AND message_kind = 'message'
      ORDER BY created_at DESC
      LIMIT 1
    ) m
    WHERE cc2.last_message IS NULL OR cc2.last_message = ''
  ) sub
  WHERE cc.id = sub.conversation_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;


--
-- Name: batch_increment_received_qty(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: batch_update_reserved_qty(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: batch_update_variant_prices(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: build_inv_check_approval_chain(boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

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
    FROM workflow_approval_steps
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
    FROM   workflow_approval_steps
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


--
-- Name: cancel_delivery_inventory(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: cancel_transfer(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: check_is_division_manager(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_is_division_manager(p_profile_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(is_division_manager, false) FROM public.profiles WHERE id = p_profile_id;
$$;


--
-- Name: check_low_stock_and_notify(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: claim_media_jobs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_media_jobs(p_limit integer) RETURNS TABLE(id uuid, message_id uuid, attachment_index integer, attempts integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with claimed as (
    select j.id
      from public.media_download_jobs j
     where j.status = 'queued'
       and j.scheduled_for <= now()
     order by j.scheduled_for asc
     limit p_limit
     for update skip locked
  )
  update public.media_download_jobs j
     set status     = 'in_progress',
         claimed_at = now(),
         attempts   = j.attempts
    from claimed
   where j.id = claimed.id
  returning j.id, j.message_id, j.attachment_index, j.attempts;
$$;


--
-- Name: complete_delivery_inventory(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

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
END;
$$;


--
-- Name: compute_warranty_expires_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_warranty_expires_at() RETURNS trigger
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  IF NEW.warranty_months > 0 THEN
    NEW.warranty_expires_at := NEW.installed_at + (NEW.warranty_months || ' months')::interval;
  ELSE
    NEW.warranty_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: create_and_approve_receival(uuid, uuid, date, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: create_and_confirm_delivery(uuid, uuid, text, date, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: create_customer_with_phone(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: create_landed_cost(text, date, text, jsonb, uuid[], uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: create_order_with_dates(text, uuid, text, text, text, date, numeric, text, text, text, jsonb, jsonb, jsonb, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_order_with_dates(p_order_id text, p_service_customer_id uuid, p_type text, p_division text, p_status text, p_scheduled_date date, p_total_amount numeric, p_address text, p_notes text, p_arrival_phone text, p_attachments jsonb, p_services jsonb, p_visit_dates jsonb, p_assignments jsonb, p_address_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_order_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO public.orders (
    order_id, service_customer_id, type, division, status, confirmation_status,
    scheduled_date, total_amount, address, address_id, notes, has_invoice,
    arrival_phone, attachments
  ) VALUES (
    p_order_id,
    p_service_customer_id,
    p_type,
    NULLIF(p_division, ''),
    p_status::order_status,
    'not_sent'::confirmation_status,
    p_scheduled_date,
    p_total_amount,
    NULLIF(p_address, ''),
    p_address_id,
    NULLIF(p_notes, ''),
    false,
    NULLIF(p_arrival_phone, ''),
    p_attachments
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb)) LOOP
    INSERT INTO public.order_services (
      order_id, service_id, name, qty, price, duration, path, configuration, from_time, to_time
    ) VALUES (
      v_order_id,
      NULLIF(v_item->>'service_id', '')::uuid,
      v_item->>'name',
      (v_item->>'qty')::int,
      (v_item->>'price')::numeric,
      (v_item->>'duration')::int,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'path', '[]'::jsonb))),
      CASE WHEN v_item->'configuration' IS NULL OR v_item->>'configuration' = 'null'
           THEN NULL ELSE v_item->'configuration' END,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_visit_dates, '[]'::jsonb)) LOOP
    INSERT INTO public.order_visit_dates (order_id, visit_date, from_time, to_time, sort_order)
    VALUES (
      v_order_id,
      (v_item->>'visit_date')::date,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time,
      COALESCE((v_item->>'sort_order')::smallint, 0)
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    -- Block when a pending follow-up request already reserves the same
    -- team+date+window. The assignment window is [time_slot, time_slot + duration h).
    IF EXISTS (
      SELECT 1
      FROM public.follow_up_requests fur
      WHERE fur.status = 'pending'
        AND fur.requested_team_id   = (v_item->>'team_id')::uuid
        AND fur.requested_date      = (v_item->>'scheduled_date')::date
        AND fur.requested_time_from IS NOT NULL
        AND fur.requested_time_to   IS NOT NULL
        AND (v_item->>'time_slot')::time
              < fur.requested_time_to
        AND fur.requested_time_from
              < ((v_item->>'time_slot')::time
                 + ((v_item->>'duration')::int * interval '1 hour'))
    ) THEN
      RAISE EXCEPTION 'slot_conflict: A customer follow-up request reserves that slot for the team on %', v_item->>'scheduled_date'
        USING ERRCODE = 'P0001';
    END IF;

    BEGIN
      INSERT INTO public.order_team_assignments (
        order_id, team_id, services, scheduled_date, time_slot, duration
      ) VALUES (
        v_order_id,
        (v_item->>'team_id')::uuid,
        COALESCE(v_item->'services', '[]'::jsonb),
        (v_item->>'scheduled_date')::date,
        v_item->>'time_slot',
        v_item->>'duration'
      );
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'slot_conflict: Team is already booked for that time slot on %', v_item->>'scheduled_date'
          USING ERRCODE = 'P0001';
    END;
  END LOOP;

  RETURN v_order_id;
END;
$$;


--
-- Name: create_sale_order(uuid, text, text, numeric, date, text, text, jsonb, text, text, text, integer, numeric, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_sale_order(p_customer_id uuid, p_intent text, p_currency text, p_exchange_rate numeric, p_expected_delivery date, p_payment_terms text, p_payment_terms_notes text, p_payment_milestones jsonb, p_delivery_terms text, p_delivery_terms_notes text, p_customer_notes text, p_validity_days integer, p_discount_amount numeric, p_discount_label text, p_discount_type text, p_line_items jsonb) RETURNS jsonb
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
BEGIN
  -- Serialize per-customer SO creation to prevent duplicate SO numbers.
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_customer_id::text), 1, 15))::bit(60)::bigint
  );

  -- Resolve the profile row (profiles.id ≠ auth.uid()).
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();

  SELECT COUNT(*) + 1 INTO v_count FROM sale_orders;
  v_so_number := 'SO-' || LPAD(v_count::text, 5, '0');

  -- Sum line item totals.
  SELECT COALESCE(SUM((item->>'total')::NUMERIC), 0)
  INTO   v_subtotal
  FROM   jsonb_array_elements(p_line_items) AS item;

  v_discount_resolved := CASE p_discount_type
    WHEN 'percentage' THEN (v_subtotal * p_discount_amount) / 100
    ELSE p_discount_amount
  END;
  v_total     := v_subtotal - v_discount_resolved;
  v_total_qar := v_total * p_exchange_rate;

  -- LEFT JOIN so cash customers (no credit group) don't raise NOT FOUND.
  SELECT c.customer_type, cg.credit_limit, cg.name
  INTO   v_customer_type, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  -- ── Cash branch ──────────────────────────────────────────────────────────
  -- Cash customers bypass the credit check entirely. They can never be put
  -- into pending_approval. NULL customer_type with no credit group is also
  -- treated as cash for backward compatibility.
  IF COALESCE(v_customer_type, 'credit') = 'cash' THEN
    v_so_status  := CASE
      WHEN p_intent = 'confirm' THEN 'confirmed'::sale_order_status
      ELSE                           'quotation'::sale_order_status
    END;
    v_credit_limit := 0;
    v_group_name   := 'Cash';
    v_open_total   := 0;
    v_available    := 0;

  -- ── Credit branch ────────────────────────────────────────────────────────
  ELSE
    -- Credit customers must have a credit group assigned.
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

    v_so_status := CASE
      WHEN v_total_qar > v_available THEN 'pending_approval'::sale_order_status
      WHEN p_intent = 'confirm'      THEN 'confirmed'::sale_order_status
      ELSE                                'quotation'::sale_order_status
    END;
  END IF;

  -- Insert the sale order.
  INSERT INTO sale_orders (
    so_number, customer_id, status,
    subtotal, tax, total,
    discount_amount, discount_label, discount_type, discount_amount_resolved,
    currency, exchange_rate, expected_delivery,
    payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes,
    customer_notes, validity_days,
    created_by
  )
  VALUES (
    v_so_number, p_customer_id, v_so_status,
    v_subtotal, 0, v_total,
    p_discount_amount, p_discount_label, p_discount_type, v_discount_resolved,
    p_currency, p_exchange_rate, p_expected_delivery,
    p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes,
    p_customer_notes, p_validity_days,
    v_profile_id
  )
  RETURNING id INTO v_so_id;

  -- Insert line items.
  INSERT INTO sale_order_lines (
    sale_order_id, item_name, sku, qty, unit,
    unit_price, total, line_type,
    brand_variant_id, tool_asset_item_id, avg_cost,
    created_by
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

  -- Reserve stock for confirmed orders (cash or credit).
  PERFORM batch_update_reserved_qty(
    (SELECT jsonb_agg(
       jsonb_build_object(
         'bv_id', (item->>'brand_variant_id')::UUID,
         'delta', (item->>'qty')::INTEGER
       ))
     FROM   jsonb_array_elements(p_line_items) AS item
     WHERE  (item->>'brand_variant_id') IS NOT NULL
       AND  (item->>'brand_variant_id') NOT IN ('', 'null')
       AND  (item->>'qty')::INTEGER > 0)
  );

  RETURN jsonb_build_object(
    'so_id',        v_so_id,
    'so_number',    v_so_number,
    'status',       v_so_status,
    'credit_limit', v_credit_limit,
    'group_name',   v_group_name,
    'open_total',   v_open_total,
    'available',    GREATEST(v_available, 0)
  );
END;
$$;


--
-- Name: create_sale_order(uuid, text, text, numeric, date, text, text, jsonb, text, text, text, integer, numeric, text, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

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
BEGIN
  -- Serialize per-customer SO creation to prevent duplicate SO numbers.
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_customer_id::text), 1, 15))::bit(60)::bigint
  );

  -- Resolve the profile row (profiles.id ≠ auth.uid()).
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();

  SELECT COUNT(*) + 1 INTO v_count FROM sale_orders;
  v_so_number := 'SO-' || LPAD(v_count::text, 5, '0');

  -- Sum line item totals.
  SELECT COALESCE(SUM((item->>'total')::NUMERIC), 0)
  INTO   v_subtotal
  FROM   jsonb_array_elements(p_line_items) AS item;

  v_discount_resolved := CASE p_discount_type
    WHEN 'percentage' THEN (v_subtotal * p_discount_amount) / 100
    ELSE p_discount_amount
  END;
  v_total     := v_subtotal - v_discount_resolved;
  v_total_qar := v_total * p_exchange_rate;

  -- LEFT JOIN so cash customers (no credit group) don't raise NOT FOUND.
  SELECT c.customer_type, cg.credit_limit, cg.name
  INTO   v_customer_type, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  -- ── Cash branch ──────────────────────────────────────────────────────────
  -- Cash customers bypass the credit check entirely. They can never be put
  -- into pending_approval. NULL customer_type with no credit group is also
  -- treated as cash for backward compatibility.
  IF COALESCE(v_customer_type, 'credit') = 'cash' THEN
    v_so_status  := CASE
      WHEN p_intent = 'confirm' THEN 'confirmed'::sale_order_status
      ELSE                           'quotation'::sale_order_status
    END;
    v_credit_limit := 0;
    v_group_name   := 'Cash';
    v_open_total   := 0;
    v_available    := 0;

  -- ── Credit branch ────────────────────────────────────────────────────────
  ELSE
    -- Credit customers must have a credit group assigned.
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

    v_so_status := CASE
      WHEN v_total_qar > v_available THEN 'pending_approval'::sale_order_status
      WHEN p_intent = 'confirm'      THEN 'confirmed'::sale_order_status
      ELSE                                'quotation'::sale_order_status
    END;
  END IF;

  -- Insert the sale order.
  INSERT INTO sale_orders (
    so_number, customer_id, status,
    subtotal, tax, total,
    discount_amount, discount_label, discount_type, discount_amount_resolved,
    currency, exchange_rate, expected_delivery,
    payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes,
    customer_notes, validity_days,
    created_by, division_id
  )
  VALUES (
    v_so_number, p_customer_id, v_so_status,
    v_subtotal, 0, v_total,
    p_discount_amount, p_discount_label, p_discount_type, v_discount_resolved,
    p_currency, p_exchange_rate, p_expected_delivery,
    p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes,
    p_customer_notes, p_validity_days,
    v_profile_id, p_division_id
  )
  RETURNING id INTO v_so_id;

  -- Insert line items.
  INSERT INTO sale_order_lines (
    sale_order_id, item_name, sku, qty, unit,
    unit_price, total, line_type,
    brand_variant_id, tool_asset_item_id, avg_cost,
    created_by
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

  -- Reserve stock for confirmed orders (cash or credit).
  PERFORM batch_update_reserved_qty(
    (SELECT jsonb_agg(
       jsonb_build_object(
         'bv_id', (item->>'brand_variant_id')::UUID,
         'delta', (item->>'qty')::INTEGER
       ))
     FROM   jsonb_array_elements(p_line_items) AS item
     WHERE  (item->>'brand_variant_id') IS NOT NULL
       AND  (item->>'brand_variant_id') NOT IN ('', 'null')
       AND  (item->>'qty')::INTEGER > 0)
  );

  RETURN jsonb_build_object(
    'so_id',        v_so_id,
    'so_number',    v_so_number,
    'status',       v_so_status,
    'credit_limit', v_credit_limit,
    'group_name',   v_group_name,
    'open_total',   v_open_total,
    'available',    GREATEST(v_available, 0)
  );
END;
$$;


--
-- Name: create_service_customer(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_service_customer(p_name text, p_phone text, p_link_phone text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_customer_id UUID;
  v_phone_id    UUID;
BEGIN
  -- Check if phone already exists in service_customer_phones
  SELECT scp.customer_id, scp.id
    INTO v_customer_id, v_phone_id
    FROM public.service_customer_phones scp
   WHERE scp.phone = p_phone
   LIMIT 1;

  IF v_customer_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'customer_id',   v_customer_id,
      'phone_id',      v_phone_id,
      'customer_name', (SELECT name FROM public.service_customers WHERE id = v_customer_id)
    );
  END IF;

  -- Create new service_customer row
  INSERT INTO public.service_customers (name)
  VALUES (p_name)
  RETURNING id INTO v_customer_id;

  -- Insert primary phone
  INSERT INTO public.service_customer_phones (customer_id, phone, label, is_primary)
  VALUES (v_customer_id, p_phone, 'mobile', true)
  RETURNING id INTO v_phone_id;

  -- Insert optional second phone (not primary — partial index allows only one primary)
  IF p_link_phone IS NOT NULL AND p_link_phone <> '' AND p_link_phone <> p_phone THEN
    INSERT INTO public.service_customer_phones (customer_id, phone, label, is_primary)
    VALUES (v_customer_id, p_link_phone, 'mobile', false);
  END IF;

  RETURN jsonb_build_object(
    'customer_id',   v_customer_id,
    'phone_id',      v_phone_id,
    'customer_name', p_name
  );
END;
$$;


--
-- Name: create_site_visit(text, uuid, text, text, date, text, text, text, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_site_visit(p_visit_id text, p_service_customer_id uuid, p_status text, p_mode text, p_scheduled_date date, p_address text, p_notes text, p_arrival_phone text, p_attachments jsonb, p_visit_dates jsonb, p_assignments jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_visit_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO public.site_visits (
    visit_id, service_customer_id, status, mode,
    scheduled_date, address, notes, arrival_phone, attachments
  ) VALUES (
    p_visit_id,
    p_service_customer_id,
    p_status,
    p_mode,
    p_scheduled_date,
    NULLIF(p_address, ''),
    NULLIF(p_notes, ''),
    NULLIF(p_arrival_phone, ''),
    p_attachments
  )
  RETURNING id INTO v_visit_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_visit_dates, '[]'::jsonb)) LOOP
    INSERT INTO public.site_visit_dates (visit_id, visit_date, from_time, to_time, sort_order)
    VALUES (
      v_visit_id,
      (v_item->>'visit_date')::date,
      NULLIF(v_item->>'from_time', '')::time,
      NULLIF(v_item->>'to_time',   '')::time,
      COALESCE((v_item->>'sort_order')::smallint, 0)
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    INSERT INTO public.site_visit_team_assignments (
      visit_id, team_id, scheduled_date, time_slot, duration
    ) VALUES (
      v_visit_id,
      (v_item->>'team_id')::uuid,
      (v_item->>'scheduled_date')::date,
      v_item->>'time_slot',
      COALESCE(v_item->>'duration', '1')
    );
  END LOOP;

  RETURN v_visit_id;
END;
$$;


--
-- Name: create_stock_adjustment_v2(uuid, uuid, text, numeric, text, text, text[], uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_stock_adjustment_v2(p_warehouse_id uuid, p_brand_variant_id uuid, p_adjustment_type text, p_qty numeric, p_reason text, p_notes text, p_photo_urls text[], p_requested_by uuid, p_requested_by_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id   UUID;
  v_step RECORD;
  v_ord  INT := 0;
BEGIN
  IF p_adjustment_type NOT IN ('increase','decrease','damage','write_off') THEN
    RAISE EXCEPTION 'Invalid adjustment_type: %', p_adjustment_type;
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'qty must be > 0';
  END IF;

  INSERT INTO stock_adjustments (
    warehouse_id, brand_variant_id, adjustment_type, qty,
    reason, notes, photo_urls, status,
    requested_by, requested_by_name, created_by
  ) VALUES (
    p_warehouse_id, p_brand_variant_id, p_adjustment_type, p_qty,
    p_reason, NULLIF(p_notes,''), COALESCE(p_photo_urls, '{}'::text[]),
    'pending_approval',
    p_requested_by, p_requested_by_name, p_requested_by
  )
  RETURNING id INTO v_id;

  FOR v_step IN
    SELECT step_key, step_label, is_conditional, condition_types
    FROM   workflow_approval_steps
    WHERE  workflow = 'stock_adj'
      AND  is_active = true
      AND  archived_at IS NULL
    ORDER BY step_order
  LOOP
    IF v_step.is_conditional AND NOT (p_adjustment_type = ANY(v_step.condition_types)) THEN
      CONTINUE;
    END IF;

    v_ord := v_ord + 1;
    INSERT INTO stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
    VALUES (v_id, v_ord, v_step.step_key, v_step.step_label);
  END LOOP;

  IF v_ord = 0 THEN
    RAISE EXCEPTION 'No approval steps configured for stock_adj workflow';
  END IF;

  RETURN v_id;
END;
$$;


--
-- Name: create_transfer_v2(uuid, uuid, date, jsonb, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_transfer_v2(p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_date date, p_items jsonb, p_notes text DEFAULT NULL::text, p_created_by_profile_id uuid DEFAULT NULL::uuid, p_created_by_name text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_transfer_id UUID;
  v_transfer_number TEXT;
  v_item JSONB;
  v_bv_id UUID;
  v_qty INT;
  v_available INT;
BEGIN
  -- Generate transfer number
  v_transfer_number := generate_transfer_number();

  -- Insert the transfer header
  INSERT INTO warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    created_by_profile_id, created_by_name
  ) VALUES (
    v_transfer_number, p_from_warehouse_id, p_to_warehouse_id,
    'pending', p_date, p_notes,
    p_created_by_profile_id, p_created_by_name
  )
  RETURNING id INTO v_transfer_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    -- Lock the allocation row FIRST to prevent concurrent double-allocation.
    -- If no row exists yet, lock the FIFO layers instead to serialize access.
    PERFORM 1 FROM warehouse_stock_allocations
    WHERE warehouse_id = p_from_warehouse_id AND brand_variant_id = v_bv_id
    FOR UPDATE;

    -- Check available qty (stock - already allocated)
    SELECT GREATEST(COALESCE(SUM(f.remaining_qty), 0)::INT - COALESCE(wsa.allocated_qty, 0), 0)
    INTO v_available
    FROM fifo_cost_layers f
    LEFT JOIN warehouse_stock_allocations wsa
      ON wsa.warehouse_id = p_from_warehouse_id AND wsa.brand_variant_id = v_bv_id
    WHERE f.brand_variant_id = v_bv_id
      AND f.warehouse_id = p_from_warehouse_id
      AND f.remaining_qty > 0
    GROUP BY wsa.allocated_qty;

    IF COALESCE(v_available, 0) < v_qty THEN
      RAISE EXCEPTION 'Insufficient available stock for item % (available: %, requested: %)',
        COALESCE(v_item->>'item_name', v_bv_id::TEXT), COALESCE(v_available, 0), v_qty;
    END IF;

    -- Allocate stock (reserve it)
    INSERT INTO warehouse_stock_allocations (warehouse_id, brand_variant_id, allocated_qty)
    VALUES (p_from_warehouse_id, v_bv_id, v_qty)
    ON CONFLICT (warehouse_id, brand_variant_id)
    DO UPDATE SET allocated_qty = warehouse_stock_allocations.allocated_qty + v_qty,
                  updated_at = now();

    -- Insert normalized item row
    INSERT INTO warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost
    ) VALUES (
      v_transfer_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''),
      v_item->>'sku',
      v_qty,
      COALESCE((v_item->>'unit_cost')::NUMERIC, 0)
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;


--
-- Name: custom_access_token_hook(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

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
  LEFT JOIN user_custom_roles ucr ON ucr.profile_id = p.id
  LEFT JOIN custom_roles      cr  ON cr.id          = ucr.role_id
                                  AND cr.is_approval_slot = true
                                  AND cr.deleted_at IS NULL
  LEFT JOIN user_divisions    ud  ON ud.profile_id  = p.id
  WHERE  p.auth_user_id = (event ->> 'user_id')::UUID
  GROUP BY p.id;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_type}',    to_jsonb(COALESCE(v_user_type, 'employee')));
  claims := jsonb_set(claims, '{division_ids}', to_jsonb(COALESCE(v_division_ids, '{}'::UUID[])));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;


--
-- Name: deduct_fifo_layers(uuid, uuid, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: detach_payment_from_invoice(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: dispatch_transfer(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: fn_refresh_incoming_qty(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: fn_refresh_reserved_qty(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: fn_refresh_warehouse_stats(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: fn_update_linked_services_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_linked_services_count() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE inventory_brand_variants
    SET linked_services_count = linked_services_count + 1
    WHERE id = NEW.brand_variant_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE inventory_brand_variants
    SET linked_services_count = GREATEST(0, linked_services_count - 1)
    WHERE id = OLD.brand_variant_id;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: generate_check_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_check_number() RETURNS text
    LANGUAGE sql
    AS $$
  SELECT 'IC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('inventory_check_seq')::TEXT, 5, '0')
$$;


--
-- Name: generate_contract_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_contract_id() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  current_year TEXT := to_char(now(), 'YYYY');
  next_seq INT;
  existing_max INT;
BEGIN
  SELECT COALESCE(
    MAX(CAST(split_part(contract_id, '-', 3) AS INT)), 0
  ) INTO existing_max
  FROM contracts
  WHERE contract_id LIKE 'CTR-' || current_year || '-%'
    AND contract_id NOT LIKE 'CTR-Q-%';

  PERFORM setval('contract_id_seq',
    GREATEST(existing_max + 1, nextval('contract_id_seq')), false);
  next_seq := nextval('contract_id_seq');

  RETURN 'CTR-' || current_year || '-' || lpad(next_seq::TEXT, 3, '0');
END;
$$;


--
-- Name: generate_invoice_from_so(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_invoice_from_so(p_so_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_so              RECORD;
  v_inv_count       INTEGER;
  v_invoice_id_str  TEXT;
  v_invoice_type    TEXT;
  v_issued_date     DATE;
  v_due_date        DATE;
  v_new_inv_id      UUID;
  v_new_inv_str     TEXT;
BEGIN
  -- Serialize invoice numbering across all sessions.
  PERFORM pg_advisory_xact_lock(hashtext('invoices_serial'));

  -- Guard: no AR invoice already linked to this SO.
  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE  sale_order_id = p_so_id AND direction = 'ar'
  ) THEN
    RAISE EXCEPTION 'invoice_exists';
  END IF;

  -- Fetch SO + customer_type. Must be at a delivery stage.
  SELECT
    so.id,
    so.so_number,
    so.status,
    so.customer_id,
    so.subtotal,
    COALESCE(so.tax, 0)              AS tax,
    so.total                         AS total_amount,
    COALESCE(c.customer_type, 'credit') AS customer_type
  INTO v_so
  FROM sale_orders so
  JOIN customers   c  ON c.id = so.customer_id
  WHERE so.id = p_so_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'so_not_found';
  END IF;

  IF v_so.status NOT IN ('partial_delivery', 'delivered') THEN
    RAISE EXCEPTION 'so_not_deliverable';
  END IF;

  -- Compute next invoice number (serialised by advisory lock above).
  SELECT COUNT(*) + 1 INTO v_inv_count FROM invoices;
  v_invoice_id_str := 'INV-' || LPAD(v_inv_count::text, 5, '0');

  -- Derive invoice type and due date from customer type.
  v_invoice_type := v_so.customer_type;          -- 'cash' or 'credit'
  v_issued_date  := CURRENT_DATE;
  v_due_date     := CASE v_invoice_type
    WHEN 'cash' THEN CURRENT_DATE          -- pay immediately
    ELSE             CURRENT_DATE + 30     -- net-30 for credit
  END;

  -- Insert invoice row.
  INSERT INTO invoices (
    invoice_id,
    customer_id,
    direction,
    sale_order_id,
    invoice_type,
    doc_status,
    status,
    payment_status,
    needs_refresh,
    total_amount,
    subtotal,
    tax,
    issued_date,
    due_date,
    source,
    source_id,
    source_label
  ) VALUES (
    v_invoice_id_str,
    v_so.customer_id,
    'ar',
    p_so_id,
    v_invoice_type,
    'draft',
    'draft',
    'unpaid',
    false,
    v_so.total_amount,
    v_so.subtotal,
    v_so.tax,
    v_issued_date,
    v_due_date,
    'order',
    p_so_id::text,
    'SO #' || v_so.so_number
  )
  RETURNING id, invoice_id INTO v_new_inv_id, v_new_inv_str;

  -- Insert one line item per sale_order_line.
  INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total)
  SELECT
    v_new_inv_id,
    sol.item_name,
    sol.qty,
    sol.unit_price,
    sol.total
  FROM sale_order_lines sol
  WHERE sol.sale_order_id = p_so_id;

  RETURN jsonb_build_object(
    'id',           v_new_inv_id,
    'invoice_id',   v_new_inv_str,
    'invoice_type', v_invoice_type
  );
END;
$$;


--
-- Name: generate_quotation_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_quotation_id() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_num   INT  := nextval('quotation_number_seq');
  v_year  TEXT := to_char(NOW(), 'YYYY');
  v_month TEXT := to_char(NOW(), 'MM');
BEGIN
  RETURN 'Q/' || v_year || '/' || v_month || '/' || lpad(v_num::TEXT, 4, '0');
END;
$$;


--
-- Name: generate_quotation_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_quotation_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  current_year TEXT := to_char(now(), 'YYYY');
  next_seq INT;
  existing_max INT;
BEGIN
  SELECT COALESCE(
    MAX(CAST(split_part(quotation_number, '-', 4) AS INT)), 0
  ) INTO existing_max
  FROM contracts
  WHERE quotation_number LIKE 'CTR-Q-' || current_year || '-%';

  PERFORM setval('quotation_number_seq',
    GREATEST(existing_max + 1, nextval('quotation_number_seq')), false);
  next_seq := nextval('quotation_number_seq');

  RETURN 'CTR-Q-' || current_year || '-' || lpad(next_seq::TEXT, 3, '0');
END;
$$;


--
-- Name: generate_service_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_service_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_prefix text;
  v_parent_code text;
  v_sibling_count int;
  v_seq text;
BEGIN
  -- Skip if code already provided (legacy data)
  IF NEW.code IS NOT NULL AND NEW.code != '' THEN
    RETURN NEW;
  END IF;

  v_prefix := CASE NEW.tree_type
    WHEN 'normal'   THEN 'SVC'
    WHEN 'contract'  THEN 'CTR'
    WHEN 'mobile'    THEN 'MOB'
    ELSE 'SVC'
  END;

  IF NEW.parent_id IS NULL THEN
    -- Root level: PREFIX-NNN
    SELECT COUNT(*) INTO v_sibling_count
    FROM services
    WHERE tree_type = NEW.tree_type
      AND parent_id IS NULL
      AND id != NEW.id;

    v_seq := LPAD((v_sibling_count + 1)::text, 3, '0');
    NEW.code := v_prefix || '-' || v_seq;
  ELSE
    -- Child: PARENT_CODE-NN
    SELECT code INTO v_parent_code
    FROM services
    WHERE id = NEW.parent_id;

    -- If parent has no code yet, build a placeholder
    IF v_parent_code IS NULL OR v_parent_code = '' THEN
      v_parent_code := v_prefix || '-000';
    END IF;

    SELECT COUNT(*) INTO v_sibling_count
    FROM services
    WHERE parent_id = NEW.parent_id
      AND id != NEW.id;

    v_seq := LPAD((v_sibling_count + 1)::text, 2, '0');
    NEW.code := v_parent_code || '-' || v_seq;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: generate_tl_invoice_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_tl_invoice_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.invoice_number := 'TL-' ||
    EXTRACT(YEAR FROM now())::text || '-' ||
    LPAD(nextval('tl_invoice_seq')::text, 4, '0');
  RETURN NEW;
END;
$$;


--
-- Name: generate_transfer_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_transfer_number() RETURNS text
    LANGUAGE sql
    AS $$
  SELECT 'WT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('warehouse_transfer_seq')::TEXT, 5, '0')
$$;


--
-- Name: get_cogs_breakdown(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: get_customer_pending_balances(); Type: FUNCTION; Schema: public; Owner: -
--

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
      -- New: full list of phones (id + number + is_primary + label)
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
          -- New: phone_id so the UI can group invoices per phone
          'phone_id',       i.phone_id,
          'division_id',    i.division_id,
          'division_name',  d.name,
          -- Column is named `source` (enum invoice_source). Older RPC code
          -- referenced i.source_type which doesn't exist on this table; we
          -- alias as 'source_type' in the JSON so the existing TS hook
          -- contract is preserved.
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
    JOIN   customers c  ON c.id = i.customer_id
    LEFT JOIN divisions d ON d.id = i.division_id
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


--
-- Name: get_date_team_availability(date[], time without time zone, time without time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_date_team_availability(p_dates date[], p_from_time time without time zone, p_to_time time without time zone) RETURNS TABLE(visit_date date, available_teams_count integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  WITH total_teams AS (
    SELECT COUNT(*)::integer AS cnt
    FROM   teams
    WHERE  deleted_at IS NULL
  ),
  booked_teams AS (
    SELECT DISTINCT
      ota.scheduled_date AS visit_date,
      ota.team_id
    FROM   order_team_assignments ota
    WHERE  ota.scheduled_date = ANY(p_dates)
      AND  p_from_time IS NOT NULL
      AND  p_to_time   IS NOT NULL
      -- Cast TEXT duration column to integer minutes for arithmetic
      AND  ota.time_slot::time < p_to_time
      AND  (ota.time_slot::time + (COALESCE(ota.duration::integer, 0) || ' minutes')::interval)::time > p_from_time
  ),
  booked_counts AS (
    SELECT visit_date, COUNT(DISTINCT team_id)::integer AS booked
    FROM   booked_teams
    GROUP  BY visit_date
  )
  SELECT
    d::date                                                                  AS visit_date,
    GREATEST(0, (SELECT cnt FROM total_teams) - COALESCE(bc.booked, 0))     AS available_teams_count
  FROM   UNNEST(p_dates) AS d
  LEFT   JOIN booked_counts bc ON bc.visit_date = d::date
  ORDER  BY visit_date;
$$;


--
-- Name: get_dead_stock_report(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: get_invoice_summary(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: get_payment_summary(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: get_stock_value_cogs_summary(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: get_team_leader_visits(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_team_leader_visits(p_team_id uuid, p_from_date date DEFAULT CURRENT_DATE) RETURNS TABLE(id uuid, date date, scheduled_time text, status text, type text, source_id uuid, source_type text, team_id uuid, customer_name text, customer_phone text, address text, waze_link text, services_json jsonb, team_ids uuid[], order_id text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY

  -- Source 1: Order team assignments
  SELECT
    ota.id,
    ota.scheduled_date,
    COALESCE(ota.time_slot, o.scheduled_time),
    COALESCE(o.status::text, 'scheduled'),
    COALESCE(o.type, 'order'),
    o.id,
    'order'::text,
    ota.team_id,
    COALESCE(sc.name, 'Unknown Customer'),
    COALESCE(
      o.arrival_phone,
      (SELECT p.phone FROM public.service_customer_phones p
       WHERE p.customer_id = o.service_customer_id AND p.is_primary LIMIT 1)
    ),
    COALESCE(o.address, ''),
    addr.waze_link,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id', os.id,
        'name', COALESCE(s.name_en, os.name, 'Service'),
        'unit_price', COALESCE(os.price, 0),
        'qty', COALESCE(os.qty, 1)
      ) ORDER BY os.name)
      FROM public.order_services os
      LEFT JOIN public.services s ON s.id = os.service_id
      WHERE os.order_id = o.id
    ),
    (SELECT array_agg(ota2.team_id) FROM public.order_team_assignments ota2 WHERE ota2.order_id = o.id),
    o.order_id
  FROM public.order_team_assignments ota
  JOIN public.orders o ON o.id = ota.order_id
  LEFT JOIN public.service_customers sc ON sc.id = o.service_customer_id
  LEFT JOIN public.service_customer_addresses addr ON addr.id = o.address_id
  WHERE ota.team_id = p_team_id
    AND ota.scheduled_date >= p_from_date
    AND COALESCE(o.status::text, 'scheduled') != 'cancelled'

  UNION ALL

  -- Source 2: Contract visits
  SELECT
    cv.id,
    cv.scheduled_date,
    NULL::text,
    CASE WHEN cv.completed THEN 'completed' ELSE 'scheduled' END,
    'contract'::text,
    cv.contract_id,
    'contract'::text,
    cv.team_id,
    COALESCE(c.name, 'Unknown Customer'),
    NULL::text,
    COALESCE(con.site_name, ''),
    NULL::text,
    NULL::jsonb,
    ARRAY[cv.team_id],
    NULL::text
  FROM public.contract_visits cv
  LEFT JOIN public.contracts con ON con.id = cv.contract_id
  LEFT JOIN public.customers c ON c.id = con.customer_id
  WHERE cv.team_id = p_team_id
    AND cv.scheduled_date >= p_from_date
    AND NOT cv.completed

  UNION ALL

  -- Source 3: Site visit team assignments
  SELECT
    svta.id,
    COALESCE(svta.scheduled_date::date, sv.scheduled_date),
    svta.time_slot,
    COALESCE(sv.status, 'scheduled'),
    'site-visit-single'::text,
    sv.id,
    'site_visit'::text,
    svta.team_id,
    COALESCE(sc.name, 'Unknown Customer'),
    sv.arrival_phone,
    COALESCE(sv.address, ''),
    NULL::text,
    NULL::jsonb,
    (SELECT array_agg(svta2.team_id) FROM public.site_visit_team_assignments svta2 WHERE svta2.visit_id = sv.id),
    NULL::text
  FROM public.site_visit_team_assignments svta
  JOIN public.site_visits sv ON sv.id = svta.visit_id
  LEFT JOIN public.service_customers sc ON sc.id = sv.service_customer_id
  WHERE svta.team_id = p_team_id
    AND COALESCE(svta.scheduled_date::date, sv.scheduled_date) >= p_from_date
    AND COALESCE(sv.status, 'scheduled') != 'cancelled'

  ORDER BY 2, 3 NULLS LAST;
END;
$$;


--
-- Name: has_admin_permission(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: has_inventory_manager_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: is_contract_visible(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_contract_visible(p_contract_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: is_division_visible(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: is_field_rp_of(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_field_rp_of(p_profile_id uuid, p_warehouse_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM warehouse_field_rps
    WHERE profile_id = p_profile_id AND warehouse_id = p_warehouse_id
  );
$$;


--
-- Name: mark_overdue_invoices(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: next_follow_up_order_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_follow_up_order_id() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  yr       INT  := EXTRACT(YEAR  FROM now())::INT;
  mo       INT  := EXTRACT(MONTH FROM now())::INT;
  seq      INT;
  seq_name TEXT := 'follow_up_order_seq_' || yr || '_' || LPAD(mo::TEXT, 2, '0');
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', seq_name);
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO seq;
  RETURN 'FU/' || yr || '/' || LPAD(mo::TEXT, 2, '0') || '/' || LPAD(seq::TEXT, 4, '0');
END;
$$;


--
-- Name: next_follow_up_request_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_follow_up_request_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  yr   INT := EXTRACT(YEAR FROM now())::INT;
  seq  INT;
  seq_name TEXT := 'follow_up_request_seq_' || yr;
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', seq_name);
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO seq;
  RETURN 'FUR-' || yr || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$;


--
-- Name: notify_approvers_on_service_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_approvers_on_service_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_approver_id UUID;
  v_service_name TEXT;
  v_requester_name TEXT;
BEGIN
  -- Only fire on new pending requests
  IF NEW.status != 'pending' THEN
    RETURN NULL;
  END IF;

  -- Resolve service name (for edits/deletes) or from changes payload (for adds)
  IF NEW.service_id IS NOT NULL THEN
    SELECT name_en INTO v_service_name FROM services WHERE id = NEW.service_id;
  ELSE
    v_service_name := NEW.changes->'name_en'->>'new';
  END IF;
  v_service_name := COALESCE(v_service_name, 'Unknown Service');

  -- Resolve requester name
  SELECT full_name INTO v_requester_name FROM profiles WHERE id = NEW.requested_by;
  v_requester_name := COALESCE(v_requester_name, 'Unknown User');

  -- Insert notification for each approver (except the requester themselves)
  FOR v_approver_id IN
    SELECT DISTINCT ucr.profile_id
    FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
    WHERE (cr.is_system = true OR 'master_data.services.approve' = ANY(cr.permissions))
      AND ucr.profile_id != NEW.requested_by
  LOOP
    INSERT INTO notifications (profile_id, type, title, body, related_id, related_type)
    VALUES (
      v_approver_id,
      'service_change_pending',
      'Service change pending approval',
      v_requester_name || ' requested a ' || NEW.change_type || ' on "' || v_service_name || '"',
      COALESCE(NEW.service_id, NEW.id),
      'service'
    );
  END LOOP;

  RETURN NULL;
END;
$$;


--
-- Name: recalc_average_cost(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: recalculate_ar_invoice_payment_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: receive_transfer(uuid, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: refresh_po_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: reject_service_change(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_service_change(p_request_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Resolve profile_id
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  IF NOT _user_has_permission(v_profile_id, 'master_data.services.approve') THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.approve required';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  UPDATE service_change_requests
  SET
    status           = 'rejected',
    reviewed_by      = v_profile_id,
    reviewed_at      = now(),
    rejection_reason = trim(p_reason),
    updated_at       = now()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not pending';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: reject_transfer_v2(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_transfer_v2(p_transfer_id uuid, p_rejected_by_profile_id uuid, p_rejected_by_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_avg_cost NUMERIC;
BEGIN
  SELECT id, from_warehouse_id, to_warehouse_id, status, date
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status NOT IN ('pending', 'in_transit') THEN
    RAISE EXCEPTION 'Transfer % cannot be rejected — current status: %', p_transfer_id, v_transfer.status;
  END IF;

  UPDATE warehouse_transfers
  SET status = 'rejected',
      approved_by_name = p_rejected_by_name,
      approved_date = CURRENT_DATE
  WHERE id = p_transfer_id;

  -- ORDER BY brand_variant_id to prevent deadlocks when concurrent transfers
  -- share items — both transactions lock rows in the same deterministic order.
  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    IF v_transfer.status = 'pending' THEN
      -- Release allocation
      UPDATE warehouse_stock_allocations
      SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
          updated_at = now()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND brand_variant_id = v_item.brand_variant_id;

    ELSIF v_transfer.status = 'in_transit' THEN
      -- Reverse dispatch — return stock to source
      SELECT ABS(unit_cost) INTO v_avg_cost
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out'
      LIMIT 1;

      v_avg_cost := COALESCE(v_avg_cost, v_item.unit_cost);

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_item.brand_variant_id, v_transfer.from_warehouse_id,
        CURRENT_DATE,
        v_item.requested_qty, v_avg_cost, 0, v_avg_cost, v_item.requested_qty
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_in', v_item.requested_qty, v_avg_cost,
        'transfer', p_transfer_id,
        'Transfer rejected — stock returned'
      );
    END IF;
  END LOOP;
END;
$$;


--
-- Name: replace_user_custom_roles(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: replace_user_custom_roles_v2(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.replace_user_custom_roles_v2(p_user_id uuid, p_assignments jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM user_custom_roles WHERE profile_id = p_user_id;

  IF p_assignments IS NOT NULL AND jsonb_array_length(p_assignments) > 0 THEN
    INSERT INTO user_custom_roles (profile_id, role_id, approval_scopes)
    SELECT
      p_user_id,
      (a->>'role_id')::uuid,
      CASE
        WHEN a->'approval_scopes' IS NULL OR a->'approval_scopes' = 'null'::jsonb
          THEN NULL
        WHEN jsonb_array_length(a->'approval_scopes') = 0
          THEN NULL
        ELSE ARRAY(SELECT jsonb_array_elements_text(a->'approval_scopes'))
      END
    FROM jsonb_array_elements(p_assignments) AS a;
  END IF;
END;
$$;


--
-- Name: replace_warehouse_field_rps(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: revert_landed_cost(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: revert_landed_cost(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: rpc_cancel_po_return_dispatch(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: rpc_process_po_return_dispatch(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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

    -- Fallback: look up brand variant by SKU code when brand_variant_id is missing
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

    UPDATE inventory_brand_variants
    SET    stock_level = stock_level - v_qty
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
      'purchase_return',
      v_qty,
      0,
      'po_return',
      p_return_id,
      'Returned to supplier'
    );
  END LOOP;

  UPDATE returns SET dispatched_at = now() WHERE id = p_return_id;
END;
$$;


--
-- Name: rpc_process_return_restock(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_process_return_restock(p_return_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_return  RECORD;
  v_item    JSONB;
  v_bv_id   UUID;
  v_qty     INT;
  v_cond    TEXT;
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
        'sale_return',
        v_qty,
        0,
        'return',
        p_return_id,
        'Restocked from sale return'
      );

    ELSIF v_cond = 'damaged' THEN
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


SET default_table_access_method = heap;

--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    name_ar text,
    phone text NOT NULL,
    skills text[] DEFAULT '{}'::text[],
    status public.employee_status DEFAULT 'active'::public.employee_status,
    team_id uuid,
    avatar text,
    join_date date NOT NULL,
    nationality text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    site_visit_order boolean DEFAULT false NOT NULL,
    site_visit_quotation boolean DEFAULT false NOT NULL,
    avatar_url text,
    deleted_at timestamp with time zone,
    division_id uuid,
    profile_id uuid
);


--
-- Name: save_employee(uuid, text, text, text, date, text, text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_employee(p_employee_id uuid, p_name text, p_phone text, p_nationality text, p_join_date date, p_status text, p_avatar_url text, p_service_ids uuid[]) RETURNS public.employees
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_employee employees;
BEGIN
  UPDATE employees SET
    name        = p_name,
    phone       = p_phone,
    nationality = p_nationality,
    join_date   = p_join_date,
    status      = p_status,
    avatar_url  = p_avatar_url
  WHERE id = p_employee_id
  RETURNING * INTO v_employee;

  DELETE FROM employee_services WHERE employee_id = p_employee_id;
  IF array_length(p_service_ids, 1) > 0 THEN
    INSERT INTO employee_services (employee_id, service_id)
    SELECT p_employee_id, unnest(p_service_ids);
  END IF;

  RETURN v_employee;
END;
$$;


--
-- Name: save_employee(uuid, text, text, text, date, text, text, uuid[], uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_employee(p_employee_id uuid, p_name text, p_phone text, p_nationality text, p_join_date date, p_status text, p_avatar_url text, p_service_ids uuid[], p_division_id uuid DEFAULT NULL::uuid) RETURNS public.employees
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_employee employees;
BEGIN
  UPDATE employees SET
    name        = p_name,
    phone       = p_phone,
    nationality = p_nationality,
    join_date   = p_join_date,
    status      = p_status,
    avatar_url  = p_avatar_url,
    division_id = p_division_id
  WHERE id = p_employee_id
  RETURNING * INTO v_employee;

  DELETE FROM employee_services WHERE employee_id = p_employee_id;
  IF array_length(p_service_ids, 1) > 0 THEN
    INSERT INTO employee_services (employee_id, service_id)
    SELECT p_employee_id, unnest(p_service_ids);
  END IF;

  RETURN v_employee;
END;
$$;


--
-- Name: save_employee(uuid, text, text, text, date, text, boolean, boolean, text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_employee(p_employee_id uuid, p_name text, p_phone text, p_nationality text, p_join_date date, p_status text, p_site_visit_order boolean, p_site_visit_quotation boolean, p_avatar_url text, p_service_ids uuid[]) RETURNS public.employees
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_employee employees;
BEGIN
  UPDATE employees SET
    name                 = p_name,
    phone                = p_phone,
    nationality          = p_nationality,
    join_date            = p_join_date,
    status               = p_status,
    site_visit_order     = p_site_visit_order,
    site_visit_quotation = p_site_visit_quotation,
    avatar_url           = p_avatar_url
  WHERE id = p_employee_id
  RETURNING * INTO v_employee;

  DELETE FROM employee_services WHERE employee_id = p_employee_id;
  IF array_length(p_service_ids, 1) > 0 THEN
    INSERT INTO employee_services (employee_id, service_id)
    SELECT p_employee_id, unnest(p_service_ids);
  END IF;

  RETURN v_employee;
END;
$$;


--
-- Name: save_inventory_check_item_count(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: save_quotation(text, uuid, text, text, numeric, text, date, timestamp with time zone, jsonb, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_quotation(p_quotation_id text, p_service_customer_id uuid, p_division text, p_status text, p_total_amount numeric, p_notes text, p_expiry_date date, p_sent_date timestamp with time zone, p_line_items jsonb, p_discount_type text DEFAULT 'flat'::text, p_discount_value numeric DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_uuid uuid;
  v_item jsonb;
BEGIN
  INSERT INTO public.quotations (
    quotation_id, service_customer_id, division, status,
    total_amount, notes, created_date, expiry_date, sent_date,
    discount_type, discount_value
  ) VALUES (
    p_quotation_id,
    p_service_customer_id,
    p_division,
    p_status::quotation_status,
    p_total_amount,
    NULLIF(p_notes, ''),
    CURRENT_DATE,
    p_expiry_date,
    p_sent_date,
    COALESCE(p_discount_type, 'flat'),
    COALESCE(p_discount_value, 0)
  )
  ON CONFLICT (quotation_id) DO UPDATE SET
    service_customer_id = EXCLUDED.service_customer_id,
    status              = EXCLUDED.status,
    total_amount        = EXCLUDED.total_amount,
    notes               = EXCLUDED.notes,
    expiry_date         = COALESCE(EXCLUDED.expiry_date, quotations.expiry_date),
    sent_date           = EXCLUDED.sent_date,
    discount_type       = EXCLUDED.discount_type,
    discount_value      = EXCLUDED.discount_value
  RETURNING id INTO v_uuid;

  DELETE FROM public.quotation_line_items WHERE quotation_id = v_uuid;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_line_items, '[]'::jsonb)) LOOP
    INSERT INTO public.quotation_line_items (
      quotation_id, service_id, name, path, qty, price, duration
    ) VALUES (
      v_uuid,
      NULLIF(v_item->>'service_id', '')::uuid,
      v_item->>'name',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'path', '[]'::jsonb))),
      (v_item->>'qty')::int,
      (v_item->>'price')::numeric,
      NULLIF(v_item->>'duration', '')::int
    );
  END LOOP;

  RETURN v_uuid;
END;
$$;


--
-- Name: schedule_day_end(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.schedule_day_end(days jsonb) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT COALESCE(
    MAX(
      CASE
        WHEN (split_part(d.v->>'end', ':', 2)::integer) > 0
          THEN split_part(d.v->>'end', ':', 1)::integer + 1
        ELSE split_part(d.v->>'end', ':', 1)::integer
      END
    ),
    18
  )
  FROM jsonb_each(days) d(k, v)
  WHERE (d.v->>'enabled')::boolean = true
    AND d.v->>'end' IS NOT NULL;
$$;


--
-- Name: schedule_day_start(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.schedule_day_start(days jsonb) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT COALESCE(
    MIN(split_part(d.v->>'start', ':', 1)::integer),
    7
  )
  FROM jsonb_each(days) d(k, v)
  WHERE (d.v->>'enabled')::boolean = true
    AND d.v->>'start' IS NOT NULL;
$$;


--
-- Name: service_inventory_bulk_upsert(uuid[], uuid, text, numeric, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.service_inventory_bulk_upsert(p_service_ids uuid[], p_brand_variant_id uuid, p_link_type text DEFAULT 'supply'::text, p_quantity numeric DEFAULT 1, p_warranty_months integer DEFAULT 0) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF array_length(p_service_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO service_inventory
    (service_id, brand_variant_id, link_type, quantity, warranty_months)
  SELECT
    unnest(p_service_ids),
    p_brand_variant_id,
    p_link_type,
    p_quantity,
    p_warranty_months
  ON CONFLICT (service_id, brand_variant_id) DO NOTHING;
END;
$$;


--
-- Name: set_service_customers_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_service_customers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: snapshot_inventory_check_system_qty(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: storage_lc_bills_write_allowed(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: submit_service_change(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_service_change(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_profile_id     UUID;
  v_has_approve    BOOLEAN;
  v_has_manage     BOOLEAN;
  v_service_id     UUID;
  v_change_type    service_change_type;
  v_changes        JSONB;
  v_division       TEXT[];
  v_tree_type      TEXT;
  v_parent_id      UUID;
  v_has_pending    BOOLEAN;
  v_new_id         UUID;
  v_needs_approval BOOLEAN := false;
  v_key            TEXT;
  v_approval_fields TEXT[] := ARRAY['name_en', 'name_ar', 'price', 'emergency_price', 'status'];
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  v_has_approve := _user_has_permission(v_profile_id, 'master_data.services.approve');
  v_has_manage  := _user_has_permission(v_profile_id, 'master_data.services.manage');

  IF NOT v_has_manage THEN
    RAISE EXCEPTION 'Permission denied: master_data.services.manage required';
  END IF;

  v_service_id  := (p_payload->>'service_id')::UUID;
  v_change_type := (p_payload->>'change_type')::service_change_type;
  v_changes     := p_payload->'changes';
  v_tree_type   := p_payload->>'tree_type';
  v_parent_id   := (p_payload->>'parent_id')::UUID;

  SELECT COALESCE(array_agg(elem::TEXT), '{}')
  INTO v_division
  FROM jsonb_array_elements_text(p_payload->'division') AS elem;

  IF v_change_type IN ('add', 'delete') THEN
    v_needs_approval := true;
  ELSIF v_change_type = 'edit' THEN
    FOR v_key IN SELECT jsonb_object_keys(v_changes) LOOP
      IF v_key = ANY(v_approval_fields) THEN
        v_needs_approval := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- ===== DIRECT APPLY PATH =====
  IF v_has_approve OR NOT v_needs_approval THEN
    CASE v_change_type
      WHEN 'add' THEN
        v_new_id := gen_random_uuid();
        INSERT INTO services (
          id, parent_id, tree_type, sort_order, division,
          name_en, name_ar, code, legacy_service_id,
          price, emergency_price, discount, price_unit,
          duration, warranty, status, category, service_type, contract_type,
          item_kind, pricing_mode, discount_scope,
          invoice_text_en, invoice_text_ar, photo_requirement,
          catalog_image_url, brands_supported, includes_notes,
          spare_parts, qc_checklist, instructions, reminder_days,
          booking_time_matrix, inventory_items, components, qc_items
        ) VALUES (
          v_new_id, v_parent_id, v_tree_type, 0, v_division,
          v_changes->'name_en'->>'new',
          v_changes->'name_ar'->>'new',
          v_changes->'code'->>'new',
          v_changes->'legacy_service_id'->>'new',
          (v_changes->'price'->>'new')::NUMERIC,
          (v_changes->'emergency_price'->>'new')::NUMERIC,
          (v_changes->'discount'->>'new')::NUMERIC,
          v_changes->'price_unit'->>'new',
          (v_changes->'duration'->>'new')::INT,
          (v_changes->'warranty'->>'new')::INT,
          COALESCE(v_changes->'status'->>'new', 'active')::service_status,
          CASE WHEN v_changes ? 'category' AND v_changes->'category'->>'new' IS NOT NULL
               THEN (v_changes->'category'->>'new')::service_category
               ELSE NULL END,
          CASE WHEN v_changes ? 'service_type' AND v_changes->'service_type'->>'new' IS NOT NULL
               THEN (v_changes->'service_type'->>'new')::service_type
               ELSE NULL END,
          CASE WHEN v_changes ? 'contract_type' AND v_changes->'contract_type'->>'new' IS NOT NULL
               THEN (v_changes->'contract_type'->>'new')::contract_type
               ELSE NULL END,
          v_changes->'item_kind'->>'new',
          v_changes->'pricing_mode'->>'new',
          v_changes->'discount_scope'->>'new',
          v_changes->'invoice_text_en'->>'new',
          v_changes->'invoice_text_ar'->>'new',
          v_changes->'photo_requirement'->>'new',
          v_changes->'catalog_image_url'->>'new',
          COALESCE((v_changes->'brands_supported'->>'new')::INT, 0),
          COALESCE((v_changes->'includes_notes'->>'new')::BOOLEAN, false),
          COALESCE((v_changes->'spare_parts'->>'new')::BOOLEAN, false),
          COALESCE((v_changes->'qc_checklist'->>'new')::BOOLEAN, false),
          COALESCE((v_changes->'instructions'->>'new')::BOOLEAN, false),
          (v_changes->'reminder_days'->>'new')::INT,
          CASE WHEN v_changes ? 'booking_time_matrix' THEN v_changes->'booking_time_matrix'->'new' ELSE NULL END,
          CASE WHEN v_changes ? 'inventory_items'     THEN v_changes->'inventory_items'->'new'     ELSE NULL END,
          CASE WHEN v_changes ? 'components'          THEN v_changes->'components'->'new'          ELSE NULL END,
          CASE WHEN v_changes ? 'qc_items'            THEN v_changes->'qc_items'->'new'            ELSE NULL END
        );
        v_service_id := v_new_id;

      WHEN 'edit' THEN
        UPDATE services SET
          name_en           = CASE WHEN v_changes ? 'name_en'           THEN v_changes->'name_en'->>'new'                    ELSE name_en           END,
          name_ar           = CASE WHEN v_changes ? 'name_ar'           THEN v_changes->'name_ar'->>'new'                    ELSE name_ar           END,
          code              = CASE WHEN v_changes ? 'code'              THEN v_changes->'code'->>'new'                       ELSE code              END,
          legacy_service_id = CASE WHEN v_changes ? 'legacy_service_id' THEN v_changes->'legacy_service_id'->>'new'          ELSE legacy_service_id END,
          price             = CASE WHEN v_changes ? 'price'             THEN (v_changes->'price'->>'new')::NUMERIC            ELSE price             END,
          emergency_price   = CASE WHEN v_changes ? 'emergency_price'   THEN (v_changes->'emergency_price'->>'new')::NUMERIC  ELSE emergency_price   END,
          discount          = CASE WHEN v_changes ? 'discount'          THEN (v_changes->'discount'->>'new')::NUMERIC         ELSE discount          END,
          price_unit        = CASE WHEN v_changes ? 'price_unit'        THEN v_changes->'price_unit'->>'new'                  ELSE price_unit        END,
          duration          = CASE WHEN v_changes ? 'duration'          THEN (v_changes->'duration'->>'new')::INT             ELSE duration          END,
          warranty          = CASE WHEN v_changes ? 'warranty'          THEN (v_changes->'warranty'->>'new')::INT             ELSE warranty          END,
          status            = CASE WHEN v_changes ? 'status'            THEN (v_changes->'status'->>'new')::service_status    ELSE status            END,
          service_type      = CASE WHEN v_changes ? 'service_type'      THEN (v_changes->'service_type'->>'new')::service_type ELSE service_type     END,
          contract_type     = CASE WHEN v_changes ? 'contract_type'     THEN
                                CASE WHEN v_changes->'contract_type'->>'new' IS NOT NULL
                                     THEN (v_changes->'contract_type'->>'new')::contract_type
                                     ELSE NULL END                                                                            ELSE contract_type     END,
          item_kind         = CASE WHEN v_changes ? 'item_kind'         THEN v_changes->'item_kind'->>'new'                   ELSE item_kind         END,
          pricing_mode      = CASE WHEN v_changes ? 'pricing_mode'      THEN v_changes->'pricing_mode'->>'new'                ELSE pricing_mode      END,
          discount_scope    = CASE WHEN v_changes ? 'discount_scope'    THEN v_changes->'discount_scope'->>'new'              ELSE discount_scope    END,
          invoice_text_en   = CASE WHEN v_changes ? 'invoice_text_en'   THEN v_changes->'invoice_text_en'->>'new'             ELSE invoice_text_en   END,
          invoice_text_ar   = CASE WHEN v_changes ? 'invoice_text_ar'   THEN v_changes->'invoice_text_ar'->>'new'             ELSE invoice_text_ar   END,
          photo_requirement = CASE WHEN v_changes ? 'photo_requirement' THEN v_changes->'photo_requirement'->>'new'           ELSE photo_requirement END,
          catalog_image_url = CASE WHEN v_changes ? 'catalog_image_url' THEN v_changes->'catalog_image_url'->>'new'           ELSE catalog_image_url END,
          brands_supported  = CASE WHEN v_changes ? 'brands_supported'  THEN (v_changes->'brands_supported'->>'new')::INT  ELSE brands_supported  END,
          includes_notes    = CASE WHEN v_changes ? 'includes_notes'    THEN (v_changes->'includes_notes'->>'new')::BOOLEAN    ELSE includes_notes    END,
          spare_parts       = CASE WHEN v_changes ? 'spare_parts'       THEN (v_changes->'spare_parts'->>'new')::BOOLEAN       ELSE spare_parts       END,
          qc_checklist      = CASE WHEN v_changes ? 'qc_checklist'      THEN (v_changes->'qc_checklist'->>'new')::BOOLEAN      ELSE qc_checklist      END,
          instructions      = CASE WHEN v_changes ? 'instructions'      THEN (v_changes->'instructions'->>'new')::BOOLEAN      ELSE instructions      END,
          reminder_days     = CASE WHEN v_changes ? 'reminder_days'     THEN (v_changes->'reminder_days'->>'new')::INT         ELSE reminder_days     END,
          updated_at        = now()
        WHERE id = v_service_id AND deleted_at IS NULL;

      WHEN 'delete' THEN
        IF EXISTS (
          SELECT 1 FROM order_services os
          JOIN orders o ON o.id = os.order_id
          WHERE os.service_id = v_service_id
            AND o.status NOT IN ('completed', 'cancelled')
            AND o.deleted_at IS NULL
        ) THEN
          RAISE EXCEPTION 'Cannot delete: service has active orders';
        END IF;
        UPDATE services
        SET deleted_at = now(), status = 'inactive'::service_status, updated_at = now()
        WHERE id = v_service_id AND deleted_at IS NULL;

    END CASE;

    INSERT INTO activity_log (action, module, entity_type, entity_id, details)
    VALUES (
      'services/service-' || v_change_type || 'd',
      'services',
      'service',
      v_service_id,
      jsonb_build_object('change_type', v_change_type, 'applied_by', v_profile_id)::TEXT
    );

    RETURN jsonb_build_object('action', 'applied', 'id', v_service_id);

  -- ===== CHANGE REQUEST PATH =====
  ELSE
    IF v_service_id IS NOT NULL THEN
      SELECT has_pending_change INTO v_has_pending FROM services WHERE id = v_service_id;
      IF v_has_pending THEN
        RAISE EXCEPTION 'This service already has a pending change awaiting approval';
      END IF;
    END IF;

    INSERT INTO service_change_requests (service_id, division, change_type, changes, requested_by)
    VALUES (v_service_id, v_division, v_change_type, v_changes, v_profile_id)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('action', 'pending', 'id', v_new_id);
  END IF;
END;
$$;


--
-- Name: swap_visit_team(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.swap_visit_team(p_assignment_id uuid, p_new_team_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
DECLARE
  v_order_id        uuid;
  v_scheduled_date  date;
  v_time_slot       text;
  v_duration        text;
  v_time_conflict   int;
  v_performer       text;
BEGIN
  -- 1. Fetch the assignment being swapped
  SELECT order_id, scheduled_date, time_slot, duration
  INTO   v_order_id, v_scheduled_date, v_time_slot, v_duration
  FROM   public.order_team_assignments
  WHERE  id = p_assignment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Assignment not found');
  END IF;

  -- 2. Ensure new team is not a QC team
  IF EXISTS (SELECT 1 FROM public.teams WHERE id = p_new_team_id AND is_qc = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'QC teams cannot be assigned via calendar swap');
  END IF;

  -- 3. Check time conflict: only block when BOTH visits have time slots that actually overlap.
  --    If either visit has no time_slot, skip the conflict check —
  --    no-time visits are considered flexible and never block a timed assignment.
  SELECT COUNT(*) INTO v_time_conflict
  FROM   public.order_team_assignments
  WHERE  team_id        = p_new_team_id
    AND  id            <> p_assignment_id
    AND  scheduled_date = v_scheduled_date
    AND  v_time_slot IS NOT NULL
    AND  time_slot IS NOT NULL
    AND  time_slot::time <
         CASE WHEN v_duration ~ '^\d+$'
              THEN v_time_slot::time + (v_duration::int * interval '1 hour')
              ELSE v_time_slot::time + interval '2 hours'
         END
    AND (
         CASE WHEN duration ~ '^\d+$'
              THEN time_slot::time + (duration::int * interval '1 hour')
              ELSE time_slot::time + interval '2 hours'
         END
        ) > v_time_slot::time;

  IF v_time_conflict > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Time conflict with existing visit');
  END IF;

  -- 4. Perform the swap
  UPDATE public.order_team_assignments
  SET    team_id = p_new_team_id
  WHERE  id      = p_assignment_id;

  -- 5. Write audit log
  SELECT COALESCE(raw_user_meta_data->>'full_name', email, 'unknown')
  INTO   v_performer
  FROM   auth.users
  WHERE  id = auth.uid();

  INSERT INTO public.activity_log
    (entity_type, entity_id, action, module, performer_name, new_data)
  VALUES
    ('order_team_assignment', p_assignment_id, 'team_swapped', 'calendar',
     v_performer,
     jsonb_build_object('new_team_id', p_new_team_id, 'order_id', v_order_id));

  RETURN jsonb_build_object('success', true);
END;
$_$;


--
-- Name: FUNCTION swap_visit_team(p_assignment_id uuid, p_new_team_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.swap_visit_team(p_assignment_id uuid, p_new_team_id uuid) IS 'Atomically validates eligibility and reassigns an order_team_assignment to a new team. Returns { success, error? }.';


--
-- Name: sync_service_pending_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_service_pending_lock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_service_id UUID;
BEGIN
  target_service_id := COALESCE(NEW.service_id, OLD.service_id);
  IF target_service_id IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE services
  SET has_pending_change = EXISTS (
    SELECT 1 FROM service_change_requests
    WHERE service_id = target_service_id AND status = 'pending'
  )
  WHERE id = target_service_id;
  RETURN NULL;
END;
$$;


--
-- Name: sync_team_active_schedule(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_team_active_schedule(p_team_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_schedule_id UUID;
BEGIN
  SELECT tsa.schedule_id INTO v_schedule_id
  FROM team_schedule_assignments tsa
  JOIN schedules s ON s.id = tsa.schedule_id
  WHERE tsa.team_id = p_team_id
    AND tsa.start_date <= CURRENT_DATE
    AND (tsa.end_date IS NULL OR tsa.end_date >= CURRENT_DATE)
    AND s.deleted_at IS NULL
  ORDER BY tsa.start_date DESC
  LIMIT 1;

  UPDATE teams SET schedule_id = v_schedule_id WHERE id = p_team_id;
END;
$$;


--
-- Name: toggle_workflow_step(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_workflow_step(p_step_id uuid, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE workflow_approval_steps
  SET is_active = p_active
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;


--
-- Name: trg_fn_po_line_items_incoming(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: trg_fn_purchase_orders_incoming(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: trg_fn_so_reserved_qty(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: trg_fn_sol_reserved_qty(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: trg_recalc_ar_payment_status(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: update_pending_service_change(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_pending_service_change(p_request_id uuid, p_new_changes jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_profile_id UUID;
  v_req        RECORD;
BEGIN
  -- Resolve profile_id
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  SELECT * INTO v_req FROM service_change_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.requested_by != v_profile_id THEN
    RAISE EXCEPTION 'Only the requester can update this request';
  END IF;
  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (status: %)', v_req.status;
  END IF;

  UPDATE service_change_requests
  SET changes = p_new_changes, updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: update_reserved_qty(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: update_tl_payment_batches_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tl_payment_batches_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_workflow_step_role(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

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

  UPDATE workflow_approval_steps
  SET role_id    = p_role_id,
      step_label = v_role_name
  WHERE id = p_step_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;


--
-- Name: upsert_employee_services(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_employee_services(p_employee_id uuid, p_service_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM employee_services WHERE employee_id = p_employee_id;
  IF array_length(p_service_ids, 1) > 0 THEN
    INSERT INTO employee_services (employee_id, service_id)
    SELECT p_employee_id, unnest(p_service_ids);
  END IF;
END;
$$;


--
-- Name: upsert_package_with_services(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_package_with_services(p_package jsonb, p_services jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF (p_package->>'id') IS NOT NULL THEN
    -- UPDATE existing package
    v_id := (p_package->>'id')::uuid;
    UPDATE subscription_packages SET
      name               = p_package->>'name',
      name_ar            = NULLIF(p_package->>'name_ar', ''),
      description        = NULLIF(p_package->>'description', ''),
      discount_percent   = (p_package->>'discount_percent')::numeric,
      initial_fee        = (p_package->>'initial_fee')::numeric,
      duration_months    = (p_package->>'duration_months')::int,
      priority_response  = p_package->>'priority_response',
      response_hours     = CASE
                             WHEN p_package->>'response_hours' IS NULL THEN NULL
                             ELSE (p_package->>'response_hours')::int
                           END,
      auto_renew_default = (p_package->>'auto_renew_default')::boolean,
      updated_at         = now()
    WHERE id = v_id;
  ELSE
    -- INSERT new package
    INSERT INTO subscription_packages (
      name, name_ar, description,
      discount_percent, initial_fee, duration_months,
      priority_response, response_hours, auto_renew_default,
      created_by_name
    ) VALUES (
      p_package->>'name',
      NULLIF(p_package->>'name_ar', ''),
      NULLIF(p_package->>'description', ''),
      (p_package->>'discount_percent')::numeric,
      (p_package->>'initial_fee')::numeric,
      (p_package->>'duration_months')::int,
      p_package->>'priority_response',
      CASE
        WHEN p_package->>'response_hours' IS NULL THEN NULL
        ELSE (p_package->>'response_hours')::int
      END,
      (p_package->>'auto_renew_default')::boolean,
      NULLIF(p_package->>'created_by_name', '')
    )
    RETURNING id INTO v_id;
  END IF;

  -- Atomically replace all services for this package
  DELETE FROM subscription_package_services WHERE package_id = v_id;

  INSERT INTO subscription_package_services (package_id, service_id, discount_override)
  SELECT
    v_id,
    (svc->>'service_id')::uuid,
    CASE
      WHEN svc->>'discount_override' IS NULL THEN NULL
      ELSE (svc->>'discount_override')::numeric
    END
  FROM jsonb_array_elements(p_services) AS svc;

  RETURN v_id;
END;
$$;


--
-- Name: user_can_action_adjustment_step(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_can_action_adjustment_step(p_profile_id uuid, p_step_role text, p_warehouse_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    -- Admin override
    EXISTS (
      SELECT 1
      FROM   user_custom_roles ucr
      JOIN   custom_roles cr ON cr.id = ucr.role_id
      WHERE  ucr.profile_id = p_profile_id
        AND  cr.name = 'Admin'
        AND  cr.deleted_at IS NULL
    )
    -- Responsible person: warehouse field RP
    OR (
      p_step_role = 'responsible_person'
      AND EXISTS (
        SELECT 1 FROM warehouse_field_rps
        WHERE  profile_id   = p_profile_id
          AND  warehouse_id = p_warehouse_id
      )
    )
    -- Dynamic: user holds the role currently bound to this step
    OR (
      p_step_role <> 'responsible_person'
      AND EXISTS (
        SELECT 1
        FROM   workflow_approval_steps was
        JOIN   user_custom_roles      ucr ON ucr.role_id = was.role_id
        WHERE  was.workflow    = 'stock_adj'
          AND  was.step_key    = p_step_role
          AND  was.archived_at IS NULL
          AND  ucr.profile_id  = p_profile_id
      )
    )
$$;


--
-- Name: user_has_approval_role_in_scope(uuid, text[], text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: validate_lc_allocation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: withdraw_service_change(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.withdraw_service_change(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_profile_id UUID;
  v_req        RECORD;
BEGIN
  -- Resolve profile_id
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or profile not found';
  END IF;

  SELECT * INTO v_req FROM service_change_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.requested_by != v_profile_id THEN
    RAISE EXCEPTION 'Only the requester can withdraw this request';
  END IF;
  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'Request is not pending (status: %)', v_req.status;
  END IF;

  DELETE FROM service_change_requests WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


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
-- Name: approval_chain_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_chain_tiers (
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
-- Name: approval_chains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_chains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    division_id uuid,
    name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    archived_at timestamp with time zone
);


--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: brand_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand_group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: brand_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    name_ar text,
    scope text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    deleted_at timestamp with time zone
);


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    name_ar text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: contract_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    service_name text NOT NULL,
    scheduled_date date NOT NULL,
    team_id uuid,
    completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    contract_service_id uuid
);


--
-- Name: contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id text,
    customer_id uuid,
    site_name text DEFAULT ''::text NOT NULL,
    divisions text[] DEFAULT '{}'::text[],
    services_summary text,
    agent_name text,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status public.contract_status DEFAULT 'active'::public.contract_status,
    monthly_value numeric DEFAULT 0,
    total_value numeric DEFAULT 0,
    total_visits integer DEFAULT 0,
    completed_visits integer DEFAULT 0,
    total_payments numeric DEFAULT 0,
    paid_amount numeric DEFAULT 0,
    payment_schedule text,
    has_signed_doc boolean DEFAULT false,
    area_count integer DEFAULT 0,
    cancelled_date date,
    cancel_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    quotation_number text,
    source_type text DEFAULT 'direct'::text NOT NULL,
    building_tree jsonb DEFAULT '{"nodes": []}'::jsonb NOT NULL,
    discount numeric DEFAULT 0 NOT NULL,
    payment_mode text DEFAULT 'fixed'::text NOT NULL,
    payment_frequency text DEFAULT 'monthly'::text NOT NULL,
    notes text,
    signed_doc_url text,
    terms_snapshot jsonb,
    approved_by uuid,
    approved_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_by uuid,
    rejected_reason text,
    rejected_by uuid,
    rejected_at timestamp with time zone,
    last_saved_session text,
    service_customer_id uuid,
    phone_id uuid,
    terms_pdf_url text,
    customer_name text,
    phone text,
    address text
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
    CONSTRAINT customers_entity_type_check CHECK ((entity_type = ANY (ARRAY['individual'::text, 'business'::text]))),
    CONSTRAINT customers_type_check CHECK (((customer_type = ANY (ARRAY['cash'::text, 'credit'::text])) OR (customer_type IS NULL)))
);


--
-- Name: divisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.divisions (
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
-- Name: follow_up_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_up_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_number text NOT NULL,
    parent_order_id uuid NOT NULL,
    requested_by_user_id uuid NOT NULL,
    requested_team_id uuid NOT NULL,
    requested_date date,
    requested_time_from time without time zone,
    requested_time_to time without time zone,
    time_note text,
    services_to_followup jsonb NOT NULL,
    notes text,
    status public.follow_up_request_status DEFAULT 'pending'::public.follow_up_request_status NOT NULL,
    confirmed_by_user_id uuid,
    confirmed_at timestamp with time zone,
    resulting_order_id uuid,
    cancelled_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_fur_time_pair CHECK (((requested_time_from IS NULL) = (requested_time_to IS NULL))),
    CONSTRAINT chk_fur_when_present CHECK ((((requested_date IS NOT NULL) AND (requested_time_from IS NOT NULL)) OR (time_note IS NOT NULL)))
);


--
-- Name: order_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    service_id uuid,
    name text NOT NULL,
    path text[] DEFAULT '{}'::text[],
    qty integer DEFAULT 1,
    price numeric DEFAULT 0,
    duration integer,
    configuration jsonb,
    created_at timestamp with time zone DEFAULT now(),
    from_time time without time zone,
    to_time time without time zone
);


--
-- Name: order_team_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_team_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    team_id uuid NOT NULL,
    services jsonb NOT NULL,
    scheduled_date date NOT NULL,
    time_slot text,
    duration text,
    created_at timestamp with time zone DEFAULT now(),
    is_full_day boolean DEFAULT false NOT NULL,
    parent_assignment_id uuid
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id text NOT NULL,
    customer_id uuid,
    type text DEFAULT 'order'::text,
    division text NOT NULL,
    status public.order_status DEFAULT 'scheduled'::public.order_status,
    confirmation_status public.confirmation_status DEFAULT 'not_sent'::public.confirmation_status,
    confirmation_sent_at timestamp with time zone,
    scheduled_date date NOT NULL,
    scheduled_end_date date,
    scheduled_time text,
    visit_date date,
    total_amount numeric DEFAULT 0,
    agent_name text,
    notes text,
    address text,
    has_invoice boolean DEFAULT false,
    invoice_number text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    arrival_phone text,
    attachments jsonb DEFAULT '[]'::jsonb,
    service_customer_id uuid NOT NULL,
    address_id uuid,
    completed_at timestamp with time zone,
    completed_by uuid,
    parent_order_id uuid,
    follow_up_request_id uuid
);


--
-- Name: service_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    name_ar text,
    legacy_customer_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_blocked boolean DEFAULT false NOT NULL,
    customer_type text DEFAULT 'individual'::text NOT NULL,
    pending_payment_amount numeric DEFAULT 0 NOT NULL,
    referral_source text,
    CONSTRAINT service_customers_customer_type_check CHECK ((customer_type = ANY (ARRAY['individual'::text, 'business'::text])))
);


--
-- Name: site_visit_team_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_visit_team_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visit_id uuid NOT NULL,
    team_id uuid NOT NULL,
    scheduled_date date,
    time_slot text,
    duration text DEFAULT '1'::text,
    services jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: site_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visit_id text NOT NULL,
    customer_id uuid,
    phone_id uuid,
    status text DEFAULT 'scheduled'::text NOT NULL,
    mode text DEFAULT 'normal'::text NOT NULL,
    scheduled_date date,
    address text,
    notes text,
    arrival_phone text,
    attachments jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    service_customer_id uuid NOT NULL,
    completed_at timestamp with time zone,
    completed_by uuid
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    tag public.team_tag DEFAULT 'normal'::public.team_tag,
    vehicle_id uuid,
    schedule_id uuid,
    schedule_start integer DEFAULT 7,
    schedule_end integer DEFAULT 17,
    leader_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_emergency boolean DEFAULT false NOT NULL,
    is_qc boolean DEFAULT false NOT NULL,
    traccar_device_id text,
    deleted_at timestamp with time zone,
    name_en text DEFAULT ''::text NOT NULL,
    name_ar text,
    phone text,
    site_visit_order boolean DEFAULT false NOT NULL,
    site_visit_quotation boolean DEFAULT false NOT NULL,
    division_id uuid,
    is_normal boolean DEFAULT false NOT NULL,
    CONSTRAINT check_qc_exclusive CHECK ((NOT (is_qc AND (is_normal OR is_emergency))))
);


--
-- Name: calendar_visits; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.calendar_visits WITH (security_invoker='true') AS
 SELECT ota.id,
    'order'::text AS source_type,
    ota.team_id,
    d.slug AS division,
    t.is_qc,
    ota.scheduled_date AS visit_date,
        CASE
            WHEN (ota.time_slot ~ '^\d{2}:\d{2}'::text) THEN (ota.time_slot)::time without time zone
            WHEN (o.scheduled_time ~ '^\d{2}:\d{2}'::text) THEN (o.scheduled_time)::time without time zone
            ELSE NULL::time without time zone
        END AS start_time,
        CASE
            WHEN ((ota.time_slot ~ '^\d{2}:\d{2}'::text) AND (ota.duration ~ '^\d+$'::text)) THEN ((ota.time_slot)::time without time zone + ((GREATEST(1, (ota.duration)::integer))::double precision * '01:00:00'::interval))
            WHEN (ota.time_slot ~ '^\d{2}:\d{2}'::text) THEN ((ota.time_slot)::time without time zone + '02:00:00'::interval)
            WHEN (o.scheduled_time ~ '^\d{2}:\d{2}'::text) THEN ((o.scheduled_time)::time without time zone + '02:00:00'::interval)
            ELSE NULL::time without time zone
        END AS end_time,
    COALESCE(o.type, 'normal_order'::text) AS visit_type,
    COALESCE((o.status)::text, 'scheduled'::text) AS status,
    COALESCE(sc.name, c.name) AS customer_name,
    COALESCE(o.service_customer_id, c.id) AS customer_id,
    NULL::uuid AS service_id,
    o.order_id AS order_number,
    o.arrival_phone AS customer_phone,
    ( SELECT string_agg((((os.qty)::text || '× '::text) || os.name), ', '::text ORDER BY os.name) AS string_agg
           FROM public.order_services os
          WHERE (os.order_id = o.id)) AS services_summary,
    o.id AS source_id
   FROM (((((public.order_team_assignments ota
     JOIN public.orders o ON ((o.id = ota.order_id)))
     JOIN public.teams t ON ((t.id = ota.team_id)))
     JOIN public.divisions d ON ((d.id = t.division_id)))
     LEFT JOIN public.customers c ON ((c.id = o.customer_id)))
     LEFT JOIN public.service_customers sc ON ((sc.id = o.service_customer_id)))
UNION ALL
 SELECT cv.id,
    'contract_visit'::text AS source_type,
    cv.team_id,
    d.slug AS division,
    t.is_qc,
    cv.scheduled_date AS visit_date,
    NULL::time without time zone AS start_time,
    NULL::time without time zone AS end_time,
    'contract_visit'::text AS visit_type,
        CASE
            WHEN cv.completed THEN 'completed'::text
            ELSE 'scheduled'::text
        END AS status,
    c.name AS customer_name,
    c.id AS customer_id,
    NULL::uuid AS service_id,
    NULL::text AS order_number,
    NULL::text AS customer_phone,
    NULL::text AS services_summary,
    cv.contract_id AS source_id
   FROM ((((public.contract_visits cv
     JOIN public.teams t ON ((t.id = cv.team_id)))
     JOIN public.divisions d ON ((d.id = t.division_id)))
     LEFT JOIN public.contracts con ON ((con.id = cv.contract_id)))
     LEFT JOIN public.customers c ON ((c.id = con.customer_id)))
  WHERE (cv.team_id IS NOT NULL)
UNION ALL
 SELECT svta.id,
    'site_visit'::text AS source_type,
    svta.team_id,
    d.slug AS division,
    t.is_qc,
    svta.scheduled_date AS visit_date,
        CASE
            WHEN (svta.time_slot ~ '^\d{2}:\d{2}'::text) THEN (svta.time_slot)::time without time zone
            ELSE NULL::time without time zone
        END AS start_time,
        CASE
            WHEN ((svta.time_slot ~ '^\d{2}:\d{2}'::text) AND (svta.duration ~ '^\d+$'::text)) THEN ((svta.time_slot)::time without time zone + ((GREATEST(1, (svta.duration)::integer))::double precision * '01:00:00'::interval))
            WHEN (svta.time_slot ~ '^\d{2}:\d{2}'::text) THEN ((svta.time_slot)::time without time zone + '01:00:00'::interval)
            ELSE NULL::time without time zone
        END AS end_time,
    'site_visit'::text AS visit_type,
    sv.status,
    COALESCE(sc.name, c.name) AS customer_name,
    COALESCE(sv.service_customer_id, c.id) AS customer_id,
    NULL::uuid AS service_id,
    sv.visit_id AS order_number,
    sv.arrival_phone AS customer_phone,
    'Site Visit'::text AS services_summary,
    sv.id AS source_id
   FROM (((((public.site_visit_team_assignments svta
     JOIN public.site_visits sv ON ((sv.id = svta.visit_id)))
     JOIN public.teams t ON ((t.id = svta.team_id)))
     JOIN public.divisions d ON ((d.id = t.division_id)))
     LEFT JOIN public.customers c ON ((c.id = sv.customer_id)))
     LEFT JOIN public.service_customers sc ON ((sc.id = sv.service_customer_id)))
UNION ALL
 SELECT fur.id,
    'follow_up_request'::text AS source_type,
    fur.requested_team_id AS team_id,
    d.slug AS division,
    t.is_qc,
    fur.requested_date AS visit_date,
    fur.requested_time_from AS start_time,
    fur.requested_time_to AS end_time,
    'follow_up_request'::text AS visit_type,
    (fur.status)::text AS status,
    COALESCE(sc.name, c.name, 'Unknown'::text) AS customer_name,
    COALESCE(parent.service_customer_id, c.id) AS customer_id,
    NULL::uuid AS service_id,
    fur.request_number AS order_number,
    NULL::text AS customer_phone,
    ( SELECT string_agg((elem.value ->> 'name'::text), ', '::text) AS string_agg
           FROM jsonb_array_elements(fur.services_to_followup) elem(value)) AS services_summary,
    fur.id AS source_id
   FROM (((((public.follow_up_requests fur
     JOIN public.teams t ON ((t.id = fur.requested_team_id)))
     JOIN public.divisions d ON ((d.id = t.division_id)))
     LEFT JOIN public.orders parent ON ((parent.id = fur.parent_order_id)))
     LEFT JOIN public.customers c ON ((c.id = parent.customer_id)))
     LEFT JOIN public.service_customers sc ON ((sc.id = parent.service_customer_id)))
  WHERE ((fur.status = 'pending'::public.follow_up_request_status) AND (fur.requested_date IS NOT NULL) AND (fur.requested_time_from IS NOT NULL) AND (fur.requested_time_to IS NOT NULL));


--
-- Name: VIEW calendar_visits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.calendar_visits IS 'Unified calendar over orders + contract_visits + site_visits + pending follow_up_requests. Read-only. `id` is the row id within the source table; `source_id` is the canonical id of the underlying record (orders.id, site_visits.id, etc.).';


--
-- Name: call_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    call_id text NOT NULL,
    agent_extension text,
    agent_name text,
    customer_phone text NOT NULL,
    direction text,
    status text,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    duration_seconds integer,
    recording_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    initiated_by uuid,
    CONSTRAINT call_records_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT call_records_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'answered'::text, 'missed'::text, 'rejected'::text])))
);


--
-- Name: COLUMN call_records.initiated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.call_records.initiated_by IS 'Agent who dialed (outbound) or claimed (inbound). NULL if abandoned or never picked up.';


--
-- Name: chat_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid,
    last_message text,
    last_message_at timestamp with time zone,
    unread_count integer DEFAULT 0,
    channel public.message_source,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    conversation_type text DEFAULT 'customer'::text NOT NULL,
    wati_phone text,
    wati_contact_name text,
    assigned_agent text,
    is_opened boolean DEFAULT false NOT NULL,
    wati_status text DEFAULT 'open'::text NOT NULL,
    provider text DEFAULT 'wati'::text NOT NULL,
    customer_id_v2 uuid,
    unknown_phone text,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    last_message_from_type text,
    unanswered_dismissed_at timestamp with time zone,
    CONSTRAINT chat_conversations_conversation_type_check CHECK ((conversation_type = ANY (ARRAY['customer'::text, 'team'::text]))),
    CONSTRAINT chat_conversations_last_message_from_type_check CHECK (((last_message_from_type IS NULL) OR (last_message_from_type = ANY (ARRAY['agent'::text, 'customer'::text])))),
    CONSTRAINT chat_conversations_provider_check CHECK ((provider = ANY (ARRAY['wati'::text, 'whapi'::text])))
);

ALTER TABLE ONLY public.chat_conversations REPLICA IDENTITY FULL;


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    text text,
    from_type text NOT NULL,
    agent_name text,
    source public.message_source NOT NULL,
    attachments jsonb,
    call_metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    delivery_status text DEFAULT 'sending'::text,
    external_id text,
    reply_to_external_id text,
    sent_by_profile_id uuid,
    reactions jsonb DEFAULT '[]'::jsonb NOT NULL,
    message_kind text DEFAULT 'message'::text NOT NULL,
    phone_id uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    purge_batch_id uuid,
    wamid text,
    CONSTRAINT chat_messages_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['sending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.chat_messages REPLICA IDENTITY FULL;


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
-- Name: contract_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contract_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contract_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    name text NOT NULL,
    percentage numeric DEFAULT 0 NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    due_date date,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contract_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    due_date date NOT NULL,
    amount numeric NOT NULL,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: contract_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    service_id uuid,
    building_node_id text,
    service_name text NOT NULL,
    service_path text[] DEFAULT '{}'::text[],
    brand_id uuid,
    brand_name text,
    reliability_factor numeric DEFAULT 1.0 NOT NULL,
    condition text,
    condition_factor numeric DEFAULT 1.0 NOT NULL,
    frequency text DEFAULT 'monthly'::text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    base_price numeric DEFAULT 0 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    total_price numeric DEFAULT 0 NOT NULL,
    divisions text[] DEFAULT '{}'::text[],
    note text,
    is_general boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    contract_type text DEFAULT 'preventive'::text,
    item_kind text DEFAULT 'service'::text,
    pricing_mode text DEFAULT 'by_condition'::text,
    discount numeric DEFAULT 0,
    discount_scope text DEFAULT 'services_only'::text,
    price_unit text,
    CONSTRAINT contract_services_contract_type_check CHECK ((contract_type = ANY (ARRAY['preventive'::text, 'area'::text, 'general'::text]))),
    CONSTRAINT contract_services_discount_check CHECK ((discount >= (0)::numeric)),
    CONSTRAINT contract_services_discount_scope_check CHECK ((discount_scope = ANY (ARRAY['services_only'::text, 'services_and_products'::text]))),
    CONSTRAINT contract_services_item_kind_check CHECK ((item_kind = ANY (ARRAY['service'::text, 'product'::text]))),
    CONSTRAINT contract_services_pricing_mode_check CHECK ((pricing_mode = ANY (ARRAY['fixed'::text, 'by_condition'::text])))
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
-- Name: credit_group_customer_counts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.credit_group_customer_counts WITH (security_invoker='true') AS
 SELECT credit_group_id,
    (count(*))::integer AS customer_count
   FROM public.customers
  WHERE (credit_group_id IS NOT NULL)
  GROUP BY credit_group_id;


--
-- Name: credit_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    credit_limit numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_methods text[] DEFAULT '{}'::text[] NOT NULL,
    max_days integer
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
    refund_method public.payment_method,
    refund_reference text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    note_type text DEFAULT 'credit'::text NOT NULL,
    source_return_id uuid,
    supplier_name text,
    original_total numeric,
    new_total numeric
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
    is_approval_slot boolean DEFAULT false NOT NULL
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
-- Name: customer_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    reason text NOT NULL,
    notes text,
    image_url text,
    blocked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
    CONSTRAINT invoices_direction_check CHECK ((direction = ANY (ARRAY['ar'::text, 'ap'::text]))),
    CONSTRAINT invoices_doc_status_check CHECK ((doc_status = ANY (ARRAY['draft'::text, 'ready_to_send'::text, 'sent'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT invoices_invoice_type_check CHECK ((invoice_type = ANY (ARRAY['cash'::text, 'credit'::text]))),
    CONSTRAINT invoices_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'partially_paid'::text, 'paid'::text, 'overdue'::text])))
);


--
-- Name: COLUMN invoices.phone_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoices.phone_id IS 'Phone number the invoice was generated from. Populated from the source record (orders.phone_id, contracts.phone_id) at creation time. NULL means no phone trail exists (manual invoices, sale-order invoices, etc.).';


--
-- Name: customer_invoices; Type: VIEW; Schema: public; Owner: -
--

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
-- Name: customer_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    package_id uuid NOT NULL,
    price_paid numeric(10,2) NOT NULL,
    discount_percent_snapshot numeric(5,2) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    auto_renew boolean DEFAULT true NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dibsy_payment_id text,
    dibsy_checkout_url text,
    CONSTRAINT chk_cs_date_range CHECK ((end_date >= start_date)),
    CONSTRAINT customer_subscriptions_status_check CHECK ((status = ANY (ARRAY['pending_payment'::text, 'active'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: service_customer_phones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_customer_phones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    phone text NOT NULL,
    label text,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customers_with_multi_phones; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.customers_with_multi_phones WITH (security_invoker='true') AS
 SELECT customer_id
   FROM public.service_customer_phones
  GROUP BY customer_id
 HAVING (count(*) > 1);


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
-- Name: employee_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_services (
    employee_id uuid NOT NULL,
    service_id uuid NOT NULL
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
    warehouse_id uuid
);


--
-- Name: follow_up_order_seq_2026_06; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.follow_up_order_seq_2026_06
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: follow_up_request_seq_2026; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.follow_up_request_seq_2026
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: installed_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.installed_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    phone_id uuid NOT NULL,
    address_id uuid,
    order_id uuid NOT NULL,
    product_name character varying(255) NOT NULL,
    brand character varying(100),
    model character varying(100),
    serial_number character varying(100),
    installed_at date NOT NULL,
    warranty_months integer DEFAULT 0 NOT NULL,
    warranty_expires_at date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instructions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name_en text NOT NULL,
    name_ar text,
    type public.instruction_type NOT NULL,
    content_type public.instruction_content_type DEFAULT 'text'::public.instruction_content_type,
    content_preview text,
    full_content text,
    pdf_file_name text,
    linked_service_ids uuid[] DEFAULT '{}'::uuid[],
    status public.service_status DEFAULT 'active'::public.service_status,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
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
    parent_id uuid
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
-- Name: inventory_check_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_check_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


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
-- Name: lc_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lc_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_download_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_download_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    attachment_index integer NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    scheduled_for timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    done_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_download_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'in_progress'::text, 'done'::text, 'failed'::text])))
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
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: order_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    action text NOT NULL,
    user_name text,
    details text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: order_visit_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_visit_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    visit_date date NOT NULL,
    from_time time without time zone,
    to_time time without time zone,
    sort_order smallint DEFAULT 0 NOT NULL
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
    method public.payment_method NOT NULL,
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
    snapshot_label text DEFAULT 'manual'::text NOT NULL
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
    threecx_extension text
);


--
-- Name: COLUMN profiles.must_change_password; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.must_change_password IS 'True when an admin-created password or admin-reset password is still in place; cleared when the user sets their own password via /change-password. JWT user_metadata is the enforcement source of truth; this column mirrors it for admin-UI visibility.';


--
-- Name: promotion_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    applicable_to text DEFAULT 'all'::text,
    divisions text[],
    start_date date NOT NULL,
    end_date date NOT NULL,
    status public.campaign_status DEFAULT 'scheduled'::public.campaign_status,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: promotion_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    type public.promotion_rule_type NOT NULL,
    service_ids text[],
    discount_percent numeric,
    discount_amount numeric,
    free_service_id text,
    free_service_name text,
    description text,
    created_at timestamp with time zone DEFAULT now()
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
    po_type public.po_type DEFAULT 'draft'::public.po_type NOT NULL
);


--
-- Name: purge_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purge_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    performed_by uuid NOT NULL,
    filter_payload jsonb NOT NULL,
    message_count integer NOT NULL,
    attachment_bytes bigint DEFAULT 0 NOT NULL,
    soft_deleted_at timestamp with time zone DEFAULT now() NOT NULL,
    hard_deleted_at timestamp with time zone,
    restored_at timestamp with time zone
);


--
-- Name: qb_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qb_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    qb_id text NOT NULL,
    name text NOT NULL,
    acct_num text,
    account_type text NOT NULL,
    account_sub_type text,
    classification text NOT NULL,
    fully_qualified_name text,
    active boolean DEFAULT true NOT NULL,
    current_balance numeric,
    qb_company text DEFAULT 'alfaytri'::text NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qb_division_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qb_division_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    division text NOT NULL,
    mapping_type text NOT NULL,
    mapping_key text,
    qb_account_id uuid,
    qb_item_id uuid,
    qb_company text DEFAULT 'alfaytri'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qb_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qb_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    qb_id text NOT NULL,
    name text NOT NULL,
    type text,
    income_account_ref text,
    expense_account_ref text,
    active boolean DEFAULT true NOT NULL,
    qb_company text DEFAULT 'alfaytri'::text NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qc_checklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qc_checklists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid,
    service_name text,
    is_general boolean DEFAULT false,
    label text NOT NULL,
    max_score integer DEFAULT 10,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: qc_inspection_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qc_inspection_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_entry_id uuid NOT NULL,
    order_id text NOT NULL,
    team_id uuid NOT NULL,
    qc_team_id uuid NOT NULL,
    date date NOT NULL,
    service_checklist jsonb DEFAULT '[]'::jsonb,
    general_checklist jsonb DEFAULT '[]'::jsonb,
    total_score integer DEFAULT 0,
    max_possible_score integer DEFAULT 0,
    percentage integer DEFAULT 0,
    notes text,
    images text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: qc_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qc_schedule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id text NOT NULL,
    order_type text DEFAULT 'one-time'::text,
    team_id uuid NOT NULL,
    service_name text NOT NULL,
    scheduled_date date NOT NULL,
    status public.qc_schedule_status DEFAULT 'pending'::public.qc_schedule_status,
    priority public.qc_priority DEFAULT 'medium'::public.qc_priority,
    reason text,
    assigned_qc_team_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: qc_team_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qc_team_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    division public.division NOT NULL,
    current_score integer DEFAULT 0,
    total_inspections integer DEFAULT 0,
    last_inspection date,
    member_change_date date,
    previous_scores jsonb DEFAULT '[]'::jsonb,
    service_history text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: quotation_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotation_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quotation_id uuid NOT NULL,
    service_id uuid,
    name text NOT NULL,
    path text[] DEFAULT '{}'::text[] NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    price numeric NOT NULL,
    duration integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: quotation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quotation_id uuid NOT NULL,
    action text NOT NULL,
    user_name text,
    details text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: quotation_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quotation_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quotation_id text NOT NULL,
    customer_id uuid,
    division text,
    services_summary text,
    agent_name text,
    created_date date NOT NULL,
    expiry_date date NOT NULL,
    sent_date timestamp with time zone,
    status public.quotation_status DEFAULT 'draft'::public.quotation_status,
    total_amount numeric DEFAULT 0,
    line_item_count integer DEFAULT 0,
    has_configurable boolean DEFAULT false,
    converted_order_id uuid,
    approved_by_manager boolean DEFAULT false,
    approved_by_customer boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    notes text,
    service_customer_id uuid NOT NULL,
    discount_type text DEFAULT 'flat'::text NOT NULL,
    discount_value numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT quotations_discount_type_check CHECK ((discount_type = ANY (ARRAY['flat'::text, 'percent'::text])))
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
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: reminder_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    icon text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    name_ar text,
    description text,
    template text,
    channel public.reminder_channel DEFAULT 'Email'::public.reminder_channel,
    timing text,
    status public.service_status DEFAULT 'active'::public.service_status,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
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
    dispatched_at timestamp with time zone
);


--
-- Name: rfq_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rfq_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rfq_id uuid NOT NULL,
    item_name text NOT NULL,
    sku text,
    qty integer NOT NULL,
    unit text NOT NULL,
    target_price numeric,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: rfq_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rfq_quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rfq_id uuid NOT NULL,
    supplier_id text NOT NULL,
    supplier_name text NOT NULL,
    currency text DEFAULT 'QAR'::text,
    items jsonb NOT NULL,
    total_amount numeric DEFAULT 0,
    received_date date,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: rfqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rfqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rfq_number text NOT NULL,
    title text NOT NULL,
    status public.rfq_status DEFAULT 'draft'::public.rfq_status,
    created_date date NOT NULL,
    due_date date NOT NULL,
    suppliers text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
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
    created_by_name text
);


--
-- Name: sale_delivery_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sale_delivery_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


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
    division_id uuid
);


--
-- Name: schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    days jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: service_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    reliability_factor numeric DEFAULT 1.0 NOT NULL,
    is_reliable boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_change_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_change_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid,
    division text[],
    change_type public.service_change_type NOT NULL,
    changes jsonb NOT NULL,
    status public.service_change_status DEFAULT 'pending'::public.service_change_status NOT NULL,
    requested_by uuid NOT NULL,
    reviewed_by uuid,
    rejection_reason text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scr_add_no_service_id CHECK (((change_type <> 'add'::public.service_change_type) OR (service_id IS NULL))),
    CONSTRAINT scr_edit_delete_require_service_id CHECK (((change_type = 'add'::public.service_change_type) OR (service_id IS NOT NULL))),
    CONSTRAINT scr_rejection_reason_required CHECK (((status <> 'rejected'::public.service_change_status) OR (rejection_reason IS NOT NULL)))
);


--
-- Name: service_customer_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_customer_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    address_type text NOT NULL,
    label text,
    unit text,
    building text,
    street text,
    zone text,
    lat numeric,
    lng numeric,
    is_primary boolean DEFAULT false NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_geocoded boolean DEFAULT true NOT NULL,
    waze_link text,
    phone_id uuid,
    CONSTRAINT service_customer_addresses_address_type_check CHECK ((address_type = ANY (ARRAY['blue-plate'::text, 'google-coords'::text])))
);


--
-- Name: service_instructions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_instructions (
    service_id uuid NOT NULL,
    instruction_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    brand_variant_id uuid NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    link_type text DEFAULT 'consumable'::text NOT NULL,
    warranty_months integer DEFAULT 0 NOT NULL,
    group_label text,
    is_default boolean DEFAULT false NOT NULL,
    CONSTRAINT service_inventory_link_type_check CHECK ((link_type = ANY (ARRAY['supply'::text, 'consumable'::text])))
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    name_en text NOT NULL,
    name_ar text,
    code text,
    price numeric,
    emergency_price numeric,
    duration integer,
    warranty integer,
    category public.service_category,
    status public.service_status DEFAULT 'active'::public.service_status,
    division text[] DEFAULT '{}'::text[],
    service_type public.service_type DEFAULT 'standard'::public.service_type,
    contract_type public.contract_type,
    price_unit text,
    discount numeric,
    brands_supported integer,
    includes_notes boolean DEFAULT false,
    spare_parts boolean DEFAULT false,
    qc_checklist boolean DEFAULT false,
    instructions boolean DEFAULT false,
    reminder_days integer,
    invoice_text_en text,
    invoice_text_ar text,
    booking_time_matrix jsonb,
    inventory_items jsonb,
    components jsonb,
    tree_type text DEFAULT 'normal'::text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    catalog_image_url text,
    legacy_service_id text,
    qc_items jsonb,
    photo_requirement text DEFAULT 'none'::text,
    has_pending_change boolean DEFAULT false NOT NULL,
    item_kind text DEFAULT 'service'::text,
    pricing_mode text DEFAULT 'by_condition'::text,
    discount_scope text DEFAULT 'services_only'::text,
    CONSTRAINT services_discount_scope_check CHECK ((discount_scope = ANY (ARRAY['services_only'::text, 'services_and_products'::text]))),
    CONSTRAINT services_item_kind_check CHECK ((item_kind = ANY (ARRAY['service'::text, 'product'::text]))),
    CONSTRAINT services_pricing_mode_check CHECK ((pricing_mode = ANY (ARRAY['fixed'::text, 'by_condition'::text])))
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
    carrier text NOT NULL,
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
-- Name: site_visit_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_visit_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visit_id uuid NOT NULL,
    visit_date date NOT NULL,
    from_time time without time zone,
    to_time time without time zone,
    sort_order smallint DEFAULT 0
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
-- Name: subscription_package_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_package_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    package_id uuid NOT NULL,
    service_id uuid NOT NULL,
    discount_override numeric(5,2),
    CONSTRAINT subscription_package_services_discount_override_check CHECK (((discount_override IS NULL) OR ((discount_override >= (0)::numeric) AND (discount_override <= (100)::numeric))))
);


--
-- Name: subscription_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    name_ar text,
    description text,
    discount_percent numeric(5,2) DEFAULT 0 NOT NULL,
    initial_fee numeric(10,2) DEFAULT 0 NOT NULL,
    duration_months integer DEFAULT 12 NOT NULL,
    priority_response text DEFAULT 'none'::text NOT NULL,
    response_hours integer,
    auto_renew_default boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_sp_duration CHECK ((duration_months >= 1)),
    CONSTRAINT subscription_packages_discount_percent_check CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric))),
    CONSTRAINT subscription_packages_initial_fee_check CHECK ((initial_fee >= (0)::numeric)),
    CONSTRAINT subscription_packages_priority_response_check CHECK ((priority_response = ANY (ARRAY['none'::text, '24_48hr'::text, 'under_24hr'::text]))),
    CONSTRAINT subscription_packages_response_hours_check CHECK (((response_hours IS NULL) OR ((response_hours >= 1) AND (response_hours <= 168))))
);


--
-- Name: subscription_packages_with_counts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.subscription_packages_with_counts WITH (security_invoker='true') AS
 SELECT sp.id,
    sp.name,
    sp.name_ar,
    sp.description,
    sp.discount_percent,
    sp.initial_fee,
    sp.duration_months,
    sp.priority_response,
    sp.response_hours,
    sp.auto_renew_default,
    sp.is_active,
    sp.created_by_name,
    sp.created_at,
    sp.updated_at,
    COALESCE(sub_cnt.active_subscribers, 0) AS subscriber_count,
    COALESCE(svc_cnt.service_count, 0) AS service_count
   FROM ((public.subscription_packages sp
     LEFT JOIN ( SELECT customer_subscriptions.package_id,
            (count(*))::integer AS active_subscribers
           FROM public.customer_subscriptions
          WHERE (customer_subscriptions.status = 'active'::text)
          GROUP BY customer_subscriptions.package_id) sub_cnt ON ((sub_cnt.package_id = sp.id)))
     LEFT JOIN ( SELECT subscription_package_services.package_id,
            (count(*))::integer AS service_count
           FROM public.subscription_package_services
          GROUP BY subscription_package_services.package_id) svc_cnt ON ((svc_cnt.package_id = sp.id)));


--
-- Name: subscription_usage_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_usage_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    order_id uuid NOT NULL,
    service_id uuid NOT NULL,
    discount_applied numeric(5,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: supplier_bills; Type: VIEW; Schema: public; Owner: -
--

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
-- Name: sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_state (
    id text DEFAULT 'singleton'::text NOT NULL,
    last_3cx_sync_at timestamp with time zone DEFAULT '2020-01-01 00:00:00+00'::timestamp with time zone,
    last_wati_sync_at timestamp with time zone DEFAULT '2020-01-01 00:00:00+00'::timestamp with time zone,
    last_whapi_sync_at timestamp with time zone DEFAULT '2020-01-01 00:00:00+00'::timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: team_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    before_data jsonb,
    after_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: team_live_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_live_locations (
    team_id uuid NOT NULL,
    lat numeric(10,7) NOT NULL,
    lng numeric(10,7) NOT NULL,
    accuracy double precision,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    speed double precision,
    heading double precision
);


--
-- Name: team_schedule_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_schedule_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    schedule_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tl_invoice_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tl_invoice_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tl_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tl_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number text NOT NULL,
    visit_id uuid NOT NULL,
    order_id text,
    customer_name text NOT NULL,
    customer_phone text,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    total_amount numeric DEFAULT 0 NOT NULL,
    payment_method_id uuid,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    dibsy_payment_id text,
    dibsy_checkout_url text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tl_invoices_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'paid'::text])))
);


--
-- Name: tl_payment_batch_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tl_payment_batch_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    tl_invoice_id uuid NOT NULL,
    amount numeric NOT NULL
);


--
-- Name: tl_payment_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tl_payment_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_phone text NOT NULL,
    total_amount numeric NOT NULL,
    dibsy_payment_id text,
    dibsy_checkout_url text,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tl_payment_batches_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text])))
);


--
-- Name: tool_asset_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_asset_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    name_en text NOT NULL,
    name_ar text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tool_asset_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_asset_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    serial_number text NOT NULL,
    brand text NOT NULL,
    status public.tool_status DEFAULT 'available'::public.tool_status,
    assigned_to text,
    condition public.tool_condition DEFAULT 'Good'::public.tool_condition,
    expiry date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: tool_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tool_unit_id uuid NOT NULL,
    assigned_to text NOT NULL,
    team_id uuid,
    employee_id uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    CONSTRAINT one_target CHECK ((((team_id IS NOT NULL) AND (employee_id IS NULL)) OR ((employee_id IS NOT NULL) AND (team_id IS NULL)))),
    CONSTRAINT tool_assignments_assigned_to_check CHECK ((assigned_to = ANY (ARRAY['team'::text, 'employee'::text])))
);


--
-- Name: traccar_geofences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.traccar_geofences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    traccar_geofence_id integer NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT '#3B82F6'::text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
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
    CONSTRAINT user_custom_roles_approval_scopes_chk CHECK (((approval_scopes IS NULL) OR (approval_scopes <@ ARRAY['po'::text, 'inv_check'::text, 'stock_adj'::text])))
);


--
-- Name: user_divisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_divisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    division_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
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
-- Name: v_team_monthly_overtime; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_team_monthly_overtime WITH (security_invoker='true') AS
 WITH assignment_overtime AS (
         SELECT ota.team_id,
            (date_trunc('month'::text, (ota.scheduled_date)::timestamp with time zone))::date AS month,
            GREATEST(0, ((COALESCE(public.schedule_day_start(sc.days), 7) * 60) - ((EXTRACT(epoch FROM (ota.time_slot)::time without time zone) / (60)::numeric))::integer)) AS early_minutes,
            GREATEST(0, (((EXTRACT(epoch FROM ((ota.time_slot)::time without time zone + ((GREATEST(1, (ota.duration)::integer))::double precision * '01:00:00'::interval))) / (60)::numeric))::integer - (COALESCE(public.schedule_day_end(sc.days), 18) * 60))) AS late_minutes
           FROM (((public.order_team_assignments ota
             JOIN public.teams t_1 ON (((t_1.id = ota.team_id) AND (NOT t_1.is_qc))))
             JOIN public.divisions d_1 ON ((d_1.id = t_1.division_id)))
             LEFT JOIN public.schedules sc ON ((sc.id = d_1.calendar_schedule_id)))
          WHERE ((ota.time_slot ~ '^\d{2}:\d{2}'::text) AND (ota.duration ~ '^\d+$'::text) AND (ota.scheduled_date IS NOT NULL))
        UNION ALL
         SELECT svta.team_id,
            (date_trunc('month'::text, (svta.scheduled_date)::timestamp with time zone))::date AS month,
            GREATEST(0, ((COALESCE(public.schedule_day_start(sc.days), 7) * 60) - ((EXTRACT(epoch FROM (svta.time_slot)::time without time zone) / (60)::numeric))::integer)) AS early_minutes,
            GREATEST(0, (((EXTRACT(epoch FROM ((svta.time_slot)::time without time zone + ((GREATEST(1, (svta.duration)::integer))::double precision * '01:00:00'::interval))) / (60)::numeric))::integer - (COALESCE(public.schedule_day_end(sc.days), 18) * 60))) AS late_minutes
           FROM (((public.site_visit_team_assignments svta
             JOIN public.teams t_1 ON (((t_1.id = svta.team_id) AND (NOT t_1.is_qc))))
             JOIN public.divisions d_1 ON ((d_1.id = t_1.division_id)))
             LEFT JOIN public.schedules sc ON ((sc.id = d_1.calendar_schedule_id)))
          WHERE ((svta.time_slot ~ '^\d{2}:\d{2}'::text) AND (svta.duration ~ '^\d+$'::text) AND (svta.scheduled_date IS NOT NULL))
        )
 SELECT t.id AS team_id,
    COALESCE(t.name_en, t.name) AS team_name,
    d.id AS division_id,
    d.name AS division_name,
    d.slug AS division_slug,
    COALESCE(d.color, '#94a3b8'::text) AS division_color,
    ao.month,
    (sum((ao.early_minutes + ao.late_minutes)))::integer AS overtime_minutes,
    (sum(ao.early_minutes))::integer AS early_minutes,
    (sum(ao.late_minutes))::integer AS late_minutes,
    (count(*) FILTER (WHERE ((ao.early_minutes + ao.late_minutes) > 0)))::integer AS overtime_visit_count,
    (count(*))::integer AS total_visit_count
   FROM ((assignment_overtime ao
     JOIN public.teams t ON ((t.id = ao.team_id)))
     JOIN public.divisions d ON ((d.id = t.division_id)))
  GROUP BY t.id, t.name, t.name_en, d.id, d.name, d.slug, d.color, ao.month
  ORDER BY d.name, COALESCE(t.name_en, t.name), ao.month;


--
-- Name: VIEW v_team_monthly_overtime; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_team_monthly_overtime IS 'Monthly overtime per team. overtime_minutes = early (before schedule start) + late (after schedule end). Sourced from order_team_assignments and site_visit_team_assignments.';


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    plate text NOT NULL,
    team_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    traccar_device_id text,
    deleted_at timestamp with time zone,
    name text
);


--
-- Name: voucher_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voucher_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    voucher_id uuid NOT NULL,
    order_id text NOT NULL,
    customer_name text,
    discount_applied numeric NOT NULL,
    redeemed_at timestamp with time zone DEFAULT now()
);


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vouchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    campaign_id uuid,
    type public.voucher_type DEFAULT 'single_use'::public.voucher_type,
    usage_limit integer,
    usage_count integer DEFAULT 0,
    min_order_value numeric,
    max_discount numeric,
    is_active boolean DEFAULT true,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
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
-- Name: warehouse_stock_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.warehouse_stock_view AS
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
-- Name: warehouse_transfer_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warehouse_transfer_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


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
-- Name: webhook_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    event_type text,
    payload jsonb NOT NULL,
    status_code integer,
    processed boolean DEFAULT false,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: workflow_approval_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_approval_steps (
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
    CONSTRAINT positive_order CHECK ((step_order > 0)),
    CONSTRAINT workflow_approval_steps_workflow_check CHECK ((workflow = ANY (ARRAY['po'::text, 'inv_check'::text, 'stock_adj'::text])))
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
-- Name: approval_chain_tiers approval_chain_tiers_chain_id_rank_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_chain_tiers
    ADD CONSTRAINT approval_chain_tiers_chain_id_rank_key UNIQUE (chain_id, rank);


--
-- Name: approval_chain_tiers approval_chain_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_chain_tiers
    ADD CONSTRAINT approval_chain_tiers_pkey PRIMARY KEY (id);


--
-- Name: approval_chains approval_chains_division_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_chains
    ADD CONSTRAINT approval_chains_division_id_key UNIQUE (division_id);


--
-- Name: approval_chains approval_chains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_chains
    ADD CONSTRAINT approval_chains_pkey PRIMARY KEY (id);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: brand_group_members brand_group_members_group_id_brand_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_group_members
    ADD CONSTRAINT brand_group_members_group_id_brand_id_key UNIQUE (group_id, brand_id);


--
-- Name: brand_group_members brand_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_group_members
    ADD CONSTRAINT brand_group_members_pkey PRIMARY KEY (id);


--
-- Name: brand_groups brand_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_groups
    ADD CONSTRAINT brand_groups_pkey PRIMARY KEY (id);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: call_records call_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_records
    ADD CONSTRAINT call_records_pkey PRIMARY KEY (id);


--
-- Name: chat_conversations chat_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: chat_conversations chat_conversations_wati_phone_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_wati_phone_provider_key UNIQUE (wati_phone, provider);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


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
-- Name: contract_milestones contract_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_milestones
    ADD CONSTRAINT contract_milestones_pkey PRIMARY KEY (id);


--
-- Name: contract_payments contract_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payments
    ADD CONSTRAINT contract_payments_pkey PRIMARY KEY (id);


--
-- Name: contract_services contract_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_services
    ADD CONSTRAINT contract_services_pkey PRIMARY KEY (id);


--
-- Name: contract_visits contract_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_visits
    ADD CONSTRAINT contract_visits_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_contract_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_contract_id_key UNIQUE (contract_id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_quotation_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_quotation_number_key UNIQUE (quotation_number);


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
-- Name: customer_blocks customer_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_blocks
    ADD CONSTRAINT customer_blocks_pkey PRIMARY KEY (id);


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
-- Name: customer_subscriptions customer_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_subscriptions
    ADD CONSTRAINT customer_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: divisions divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_pkey PRIMARY KEY (id);


--
-- Name: divisions divisions_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_slug_key UNIQUE (slug);


--
-- Name: document_terms document_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_terms
    ADD CONSTRAINT document_terms_pkey PRIMARY KEY (id);


--
-- Name: employee_services employee_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_services
    ADD CONSTRAINT employee_services_pkey PRIMARY KEY (employee_id, service_id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: fifo_cost_layers fifo_cost_layers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fifo_cost_layers
    ADD CONSTRAINT fifo_cost_layers_pkey PRIMARY KEY (id);


--
-- Name: follow_up_requests follow_up_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_requests
    ADD CONSTRAINT follow_up_requests_pkey PRIMARY KEY (id);


--
-- Name: follow_up_requests follow_up_requests_request_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_requests
    ADD CONSTRAINT follow_up_requests_request_number_key UNIQUE (request_number);


--
-- Name: installed_products installed_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_products
    ADD CONSTRAINT installed_products_pkey PRIMARY KEY (id);


--
-- Name: instructions instructions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructions
    ADD CONSTRAINT instructions_pkey PRIMARY KEY (id);


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
-- Name: media_download_jobs media_download_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_download_jobs
    ADD CONSTRAINT media_download_jobs_pkey PRIMARY KEY (id);


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
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_log order_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_log
    ADD CONSTRAINT order_log_pkey PRIMARY KEY (id);


--
-- Name: order_services order_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_services
    ADD CONSTRAINT order_services_pkey PRIMARY KEY (id);


--
-- Name: order_team_assignments order_team_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_team_assignments
    ADD CONSTRAINT order_team_assignments_pkey PRIMARY KEY (id);


--
-- Name: order_visit_dates order_visit_dates_order_id_visit_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_visit_dates
    ADD CONSTRAINT order_visit_dates_order_id_visit_date_key UNIQUE (order_id, visit_date);


--
-- Name: order_visit_dates order_visit_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_visit_dates
    ADD CONSTRAINT order_visit_dates_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_id_key UNIQUE (order_id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


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
-- Name: po_line_items po_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_line_items
    ADD CONSTRAINT po_line_items_pkey PRIMARY KEY (id);


--
-- Name: po_versions po_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_versions
    ADD CONSTRAINT po_versions_pkey PRIMARY KEY (id);


--
-- Name: po_versions po_versions_po_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_versions
    ADD CONSTRAINT po_versions_po_id_version_number_key UNIQUE (po_id, version_number);


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
-- Name: promotion_campaigns promotion_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_campaigns
    ADD CONSTRAINT promotion_campaigns_pkey PRIMARY KEY (id);


--
-- Name: promotion_rules promotion_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_rules
    ADD CONSTRAINT promotion_rules_pkey PRIMARY KEY (id);


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
-- Name: purge_batches purge_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purge_batches
    ADD CONSTRAINT purge_batches_pkey PRIMARY KEY (id);


--
-- Name: qb_accounts qb_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qb_accounts
    ADD CONSTRAINT qb_accounts_pkey PRIMARY KEY (id);


--
-- Name: qb_accounts qb_accounts_qb_id_qb_company_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qb_accounts
    ADD CONSTRAINT qb_accounts_qb_id_qb_company_key UNIQUE (qb_id, qb_company);


--
-- Name: qb_division_mappings qb_division_mappings_division_mapping_type_mapping_key_qb_c_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qb_division_mappings
    ADD CONSTRAINT qb_division_mappings_division_mapping_type_mapping_key_qb_c_key UNIQUE (division, mapping_type, mapping_key, qb_company);


--
-- Name: qb_division_mappings qb_division_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qb_division_mappings
    ADD CONSTRAINT qb_division_mappings_pkey PRIMARY KEY (id);


--
-- Name: qb_items qb_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qb_items
    ADD CONSTRAINT qb_items_pkey PRIMARY KEY (id);


--
-- Name: qb_items qb_items_qb_id_qb_company_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qb_items
    ADD CONSTRAINT qb_items_qb_id_qb_company_key UNIQUE (qb_id, qb_company);


--
-- Name: qc_checklists qc_checklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_checklists
    ADD CONSTRAINT qc_checklists_pkey PRIMARY KEY (id);


--
-- Name: qc_inspection_results qc_inspection_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_inspection_results
    ADD CONSTRAINT qc_inspection_results_pkey PRIMARY KEY (id);


--
-- Name: qc_schedule qc_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_schedule
    ADD CONSTRAINT qc_schedule_pkey PRIMARY KEY (id);


--
-- Name: qc_team_scores qc_team_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_team_scores
    ADD CONSTRAINT qc_team_scores_pkey PRIMARY KEY (id);


--
-- Name: quotation_line_items quotation_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_line_items
    ADD CONSTRAINT quotation_line_items_pkey PRIMARY KEY (id);


--
-- Name: quotation_log quotation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_log
    ADD CONSTRAINT quotation_log_pkey PRIMARY KEY (id);


--
-- Name: quotations quotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_pkey PRIMARY KEY (id);


--
-- Name: quotations quotations_quotation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_quotation_id_key UNIQUE (quotation_id);


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
-- Name: reminder_categories reminder_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_categories
    ADD CONSTRAINT reminder_categories_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: returns returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_pkey PRIMARY KEY (id);


--
-- Name: rfq_line_items rfq_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_line_items
    ADD CONSTRAINT rfq_line_items_pkey PRIMARY KEY (id);


--
-- Name: rfq_quotes rfq_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_quotes
    ADD CONSTRAINT rfq_quotes_pkey PRIMARY KEY (id);


--
-- Name: rfqs rfqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfqs
    ADD CONSTRAINT rfqs_pkey PRIMARY KEY (id);


--
-- Name: rfqs rfqs_rfq_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfqs
    ADD CONSTRAINT rfqs_rfq_number_key UNIQUE (rfq_number);


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
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: service_brands service_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_brands
    ADD CONSTRAINT service_brands_pkey PRIMARY KEY (id);


--
-- Name: service_brands service_brands_service_id_brand_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_brands
    ADD CONSTRAINT service_brands_service_id_brand_id_key UNIQUE (service_id, brand_id);


--
-- Name: service_change_requests service_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_change_requests
    ADD CONSTRAINT service_change_requests_pkey PRIMARY KEY (id);


--
-- Name: service_customer_addresses service_customer_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_customer_addresses
    ADD CONSTRAINT service_customer_addresses_pkey PRIMARY KEY (id);


--
-- Name: service_customer_phones service_customer_phones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_customer_phones
    ADD CONSTRAINT service_customer_phones_pkey PRIMARY KEY (id);


--
-- Name: service_customers service_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_customers
    ADD CONSTRAINT service_customers_pkey PRIMARY KEY (id);


--
-- Name: service_instructions service_instructions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_instructions
    ADD CONSTRAINT service_instructions_pkey PRIMARY KEY (service_id, instruction_id);


--
-- Name: service_inventory service_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_inventory
    ADD CONSTRAINT service_inventory_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: shipments shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);


--
-- Name: site_visit_dates site_visit_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visit_dates
    ADD CONSTRAINT site_visit_dates_pkey PRIMARY KEY (id);


--
-- Name: site_visit_team_assignments site_visit_team_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visit_team_assignments
    ADD CONSTRAINT site_visit_team_assignments_pkey PRIMARY KEY (id);


--
-- Name: site_visits site_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visits
    ADD CONSTRAINT site_visits_pkey PRIMARY KEY (id);


--
-- Name: site_visits site_visits_visit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visits
    ADD CONSTRAINT site_visits_visit_id_key UNIQUE (visit_id);


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
-- Name: subscription_package_services subscription_package_services_package_id_service_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_package_services
    ADD CONSTRAINT subscription_package_services_package_id_service_id_key UNIQUE (package_id, service_id);


--
-- Name: subscription_package_services subscription_package_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_package_services
    ADD CONSTRAINT subscription_package_services_pkey PRIMARY KEY (id);


--
-- Name: subscription_packages subscription_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_packages
    ADD CONSTRAINT subscription_packages_pkey PRIMARY KEY (id);


--
-- Name: subscription_usage_log subscription_usage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_usage_log
    ADD CONSTRAINT subscription_usage_log_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: sync_state sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_state
    ADD CONSTRAINT sync_state_pkey PRIMARY KEY (id);


--
-- Name: team_activity_log team_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_activity_log
    ADD CONSTRAINT team_activity_log_pkey PRIMARY KEY (id);


--
-- Name: team_live_locations team_live_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_live_locations
    ADD CONSTRAINT team_live_locations_pkey PRIMARY KEY (team_id);


--
-- Name: team_schedule_assignments team_schedule_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_schedule_assignments
    ADD CONSTRAINT team_schedule_assignments_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: teams teams_traccar_device_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_traccar_device_id_unique UNIQUE (traccar_device_id);


--
-- Name: tl_invoices tl_invoices_invoice_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_invoices
    ADD CONSTRAINT tl_invoices_invoice_number_unique UNIQUE (invoice_number);


--
-- Name: tl_invoices tl_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_invoices
    ADD CONSTRAINT tl_invoices_pkey PRIMARY KEY (id);


--
-- Name: tl_invoices tl_invoices_visit_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_invoices
    ADD CONSTRAINT tl_invoices_visit_id_unique UNIQUE (visit_id);


--
-- Name: tl_payment_batch_items tl_payment_batch_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_payment_batch_items
    ADD CONSTRAINT tl_payment_batch_items_pkey PRIMARY KEY (id);


--
-- Name: tl_payment_batches tl_payment_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_payment_batches
    ADD CONSTRAINT tl_payment_batches_pkey PRIMARY KEY (id);


--
-- Name: tool_asset_items tool_asset_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_asset_items
    ADD CONSTRAINT tool_asset_items_pkey PRIMARY KEY (id);


--
-- Name: tool_asset_units tool_asset_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_asset_units
    ADD CONSTRAINT tool_asset_units_pkey PRIMARY KEY (id);


--
-- Name: tool_assignments tool_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_assignments
    ADD CONSTRAINT tool_assignments_pkey PRIMARY KEY (id);


--
-- Name: traccar_geofences traccar_geofences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.traccar_geofences
    ADD CONSTRAINT traccar_geofences_pkey PRIMARY KEY (id);


--
-- Name: traccar_geofences traccar_geofences_traccar_geofence_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.traccar_geofences
    ADD CONSTRAINT traccar_geofences_traccar_geofence_id_key UNIQUE (traccar_geofence_id);


--
-- Name: order_team_assignments uq_team_slot; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_team_assignments
    ADD CONSTRAINT uq_team_slot UNIQUE (team_id, scheduled_date, time_slot);


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
-- Name: user_divisions user_divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_divisions
    ADD CONSTRAINT user_divisions_pkey PRIMARY KEY (id);


--
-- Name: user_ui_preferences user_ui_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ui_preferences
    ADD CONSTRAINT user_ui_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_traccar_device_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_traccar_device_id_unique UNIQUE (traccar_device_id);


--
-- Name: voucher_redemptions voucher_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_redemptions
    ADD CONSTRAINT voucher_redemptions_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_code_key UNIQUE (code);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


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
-- Name: webhook_logs webhook_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_pkey PRIMARY KEY (id);


--
-- Name: workflow_approval_steps workflow_approval_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_approval_steps
    ADD CONSTRAINT workflow_approval_steps_pkey PRIMARY KEY (id);


--
-- Name: workflow_approval_steps workflow_approval_steps_workflow_step_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_approval_steps
    ADD CONSTRAINT workflow_approval_steps_workflow_step_key_key UNIQUE (workflow, step_key);


--
-- Name: call_records_call_id_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX call_records_call_id_uq ON public.call_records USING btree (call_id);


--
-- Name: call_records_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_records_message_idx ON public.call_records USING btree (message_id);


--
-- Name: call_records_started_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_records_started_at_idx ON public.call_records USING btree (started_at);


--
-- Name: chat_conversations_customer_id_v2_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chat_conversations_customer_id_v2_uq ON public.chat_conversations USING btree (customer_id_v2) WHERE (customer_id_v2 IS NOT NULL);


--
-- Name: chat_conversations_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_conversations_deleted_at_idx ON public.chat_conversations USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: chat_conversations_unknown_phone_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chat_conversations_unknown_phone_uq ON public.chat_conversations USING btree (unknown_phone) WHERE ((customer_id_v2 IS NULL) AND (unknown_phone IS NOT NULL));


--
-- Name: chat_messages_conv_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_conv_created_idx ON public.chat_messages USING btree (conversation_id, created_at DESC);


--
-- Name: chat_messages_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_created_at_idx ON public.chat_messages USING btree (created_at);


--
-- Name: chat_messages_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_deleted_at_idx ON public.chat_messages USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: chat_messages_external_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chat_messages_external_id_unique ON public.chat_messages USING btree (external_id);


--
-- Name: chat_messages_phone_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_phone_id_idx ON public.chat_messages USING btree (phone_id) WHERE (phone_id IS NOT NULL);


--
-- Name: chat_messages_purge_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_purge_batch_idx ON public.chat_messages USING btree (purge_batch_id) WHERE (purge_batch_id IS NOT NULL);


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

CREATE INDEX idx_approval_chains_division ON public.approval_chains USING btree (division_id);


--
-- Name: idx_approval_chains_single_global; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_approval_chains_single_global ON public.approval_chains USING btree ((true)) WHERE (division_id IS NULL);


--
-- Name: idx_brand_variants_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brand_variants_item ON public.inventory_brand_variants USING btree (item_id);


--
-- Name: idx_chat_conversations_last_message_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conversations_last_message_at ON public.chat_conversations USING btree (last_message_at DESC NULLS LAST) WHERE (last_message_at IS NOT NULL);


--
-- Name: idx_chat_conversations_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conversations_provider ON public.chat_conversations USING btree (provider);


--
-- Name: idx_chat_conversations_wati_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conversations_wati_phone ON public.chat_conversations USING btree (wati_phone);


--
-- Name: idx_chat_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_customer ON public.chat_conversations USING btree (customer_id);


--
-- Name: idx_chat_messages_conv_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_conv_created_at ON public.chat_messages USING btree (conversation_id, created_at);


--
-- Name: idx_chat_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_conversation ON public.chat_messages USING btree (conversation_id);


--
-- Name: idx_chat_messages_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_conversation_created ON public.chat_messages USING btree (conversation_id, created_at DESC);


--
-- Name: idx_chat_messages_wamid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_wamid ON public.chat_messages USING btree (wamid) WHERE (wamid IS NOT NULL);


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
-- Name: idx_contract_milestones_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contract_milestones_contract ON public.contract_milestones USING btree (contract_id);


--
-- Name: idx_contract_services_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contract_services_contract ON public.contract_services USING btree (contract_id);


--
-- Name: idx_contract_services_node; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contract_services_node ON public.contract_services USING btree (building_node_id);


--
-- Name: idx_contract_visits_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contract_visits_contract ON public.contract_visits USING btree (contract_id);


--
-- Name: idx_contract_visits_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contract_visits_date ON public.contract_visits USING btree (scheduled_date);


--
-- Name: idx_contract_visits_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contract_visits_service ON public.contract_visits USING btree (contract_service_id);


--
-- Name: idx_contracts_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_agent ON public.contracts USING btree (agent_name) WHERE (agent_name IS NOT NULL);


--
-- Name: idx_contracts_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_customer ON public.contracts USING btree (customer_id);


--
-- Name: idx_contracts_service_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_service_customer ON public.contracts USING btree (service_customer_id);


--
-- Name: idx_contracts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_status ON public.contracts USING btree (status);


--
-- Name: idx_contracts_status_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_status_end ON public.contracts USING btree (status, end_date DESC);


--
-- Name: idx_credit_notes_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_notes_type ON public.credit_notes USING btree (note_type);


--
-- Name: idx_cs_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_customer_id ON public.customer_subscriptions USING btree (customer_id);


--
-- Name: idx_cs_package_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_package_id ON public.customer_subscriptions USING btree (package_id);


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
-- Name: idx_customer_subscriptions_dibsy_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_subscriptions_dibsy_payment_id ON public.customer_subscriptions USING btree (dibsy_payment_id) WHERE (dibsy_payment_id IS NOT NULL);


--
-- Name: idx_customers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_name ON public.customers USING btree (name);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);


--
-- Name: idx_employee_services_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_services_employee ON public.employee_services USING btree (employee_id);


--
-- Name: idx_employee_services_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_services_service ON public.employee_services USING btree (service_id);


--
-- Name: idx_employees_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_active ON public.employees USING btree (team_id, profile_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_employees_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_division ON public.employees USING btree (division_id);


--
-- Name: idx_employees_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_profile_id ON public.employees USING btree (profile_id);


--
-- Name: idx_employees_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_status ON public.employees USING btree (status);


--
-- Name: idx_employees_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_team ON public.employees USING btree (team_id);


--
-- Name: idx_fifo_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fifo_brand ON public.fifo_cost_layers USING btree (brand_variant_id);


--
-- Name: idx_fifo_warehouse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fifo_warehouse ON public.fifo_cost_layers USING btree (brand_variant_id, warehouse_id);


--
-- Name: idx_fur_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fur_parent ON public.follow_up_requests USING btree (parent_order_id);


--
-- Name: idx_fur_status_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fur_status_date ON public.follow_up_requests USING btree (status, requested_date);


--
-- Name: idx_fur_team_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fur_team_date ON public.follow_up_requests USING btree (requested_team_id, requested_date);


--
-- Name: idx_installed_products_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installed_products_customer ON public.installed_products USING btree (customer_id);


--
-- Name: idx_installed_products_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installed_products_order ON public.installed_products USING btree (order_id);


--
-- Name: idx_installed_products_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installed_products_phone ON public.installed_products USING btree (phone_id);


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
-- Name: idx_notifications_profile_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_profile_read ON public.notifications USING btree (profile_id, read_at);


--
-- Name: idx_notifications_profile_unread_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_profile_unread_created ON public.notifications USING btree (profile_id, created_at DESC) WHERE (read_at IS NULL);


--
-- Name: idx_notifications_related_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_related_id ON public.notifications USING btree (related_id);


--
-- Name: idx_one_primary_address; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_primary_address ON public.service_customer_addresses USING btree (customer_id) WHERE (is_primary = true);


--
-- Name: idx_one_primary_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_primary_phone ON public.service_customer_phones USING btree (customer_id) WHERE (is_primary = true);


--
-- Name: idx_order_log_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_log_order ON public.order_log USING btree (order_id);


--
-- Name: idx_order_services_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_services_order ON public.order_services USING btree (order_id);


--
-- Name: idx_order_services_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_services_service ON public.order_services USING btree (service_id);


--
-- Name: idx_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id);


--
-- Name: idx_orders_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_order_id ON public.orders USING btree (order_id);


--
-- Name: idx_orders_parent_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_parent_order_id ON public.orders USING btree (parent_order_id);


--
-- Name: idx_orders_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_scheduled ON public.orders USING btree (scheduled_date);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_orders_status_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status_scheduled ON public.orders USING btree (status, scheduled_date DESC);


--
-- Name: idx_orders_uninvoiced; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_uninvoiced ON public.orders USING btree (scheduled_date) WHERE ((has_invoice = false) AND (status <> 'cancelled'::public.order_status));


--
-- Name: idx_ota_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ota_order ON public.order_team_assignments USING btree (order_id);


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
-- Name: idx_promotion_rules_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promotion_rules_campaign ON public.promotion_rules USING btree (campaign_id);


--
-- Name: idx_purchase_orders_po_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_po_type ON public.purchase_orders USING btree (po_type);


--
-- Name: idx_qc_schedule_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qc_schedule_date ON public.qc_schedule USING btree (scheduled_date);


--
-- Name: idx_qc_scores_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qc_scores_team ON public.qc_team_scores USING btree (team_id);


--
-- Name: idx_qli_quotation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qli_quotation ON public.quotation_line_items USING btree (quotation_id);


--
-- Name: idx_quotations_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_customer ON public.quotations USING btree (customer_id);


--
-- Name: idx_quotations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_status ON public.quotations USING btree (status);


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
-- Name: idx_scr_division_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scr_division_status ON public.service_change_requests USING gin (division) WHERE (status = 'pending'::public.service_change_status);


--
-- Name: idx_scr_requested_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scr_requested_by ON public.service_change_requests USING btree (requested_by);


--
-- Name: idx_scr_reviewed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scr_reviewed_by ON public.service_change_requests USING btree (reviewed_by);


--
-- Name: idx_scr_service_id_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scr_service_id_status ON public.service_change_requests USING btree (service_id, status);


--
-- Name: idx_scr_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scr_status ON public.service_change_requests USING btree (status);


--
-- Name: idx_scr_status_requested; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scr_status_requested ON public.service_change_requests USING btree (status, requested_at DESC);


--
-- Name: idx_service_brands_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_brands_brand ON public.service_brands USING btree (brand_id);


--
-- Name: idx_service_brands_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_brands_service ON public.service_brands USING btree (service_id);


--
-- Name: idx_service_customer_phones_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_customer_phones_phone ON public.service_customer_phones USING btree (phone);


--
-- Name: idx_service_inv_link_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_inv_link_type ON public.service_inventory USING btree (link_type);


--
-- Name: idx_service_inv_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_inv_service ON public.service_inventory USING btree (service_id);


--
-- Name: idx_service_inv_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_inv_variant ON public.service_inventory USING btree (brand_variant_id);


--
-- Name: idx_services_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_active ON public.services USING btree (tree_type, deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_services_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_division ON public.services USING btree (division);


--
-- Name: idx_services_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_parent ON public.services USING btree (parent_id);


--
-- Name: idx_services_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_status ON public.services USING btree (status);


--
-- Name: idx_services_tree_type_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_tree_type_parent ON public.services USING btree (tree_type, parent_id);


--
-- Name: idx_services_tree_type_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_tree_type_sort ON public.services USING btree (tree_type, sort_order) WHERE (deleted_at IS NULL);


--
-- Name: idx_shipments_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipments_po ON public.shipments USING btree (po_id);


--
-- Name: idx_shipments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipments_status ON public.shipments USING btree (status);


--
-- Name: idx_si_instruction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_si_instruction ON public.service_instructions USING btree (instruction_id);


--
-- Name: idx_si_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_si_service ON public.service_instructions USING btree (service_id);


--
-- Name: idx_site_visits_completed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_visits_completed_by ON public.site_visits USING btree (completed_by);


--
-- Name: idx_site_visits_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_visits_customer ON public.site_visits USING btree (customer_id);


--
-- Name: idx_site_visits_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_visits_scheduled ON public.site_visits USING btree (scheduled_date);


--
-- Name: idx_site_visits_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_visits_visit_id ON public.site_visits USING btree (visit_id);


--
-- Name: idx_sps_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sps_service_id ON public.subscription_package_services USING btree (service_id);


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
-- Name: idx_sul_subscription_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sul_subscription_id ON public.subscription_usage_log USING btree (subscription_id);


--
-- Name: idx_svta_team_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_svta_team_date ON public.site_visit_team_assignments USING btree (team_id, scheduled_date);


--
-- Name: idx_team_activity_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_activity_log_created_at ON public.team_activity_log USING btree (created_at DESC);


--
-- Name: idx_team_activity_log_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_activity_log_entity_id ON public.team_activity_log USING btree (entity_id);


--
-- Name: idx_team_sched_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_sched_team_id ON public.team_schedule_assignments USING btree (team_id);


--
-- Name: idx_tll_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tll_updated_at ON public.team_live_locations USING btree (updated_at);


--
-- Name: idx_tool_assignments_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tool_assignments_employee_id ON public.tool_assignments USING btree (employee_id);


--
-- Name: idx_tool_assignments_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tool_assignments_team_id ON public.tool_assignments USING btree (team_id);


--
-- Name: idx_tool_units_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tool_units_item ON public.tool_asset_units USING btree (item_id);


--
-- Name: idx_tsa_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tsa_team ON public.team_schedule_assignments USING btree (team_id);


--
-- Name: idx_user_divisions_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_divisions_profile_id ON public.user_divisions USING btree (profile_id);


--
-- Name: idx_voucher_redemptions_voucher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voucher_redemptions_voucher ON public.voucher_redemptions USING btree (voucher_id);


--
-- Name: idx_vouchers_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vouchers_code ON public.vouchers USING btree (code);


--
-- Name: media_download_jobs_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_download_jobs_message_idx ON public.media_download_jobs USING btree (message_id);


--
-- Name: media_download_jobs_queued_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_download_jobs_queued_idx ON public.media_download_jobs USING btree (scheduled_for) WHERE (status = 'queued'::text);


--
-- Name: order_visit_dates_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_visit_dates_order_id_idx ON public.order_visit_dates USING btree (order_id);


--
-- Name: order_visit_dates_visit_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_visit_dates_visit_date_idx ON public.order_visit_dates USING btree (visit_date);


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
-- Name: payments payments_recalc_ar_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payments_recalc_ar_status AFTER INSERT OR DELETE OR UPDATE OF amount, invoice_id, deleted_at ON public.payments FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_ar_payment_status();


--
-- Name: brand_groups set_brand_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_brand_groups_updated_at BEFORE UPDATE ON public.brand_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: brands set_brands_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: tl_invoices tl_invoice_number_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tl_invoice_number_trigger BEFORE INSERT ON public.tl_invoices FOR EACH ROW EXECUTE FUNCTION public.generate_tl_invoice_number();


--
-- Name: tl_invoices tl_invoices_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tl_invoices_set_updated_at BEFORE UPDATE ON public.tl_invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tl_payment_batches tl_payment_batches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tl_payment_batches_updated_at BEFORE UPDATE ON public.tl_payment_batches FOR EACH ROW EXECUTE FUNCTION public.update_tl_payment_batches_updated_at();


--
-- Name: approval_requests trg_approval_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_approval_requests_updated_at BEFORE UPDATE ON public.approval_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: services trg_auto_reject_on_service_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_reject_on_service_delete AFTER UPDATE OF deleted_at ON public.services FOR EACH ROW EXECUTE FUNCTION public.auto_reject_pending_on_service_delete();


--
-- Name: services trg_auto_service_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_service_code BEFORE INSERT ON public.services FOR EACH ROW EXECUTE FUNCTION public.generate_service_code();


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
-- Name: customer_subscriptions trg_customer_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customer_subscriptions_updated_at BEFORE UPDATE ON public.customer_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: divisions trg_divisions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_divisions_updated_at BEFORE UPDATE ON public.divisions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: document_terms trg_document_terms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_document_terms_updated_at BEFORE UPDATE ON public.document_terms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: service_change_requests trg_notify_approvers_on_service_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_approvers_on_service_change AFTER INSERT ON public.service_change_requests FOR EACH ROW EXECUTE FUNCTION public.notify_approvers_on_service_change();


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
-- Name: qb_division_mappings trg_qb_division_mappings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qb_division_mappings_updated_at BEFORE UPDATE ON public.qb_division_mappings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: reason_lists trg_reason_lists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reason_lists_updated_at BEFORE UPDATE ON public.reason_lists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: returns trg_returns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_returns_updated_at BEFORE UPDATE ON public.returns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: service_change_requests trg_scr_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_scr_updated_at BEFORE UPDATE ON public.service_change_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: service_customers trg_service_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_service_customers_updated_at BEFORE UPDATE ON public.service_customers FOR EACH ROW EXECUTE FUNCTION public.set_service_customers_updated_at();


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
-- Name: subscription_packages trg_subscription_packages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_subscription_packages_updated_at BEFORE UPDATE ON public.subscription_packages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: suppliers trg_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: service_change_requests trg_sync_service_pending; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_service_pending AFTER INSERT OR DELETE OR UPDATE OF status ON public.service_change_requests FOR EACH ROW EXECUTE FUNCTION public.sync_service_pending_lock();


--
-- Name: sync_state trg_sync_state_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_state_updated_at BEFORE UPDATE ON public.sync_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: service_inventory trg_update_linked_services_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_linked_services_count AFTER INSERT OR DELETE ON public.service_inventory FOR EACH ROW EXECUTE FUNCTION public.fn_update_linked_services_count();


--
-- Name: fifo_cost_layers trg_warehouse_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_warehouse_stats AFTER INSERT OR DELETE OR UPDATE ON public.fifo_cost_layers FOR EACH ROW EXECUTE FUNCTION public.fn_refresh_warehouse_stats();


--
-- Name: installed_products trigger_compute_warranty_expires_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_compute_warranty_expires_at BEFORE INSERT OR UPDATE ON public.installed_products FOR EACH ROW EXECUTE FUNCTION public.compute_warranty_expires_at();


--
-- Name: app_settings app_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: approval_chain_tiers approval_chain_tiers_chain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_chain_tiers
    ADD CONSTRAINT approval_chain_tiers_chain_id_fkey FOREIGN KEY (chain_id) REFERENCES public.approval_chains(id) ON DELETE CASCADE;


--
-- Name: approval_chains approval_chains_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_chains
    ADD CONSTRAINT approval_chains_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id);


--
-- Name: approval_requests approval_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.profiles(id);


--
-- Name: approval_requests approval_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id);


--
-- Name: brand_group_members brand_group_members_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_group_members
    ADD CONSTRAINT brand_group_members_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;


--
-- Name: brand_group_members brand_group_members_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_group_members
    ADD CONSTRAINT brand_group_members_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: brand_group_members brand_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_group_members
    ADD CONSTRAINT brand_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.brand_groups(id) ON DELETE CASCADE;


--
-- Name: brand_groups brand_groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_groups
    ADD CONSTRAINT brand_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: brands brands_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: call_records call_records_initiated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_records
    ADD CONSTRAINT call_records_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES public.profiles(id);


--
-- Name: call_records call_records_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_records
    ADD CONSTRAINT call_records_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_conversations chat_conversations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.service_customers(id) ON DELETE SET NULL;


--
-- Name: chat_conversations chat_conversations_customer_id_v2_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_customer_id_v2_fkey FOREIGN KEY (customer_id_v2) REFERENCES public.service_customers(id) ON DELETE SET NULL;


--
-- Name: chat_conversations chat_conversations_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id);


--
-- Name: chat_messages chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.profiles(id);


--
-- Name: chat_messages chat_messages_phone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES public.service_customer_phones(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_purge_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_purge_batch_id_fkey FOREIGN KEY (purge_batch_id) REFERENCES public.purge_batches(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_sent_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sent_by_profile_id_fkey FOREIGN KEY (sent_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


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
-- Name: contract_milestones contract_milestones_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_milestones
    ADD CONSTRAINT contract_milestones_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;


--
-- Name: contract_payments contract_payments_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payments
    ADD CONSTRAINT contract_payments_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;


--
-- Name: contract_services contract_services_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_services
    ADD CONSTRAINT contract_services_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id);


--
-- Name: contract_services contract_services_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_services
    ADD CONSTRAINT contract_services_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;


--
-- Name: contract_services contract_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_services
    ADD CONSTRAINT contract_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: contract_visits contract_visits_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_visits
    ADD CONSTRAINT contract_visits_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;


--
-- Name: contract_visits contract_visits_contract_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_visits
    ADD CONSTRAINT contract_visits_contract_service_id_fkey FOREIGN KEY (contract_service_id) REFERENCES public.contract_services(id) ON DELETE SET NULL;


--
-- Name: contract_visits contract_visits_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_visits
    ADD CONSTRAINT contract_visits_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: contracts contracts_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: contracts contracts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: contracts contracts_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: contracts contracts_phone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES public.service_customer_phones(id);


--
-- Name: contracts contracts_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.profiles(id);


--
-- Name: contracts contracts_service_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_service_customer_id_fkey FOREIGN KEY (service_customer_id) REFERENCES public.service_customers(id);


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
-- Name: customer_blocks customer_blocks_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_blocks
    ADD CONSTRAINT customer_blocks_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: customer_blocks customer_blocks_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_blocks
    ADD CONSTRAINT customer_blocks_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.service_customers(id) ON DELETE CASCADE;


--
-- Name: customer_phones customer_phones_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_phones
    ADD CONSTRAINT customer_phones_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_subscriptions customer_subscriptions_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_subscriptions
    ADD CONSTRAINT customer_subscriptions_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.subscription_packages(id);


--
-- Name: customers customers_credit_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_credit_group_id_fkey FOREIGN KEY (credit_group_id) REFERENCES public.credit_groups(id);


--
-- Name: divisions divisions_calendar_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_calendar_schedule_id_fkey FOREIGN KEY (calendar_schedule_id) REFERENCES public.schedules(id) ON DELETE SET NULL;


--
-- Name: divisions divisions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: divisions divisions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
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
    ADD CONSTRAINT document_terms_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id);


--
-- Name: employee_services employee_services_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_services
    ADD CONSTRAINT employee_services_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_services employee_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_services
    ADD CONSTRAINT employee_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: employees employees_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE SET NULL;


--
-- Name: employees employees_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


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
-- Name: customer_subscriptions fk_customer_subscriptions_customer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_subscriptions
    ADD CONSTRAINT fk_customer_subscriptions_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- Name: employees fk_employee_team; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT fk_employee_team FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: vehicles fk_vehicle_team; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT fk_vehicle_team FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: follow_up_requests follow_up_requests_confirmed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_requests
    ADD CONSTRAINT follow_up_requests_confirmed_by_user_id_fkey FOREIGN KEY (confirmed_by_user_id) REFERENCES auth.users(id);


--
-- Name: follow_up_requests follow_up_requests_parent_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_requests
    ADD CONSTRAINT follow_up_requests_parent_order_id_fkey FOREIGN KEY (parent_order_id) REFERENCES public.orders(id);


--
-- Name: follow_up_requests follow_up_requests_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_requests
    ADD CONSTRAINT follow_up_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES auth.users(id);


--
-- Name: follow_up_requests follow_up_requests_requested_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_requests
    ADD CONSTRAINT follow_up_requests_requested_team_id_fkey FOREIGN KEY (requested_team_id) REFERENCES public.teams(id);


--
-- Name: follow_up_requests follow_up_requests_resulting_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_requests
    ADD CONSTRAINT follow_up_requests_resulting_order_id_fkey FOREIGN KEY (resulting_order_id) REFERENCES public.orders(id);


--
-- Name: installed_products installed_products_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_products
    ADD CONSTRAINT installed_products_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.customer_addresses(id);


--
-- Name: installed_products installed_products_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_products
    ADD CONSTRAINT installed_products_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: installed_products installed_products_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_products
    ADD CONSTRAINT installed_products_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: installed_products installed_products_phone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_products
    ADD CONSTRAINT installed_products_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES public.customer_phones(id);


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
-- Name: media_download_jobs media_download_jobs_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_download_jobs
    ADD CONSTRAINT media_download_jobs_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


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
-- Name: notifications notifications_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: order_log order_log_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_log
    ADD CONSTRAINT order_log_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_services order_services_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_services
    ADD CONSTRAINT order_services_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_services order_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_services
    ADD CONSTRAINT order_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: order_team_assignments order_team_assignments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_team_assignments
    ADD CONSTRAINT order_team_assignments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_team_assignments order_team_assignments_parent_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_team_assignments
    ADD CONSTRAINT order_team_assignments_parent_assignment_id_fkey FOREIGN KEY (parent_assignment_id) REFERENCES public.order_team_assignments(id);


--
-- Name: order_team_assignments order_team_assignments_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_team_assignments
    ADD CONSTRAINT order_team_assignments_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: order_visit_dates order_visit_dates_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_visit_dates
    ADD CONSTRAINT order_visit_dates_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.service_customer_addresses(id) ON DELETE SET NULL;


--
-- Name: orders orders_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: orders orders_follow_up_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_follow_up_request_id_fkey FOREIGN KEY (follow_up_request_id) REFERENCES public.follow_up_requests(id);


--
-- Name: orders orders_parent_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_parent_order_id_fkey FOREIGN KEY (parent_order_id) REFERENCES public.orders(id);


--
-- Name: orders orders_service_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_service_customer_id_fkey FOREIGN KEY (service_customer_id) REFERENCES public.service_customers(id);


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
-- Name: po_line_items po_line_items_tool_asset_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_line_items
    ADD CONSTRAINT po_line_items_tool_asset_item_id_fkey FOREIGN KEY (tool_asset_item_id) REFERENCES public.tool_asset_items(id) ON DELETE SET NULL;


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
    ADD CONSTRAINT pricing_factors_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id);


--
-- Name: profiles profiles_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id);


--
-- Name: promotion_rules promotion_rules_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_rules
    ADD CONSTRAINT promotion_rules_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.promotion_campaigns(id) ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_created_by_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_profiles_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: purchase_orders purchase_orders_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE RESTRICT;


--
-- Name: purchase_orders purchase_orders_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.rfqs(id);


--
-- Name: purchase_orders purchase_orders_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: purge_batches purge_batches_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purge_batches
    ADD CONSTRAINT purge_batches_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.profiles(id);


--
-- Name: qb_division_mappings qb_division_mappings_qb_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qb_division_mappings
    ADD CONSTRAINT qb_division_mappings_qb_account_id_fkey FOREIGN KEY (qb_account_id) REFERENCES public.qb_accounts(id);


--
-- Name: qb_division_mappings qb_division_mappings_qb_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qb_division_mappings
    ADD CONSTRAINT qb_division_mappings_qb_item_id_fkey FOREIGN KEY (qb_item_id) REFERENCES public.qb_items(id);


--
-- Name: qc_checklists qc_checklists_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_checklists
    ADD CONSTRAINT qc_checklists_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: qc_inspection_results qc_inspection_results_qc_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_inspection_results
    ADD CONSTRAINT qc_inspection_results_qc_team_id_fkey FOREIGN KEY (qc_team_id) REFERENCES public.teams(id);


--
-- Name: qc_inspection_results qc_inspection_results_schedule_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_inspection_results
    ADD CONSTRAINT qc_inspection_results_schedule_entry_id_fkey FOREIGN KEY (schedule_entry_id) REFERENCES public.qc_schedule(id);


--
-- Name: qc_inspection_results qc_inspection_results_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_inspection_results
    ADD CONSTRAINT qc_inspection_results_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: qc_schedule qc_schedule_assigned_qc_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_schedule
    ADD CONSTRAINT qc_schedule_assigned_qc_team_id_fkey FOREIGN KEY (assigned_qc_team_id) REFERENCES public.teams(id);


--
-- Name: qc_schedule qc_schedule_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_schedule
    ADD CONSTRAINT qc_schedule_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: qc_team_scores qc_team_scores_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_team_scores
    ADD CONSTRAINT qc_team_scores_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: quotation_line_items quotation_line_items_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_line_items
    ADD CONSTRAINT quotation_line_items_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;


--
-- Name: quotation_line_items quotation_line_items_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_line_items
    ADD CONSTRAINT quotation_line_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: quotation_log quotation_log_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_log
    ADD CONSTRAINT quotation_log_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;


--
-- Name: quotations quotations_converted_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_converted_order_id_fkey FOREIGN KEY (converted_order_id) REFERENCES public.orders(id);


--
-- Name: quotations quotations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: quotations quotations_service_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_service_customer_id_fkey FOREIGN KEY (service_customer_id) REFERENCES public.service_customers(id);


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
-- Name: receivals receivals_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivals
    ADD CONSTRAINT receivals_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.employees(id);


--
-- Name: receivals receivals_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivals
    ADD CONSTRAINT receivals_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: reminders reminders_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.reminder_categories(id) ON DELETE CASCADE;


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
    ADD CONSTRAINT returns_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id);


--
-- Name: returns returns_restock_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_restock_warehouse_id_fkey FOREIGN KEY (restock_warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: rfq_line_items rfq_line_items_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_line_items
    ADD CONSTRAINT rfq_line_items_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.rfqs(id) ON DELETE CASCADE;


--
-- Name: rfq_quotes rfq_quotes_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_quotes
    ADD CONSTRAINT rfq_quotes_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.rfqs(id) ON DELETE CASCADE;


--
-- Name: sale_deliveries sale_deliveries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_deliveries
    ADD CONSTRAINT sale_deliveries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: sale_deliveries sale_deliveries_sale_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_deliveries
    ADD CONSTRAINT sale_deliveries_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES public.sale_orders(id);


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
-- Name: sale_order_lines sale_order_lines_tool_asset_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_lines
    ADD CONSTRAINT sale_order_lines_tool_asset_item_id_fkey FOREIGN KEY (tool_asset_item_id) REFERENCES public.tool_asset_items(id);


--
-- Name: sale_orders sale_orders_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_orders
    ADD CONSTRAINT sale_orders_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.promotion_campaigns(id);


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
    ADD CONSTRAINT sale_orders_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE RESTRICT;


--
-- Name: sale_orders sale_orders_voucher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_orders
    ADD CONSTRAINT sale_orders_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id);


--
-- Name: service_brands service_brands_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_brands
    ADD CONSTRAINT service_brands_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;


--
-- Name: service_brands service_brands_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_brands
    ADD CONSTRAINT service_brands_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: service_change_requests service_change_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_change_requests
    ADD CONSTRAINT service_change_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id);


--
-- Name: service_change_requests service_change_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_change_requests
    ADD CONSTRAINT service_change_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);


--
-- Name: service_change_requests service_change_requests_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_change_requests
    ADD CONSTRAINT service_change_requests_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: service_customer_addresses service_customer_addresses_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_customer_addresses
    ADD CONSTRAINT service_customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.service_customers(id) ON DELETE CASCADE;


--
-- Name: service_customer_addresses service_customer_addresses_phone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_customer_addresses
    ADD CONSTRAINT service_customer_addresses_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES public.service_customer_phones(id) ON DELETE SET NULL;


--
-- Name: service_customer_phones service_customer_phones_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_customer_phones
    ADD CONSTRAINT service_customer_phones_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.service_customers(id) ON DELETE CASCADE;


--
-- Name: service_instructions service_instructions_instruction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_instructions
    ADD CONSTRAINT service_instructions_instruction_id_fkey FOREIGN KEY (instruction_id) REFERENCES public.instructions(id) ON DELETE CASCADE;


--
-- Name: service_instructions service_instructions_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_instructions
    ADD CONSTRAINT service_instructions_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: service_inventory service_inventory_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_inventory
    ADD CONSTRAINT service_inventory_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_brand_variants(id);


--
-- Name: services services_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.services(id);


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
-- Name: site_visit_dates site_visit_dates_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visit_dates
    ADD CONSTRAINT site_visit_dates_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.site_visits(id) ON DELETE CASCADE;


--
-- Name: site_visit_team_assignments site_visit_team_assignments_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visit_team_assignments
    ADD CONSTRAINT site_visit_team_assignments_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: site_visit_team_assignments site_visit_team_assignments_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visit_team_assignments
    ADD CONSTRAINT site_visit_team_assignments_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.site_visits(id) ON DELETE CASCADE;


--
-- Name: site_visits site_visits_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visits
    ADD CONSTRAINT site_visits_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: site_visits site_visits_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visits
    ADD CONSTRAINT site_visits_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: site_visits site_visits_phone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visits
    ADD CONSTRAINT site_visits_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES public.customer_phones(id);


--
-- Name: site_visits site_visits_service_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_visits
    ADD CONSTRAINT site_visits_service_customer_id_fkey FOREIGN KEY (service_customer_id) REFERENCES public.service_customers(id);


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
-- Name: subscription_package_services subscription_package_services_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_package_services
    ADD CONSTRAINT subscription_package_services_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.subscription_packages(id) ON DELETE CASCADE;


--
-- Name: subscription_package_services subscription_package_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_package_services
    ADD CONSTRAINT subscription_package_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE RESTRICT;


--
-- Name: subscription_usage_log subscription_usage_log_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_usage_log
    ADD CONSTRAINT subscription_usage_log_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.customer_subscriptions(id);


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
-- Name: team_activity_log team_activity_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_activity_log
    ADD CONSTRAINT team_activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: team_live_locations team_live_locations_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_live_locations
    ADD CONSTRAINT team_live_locations_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_schedule_assignments team_schedule_assignments_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_schedule_assignments
    ADD CONSTRAINT team_schedule_assignments_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.schedules(id);


--
-- Name: team_schedule_assignments team_schedule_assignments_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_schedule_assignments
    ADD CONSTRAINT team_schedule_assignments_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: teams teams_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id);


--
-- Name: teams teams_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.employees(id);


--
-- Name: teams teams_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.schedules(id);


--
-- Name: teams teams_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id);


--
-- Name: tl_invoices tl_invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_invoices
    ADD CONSTRAINT tl_invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: tl_invoices tl_invoices_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_invoices
    ADD CONSTRAINT tl_invoices_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id);


--
-- Name: tl_payment_batch_items tl_payment_batch_items_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_payment_batch_items
    ADD CONSTRAINT tl_payment_batch_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.tl_payment_batches(id) ON DELETE CASCADE;


--
-- Name: tl_payment_batch_items tl_payment_batch_items_tl_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_payment_batch_items
    ADD CONSTRAINT tl_payment_batch_items_tl_invoice_id_fkey FOREIGN KEY (tl_invoice_id) REFERENCES public.tl_invoices(id);


--
-- Name: tool_asset_items tool_asset_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_asset_items
    ADD CONSTRAINT tool_asset_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.inventory_categories(id);


--
-- Name: tool_asset_units tool_asset_units_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_asset_units
    ADD CONSTRAINT tool_asset_units_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.tool_asset_items(id) ON DELETE CASCADE;


--
-- Name: tool_assignments tool_assignments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_assignments
    ADD CONSTRAINT tool_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: tool_assignments tool_assignments_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_assignments
    ADD CONSTRAINT tool_assignments_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: tool_assignments tool_assignments_tool_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_assignments
    ADD CONSTRAINT tool_assignments_tool_unit_id_fkey FOREIGN KEY (tool_unit_id) REFERENCES public.tool_asset_units(id) ON DELETE CASCADE;


--
-- Name: traccar_geofences traccar_geofences_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.traccar_geofences
    ADD CONSTRAINT traccar_geofences_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


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
-- Name: user_divisions user_divisions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_divisions
    ADD CONSTRAINT user_divisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: user_divisions user_divisions_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_divisions
    ADD CONSTRAINT user_divisions_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id);


--
-- Name: user_divisions user_divisions_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_divisions
    ADD CONSTRAINT user_divisions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: user_ui_preferences user_ui_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ui_preferences
    ADD CONSTRAINT user_ui_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: voucher_redemptions voucher_redemptions_voucher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_redemptions
    ADD CONSTRAINT voucher_redemptions_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE CASCADE;


--
-- Name: vouchers vouchers_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.promotion_campaigns(id) ON DELETE SET NULL;


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
-- Name: warehouse_manager_log warehouse_manager_log_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_manager_log
    ADD CONSTRAINT warehouse_manager_log_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.employees(id);


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
-- Name: webhook_logs webhook_logs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_logs
    ADD CONSTRAINT webhook_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: workflow_approval_steps workflow_approval_steps_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_approval_steps
    ADD CONSTRAINT workflow_approval_steps_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.profiles(id);


--
-- Name: workflow_approval_steps workflow_approval_steps_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_approval_steps
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
-- Name: invoices Accounting/admin can void invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Accounting/admin can void invoices" ON public.invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (((status = 'void'::public.invoice_status) AND (EXISTS ( SELECT 1
   FROM ((public.profiles p
     JOIN public.user_custom_roles ucr ON ((ucr.profile_id = p.id)))
     JOIN public.custom_roles cr ON ((cr.id = ucr.role_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cr.deleted_at IS NULL) AND ((cr.is_system = true) OR ('invoices.manage'::text = ANY (cr.permissions))))))));


--
-- Name: divisions Admin can delete divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can delete divisions" ON public.divisions FOR DELETE TO authenticated USING (true);


--
-- Name: app_settings Admin can insert app_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can insert app_settings" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: companies Admin can insert companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can insert companies" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: divisions Admin can insert divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can insert divisions" ON public.divisions FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: document_terms Admin can manage document_terms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage document_terms" ON public.document_terms TO authenticated USING (true) WITH CHECK (true);


--
-- Name: qb_accounts Admin can manage qb_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage qb_accounts" ON public.qb_accounts TO authenticated USING (true) WITH CHECK (true);


--
-- Name: qb_division_mappings Admin can manage qb_division_mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage qb_division_mappings" ON public.qb_division_mappings TO authenticated USING (true) WITH CHECK (true);


--
-- Name: qb_items Admin can manage qb_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can manage qb_items" ON public.qb_items TO authenticated USING (true) WITH CHECK (true);


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
-- Name: divisions Admin can update divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update divisions" ON public.divisions FOR UPDATE TO authenticated USING (true);


--
-- Name: webhook_logs Admin can view webhook_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can view webhook_logs" ON public.webhook_logs FOR SELECT TO authenticated USING (true);


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
-- Name: user_custom_roles Admins can manage user_custom_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage user_custom_roles" ON public.user_custom_roles TO authenticated USING (true) WITH CHECK (true);


--
-- Name: user_divisions Admins can manage user_divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage user_divisions" ON public.user_divisions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: purge_batches Admins read purge batches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read purge batches" ON public.purge_batches FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.user_custom_roles ur
     JOIN public.custom_roles cr ON ((cr.id = ur.role_id)))
  WHERE ((ur.profile_id = auth.uid()) AND ('contact_centre.admin.purge'::text = ANY (cr.permissions))))));


--
-- Name: invoices Authenticated can delete invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can delete invoices" ON public.invoices FOR DELETE TO authenticated USING (true);


--
-- Name: invoices Authenticated can insert invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: invoices Authenticated can select invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can select invoices" ON public.invoices FOR SELECT TO authenticated USING (true);


--
-- Name: invoices Authenticated can update invoices (non-void); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can update invoices (non-void)" ON public.invoices FOR UPDATE TO authenticated USING ((status IS DISTINCT FROM 'void'::public.invoice_status)) WITH CHECK ((status IS DISTINCT FROM 'void'::public.invoice_status));


--
-- Name: call_records Authenticated read call records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read call records" ON public.call_records FOR SELECT TO authenticated USING (true);


--
-- Name: service_brands Authenticated read service_brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read service_brands" ON public.service_brands FOR SELECT TO authenticated USING (true);


--
-- Name: traccar_geofences Authenticated users can delete geofences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete geofences" ON public.traccar_geofences FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: warehouse_reorder_points Authenticated users can delete warehouse_reorder_points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete warehouse_reorder_points" ON public.warehouse_reorder_points FOR DELETE TO authenticated USING (true);


--
-- Name: tl_payment_batch_items Authenticated users can insert batch items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert batch items" ON public.tl_payment_batch_items FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: currencies Authenticated users can insert currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert currencies" ON public.currencies FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: traccar_geofences Authenticated users can insert geofences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert geofences" ON public.traccar_geofences FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: tl_payment_batches Authenticated users can insert payment batches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert payment batches" ON public.tl_payment_batches FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: payment_methods Authenticated users can insert payment_methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert payment_methods" ON public.payment_methods FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: tl_invoices Authenticated users can insert tl_invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert tl_invoices" ON public.tl_invoices FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: warehouse_reorder_points Authenticated users can insert warehouse_reorder_points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert warehouse_reorder_points" ON public.warehouse_reorder_points FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: employee_services Authenticated users can manage employee_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage employee_services" ON public.employee_services TO authenticated USING (true) WITH CHECK (true);


--
-- Name: installed_products Authenticated users can manage installed_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage installed_products" ON public.installed_products TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tool_assignments Authenticated users can manage tool_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage tool_assignments" ON public.tool_assignments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: country_codes Authenticated users can read country codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read country codes" ON public.country_codes FOR SELECT TO authenticated USING (true);


--
-- Name: employee_services Authenticated users can read employee_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read employee_services" ON public.employee_services FOR SELECT TO authenticated USING (true);


--
-- Name: traccar_geofences Authenticated users can read geofences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read geofences" ON public.traccar_geofences FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: installed_products Authenticated users can read installed_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read installed_products" ON public.installed_products FOR SELECT TO authenticated USING (true);


--
-- Name: payment_methods Authenticated users can read payment_methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read payment_methods" ON public.payment_methods FOR SELECT TO authenticated USING (true);


--
-- Name: tl_invoices Authenticated users can read tl_invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read tl_invoices" ON public.tl_invoices FOR SELECT TO authenticated USING (true);


--
-- Name: tool_assignments Authenticated users can read tool_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read tool_assignments" ON public.tool_assignments FOR SELECT TO authenticated USING (true);


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
-- Name: currencies Authenticated users can update currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update currencies" ON public.currencies FOR UPDATE TO authenticated USING (true);


--
-- Name: traccar_geofences Authenticated users can update geofences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update geofences" ON public.traccar_geofences FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: tl_payment_batches Authenticated users can update payment batches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update payment batches" ON public.tl_payment_batches FOR UPDATE TO authenticated USING (true);


--
-- Name: payment_methods Authenticated users can update payment_methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update payment_methods" ON public.payment_methods FOR UPDATE TO authenticated USING (true);


--
-- Name: tl_invoices Authenticated users can update tl_invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update tl_invoices" ON public.tl_invoices FOR UPDATE TO authenticated USING (true);


--
-- Name: warehouse_reorder_points Authenticated users can update warehouse_reorder_points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update warehouse_reorder_points" ON public.warehouse_reorder_points FOR UPDATE TO authenticated USING (true);


--
-- Name: tl_payment_batch_items Authenticated users can view batch items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view batch items" ON public.tl_payment_batch_items FOR SELECT TO authenticated USING (true);


--
-- Name: currencies Authenticated users can view currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view currencies" ON public.currencies FOR SELECT TO authenticated USING (true);


--
-- Name: tl_payment_batches Authenticated users can view payment batches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view payment batches" ON public.tl_payment_batches FOR SELECT TO authenticated USING (true);


--
-- Name: approval_requests Internal can insert approval_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can insert approval_requests" ON public.approval_requests FOR INSERT TO authenticated WITH CHECK (true);


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
-- Name: service_inventory Internal can manage service_inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can manage service_inventory" ON public.service_inventory TO authenticated USING (true) WITH CHECK (true);


--
-- Name: cogs_entries Internal can read cogs_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can read cogs_entries" ON public.cogs_entries FOR SELECT TO authenticated USING (true);


--
-- Name: inventory_stock_movements Internal can read stock_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can read stock_movements" ON public.inventory_stock_movements FOR SELECT TO authenticated USING (true);


--
-- Name: approval_requests Internal can select approval_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can select approval_requests" ON public.approval_requests FOR SELECT TO authenticated USING (true);


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
-- Name: approval_requests Internal can update approval_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can update approval_requests" ON public.approval_requests FOR UPDATE TO authenticated USING (true);


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
-- Name: brand_group_members Internal users can delete brand group members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can delete brand group members" ON public.brand_group_members FOR DELETE TO authenticated USING (true);


--
-- Name: brand_groups Internal users can delete brand groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can delete brand groups" ON public.brand_groups FOR DELETE TO authenticated USING (true);


--
-- Name: brands Internal users can delete brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can delete brands" ON public.brands FOR DELETE TO authenticated USING (true);


--
-- Name: pricing_factors Internal users can delete pricing_factors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can delete pricing_factors" ON public.pricing_factors FOR DELETE TO authenticated USING (true);


--
-- Name: warehouses Internal users can delete warehouses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can delete warehouses" ON public.warehouses FOR DELETE TO authenticated USING (true);


--
-- Name: brand_group_members Internal users can insert brand group members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can insert brand group members" ON public.brand_group_members FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: brand_groups Internal users can insert brand groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can insert brand groups" ON public.brand_groups FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: brands Internal users can insert brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can insert brands" ON public.brands FOR INSERT TO authenticated WITH CHECK (true);


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
-- Name: chat_conversations Internal users can manage chat_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage chat_conversations" ON public.chat_conversations TO authenticated USING (true) WITH CHECK (true);


--
-- Name: contract_payments Internal users can manage contract_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage contract_payments" ON public.contract_payments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: contract_visits Internal users can manage contract_visits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage contract_visits" ON public.contract_visits TO authenticated USING (true) WITH CHECK (true);


--
-- Name: contracts Internal users can manage contracts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage contracts" ON public.contracts TO authenticated USING (true) WITH CHECK (true);


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
-- Name: employees Internal users can manage employees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage employees" ON public.employees TO authenticated USING (true) WITH CHECK (true);


--
-- Name: fifo_cost_layers Internal users can manage fifo_cost_layers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage fifo_cost_layers" ON public.fifo_cost_layers TO authenticated USING (true) WITH CHECK (true);


--
-- Name: instructions Internal users can manage instructions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage instructions" ON public.instructions TO authenticated USING (true) WITH CHECK (true);


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
-- Name: order_log Internal users can manage order_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage order_log" ON public.order_log TO authenticated USING (true) WITH CHECK (true);


--
-- Name: order_services Internal users can manage order_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage order_services" ON public.order_services TO authenticated USING (true) WITH CHECK (true);


--
-- Name: order_team_assignments Internal users can manage order_team_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage order_team_assignments" ON public.order_team_assignments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: orders Internal users can manage orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage orders" ON public.orders TO authenticated USING (true) WITH CHECK (true);


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
-- Name: promotion_campaigns Internal users can manage promotion_campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage promotion_campaigns" ON public.promotion_campaigns TO authenticated USING (true) WITH CHECK (true);


--
-- Name: promotion_rules Internal users can manage promotion_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage promotion_rules" ON public.promotion_rules TO authenticated USING (true) WITH CHECK (true);


--
-- Name: qc_checklists Internal users can manage qc_checklists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage qc_checklists" ON public.qc_checklists TO authenticated USING (true) WITH CHECK (true);


--
-- Name: qc_inspection_results Internal users can manage qc_inspection_results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage qc_inspection_results" ON public.qc_inspection_results TO authenticated USING (true) WITH CHECK (true);


--
-- Name: qc_schedule Internal users can manage qc_schedule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage qc_schedule" ON public.qc_schedule TO authenticated USING (true) WITH CHECK (true);


--
-- Name: qc_team_scores Internal users can manage qc_team_scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage qc_team_scores" ON public.qc_team_scores TO authenticated USING (true) WITH CHECK (true);


--
-- Name: quotation_log Internal users can manage quotation_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage quotation_log" ON public.quotation_log TO authenticated USING (true) WITH CHECK (true);


--
-- Name: quotations Internal users can manage quotations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage quotations" ON public.quotations TO authenticated USING (true) WITH CHECK (true);


--
-- Name: receival_items Internal users can manage receival_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage receival_items" ON public.receival_items TO authenticated USING (true) WITH CHECK (true);


--
-- Name: receivals Internal users can manage receivals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage receivals" ON public.receivals TO authenticated USING (true) WITH CHECK (true);


--
-- Name: reminder_categories Internal users can manage reminder_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage reminder_categories" ON public.reminder_categories TO authenticated USING (true) WITH CHECK (true);


--
-- Name: reminders Internal users can manage reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage reminders" ON public.reminders TO authenticated USING (true) WITH CHECK (true);


--
-- Name: rfq_line_items Internal users can manage rfq_line_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage rfq_line_items" ON public.rfq_line_items TO authenticated USING (true) WITH CHECK (true);


--
-- Name: rfq_quotes Internal users can manage rfq_quotes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage rfq_quotes" ON public.rfq_quotes TO authenticated USING (true) WITH CHECK (true);


--
-- Name: rfqs Internal users can manage rfqs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage rfqs" ON public.rfqs TO authenticated USING (true) WITH CHECK (true);


--
-- Name: schedules Internal users can manage schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage schedules" ON public.schedules TO authenticated USING (true) WITH CHECK (true);


--
-- Name: services Internal users can manage services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage services" ON public.services TO authenticated USING (true) WITH CHECK (true);


--
-- Name: shipments Internal users can manage shipments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage shipments" ON public.shipments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: sync_state Internal users can manage sync_state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage sync_state" ON public.sync_state TO authenticated USING (true) WITH CHECK (true);


--
-- Name: team_schedule_assignments Internal users can manage team_schedule_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage team_schedule_assignments" ON public.team_schedule_assignments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: teams Internal users can manage teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage teams" ON public.teams TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tool_asset_items Internal users can manage tool_asset_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage tool_asset_items" ON public.tool_asset_items TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tool_asset_units Internal users can manage tool_asset_units; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage tool_asset_units" ON public.tool_asset_units TO authenticated USING (true) WITH CHECK (true);


--
-- Name: vehicles Internal users can manage vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage vehicles" ON public.vehicles TO authenticated USING (true) WITH CHECK (true);


--
-- Name: voucher_redemptions Internal users can manage voucher_redemptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage voucher_redemptions" ON public.voucher_redemptions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: vouchers Internal users can manage vouchers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage vouchers" ON public.vouchers TO authenticated USING (true) WITH CHECK (true);


--
-- Name: warehouse_transfers Internal users can manage warehouse_transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage warehouse_transfers" ON public.warehouse_transfers TO authenticated USING (true) WITH CHECK (true);


--
-- Name: app_settings Internal users can read app_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can read app_settings" ON public.app_settings FOR SELECT TO authenticated USING (true);


--
-- Name: brands Internal users can read brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can read brands" ON public.brands FOR SELECT TO authenticated USING (true);


--
-- Name: companies Internal users can read companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can read companies" ON public.companies FOR SELECT TO authenticated USING (true);


--
-- Name: divisions Internal users can read divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can read divisions" ON public.divisions FOR SELECT TO authenticated USING (true);


--
-- Name: pricing_factors Internal users can read pricing_factors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can read pricing_factors" ON public.pricing_factors FOR SELECT TO authenticated USING (true);


--
-- Name: stock_adjustments Internal users can update adjustments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can update adjustments" ON public.stock_adjustments FOR UPDATE TO authenticated USING (true);


--
-- Name: brand_groups Internal users can update brand groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can update brand groups" ON public.brand_groups FOR UPDATE TO authenticated USING (true);


--
-- Name: brands Internal users can update brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can update brands" ON public.brands FOR UPDATE TO authenticated USING (true);


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
-- Name: brand_group_members Internal users can view brand group members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can view brand group members" ON public.brand_group_members FOR SELECT TO authenticated USING (true);


--
-- Name: brand_groups Internal users can view brand groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can view brand groups" ON public.brand_groups FOR SELECT TO authenticated USING (true);


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
-- Name: service_brands Manage services write service_brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Manage services write service_brands" ON public.service_brands TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.profiles p
     JOIN public.user_custom_roles ucr ON ((ucr.profile_id = p.id)))
     JOIN public.custom_roles cr ON ((cr.id = ucr.role_id)))
  WHERE ((p.auth_user_id = auth.uid()) AND ((cr.is_system = true) OR ('master_data.services.manage'::text = ANY (cr.permissions))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.profiles p
     JOIN public.user_custom_roles ucr ON ((ucr.profile_id = p.id)))
     JOIN public.custom_roles cr ON ((cr.id = ucr.role_id)))
  WHERE ((p.auth_user_id = auth.uid()) AND ((cr.is_system = true) OR ('master_data.services.manage'::text = ANY (cr.permissions)))))));


--
-- Name: media_download_jobs Service role only on media jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only on media jobs" ON public.media_download_jobs TO service_role USING (true) WITH CHECK (true);


--
-- Name: call_records Service role write call records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role write call records" ON public.call_records TO service_role USING (true) WITH CHECK (true);


--
-- Name: purge_batches Service role writes purge batches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role writes purge batches" ON public.purge_batches TO service_role USING (true) WITH CHECK (true);


--
-- Name: activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_chain_tiers allow_all_approval_chain_tiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_approval_chain_tiers ON public.approval_chain_tiers TO authenticated USING (true) WITH CHECK (true);


--
-- Name: approval_chains allow_all_approval_chains; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_approval_chains ON public.approval_chains TO authenticated USING (true) WITH CHECK (true);


--
-- Name: notifications allow_all_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_notifications ON public.notifications USING (true) WITH CHECK (true);


--
-- Name: app_settings anon read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon read" ON public.app_settings FOR SELECT TO anon USING (true);


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_chain_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_chain_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_chains; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_chains ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

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
-- Name: quotation_line_items authenticated_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_full_access ON public.quotation_line_items TO authenticated USING (true) WITH CHECK (true);


--
-- Name: site_visit_dates authenticated_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_full_access ON public.site_visit_dates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: site_visit_team_assignments authenticated_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_full_access ON public.site_visit_team_assignments TO authenticated USING (true) WITH CHECK (true);


--
-- Name: site_visits authenticated_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_full_access ON public.site_visits TO authenticated USING (true) WITH CHECK (true);


--
-- Name: team_activity_log authenticated_manage_activity_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_manage_activity_log ON public.team_activity_log TO authenticated USING (true) WITH CHECK (true);


--
-- Name: order_visit_dates authenticated_manage_order_visit_dates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_manage_order_visit_dates ON public.order_visit_dates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: customer_subscriptions authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read ON public.customer_subscriptions FOR SELECT TO authenticated USING (true);


--
-- Name: subscription_package_services authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read ON public.subscription_package_services FOR SELECT TO authenticated USING (true);


--
-- Name: subscription_packages authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read ON public.subscription_packages FOR SELECT TO authenticated USING (true);


--
-- Name: subscription_usage_log authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read ON public.subscription_usage_log FOR SELECT TO authenticated USING (true);


--
-- Name: brand_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand_group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: brand_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

--
-- Name: call_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_blocks cc_blocks_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cc_blocks_insert ON public.customer_blocks FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: customer_blocks cc_blocks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cc_blocks_select ON public.customer_blocks FOR SELECT TO authenticated USING (true);


--
-- Name: chat_messages cc_messages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cc_messages_select ON public.chat_messages FOR SELECT TO authenticated USING (true);


--
-- Name: chat_messages cc_messages_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cc_messages_update ON public.chat_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: chat_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages chat_messages_insert_strict; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_messages_insert_strict ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.chat_conversations cc
  WHERE (cc.id = chat_messages.conversation_id))) AND (EXISTS ( SELECT 1
   FROM ((public.profiles p
     JOIN public.user_custom_roles ur ON ((ur.profile_id = p.id)))
     JOIN public.custom_roles cr ON ((cr.id = ur.role_id)))
  WHERE ((p.auth_user_id = auth.uid()) AND ('contact_centre.view'::text = ANY (cr.permissions)))))));


--
-- Name: cogs_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cogs_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: contract_milestones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contract_milestones ENABLE ROW LEVEL SECURITY;

--
-- Name: contract_milestones contract_milestones_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contract_milestones_delete ON public.contract_milestones FOR DELETE TO authenticated USING (public.is_contract_visible(contract_id));


--
-- Name: contract_milestones contract_milestones_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contract_milestones_insert ON public.contract_milestones FOR INSERT TO authenticated WITH CHECK (public.is_contract_visible(contract_id));


--
-- Name: contract_milestones contract_milestones_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contract_milestones_select ON public.contract_milestones FOR SELECT TO authenticated USING (public.is_contract_visible(contract_id));


--
-- Name: contract_milestones contract_milestones_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contract_milestones_update ON public.contract_milestones FOR UPDATE TO authenticated USING (public.is_contract_visible(contract_id)) WITH CHECK (public.is_contract_visible(contract_id));


--
-- Name: contract_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contract_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: contract_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contract_services ENABLE ROW LEVEL SECURITY;

--
-- Name: contract_services contract_services_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contract_services_delete ON public.contract_services FOR DELETE TO authenticated USING (public.is_contract_visible(contract_id));


--
-- Name: contract_services contract_services_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contract_services_insert ON public.contract_services FOR INSERT TO authenticated WITH CHECK (public.is_contract_visible(contract_id));


--
-- Name: contract_services contract_services_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contract_services_select ON public.contract_services FOR SELECT TO authenticated USING (public.is_contract_visible(contract_id));


--
-- Name: contract_services contract_services_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contract_services_update ON public.contract_services FOR UPDATE TO authenticated USING (public.is_contract_visible(contract_id)) WITH CHECK (public.is_contract_visible(contract_id));


--
-- Name: contract_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contract_visits ENABLE ROW LEVEL SECURITY;

--
-- Name: contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: country_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.country_codes ENABLE ROW LEVEL SECURITY;

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
-- Name: customer_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_phones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_phones ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_subscriptions ENABLE ROW LEVEL SECURITY;

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
-- Name: divisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;

--
-- Name: document_terms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_terms ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_services ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: fifo_cost_layers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fifo_cost_layers ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_up_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follow_up_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_up_requests fur_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fur_insert ON public.follow_up_requests FOR INSERT TO authenticated WITH CHECK ((requested_by_user_id = auth.uid()));


--
-- Name: follow_up_requests fur_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fur_select ON public.follow_up_requests FOR SELECT TO authenticated USING (true);


--
-- Name: follow_up_requests fur_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fur_update ON public.follow_up_requests FOR UPDATE TO authenticated USING (true);


--
-- Name: installed_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.installed_products ENABLE ROW LEVEL SECURITY;

--
-- Name: instructions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instructions ENABLE ROW LEVEL SECURITY;

--
-- Name: service_customer_addresses internal_select_service_customer_addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_select_service_customer_addresses ON public.service_customer_addresses FOR SELECT TO authenticated USING (true);


--
-- Name: service_customer_phones internal_select_service_customer_phones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_select_service_customer_phones ON public.service_customer_phones FOR SELECT TO authenticated USING (true);


--
-- Name: service_customers internal_select_service_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_select_service_customers ON public.service_customers FOR SELECT TO authenticated USING (true);


--
-- Name: service_customer_addresses internal_write_service_customer_addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_write_service_customer_addresses ON public.service_customer_addresses TO authenticated USING (true) WITH CHECK (true);


--
-- Name: service_customer_phones internal_write_service_customer_phones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_write_service_customer_phones ON public.service_customer_phones TO authenticated USING (true) WITH CHECK (true);


--
-- Name: service_customers internal_write_service_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_write_service_customers ON public.service_customers TO authenticated USING (true) WITH CHECK (true);


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
-- Name: media_download_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_download_jobs ENABLE ROW LEVEL SECURITY;

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
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: order_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_log ENABLE ROW LEVEL SECURITY;

--
-- Name: order_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_services ENABLE ROW LEVEL SECURITY;

--
-- Name: order_team_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_team_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: order_visit_dates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_visit_dates ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

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
-- Name: po_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: po_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_line_items ENABLE ROW LEVEL SECURITY;

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
-- Name: promotion_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotion_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: promotion_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotion_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: purge_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purge_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: qb_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qb_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: qb_division_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qb_division_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: qb_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qb_items ENABLE ROW LEVEL SECURITY;

--
-- Name: qc_checklists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qc_checklists ENABLE ROW LEVEL SECURITY;

--
-- Name: qc_inspection_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qc_inspection_results ENABLE ROW LEVEL SECURITY;

--
-- Name: qc_schedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qc_schedule ENABLE ROW LEVEL SECURITY;

--
-- Name: qc_team_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qc_team_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: quotation_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotation_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: quotation_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotation_log ENABLE ROW LEVEL SECURITY;

--
-- Name: quotations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

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
-- Name: reminder_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminder_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

--
-- Name: rfq_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rfq_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: rfq_quotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rfq_quotes ENABLE ROW LEVEL SECURITY;

--
-- Name: rfqs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_order_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_order_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: service_change_requests scr_no_direct_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scr_no_direct_delete ON public.service_change_requests FOR DELETE TO authenticated USING (false);


--
-- Name: service_change_requests scr_no_direct_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scr_no_direct_insert ON public.service_change_requests FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: service_change_requests scr_no_direct_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scr_no_direct_update ON public.service_change_requests FOR UPDATE TO authenticated USING (false);


--
-- Name: service_change_requests scr_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scr_select ON public.service_change_requests FOR SELECT TO authenticated USING (((requested_by = ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.auth_user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM (public.user_custom_roles ucr
     JOIN public.custom_roles cr ON ((cr.id = ucr.role_id)))
  WHERE ((ucr.profile_id = ( SELECT profiles.id
           FROM public.profiles
          WHERE (profiles.auth_user_id = auth.uid()))) AND (cr.deleted_at IS NULL) AND ((cr.is_system = true) OR ('master_data.services.approve'::text = ANY (cr.permissions))))))));


--
-- Name: service_brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_brands ENABLE ROW LEVEL SECURITY;

--
-- Name: service_change_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_change_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: service_customer_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_customer_addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: service_customer_phones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_customer_phones ENABLE ROW LEVEL SECURITY;

--
-- Name: service_customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_customers ENABLE ROW LEVEL SECURITY;

--
-- Name: service_instructions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_instructions ENABLE ROW LEVEL SECURITY;

--
-- Name: service_instructions service_instructions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_instructions_read ON public.service_instructions FOR SELECT TO authenticated USING (true);


--
-- Name: service_instructions service_instructions_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_instructions_write ON public.service_instructions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: service_inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_subscriptions service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.customer_subscriptions TO service_role USING (true) WITH CHECK (true);


--
-- Name: subscription_package_services service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.subscription_package_services TO service_role USING (true) WITH CHECK (true);


--
-- Name: subscription_packages service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.subscription_packages TO service_role USING (true) WITH CHECK (true);


--
-- Name: subscription_usage_log service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.subscription_usage_log TO service_role USING (true) WITH CHECK (true);


--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: shipments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

--
-- Name: site_visit_dates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_visit_dates ENABLE ROW LEVEL SECURITY;

--
-- Name: site_visit_team_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_visit_team_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: site_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_adjustment_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_adjustment_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_package_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_package_services ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_usage_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_usage_log ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

--
-- Name: team_activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_activity_log ENABLE ROW LEVEL SECURITY;

--
-- Name: team_live_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_live_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: team_schedule_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_schedule_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: tl_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tl_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: tl_payment_batch_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tl_payment_batch_items ENABLE ROW LEVEL SECURITY;

--
-- Name: tl_payment_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tl_payment_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: team_live_locations tll_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tll_insert ON public.team_live_locations FOR INSERT TO authenticated WITH CHECK ((team_id = ( SELECT t.id
   FROM ((public.teams t
     JOIN public.employees e ON ((e.id = t.leader_id)))
     JOIN public.profiles p ON ((p.id = e.profile_id)))
  WHERE (p.auth_user_id = auth.uid()))));


--
-- Name: team_live_locations tll_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tll_read ON public.team_live_locations FOR SELECT TO authenticated USING (true);


--
-- Name: team_live_locations tll_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tll_update ON public.team_live_locations FOR UPDATE TO authenticated USING ((team_id = ( SELECT t.id
   FROM ((public.teams t
     JOIN public.employees e ON ((e.id = t.leader_id)))
     JOIN public.profiles p ON ((p.id = e.profile_id)))
  WHERE (p.auth_user_id = auth.uid())))) WITH CHECK ((team_id = ( SELECT t.id
   FROM ((public.teams t
     JOIN public.employees e ON ((e.id = t.leader_id)))
     JOIN public.profiles p ON ((p.id = e.profile_id)))
  WHERE (p.auth_user_id = auth.uid()))));


--
-- Name: tool_asset_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tool_asset_items ENABLE ROW LEVEL SECURITY;

--
-- Name: tool_asset_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tool_asset_units ENABLE ROW LEVEL SECURITY;

--
-- Name: tool_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tool_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: traccar_geofences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.traccar_geofences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_custom_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_divisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_divisions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_ui_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_ui_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_ui_preferences user_ui_preferences_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ui_preferences_self_select ON public.user_ui_preferences FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: user_ui_preferences user_ui_preferences_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ui_preferences_self_update ON public.user_ui_preferences FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_ui_preferences user_ui_preferences_self_upsert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_ui_preferences_self_upsert ON public.user_ui_preferences FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: vehicles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

--
-- Name: voucher_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: vouchers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

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
-- Name: webhook_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_approval_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_approval_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_approval_steps workflow_steps_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_steps_select ON public.workflow_approval_steps FOR SELECT TO authenticated USING (true);


--
-- PostgreSQL database dump complete
--



-- ============================================================================
-- ROLE GRANTS  -  required for PostgREST / Supabase API access
-- ============================================================================
-- pg_dump --no-acl strips these; on a fresh Supabase project the standard
-- anon/authenticated/service_role roles need explicit grants on every table,
-- sequence, and routine, otherwise PostgREST returns 403 (PG error 42501)
-- before RLS policies are even evaluated.

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES    TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES  TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
