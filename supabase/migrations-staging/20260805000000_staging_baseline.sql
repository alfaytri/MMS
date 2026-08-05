-- ============================================================
-- MMS Staging Baseline (regenerated from live staging DB)
-- Generated: 2026-08-05 via pg_dump against mwvblpgbgxipvrevkeff
-- ============================================================

-- SECTION 1: public schema
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
-- Name: audit_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_severity AS ENUM (
    'info',
    'warning',
    'error',
    'critical'
);


--
-- Name: credit_debit_line_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.credit_debit_line_type AS ENUM (
    'original',
    'returned'
);


--
-- Name: credit_group_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.credit_group_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);


--
-- Name: credit_note_resolution_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.credit_note_resolution_type AS ENUM (
    'refund',
    'replacement',
    'store_credit'
);


--
-- Name: credit_note_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.credit_note_status AS ENUM (
    'draft',
    'approved',
    'open',
    'in_progress',
    'resolved',
    'void'
);


--
-- Name: customer_entity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.customer_entity_type AS ENUM (
    'individual',
    'business'
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
-- Name: inventory_check_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_check_event_type AS ENUM (
    'initialized',
    'user_completed',
    'all_counted',
    'approval_action',
    'approved',
    'rejected',
    'user_started'
);


--
-- Name: inventory_check_step_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_check_step_role AS ENUM (
    'accounting_manager',
    'inventory_manager',
    'responsible_person',
    'brand_manager',
    'owner'
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
-- Name: invoice_payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_payment_status AS ENUM (
    'unpaid',
    'partially_paid',
    'paid',
    'overdue'
);


--
-- Name: invoice_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_source AS ENUM (
    'sale_order',
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
-- Name: invoice_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_type AS ENUM (
    'cash',
    'credit'
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
    'reminder',
    'booking'
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
-- Name: order_quotation_status; Type: TYPE; Schema: public; Owner: -
--

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
-- Name: payment_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_direction AS ENUM (
    'incoming',
    'outgoing'
);


--
-- Name: payment_source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_source_type AS ENUM (
    'sale_order',
    'purchase_order',
    'invoice',
    'bill'
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
-- Name: po_edit_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.po_edit_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'used'
);


--
-- Name: po_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.po_stage AS ENUM (
    'rfq',
    'draft',
    'po'
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
-- Name: receival_source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.receival_source_type AS ENUM (
    'purchase',
    'inventory'
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
    'purchase_order'
);


--
-- Name: return_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.return_status AS ENUM (
    'pending',
    'pending_inspection',
    'received',
    'restocked',
    'closed',
    'dispatched',
    'supplier_confirmed',
    'cancelled',
    'resolved_credit',
    'resolved_replacement',
    'resolved_partial'
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
-- Name: sale_delivery_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sale_delivery_type AS ENUM (
    'standard',
    'replacement'
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
-- Name: stock_adjustment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stock_adjustment_type AS ENUM (
    'increase',
    'decrease',
    'set',
    'damage',
    'write_off'
);


--
-- Name: stock_movement_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stock_movement_type AS ENUM (
    'purchase_receival',
    'sale_delivery',
    'adjustment',
    'transfer_in',
    'transfer_out',
    'cost_adjustment',
    'receival_edit',
    'free_receival',
    'sale_return',
    'sale_return_damaged',
    'purchase_return',
    'purchase_return_cancelled',
    'inventory_check',
    'inventory_receival_carve',
    'inventory_receival_new',
    'damaged_return_from_repair_as_good',
    'consumption'
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
-- Name: warranty_source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.warranty_source_type AS ENUM (
    'sale',
    'service',
    'contract'
);


--
-- Name: _check_attribute_key_branch_unique(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._check_attribute_key_branch_unique() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_conflict_category text;
BEGIN
  -- Ancestors
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, name_en, 1 AS depth
    FROM public.inventory_categories
    WHERE id = NEW.category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, a.depth + 1
    FROM public.inventory_categories c
    JOIN ancestors a ON a.parent_id = c.id
    WHERE a.depth < 10
  )
  SELECT a.name_en INTO v_conflict_category
  FROM ancestors a
  JOIN public.inventory_attribute_definitions d
    ON d.category_id = a.id
   AND d.attribute_key = NEW.attribute_key
   AND d.id <> COALESCE(NEW.id, gen_random_uuid())
  WHERE a.depth > 1                     -- exclude the row's own category (depth 1) — that's the local UNIQUE's job
  LIMIT 1;

  IF v_conflict_category IS NOT NULL THEN
    RAISE EXCEPTION 'Attribute % already defined at ancestor category "%"',
      NEW.attribute_key, v_conflict_category
      USING ERRCODE = '23505';
  END IF;

  -- Descendants
  WITH RECURSIVE descendants AS (
    SELECT id, parent_id, name_en, 1 AS depth
    FROM public.inventory_categories
    WHERE parent_id = NEW.category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, d.depth + 1
    FROM public.inventory_categories c
    JOIN descendants d ON c.parent_id = d.id
    WHERE d.depth < 10
  )
  SELECT a.name_en INTO v_conflict_category
  FROM descendants a
  JOIN public.inventory_attribute_definitions d
    ON d.category_id = a.id
   AND d.attribute_key = NEW.attribute_key
   AND d.id <> COALESCE(NEW.id, gen_random_uuid())
  LIMIT 1;

  IF v_conflict_category IS NOT NULL THEN
    RAISE EXCEPTION 'Attribute % already defined at descendant category "%"',
      NEW.attribute_key, v_conflict_category
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: _consume_damaged_stock_fifo(uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._consume_damaged_stock_fifo(p_warehouse_id uuid, p_brand_variant_id uuid, p_qty numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_needed numeric := p_qty;
  v_layer  record;
  v_take   numeric;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception '_consume_damaged_stock_fifo: qty must be > 0 (got %)', p_qty;
  end if;

  for v_layer in
    select id, qty_remaining
      from public.inventory_damaged_stock_layers
     where warehouse_id = p_warehouse_id
       and brand_variant_id = p_brand_variant_id
       and qty_remaining > 0
     order by layered_at, id
    for update
  loop
    exit when v_needed <= 0;
    v_take := least(v_needed, v_layer.qty_remaining);
    update public.inventory_damaged_stock_layers
       set qty_remaining = qty_remaining - v_take
     where id = v_layer.id;
    v_needed := v_needed - v_take;
  end loop;

  if v_needed > 0 then
    raise exception '_consume_damaged_stock_fifo: insufficient damaged stock at % / % (short by %)',
      p_warehouse_id, p_brand_variant_id, v_needed;
  end if;

  update public.inventory_damaged_stock
     set qty = qty - p_qty,
         updated_at = now()
   where warehouse_id = p_warehouse_id
     and brand_variant_id = p_brand_variant_id;

  if not found then
    raise exception '_consume_damaged_stock_fifo: aggregate row missing at % / %', p_warehouse_id, p_brand_variant_id;
  end if;
end;
$$;


--
-- Name: _current_user_data_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._current_user_data_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM public.user_data WHERE auth_user_id = auth.uid() LIMIT 1;
$$;


--
-- Name: _enforce_return_line_provenance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._enforce_return_line_provenance() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE v_source public.return_source_type;
BEGIN
  SELECT source_type INTO v_source
  FROM   public.so_po_returns
  WHERE  id = NEW.return_id;

  IF v_source = 'purchase_order' AND NEW.receival_item_id IS NULL THEN
    RAISE EXCEPTION 'return_lines.receival_item_id is required for PO returns (return_id=%)', NEW.return_id
      USING HINT = 'Every PO-return line must reference the receival_items row it originated from — D.4.a rule.';
  END IF;

  IF v_source = 'sale_order' AND NEW.sale_delivery_line_id IS NULL THEN
    RAISE EXCEPTION 'return_lines.sale_delivery_line_id is required for SO returns (return_id=%)', NEW.return_id
      USING HINT = 'Every SO-return line must reference the sale_delivery_lines row it originated from — D.4.b rule.';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: _enforce_sub_container_division_rule(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._enforce_sub_container_division_rule() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_virtual boolean;
begin
  select coalesce(is_virtual, false) into v_virtual
    from public.warehouses
   where id = new.warehouse_id;

  if new.division_id is null and v_virtual = false then
    raise exception '_enforce_sub_container_division_rule: division_id required for sub-containers on real (non-virtual) warehouses (warehouse_id=%)', new.warehouse_id;
  end if;

  return new;
end;
$$;


--
-- Name: _find_or_create_sub_container(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._find_or_create_sub_container(p_warehouse_id uuid, p_division_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id       uuid;
  v_wh_name  text;
  v_div_name text;
begin
  if p_warehouse_id is null then
    raise exception '_find_or_create_sub_container: p_warehouse_id required';
  end if;
  -- p_division_id NULL is only valid for virtual warehouses (per Option A
  -- Variant 1 design). Let the sub-container INSERT hit the
  -- _enforce_sub_container_division_rule trigger for real-warehouse enforcement.

  select id into v_id
    from public.warehouse_sub_containers
   where warehouse_id = p_warehouse_id
     and division_id is not distinct from p_division_id
     and is_active
   order by created_at
   limit 1;

  if v_id is not null then
    return v_id;
  end if;

  -- Not found — create one.
  select name into v_wh_name  from public.warehouses         where id = p_warehouse_id;
  if p_division_id is not null then
    select name into v_div_name from public.company_divisions where id = p_division_id;
  end if;

  insert into public.warehouse_sub_containers
    (warehouse_id, division_id, name, is_active, created_by)
  values (
    p_warehouse_id,
    p_division_id,
    coalesce(v_wh_name, 'Warehouse') || case when v_div_name is null then '' else ' — ' || v_div_name end,
    true,
    public._current_user_data_id()
  )
  returning id into v_id;

  return v_id;
end;
$$;


--
-- Name: _fx_document_booking(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._fx_document_booking(p_document_type text, p_document_id uuid, OUT o_currency text, OUT o_rate numeric, OUT o_direction text) RETURNS record
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_document_type = 'po' THEN
    SELECT currency, initial_exchange_rate, 'outgoing'
      INTO o_currency, o_rate, o_direction
      FROM public.purchase_orders WHERE id = p_document_id;
  ELSIF p_document_type = 'so' THEN
    SELECT currency, initial_exchange_rate, 'incoming'
      INTO o_currency, o_rate, o_direction
      FROM public.sale_orders WHERE id = p_document_id;
  ELSE
    RAISE EXCEPTION 'Unknown document_type %', p_document_type;
  END IF;
END $$;


--
-- Name: _has_custody_admin_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._has_custody_admin_role(p_profile_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.user_custom_roles ucr
    JOIN   public.custom_roles      cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id = p_profile_id
      AND  cr.deleted_at IS NULL
      AND  (cr.name = 'inventory_manager' OR cr.is_system_admin = true)
  );
$$;


--
-- Name: _maybe_close_return(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._maybe_close_return(p_return_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_customer_remaining   numeric;
  v_inventory_remaining  numeric;
  v_new_status           public.return_status;
  v_cn_id                uuid;
  v_all_replacement      boolean;
  v_all_store_credit     boolean;
  v_all_refund           boolean;
  v_new_resolution_type  public.credit_note_resolution_type;
begin
  select customer_remaining, inventory_remaining
    into v_customer_remaining, v_inventory_remaining
    from public.return_progress
    where return_id = p_return_id;

  if v_customer_remaining is null or v_customer_remaining > 0 then
    return;
  end if;
  if coalesce(v_inventory_remaining, 0) > 0 then
    return;
  end if;

  v_new_status := public._return_resolution_status(p_return_id);
  if v_new_status is null then
    return;
  end if;

  update public.so_po_returns
    set status = v_new_status, updated_at = now()
    where id = p_return_id
      and status not in (
        'cancelled',
        'resolved_credit',
        'resolved_replacement',
        'resolved_partial'
      );

  -- Stamp the CN with the resolution_type + terminal status.
  select credit_note_id into v_cn_id
    from public.so_po_returns where id = p_return_id;
  if v_cn_id is null then
    return;
  end if;

  -- Phase 8.6 fix: compute the customer-ledger mix and stamp the correct
  -- resolution_type. Pure store_credit now gets its own arm (was silently
  -- collapsing to 'refund' before).
  select
    bool_and(cr.resolution_type = 'replacement'),
    bool_and(cr.resolution_type = 'store_credit'),
    bool_and(cr.resolution_type = 'refund')
  into
    v_all_replacement, v_all_store_credit, v_all_refund
  from public.return_line_customer_resolutions cr
  join public.return_lines rl on rl.id = cr.return_line_id
  where rl.return_id = p_return_id;

  v_new_resolution_type := case
    when v_all_replacement  then 'replacement'::public.credit_note_resolution_type
    when v_all_store_credit then 'store_credit'::public.credit_note_resolution_type
    when v_all_refund       then 'refund'::public.credit_note_resolution_type
    else null
  end;

  update public.credit_notes cn
    set resolution_type = v_new_resolution_type,
        status = case
          when cn.status = 'void'::public.credit_note_status
            then 'void'::public.credit_note_status
          else 'resolved'::public.credit_note_status
        end
    where cn.id = v_cn_id;
end;
$$;


--
-- Name: _record_customer_resolution(uuid, text, numeric, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._record_customer_resolution(p_return_line_id uuid, p_resolution_type text, p_qty numeric, p_sale_delivery_id uuid DEFAULT NULL::uuid, p_credit_note_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_remaining numeric;
  v_new_id    uuid;
  v_return_id uuid;
begin
  if p_resolution_type not in ('refund','replacement','store_credit') then
    raise exception '_record_customer_resolution: invalid resolution_type %', p_resolution_type;
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception '_record_customer_resolution: qty must be > 0 (got %)', p_qty;
  end if;

  select customer_remaining_qty into v_remaining
    from public.return_line_progress
    where return_line_id = p_return_line_id;
  if v_remaining is null then
    raise exception '_record_customer_resolution: return_line % not found', p_return_line_id;
  end if;
  if p_qty > v_remaining then
    raise exception '_record_customer_resolution: qty % exceeds customer remaining %', p_qty, v_remaining;
  end if;

  insert into public.return_line_customer_resolutions (
    return_line_id, resolution_type, qty,
    sale_delivery_id, credit_note_id, notes, created_by
  ) values (
    p_return_line_id, p_resolution_type, p_qty,
    p_sale_delivery_id, p_credit_note_id, p_notes, auth.uid()
  ) returning id into v_new_id;

  -- Phase 8.1b: bump linked CN(s) from open → in_progress on first resolution.
  -- Terminal resolved flip is handled by _maybe_close_return.
  select rl.return_id into v_return_id
    from public.return_lines rl
    where rl.id = p_return_line_id;
  update public.credit_notes cn
    set status = 'in_progress'::public.credit_note_status
    where cn.source_return_id = v_return_id
      and cn.status = 'open'::public.credit_note_status;

  return v_new_id;
end;
$$;


--
-- Name: _record_inventory_disposition(uuid, text, numeric, uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._record_inventory_disposition(p_return_line_id uuid, p_disposition_type text, p_qty numeric, p_inventory_stock_movement_id uuid DEFAULT NULL::uuid, p_warehouse_transfer_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_warehouse_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_condition     text;
  v_remaining     numeric;
  v_return_id     uuid;
  v_brand_variant uuid;
  v_unit_cost     numeric;
  v_new_id        uuid;
  v_uid           uuid := public._current_user_data_id();
begin
  if p_disposition_type not in ('write_off','restock_as_damaged','send_for_repair') then
    raise exception '_record_inventory_disposition: invalid disposition_type %', p_disposition_type;
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception '_record_inventory_disposition: qty must be > 0 (got %)', p_qty;
  end if;

  select rl.condition, p.inventory_remaining_qty, p.return_id, p.brand_variant_id
    into v_condition, v_remaining, v_return_id, v_brand_variant
    from public.return_lines rl
    join public.return_line_progress p on p.return_line_id = rl.id
    where rl.id = p_return_line_id;
  if v_condition is null then
    raise exception '_record_inventory_disposition: return_line % not found', p_return_line_id;
  end if;
  if v_condition <> 'damaged' then
    raise exception '_record_inventory_disposition: return_line % is not damaged (condition=%)', p_return_line_id, v_condition;
  end if;
  if p_qty > coalesce(v_remaining, 0) then
    raise exception '_record_inventory_disposition: qty % exceeds inventory remaining %', p_qty, coalesce(v_remaining, 0);
  end if;

  if p_disposition_type = 'restock_as_damaged' and p_warehouse_id is null then
    raise exception '_record_inventory_disposition: p_warehouse_id is required for restock_as_damaged';
  end if;
  if p_disposition_type = 'send_for_repair' and p_warehouse_id is null then
    raise exception '_record_inventory_disposition: p_warehouse_id is required for send_for_repair (needed by rpc_send_damaged_for_repair follow-up)';
  end if;

  -- return_line_inventory_dispositions.created_by is a plain uuid (no FK) —
  -- auth.uid() is fine here.
  insert into public.return_line_inventory_dispositions (
    return_line_id, disposition_type, qty,
    inventory_stock_movement_id, warehouse_transfer_id, notes, created_by
  ) values (
    p_return_line_id, p_disposition_type, p_qty,
    p_inventory_stock_movement_id, p_warehouse_transfer_id, p_notes, auth.uid()
  ) returning id into v_new_id;

  if p_disposition_type = 'restock_as_damaged' then
    v_unit_cost := public._return_line_fifo_unit_cost(v_return_id, p_return_line_id, p_qty);

    -- created_by → user_data(id): use resolved v_uid, not raw auth.uid()
    insert into public.inventory_damaged_stock_layers
      (warehouse_id, brand_variant_id, qty_received, qty_remaining, unit_cost, source_return_line_id, created_by)
    values (p_warehouse_id, v_brand_variant, p_qty, p_qty, v_unit_cost, p_return_line_id, v_uid);

    insert into public.inventory_damaged_stock (warehouse_id, brand_variant_id, qty, weighted_unit_cost)
    values (p_warehouse_id, v_brand_variant, p_qty, v_unit_cost)
    on conflict (warehouse_id, brand_variant_id) do update
      set qty = inventory_damaged_stock.qty + excluded.qty,
          weighted_unit_cost = (
            (inventory_damaged_stock.qty * inventory_damaged_stock.weighted_unit_cost)
            + (excluded.qty * excluded.weighted_unit_cost)
          ) / (inventory_damaged_stock.qty + excluded.qty),
          updated_at = now();

    -- created_by → user_data(id)
    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, notes, created_by)
    values (
      'restock_as_damaged_in', p_qty, p_warehouse_id, v_brand_variant, v_unit_cost,
      v_new_id, p_notes, v_uid
    );
  end if;

  return v_new_id;
end;
$$;


--
-- Name: _repair_vendor_provision_warehouse(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._repair_vendor_provision_warehouse() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_repair_wh_id  uuid;
  v_new_sub_id    uuid;
BEGIN
  SELECT id INTO v_repair_wh_id
    FROM public.warehouses
   WHERE name = 'Repair' AND is_virtual = true
   LIMIT 1;

  IF v_repair_wh_id IS NULL THEN
    RAISE EXCEPTION '_repair_vendor_provision_warehouse: shared Repair warehouse missing — did the D.6.b migration run?';
  END IF;

  INSERT INTO public.warehouse_sub_containers
    (warehouse_id, division_id, name, is_active)
  VALUES
    (v_repair_wh_id, NULL, NEW.name, true)
  RETURNING id INTO v_new_sub_id;

  NEW.virtual_warehouse_id := v_repair_wh_id;
  NEW.sub_container_id     := v_new_sub_id;

  RETURN NEW;
END;
$$;


--
-- Name: _return_line_fifo_unit_cost(uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._return_line_fifo_unit_cost(p_return_id uuid, p_return_line_id uuid, p_qty numeric) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_source_id       uuid;
  v_brand_variant   uuid;
  v_qty_remaining   numeric := p_qty;
  v_qty_this_chunk  numeric;
  v_total_cost      numeric := 0;
  v_cogs            record;
begin
  select r.source_id, rl.brand_variant_id
    into v_source_id, v_brand_variant
    from public.so_po_returns r
    join public.return_lines rl on rl.return_id = r.id
    where r.id = p_return_id
      and rl.id = p_return_line_id;

  if v_source_id is null or v_brand_variant is null then
    return 0;
  end if;

  for v_cogs in
    select qty, unit_cost
      from public.cogs_entries
      where sale_order_id = v_source_id
        and brand_variant_id = v_brand_variant
        and qty > 0
      order by date asc, unit_cost asc, id asc
  loop
    exit when v_qty_remaining <= 0;
    v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);
    v_total_cost := v_total_cost + (v_qty_this_chunk * v_cogs.unit_cost);
    v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
  end loop;

  if p_qty > 0 then
    return round(v_total_cost / p_qty, 4);
  end if;
  return 0;
end;
$$;


--
-- Name: _return_resolution_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._return_resolution_status(p_return_id uuid) RETURNS public.return_status
    LANGUAGE sql STABLE
    AS $$
  select case
    when count(distinct cr.resolution_type) = 0 then null
    when count(distinct cr.resolution_type) > 1 then 'resolved_partial'::public.return_status
    when bool_and(cr.resolution_type = 'replacement') then 'resolved_replacement'::public.return_status
    when bool_and(cr.resolution_type in ('refund','store_credit')) then 'resolved_credit'::public.return_status
    else 'resolved_partial'::public.return_status
  end
  from public.return_lines rl
  join public.return_line_customer_resolutions cr on cr.return_line_id = rl.id
  where rl.return_id = p_return_id;
$$;


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
-- Name: _sync_brand_variant_damaged_qty(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._sync_brand_variant_damaged_qty() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_variant_id uuid;
BEGIN
  v_variant_id := COALESCE(NEW.brand_variant_id, OLD.brand_variant_id);
  IF v_variant_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.inventory_item_brand_variants v
  SET    damaged_qty = COALESCE((
           SELECT SUM(ds.qty)::int
           FROM   public.inventory_damaged_stock ds
           WHERE  ds.brand_variant_id = v_variant_id
         ), 0),
         updated_at  = now()
  WHERE  v.id = v_variant_id;

  RETURN NULL;
END;
$$;


--
-- Name: _sync_credit_note_reason_id_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._sync_credit_note_reason_id_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.reason_id IS NULL AND NEW.reason IS NOT NULL THEN
    SELECT id INTO NEW.reason_id
    FROM public.reason_lists
    WHERE lower(label) = lower(NEW.reason)
      AND category = 'sale_return'
      AND deleted_at IS NULL
    LIMIT 1;
    -- Silent fallback if unmatched — reason text is snapshot, FK is best-effort.
  ELSIF NEW.reason_id IS NOT NULL AND NEW.reason IS NULL THEN
    SELECT label INTO NEW.reason FROM public.reason_lists WHERE id = NEW.reason_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: _sync_credit_note_refund_method_id_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._sync_credit_note_refund_method_id_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.refund_method_id IS NULL AND NEW.refund_method IS NOT NULL THEN
    SELECT id INTO NEW.refund_method_id
    FROM public.payment_methods
    WHERE slug = NEW.refund_method;
    IF NEW.refund_method_id IS NULL THEN
      RAISE EXCEPTION 'refund_method slug % has no matching payment_methods row', NEW.refund_method;
    END IF;
  ELSIF NEW.refund_method_id IS NOT NULL AND NEW.refund_method IS NULL THEN
    SELECT slug INTO NEW.refund_method FROM public.payment_methods WHERE id = NEW.refund_method_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: _sync_currency_id_from_currency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._sync_currency_id_from_currency() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.currency_id IS NULL AND NEW.currency IS NOT NULL THEN
    SELECT id INTO NEW.currency_id FROM public.currencies WHERE code = NEW.currency;
    IF NEW.currency_id IS NULL THEN
      RAISE EXCEPTION 'currency code % has no matching currencies row', NEW.currency;
    END IF;
  ELSIF NEW.currency_id IS NOT NULL AND NEW.currency IS NULL THEN
    SELECT code INTO NEW.currency FROM public.currencies WHERE id = NEW.currency_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: _sync_currency_id_from_default_currency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._sync_currency_id_from_default_currency() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.currency_id IS NULL AND NEW.default_currency IS NOT NULL THEN
    SELECT id INTO NEW.currency_id FROM public.currencies WHERE code = NEW.default_currency;
    IF NEW.currency_id IS NULL THEN
      RAISE EXCEPTION 'currency code % has no matching currencies row', NEW.default_currency;
    END IF;
  ELSIF NEW.currency_id IS NOT NULL AND NEW.default_currency IS NULL THEN
    SELECT code INTO NEW.default_currency FROM public.currencies WHERE id = NEW.currency_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: _sync_debit_note_reason_id_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._sync_debit_note_reason_id_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.reason_id IS NULL AND NEW.reason IS NOT NULL THEN
    SELECT id INTO NEW.reason_id
    FROM public.reason_lists
    WHERE lower(label) = lower(NEW.reason)
      AND category = 'po_return'
      AND deleted_at IS NULL
    LIMIT 1;
  ELSIF NEW.reason_id IS NOT NULL AND NEW.reason IS NULL THEN
    SELECT label INTO NEW.reason FROM public.reason_lists WHERE id = NEW.reason_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: _sync_payment_method_id_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._sync_payment_method_id_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.method_id IS NULL AND NEW.method IS NOT NULL THEN
    SELECT id INTO NEW.method_id FROM public.payment_methods WHERE slug = NEW.method;
    IF NEW.method_id IS NULL THEN
      RAISE EXCEPTION 'payment method slug % has no matching payment_methods row', NEW.method;
    END IF;
  ELSIF NEW.method_id IS NOT NULL AND NEW.method IS NULL THEN
    SELECT slug INTO NEW.method FROM public.payment_methods WHERE id = NEW.method_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: _sync_supplier_country_id_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._sync_supplier_country_id_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.country_id IS NULL AND NEW.country IS NOT NULL THEN
    SELECT id INTO NEW.country_id FROM public.country_codes WHERE name = NEW.country;
    IF NEW.country_id IS NULL THEN
      RAISE EXCEPTION 'country name % has no matching country_codes row', NEW.country;
    END IF;
  ELSIF NEW.country_id IS NOT NULL AND NEW.country IS NULL THEN
    SELECT name INTO NEW.country FROM public.country_codes WHERE id = NEW.country_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: _trg_clear_active_on_division_removal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._trg_clear_active_on_division_removal() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE user_data
     SET active_division_id = NULL
   WHERE id = OLD.profile_id
     AND active_division_id = OLD.division_id;
  RETURN OLD;
END;
$$;


--
-- Name: _trg_payments_compute_fx(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._trg_payments_compute_fx() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_doc_type_short text;
  v_doc_currency   text;
  v_doc_rate       numeric;
  v_direction      text;
  v_booked_qar     numeric;
  v_paid_qar       numeric;
  v_delta          numeric;
BEGIN
  -- Map payment source_type enum → short form used by our document RPCs
  v_doc_type_short := CASE NEW.source_type::text
    WHEN 'purchase_order' THEN 'po'
    WHEN 'sale_order'     THEN 'so'
    ELSE NULL
  END;

  -- Only compute for foreign-currency payments linked to a PO or SO
  IF v_doc_type_short IS NULL OR NEW.source_id IS NULL
     OR COALESCE(NEW.currency,'QAR') = 'QAR' THEN
    NEW.exchange_gain := 0;
    NEW.exchange_loss := 0;
    RETURN NEW;
  END IF;

  SELECT o_currency, o_rate, o_direction
    INTO v_doc_currency, v_doc_rate, v_direction
    FROM public._fx_document_booking(v_doc_type_short, NEW.source_id);

  -- Document is QAR-only or currency mismatch → no gain/loss
  IF v_doc_currency IS NULL OR v_doc_currency = 'QAR'
     OR v_doc_currency <> NEW.currency THEN
    NEW.exchange_gain := 0;
    NEW.exchange_loss := 0;
    RETURN NEW;
  END IF;

  v_booked_qar := NEW.amount * COALESCE(v_doc_rate, 1);
  v_paid_qar   := NEW.amount * COALESCE(NEW.exchange_rate, 1);

  IF v_direction = 'outgoing' THEN
    -- Supplier payment (PO): we paid less QAR than we booked → gain
    v_delta := v_booked_qar - v_paid_qar;
  ELSE
    -- Customer payment (SO): we received more QAR than we booked → gain
    v_delta := v_paid_qar - v_booked_qar;
  END IF;

  IF v_delta >= 0 THEN
    NEW.exchange_gain := v_delta;
    NEW.exchange_loss := 0;
  ELSE
    NEW.exchange_gain := 0;
    NEW.exchange_loss := -v_delta;
  END IF;

  NEW.amount_qar := v_paid_qar;

  RETURN NEW;
END $$;


--
-- Name: _trg_payments_refresh_document_fx(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._trg_payments_refresh_document_fx() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_type text;
  v_id   uuid;
BEGIN
  -- Guard: if we're already inside rpc_recompute_document_fx's self-touch
  -- UPDATE cycle, skip. The outer call has already committed to running
  -- the parent-document rollup itself after the loop completes.
  IF current_setting('mms.fx_recompute_active', true) = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'DELETE') THEN
    v_type := OLD.source_type::text; v_id := OLD.source_id;
  ELSE
    v_type := NEW.source_type::text; v_id := NEW.source_id;
  END IF;

  IF v_type IN ('po','so') AND v_id IS NOT NULL THEN
    PERFORM public.rpc_recompute_document_fx(v_type, v_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;


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

    -- approved_by dropped in Section 1.18 — never read anywhere; the
    -- canonical rejector already lives on the step row above.
    UPDATE stock_adjustments
    SET    status            = 'rejected',
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
-- Name: add_workflow_step(text, text, boolean, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_workflow_step(p_workflow text, p_role_name text, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role_id   UUID;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
BEGIN
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit',
                        'credit_group','receival_edit','consumption_edit') THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;
  IF TRIM(p_role_name) = '' THEN
    RAISE EXCEPTION 'Role name cannot be empty';
  END IF;

  SELECT id INTO v_role_id
  FROM custom_roles
  WHERE name = p_role_name AND deleted_at IS NULL;

  IF v_role_id IS NULL THEN
    INSERT INTO custom_roles (name, is_approval_slot, is_system, permissions)
    VALUES (TRIM(p_role_name), true, false, '{}'::text[])
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


--
-- Name: add_workflow_step(text, text, text, boolean, text[], uuid); Type: FUNCTION; Schema: public; Owner: -
--

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
  v_step      approval_workflow_steps;
BEGIN
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit',
                        'credit_group','receival_edit','consumption_edit') THEN
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
    p_workflow, p_role_id, v_step_key, TRIM(v_role_name), v_max_order + 1,
    p_is_conditional, p_condition_types
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$$;


--
-- Name: add_workflow_step_for_role(text, uuid, boolean, text[], uuid); Type: FUNCTION; Schema: public; Owner: -
--

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
-- Name: advance_sales_approval(uuid, public.approval_type); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: allocate_landed_cost(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.allocate_landed_cost(p_lc_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_lc                RECORD;
  v_apply_time        TIMESTAMPTZ := now();
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

  -- Clear any existing allocations (idempotent re-apply)
  DELETE FROM landed_cost_item_allocations WHERE landed_cost_id = p_lc_id;

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

    -- Insert allocation row into normalized table
    INSERT INTO landed_cost_item_allocations (
      landed_cost_id, brand_variant_id, item_name, sku,
      qty_received, qty_remaining_at_lc, sold_qty,
      original_unit_cost, lc_per_unit, updated_unit_cost,
      allocated_lc_total, inventory_portion, cogs_portion
    ) VALUES (
      p_lc_id, v_bv.brand_variant_id, v_bv.item_name, v_bv.sku,
      v_bv.qty_received, v_bv_remaining, v_sold,
      ROUND(v_bv.avg_unit_cost, 4),
      ROUND(COALESCE(v_per_unit_lc, 0), 4),
      ROUND(v_bv.avg_unit_cost + COALESCE(v_per_unit_lc, 0), 4),
      ROUND(v_bv_lc_share, 2),
      ROUND(v_inventory_portion, 2),
      ROUND(v_cogs_portion, 2)
    );

    -- Build JSON for return value (backward compat with callers expecting JSONB)
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'brand_variant_id',     v_bv.brand_variant_id,
      'item_name',            v_bv.item_name,
      'sku',                  v_bv.sku,
      'qty_received',         v_bv.qty_received,
      'qty_remaining_at_lc',  v_bv_remaining,
      'sold_qty',             v_sold,
      'original_unit_cost',   ROUND(v_bv.avg_unit_cost, 4),
      'per_unit_lc',          ROUND(COALESCE(v_per_unit_lc, 0), 4),
      'lc_per_unit',          ROUND(COALESCE(v_per_unit_lc, 0), 4),
      'inventory_portion',    ROUND(v_inventory_portion, 2),
      'cogs_portion',         ROUND(v_cogs_portion, 2),
      'allocated_lc_total',   ROUND(v_bv_lc_share, 2),
      'updated_unit_cost',    ROUND(v_bv.avg_unit_cost + COALESCE(v_per_unit_lc, 0), 4),
      'allocated_cost',       ROUND(v_bv_lc_share / GREATEST(v_bv.qty_received, 1), 4)
    ));

    -- ── Inventory side ──────────────────────────────────────────────────────
    IF v_bv_remaining > 0 THEN
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
        qty, unit_cost, total_cost, date, notes, source_type
      ) VALUES (
        v_bv.brand_variant_id, NULL, NULL, p_lc_id,
        v_sold, ROUND(COALESCE(v_per_unit_lc, 0), 4),
        ROUND(v_cogs_portion, 2),
        v_apply_time::DATE,
        'LC ' || v_lc.lc_number || ' applied ' || v_apply_time::DATE
          || ' over ' || v_sold || ' sold units',
        'landed_cost'
      );
    END IF;
  END LOOP;

  UPDATE landed_costs
     SET applied_at       = v_apply_time,
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
  v_total_paid      NUMERIC;
  v_new_status      public.invoice_payment_status;
BEGIN
  SELECT amount INTO v_payment_total
  FROM payments WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;

  SELECT total_amount INTO v_bill_total
  FROM bills WHERE id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill % does not exist', p_bill_id;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than zero';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_already_alloc
  FROM payment_bill_allocations
  WHERE payment_id = p_payment_id
    AND bill_id != p_bill_id;

  IF v_already_alloc + p_amount > v_payment_total THEN
    RAISE EXCEPTION 'Allocation of % exceeds remaining payment balance of %',
      p_amount, v_payment_total - v_already_alloc;
  END IF;

  INSERT INTO payment_bill_allocations (payment_id, bill_id, amount)
  VALUES (p_payment_id, p_bill_id, p_amount)
  ON CONFLICT (payment_id, bill_id)
  DO UPDATE SET amount = EXCLUDED.amount;

  SELECT COALESCE(SUM(pba.amount), 0)
    INTO v_total_paid
    FROM payment_bill_allocations pba
   WHERE pba.bill_id = p_bill_id;

  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'::public.invoice_payment_status
    WHEN v_total_paid > 0             THEN 'partially_paid'::public.invoice_payment_status
    ELSE                                   'unpaid'::public.invoice_payment_status
  END;

  UPDATE bills
     SET paid_amount    = v_total_paid,
         payment_status = v_new_status
   WHERE id = p_bill_id;
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
  v_layer          RECORD;
  v_remaining      INT;
  v_take           INT;
BEGIN
  SELECT COALESCE(SUM(remaining_qty), 0)
  INTO v_current_qty
  FROM fifo_cost_layers
  WHERE brand_variant_id = p_brand_variant_id
    AND warehouse_id = p_warehouse_id
    AND remaining_qty > 0;

  v_delta := p_target_qty - v_current_qty;

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

  -- ── Quantity increase (unchanged) ────────────────────────────────────────
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
    FROM inventory_item_brand_variants
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

      UPDATE inventory_item_brand_variants
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

  -- ── Quantity decrease (rewritten) ────────────────────────────────────────
  ELSE
    -- One movement per layer drained. unit_cost now reflects the actual
    -- layer cost (was p_unit_cost, which was a caller-supplied number
    -- that didn't match FIFO reality).
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(p_brand_variant_id, p_warehouse_id, ABS(v_delta), false)
    LOOP
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, movement_type,
        qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        p_warehouse_id, p_brand_variant_id, '', 'adjustment',
        -v_layer.qty_taken, v_layer.unit_cost,
        'initial_allocation', p_brand_variant_id,
        'Stock allocation adjustment'
      );
    END LOOP;
  END IF;

  -- Update cost on all opening-stock layers for this warehouse.
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
-- Name: apply_adjustment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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
    FROM inventory_item_brand_variants WHERE id = v_adj.brand_variant_id;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type, source_id
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty,
      'adjustment', p_adjustment_id
    );

    UPDATE inventory_item_brand_variants
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
    FROM inventory_item_brand_variants ibv
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
    FROM inventory_item_brand_variants ibv
    WHERE ibv.id = v_adj.brand_variant_id;
  END IF;

  PERFORM recalc_average_cost(v_adj.brand_variant_id);

  UPDATE inventory_adjustments
  SET status = 'applied', updated_at = now()
  WHERE id = p_adjustment_id;
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
  v_check          RECORD;
  v_item           RECORD;
  v_variance       NUMERIC;
  v_adj_type       text;
  v_adj_qty        NUMERIC;
  v_check_number   text;
  v_approver_id    uuid;
  v_approver_name  text;
  v_new_adj_id     uuid;
  v_step           RECORD;
  v_ord            INT;
BEGIN
  SELECT id, warehouse_id, sub_container_id, status, check_number
  INTO   v_check
  FROM   inventory_checks
  WHERE  id = p_check_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory check % not found', p_check_id;
  END IF;

  IF v_check.status <> 'approved' THEN
    RAISE EXCEPTION 'Check % is not approved (status: %)', p_check_id, v_check.status;
  END IF;

  v_check_number := v_check.check_number;

  PERFORM snapshot_inventory_check_system_qty(p_check_id);

  SELECT profile_id, profile_name
  INTO   v_approver_id, v_approver_name
  FROM   inventory_check_approvals
  WHERE  check_id = p_check_id
    AND  status = 'approved'
  ORDER BY step_order DESC
  LIMIT 1;

  v_approver_name := COALESCE(v_approver_name, 'System (check ' || v_check_number || ')');

  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, system_qty, counted_qty,
           variance, variance_type
    FROM   inventory_check_items
    WHERE  check_id = p_check_id
      AND  is_counted = true
      AND  variance IS NOT NULL
      AND  variance <> 0
  LOOP
    v_variance := v_item.variance;
    v_adj_qty  := ABS(v_variance);

    IF v_variance > 0 THEN
      v_adj_type := 'increase';
    ELSIF v_item.variance_type IN ('damage', 'write_off') THEN
      v_adj_type := v_item.variance_type;
    ELSE
      v_adj_type := 'decrease';
    END IF;

    INSERT INTO public.stock_adjustments (
      warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
      reason, notes, photo_urls, status,
      requested_by, requested_by_name,
      source_check_id, source_check_item_id
    ) VALUES (
      v_check.warehouse_id,
      v_check.sub_container_id,   -- may be NULL on legacy checks; D.4 create RPC
                                  -- falls back to _find_or_create_sub_container.
      v_item.brand_variant_id,
      v_adj_type::public.stock_adjustment_type,
      v_adj_qty,
      'Auto-generated from inventory check ' || v_check_number,
      'Counted ' || v_item.counted_qty || ' vs system ' || v_item.system_qty
        || ' (variance ' || v_variance || ')',
      '{}'::text[],
      'pending_approval',
      v_approver_id,
      v_approver_name,
      p_check_id,
      v_item.id
    )
    RETURNING id INTO v_new_adj_id;

    v_ord := 0;
    FOR v_step IN
      SELECT step_key, step_label, is_conditional, condition_types
      FROM   approval_workflow_steps
      WHERE  workflow = 'stock_adj'
        AND  is_active = true
        AND  archived_at IS NULL
      ORDER BY step_order
    LOOP
      IF v_step.is_conditional AND NOT (v_adj_type = ANY(v_step.condition_types)) THEN
        CONTINUE;
      END IF;

      v_ord := v_ord + 1;
      INSERT INTO stock_adjustment_approvals (
        adjustment_id, step_order, step_role, step_label
      ) VALUES (
        v_new_adj_id, v_ord, v_step.step_key, v_step.step_label
      );
    END LOOP;

    IF v_ord = 0 THEN
      RAISE EXCEPTION 'No approval steps configured for stock_adj workflow — cannot auto-generate SA from check %', v_check_number;
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

  SELECT id, date INTO v_receival FROM receivals WHERE id = v_req.receival_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receival % not found', v_req.receival_id;
  END IF;
  v_receival_date := v_receival.date;

  PERFORM 1 FROM landed_costs
  WHERE v_req.receival_id = ANY(attached_receival_ids)
    AND applied_at IS NOT NULL AND voided_at IS NULL
  FOR SHARE;

  SELECT EXISTS(
    SELECT 1 FROM landed_costs
    WHERE v_req.receival_id = ANY(attached_receival_ids)
      AND applied_at IS NOT NULL AND voided_at IS NULL
  ) INTO v_has_applied_lc;

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

    IF v_delta <> 0 AND v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = GREATEST(0, received_qty + v_delta)
      WHERE id = v_pli_id;
    END IF;

    CONTINUE WHEN v_bv_id IS NULL;

    IF v_delta <> 0 THEN
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change qty: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      IF v_delta > 0 THEN
        UPDATE fifo_cost_layers
        SET qty           = qty           + v_delta,
            remaining_qty = remaining_qty + v_delta
        WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id;

        UPDATE inventory_item_brand_variants
        SET stock_level = stock_level + v_delta, updated_at = now()
        WHERE id = v_bv_id;

        INSERT INTO inventory_stock_movements
          (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_bv_id, ii.name_en, ii.sku,
               'receival_edit', v_delta, v_old_cost,
               'receival_edit_request', p_edit_request_id,
               'Qty increase edit on receival ' || v_req.receival_id
        FROM inventory_item_brand_variants ibv
        JOIN inventory_items ii ON ii.id = ibv.item_id
        WHERE ibv.id = v_bv_id;

      ELSE
        SELECT COALESCE(SUM(remaining_qty), 0) INTO v_layer_remaining
        FROM (
          SELECT remaining_qty FROM fifo_cost_layers
          WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id
          ORDER BY id ASC FOR UPDATE
        ) sub;

        IF v_layer_remaining < ABS(v_delta) THEN
          RAISE EXCEPTION
            'Cannot reduce qty by %: only % units remain from this receival (% were sold)',
            ABS(v_delta), v_layer_remaining, v_old_qty - v_layer_remaining;
        END IF;

        SELECT COALESCE(stock_level, 0), COALESCE(reserved_qty, 0)
        INTO v_stock_level, v_reserved_qty
        FROM inventory_item_brand_variants
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
        WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id;

        UPDATE inventory_item_brand_variants
        SET stock_level = stock_level - ABS(v_delta), updated_at = now()
        WHERE id = v_bv_id;

        INSERT INTO inventory_stock_movements
          (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_bv_id, ii.name_en, ii.sku,
               'receival_edit', -ABS(v_delta), v_old_cost,
               'receival_edit_request', p_edit_request_id,
               'Qty decrease edit on receival ' || v_req.receival_id
        FROM inventory_item_brand_variants ibv
        JOIN inventory_items ii ON ii.id = ibv.item_id
        WHERE ibv.id = v_bv_id;
      END IF;
    END IF;

    IF v_new_cost <> v_old_cost THEN
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change unit cost: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      SELECT COALESCE(SUM(qty - remaining_qty), 0) INTO v_sold_qty
      FROM fifo_cost_layers
      WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id;

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
      WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id;
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
        WHERE fcl.receival_id = ANY(v_lc_rec.attached_receival_ids);
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

  UPDATE receival_edit_requests
  SET status = 'completed'
  WHERE id = p_edit_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: apply_sale_order_edit(uuid, jsonb, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_sale_order_edit(p_so_id uuid, p_line_items jsonb, p_discount_amount numeric DEFAULT 0, p_discount_label text DEFAULT NULL::text, p_discount_type text DEFAULT 'fixed'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_so                RECORD;
  v_is_cash           BOOLEAN;
  v_credit_limit      NUMERIC;
  v_group_name        TEXT;
  v_open_total        NUMERIC;
  v_available         NUMERIC;
  v_subtotal          NUMERIC;
  v_discount_resolved NUMERIC;
  v_total             NUMERIC;
  v_total_qar         NUMERIC;
  v_exceeds_credit    BOOLEAN := false;
  v_has_below_cost    BOOLEAN := false;
  v_below_cost_lines  JSONB   := '[]'::jsonb;
  v_new_status        sale_order_status;
  v_profile_id        UUID;
  v_prev_reservations JSONB;
  v_new_reservations  JSONB;
  v_delta_json        JSONB;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  -- 1. Guard: SO must exist and be in an editable status.
  SELECT * INTO v_so FROM sale_orders WHERE id = p_so_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale order not found';
  END IF;
  IF v_so.status NOT IN ('quotation'::sale_order_status,
                         'confirmed'::sale_order_status,
                         'pending_approval'::sale_order_status) THEN
    RAISE EXCEPTION 'SO in status % is not editable — cancel and create a new one', v_so.status;
  END IF;

  -- 2. Snapshot current reservations so we can compute deltas.
  SELECT COALESCE(jsonb_object_agg(brand_variant_id::text, qty_sum), '{}'::jsonb)
    INTO v_prev_reservations
  FROM (
    SELECT brand_variant_id, SUM(qty)::int AS qty_sum
    FROM   sale_order_lines
    WHERE  sale_order_id  = p_so_id
      AND  brand_variant_id IS NOT NULL
    GROUP BY brand_variant_id
  ) prev;

  -- 3. Replace lines.
  DELETE FROM sale_order_lines WHERE sale_order_id = p_so_id;

  INSERT INTO sale_order_lines (
    sale_order_id, item_name, sku, qty, unit,
    unit_price, total, line_type, brand_variant_id, avg_cost
  )
  SELECT p_so_id,
         (li->>'item_name'),
         NULLIF(li->>'sku', ''),
         (li->>'qty')::numeric,
         COALESCE(NULLIF(li->>'unit', ''), 'pcs'),
         (li->>'unit_price')::numeric,
         (li->>'total')::numeric,
         COALESCE(NULLIF(li->>'line_type', ''), 'products'),
         NULLIF(li->>'brand_variant_id', '')::uuid,
         COALESCE((li->>'avg_cost')::numeric, 0)
  FROM   jsonb_array_elements(p_line_items) li;

  -- 4. Rebalance reservations (delta = new - old per brand_variant).
  SELECT COALESCE(jsonb_object_agg(bv, qty_sum), '{}'::jsonb)
    INTO v_new_reservations
  FROM (
    SELECT NULLIF(li->>'brand_variant_id', '')::uuid AS bv,
           SUM((li->>'qty')::int)                    AS qty_sum
    FROM   jsonb_array_elements(p_line_items) li
    WHERE  NULLIF(li->>'brand_variant_id', '') IS NOT NULL
    GROUP BY NULLIF(li->>'brand_variant_id', '')::uuid
  ) newr;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bv_id', bv_id,
           'delta', new_qty - old_qty
         )) FILTER (WHERE new_qty <> old_qty), '[]'::jsonb)
    INTO v_delta_json
  FROM (
    SELECT COALESCE(k::uuid, k2::uuid) AS bv_id,
           COALESCE((v_new_reservations->k)::int,  0) AS new_qty,
           COALESCE((v_prev_reservations->k2)::int, 0) AS old_qty
    FROM   jsonb_object_keys(v_new_reservations)  k
    FULL OUTER JOIN jsonb_object_keys(v_prev_reservations) k2 ON k = k2
  ) merged;

  IF jsonb_array_length(v_delta_json) > 0 THEN
    PERFORM batch_update_reserved_qty(v_delta_json);
  END IF;

  -- 5. Recompute totals.
  SELECT COALESCE(SUM(total), 0) INTO v_subtotal
  FROM   sale_order_lines WHERE sale_order_id = p_so_id;

  v_discount_resolved := CASE p_discount_type
    WHEN 'percentage' THEN (v_subtotal * COALESCE(p_discount_amount, 0)) / 100
    ELSE COALESCE(p_discount_amount, 0)
  END;
  v_total     := v_subtotal - v_discount_resolved;
  v_total_qar := v_total * COALESCE(v_so.exchange_rate, 1);

  -- 6. Below-cost detection.
  SELECT jsonb_agg(jsonb_build_object(
           'item_name', item_name,
           'unit_price', unit_price,
           'avg_cost',   avg_cost
         )) FILTER (WHERE avg_cost > 0 AND unit_price < avg_cost)
    INTO v_below_cost_lines
  FROM   sale_order_lines WHERE sale_order_id = p_so_id;

  IF v_below_cost_lines IS NOT NULL AND jsonb_array_length(v_below_cost_lines) > 0 THEN
    v_has_below_cost := true;
  END IF;

  -- 7. Credit check.
  SELECT (c.credit_group_id IS NULL), cg.credit_limit, cg.name
    INTO v_is_cash, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = v_so.customer_id;

  IF NOT v_is_cash AND v_credit_limit IS NOT NULL THEN
    v_open_total := public.customer_credit_used(v_so.customer_id, p_so_id);
    v_available  := v_credit_limit - v_open_total;
    IF v_total_qar > v_available THEN
      v_exceeds_credit := true;
    END IF;
  END IF;

  -- 8. Supersede any existing pending approval rows for this SO.
  --    Fresh edit = fresh chain (new iteration via build_sales_approval_chain).
  UPDATE sale_order_approvals
     SET status    = 'rejected'::approval_status,
         is_active = false,
         reason    = 'Superseded by SO edit'
   WHERE source_id     = p_so_id
     AND source_type   = 'sale_order'::approval_source_type
     AND status        = 'pending'::approval_status;

  -- 9. Determine new status.
  IF v_so.status = 'quotation'::sale_order_status THEN
    v_new_status := 'quotation'::sale_order_status;
  ELSIF v_exceeds_credit OR v_has_below_cost THEN
    v_new_status := 'pending_approval'::sale_order_status;
  ELSE
    v_new_status := 'confirmed'::sale_order_status;
  END IF;

  UPDATE sale_orders
     SET subtotal                = v_subtotal,
         discount_amount          = p_discount_amount,
         discount_amount_resolved = v_discount_resolved,
         discount_label           = p_discount_label,
         discount_type            = p_discount_type,
         total                    = v_total,
         status                   = v_new_status
   WHERE id = p_so_id;

  -- 10. Build fresh approval chain(s) only when needed.
  IF v_new_status = 'pending_approval'::sale_order_status THEN
    IF v_exceeds_credit THEN
      PERFORM public.build_sales_approval_chain(
        p_so_id, 'credit'::approval_type,
        jsonb_build_object(
          'available',    GREATEST(v_available, 0),
          'overage',      v_total_qar - COALESCE(v_available, 0),
          'requested_by', v_profile_id,
          'triggered_by', 'edit'
        )
      );
    END IF;
    IF v_has_below_cost THEN
      PERFORM public.build_sales_approval_chain(
        p_so_id, 'margin'::approval_type,
        jsonb_build_object(
          'lines',        v_below_cost_lines,
          'requested_by', v_profile_id,
          'triggered_by', 'edit'
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'so_id',          p_so_id,
    'status',         v_new_status,
    'subtotal',       v_subtotal,
    'total',          v_total,
    'exceeds_credit', v_exceeds_credit,
    'has_below_cost', v_has_below_cost,
    'credit_limit',   COALESCE(v_credit_limit, 0),
    'available',      GREATEST(COALESCE(v_available, 0), 0)
  );
END;
$$;


--
-- Name: approve_credit_group_change(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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
  FROM   user_data WHERE auth_user_id = auth.uid();
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

    UPDATE inventory_item_brand_variants
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
-- Name: approve_sales_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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
  FROM   user_data WHERE auth_user_id = auth.uid();
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


--
-- Name: approve_stock_adjustment_inventory(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_stock_adjustment_inventory(p_adjustment_id uuid, p_approved_by text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_adj                 RECORD;
  v_bv                  RECORD;
  v_layer               RECORD;
  v_qty                 INT;
  v_sub_container_id    UUID;
  v_layer_sub_container UUID;
  v_damaged_unit_cost   numeric;
BEGIN
  SELECT brand_variant_id, warehouse_id, adjustment_type, qty::INT AS qty,
         reason, status, sub_container_id, source_pile
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

  -- Phase E: sub_container_id is required on every SA.
  IF v_adj.sub_container_id IS NULL THEN
    RAISE EXCEPTION 'Adjustment % has no sub_container_id; re-open the adjustment dialog and pick one.', p_adjustment_id;
  END IF;
  v_sub_container_id := v_adj.sub_container_id;

  UPDATE stock_adjustments
  SET status           = 'approved',
      approved_by_name = p_approved_by,
      approved_at      = now(),
      sub_container_id = v_sub_container_id
  WHERE id = p_adjustment_id;

  -- ── Phase F: damaged-pile writeoff branch ─────────────────────────────
  -- source_pile='damaged' means this SA was created via the Damaged Stock
  -- On-hand action. Bypass the FIFO path: consume from inventory_damaged_stock
  -- via the helper + log the writeoff movement. No cogs_entries, no FIFO
  -- layer change, no damaged_qty maintenance (the follow-up #7 trigger on
  -- inventory_damaged_stock handles the denormalized counter).
  IF v_adj.source_pile = 'damaged' THEN
    IF v_adj.adjustment_type <> 'write_off' THEN
      RAISE EXCEPTION 'source_pile=damaged only supports adjustment_type=write_off (got %)', v_adj.adjustment_type;
    END IF;

    SELECT weighted_unit_cost
    INTO   v_damaged_unit_cost
    FROM   public.inventory_damaged_stock
    WHERE  warehouse_id     = v_adj.warehouse_id
      AND  brand_variant_id = v_adj.brand_variant_id;
    v_damaged_unit_cost := COALESCE(v_damaged_unit_cost, 0);

    PERFORM public._consume_damaged_stock_fifo(v_adj.warehouse_id, v_adj.brand_variant_id, v_qty);

    INSERT INTO public.inventory_damaged_movements (
      movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
      notes, created_by
    ) VALUES (
      'damaged_write_off', v_qty, v_adj.warehouse_id, v_adj.brand_variant_id, v_damaged_unit_cost,
      COALESCE(v_adj.reason, 'Damaged writeoff approved via stock adjustment ' || p_adjustment_id),
      NULL
    );

    RETURN;
  END IF;

  -- ── Existing (good-pile) branches — preserved byte-for-byte from Phase E ─
  IF v_adj.adjustment_type = 'increase' THEN
    SELECT average_cost INTO v_bv
    FROM inventory_item_brand_variants WHERE id = v_adj.brand_variant_id;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      sub_container_id
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty,
      v_sub_container_id
    );

    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level + v_qty, updated_at = now()
    WHERE id = v_adj.brand_variant_id;

    PERFORM recalc_average_cost(v_adj.brand_variant_id);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes,
      sub_container_id
    ) VALUES (
      v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
      v_qty, COALESCE(v_bv.average_cost, 0), 'adjustment', p_adjustment_id, v_adj.reason,
      v_sub_container_id
    );

  ELSIF v_adj.adjustment_type IN ('decrease', 'damage', 'write_off') THEN
    IF v_adj.adjustment_type = 'damage' THEN
      UPDATE inventory_item_brand_variants
      SET damaged_qty = damaged_qty + v_qty, updated_at = now()
      WHERE id = v_adj.brand_variant_id;
    END IF;

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost,
             sub_container_id
      FROM deduct_fifo_layers(
        v_adj.brand_variant_id,
        v_adj.warehouse_id,
        v_qty,
        false,
        v_sub_container_id
      )
    LOOP
      v_layer_sub_container := COALESCE(v_layer.sub_container_id, v_sub_container_id);

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, movement_type,
        qty, unit_cost, reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
        -v_layer.qty_taken, v_layer.unit_cost,
        'adjustment', p_adjustment_id, v_adj.reason,
        v_layer_sub_container
      );
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Unknown adjustment_type: %', v_adj.adjustment_type;
  END IF;
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

  UPDATE approval_workflow_steps
  SET archived_at = now(), archived_by = p_profile_id
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
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
  FROM   so_invoices
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
-- Name: auto_generate_tool_serials(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_generate_tool_serials(p_item_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_sku       text;
  v_next_ord  int;
  v_unit      RECORD;
  v_serial    text;
  v_updated   int := 0;
BEGIN
  SELECT sku INTO v_sku FROM inventory_items WHERE id = p_item_id;
  IF v_sku IS NULL THEN
    RAISE EXCEPTION 'Item % not found or has no SKU', p_item_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tool_units_' || p_item_id::text));

  SELECT COALESCE(
    MAX(CAST(SUBSTRING(serial_number FROM ('^' || v_sku || '-(\d+)$')) AS int)),
    0
  ) INTO v_next_ord
  FROM tool_asset_units
  WHERE item_id = p_item_id
    AND serial_number ~ ('^' || v_sku || '-\d+$');

  FOR v_unit IN
    SELECT id FROM tool_asset_units
    WHERE item_id = p_item_id
      AND is_placeholder = true
      AND serial_number IS NULL
    ORDER BY created_at
  LOOP
    v_next_ord := v_next_ord + 1;
    v_serial   := v_sku || '-' || LPAD(v_next_ord::text, 3, '0');

    UPDATE tool_asset_units
       SET serial_number  = v_serial,
           is_placeholder = false
     WHERE id = v_unit.id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'updated_count', v_updated,
    'sku_prefix',    v_sku
  );
END;
$_$;


--
-- Name: auto_reject_pending_on_service_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_reject_pending_on_service_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE service_edit_requests
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
    UPDATE inventory_item_brand_variants
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
declare
  v_update jsonb;
begin
  for v_update in select * from jsonb_array_elements(p_updates) loop
    update inventory_item_brand_variants
       set selling_price = (v_update->>'selling_price')::numeric
     where id = (v_update->>'id')::uuid;
  end loop;
end;
$$;


--
-- Name: bill_line_items_invalidate_parent_pdf_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bill_line_items_invalidate_parent_pdf_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_bill_id UUID;
BEGIN
  v_bill_id := COALESCE(NEW.bill_id, OLD.bill_id);
  IF v_bill_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.bills
     SET pdf_url = NULL, needs_refresh = TRUE
   WHERE id = v_bill_id
     AND (pdf_url IS NOT NULL OR needs_refresh = FALSE);
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: bill_recompute_paid_fn(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bill_recompute_paid_fn(p_bill_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_total  NUMERIC;
  v_po_id  UUID;
  v_paid   NUMERIC := 0;
  v_new    public.invoice_payment_status;
BEGIN
  SELECT total_amount, purchase_order_id
  INTO   v_total, v_po_id
  FROM   public.bills WHERE id = p_bill_id;

  IF NOT FOUND THEN RETURN; END IF;

  v_paid := v_paid + COALESCE((
    SELECT SUM(amount)
    FROM   public.payments
    WHERE  (
             (source_type = 'bill' AND source_id = p_bill_id)
             OR bill_id = p_bill_id
           )
      AND  direction = 'outgoing'
      AND  deleted_at IS NULL
  ), 0);

  v_paid := v_paid + COALESCE((
    SELECT SUM(amount)
    FROM   public.payment_bill_allocations
    WHERE  bill_id = p_bill_id
  ), 0);

  IF v_po_id IS NOT NULL THEN
    v_paid := v_paid + COALESCE((
      SELECT SUM(amount)
      FROM   public.payments
      WHERE  source_type = 'purchase_order'
        AND  source_id   = v_po_id
        AND  direction   = 'outgoing'
        AND  deleted_at  IS NULL
    ), 0);
  END IF;

  v_paid := LEAST(v_paid, COALESCE(v_total, 0));

  v_new := CASE
    WHEN COALESCE(v_total, 0) > 0 AND v_paid >= v_total THEN 'paid'::public.invoice_payment_status
    WHEN v_paid > 0                                     THEN 'partially_paid'::public.invoice_payment_status
    ELSE                                                     'unpaid'::public.invoice_payment_status
  END;

  UPDATE public.bills
  SET    paid_amount    = v_paid,
         payment_status = v_new
  WHERE  id = p_bill_id;
END;
$$;


--
-- Name: bills_invalidate_pdf_cache_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bills_invalidate_pdf_cache_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- The set_bill_pdf_url RPC sets this GUC before writing the URL
  -- back, so the trigger lets the write through without invalidating.
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.pdf_url       := NULL;
  NEW.needs_refresh := TRUE;
  RETURN NEW;
END;
$$;


--
-- Name: bootstrap_first_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bootstrap_first_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_profile_count int;
  v_admin_role_id uuid;
  v_new_profile_id uuid;
  v_full_name text;
BEGIN
  -- Only the very first auth user gets auto-bootstrapped.
  SELECT COUNT(*) INTO v_profile_count FROM public.user_data;
  IF v_profile_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Prefer full_name from user_metadata, fall back to email local-part.
  v_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(SPLIT_PART(NEW.email, '@', 1)), ''),
    'Admin'
  );

  INSERT INTO public.user_data (auth_user_id, email, full_name, user_type, is_active)
  VALUES (NEW.id, NEW.email, v_full_name, 'internal', true)
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO v_new_profile_id;

  -- If ON CONFLICT skipped, fetch the existing profile id so we can still assign the role.
  IF v_new_profile_id IS NULL THEN
    SELECT id INTO v_new_profile_id
    FROM public.user_data
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


--
-- Name: build_sales_approval_chain(uuid, public.approval_type, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: cancel_credit_group_change(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_credit_group_change(p_request_id uuid, p_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_request    RECORD;
  v_profile_id uuid;
  v_full_name  text;
  v_is_admin   boolean;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_request FROM customer_credit_group_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending requests can be cancelled (current: %)', v_request.status;
  END IF;

  -- Requester or admin may cancel. Admin = has any role flagged is_approval_slot
  -- with the credit_group scope (same gate rejection uses).
  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id      = v_profile_id
      AND  cr.is_approval_slot = true
      AND  cr.deleted_at       IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR 'credit_group' = ANY(ucr.approval_scopes))
  ) INTO v_is_admin;

  IF v_request.requested_by <> v_profile_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only the requester or an approver can cancel this request';
  END IF;

  UPDATE customer_credit_group_requests
     SET status     = 'cancelled',
         decided_by = v_profile_id,
         decided_at = now()
   WHERE id = v_request.id;

  UPDATE customer_credit_group_approvals
     SET status    = 'rejected',
         reason    = COALESCE(NULLIF(TRIM(p_reason), ''), 'Request cancelled by requester'),
         is_active = false
   WHERE request_id = v_request.id
     AND status     = 'pending';

  -- Unblock customer if the block was tied to this pending request
  UPDATE customers
     SET block_reason = NULL
   WHERE id = v_request.customer_id
     AND block_reason = 'Pending credit group approval';

  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Credit Group Change Cancelled',
    'customers',
    'customer',
    v_request.customer_id,
    v_full_name,
    'info',
    jsonb_build_object(
      'request_id', v_request.id,
      'reason',     COALESCE(NULLIF(TRIM(p_reason), ''), 'Cancelled by requester')
    )::text
  );
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
  v_delivery          RECORD;
  v_cogs              RECORD;
  v_line              RECORD;
  v_wh_id             UUID;
  v_division_id       UUID;
  v_sub_container_id  UUID;
BEGIN
  SELECT warehouse_id, date, status
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

    SELECT division_id INTO v_division_id FROM sale_orders WHERE id = p_so_id;

    -- Reverse delivered_qty on SO lines
    FOR v_line IN
      SELECT brand_variant_id, item_name, qty_delivered
      FROM sale_delivery_lines
      WHERE sale_delivery_id = p_delivery_id
    LOOP
      CONTINUE WHEN v_line.qty_delivered IS NULL OR v_line.qty_delivered <= 0;

      IF v_line.brand_variant_id IS NOT NULL THEN
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_line.qty_delivered)
        WHERE  sale_order_id = p_so_id
          AND  brand_variant_id = v_line.brand_variant_id;
      ELSE
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_line.qty_delivered)
        WHERE  id = (
          SELECT id FROM sale_order_lines
          WHERE  sale_order_id = p_so_id
            AND  item_name = v_line.item_name
          ORDER  BY id
          LIMIT  1
        );
      END IF;
    END LOOP;

    -- Restore FIFO layers from cogs_entries, per-layer sub_container_id
    FOR v_cogs IN
      SELECT brand_variant_id, qty, unit_cost, source_id
      FROM   cogs_entries
      WHERE  sale_delivery_id = p_delivery_id
    LOOP
      -- Restore to the SAME sub-container the drained layer came from
      v_sub_container_id := NULL;
      IF v_cogs.source_id IS NOT NULL THEN
        SELECT sub_container_id INTO v_sub_container_id
        FROM   public.fifo_cost_layers
        WHERE  id = v_cogs.source_id;
      END IF;

      -- Fallback if the original layer was purged (rare): re-derive
      IF v_sub_container_id IS NULL AND v_division_id IS NOT NULL THEN
        v_sub_container_id := public._find_or_create_sub_container(v_wh_id, v_division_id);
      END IF;

      IF v_sub_container_id IS NULL THEN
        RAISE EXCEPTION 'Cannot restore FIFO layer for variant %: no sub-container resolvable (original layer purged and SO has no division)', v_cogs.brand_variant_id;
      END IF;

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, sub_container_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_cogs.brand_variant_id, v_wh_id, v_sub_container_id, COALESCE(v_delivery.date, CURRENT_DATE),
        v_cogs.qty, v_cogs.unit_cost, 0, v_cogs.unit_cost, v_cogs.qty
      );

      UPDATE inventory_item_brand_variants
      SET    stock_level = stock_level + v_cogs.qty,
             updated_at  = now()
      WHERE  id = v_cogs.brand_variant_id;

      PERFORM recalc_average_cost(v_cogs.brand_variant_id);

      DELETE FROM inventory_stock_movements
      WHERE  reference_type   = 'sale_delivery'
        AND  reference_id     = p_delivery_id
        AND  brand_variant_id = v_cogs.brand_variant_id;
    END LOOP;

    DELETE FROM cogs_entries WHERE sale_delivery_id = p_delivery_id;

    -- Revert SO status
    UPDATE sale_orders
    SET    status = CASE
             WHEN EXISTS (
               SELECT 1 FROM sale_order_lines
               WHERE sale_order_id = p_so_id AND COALESCE(delivered_qty, 0) > 0
             ) THEN 'partial_delivery'::sale_order_status
             ELSE 'confirmed'::sale_order_status
           END,
           updated_at = now()
    WHERE  id = p_so_id
      AND  status IN ('delivered', 'partial_delivery');
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
  v_item     RECORD;
  v_avg_cost NUMERIC;
BEGIN
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         created_by_profile_id, from_sub_container_id
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

  IF v_transfer.created_by_profile_id != p_cancelled_by_profile_id
     AND NOT has_inventory_manager_role(p_cancelled_by_profile_id) THEN
    RAISE EXCEPTION 'Only the creator or an Inventory Manager can cancel a transfer';
  END IF;

  UPDATE warehouse_transfers
  SET status = 'cancelled',
      cancelled_by_profile_id = p_cancelled_by_profile_id,
      cancelled_by_name = p_cancelled_by_name,
      cancelled_at = now()
  WHERE id = p_transfer_id;

  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    IF v_transfer.status = 'pending' THEN
      UPDATE warehouse_stock_allocations
      SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
          updated_at = now()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND brand_variant_id = v_item.brand_variant_id
        AND sub_container_id = v_transfer.from_sub_container_id;

    ELSIF v_transfer.status = 'in_transit' THEN
      SELECT ABS(unit_cost) INTO v_avg_cost
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out'
      LIMIT 1;

      v_avg_cost := COALESCE(v_avg_cost, v_item.unit_cost);

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        sub_container_id
      ) VALUES (
        v_item.brand_variant_id, v_transfer.from_warehouse_id,
        CURRENT_DATE,
        v_item.requested_qty, v_avg_cost, 0, v_avg_cost, v_item.requested_qty,
        v_transfer.from_sub_container_id
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_in', v_item.requested_qty, v_avg_cost,
        'transfer', p_transfer_id,
        'Transfer cancelled — stock returned',
        v_transfer.from_sub_container_id
      );
    END IF;
  END LOOP;
END;
$$;


--
-- Name: cc_dedup_insert_message(uuid, text, text, text, text, jsonb, text, text, text, text, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cc_dedup_insert_message(p_conversation_id uuid, p_from_type text, p_source text, p_text text, p_agent_name text, p_attachments jsonb, p_delivery_status text, p_external_id text, p_wamid text, p_wati_id text, p_created_at timestamp with time zone, p_message_kind text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_lock_key  bigint;
  v_existing  uuid;
  v_new_id    uuid;
BEGIN
  v_lock_key := hashtext(
    coalesce(p_conversation_id::text, '') || ':' ||
    coalesce(p_from_type, '')              || ':' ||
    coalesce(p_text, '')
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF p_external_id IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM chat_messages
    WHERE external_id = p_external_id
       OR external_id = 'wati_' || p_external_id
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE chat_messages
      SET external_id    = p_external_id,
          wamid          = COALESCE(wamid, p_wamid),
          wati_id        = COALESCE(wati_id, p_wati_id),
          delivery_status = CASE
            WHEN p_from_type = 'agent' AND p_delivery_status IS NOT NULL
              THEN p_delivery_status
            ELSE delivery_status
          END
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
  END IF;

  IF p_from_type = 'agent' AND p_message_kind = 'message' THEN
    SELECT id INTO v_existing
    FROM chat_messages
    WHERE conversation_id = p_conversation_id
      AND from_type        = 'agent'
      AND delivery_status IN ('sending', 'sent')
      AND (external_id IS NULL OR external_id LIKE 'wati_%')
      AND (
        (p_text IS NOT NULL AND p_text <> '' AND text = p_text)
        OR (p_text IS NULL OR p_text = '')
      )
      AND created_at >= now() - interval '60 seconds'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE chat_messages
      SET external_id     = COALESCE(p_external_id, external_id),
          wamid           = COALESCE(wamid, p_wamid),
          wati_id         = COALESCE(wati_id, p_wati_id),
          delivery_status = COALESCE(p_delivery_status, delivery_status),
          agent_name      = COALESCE(p_agent_name, agent_name)
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
  END IF;

  IF p_text IS NOT NULL AND p_text <> '' AND p_message_kind = 'message' THEN
    SELECT id INTO v_existing
    FROM chat_messages
    WHERE conversation_id = p_conversation_id
      AND from_type        = p_from_type
      AND text             = p_text
      AND created_at >= now() - interval '2 minutes'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE chat_messages
      SET external_id = COALESCE(p_external_id, external_id),
          wamid       = COALESCE(wamid, p_wamid),
          wati_id     = COALESCE(wati_id, p_wati_id),
          delivery_status = CASE
            WHEN p_from_type = 'agent' AND p_delivery_status IS NOT NULL
              THEN p_delivery_status
            ELSE delivery_status
          END
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
  END IF;

  IF p_wamid IS NOT NULL AND p_from_type = 'customer' AND p_message_kind = 'message' THEN
    SELECT id INTO v_existing
    FROM chat_messages
    WHERE conversation_id = p_conversation_id
      AND (wamid = p_wamid OR external_id = p_wamid)
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE chat_messages
      SET external_id = COALESCE(p_external_id, external_id),
          wamid       = COALESCE(wamid, p_wamid)
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
  END IF;

  -- Explicit cast: text → message_source enum.
  INSERT INTO chat_messages (
    conversation_id, from_type, source, text, agent_name, attachments,
    delivery_status, external_id, wamid, wati_id, created_at, message_kind
  ) VALUES (
    p_conversation_id, p_from_type, p_source::message_source, p_text, p_agent_name, p_attachments,
    p_delivery_status, p_external_id, p_wamid, p_wati_id, p_created_at, p_message_kind
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
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
  IF NEW.qty >= 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(remaining_qty), 0)::INT INTO v_new_qty
  FROM public.fifo_cost_layers
  WHERE brand_variant_id = NEW.brand_variant_id
    AND warehouse_id     = NEW.warehouse_id
    AND remaining_qty > 0;

  SELECT * INTO v_reorder
  FROM public.warehouse_reorder_points
  WHERE warehouse_id     = NEW.warehouse_id
    AND brand_variant_id = NEW.brand_variant_id;

  IF NOT FOUND OR v_reorder.reorder_point <= 0 THEN RETURN NEW; END IF;

  v_old_qty := v_new_qty - NEW.qty;

  IF NOT (v_old_qty > v_reorder.reorder_point AND v_new_qty <= v_reorder.reorder_point) THEN
    RETURN NEW;
  END IF;

  IF v_reorder.last_notified_at IS NOT NULL
     AND v_reorder.last_notified_at > now() - INTERVAL '24 hours' THEN
    RETURN NEW;
  END IF;

  SELECT f.warehouse_id, w.name, COALESCE(SUM(f.remaining_qty), 0)::INT AS qty
  INTO v_other_wh
  FROM public.fifo_cost_layers f
  JOIN public.warehouses w ON w.id = f.warehouse_id
  WHERE f.brand_variant_id = NEW.brand_variant_id
    AND f.warehouse_id    != NEW.warehouse_id
    AND f.remaining_qty > 0
  GROUP BY f.warehouse_id, w.name
  ORDER BY SUM(f.remaining_qty) DESC
  LIMIT 1;

  IF NOT FOUND OR v_other_wh.qty <= 0 THEN RETURN NEW; END IF;

  SELECT name INTO v_wh_name FROM public.warehouses WHERE id = NEW.warehouse_id;
  v_item_label := NEW.item_name;

  FOR v_field_rp IN
    SELECT wrp.profile_id
    FROM public.warehouse_responsible_persons wrp
    WHERE wrp.warehouse_id = NEW.warehouse_id
  LOOP
    INSERT INTO public.notifications (profile_id, type, title, body, related_type)
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

  UPDATE public.warehouse_reorder_points
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
-- Name: cleanup_old_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_notifications() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.notifications
  WHERE actioned_at IS NOT NULL
    AND actioned_at < NOW() - INTERVAL '45 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


--
-- Name: complete_delivery_inventory(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_delivery_inventory(p_delivery_id uuid, p_so_id uuid, p_sub_container_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_delivery         RECORD;
  v_line             RECORD;
  v_wh_id            UUID;
  v_date             DATE;
  v_layer            RECORD;
  v_all_delivered    BOOLEAN;
  v_any_delivered    BOOLEAN;
  v_division_id      UUID;
  v_sub_container_id UUID;
  v_check_wh         UUID;
  v_check_div        UUID;
  v_check_active     BOOLEAN;
BEGIN
  SELECT warehouse_id, date, status
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

  -- Resolve sub-container: explicit override (validated) or derive from SO.division_id
  SELECT division_id INTO v_division_id FROM sale_orders WHERE id = p_so_id;

  IF p_sub_container_id IS NOT NULL THEN
    SELECT sc.warehouse_id, sc.division_id, sc.is_active
    INTO   v_check_wh, v_check_div, v_check_active
    FROM   public.warehouse_sub_containers sc
    WHERE  sc.id = p_sub_container_id;

    IF NOT FOUND OR v_check_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Sub-container % not found or inactive', p_sub_container_id;
    END IF;
    IF v_check_wh <> v_wh_id THEN
      RAISE EXCEPTION 'Sub-container % does not belong to warehouse %', p_sub_container_id, v_wh_id;
    END IF;
    IF v_division_id IS NOT NULL AND v_check_div IS DISTINCT FROM v_division_id THEN
      RAISE EXCEPTION 'Sub-container % is in a different division (%) than the SO (%)',
        p_sub_container_id, v_check_div, v_division_id;
    END IF;
    v_sub_container_id := p_sub_container_id;
  ELSIF v_division_id IS NULL THEN
    RAISE EXCEPTION 'SO % has no division set; pick a sub-container explicitly on the delivery form', p_so_id;
  ELSE
    v_sub_container_id := public._find_or_create_sub_container(v_wh_id, v_division_id);
  END IF;

  UPDATE sale_deliveries SET status = 'delivered', updated_at = now() WHERE id = p_delivery_id;

  -- ── Warranty: create coverage records for every eligible line ──────────
  -- Same transaction. If this raises, the delivery flip is rolled back too.
  PERFORM public.create_warranty_records_for_delivery(p_delivery_id);

  FOR v_line IN
    SELECT brand_variant_id, item_name, sku, qty_delivered
    FROM sale_delivery_lines
    WHERE sale_delivery_id = p_delivery_id
  LOOP
    CONTINUE WHEN v_line.brand_variant_id IS NULL OR v_line.qty_delivered IS NULL OR v_line.qty_delivered <= 0;

    -- One COGS + one movement PER LAYER drained. Preserves per-receival
    -- cost detail on both ledgers (Scenario 2A).
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(v_line.brand_variant_id, v_wh_id, v_line.qty_delivered, false, v_sub_container_id)
    LOOP
      INSERT INTO cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date, source_type, source_id
      ) VALUES (
        v_line.brand_variant_id, p_delivery_id, p_so_id,
        v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, v_date,
        'sale', v_layer.layer_id
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id
      ) VALUES (
        v_wh_id, v_sub_container_id, v_line.brand_variant_id,
        COALESCE(v_line.item_name, ''),
        v_line.sku,
        'sale_delivery', -v_layer.qty_taken, v_layer.unit_cost,
        'sale_delivery', p_delivery_id
      );
    END LOOP;

    -- Line-level bookkeeping (once per line, not per layer).
    UPDATE inventory_item_brand_variants
    SET reserved_qty = GREATEST(0, reserved_qty - v_line.qty_delivered),
        updated_at   = now()
    WHERE id = v_line.brand_variant_id;

    UPDATE sale_order_lines
    SET    delivered_qty = COALESCE(delivered_qty, 0) + v_line.qty_delivered
    WHERE  sale_order_id = p_so_id
      AND  brand_variant_id = v_line.brand_variant_id;
  END LOOP;

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
-- Name: create_and_approve_receival(uuid, uuid, date, text, text, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_and_approve_receival(p_po_id uuid, p_warehouse_id uuid, p_date date, p_received_by_name text, p_receival_number text, p_notes text, p_items jsonb, p_sub_container_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_receival_id       UUID;
  v_receival_number   TEXT;
  v_item              JSONB;
  v_bv_id             UUID;
  v_bv_ids            UUID[] := '{}';
  v_bv_id_elem        UUID;
  v_qty               INT;
  v_cost              NUMERIC;
  v_cost_qar          NUMERIC;
  v_pli_id            UUID;
  v_po_currency       TEXT;
  v_po_rate           NUMERIC;
  v_division_id       UUID;
  v_sub_container_id  UUID;
  v_check_wh          UUID;
  v_check_div         UUID;
BEGIN
  SELECT COALESCE(currency, 'QAR'), COALESCE(initial_exchange_rate, 1), division_id
    INTO v_po_currency, v_po_rate, v_division_id
    FROM public.purchase_orders
   WHERE id = p_po_id;

  IF p_sub_container_id IS NOT NULL THEN
    SELECT sc.warehouse_id, sc.division_id
      INTO v_check_wh, v_check_div
      FROM public.warehouse_sub_containers sc
     WHERE sc.id = p_sub_container_id
       AND sc.is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sub-container % not found or inactive', p_sub_container_id;
    END IF;
    IF v_check_wh <> p_warehouse_id THEN
      RAISE EXCEPTION 'Sub-container % does not belong to warehouse %', p_sub_container_id, p_warehouse_id;
    END IF;
    -- Only enforce division match when the PO has a division. Legacy POs
    -- with NULL division_id let the operator pick any sub-container in
    -- the warehouse.
    IF v_division_id IS NOT NULL AND v_check_div IS DISTINCT FROM v_division_id THEN
      RAISE EXCEPTION 'Sub-container % is in a different division (%) than the PO (%)',
        p_sub_container_id, v_check_div, v_division_id;
    END IF;
    v_sub_container_id := p_sub_container_id;
  ELSIF v_division_id IS NULL THEN
    RAISE EXCEPTION 'PO % has no division set; pick a sub-container explicitly on the receival form', p_po_id
      USING HINT = 'Edit the PO to assign a division, or select a sub-container in the receival dialog.';
  ELSE
    v_sub_container_id := public._find_or_create_sub_container(p_warehouse_id, v_division_id);
  END IF;

  IF p_receival_number IS NULL OR p_receival_number = '' THEN
    v_receival_number := 'RCV-' || lpad(nextval('receival_number_seq')::TEXT, 5, '0');
  ELSE
    v_receival_number := p_receival_number;
  END IF;

  INSERT INTO receivals (
    receival_number, po_id, warehouse_id, date,
    received_by_name, notes, status
  ) VALUES (
    v_receival_number, p_po_id, p_warehouse_id, p_date,
    p_received_by_name, p_notes, 'approved'
  ) RETURNING id INTO v_receival_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN (v_item->>'qty_received') IS NULL OR (v_item->>'unit_cost') IS NULL;

    v_bv_id  := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty    := (v_item->>'qty_received')::INT;
    v_cost   := (v_item->>'unit_cost')::NUMERIC;
    v_pli_id := NULLIF(v_item->>'po_line_item_id', '')::UUID;

    v_cost_qar := v_cost * v_po_rate;

    INSERT INTO receival_items (
      receival_id, po_line_item_id, brand_variant_id,
      item_name, sku, qty_received, unit_cost, is_free,
      sub_container_id
    ) VALUES (
      v_receival_id, v_pli_id, v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      v_qty, v_cost,
      COALESCE((v_item->>'is_free')::BOOLEAN, false),
      v_sub_container_id
    );

    CONTINUE WHEN COALESCE((v_item->>'is_free')::BOOLEAN, false) = TRUE
               OR v_bv_id IS NULL
               OR v_qty <= 0;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_currency, source_exchange_rate,
      sub_container_id
    ) VALUES (
      v_bv_id, p_warehouse_id, v_receival_id, v_receival_number,
      p_date, v_qty, v_cost_qar, 0, v_cost_qar, v_qty,
      v_po_currency, v_po_rate,
      v_sub_container_id
    );

    UPDATE inventory_item_brand_variants
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
      movement_type, qty, unit_cost, reference_type, reference_id,
      sub_container_id
    ) VALUES (
      p_warehouse_id, v_bv_id,
      v_item->>'item_name', NULLIF(v_item->>'sku', ''),
      'purchase_receival', v_qty, v_cost_qar,
      'receival', v_receival_id,
      v_sub_container_id
    );

    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  FOREACH v_bv_id_elem IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id_elem);
  END LOOP;

  PERFORM refresh_po_status(p_po_id);

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', v_receival_number);
END;
$$;


--
-- Name: create_and_confirm_delivery(uuid, uuid, text, date, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_and_confirm_delivery(p_so_id uuid, p_warehouse_id uuid, p_warehouse_name text, p_date date, p_items jsonb) RETURNS TABLE(id uuid, delivery_number text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_delivery_number text;
  v_new_id          uuid;
  v_line            jsonb;
begin
  -- Single source of truth: use the canonical minter that
  -- rpc_create_partial_replacement and every other creator already use.
  v_delivery_number := public.next_delivery_number();

  insert into sale_deliveries (
    delivery_number, sale_order_id,
    warehouse_id, warehouse_name, date, status
  ) values (
    v_delivery_number, p_so_id,
    p_warehouse_id, p_warehouse_name, p_date, 'pending'
  )
  returning sale_deliveries.id into v_new_id;

  for v_line in select * from jsonb_array_elements(p_items)
  loop
    insert into sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) values (
      v_new_id,
      case when v_line->>'brand_variant_id' is not null
           and v_line->>'brand_variant_id' != 'null'
           then (v_line->>'brand_variant_id')::uuid end,
      coalesce(v_line->>'item_name', 'Item'),
      nullif(v_line->>'sku', ''),
      coalesce((v_line->>'qty_delivered')::integer, 0)
    );
  end loop;

  perform complete_delivery_inventory(v_new_id, p_so_id);

  return query select v_new_id, v_delivery_number;
end;
$$;


--
-- Name: create_and_confirm_delivery(uuid, uuid, text, date, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_and_confirm_delivery(p_so_id uuid, p_warehouse_id uuid, p_warehouse_name text, p_date date, p_items jsonb, p_sub_container_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, delivery_number text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_delivery_number TEXT;
  v_new_id          UUID;
  v_line            JSONB;
BEGIN
  v_delivery_number := public.next_delivery_number();

  INSERT INTO sale_deliveries (
    delivery_number, sale_order_id,
    warehouse_id, warehouse_name, date, status
  ) VALUES (
    v_delivery_number, p_so_id,
    p_warehouse_id, p_warehouse_name, p_date, 'pending'
  )
  RETURNING sale_deliveries.id INTO v_new_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) VALUES (
      v_new_id,
      CASE WHEN v_line->>'brand_variant_id' IS NOT NULL
           AND v_line->>'brand_variant_id' <> 'null'
           THEN (v_line->>'brand_variant_id')::uuid END,
      COALESCE(v_line->>'item_name', 'Item'),
      NULLIF(v_line->>'sku', ''),
      COALESCE((v_line->>'qty_delivered')::integer, 0)
    );
  END LOOP;

  PERFORM complete_delivery_inventory(v_new_id, p_so_id, p_sub_container_id);

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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: receivals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receivals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    receival_number text NOT NULL,
    po_id uuid,
    warehouse_id uuid NOT NULL,
    received_by uuid,
    received_by_name text,
    date date NOT NULL,
    status public.receival_status DEFAULT 'pending_approval'::public.receival_status,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    check_sheet_pdf_url text,
    receipt_pdf_url text,
    is_replacement boolean DEFAULT false NOT NULL,
    source_debit_note_id uuid,
    source_type public.receival_source_type DEFAULT 'purchase'::public.receival_source_type NOT NULL,
    carved_from_layer_id uuid,
    division_id uuid
);


--
-- Name: create_inventory_receival(text, uuid, uuid, integer, numeric, uuid, date, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_inventory_receival(p_mode text, p_warehouse_id uuid, p_brand_variant_id uuid, p_qty integer, p_unit_cost numeric, p_source_layer_id uuid, p_date date, p_notes text, p_sub_container_id uuid) RETURNS public.receivals
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_auth_id           uuid := auth.uid();
  v_caller_id         uuid;
  v_caller_name       text;
  v_has_permission    boolean;
  v_receival_number   text;
  v_new_receival      public.receivals;
  v_source_layer      public.fifo_cost_layers;
  v_landed_cost       numeric := 0;
  v_source_total_cost numeric;
  v_new_total_cost    numeric;
  v_new_layer_id      uuid;
  v_sub_container_id  uuid := p_sub_container_id;
BEGIN
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_caller_id
  FROM   public.user_data p
  WHERE  p.auth_user_id = v_auth_id;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for auth user' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   public.user_custom_roles ucr
    JOIN   public.custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id = v_caller_id
      AND  cr.is_inventory_receiver = true
      AND  cr.deleted_at IS NULL
  ) INTO v_has_permission;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: you must have the "Can Create Inventory Receivals" role toggle'
      USING ERRCODE = '42501';
  END IF;

  IF p_mode NOT IN ('carve', 'new_stock') THEN
    RAISE EXCEPTION 'Invalid mode: %', p_mode USING ERRCODE = '22023';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost must be zero or positive' USING ERRCODE = '22023';
  END IF;
  IF p_warehouse_id IS NULL OR p_brand_variant_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse and brand variant are required' USING ERRCODE = '22023';
  END IF;

  -- Phase D.2: sub-container is required (no PO to derive from).
  IF v_sub_container_id IS NULL THEN
    RAISE EXCEPTION 'Sub-container is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouse_sub_containers sc
     WHERE sc.id = v_sub_container_id
       AND sc.warehouse_id = p_warehouse_id
       AND sc.is_active = true
  ) THEN
    RAISE EXCEPTION 'Sub-container % is inactive or not in warehouse %',
      v_sub_container_id, p_warehouse_id USING ERRCODE = '22023';
  END IF;

  IF p_mode = 'carve' THEN
    IF p_source_layer_id IS NULL THEN
      RAISE EXCEPTION 'Source layer is required for carve mode' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_source_layer
    FROM public.fifo_cost_layers
    WHERE id = p_source_layer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source layer % not found', p_source_layer_id USING ERRCODE = '22023';
    END IF;
    IF v_source_layer.warehouse_id <> p_warehouse_id THEN
      RAISE EXCEPTION 'Source layer does not belong to warehouse %', p_warehouse_id USING ERRCODE = '22023';
    END IF;
    IF v_source_layer.brand_variant_id <> p_brand_variant_id THEN
      RAISE EXCEPTION 'Source layer does not belong to brand variant %', p_brand_variant_id USING ERRCODE = '22023';
    END IF;
    IF p_qty > v_source_layer.remaining_qty THEN
      RAISE EXCEPTION 'Requested qty % exceeds source layer remaining %', p_qty, v_source_layer.remaining_qty USING ERRCODE = '22023';
    END IF;

    v_landed_cost       := COALESCE(v_source_layer.landed_cost_per_unit, 0);
    v_source_total_cost := COALESCE(v_source_layer.total_unit_cost,
                                    v_source_layer.unit_cost + v_landed_cost);
  ELSE
    IF p_source_layer_id IS NOT NULL THEN
      RAISE EXCEPTION 'source_layer_id must be null for new_stock mode' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT COALESCE(NULLIF(p.full_name, ''), au.email, 'Unknown')
    INTO v_caller_name
  FROM   public.user_data p
  JOIN   auth.users au ON au.id = p.auth_user_id
  WHERE  p.id = v_caller_id;

  v_receival_number := 'INV-' || LPAD(nextval('public.inventory_receival_number_seq')::text, 5, '0');

  INSERT INTO public.receivals (
    receival_number, po_id, warehouse_id, date,
    received_by, received_by_name, notes, status,
    source_type, carved_from_layer_id
  ) VALUES (
    v_receival_number, NULL, p_warehouse_id, p_date,
    NULL, v_caller_name, p_notes, 'approved',
    'inventory', p_source_layer_id
  ) RETURNING * INTO v_new_receival;

  INSERT INTO public.receival_items (
    receival_id, po_line_item_id, brand_variant_id,
    item_name, sku, qty_received, unit_cost, is_free,
    sub_container_id
  )
  SELECT
    v_new_receival.id, NULL, p_brand_variant_id,
    ii.name_en, ii.sku, p_qty, p_unit_cost, false,
    v_sub_container_id
  FROM public.inventory_item_brand_variants ibv
  JOIN public.inventory_items ii ON ii.id = ibv.item_id
  WHERE ibv.id = p_brand_variant_id;

  IF p_mode = 'carve' THEN
    UPDATE public.fifo_cost_layers
       SET remaining_qty = remaining_qty - p_qty
     WHERE id = p_source_layer_id;

    v_new_total_cost := p_unit_cost + v_landed_cost;
    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id,
      receival_id, receival_number,
      date, qty, unit_cost,
      landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type,
      sub_container_id
    ) VALUES (
      p_brand_variant_id, p_warehouse_id,
      v_new_receival.id, v_receival_number,
      p_date, p_qty, p_unit_cost,
      v_landed_cost, v_new_total_cost,
      p_qty, 'receival',
      v_sub_container_id
    ) RETURNING id INTO v_new_layer_id;
  ELSE
    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id,
      receival_id, receival_number,
      date, qty, unit_cost,
      landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type,
      sub_container_id
    ) VALUES (
      p_brand_variant_id, p_warehouse_id,
      v_new_receival.id, v_receival_number,
      p_date, p_qty, p_unit_cost,
      0, p_unit_cost,
      p_qty, 'receival',
      v_sub_container_id
    ) RETURNING id INTO v_new_layer_id;

    UPDATE public.inventory_item_brand_variants
       SET stock_level = stock_level + p_qty
     WHERE id = p_brand_variant_id;
  END IF;

  IF p_mode = 'carve' THEN
    INSERT INTO public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes,
      sub_container_id
    )
    SELECT
      p_warehouse_id, p_brand_variant_id, ii.name_en, ii.sku,
      'inventory_receival_carve'::stock_movement_type,
      -p_qty, v_source_total_cost,
      'receival', v_new_receival.id,
      'Inventory Receival ' || v_receival_number || ' — carved out of source layer',
      v_sub_container_id
    FROM public.inventory_item_brand_variants ibv
    JOIN public.inventory_items ii ON ii.id = ibv.item_id
    WHERE ibv.id = p_brand_variant_id;

    INSERT INTO public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes,
      sub_container_id
    )
    SELECT
      p_warehouse_id, p_brand_variant_id, ii.name_en, ii.sku,
      'inventory_receival_carve'::stock_movement_type,
      p_qty, v_new_total_cost,
      'receival', v_new_receival.id,
      'Inventory Receival ' || v_receival_number || ' — carved into new layer',
      v_sub_container_id
    FROM public.inventory_item_brand_variants ibv
    JOIN public.inventory_items ii ON ii.id = ibv.item_id
    WHERE ibv.id = p_brand_variant_id;
  ELSE
    INSERT INTO public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes,
      sub_container_id
    )
    SELECT
      p_warehouse_id, p_brand_variant_id, ii.name_en, ii.sku,
      'inventory_receival_new'::stock_movement_type,
      p_qty, p_unit_cost,
      'receival', v_new_receival.id,
      'Inventory Receival ' || v_receival_number,
      v_sub_container_id
    FROM public.inventory_item_brand_variants ibv
    JOIN public.inventory_items ii ON ii.id = ibv.item_id
    WHERE ibv.id = p_brand_variant_id;
  END IF;

  PERFORM public.recalc_average_cost(p_brand_variant_id);

  RETURN v_new_receival;
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
  v_line         JSONB;
BEGIN
  IF p_lines IS NULL THEN
    RAISE EXCEPTION 'p_lines must not be null';
  END IF;

  SELECT COALESCE(SUM(
    (line->>'amount')::NUMERIC * COALESCE(NULLIF((line->>'exchange_rate')::NUMERIC, 0), 1)
  ), 0)
  INTO v_total_amount
  FROM jsonb_array_elements(p_lines) AS line;

  INSERT INTO landed_costs (
    description, total_amount, currency,
    attached_receival_ids, attached_po_ids,
    all_items_sold, date
  ) VALUES (
    p_description, v_total_amount, p_currency,
    p_attached_receival_ids, p_attached_po_ids,
    false, p_date
  ) RETURNING id INTO v_id;

  -- Insert each line into the normalized table
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO landed_cost_lines (
      landed_cost_id, description, amount, currency, exchange_rate, bill_path
    ) VALUES (
      v_id,
      COALESCE(TRIM(v_line->>'description'), ''),
      COALESCE((v_line->>'amount')::NUMERIC, 0),
      COALESCE(v_line->>'currency', p_currency),
      COALESCE((v_line->>'exchange_rate')::NUMERIC, 1),
      NULLIF(TRIM(v_line->>'bill_path'), '')
    );
  END LOOP;

  RETURN (SELECT row_to_json(lc)::JSONB FROM landed_costs lc WHERE lc.id = v_id);
END;
$$;


--
-- Name: create_order_with_dates(text, uuid, text, text, text, date, numeric, text, text, text, jsonb, jsonb, jsonb, jsonb, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_order_with_dates(p_order_id text, p_service_customer_id uuid, p_type text, p_division text, p_status text, p_scheduled_date date, p_total_amount numeric, p_address text, p_notes text, p_arrival_phone text, p_attachments jsonb, p_services jsonb, p_visit_dates jsonb, p_assignments jsonb, p_address_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_order_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO public.orders (
    order_id, service_customer_id, type, division, status, confirmation_status,
    scheduled_date, total_amount, address, address_id, notes, has_invoice,
    arrival_phone, attachments, created_by
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
    p_attachments,
    p_created_by
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
  v_is_cash           BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_customer_id::text), 1, 15))::bit(60)::bigint
  );

  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  SELECT COUNT(*) + 1 INTO v_count FROM sale_orders;
  v_so_number := 'SO-' || LPAD(v_count::text, 5, '0');

  SELECT COALESCE(SUM((item->>'total')::NUMERIC), 0)
  INTO   v_subtotal
  FROM   jsonb_array_elements(p_line_items) AS item;

  v_discount_resolved := CASE p_discount_type
    WHEN 'percentage' THEN (v_subtotal * p_discount_amount) / 100
    ELSE p_discount_amount
  END;
  v_total     := v_subtotal - COALESCE(v_discount_resolved, 0);
  v_total_qar := v_total * p_exchange_rate;

  SELECT (c.credit_group_id IS NULL), cg.credit_limit, cg.name
  INTO   v_is_cash, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  IF v_is_cash THEN
    v_so_status  := CASE
      WHEN p_intent = 'confirm' THEN 'confirmed'::sale_order_status
      ELSE                           'quotation'::sale_order_status
    END;
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

    v_so_status := CASE
      WHEN v_total_qar > v_available THEN 'pending_approval'::sale_order_status
      WHEN p_intent = 'confirm'      THEN 'confirmed'::sale_order_status
      ELSE                                'quotation'::sale_order_status
    END;
  END IF;

  INSERT INTO sale_orders (
    so_number, customer_id, status,
    subtotal, tax, total,
    discount_amount, discount_label, discount_type, discount_amount_resolved,
    currency, exchange_rate,
    initial_exchange_rate, initial_rate_captured_at, initial_rate_captured_by,
    total_qar,
    expected_delivery,
    payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes,
    customer_notes, validity_days,
    created_by, division_id
  )
  VALUES (
    v_so_number, p_customer_id, v_so_status,
    v_subtotal, 0, v_total,
    p_discount_amount, p_discount_label, p_discount_type, v_discount_resolved,
    p_currency, p_exchange_rate,
    p_exchange_rate, now(), v_profile_id,
    v_total_qar,
    p_expected_delivery,
    p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes,
    p_customer_notes, p_validity_days,
    v_profile_id, p_division_id
  )
  RETURNING id INTO v_so_id;

  INSERT INTO sale_order_lines (
    sale_order_id, item_name, sku, qty, unit,
    unit_price, total, line_type,
    brand_variant_id, avg_cost,
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
    COALESCE(NULLIF(item->>'avg_cost', '')::NUMERIC, 0),
    v_profile_id
  FROM jsonb_array_elements(p_line_items) AS item;

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
-- Name: create_sale_order(uuid, text, text, numeric, numeric, numeric, text, text, text, text, jsonb, text, text, text, integer, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_sale_order(p_customer_id uuid, p_intent text, p_currency text, p_exchange_rate numeric, p_subtotal numeric, p_discount_amount numeric, p_discount_label text, p_discount_type text, p_payment_terms text, p_payment_terms_notes text, p_payment_milestones jsonb, p_delivery_terms text, p_delivery_terms_notes text, p_customer_notes text, p_validity_days integer, p_notes text, p_line_items jsonb, p_division_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_cash           BOOLEAN;
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
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  v_discount_resolved := COALESCE(p_discount_amount, 0);
  v_total     := v_subtotal - v_discount_resolved;
  v_total_qar := v_total * p_exchange_rate;

  SELECT (c.credit_group_id IS NULL), cg.credit_limit, cg.name
  INTO   v_is_cash, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

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

  IF v_is_cash THEN
    v_credit_limit := 0;
    v_group_name   := 'Cash';
    v_open_total   := 0;
    v_available    := 0;
  ELSE
    IF v_credit_limit IS NULL THEN
      RAISE EXCEPTION 'no_credit_group';
    END IF;

    v_open_total := public.customer_credit_used(p_customer_id, NULL);
    v_available  := v_credit_limit - v_open_total;

    IF p_intent = 'confirm' AND v_total_qar > v_available THEN
      v_exceeds_credit := true;
    END IF;
  END IF;

  IF p_intent = 'save_quote' THEN
    v_so_status := 'quotation';
  ELSIF v_exceeds_credit OR v_has_below_cost THEN
    v_so_status := 'pending_approval';
  ELSE
    v_so_status := 'confirmed';
  END IF;

  v_so_number := generate_so_id();
  INSERT INTO sale_orders (
    so_number, customer_id, status, currency, exchange_rate,
    initial_exchange_rate, initial_rate_captured_at, initial_rate_captured_by,
    total_qar,
    subtotal, discount_amount, discount_amount_resolved, discount_label, discount_type,
    total, validity_days, payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes, customer_notes, notes,
    created_by, division_id
  ) VALUES (
    v_so_number, p_customer_id, v_so_status, p_currency, p_exchange_rate,
    p_exchange_rate, now(), v_profile_id,
    v_total_qar,
    v_subtotal, v_discount_resolved, v_discount_resolved, p_discount_label, p_discount_type,
    v_total, p_validity_days, p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes, p_customer_notes, p_notes,
    v_profile_id, p_division_id
  ) RETURNING id INTO v_so_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_line_items) LOOP
    INSERT INTO sale_order_lines (
      sale_order_id, item_name, sku, qty, unit, unit_price, total,
      line_type, brand_variant_id, avg_cost
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
      COALESCE((v_line->>'avg_cost')::numeric, 0)
    );
  END LOOP;

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
-- Name: create_site_visit(text, uuid, text, text, date, text, text, text, jsonb, jsonb, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_site_visit(p_visit_id text, p_service_customer_id uuid, p_status text, p_mode text, p_scheduled_date date, p_address text, p_notes text, p_arrival_phone text, p_attachments jsonb, p_visit_dates jsonb, p_assignments jsonb, p_created_by uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_visit_id uuid;
  v_item     jsonb;
BEGIN
  INSERT INTO public.site_visits (
    visit_id, service_customer_id, status, mode,
    scheduled_date, address, notes, arrival_phone, attachments, created_by
  ) VALUES (
    p_visit_id,
    p_service_customer_id,
    p_status,
    p_mode,
    p_scheduled_date,
    NULLIF(p_address, ''),
    NULLIF(p_notes, ''),
    NULLIF(p_arrival_phone, ''),
    p_attachments,
    p_created_by
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
-- Name: create_stock_adjustment_v2(uuid, uuid, text, numeric, text, text, text[], uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_stock_adjustment_v2(p_warehouse_id uuid, p_brand_variant_id uuid, p_adjustment_type text, p_qty numeric, p_reason text, p_notes text, p_photo_urls text[], p_requested_by uuid, p_requested_by_name text, p_sub_container_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id             uuid;
  v_step           RECORD;
  v_ord            int := 0;
  v_check_wh       uuid;
  v_check_active   boolean;
BEGIN
  IF p_adjustment_type NOT IN ('increase','decrease','damage','write_off') THEN
    RAISE EXCEPTION 'Invalid adjustment_type: %', p_adjustment_type;
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'qty must be > 0';
  END IF;

  -- Phase E: sub_container_id is now REQUIRED. The old fallback derived it
  -- from warehouses.division_id, which is gone. Adjustment dialogs (D.4)
  -- already pass it.
  IF p_sub_container_id IS NULL THEN
    RAISE EXCEPTION 'sub_container_id is required — pick one on the adjustment dialog.'
      USING HINT = 'Open the adjustment dialog and pick a sub-container from the picker.';
  END IF;

  SELECT sc.warehouse_id, sc.is_active
    INTO v_check_wh, v_check_active
  FROM   public.warehouse_sub_containers sc
  WHERE  sc.id = p_sub_container_id;

  IF NOT FOUND OR v_check_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Sub-container % not found or inactive', p_sub_container_id;
  END IF;
  IF v_check_wh <> p_warehouse_id THEN
    RAISE EXCEPTION 'Sub-container % does not belong to warehouse %',
      p_sub_container_id, p_warehouse_id;
  END IF;

  INSERT INTO stock_adjustments (
    warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
    reason, notes, photo_urls, status,
    requested_by, requested_by_name
  ) VALUES (
    p_warehouse_id,
    p_sub_container_id,
    p_brand_variant_id,
    p_adjustment_type::public.stock_adjustment_type,
    p_qty,
    p_reason,
    NULLIF(p_notes,''),
    COALESCE(p_photo_urls, '{}'::text[]),
    'pending_approval',
    p_requested_by,
    p_requested_by_name
  )
  RETURNING id INTO v_id;

  FOR v_step IN
    SELECT step_key, step_label, is_conditional, condition_types
    FROM   approval_workflow_steps
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
-- Name: create_tool_item_with_default_variant(text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_tool_item_with_default_variant(p_name_en text, p_name_ar text, p_category_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_item_id uuid;
  v_sku     text;
BEGIN
  IF p_name_en IS NULL OR btrim(p_name_en) = '' THEN
    RAISE EXCEPTION 'name_en is required';
  END IF;

  v_item_id := gen_random_uuid();
  v_sku     := 'TOOL-' || SUBSTRING(v_item_id::text, 1, 8);

  INSERT INTO public.inventory_items (id, name_en, name_ar, category_id, sku, unit, cost_price)
  VALUES (v_item_id, btrim(p_name_en), NULLIF(btrim(p_name_ar), ''), p_category_id, v_sku, 'pcs', 0);

  INSERT INTO public.inventory_item_brand_variants (item_id, brand, cost_price, selling_price)
  VALUES (v_item_id, 'Default', 0, 0);

  RETURN v_item_id;
END $$;


--
-- Name: create_tool_units_on_receival_layer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_tool_units_on_receival_layer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_item_id     uuid;
  v_category    text;
  v_ri_id       uuid;
  v_qty         int := COALESCE(NEW.qty, 0)::int;
  v_receival_id uuid;
  i             int;
BEGIN
  IF NEW.source_type <> 'receival' THEN RETURN NEW; END IF;
  IF v_qty <= 0 THEN RETURN NEW; END IF;

  SELECT ii.id, ic.type::text
    INTO v_item_id, v_category
  FROM inventory_item_brand_variants biv
  JOIN inventory_items       ii ON ii.id = biv.item_id
  JOIN inventory_categories  ic ON ic.id = ii.category_id
  WHERE biv.id = NEW.brand_variant_id;

  IF v_category IS NULL OR v_category <> 'tools' THEN RETURN NEW; END IF;

  BEGIN
    v_receival_id := NEW.receival_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_receival_id := NULL;
  END;

  IF v_receival_id IS NOT NULL THEN
    SELECT ri.id INTO v_ri_id
    FROM receival_items ri
    WHERE ri.receival_id = v_receival_id
      AND ri.brand_variant_id = NEW.brand_variant_id
    LIMIT 1;
  END IF;

  -- Insert v_qty placeholder rows with NULL serial. UI shows them as
  -- "pending serial" and disables assignment until confirmed.
  FOR i IN 1..v_qty LOOP
    INSERT INTO tool_asset_units (
      item_id, receival_item_id, serial_number, is_placeholder,
      status, condition, brand
    ) VALUES (
      v_item_id, v_ri_id, NULL, true, 'available', 'Good', 'Default'
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let this trigger fail the receival — log and continue.
  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Tool Unit Auto-Create Failed',
    'inventory',
    'brand_variant',
    NEW.brand_variant_id,
    'system',
    'warning',
    jsonb_build_object(
      'sqlstate',      SQLSTATE,
      'sqlerrm',       SQLERRM,
      'receival_id',   NEW.receival_id,
      'brand_variant', NEW.brand_variant_id,
      'qty',           NEW.qty
    )::text
  );
  RETURN NEW;
END;
$$;


--
-- Name: create_transfer_v2(uuid, uuid, date, jsonb, text, uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_transfer_v2(p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_date date, p_items jsonb, p_notes text DEFAULT NULL::text, p_created_by_profile_id uuid DEFAULT NULL::uuid, p_created_by_name text DEFAULT NULL::text, p_from_sub_container_id uuid DEFAULT NULL::uuid, p_to_sub_container_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_transfer_id           UUID;
  v_transfer_number       TEXT;
  v_item                  JSONB;
  v_bv_id                 UUID;
  v_qty                   INT;
  v_available             INT;
  v_from_sub_container_id UUID;
  v_to_sub_container_id   UUID;
  v_from_count            INT;
  v_to_count              INT;
BEGIN
  -- ─ Resolve source sub-container ─────────────────────────────────────
  IF p_from_sub_container_id IS NOT NULL THEN
    v_from_sub_container_id := p_from_sub_container_id;
  ELSE
    SELECT COUNT(*) INTO v_from_count
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_from_warehouse_id
       AND is_active;

    IF v_from_count > 1 THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has multiple sub-containers; operator must specify p_from_sub_container_id',
        p_from_warehouse_id;
    END IF;

    SELECT id INTO v_from_sub_container_id
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_from_warehouse_id
       AND is_active
     ORDER BY created_at
     LIMIT 1;

    IF v_from_sub_container_id IS NULL THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has no active sub-container',
        p_from_warehouse_id;
    END IF;
  END IF;

  -- ─ Resolve destination sub-container ────────────────────────────────
  IF p_to_sub_container_id IS NOT NULL THEN
    v_to_sub_container_id := p_to_sub_container_id;
  ELSE
    SELECT COUNT(*) INTO v_to_count
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_to_warehouse_id
       AND is_active;

    IF v_to_count > 1 THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has multiple sub-containers; operator must specify p_to_sub_container_id',
        p_to_warehouse_id;
    END IF;

    SELECT id INTO v_to_sub_container_id
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_to_warehouse_id
       AND is_active
     ORDER BY created_at
     LIMIT 1;

    IF v_to_sub_container_id IS NULL THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has no active sub-container',
        p_to_warehouse_id;
    END IF;
  END IF;

  v_transfer_number := generate_transfer_number();

  INSERT INTO warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    created_by_profile_id, created_by_name,
    from_sub_container_id, to_sub_container_id
  ) VALUES (
    v_transfer_number, p_from_warehouse_id, p_to_warehouse_id,
    'pending', p_date, p_notes,
    p_created_by_profile_id, p_created_by_name,
    v_from_sub_container_id, v_to_sub_container_id
  )
  RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    -- Lock the allocation row FIRST to prevent concurrent double-allocation
    -- within the same source sub-container.
    PERFORM 1 FROM warehouse_stock_allocations
    WHERE warehouse_id = p_from_warehouse_id
      AND brand_variant_id = v_bv_id
      AND sub_container_id = v_from_sub_container_id
    FOR UPDATE;

    -- Availability = (FIFO stock in the source sub-container) - (already
    -- allocated in the same sub-container). Both sides scoped to
    -- v_from_sub_container_id so a transfer can never spill into a peer
    -- sub-container's stock.
    SELECT GREATEST(COALESCE(SUM(f.remaining_qty), 0)::INT - COALESCE(wsa.allocated_qty, 0), 0)
    INTO v_available
    FROM fifo_cost_layers f
    LEFT JOIN warehouse_stock_allocations wsa
      ON wsa.warehouse_id = p_from_warehouse_id
     AND wsa.brand_variant_id = v_bv_id
     AND wsa.sub_container_id = v_from_sub_container_id
    WHERE f.brand_variant_id = v_bv_id
      AND f.warehouse_id = p_from_warehouse_id
      AND f.sub_container_id = v_from_sub_container_id
      AND f.remaining_qty > 0
    GROUP BY wsa.allocated_qty;

    IF COALESCE(v_available, 0) < v_qty THEN
      RAISE EXCEPTION 'Insufficient available stock for item % (available: %, requested: %)',
        COALESCE(v_item->>'item_name', v_bv_id::TEXT), COALESCE(v_available, 0), v_qty;
    END IF;

    INSERT INTO warehouse_stock_allocations (warehouse_id, brand_variant_id, sub_container_id, allocated_qty)
    VALUES (p_from_warehouse_id, v_bv_id, v_from_sub_container_id, v_qty)
    ON CONFLICT (warehouse_id, brand_variant_id, sub_container_id)
    DO UPDATE SET allocated_qty = warehouse_stock_allocations.allocated_qty + v_qty,
                  updated_at = now();

    INSERT INTO warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost,
      sub_container_id
    ) VALUES (
      v_transfer_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''),
      v_item->>'sku',
      v_qty,
      COALESCE((v_item->>'unit_cost')::NUMERIC, 0),
      v_from_sub_container_id
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;


--
-- Name: create_warranty_records_for_delivery(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_warranty_records_for_delivery(p_delivery_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_delivery      RECORD;
  v_line          RECORD;
  v_item_id       uuid;
  v_policy_id     uuid;
  v_policy        RECORD;
  v_start_date    date;
  v_invoice_date  date;
  v_warranty_no   text;
  v_inserted      integer := 0;
BEGIN
  SELECT sd.id, sd.date, sd.sale_order_id,
         so.customer_id, so.division_id
  INTO   v_delivery
  FROM   public.sale_deliveries sd
  JOIN   public.sale_orders so ON so.id = sd.sale_order_id
  WHERE  sd.id = p_delivery_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_delivery.division_id IS NULL THEN
    -- Legacy rows without a division cannot satisfy the numbering + RLS
    -- requirement. Skip silently.
    RETURN 0;
  END IF;

  SELECT MAX(issued_date)
  INTO   v_invoice_date
  FROM   public.invoices
  WHERE  sale_delivery_id = p_delivery_id;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty_delivered
    FROM   public.sale_delivery_lines
    WHERE  sale_delivery_id = p_delivery_id
  LOOP
    IF v_line.brand_variant_id IS NULL
       OR v_line.qty_delivered IS NULL
       OR v_line.qty_delivered <= 0
    THEN
      CONTINUE;
    END IF;

    SELECT item_id INTO v_item_id
    FROM   public.inventory_item_brand_variants
    WHERE  id = v_line.brand_variant_id;

    IF v_item_id IS NULL THEN
      CONTINUE;
    END IF;

    v_policy_id := public.get_effective_warranty_policy(v_item_id);

    IF v_policy_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_policy
    FROM   public.warranty_policies
    WHERE  id = v_policy_id;

    IF v_policy.duration_months = 0 THEN
      CONTINUE;
    END IF;

    v_start_date := CASE
      WHEN v_policy.starts_from = 'invoice_date' AND v_invoice_date IS NOT NULL
        THEN v_invoice_date
      ELSE COALESCE(v_delivery.date, CURRENT_DATE)
    END;

    v_warranty_no := public.next_warranty_number('sale'::public.warranty_source_type, v_delivery.division_id);

    INSERT INTO public.warranty_records (
      warranty_number,
      source_type,
      sale_delivery_line_id,
      sale_order_id,
      customer_id,
      division_id,
      brand_variant_id,
      item_name,
      sku,
      qty,
      policy_id,
      policy_name_snapshot,
      coverage_type_snapshot,
      duration_months_snapshot,
      terms_en_snapshot,
      terms_ar_snapshot,
      void_conditions_snapshot,
      starts_from_snapshot,
      start_date,
      end_date
    ) VALUES (
      v_warranty_no,
      'sale',
      v_line.id,
      v_delivery.sale_order_id,
      v_delivery.customer_id,
      v_delivery.division_id,
      v_line.brand_variant_id,
      COALESCE(v_line.item_name, 'Item'),
      v_line.sku,
      v_line.qty_delivered,
      v_policy.id,
      v_policy.name,
      v_policy.coverage_type,
      v_policy.duration_months,
      v_policy.terms_en,
      v_policy.terms_ar,
      v_policy.void_conditions,
      v_policy.starts_from,
      v_start_date,
      (v_start_date + (v_policy.duration_months || ' months')::interval)::date
    )
    ON CONFLICT (sale_delivery_line_id) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;


--
-- Name: credit_notes_invalidate_pdf_cache_fn(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: custom_access_token_hook(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_type          TEXT;
  v_division_ids       UUID[];
  v_active_division_id UUID;
  claims               JSONB;
BEGIN
  SELECT active_division_id
    INTO v_active_division_id
  FROM user_data
  WHERE auth_user_id = (event ->> 'user_id')::UUID;

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
  FROM   user_data p
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
  claims := jsonb_set(
    claims,
    '{active_division_id}',
    CASE WHEN v_active_division_id IS NOT NULL
      THEN to_jsonb(v_active_division_id::text)
      ELSE 'null'::jsonb
    END
  );

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;


--
-- Name: customer_credit_used(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.customer_credit_used(p_customer_id uuid, p_exclude_so_id uuid DEFAULT NULL::uuid) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH invoiced AS (
    SELECT COALESCE(SUM(GREATEST(i.total_amount - COALESCE(i.paid_amount, 0), 0)), 0) AS outstanding
    FROM   so_invoices i
    WHERE  i.customer_id = p_customer_id
      AND  COALESCE(i.status, 'draft') <> 'cancelled'
      AND  (p_exclude_so_id IS NULL OR COALESCE(i.sale_order_id, gen_random_uuid()) <> p_exclude_so_id)
  ),
  uninvoiced AS (
    SELECT COALESCE(SUM(so.total * COALESCE(so.exchange_rate, 1)), 0) AS open_total
    FROM   sale_orders so
    LEFT   JOIN so_invoices i
           ON  i.sale_order_id = so.id
    WHERE  so.customer_id = p_customer_id
      AND  so.status      NOT IN ('cancelled')
      AND  so.deleted_at  IS NULL
      AND  (p_exclude_so_id IS NULL OR so.id <> p_exclude_so_id)
      AND  i.id IS NULL
  )
  SELECT (SELECT outstanding FROM invoiced)
       + (SELECT open_total  FROM uninvoiced);
$$;


--
-- Name: debit_notes_invalidate_pdf_cache_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.debit_notes_invalidate_pdf_cache_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.pdf_url IS NOT NULL
     AND (OLD.total_amount IS DISTINCT FROM NEW.total_amount
       OR OLD.status       IS DISTINCT FROM NEW.status) THEN
    NEW.pdf_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: deduct_fifo_layers(uuid, uuid, integer, boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deduct_fifo_layers(p_bv_id uuid, p_wh_id uuid, p_qty integer, p_is_transfer boolean, p_sub_container_id uuid DEFAULT NULL::uuid) RETURNS TABLE(layer_id uuid, source_type text, source_id uuid, qty_taken integer, unit_cost numeric, total_cost numeric, sub_container_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  r          RECORD;
  remaining  INT := p_qty;
  v_take     INT;
BEGIN
  FOR r IN
    SELECT fcl.id,
           fcl.remaining_qty,
           fcl.total_unit_cost,
           fcl.source_type      AS r_source_type,
           fcl.source_id        AS r_source_id,
           fcl.sub_container_id AS r_sub_container_id
    FROM fifo_cost_layers fcl
    WHERE fcl.brand_variant_id = p_bv_id
      AND (
        (p_wh_id IS NOT NULL AND fcl.warehouse_id = p_wh_id)
        OR (p_wh_id IS NULL AND fcl.warehouse_id IS NULL)
      )
      AND fcl.remaining_qty > 0
      AND (p_sub_container_id IS NULL OR fcl.sub_container_id = p_sub_container_id)
    ORDER BY fcl.date ASC, fcl.receival_number ASC, fcl.created_at ASC, fcl.id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining = 0;

    v_take := LEAST(remaining, r.remaining_qty);

    UPDATE fifo_cost_layers
    SET remaining_qty = remaining_qty - v_take
    WHERE id = r.id;

    layer_id         := r.id;
    source_type      := r.r_source_type;
    source_id        := r.r_source_id;
    qty_taken        := v_take;
    unit_cost        := r.total_unit_cost;
    total_cost       := v_take * r.total_unit_cost;
    sub_container_id := r.r_sub_container_id;
    RETURN NEXT;

    remaining := remaining - v_take;
  END LOOP;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock: requested %, missing % units for variant %',
      p_qty, remaining, p_bv_id;
  END IF;

  IF NOT p_is_transfer THEN
    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level - p_qty,
        updated_at  = now()
    WHERE id = p_bv_id;
  END IF;

  PERFORM recalc_average_cost(p_bv_id);
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
  FROM   so_invoices
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
-- Name: diag_list_receival_triggers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.diag_list_receival_triggers() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_triggers jsonb;
  v_columns  jsonb;
  v_policies jsonb;
BEGIN
  -- All triggers on receival-related tables, with their function bodies
  SELECT jsonb_agg(jsonb_build_object(
    'table',       tgrelid::regclass::text,
    'trigger',     tgname,
    'enabled',     tgenabled,
    'function',    proname,
    'body_head',   substring(prosrc from 1 for 400)
  ) ORDER BY tgrelid::regclass::text, tgname)
  INTO v_triggers
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid IN (
    'public.receivals'::regclass,
    'public.receival_items'::regclass,
    'public.fifo_cost_layers'::regclass,
    'public.inventory_stock_movements'::regclass,
    'public.inventory_item_brand_variants'::regclass,
    'public.inventory_item_brand_variants'::regclass
  )
  AND NOT tgisinternal;

  -- Column types on the same tables — makes any text/uuid mismatch obvious
  SELECT jsonb_agg(jsonb_build_object(
    'table',    table_name,
    'column',   column_name,
    'type',     data_type,
    'nullable', is_nullable
  ) ORDER BY table_name, ordinal_position)
  INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name  = 'receival_id'
    AND table_name IN ('receivals','receival_items','fifo_cost_layers',
                        'inventory_stock_movements','bills','shipments',
                        'invoices','receival_edit_requests','tool_asset_units');

  -- RLS policies on these tables (a bad policy could also throw)
  SELECT jsonb_agg(jsonb_build_object(
    'table',   tablename,
    'policy',  policyname,
    'cmd',     cmd,
    'expr',    substring(COALESCE(qual, with_check) from 1 for 400)
  ) ORDER BY tablename, policyname)
  INTO v_policies
  FROM pg_policies
  WHERE tablename IN ('receivals','receival_items','fifo_cost_layers',
                       'inventory_stock_movements','inventory_item_brand_variants',
                       'inventory_item_brand_variants');

  RETURN jsonb_build_object(
    'triggers', COALESCE(v_triggers, '[]'::jsonb),
    'receival_id_columns', COALESCE(v_columns, '[]'::jsonb),
    'policies', COALESCE(v_policies, '[]'::jsonb)
  );
END;
$$;


--
-- Name: dispatch_transfer(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_transfer(p_transfer_id uuid, p_dispatched_by_profile_id uuid, p_dispatched_by_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_transfer RECORD;
  v_item     RECORD;
  v_layer    RECORD;
BEGIN
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         from_sub_container_id, to_sub_container_id
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

  IF NOT is_field_rp_of(p_dispatched_by_profile_id, v_transfer.from_warehouse_id)
     AND NOT has_inventory_manager_role(p_dispatched_by_profile_id) THEN
    RAISE EXCEPTION 'User is not authorized to dispatch from this warehouse';
  END IF;

  UPDATE warehouse_transfers
  SET status = 'in_transit',
      dispatched_by_profile_id = p_dispatched_by_profile_id,
      dispatched_by_name = p_dispatched_by_name,
      dispatched_at = now()
  WHERE id = p_transfer_id;

  FOR v_item IN
    SELECT * FROM warehouse_transfer_items WHERE transfer_id = p_transfer_id ORDER BY brand_variant_id
  LOOP
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(
        v_item.brand_variant_id,
        v_transfer.from_warehouse_id,
        v_item.requested_qty,
        TRUE,
        v_transfer.from_sub_container_id
      )
    LOOP
      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id,
        sub_container_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', p_transfer_id,
        v_transfer.from_sub_container_id
      );
    END LOOP;

    -- Scope allocation decrement to the transfer's source sub-container.
    UPDATE warehouse_stock_allocations
    SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
        updated_at = now()
    WHERE warehouse_id = v_transfer.from_warehouse_id
      AND brand_variant_id = v_item.brand_variant_id
      AND sub_container_id = v_transfer.from_sub_container_id;

    UPDATE warehouse_transfer_items
    SET dispatched_qty = v_item.requested_qty
    WHERE id = v_item.id;
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
  UPDATE inventory_item_brand_variants
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
  UPDATE inventory_item_brand_variants
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
    UPDATE inventory_item_brand_variants
    SET linked_services_count = linked_services_count + 1
    WHERE id = NEW.brand_variant_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE inventory_item_brand_variants
    SET linked_services_count = GREATEST(0, linked_services_count - 1)
    WHERE id = OLD.brand_variant_id;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: force_approve_credit_group_change(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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
  FROM   user_data WHERE auth_user_id = auth.uid();
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

  -- customer_type and is_blocked columns were dropped; both are derived now
  -- (customer_type from credit_group_id IS NULL, is_blocked from block_reason
  -- IS NOT NULL). Only the group id and unblock reason need updating.
  UPDATE customers
     SET credit_group_id = v_request.requested_group_id,
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


--
-- Name: force_approve_sales_request(uuid, public.approval_type, text); Type: FUNCTION; Schema: public; Owner: -
--

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
  FROM   user_data WHERE auth_user_id = auth.uid();
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


--
-- Name: force_approve_stock_adjustment(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.force_approve_stock_adjustment(p_adjustment_id uuid, p_comment text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_profile_id  uuid;
  v_full_name   text;
  v_is_owner    boolean;
  v_status      text;
  v_count       INT;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id      = v_profile_id
      AND  cr.name             = 'Owner'
      AND  cr.deleted_at       IS NULL
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only users with the Owner role can force-approve';
  END IF;

  SELECT status INTO v_status
  FROM   stock_adjustments
  WHERE  id = p_adjustment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment % not found', p_adjustment_id;
  END IF;
  IF v_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Adjustment is not pending_approval (current: %)', v_status;
  END IF;

  UPDATE stock_adjustment_approvals
  SET    status          = 'approved',
         profile_id      = v_profile_id,
         profile_name    = v_full_name,
         action_at       = now(),
         notes           = COALESCE(notes, p_comment),
         force_approved  = true,
         force_comment   = NULLIF(TRIM(COALESCE(p_comment, '')), '')
  WHERE  adjustment_id = p_adjustment_id
    AND  status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No pending steps to force-approve on this adjustment';
  END IF;

  PERFORM public.approve_stock_adjustment_inventory(
    p_adjustment_id => p_adjustment_id,
    p_approved_by   => v_full_name
  );

  RETURN v_count;
END;
$$;


--
-- Name: generate_brand_variant_sku(); Type: FUNCTION; Schema: public; Owner: -
--

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
    FROM public.inventory_item_brand_variants
   WHERE code LIKE v_prefix || '%';

  NEW.code := v_prefix || lpad(v_next_seq::text, 3, '0');

  RETURN NEW;
END;
$_$;


--
-- Name: generate_check_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_check_number() RETURNS text
    LANGUAGE sql
    AS $$
  SELECT 'IC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('inventory_check_seq')::TEXT, 5, '0')
$$;


--
-- Name: generate_consumption_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_consumption_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.consumption_entries;
  RETURN 'CE-' || lpad((v_count + 1)::text, 5, '0');
END;
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
  v_so               RECORD;
  v_invoice_id_str   TEXT;
  v_invoice_type     TEXT;
  v_issued_date      DATE;
  v_due_date         DATE;
  v_new_inv_id       uuid;
  v_new_inv_str      TEXT;
  v_paid_amount      NUMERIC;
  v_payment_status   TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoices_serial'));

  IF EXISTS (
    SELECT 1 FROM so_invoices
    WHERE  sale_order_id = p_so_id
  ) THEN
    RAISE EXCEPTION 'invoice_exists';
  END IF;

  SELECT
    so.id, so.so_number, so.status, so.customer_id,
    so.division_id,
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

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid_amount
  FROM   public.payments
  WHERE  source_type = 'sale_order'
    AND  source_id   = p_so_id
    AND  direction   = 'incoming'
    AND  deleted_at IS NULL;

  v_payment_status := CASE
    WHEN v_paid_amount >= v_so.total_amount THEN 'paid'
    WHEN v_paid_amount > 0                  THEN 'partially_paid'
    ELSE                                          'unpaid'
  END;

  v_invoice_id_str := v_so.so_number || '-I';

  v_invoice_type := v_so.customer_type;
  v_issued_date  := CURRENT_DATE;
  v_due_date     := CASE v_invoice_type
    WHEN 'cash' THEN CURRENT_DATE
    ELSE             CURRENT_DATE + 30
  END;

  INSERT INTO so_invoices (
    invoice_id, customer_id, sale_order_id,
    division_id,
    invoice_type, status, payment_status, needs_refresh,
    total_amount, subtotal, tax, paid_amount,
    issued_date, due_date,
    source, source_id, source_label
  ) VALUES (
    v_invoice_id_str, v_so.customer_id, p_so_id,
    v_so.division_id,
    v_invoice_type::public.invoice_type, 'draft', v_payment_status::public.invoice_payment_status, false,
    v_so.total_amount, v_so.subtotal, v_so.tax, v_paid_amount,
    v_issued_date, v_due_date,
    'sale_order', p_so_id::text, 'SO #' || v_so.so_number
  )
  RETURNING id, invoice_id INTO v_new_inv_id, v_new_inv_str;

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


--
-- Name: generate_order_quotation_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_order_quotation_id() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_num   INT  := nextval('order_quotation_number_seq');
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
-- Name: generate_transfer_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_transfer_number() RETURNS text
    LANGUAGE sql
    AS $$
  SELECT 'WT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('warehouse_transfer_seq')::TEXT, 5, '0')
$$;


--
-- Name: get_category_stock_aggregates(text); Type: FUNCTION; Schema: public; Owner: -
--

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
    JOIN inventory_item_brand_variants ibv ON ibv.item_id = ii.id
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
      (
        SELECT COALESCE(
                 jsonb_agg(
                   jsonb_build_object(
                     'id',         cp.id,
                     'phone',      cp.phone,
                     'is_primary', cp.is_primary,
                     'label',      cp.label
                   )
                   ORDER BY cp.is_primary DESC, cp.created_at
                 ),
                 '[]'::jsonb)
        FROM public.customer_phones cp
        WHERE cp.customer_id = c.id
      )                                           AS phones,
      i.division_id                               AS division_id,
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
          'division_id',    i.division_id,
          'division_name',  d.name,
          'source_type',    i.source::text,
          'source_id',      i.source_id,
          'source_label',   i.source_label,
          'issued_date',    i.issued_date,
          'due_date',       i.due_date,
          'total_amount',   i.total_amount,
          'paid_amount',    COALESCE(i.paid_amount, 0),
          'payment_status', i.payment_status::text
        )
        ORDER BY i.due_date ASC
      )                                           AS invoices
    FROM   so_invoices i
    JOIN   customers c          ON c.id = i.customer_id
    LEFT JOIN company_divisions d ON d.id = i.division_id
    WHERE  COALESCE(i.status::text, 'draft') NOT IN ('void', 'cancelled')
      AND  i.payment_status != 'paid'
      AND  (COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0)) > 0
    GROUP BY c.id, c.name, i.division_id, d.name
    ORDER BY total_pending DESC
  ) grouped;

  RETURN COALESCE(result, '[]'::jsonb);
END;
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
      FROM inventory_stock_movements
     GROUP BY brand_variant_id
  ),
  oldest_fifo AS (
    SELECT brand_variant_id, MIN(date) AS oldest_layer_date
      FROM fifo_cost_layers
     WHERE remaining_qty > 0
     GROUP BY brand_variant_id
  ),
  computed AS (
    SELECT
      ibv.id                                                      AS brand_variant_id,
      ii.name_en                                                  AS item_name,
      ic.name_en                                                  AS category_name,
      COALESCE(b.name, NULLIF(TRIM(ibv.brand), ''))               AS brand,
      ibv.code                                                    AS sku,
      ibv.stock_level,
      COALESCE(ibv.average_cost, 0)                               AS average_cost,
      ibv.stock_level * COALESCE(ibv.average_cost, 0)             AS total_value,
      COALESCE(lm.last_movement_at,
               of.oldest_layer_date::timestamptz,
               ibv.created_at)                                    AS last_movement_date,
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
    FROM       public.inventory_item_brand_variants ibv
    JOIN       public.inventory_items          ii ON ii.id = ibv.item_id
    LEFT JOIN  public.inventory_categories     ic ON ic.id = ii.category_id
    LEFT JOIN  public.brands                   b  ON b.id  = ibv.brand_id
    LEFT JOIN  latest_movements                lm ON lm.brand_variant_id = ibv.id
    LEFT JOIN  oldest_fifo                     of ON of.brand_variant_id = ibv.id
    WHERE ibv.stock_level > 0
  )
  SELECT
    brand_variant_id, item_name, category_name, brand, sku,
    stock_level, average_cost, total_value, last_movement_date,
    last_movement_source, days_idle,
    CASE
      WHEN days_idle <= 30  THEN 'active'
      WHEN days_idle <= 90  THEN 'slow_moving'
      WHEN days_idle <= 180 THEN 'at_risk'
      ELSE                       'dead'
    END AS status
  FROM computed;
$$;


--
-- Name: get_effective_attributes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_effective_attributes(p_category_id uuid) RETURNS TABLE(definition_id uuid, category_id uuid, category_name text, attribute_key text, label_en text, label_ar text, sort_order integer, depth integer, is_inherited boolean)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  WITH RECURSIVE tree AS (
    SELECT id, parent_id, name_en, 0 AS depth
    FROM inventory_categories
    WHERE id = p_category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, t.depth + 1
    FROM inventory_categories c
    JOIN tree t ON t.parent_id = c.id
    WHERE t.depth < 10
  )
  SELECT
    d.id,
    d.category_id,
    t.name_en,
    d.attribute_key,
    d.label_en,
    d.label_ar,
    d.sort_order,
    t.depth,
    (t.depth > 0) AS is_inherited
  FROM inventory_attribute_definitions d
  JOIN tree t ON t.id = d.category_id
  ORDER BY d.sort_order ASC, t.depth ASC;
$$;


--
-- Name: get_effective_warranty_policy(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_effective_warranty_policy(p_item_id uuid) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH RECURSIVE item AS (
    SELECT warranty_policy_id, category_id
    FROM public.inventory_items
    WHERE id = p_item_id
  ),
  -- Walk the category chain from the item's own category up toward the
  -- root. depth 0 = leaf. First row with a non-null default_warranty_policy_id
  -- (ordered by depth ASC) is the answer.
  category_chain AS (
    SELECT
      ic.id,
      ic.parent_id,
      ic.default_warranty_policy_id,
      0 AS depth
    FROM public.inventory_categories ic
    WHERE ic.id = (SELECT category_id FROM item)

    UNION ALL

    SELECT
      parent.id,
      parent.parent_id,
      parent.default_warranty_policy_id,
      child.depth + 1
    FROM public.inventory_categories parent
    JOIN category_chain child ON child.parent_id = parent.id
  ),
  category_hit AS (
    SELECT default_warranty_policy_id
    FROM category_chain
    WHERE default_warranty_policy_id IS NOT NULL
    ORDER BY depth ASC
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT warranty_policy_id FROM item),
    (SELECT default_warranty_policy_id FROM category_hit)
  );
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
        SELECT payment_status::text, COUNT(*)::int AS cnt
        FROM   so_invoices
        WHERE  COALESCE(status, 'draft') NOT IN ('void', 'cancelled')
        GROUP BY payment_status
      ) sc
    ),
    'outstanding', (
      SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
      FROM   so_invoices
      WHERE  COALESCE(status, 'draft') NOT IN ('void', 'cancelled')
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
-- Name: get_places_master_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_places_master_list() RETURNS TABLE(id uuid, name text, division_id uuid, division_name text, is_active boolean, responsible_person_profile_id uuid, responsible_person_name text, responsible_person_phone text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT sc.id,
         sc.name,
         sc.division_id,
         d.name AS division_name,
         sc.is_active,
         sc.responsible_person_profile_id,
         u.full_name AS responsible_person_name,
         u.phone     AS responsible_person_phone,
         sc.created_at,
         sc.updated_at
  FROM   public.warehouse_sub_containers sc
  JOIN   public.warehouses         w ON w.id = sc.warehouse_id
  JOIN   public.company_divisions  d ON d.id = sc.division_id
  LEFT   JOIN public.user_data     u ON u.id = sc.responsible_person_profile_id
  WHERE  w.warehouse_kind = 'places'
  ORDER  BY d.name, sc.name;
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
  FROM inventory_item_brand_variants bv
  LEFT JOIN sale_agg ON sale_agg.brand_variant_id = bv.id
  LEFT JOIN lc_agg   ON lc_agg.brand_variant_id   = bv.id
  WHERE (p_brand_variant_ids IS NULL OR bv.id = ANY(p_brand_variant_ids))
    AND (
      COALESCE(sale_agg.sold_at_sale_total, 0) <> 0
      OR COALESCE(lc_agg.lc_adjustments_total, 0) <> 0
    );
$$;


--
-- Name: get_teams_master_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_teams_master_list() RETURNS TABLE(id uuid, name text, division_id uuid, division_name text, team_id uuid, is_active boolean, responsible_person_profile_id uuid, responsible_person_name text, responsible_person_phone text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT sc.id,
         sc.name,
         sc.division_id,
         d.name AS division_name,
         sc.team_id,
         sc.is_active,
         sc.responsible_person_profile_id,
         u.full_name AS responsible_person_name,
         u.phone     AS responsible_person_phone,
         sc.created_at,
         sc.updated_at
  FROM   public.warehouse_sub_containers sc
  JOIN   public.warehouses         w ON w.id = sc.warehouse_id
  JOIN   public.company_divisions  d ON d.id = sc.division_id
  LEFT   JOIN public.user_data     u ON u.id = sc.responsible_person_profile_id
  WHERE  w.warehouse_kind = 'teams'
  ORDER  BY d.name, sc.name;
$$;


--
-- Name: get_warehouse_names(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_warehouse_names(p_ids uuid[]) RETURNS TABLE(id uuid, name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT w.id, w.name
  FROM   public.warehouses w
  WHERE  w.id = ANY(p_ids);
$$;


--
-- Name: get_warehouse_sub_containers(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_warehouse_sub_containers(p_warehouse_id uuid) RETURNS TABLE(id uuid, name text, division_id uuid, division_name text, is_active boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT sc.id, sc.name, sc.division_id, cd.name, sc.is_active
  FROM   public.warehouse_sub_containers sc
  LEFT   JOIN public.company_divisions cd ON cd.id = sc.division_id
  WHERE  sc.warehouse_id = p_warehouse_id
  ORDER  BY sc.created_at;
$$;


--
-- Name: get_warehouse_sub_containers_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_warehouse_sub_containers_admin(p_warehouse_id uuid) RETURNS TABLE(id uuid, warehouse_id uuid, division_id uuid, division_name text, name text, is_active boolean, team_id uuid, responsible_person_profile_id uuid, responsible_person_name text, responsible_person_phone text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT sc.id,
         sc.warehouse_id,
         sc.division_id,
         d.name           AS division_name,
         sc.name,
         sc.is_active,
         sc.team_id,
         sc.responsible_person_profile_id,
         u.full_name      AS responsible_person_name,
         u.phone          AS responsible_person_phone,
         sc.created_at,
         sc.updated_at
  FROM   public.warehouse_sub_containers sc
  LEFT   JOIN public.company_divisions d ON d.id = sc.division_id
  LEFT   JOIN public.user_data         u ON u.id = sc.responsible_person_profile_id
  WHERE  sc.warehouse_id = p_warehouse_id
  ORDER  BY sc.is_active DESC, d.name NULLS LAST, sc.name;
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
    FROM public.user_data p
    JOIN public.user_custom_roles ur ON ur.profile_id = p.id
    JOIN public.custom_roles      cr ON cr.id        = ur.role_id
    WHERE p.auth_user_id = auth.uid()
      AND (
        cr.is_system_admin = true
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
-- Name: invoice_line_items_invalidate_parent_pdf_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invoice_line_items_invalidate_parent_pdf_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_invoice_id UUID;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.so_invoices
     SET pdf_url = NULL
   WHERE id = v_invoice_id
     AND pdf_url IS NOT NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: invoice_recompute_paid_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invoice_recompute_paid_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_invoice_id     uuid;
  v_old_invoice_id uuid;
BEGIN
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
    SELECT COALESCE(SUM(amount), 0) AS paid  -- FIX: was COALESCE(amount_qar, amount)
    FROM   public.payments
    WHERE  (
             (source_type = 'invoice' AND source_id = v_invoice_id)
             OR invoice_id = v_invoice_id
           )
      AND  deleted_at IS NULL
      AND  direction  = 'incoming'
  )
  UPDATE public.so_invoices i
  SET    paid_amount    = summed.paid,
         payment_status = (CASE
           WHEN i.total_amount > 0 AND summed.paid >= i.total_amount THEN 'paid'
           WHEN summed.paid > 0                                      THEN 'partially_paid'
           ELSE                                                           'unpaid'
         END)::public.invoice_payment_status
  FROM   summed
  WHERE  i.id = v_invoice_id;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.source_type = 'invoice' THEN v_old_invoice_id := OLD.source_id;
    ELSIF OLD.invoice_id IS NOT NULL THEN v_old_invoice_id := OLD.invoice_id;
    END IF;

    IF v_old_invoice_id IS NOT NULL AND v_old_invoice_id <> v_invoice_id THEN
      WITH summed AS (
        SELECT COALESCE(SUM(amount), 0) AS paid
        FROM   public.payments
        WHERE  (
                 (source_type = 'invoice' AND source_id = v_old_invoice_id)
                 OR invoice_id = v_old_invoice_id
               )
          AND  deleted_at IS NULL
          AND  direction  = 'incoming'
      )
      UPDATE public.so_invoices i
      SET    paid_amount    = summed.paid,
             payment_status = (CASE
               WHEN i.total_amount > 0 AND summed.paid >= i.total_amount THEN 'paid'
               WHEN summed.paid > 0                                      THEN 'partially_paid'
               ELSE                                                           'unpaid'
             END)::public.invoice_payment_status
      FROM   summed
      WHERE  i.id = v_old_invoice_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: invoices_invalidate_pdf_cache_fn(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: is_division_visible(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_division_visible(row_division_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH c AS (
    SELECT
      auth.jwt() ->> 'user_type'                             AS user_type,
      NULLIF(auth.jwt() ->> 'active_division_id', '')::uuid  AS active_div
  )
  SELECT
    row_division_id IS NULL
    OR (
      (SELECT user_type FROM c) IN ('owner', 'accountant')
      AND ((SELECT active_div FROM c) IS NULL OR row_division_id = (SELECT active_div FROM c))
    )
    OR (
      row_division_id = ANY(
        ARRAY(SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids'))::UUID[]
      )
      AND ((SELECT active_div FROM c) IS NULL OR row_division_id = (SELECT active_div FROM c))
    );
$$;


--
-- Name: is_field_rp_of(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_field_rp_of(p_profile_id uuid, p_warehouse_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.warehouse_responsible_persons wrp
    WHERE  wrp.profile_id   = p_profile_id
      AND  wrp.warehouse_id = p_warehouse_id
  );
$$;


--
-- Name: is_sub_container_visible(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_sub_container_visible(p_sub_container_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.warehouse_sub_containers sc
     WHERE sc.id = p_sub_container_id
       AND (
         -- Branch A: user's division access covers the sub-container's
         -- division. is_division_visible(NULL) returns TRUE, so virtual
         -- repair-vendor sub-containers are visible to all authenticated.
         public.is_division_visible(sc.division_id)
         OR
         -- Branch B: user is a responsible person of the parent warehouse.
         EXISTS (
           SELECT 1
             FROM public.warehouse_responsible_persons rp
            WHERE rp.warehouse_id = sc.warehouse_id
              AND rp.profile_id   = public._current_user_data_id()
         )
       )
  );
$$;


--
-- Name: log_sales_approval_decision(); Type: FUNCTION; Schema: public; Owner: -
--

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
    (CASE
      WHEN NEW.status = 'rejected'        THEN 'warning'
      WHEN NEW.force_approved              THEN 'critical'
      ELSE                                       'info'
    END)::audit_severity,
    v_details
  );

  RETURN NEW;
END;
$$;


--
-- Name: mark_overdue_bills(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_overdue_bills() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE bills
  SET    payment_status = 'overdue'
  WHERE  payment_status NOT IN ('paid')
    AND  COALESCE(status, 'draft') NOT IN ('void', 'cancelled')
    AND  due_date < NOW();
END;
$$;


--
-- Name: mark_overdue_invoices(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_overdue_invoices() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE so_invoices
  SET    payment_status = 'overdue'
  WHERE  payment_status NOT IN ('paid')
    AND  COALESCE(status, 'draft') NOT IN ('void', 'cancelled')
    AND  due_date < NOW();
END;
$$;


--
-- Name: next_delivery_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_delivery_number() RETURNS text
    LANGUAGE sql
    AS $$
  SELECT 'DEL-' || LPAD(nextval('delivery_number_seq')::TEXT, 5, '0');
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
-- Name: next_po_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_po_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_year   TEXT := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_month  TEXT := TO_CHAR(CURRENT_DATE, 'MM');
  v_prefix TEXT := 'PO-' || v_year || '-' || v_month || '-';
  v_next   INT;
BEGIN
  -- Serialize concurrent creates within the same year+month.
  PERFORM pg_advisory_xact_lock(hashtext('po_number_' || v_year || v_month));

  SELECT COUNT(*) + 1 INTO v_next
  FROM   public.purchase_orders
  WHERE  po_number LIKE v_prefix || '%';

  RETURN v_prefix || LPAD(v_next::TEXT, 3, '0');
END $$;


--
-- Name: next_so_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_so_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_year   TEXT := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_month  TEXT := TO_CHAR(CURRENT_DATE, 'MM');
  v_prefix TEXT := 'SO-' || v_year || '-' || v_month || '-';
  v_next   INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('so_number_' || v_year || v_month));

  SELECT COUNT(*) + 1 INTO v_next
  FROM   public.sale_orders
  WHERE  so_number LIKE v_prefix || '%';

  RETURN v_prefix || LPAD(v_next::TEXT, 3, '0');
END $$;


--
-- Name: next_warranty_number(public.warranty_source_type, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_warranty_number(p_source_type public.warranty_source_type, p_division_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_slug     text;
  v_counter  integer;
  v_source_s text;
BEGIN
  v_slug := public.resolve_warranty_division_slug(p_division_id);

  INSERT INTO public.warranty_number_counters (source_type, division_id, next_value)
  VALUES (p_source_type, p_division_id, 2)
  ON CONFLICT (source_type, division_id)
  DO UPDATE SET next_value = warranty_number_counters.next_value + 1
  RETURNING next_value - 1 INTO v_counter;

  v_source_s := upper(p_source_type::text);

  RETURN 'WAR-' || v_source_s || '-' || v_slug || '-' || lpad(v_counter::text, 3, '0');
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
  SELECT full_name INTO v_requester_name FROM user_data WHERE id = NEW.requested_by;
  v_requester_name := COALESCE(v_requester_name, 'Unknown User');

  -- Insert notification for each approver (except the requester themselves)
  FOR v_approver_id IN
    SELECT DISTINCT ucr.profile_id
    FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
    WHERE (cr.is_system_admin = true OR 'master_data.services.approve' = ANY(cr.permissions))
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
-- Name: payment_bill_allocations_trigger_recompute_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payment_bill_allocations_trigger_recompute_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM public.bill_recompute_paid_fn(NEW.bill_id);
  END IF;
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.bill_id IS DISTINCT FROM COALESCE(NEW.bill_id, OLD.bill_id) THEN
      PERFORM public.bill_recompute_paid_fn(OLD.bill_id);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.bill_recompute_paid_fn(OLD.bill_id);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: payments_redirect_to_invoice_fn(); Type: FUNCTION; Schema: public; Owner: -
--

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
  FROM   public.so_invoices
  WHERE  sale_order_id = NEW.source_id
  LIMIT  1;
  IF v_invoice_id IS NOT NULL THEN
    NEW.source_type := 'invoice';
    NEW.source_id   := v_invoice_id;
    NEW.invoice_id  := v_invoice_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: payments_sync_invoice_id_fn(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: payments_trigger_bill_recompute_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payments_trigger_bill_recompute_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_new_bill_id uuid;
  v_old_bill_id uuid;
  v_new_po_id   uuid;
  v_old_po_id   uuid;
  b_rec         RECORD;
BEGIN
  -- Collect all bill_ids and po_ids potentially affected by this change.
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_new_bill_id := NEW.bill_id;
    IF NEW.source_type = 'bill'           THEN v_new_bill_id := NEW.source_id; END IF;
    IF NEW.source_type = 'purchase_order' THEN v_new_po_id   := NEW.source_id; END IF;
  END IF;

  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    v_old_bill_id := OLD.bill_id;
    IF OLD.source_type = 'bill'           THEN v_old_bill_id := OLD.source_id; END IF;
    IF OLD.source_type = 'purchase_order' THEN v_old_po_id   := OLD.source_id; END IF;
  END IF;

  -- Recompute directly-referenced bills.
  IF v_new_bill_id IS NOT NULL THEN
    PERFORM public.bill_recompute_paid_fn(v_new_bill_id);
  END IF;
  IF v_old_bill_id IS NOT NULL AND v_old_bill_id IS DISTINCT FROM v_new_bill_id THEN
    PERFORM public.bill_recompute_paid_fn(v_old_bill_id);
  END IF;

  -- Recompute bills linked via PO (1 PO = 1 bill in this app, but loop for safety).
  IF v_new_po_id IS NOT NULL THEN
    FOR b_rec IN SELECT id FROM public.bills WHERE purchase_order_id = v_new_po_id LOOP
      PERFORM public.bill_recompute_paid_fn(b_rec.id);
    END LOOP;
  END IF;
  IF v_old_po_id IS NOT NULL AND v_old_po_id IS DISTINCT FROM v_new_po_id THEN
    FOR b_rec IN SELECT id FROM public.bills WHERE purchase_order_id = v_old_po_id LOOP
      PERFORM public.bill_recompute_paid_fn(b_rec.id);
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: po_approval_action(uuid, uuid, text, text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.po_approval_action(p_po_id uuid, p_step_id uuid, p_approver_email text, p_approver_name text, p_approver_profile_id uuid, p_action text, p_comment text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_today         DATE := CURRENT_DATE;
  v_now           TIMESTAMPTZ := now();
  v_step          RECORD;
  v_iteration     INT;
  v_po            RECORD;
  v_approved_roles TEXT[] := '{}';
  v_pending_ids   UUID[];
  v_is_owner      BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_po_id::text));

  -- ── APPROVE ──────────────────────────────────────────────────────────
  IF p_action = 'approve' THEN
    IF p_step_id IS NULL THEN
      RAISE EXCEPTION 'p_step_id is required for approve action';
    END IF;

    SELECT tier_rank, iteration, role, status, is_active
      INTO v_step
      FROM po_approvals WHERE id = p_step_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval step not found'; END IF;
    IF v_step.status != 'pending' OR v_step.is_active != true THEN
      RAISE EXCEPTION 'Step is not pending/active';
    END IF;

    IF EXISTS (
      SELECT 1 FROM po_approvals
       WHERE po_id = p_po_id
         AND tier_rank = v_step.tier_rank
         AND iteration = v_step.iteration
         AND status = 'approved'
         AND approved_by = p_approver_email
         AND id != p_step_id
    ) THEN
      RAISE EXCEPTION 'Four-eyes violation: you already approved another role in this tier';
    END IF;

    UPDATE po_approvals SET
      status = 'approved', approved_by = p_approver_email,
      date = v_today, comment = p_comment
    WHERE id = p_step_id;

    v_approved_roles := ARRAY[v_step.role];

    INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
    VALUES ('purchase_order', p_po_id, 'purchase_orders',
            'Approved: ' || v_step.role, p_comment, p_approver_name, 'info');

  -- ── FORCE APPROVE (single step) ─────────────────────────────────────
  ELSIF p_action = 'force_approve' THEN
    IF p_step_id IS NULL THEN
      RAISE EXCEPTION 'p_step_id is required for force_approve action';
    END IF;
    IF p_comment IS NULL OR trim(p_comment) = '' THEN
      RAISE EXCEPTION 'A comment is required for force-approve';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM user_custom_roles ucr
        JOIN custom_roles cr ON cr.id = ucr.role_id
       WHERE ucr.profile_id = p_approver_profile_id
         AND cr.name = 'Owner' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL
    ) INTO v_is_owner;
    IF NOT v_is_owner THEN RAISE EXCEPTION 'Only Owner role can force-approve'; END IF;

    SELECT role INTO v_step FROM po_approvals WHERE id = p_step_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval step not found'; END IF;

    UPDATE po_approvals SET
      status = 'approved', approved_by = p_approver_email,
      date = v_today, force_approved = true, force_comment = p_comment
    WHERE id = p_step_id;

    v_approved_roles := ARRAY[v_step.role];

    INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
    VALUES ('purchase_order', p_po_id, 'purchase_orders',
            'Force Approved: ' || v_step.role, p_comment, p_approver_name, 'critical');

  -- ── FORCE APPROVE ALL ────────────────────────────────────────────────
  ELSIF p_action = 'force_approve_all' THEN
    SELECT EXISTS (
      SELECT 1 FROM user_custom_roles ucr
        JOIN custom_roles cr ON cr.id = ucr.role_id
       WHERE ucr.profile_id = p_approver_profile_id
         AND cr.name = 'Owner' AND cr.is_approval_slot = true AND cr.deleted_at IS NULL
    ) INTO v_is_owner;
    IF NOT v_is_owner THEN RAISE EXCEPTION 'Only Owner role can force-approve'; END IF;

    SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
      FROM po_approvals WHERE po_id = p_po_id;

    SELECT array_agg(id), array_agg(role)
      INTO v_pending_ids, v_approved_roles
      FROM po_approvals
     WHERE po_id = p_po_id AND iteration = v_iteration
       AND status = 'pending' AND is_active = true;

    IF v_pending_ids IS NULL OR array_length(v_pending_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'No pending steps to force-approve';
    END IF;

    UPDATE po_approvals SET
      status = 'approved', approved_by = p_approver_email,
      date = v_today, force_approved = true,
      force_comment = CASE WHEN trim(COALESCE(p_comment,'')) != '' THEN p_comment ELSE NULL END
    WHERE id = ANY(v_pending_ids);

    FOR i IN 1..array_length(v_approved_roles, 1) LOOP
      INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
      VALUES ('purchase_order', p_po_id, 'purchase_orders',
              'Force Approved: ' || v_approved_roles[i],
              CASE WHEN trim(COALESCE(p_comment,'')) != '' THEN p_comment ELSE NULL END,
              p_approver_name, 'critical');
    END LOOP;

  -- ── REJECT (cancel or send-back-to-draft) ───────────────────────────
  ELSIF p_action IN ('reject_cancel', 'reject_draft') THEN
    IF p_step_id IS NULL THEN
      RAISE EXCEPTION 'p_step_id is required for reject action';
    END IF;

    SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
      FROM po_approvals WHERE po_id = p_po_id;

    SELECT role INTO v_step FROM po_approvals WHERE id = p_step_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval step not found'; END IF;

    UPDATE po_approvals SET
      status = 'rejected', approved_by = p_approver_email,
      date = v_today, comment = p_comment
    WHERE id = p_step_id;

    UPDATE po_approvals SET status = 'rejected'
     WHERE po_id = p_po_id AND iteration = v_iteration
       AND status = 'pending' AND is_active = true AND id != p_step_id;

    IF p_action = 'reject_cancel' THEN
      UPDATE purchase_orders SET status = 'cancelled' WHERE id = p_po_id;
    ELSE
      UPDATE purchase_orders SET status = 'draft' WHERE id = p_po_id;
    END IF;

    v_approved_roles := ARRAY[v_step.role];

    INSERT INTO activity_log (entity_type, entity_id, module, action, details, performer_name, severity)
    VALUES ('purchase_order', p_po_id, 'purchase_orders',
            CASE WHEN p_action = 'reject_cancel'
              THEN 'Rejected by ' || v_step.role || ' — PO Cancelled'
              ELSE 'Rejected by ' || v_step.role || ' — Sent Back to Draft'
            END,
            p_comment, p_approver_name, 'warning');

    SELECT created_by, po_number INTO v_po
      FROM purchase_orders WHERE id = p_po_id;
    IF v_po.created_by IS NOT NULL THEN
      INSERT INTO notifications (profile_id, type, title, related_id, related_type)
      VALUES (v_po.created_by, 'po_rejected',
              'PO ' || v_po.po_number || ' was rejected by ' || p_approver_email,
              p_po_id, 'purchase_order');
    END IF;

    UPDATE notifications SET read_at = v_now
     WHERE related_id = p_po_id AND type = 'po_approval_requested' AND read_at IS NULL;

    RETURN jsonb_build_object(
      'ok', true, 'po_status',
      CASE WHEN p_action = 'reject_cancel' THEN 'cancelled' ELSE 'draft' END,
      'action', p_action, 'roles', to_jsonb(v_approved_roles)
    );

  ELSE
    RAISE EXCEPTION 'Unknown action: %', p_action;
  END IF;

  -- ── Common post-approve path: clear notifications + advance tier ────
  UPDATE notifications SET read_at = v_now
   WHERE related_id = p_po_id AND type = 'po_approval_requested' AND read_at IS NULL;

  DECLARE
    v_adv_iteration INT;
    v_next_rank     INT;
    v_all_done      BOOLEAN;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM purchase_orders WHERE id = p_po_id AND status = 'pending_approval'
    ) THEN
      SELECT status INTO v_po FROM purchase_orders WHERE id = p_po_id;
      RETURN jsonb_build_object('ok', true, 'po_status', v_po.status, 'action', p_action, 'roles', to_jsonb(v_approved_roles));
    END IF;

    SELECT COALESCE(MAX(iteration), 1) INTO v_adv_iteration
      FROM po_approvals WHERE po_id = p_po_id;

    SELECT NOT EXISTS (
      SELECT 1 FROM po_approvals
       WHERE po_id = p_po_id AND iteration = v_adv_iteration
         AND is_active = true AND status != 'approved'
    ) INTO v_all_done;

    IF v_all_done THEN
      SELECT MIN(tier_rank) INTO v_next_rank
        FROM po_approvals
       WHERE po_id = p_po_id AND iteration = v_adv_iteration
         AND is_active = false AND status = 'pending';

      IF v_next_rank IS NOT NULL THEN
        UPDATE po_approvals SET is_active = true
         WHERE po_id = p_po_id AND iteration = v_adv_iteration AND tier_rank = v_next_rank;
      ELSE
        UPDATE purchase_orders SET status = 'approved' WHERE id = p_po_id;

        SELECT created_by, po_number INTO v_po FROM purchase_orders WHERE id = p_po_id;
        IF v_po.created_by IS NOT NULL THEN
          INSERT INTO notifications (profile_id, type, title, related_id, related_type)
          VALUES (v_po.created_by, 'po_approved',
                  'PO ' || v_po.po_number || ' has been fully approved',
                  p_po_id, 'purchase_order');
        END IF;

        INSERT INTO activity_log (entity_type, entity_id, module, action, performer_name, severity)
        VALUES ('purchase_order', p_po_id, 'purchase_orders',
                CASE WHEN p_action LIKE 'force%' THEN 'PO Fully Approved (Force)' ELSE 'PO Fully Approved' END,
                p_approver_name,
                (CASE WHEN p_action LIKE 'force%' THEN 'critical' ELSE 'info' END)::audit_severity);
      END IF;
    END IF;
  END;

  SELECT status INTO v_po FROM purchase_orders WHERE id = p_po_id;
  RETURN jsonb_build_object(
    'ok', true, 'po_status', v_po.status,
    'action', p_action, 'roles', to_jsonb(v_approved_roles)
  );
END;
$$;


--
-- Name: po_line_items_invalidate_parent_pdf_fn(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: purchase_orders_invalidate_pdf_cache_fn(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: reason_list_categories_no_orphan_delete(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: reason_lists_category_must_exist(); Type: FUNCTION; Schema: public; Owner: -
--

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

  UPDATE inventory_item_brand_variants
  SET average_cost = COALESCE(v_avg, 0),
      updated_at   = now()
  WHERE id = p_bv_id;
END;
$$;


--
-- Name: recalculate_ar_invoice_payment_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_ar_invoice_payment_status(p_invoice_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_total NUMERIC;
  v_paid  NUMERIC;
  v_new   public.invoice_payment_status;
BEGIN
  SELECT total_amount INTO v_total FROM so_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid  -- FIX: was COALESCE(amount_qar, amount)
  FROM   payments
  WHERE  (
           (source_type = 'invoice' AND source_id = p_invoice_id)
           OR invoice_id = p_invoice_id
         )
    AND  deleted_at IS NULL
    AND  direction  = 'incoming';

  v_new := CASE
    WHEN COALESCE(v_total, 0) > 0 AND v_paid >= v_total THEN 'paid'
    WHEN v_paid > 0                                     THEN 'partially_paid'
    ELSE                                                     'unpaid'
  END;

  UPDATE so_invoices
  SET    paid_amount    = v_paid,
         payment_status = v_new
  WHERE  id = p_invoice_id;
END;
$$;


--
-- Name: receival_items_invalidate_parent_pdf_fn(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: receivals_invalidate_check_pdf_fn(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: receive_transfer(uuid, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.receive_transfer(p_transfer_id uuid, p_received_by_profile_id uuid, p_received_by_name text, p_received_items jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_transfer      RECORD;
  v_ri            JSONB;
  v_item          RECORD;
  v_move          RECORD;
  v_dispatched    NUMERIC;
  v_received_qty  INT;
  v_shrinkage_reason text;
  v_remaining_recv NUMERIC;
  v_total_dispatched NUMERIC;
  v_total_shrinkage  NUMERIC;
  v_take          NUMERIC;
  v_miss          NUMERIC;
  v_dest_date     DATE;
BEGIN
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         dispatched_by_profile_id,
         from_sub_container_id, to_sub_container_id
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

  IF NOT is_field_rp_of(p_received_by_profile_id, v_transfer.to_warehouse_id)
     AND NOT has_inventory_manager_role(p_received_by_profile_id) THEN
    RAISE EXCEPTION 'User is not authorized to receive at this warehouse';
  END IF;

  IF v_transfer.dispatched_by_profile_id = p_received_by_profile_id
     AND NOT has_inventory_manager_role(p_received_by_profile_id) THEN
    RAISE EXCEPTION 'Same person cannot dispatch and receive a transfer';
  END IF;

  UPDATE warehouse_transfers
  SET status = 'received',
      received_by_profile_id = p_received_by_profile_id,
      received_by_name = p_received_by_name,
      received_at = now()
  WHERE id = p_transfer_id;

  v_dest_date := COALESCE(v_transfer.date, CURRENT_DATE);

  FOR v_ri IN SELECT * FROM jsonb_array_elements(p_received_items)
  LOOP
    SELECT * INTO v_item
    FROM warehouse_transfer_items
    WHERE id = (v_ri->>'transfer_item_id')::UUID
      AND transfer_id = p_transfer_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    v_received_qty     := COALESCE((v_ri->>'received_qty')::INT, v_item.dispatched_qty);
    v_shrinkage_reason := COALESCE(v_ri->>'shrinkage_reason', 'missing');
    v_dispatched       := COALESCE(v_item.dispatched_qty, 0);

    -- Sum total dispatched across all transfer_out movements for this
    -- (transfer, variant). Used to compute the per-item shrinkage flag +
    -- clamp over-receipt.
    SELECT COALESCE(SUM(ABS(qty)), 0)
    INTO v_total_dispatched
    FROM inventory_stock_movements
    WHERE reference_id = p_transfer_id
      AND brand_variant_id = v_item.brand_variant_id
      AND movement_type = 'transfer_out';

    -- Clamp over-receipt (matches the current "GREATEST(v_shrinkage, 0)"
    -- behaviour: extra units above dispatched are silently dropped).
    IF v_received_qty > v_total_dispatched THEN
      v_received_qty := v_total_dispatched::INT;
    END IF;

    v_total_shrinkage := GREATEST(v_total_dispatched - v_received_qty, 0);

    -- Item-level bookkeeping (once per item, not per layer). Flip
    -- sub_container_id to the destination — the source→destination handoff.
    UPDATE warehouse_transfer_items
    SET received_qty = v_received_qty,
        shrinkage_qty = v_total_shrinkage::INT,
        shrinkage_reason = CASE WHEN v_total_shrinkage > 0 THEN v_shrinkage_reason ELSE NULL END,
        sub_container_id = v_transfer.to_sub_container_id
    WHERE id = v_item.id;

    v_remaining_recv := v_received_qty;

    -- Walk the dispatch-side movements in insertion order (= FIFO source
    -- order). Split each into "received portion → dest layer + transfer_in"
    -- and "missing portion → transfer_shrinkage".
    FOR v_move IN
      SELECT id, qty, unit_cost
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out'
      ORDER BY created_at ASC, id ASC
    LOOP
      -- movement.qty is negative on transfer_out; the dispatched qty
      -- for this layer is ABS(qty).
      v_dispatched := ABS(v_move.qty);

      v_take := LEAST(v_remaining_recv, v_dispatched);
      v_miss := v_dispatched - v_take;

      IF v_take > 0 THEN
        -- Destination layer at the source layer's exact unit_cost.
        INSERT INTO fifo_cost_layers (
          brand_variant_id, warehouse_id, date,
          qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
          sub_container_id
        ) VALUES (
          v_item.brand_variant_id, v_transfer.to_warehouse_id, v_dest_date,
          v_take, v_move.unit_cost, 0, v_move.unit_cost, v_take,
          v_transfer.to_sub_container_id
        );

        INSERT INTO inventory_stock_movements (
          warehouse_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost, reference_type, reference_id,
          sub_container_id
        ) VALUES (
          v_transfer.to_warehouse_id, v_item.brand_variant_id,
          v_item.item_name, v_item.sku,
          'transfer_in', v_take, v_move.unit_cost,
          'transfer', p_transfer_id,
          v_transfer.to_sub_container_id
        );
      END IF;

      IF v_miss > 0 THEN
        -- Shrinkage movement records the loss on the SOURCE side, so it
        -- carries the source sub_container_id.
        INSERT INTO inventory_stock_movements (
          warehouse_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost, reference_type, reference_id, notes,
          sub_container_id
        ) VALUES (
          v_transfer.from_warehouse_id, v_item.brand_variant_id,
          v_item.item_name, v_item.sku,
          'transfer_shrinkage', -v_miss, v_move.unit_cost,
          'transfer', p_transfer_id,
          'Shrinkage: ' || v_shrinkage_reason,
          v_transfer.from_sub_container_id
        );
      END IF;

      v_remaining_recv := v_remaining_recv - v_take;
    END LOOP;
  END LOOP;
END;
$$;


--
-- Name: refresh_all_stock_summaries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_all_stock_summaries() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  TRUNCATE warehouse_stock_summary;

  INSERT INTO warehouse_stock_summary (
    warehouse_id, sub_container_id, brand_variant_id,
    item_name, brand, sku, unit,
    qty, avg_cost, total_value,
    category_name, subcategory_name, item_type,
    allocated_qty, available_qty, updated_at
  )
  SELECT
    f.warehouse_id,
    f.sub_container_id,
    f.brand_variant_id,
    ii.name_en,
    ibv.brand,
    ii.sku,
    ii.unit,
    SUM(f.remaining_qty)::integer,
    CASE WHEN SUM(f.remaining_qty) > 0
      THEN SUM(f.remaining_qty::numeric * f.total_unit_cost)
           / SUM(f.remaining_qty)::numeric
      ELSE 0
    END,
    SUM(f.remaining_qty::numeric * f.total_unit_cost),
    COALESCE(ic_parent.name_en, ic.name_en),
    CASE WHEN ic_parent.id IS NOT NULL THEN ic.name_en END,
    COALESCE(ic.type, ic_parent.type)::text,
    COALESCE(wsa.allocated_qty, 0),
    GREATEST(SUM(f.remaining_qty)::integer - COALESCE(wsa.allocated_qty, 0), 0),
    now()
  FROM fifo_cost_layers f
  JOIN inventory_item_brand_variants ibv ON ibv.id = f.brand_variant_id
  JOIN inventory_items ii ON ii.id = ibv.item_id
  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
  LEFT JOIN inventory_categories ic_parent ON ic_parent.id = ic.parent_id
  LEFT JOIN warehouse_stock_allocations wsa
    ON wsa.warehouse_id     = f.warehouse_id
   AND wsa.sub_container_id = f.sub_container_id
   AND wsa.brand_variant_id = f.brand_variant_id
  WHERE f.remaining_qty     > 0
    AND f.warehouse_id     IS NOT NULL
    AND f.sub_container_id IS NOT NULL
  GROUP BY
    f.warehouse_id, f.sub_container_id, f.brand_variant_id,
    ii.name_en, ibv.brand, ii.sku, ii.unit,
    ic.name_en, ic.type, ic_parent.id, ic_parent.name_en, ic_parent.type,
    wsa.allocated_qty;
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
-- Name: refresh_stock_summary_row(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_stock_summary_row(p_warehouse_id uuid, p_brand_variant_id uuid, p_sub_container_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_qty         integer;
  v_avg_cost    numeric;
  v_total_value numeric;
  v_alloc       integer;
  v_item_name   text;
  v_brand       text;
  v_sku         text;
  v_unit        text;
  v_category    text;
  v_subcategory text;
  v_item_type   text;
BEGIN
  IF p_warehouse_id IS NULL OR p_sub_container_id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(remaining_qty), 0)::integer,
    CASE WHEN SUM(remaining_qty) > 0
      THEN SUM(remaining_qty::numeric * total_unit_cost)
           / SUM(remaining_qty)::numeric
      ELSE 0
    END,
    COALESCE(SUM(remaining_qty::numeric * total_unit_cost), 0)
  INTO v_qty, v_avg_cost, v_total_value
  FROM fifo_cost_layers
  WHERE warehouse_id     = p_warehouse_id
    AND sub_container_id = p_sub_container_id
    AND brand_variant_id = p_brand_variant_id
    AND remaining_qty    > 0;

  SELECT COALESCE(allocated_qty, 0)
  INTO v_alloc
  FROM warehouse_stock_allocations
  WHERE warehouse_id     = p_warehouse_id
    AND sub_container_id = p_sub_container_id
    AND brand_variant_id = p_brand_variant_id;

  v_alloc := COALESCE(v_alloc, 0);

  IF v_qty = 0 AND v_alloc = 0 THEN
    DELETE FROM warehouse_stock_summary
    WHERE warehouse_id     = p_warehouse_id
      AND sub_container_id = p_sub_container_id
      AND brand_variant_id = p_brand_variant_id;
    RETURN;
  END IF;

  SELECT
    ii.name_en,
    ibv.brand,
    ii.sku,
    ii.unit,
    COALESCE(ic_parent.name_en, ic.name_en),
    CASE WHEN ic_parent.id IS NOT NULL THEN ic.name_en END,
    COALESCE(ic.type, ic_parent.type)::text
  INTO v_item_name, v_brand, v_sku, v_unit,
       v_category, v_subcategory, v_item_type
  FROM inventory_item_brand_variants ibv
  JOIN inventory_items ii ON ii.id = ibv.item_id
  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
  LEFT JOIN inventory_categories ic_parent ON ic_parent.id = ic.parent_id
  WHERE ibv.id = p_brand_variant_id;

  INSERT INTO warehouse_stock_summary (
    warehouse_id, sub_container_id, brand_variant_id,
    item_name, brand, sku, unit,
    qty, avg_cost, total_value,
    category_name, subcategory_name, item_type,
    allocated_qty, available_qty, updated_at
  ) VALUES (
    p_warehouse_id, p_sub_container_id, p_brand_variant_id,
    v_item_name, v_brand, v_sku, v_unit,
    v_qty, v_avg_cost, v_total_value,
    v_category, v_subcategory, v_item_type,
    v_alloc, GREATEST(v_qty - v_alloc, 0), now()
  )
  ON CONFLICT (warehouse_id, sub_container_id, brand_variant_id) DO UPDATE SET
    item_name        = EXCLUDED.item_name,
    brand            = EXCLUDED.brand,
    sku              = EXCLUDED.sku,
    unit             = EXCLUDED.unit,
    qty              = EXCLUDED.qty,
    avg_cost         = EXCLUDED.avg_cost,
    total_value      = EXCLUDED.total_value,
    category_name    = EXCLUDED.category_name,
    subcategory_name = EXCLUDED.subcategory_name,
    item_type        = EXCLUDED.item_type,
    allocated_qty    = EXCLUDED.allocated_qty,
    available_qty    = EXCLUDED.available_qty,
    updated_at       = EXCLUDED.updated_at;
END;
$$;


--
-- Name: reject_credit_group_change(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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
  FROM   user_data WHERE auth_user_id = auth.uid();
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

  UPDATE customer_credit_group_approvals
  SET    status          = 'rejected',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         decided_at      = now(),
         reason          = p_reason
  WHERE  id = p_approval_id;

  UPDATE customer_credit_group_approvals
  SET    status    = 'rejected',
         reason    = 'Cancelled — sibling step rejected',
         is_active = false
  WHERE  request_id = v_row.request_id
    AND  iteration  = v_row.iteration
    AND  status     = 'pending'
    AND  id        <> p_approval_id;

  SELECT * INTO v_request FROM customer_credit_group_requests
    WHERE id = v_row.request_id FOR UPDATE;

  UPDATE customer_credit_group_requests
     SET status     = 'rejected',
         decided_by = v_profile_id,
         decided_at = now()
   WHERE id = v_request.id;

  -- Unblock customer (if they were blocked for pending approval)
  UPDATE customers
     SET block_reason = NULL
   WHERE id = v_request.customer_id
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


--
-- Name: reject_sales_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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
  FROM   user_data WHERE auth_user_id = auth.uid();
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


--
-- Name: reject_transfer_v2(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_transfer_v2(p_transfer_id uuid, p_rejected_by_profile_id uuid, p_rejected_by_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_transfer RECORD;
  v_item     RECORD;
  v_avg_cost NUMERIC;
BEGIN
  SELECT id, from_warehouse_id, to_warehouse_id, status, date,
         from_sub_container_id
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status NOT IN ('pending', 'in_transit') THEN
    RAISE EXCEPTION 'Transfer % cannot be rejected — current status: %',
      p_transfer_id, v_transfer.status;
  END IF;

  UPDATE warehouse_transfers
  SET status = 'rejected',
      approved_by_profile_id = p_rejected_by_profile_id,
      approved_by_name = p_rejected_by_name,
      approved_date = CURRENT_DATE
  WHERE id = p_transfer_id;

  FOR v_item IN
    SELECT * FROM warehouse_transfer_items
    WHERE transfer_id = p_transfer_id
    ORDER BY brand_variant_id
  LOOP
    IF v_transfer.status = 'pending' THEN
      UPDATE warehouse_stock_allocations
      SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
          updated_at = now()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND brand_variant_id = v_item.brand_variant_id
        AND sub_container_id = v_transfer.from_sub_container_id;

    ELSIF v_transfer.status = 'in_transit' THEN
      SELECT ABS(unit_cost) INTO v_avg_cost
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out'
      LIMIT 1;

      v_avg_cost := COALESCE(v_avg_cost, v_item.unit_cost);

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        sub_container_id
      ) VALUES (
        v_item.brand_variant_id, v_transfer.from_warehouse_id,
        CURRENT_DATE,
        v_item.requested_qty, v_avg_cost, 0, v_avg_cost, v_item.requested_qty,
        v_transfer.from_sub_container_id
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_in', v_item.requested_qty, v_avg_cost,
        'transfer', p_transfer_id,
        'Transfer rejected — stock returned',
        v_transfer.from_sub_container_id
      );
    END IF;
  END LOOP;
END;
$$;


--
-- Name: remove_tool_placeholders_on_layer_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_tool_placeholders_on_layer_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ri_id       uuid;
  v_receival_id uuid;
BEGIN
  IF OLD.source_type <> 'receival' THEN RETURN OLD; END IF;

  BEGIN
    v_receival_id := OLD.receival_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN OLD;
  END;

  IF v_receival_id IS NULL THEN RETURN OLD; END IF;

  SELECT ri.id INTO v_ri_id
  FROM receival_items ri
  WHERE ri.receival_id = v_receival_id
    AND ri.brand_variant_id = OLD.brand_variant_id
  LIMIT 1;

  IF v_ri_id IS NULL THEN RETURN OLD; END IF;

  DELETE FROM tool_asset_units
  WHERE receival_item_id = v_ri_id
    AND is_placeholder    = true;

  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RETURN OLD;
END;
$$;


--
-- Name: rename_payment_method(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

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
-- Name: replace_warehouse_responsible_persons(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.replace_warehouse_responsible_persons(p_warehouse_id uuid, p_profile_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.warehouse_responsible_persons WHERE warehouse_id = p_warehouse_id;
  IF p_profile_ids IS NOT NULL AND array_length(p_profile_ids, 1) IS NOT NULL THEN
    INSERT INTO public.warehouse_responsible_persons (warehouse_id, profile_id)
    SELECT p_warehouse_id, unnest(p_profile_ids);
  END IF;
END;
$$;


--
-- Name: resolve_category_sub_container(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_category_sub_container(p_category_id uuid) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, default_sub_container_id, 0 AS depth
      FROM public.inventory_categories
     WHERE id = p_category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.default_sub_container_id, chain.depth + 1
      FROM public.inventory_categories c
      JOIN chain ON chain.parent_id = c.id
     WHERE chain.depth < 32
  )
  SELECT default_sub_container_id
    FROM chain
   WHERE default_sub_container_id IS NOT NULL
   ORDER BY depth ASC
   LIMIT 1;
$$;


--
-- Name: resolve_warranty_division_slug(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_warranty_division_slug(p_division_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_short_name text;
  v_name       text;
  v_words      text[];
  v_first      text;
  v_second     text;
BEGIN
  SELECT short_name, name
  INTO   v_short_name, v_name
  FROM   public.company_divisions
  WHERE  id = p_division_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Division % not found', p_division_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_short_name IS NOT NULL AND btrim(v_short_name) <> '' THEN
    RETURN upper(btrim(v_short_name));
  END IF;

  IF v_name IS NULL OR btrim(v_name) = '' THEN
    RAISE EXCEPTION 'Division % has no short_name and no name — cannot build warranty slug', p_division_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_words := regexp_split_to_array(btrim(v_name), '\s+');

  -- Collapse 'Al Faytri X' → treat 'AlFaytri' as one word so the rule
  -- still produces 'AFM' from 'Al Faytri Maintenance'.
  IF array_length(v_words, 1) >= 3 AND lower(v_words[1]) = 'al' THEN
    v_words := ARRAY[v_words[1] || v_words[2]] || v_words[3:array_length(v_words, 1)];
  END IF;

  IF array_length(v_words, 1) < 2 THEN
    RAISE EXCEPTION 'Division % name "%" has no second word — set short_name on this division', p_division_id, v_name
      USING ERRCODE = 'check_violation';
  END IF;

  v_first  := v_words[1];
  v_second := v_words[2];

  IF length(v_second) <= 3 THEN
    RETURN upper(substring(v_first FROM 1 FOR 1) || v_second);
  ELSE
    RETURN upper(substring(v_first FROM 1 FOR 2) || substring(v_second FROM 1 FOR 1));
  END IF;
END;
$$;


--
-- Name: resubmit_sale_order(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  SELECT * INTO v_so FROM sale_orders WHERE id = p_so_id;
  IF NOT FOUND OR v_so.status <> 'quotation' THEN
    RAISE EXCEPTION 'SO not resubmittable';
  END IF;

  -- customer_type column was dropped (20260724170001); credit vs cash is now
  -- derived from credit_group_id IS NULL. credit_limit IS NOT NULL implies a
  -- credit customer, so the check below is sufficient.
  SELECT cg.credit_limit
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

  IF v_customer.credit_limit IS NOT NULL THEN
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
      AND unit_cost      > 0;
  END IF;

  -- ── COGS side: insert reversing rows ──────────────────────────────────────
  INSERT INTO cogs_entries (
    brand_variant_id, sale_delivery_id, sale_order_id, landed_cost_id,
    qty, unit_cost, total_cost, date, notes, source_type
  )
  SELECT
    brand_variant_id, NULL, NULL, p_lc_id,
    -qty, unit_cost, -total_cost, v_now::DATE,
    'Reversal of LC ' || v_lc.lc_number || ' — reverted by ' || p_performer_name,
    'landed_cost_reversal'
  FROM cogs_entries
  WHERE landed_cost_id = p_lc_id
    AND total_cost     > 0;

  -- ── Delete allocation rows from normalized table ──────────────────────────
  DELETE FROM landed_cost_item_allocations WHERE landed_cost_id = p_lc_id;

  -- ── Reset the LC ──────────────────────────────────────────────────────────
  UPDATE landed_costs
     SET applied_at       = NULL,
         all_items_sold   = FALSE,
         revert_snapshot  = NULL,
         updated_at       = v_now
   WHERE id = p_lc_id;
END;
$$;


--
-- Name: rpc_accept_custody_assign(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_accept_custody_assign(p_transfer_id uuid, p_accepted_by_profile_id uuid DEFAULT NULL::uuid, p_accepted_by_name text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_transfer         RECORD;
  v_dest_responsible uuid;
  v_dest_responsible_name text;
  v_uid              uuid := public._current_user_data_id();
  v_accepter         uuid := COALESCE(p_accepted_by_profile_id, v_uid);
  v_item             RECORD;
  v_touched_variants uuid[] := '{}';
  v_variant          uuid;
BEGIN
  IF v_accepter IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to accept a custody assignment.';
  END IF;

  SELECT id, transfer_kind, status, to_warehouse_id, to_sub_container_id,
         from_warehouse_id, from_sub_container_id
    INTO v_transfer
    FROM public.warehouse_transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This custody assignment no longer exists.';
  END IF;
  IF v_transfer.transfer_kind <> 'custody_assign' THEN
    RAISE EXCEPTION 'This transfer is not a custody assignment and cannot be accepted here.';
  END IF;
  IF v_transfer.status <> 'in_transit' THEN
    RAISE EXCEPTION 'This custody assignment is already % — it can no longer be accepted.', v_transfer.status;
  END IF;

  -- Permission: destination sub's responsible person, inventory_manager,
  -- or a system admin (Owner / Admin roles).
  SELECT sc.responsible_person_profile_id, u.full_name
    INTO v_dest_responsible, v_dest_responsible_name
    FROM public.warehouse_sub_containers sc
    LEFT JOIN public.user_data u ON u.id = sc.responsible_person_profile_id
    WHERE sc.id = v_transfer.to_sub_container_id;

  IF v_dest_responsible IS DISTINCT FROM v_accepter
     AND NOT public._has_custody_admin_role(v_accepter) THEN
    IF v_dest_responsible IS NULL THEN
      RAISE EXCEPTION 'This custody sub-container has no responsible person set. Ask an inventory manager or an admin to accept it, or assign one in Master Data.';
    ELSE
      RAISE EXCEPTION 'Only % can accept this custody assignment.', v_dest_responsible_name;
    END IF;
  END IF;

  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, requested_qty, unit_cost
    FROM   public.warehouse_transfer_items
    WHERE  transfer_id = p_transfer_id
    ORDER  BY brand_variant_id
  LOOP
    IF COALESCE(v_item.requested_qty, 0) <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id, sub_container_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type, source_id
    ) VALUES (
      v_item.brand_variant_id, v_transfer.to_warehouse_id, v_transfer.to_sub_container_id, current_date,
      v_item.requested_qty, v_item.unit_cost, 0, v_item.unit_cost, v_item.requested_qty,
      'custody_assign', p_transfer_id
    );

    INSERT INTO public.inventory_stock_movements (
      warehouse_id, sub_container_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    ) VALUES (
      v_transfer.to_warehouse_id, v_transfer.to_sub_container_id, v_item.brand_variant_id,
      COALESCE(v_item.item_name, ''), v_item.sku,
      'transfer_in', v_item.requested_qty, v_item.unit_cost,
      'transfer', p_transfer_id
    );

    UPDATE public.warehouse_transfer_items
       SET received_qty = v_item.requested_qty
     WHERE id = v_item.id;

    v_touched_variants := v_touched_variants || v_item.brand_variant_id;
  END LOOP;

  UPDATE public.warehouse_transfers
     SET status                    = 'received',
         received_by_profile_id    = v_accepter,
         received_by_name          = p_accepted_by_name,
         received_at               = now()
   WHERE id = p_transfer_id;

  SELECT ARRAY(SELECT DISTINCT unnest(v_touched_variants)) INTO v_touched_variants;
  FOREACH v_variant IN ARRAY v_touched_variants LOOP
    PERFORM public.recalc_average_cost(v_variant);
  END LOOP;
END;
$$;


--
-- Name: rpc_attribute_picker_step(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_attribute_picker_step(p_category_id uuid, p_picks jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_result           jsonb;
  v_candidate_ids    uuid[];
  v_next_def_id      uuid;
  v_next_def_key     text;
  v_next_def_label_en text;
  v_next_def_label_ar text;
BEGIN
  WITH RECURSIVE subtree AS (
    SELECT id FROM inventory_categories WHERE id = p_category_id
    UNION ALL
    SELECT c.id FROM inventory_categories c JOIN subtree s ON c.parent_id = s.id
  ),
  ancestors AS (
    SELECT c.parent_id AS ancestor_id, 1 AS depth
    FROM inventory_categories c WHERE c.id = p_category_id
    UNION ALL
    SELECT c.parent_id, a.depth + 1
    FROM inventory_categories c JOIN ancestors a ON c.id = a.ancestor_id
    WHERE a.depth < 10 AND c.parent_id IS NOT NULL
  ),
  relevant_categories AS (
    SELECT id FROM subtree
    UNION
    SELECT ancestor_id FROM ancestors WHERE ancestor_id IS NOT NULL
  ),
  base_items AS (
    SELECT i.id FROM inventory_items i WHERE i.category_id IN (SELECT id FROM subtree)
  ),
  matching_items AS (
    SELECT bi.id
    FROM base_items bi
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_each_text(p_picks) pick(k, v)
      JOIN inventory_attribute_definitions def
        ON def.attribute_key = pick.k
       AND def.category_id IN (SELECT id FROM relevant_categories)
      JOIN inventory_item_attributes ia
        ON ia.item_id = bi.id
       AND ia.definition_id = def.id
      WHERE ia.option_id::text <> pick.v
    )
  )
  SELECT array_agg(id) INTO v_candidate_ids FROM matching_items;

  IF v_candidate_ids IS NULL THEN v_candidate_ids := ARRAY[]::uuid[]; END IF;

  IF COALESCE(array_length(v_candidate_ids, 1), 0) > 1 THEN
    -- get_effective_attributes returns the column as `definition_id`, not `id`.
    SELECT definition_id, attribute_key, label_en, label_ar
    INTO v_next_def_id, v_next_def_key, v_next_def_label_en, v_next_def_label_ar
    FROM get_effective_attributes(p_category_id)
    WHERE NOT (p_picks ? attribute_key)
    ORDER BY sort_order ASC
    LIMIT 1;
  END IF;

  v_result := jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name_en', i.name_en,
        'name_ar', i.name_ar,
        'sku', i.sku,
        'image_url', i.image_url,
        'brand_variants', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', bv.id,
            'brand', bv.brand,
            'code', bv.code,
            'stock_level', bv.stock_level
          ) ORDER BY bv.brand)
          FROM inventory_item_brand_variants bv
          WHERE bv.item_id = i.id AND bv.status = 'active'
        ), '[]'::jsonb)
      ) ORDER BY i.name_en)
      FROM inventory_items i
      WHERE i.id = ANY(v_candidate_ids)
    ), '[]'::jsonb),
    'next_attribute', CASE WHEN v_next_def_id IS NOT NULL THEN jsonb_build_object(
      'id', v_next_def_id,
      'key', v_next_def_key,
      'label_en', v_next_def_label_en,
      'label_ar', v_next_def_label_ar
    ) ELSE null END,
    'next_options', CASE WHEN v_next_def_id IS NULL THEN '[]'::jsonb ELSE (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', o.id,
        'value_en', o.value_en,
        'value_ar', o.value_ar,
        'item_count', (
          SELECT count(*) FROM inventory_item_attributes ia
          WHERE ia.definition_id = v_next_def_id
            AND ia.option_id = o.id
            AND ia.item_id = ANY(v_candidate_ids)
        )
      ) ORDER BY o.sort_order), '[]'::jsonb)
      FROM inventory_attribute_options o
      WHERE o.definition_id = v_next_def_id
        AND NOT o.is_archived
        AND EXISTS (
          SELECT 1 FROM inventory_item_attributes ia
          WHERE ia.definition_id = v_next_def_id
            AND ia.option_id = o.id
            AND ia.item_id = ANY(v_candidate_ids)
        )
    ) END
  );

  RETURN v_result;
END;
$$;


--
-- Name: rpc_cancel_consumption(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_cancel_consumption(p_consumption_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ce                RECORD;
  v_cogs              RECORD;
  v_sub_container_id  uuid;
  v_uid               uuid := public._current_user_data_id();
  v_touched_variants  uuid[] := '{}';
  v_variant           uuid;
BEGIN
  SELECT id, status, source_warehouse_id, source_sub_container_id, ce_number, division_id
    INTO v_ce
    FROM public.consumption_entries
    WHERE id = p_consumption_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_cancel_consumption: consumption % not found', p_consumption_id;
  END IF;
  IF v_ce.status <> 'posted' THEN
    RAISE EXCEPTION 'rpc_cancel_consumption: consumption % is % (expected posted)', p_consumption_id, v_ce.status;
  END IF;

  -- Restore each drained layer to its original sub-container. When the
  -- original layer is still present, we insert a compensating layer at
  -- the same unit_cost + sub_container (mirrors cancel_delivery_inventory).
  FOR v_cogs IN
    SELECT brand_variant_id, qty, unit_cost, source_id
    FROM   public.cogs_entries
    WHERE  consumption_id = p_consumption_id
  LOOP
    v_sub_container_id := NULL;
    IF v_cogs.source_id IS NOT NULL THEN
      SELECT sub_container_id INTO v_sub_container_id
      FROM   public.fifo_cost_layers
      WHERE  id = v_cogs.source_id;
    END IF;

    -- Fallback: original layer purged. Land the restore on the consumption's
    -- own source sub-container (best available guess).
    IF v_sub_container_id IS NULL THEN
      v_sub_container_id := v_ce.source_sub_container_id;
    END IF;

    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id, sub_container_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type, source_id
    ) VALUES (
      v_cogs.brand_variant_id, v_ce.source_warehouse_id, v_sub_container_id, current_date,
      v_cogs.qty, v_cogs.unit_cost, 0, v_cogs.unit_cost, v_cogs.qty,
      'consumption_cancel', p_consumption_id
    );

    v_touched_variants := v_touched_variants || v_cogs.brand_variant_id;
  END LOOP;

  DELETE FROM public.inventory_stock_movements
   WHERE reference_type = 'consumption'
     AND reference_id   = p_consumption_id;

  DELETE FROM public.cogs_entries
   WHERE consumption_id = p_consumption_id;

  -- Recompute weighted average cost per touched variant.
  SELECT ARRAY(SELECT DISTINCT unnest(v_touched_variants)) INTO v_touched_variants;
  FOREACH v_variant IN ARRAY v_touched_variants LOOP
    PERFORM public.recalc_average_cost(v_variant);
  END LOOP;

  UPDATE public.consumption_entries
     SET status = 'cancelled',
         cancelled_by = v_uid,
         cancelled_at = now()
   WHERE id = p_consumption_id;
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
  v_line    RECORD;
  v_bv_id   UUID;
BEGIN
  SELECT id, restock_warehouse_id, dispatched_at
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NULL THEN
    RETURN;
  END IF;

  FOR v_line IN
    SELECT brand_variant_id, item_name, sku, qty
    FROM return_lines
    WHERE return_id = p_return_id
  LOOP
    v_bv_id := v_line.brand_variant_id;

    IF v_bv_id IS NULL OR v_line.qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE inventory_item_brand_variants
    SET    stock_level = stock_level + v_line.qty
    WHERE  id = v_bv_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes
    ) VALUES (
      v_return.restock_warehouse_id,
      v_bv_id,
      v_line.item_name,
      NULLIF(v_line.sku, ''),
      'purchase_return_cancelled',
      v_line.qty,
      0,
      'po_return',
      p_return_id,
      'PO return cancelled — stock restored'
    );
  END LOOP;

  UPDATE so_po_returns SET dispatched_at = NULL WHERE id = p_return_id;
END;
$$;


--
-- Name: rpc_close_return(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_close_return(p_return_id uuid, p_resolution text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_new_status public.return_status;
  v_credit_note_id uuid;
begin
  if p_resolution not in ('refund', 'replacement', 'store_credit', 'partial') then
    raise exception 'rpc_close_return: invalid resolution %', p_resolution;
  end if;

  v_new_status := case p_resolution
    when 'refund'        then 'resolved_credit'
    when 'store_credit'  then 'resolved_credit'
    when 'replacement'   then 'resolved_replacement'
    when 'partial'       then 'resolved_partial'
  end::public.return_status;

  update public.so_po_returns
    set status = v_new_status,
        updated_at = now()
    where id = p_return_id
      and status = 'restocked'
    returning credit_note_id into v_credit_note_id;

  if not found then
    raise exception 'rpc_close_return: return % is not in restocked status (or does not exist)', p_return_id;
  end if;

  if v_credit_note_id is not null and p_resolution <> 'partial' then
    update public.credit_notes
      set resolution_type = p_resolution::public.credit_note_resolution_type
      where id = v_credit_note_id;
  end if;
end;
$$;


--
-- Name: rpc_complete_return_inspection(uuid, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_complete_return_inspection(p_return_id uuid, p_splits jsonb, p_restock_warehouse_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_return         RECORD;
  v_split          RECORD;
  v_line           RECORD;
  v_seen_lines     UUID[] := ARRAY[]::UUID[];
  v_pending_insp   INT;
BEGIN
  SELECT id, status, return_number, division_id
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.status <> 'pending_inspection' THEN
    RAISE EXCEPTION 'Return % must be status=pending_inspection to complete inspection (got %)',
      v_return.return_number, v_return.status;
  END IF;

  IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' OR jsonb_array_length(p_splits) = 0 THEN
    RAISE EXCEPTION 'p_splits must be a non-empty JSON array';
  END IF;

  FOR v_split IN
    SELECT
      (elem->>'return_line_id')::uuid   AS line_id,
      COALESCE((elem->>'good_qty')::int, 0)     AS good_qty,
      COALESCE((elem->>'damaged_qty')::int, 0)  AS damaged_qty,
      NULLIF(elem->>'condition_notes', '')      AS condition_notes
    FROM jsonb_array_elements(p_splits) AS elem
  LOOP
    SELECT * INTO v_line
    FROM   return_lines
    WHERE  id = v_split.line_id
      AND  return_id = p_return_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Return line % not found on return %', v_split.line_id, v_return.return_number;
    END IF;

    IF v_line.condition <> 'inspection' THEN
      RAISE EXCEPTION 'Return line % is not an inspection line (condition=%)',
        v_line.id, v_line.condition;
    END IF;

    IF v_split.good_qty < 0 OR v_split.damaged_qty < 0 THEN
      RAISE EXCEPTION 'Return line %: good_qty and damaged_qty must be non-negative', v_line.id;
    END IF;

    IF (v_split.good_qty + v_split.damaged_qty) <> v_line.qty THEN
      RAISE EXCEPTION 'Return line %: good_qty (%) + damaged_qty (%) must equal original qty (%)',
        v_line.id, v_split.good_qty, v_split.damaged_qty, v_line.qty;
    END IF;

    v_seen_lines := array_append(v_seen_lines, v_line.id);

    IF v_split.good_qty > 0 THEN
      INSERT INTO return_lines (
        return_id, brand_variant_id, item_name, sku,
        qty, condition, condition_notes,
        sale_delivery_line_id, receival_item_id
      ) VALUES (
        p_return_id, v_line.brand_variant_id, v_line.item_name, v_line.sku,
        v_split.good_qty, 'good', NULL,
        v_line.sale_delivery_line_id, v_line.receival_item_id
      );
    END IF;

    IF v_split.damaged_qty > 0 THEN
      INSERT INTO return_lines (
        return_id, brand_variant_id, item_name, sku,
        qty, condition, condition_notes,
        sale_delivery_line_id, receival_item_id
      ) VALUES (
        p_return_id, v_line.brand_variant_id, v_line.item_name, v_line.sku,
        v_split.damaged_qty, 'damaged',
        COALESCE(v_split.condition_notes, v_line.condition_notes),
        v_line.sale_delivery_line_id, v_line.receival_item_id
      );
    END IF;

    DELETE FROM return_lines WHERE id = v_line.id;
  END LOOP;

  SELECT COUNT(*)
  INTO   v_pending_insp
  FROM   return_lines
  WHERE  return_id = p_return_id
    AND  condition = 'inspection';

  IF v_pending_insp > 0 THEN
    RAISE EXCEPTION 'Return % still has % inspection line(s) not covered by the splits',
      v_return.return_number, v_pending_insp;
  END IF;

  UPDATE so_po_returns
  SET    restock_warehouse_id = p_restock_warehouse_id,
         status               = 'received',
         updated_at           = now()
  WHERE  id = p_return_id;
END;
$$;


--
-- Name: rpc_create_custody_assign(uuid, uuid, uuid, jsonb, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_create_custody_assign(p_source_warehouse_id uuid, p_source_sub_container_id uuid, p_dest_sub_container_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text, p_created_by_profile_id uuid DEFAULT NULL::uuid, p_created_by_name text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_source_sub        RECORD;
  v_dest_sub          RECORD;
  v_dest_warehouse_id uuid;
  v_dest_responsible  uuid;
  v_transfer_id       uuid;
  v_transfer_number   text;
  v_uid               uuid := public._current_user_data_id();
  v_creator           uuid := COALESCE(p_created_by_profile_id, v_uid);
  v_item              jsonb;
  v_bv_id             uuid;
  v_qty               int;
  v_label             RECORD;
BEGIN
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to request custody stock.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one item before submitting the request.';
  END IF;

  -- Source sub sanity checks.
  SELECT sc.id, sc.warehouse_id, sc.division_id, sc.is_active, sc.name
    INTO v_source_sub
    FROM public.warehouse_sub_containers sc
    WHERE sc.id = p_source_sub_container_id;

  IF NOT FOUND OR v_source_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'The source sub-container is no longer active.';
  END IF;
  IF v_source_sub.warehouse_id <> p_source_warehouse_id THEN
    RAISE EXCEPTION 'The source sub-container does not belong to the chosen warehouse.';
  END IF;

  -- Destination sub must be an active custody sub AND have a responsible person set,
  -- OR the caller must be admin (bypass) — otherwise nobody can accept later.
  SELECT sc.id, sc.warehouse_id, sc.is_active, sc.name, w.warehouse_kind,
         sc.responsible_person_profile_id
    INTO v_dest_sub
    FROM public.warehouse_sub_containers sc
    JOIN public.warehouses w ON w.id = sc.warehouse_id
    WHERE sc.id = p_dest_sub_container_id;

  IF NOT FOUND OR v_dest_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'The destination custody sub-container is no longer active.';
  END IF;
  IF v_dest_sub.warehouse_kind NOT IN ('teams','places') THEN
    RAISE EXCEPTION 'Custody requests can only target Teams or Places, not %.', v_dest_sub.warehouse_kind;
  END IF;
  v_dest_warehouse_id := v_dest_sub.warehouse_id;
  v_dest_responsible  := v_dest_sub.responsible_person_profile_id;

  IF v_dest_warehouse_id = p_source_warehouse_id THEN
    RAISE EXCEPTION 'Source and destination warehouses must differ.';
  END IF;

  -- Permission: request must come from the destination sub's responsible
  -- person OR an admin. (Anyone-can-request would let random users trigger
  -- work for warehouse teams they have no relationship with.)
  IF v_dest_responsible IS DISTINCT FROM v_creator
     AND NOT public._has_custody_admin_role(v_creator) THEN
    RAISE EXCEPTION 'Only the responsible person of this custody sub-container (or an admin) can request stock for it.';
  END IF;

  v_transfer_number := public.generate_transfer_number();

  -- Header — status='pending'. No dispatched/received stamping yet.
  INSERT INTO public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    from_sub_container_id, to_sub_container_id,
    transfer_kind, status,
    date, notes,
    created_by_profile_id, created_by_name
  ) VALUES (
    v_transfer_number, p_source_warehouse_id, v_dest_warehouse_id,
    p_source_sub_container_id, p_dest_sub_container_id,
    'custody_assign', 'pending',
    current_date, NULLIF(p_notes, ''),
    v_creator, p_created_by_name
  )
  RETURNING id INTO v_transfer_id;

  -- Line items — requested_qty only. unit_cost stamped at dispatch time.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_bv_id := (v_item->>'brand_variant_id')::uuid;
    v_qty   := (v_item->>'qty')::int;

    IF v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'One of the request lines is missing an item or has an invalid qty.';
    END IF;

    SELECT COALESCE(ii.name_en, '')::text AS item_name,
           NULLIF(ii.sku, '')::text        AS sku
      INTO v_label
      FROM public.inventory_item_brand_variants bv
      LEFT JOIN public.inventory_items ii ON ii.id = bv.item_id
      WHERE bv.id = v_bv_id;

    INSERT INTO public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku,
      requested_qty, unit_cost, sub_container_id
    ) VALUES (
      v_transfer_id, v_bv_id, COALESCE(v_label.item_name, ''), v_label.sku,
      v_qty, 0, p_source_sub_container_id
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;


--
-- Name: rpc_create_custody_return(uuid, uuid, uuid, jsonb, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_create_custody_return(p_source_sub_container_id uuid, p_dest_warehouse_id uuid, p_dest_sub_container_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text, p_created_by_profile_id uuid DEFAULT NULL::uuid, p_created_by_name text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_source_sub               RECORD;
  v_source_responsible_name  text;
  v_dest_sub                 RECORD;
  v_transfer_id              uuid;
  v_transfer_number          text;
  v_uid                      uuid := public._current_user_data_id();
  v_creator                  uuid := COALESCE(p_created_by_profile_id, v_uid);
  v_item                     jsonb;
  v_bv_id                    uuid;
  v_qty                      int;
  v_label                    RECORD;
  v_layer                    RECORD;
  v_qty_taken_sum            int;
  v_new_item_id              uuid;
BEGIN
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to return custody stock.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one item before submitting the return.';
  END IF;

  SELECT sc.id, sc.warehouse_id, sc.is_active, sc.responsible_person_profile_id,
         w.warehouse_kind, sc.name, u.full_name AS responsible_name
    INTO v_source_sub
    FROM public.warehouse_sub_containers sc
    JOIN public.warehouses w ON w.id = sc.warehouse_id
    LEFT JOIN public.user_data u ON u.id = sc.responsible_person_profile_id
    WHERE sc.id = p_source_sub_container_id;

  IF NOT FOUND OR v_source_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'This custody sub-container is no longer active.';
  END IF;
  IF v_source_sub.warehouse_kind NOT IN ('teams','places') THEN
    RAISE EXCEPTION 'This flow only handles returns from Teams or Places — not %.', v_source_sub.warehouse_kind;
  END IF;

  v_source_responsible_name := v_source_sub.responsible_name;

  IF v_source_sub.responsible_person_profile_id IS DISTINCT FROM v_creator
     AND NOT public._has_custody_admin_role(v_creator) THEN
    IF v_source_sub.responsible_person_profile_id IS NULL THEN
      RAISE EXCEPTION 'This custody sub-container has no responsible person set. Ask an inventory manager or an admin to return the stock.';
    ELSE
      RAISE EXCEPTION 'Only % can return stock from this custody sub-container.', v_source_responsible_name;
    END IF;
  END IF;

  SELECT sc.id, sc.warehouse_id, sc.is_active, w.warehouse_kind
    INTO v_dest_sub
    FROM public.warehouse_sub_containers sc
    JOIN public.warehouses w ON w.id = sc.warehouse_id
    WHERE sc.id = p_dest_sub_container_id;

  IF NOT FOUND OR v_dest_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'The destination sub-container is no longer active.';
  END IF;
  IF v_dest_sub.warehouse_id <> p_dest_warehouse_id THEN
    RAISE EXCEPTION 'The destination sub-container does not belong to the chosen warehouse.';
  END IF;
  IF v_dest_sub.warehouse_kind IN ('teams','places') THEN
    RAISE EXCEPTION 'Returns must land on a real warehouse, not a Team or Place. Use the assign flow for custody-to-custody moves.';
  END IF;
  IF v_dest_sub.warehouse_id = v_source_sub.warehouse_id THEN
    RAISE EXCEPTION 'Source and destination warehouses must differ.';
  END IF;

  v_transfer_number := public.generate_transfer_number();

  INSERT INTO public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    from_sub_container_id, to_sub_container_id,
    transfer_kind, status,
    date, notes,
    created_by_profile_id, created_by_name,
    dispatched_by_profile_id, dispatched_by_name, dispatched_at
  ) VALUES (
    v_transfer_number, v_source_sub.warehouse_id, p_dest_warehouse_id,
    p_source_sub_container_id, p_dest_sub_container_id,
    'custody_return', 'in_transit',
    current_date, NULLIF(p_notes, ''),
    v_creator, p_created_by_name,
    v_creator, p_created_by_name, now()
  )
  RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_bv_id := (v_item->>'brand_variant_id')::uuid;
    v_qty   := (v_item->>'qty')::int;

    IF v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'One of the return lines is missing an item or has an invalid qty.';
    END IF;

    SELECT COALESCE(ii.name_en, '')::text AS item_name,
           NULLIF(ii.sku, '')::text        AS sku
      INTO v_label
      FROM public.inventory_item_brand_variants bv
      LEFT JOIN public.inventory_items ii ON ii.id = bv.item_id
      WHERE bv.id = v_bv_id;

    INSERT INTO public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku,
      requested_qty, dispatched_qty, unit_cost,
      sub_container_id
    ) VALUES (
      v_transfer_id, v_bv_id, COALESCE(v_label.item_name, ''), v_label.sku,
      v_qty, v_qty, 0,
      p_source_sub_container_id
    )
    RETURNING id INTO v_new_item_id;

    v_qty_taken_sum := 0;

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM   public.deduct_fifo_layers(
        v_bv_id,
        v_source_sub.warehouse_id,
        v_qty,
        true,
        p_source_sub_container_id
      )
    LOOP
      v_qty_taken_sum := v_qty_taken_sum + v_layer.qty_taken;

      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        v_source_sub.warehouse_id, p_source_sub_container_id, v_bv_id,
        COALESCE(v_label.item_name, ''), v_label.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', v_transfer_id, NULLIF(p_notes, '')
      );
    END LOOP;

    IF v_qty_taken_sum < v_qty THEN
      RAISE EXCEPTION 'Not enough stock of "%" in custody to return % — only % available.',
        COALESCE(v_label.item_name, v_bv_id::text), v_qty, v_qty_taken_sum;
    END IF;

    UPDATE public.warehouse_transfer_items wti
       SET unit_cost = (
         SELECT SUM(qty * unit_cost) / NULLIF(SUM(qty), 0)
         FROM   public.inventory_stock_movements
         WHERE  reference_type = 'transfer'
           AND  reference_id   = v_transfer_id
           AND  brand_variant_id = v_bv_id
       )
     WHERE wti.id = v_new_item_id;
  END LOOP;

  RETURN v_transfer_id;
END;
$$;


--
-- Name: rpc_create_partial_replacement(uuid, uuid, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_create_partial_replacement(p_return_id uuid, p_warehouse_id uuid, p_lines jsonb, p_gift_items jsonb DEFAULT '[]'::jsonb, p_dispositions jsonb DEFAULT '[]'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_return          RECORD;
  v_sale_order_id   uuid;
  v_delivery_id     uuid;
  v_delivery_num    text;
  v_return_line     RECORD;
  v_line            jsonb;
  v_line_id         uuid;
  v_line_qty        numeric;
  v_gift            jsonb;
  v_gift_variant    uuid;
  v_gift_qty        numeric;
  v_gift_item       RECORD;
  v_disp            jsonb;
  v_disp_line_id    uuid;
  v_disp_type       text;
  v_disp_qty        numeric;
  v_disp_transfer   uuid;
  v_disp_cost       numeric;
  v_mov_id          uuid;
  v_disp_warehouse  uuid;
  v_disp_sub_cont   uuid;
  v_return_division uuid;
  v_fallback_div    uuid;
BEGIN
  SELECT id, source_id, status, division_id
  INTO   v_return
  FROM   public.so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_create_partial_replacement: return % not found', p_return_id;
  END IF;

  v_sale_order_id   := v_return.source_id;
  v_return_division := v_return.division_id;

  IF jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'rpc_create_partial_replacement: p_lines must be a jsonb array';
  END IF;

  IF jsonb_array_length(p_lines) > 0 OR jsonb_array_length(coalesce(p_gift_items, '[]'::jsonb)) > 0 THEN
    v_delivery_num := public.next_delivery_number();
    INSERT INTO public.sale_deliveries (
      delivery_number, sale_order_id, warehouse_id, date,
      status, type, return_id
    ) VALUES (
      v_delivery_num, v_sale_order_id, p_warehouse_id, current_date,
      'delivered', 'replacement', p_return_id
    ) RETURNING id INTO v_delivery_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_id  := (v_line->>'return_line_id')::uuid;
    v_line_qty := (v_line->>'qty')::numeric;

    IF v_line_qty IS NULL OR v_line_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT rl.brand_variant_id, rl.item_name, rl.sku
      INTO v_return_line
      FROM public.return_lines rl
      WHERE rl.id = v_line_id AND rl.return_id = p_return_id;
    IF v_return_line.item_name IS NULL THEN
      RAISE EXCEPTION 'rpc_create_partial_replacement: return_line % not found on return %', v_line_id, p_return_id;
    END IF;

    INSERT INTO public.sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) VALUES (
      v_delivery_id, v_return_line.brand_variant_id, v_return_line.item_name, v_return_line.sku,
      v_line_qty::integer
    );

    PERFORM public._record_customer_resolution(
      p_return_line_id    => v_line_id,
      p_resolution_type   => 'replacement',
      p_qty               => v_line_qty,
      p_sale_delivery_id  => v_delivery_id
    );
  END LOOP;

  FOR v_gift IN SELECT * FROM jsonb_array_elements(coalesce(p_gift_items, '[]'::jsonb)) LOOP
    v_gift_variant := (v_gift->>'brand_variant_id')::uuid;
    v_gift_qty     := (v_gift->>'qty')::numeric;
    IF v_gift_variant IS NULL OR v_gift_qty IS NULL OR v_gift_qty <= 0 THEN
      CONTINUE;
    END IF;
    SELECT item_name, sku INTO v_gift_item
      FROM public.inventory_item_brand_variants WHERE id = v_gift_variant;
    INSERT INTO public.sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) VALUES (
      v_delivery_id, v_gift_variant, coalesce(v_gift_item.item_name, 'Gift'), v_gift_item.sku,
      v_gift_qty::integer
    );
  END LOOP;

  IF jsonb_typeof(p_dispositions) = 'array' AND jsonb_array_length(p_dispositions) > 0 THEN
    FOR v_disp IN SELECT * FROM jsonb_array_elements(p_dispositions) LOOP
      v_disp_line_id  := (v_disp->>'return_line_id')::uuid;
      v_disp_type     := v_disp->>'type';
      v_disp_qty      := (v_disp->>'qty')::numeric;
      v_disp_transfer := nullif(v_disp->>'transfer_id', '')::uuid;

      IF v_disp_type = 'write_off' THEN
        SELECT rl.brand_variant_id, rl.item_name, rl.sku, rl.condition_notes, rl.sale_delivery_line_id
          INTO v_return_line
          FROM public.return_lines rl
          WHERE rl.id = v_disp_line_id;
        IF v_return_line.item_name IS NULL THEN
          RAISE EXCEPTION 'rpc_create_partial_replacement: disposition return_line % not found', v_disp_line_id;
        END IF;

        v_disp_cost := public._return_line_fifo_unit_cost(p_return_id, v_disp_line_id, v_disp_qty);

        v_disp_warehouse := NULL;
        v_disp_sub_cont  := NULL;

        IF v_return_line.sale_delivery_line_id IS NOT NULL THEN
          SELECT sd.warehouse_id, fcl.sub_container_id
          INTO   v_disp_warehouse, v_disp_sub_cont
          FROM   public.sale_delivery_lines sdl
          JOIN   public.sale_deliveries     sd  ON sd.id = sdl.sale_delivery_id
          JOIN   public.cogs_entries        ce  ON ce.sale_delivery_id = sd.id
                                               AND ce.brand_variant_id = sdl.brand_variant_id
          JOIN   public.fifo_cost_layers    fcl ON fcl.id = ce.source_id
          WHERE  sdl.id = v_return_line.sale_delivery_line_id
          ORDER  BY ce.created_at ASC
          LIMIT  1;
        END IF;

        -- Phase E: cascade is return → SO → raise. Warehouse fallback removed.
        IF v_disp_warehouse IS NULL OR v_disp_sub_cont IS NULL THEN
          v_disp_warehouse := p_warehouse_id;

          v_fallback_div := v_return_division;

          IF v_fallback_div IS NULL THEN
            SELECT so.division_id INTO v_fallback_div
            FROM   public.sale_orders so WHERE so.id = v_sale_order_id;
          END IF;

          IF v_fallback_div IS NULL THEN
            RAISE EXCEPTION 'rpc_create_partial_replacement: write_off cannot resolve division from return or sale_order for warehouse %.',
              p_warehouse_id
              USING HINT = 'Set division_id on the return or sale_order before writing off.';
          END IF;

          v_disp_sub_cont := public._find_or_create_sub_container(p_warehouse_id, v_fallback_div);
        END IF;

        INSERT INTO public.inventory_stock_movements (
          warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost, reference_type, reference_id, notes
        ) VALUES (
          v_disp_warehouse, v_disp_sub_cont,
          v_return_line.brand_variant_id, v_return_line.item_name, nullif(v_return_line.sku, ''),
          'sale_return_damaged'::public.stock_movement_type,
          v_disp_qty::integer,
          v_disp_cost,
          'return', p_return_id,
          coalesce(v_return_line.condition_notes, 'Damaged on customer return — written off')
        ) RETURNING id INTO v_mov_id;

        PERFORM public._record_inventory_disposition(
          p_return_line_id              => v_disp_line_id,
          p_disposition_type            => 'write_off',
          p_qty                         => v_disp_qty,
          p_inventory_stock_movement_id => v_mov_id
        );

      ELSIF v_disp_type = 'restock_as_damaged' THEN
        PERFORM public._record_inventory_disposition(
          p_return_line_id   => v_disp_line_id,
          p_disposition_type => 'restock_as_damaged',
          p_qty              => v_disp_qty,
          p_notes            => v_disp->>'notes',
          p_warehouse_id     => p_warehouse_id
        );

      ELSIF v_disp_type = 'send_for_repair' THEN
        PERFORM public._record_inventory_disposition(
          p_return_line_id   => v_disp_line_id,
          p_disposition_type => 'send_for_repair',
          p_qty              => v_disp_qty,
          p_notes            => v_disp->>'notes',
          p_warehouse_id     => p_warehouse_id
        );

      ELSE
        RAISE EXCEPTION 'rpc_create_partial_replacement: unknown disposition type %', v_disp_type;
      END IF;
    END LOOP;
  END IF;

  PERFORM public._maybe_close_return(p_return_id);
  RETURN v_delivery_id;
END;
$$;


--
-- Name: rpc_customer_statement(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_customer_statement(p_customer_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date) RETURNS TABLE(txn_date date, txn_type text, reference text, description text, debit numeric, credit numeric)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    i.issued_date AS txn_date,
    'invoice' AS txn_type,
    i.invoice_id AS reference,
    CASE
      WHEN i.due_date IS NOT NULL THEN 'Invoice — due ' || TO_CHAR(i.due_date, 'DD Mon YYYY')
      ELSE 'Invoice'
    END AS description,
    i.total_amount AS debit,
    0::numeric AS credit
  FROM so_invoices i
  WHERE i.customer_id = p_customer_id
    AND (p_date_from IS NULL OR i.issued_date >= p_date_from)
    AND (p_date_to IS NULL OR i.issued_date <= p_date_to)

  UNION ALL

  SELECT
    p.date AS txn_date,
    'payment' AS txn_type,
    p.payment_id AS reference,
    'Payment — ' || COALESCE(p.method::text, 'unknown')
      || CASE WHEN p.reference IS NOT NULL THEN ' · ' || p.reference ELSE '' END AS description,
    0::numeric AS debit,
    p.amount AS credit
  FROM payments p
  LEFT JOIN sale_orders so ON so.id = p.source_id AND p.source_type = 'sale_order'
  LEFT JOIN so_invoices inv ON inv.id = p.invoice_id
  WHERE p.direction = 'incoming'
    AND p.deleted_at IS NULL
    AND p.status IN ('completed', 'pending', 'processing')
    AND COALESCE(p.customer_id, so.customer_id, inv.customer_id) = p_customer_id
    AND (p_date_from IS NULL OR p.date >= p_date_from)
    AND (p_date_to IS NULL OR p.date <= p_date_to)

  UNION ALL

  SELECT
    cn.created_at::date AS txn_date,
    'credit_note' AS txn_type,
    cn.credit_note_id AS reference,
    'Credit Note — ' || COALESCE(cn.reason, cn.type) AS description,
    0::numeric AS debit,
    cn.total_amount AS credit
  FROM credit_notes cn
  JOIN so_invoices inv ON inv.id = cn.invoice_id
  WHERE cn.status != 'draft'
    AND inv.customer_id = p_customer_id
    AND (p_date_from IS NULL OR cn.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR cn.created_at::date <= p_date_to)

  ORDER BY txn_date, txn_type;
$$;


--
-- Name: rpc_customer_statement_v2(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_customer_statement_v2(p_customer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  result        jsonb;
  cust_name     text;
  cust_phone    text;
  cust_type     text;
  account_type  text;
  orders        jsonb;
  totals        jsonb;
  open_count    bigint;
BEGIN
  SELECT c.name, c.customer_type::text, cg.name
  INTO cust_name, cust_type, account_type
  FROM customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE c.id = p_customer_id;

  IF cust_name IS NULL THEN
    RAISE EXCEPTION 'Customer not found: %', p_customer_id USING ERRCODE = 'P0002';
  END IF;

  -- Phone: prefer the primary row, else the first available row.
  SELECT phone INTO cust_phone
  FROM customer_phones
  WHERE customer_id = p_customer_id
  ORDER BY is_primary DESC NULLS LAST, created_at ASC
  LIMIT 1;

  WITH sos AS (
    SELECT so.id, so.so_number, so.created_at, so.status, so.total
    FROM sale_orders so
    WHERE so.customer_id = p_customer_id
      AND so.status != 'cancelled'
      AND so.deleted_at IS NULL
  ),
  so_inv AS (
    SELECT sos.id AS so_id, inv.id AS invoice_id
    FROM sos
    LEFT JOIN so_invoices inv
           ON inv.sale_order_id = sos.id
  ),
  so_paid AS (
    SELECT si.so_id,
           COALESCE(SUM(COALESCE(p.amount_qar, p.amount)), 0) AS paid
    FROM so_inv si
    LEFT JOIN payments p
           ON p.deleted_at IS NULL
          AND (
                (p.source_type = 'sale_order' AND p.source_id = si.so_id)
             OR (si.invoice_id IS NOT NULL
                 AND p.source_type = 'invoice'
                 AND p.source_id = si.invoice_id)
             OR (si.invoice_id IS NOT NULL AND p.invoice_id = si.invoice_id)
              )
    GROUP BY si.so_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO orders
  FROM (
    SELECT sos.id,
           sos.so_number,
           sos.created_at,
           sos.status::text AS status,
           sos.total::numeric AS total,
           COALESCE(sp.paid, 0)::numeric AS paid,
           GREATEST(0, sos.total - COALESCE(sp.paid, 0))::numeric AS outstanding
    FROM sos
    LEFT JOIN so_paid sp ON sp.so_id = sos.id
  ) t;

  SELECT jsonb_build_object(
           'total_orders_value', COALESCE(SUM((o->>'total')::numeric), 0),
           'total_paid',         COALESCE(SUM((o->>'paid')::numeric), 0),
           'total_outstanding',  COALESCE(SUM((o->>'outstanding')::numeric), 0)
         )
  INTO totals
  FROM jsonb_array_elements(orders) o;

  SELECT COALESCE(COUNT(*), 0)
  INTO open_count
  FROM jsonb_array_elements(orders) o
  WHERE (o->>'outstanding')::numeric > 0;

  result := jsonb_build_object(
    'customer', jsonb_build_object(
      'name',         cust_name,
      'phone',        cust_phone,
      'account_type', COALESCE(account_type, INITCAP(cust_type), 'Cash')
    ),
    'orders',            orders,
    'totals',            COALESCE(totals, jsonb_build_object(
                            'total_orders_value', 0,
                            'total_paid',         0,
                            'total_outstanding',  0)),
    'open_orders_count', open_count
  );

  RETURN result;
END;
$$;


--
-- Name: rpc_decide_consumption_edit(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_decide_consumption_edit(p_request_id uuid, p_decision text, p_comment text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid            uuid := public._current_user_data_id();
  v_request        RECORD;
  v_is_approver    boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: not authenticated';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: decision must be approved|rejected (got %)', p_decision;
  END IF;

  SELECT id, consumption_id, status
    INTO v_request
    FROM public.consumption_edit_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: request % not found', p_request_id;
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: request % is % (expected pending)', p_request_id, v_request.status;
  END IF;

  -- Caller must hold a role configured on the consumption_edit workflow.
  SELECT EXISTS (
    SELECT 1
    FROM public.user_custom_roles ucr
    JOIN public.custom_roles cr ON cr.id = ucr.role_id
    JOIN public.approval_workflow_steps aws ON aws.role_id = cr.id
    WHERE ucr.profile_id = v_uid
      AND cr.deleted_at IS NULL
      AND aws.workflow = 'consumption_edit'
      AND aws.archived_at IS NULL
  ) INTO v_is_approver;

  IF NOT v_is_approver THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: caller is not configured as a consumption_edit approver';
  END IF;

  UPDATE public.consumption_edit_requests
     SET status         = p_decision,
         reviewed_by    = v_uid,
         reviewed_at    = now(),
         review_comment = NULLIF(btrim(coalesce(p_comment, '')), '')
   WHERE id = p_request_id;

  IF p_decision = 'approved' THEN
    -- Fires the same cancellation flow as the old operator-driven Cancel
    -- button. rpc_cancel_consumption raises if the entry is not posted;
    -- since our own rpc_request_consumption_edit guards on that at request
    -- time, this only trips on a race we'd want to surface anyway.
    PERFORM public.rpc_cancel_consumption(v_request.consumption_id);
  END IF;
END;
$$;


--
-- Name: rpc_dispatch_custody_assign(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_dispatch_custody_assign(p_transfer_id uuid, p_dispatched_by_profile_id uuid DEFAULT NULL::uuid, p_dispatched_by_name text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_transfer     RECORD;
  v_uid          uuid := public._current_user_data_id();
  v_dispatcher   uuid := COALESCE(p_dispatched_by_profile_id, v_uid);
  v_item         RECORD;
  v_layer        RECORD;
  v_qty_taken    int;
  v_weighted     numeric;
  v_line_total   numeric;
BEGIN
  IF v_dispatcher IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to dispatch a custody request.';
  END IF;

  SELECT id, transfer_kind, status,
         from_warehouse_id, from_sub_container_id,
         to_warehouse_id, to_sub_container_id
    INTO v_transfer
    FROM public.warehouse_transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This custody request no longer exists.';
  END IF;
  IF v_transfer.transfer_kind <> 'custody_assign' THEN
    RAISE EXCEPTION 'This transfer is not a custody request and cannot be dispatched here.';
  END IF;
  IF v_transfer.status <> 'pending' THEN
    RAISE EXCEPTION 'This custody request is already % — it can no longer be dispatched.', v_transfer.status;
  END IF;

  -- Permission: source WH field RP OR admin/inventory_manager.
  IF NOT public.is_field_rp_of(v_dispatcher, v_transfer.from_warehouse_id)
     AND NOT public._has_custody_admin_role(v_dispatcher) THEN
    RAISE EXCEPTION 'Only a responsible person of the source warehouse (or an admin) can dispatch this request.';
  END IF;

  -- Deduct source FIFO per line, emit transfer_out movements.
  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, requested_qty
    FROM   public.warehouse_transfer_items
    WHERE  transfer_id = p_transfer_id
    ORDER  BY brand_variant_id
  LOOP
    IF COALESCE(v_item.requested_qty, 0) <= 0 THEN
      CONTINUE;
    END IF;

    v_qty_taken := 0;
    v_line_total := 0;

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM   public.deduct_fifo_layers(
        v_item.brand_variant_id,
        v_transfer.from_warehouse_id,
        v_item.requested_qty,
        true,                                  -- p_is_transfer
        v_transfer.from_sub_container_id
      )
    LOOP
      v_qty_taken  := v_qty_taken  + v_layer.qty_taken;
      v_line_total := v_line_total + v_layer.total_cost;

      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id
      ) VALUES (
        v_transfer.from_warehouse_id, v_transfer.from_sub_container_id,
        v_item.brand_variant_id,
        COALESCE(v_item.item_name, ''), v_item.sku,
        'transfer_out', -v_layer.qty_taken, v_layer.unit_cost,
        'transfer', p_transfer_id
      );
    END LOOP;

    IF v_qty_taken < v_item.requested_qty THEN
      RAISE EXCEPTION 'Not enough stock of "%" at the source to dispatch % — only % available.',
        COALESCE(v_item.item_name, v_item.brand_variant_id::text),
        v_item.requested_qty, v_qty_taken;
    END IF;

    v_weighted := v_line_total / NULLIF(v_qty_taken, 0);

    UPDATE public.warehouse_transfer_items
       SET dispatched_qty = v_item.requested_qty,
           unit_cost      = COALESCE(v_weighted, 0)
     WHERE id = v_item.id;
  END LOOP;

  UPDATE public.warehouse_transfers
     SET status                     = 'in_transit',
         dispatched_by_profile_id   = v_dispatcher,
         dispatched_by_name         = p_dispatched_by_name,
         dispatched_at              = now()
   WHERE id = p_transfer_id;
END;
$$;


--
-- Name: rpc_financial_dashboard(); Type: FUNCTION; Schema: public; Owner: -
--

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

  cash_in_this_month         numeric;
  cash_out_this_month        numeric;
  cash_in_last_month         numeric;
  cash_out_last_month        numeric;

  invoiced_this_month        numeric;
  billed_this_month          numeric;

  monthly_trend              jsonb;
  top_overdue_customers      jsonb;
  top_overdue_suppliers      jsonb;

  v_month_start              date := DATE_TRUNC('month', CURRENT_DATE)::date;
  v_last_month_start         date := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::date;
BEGIN
  -- AR receivables from so_invoices
  SELECT
    COALESCE(SUM(total_amount - paid_amount), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total_amount - paid_amount END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO receivables_total, receivables_overdue, receivables_overdue_count
  FROM so_invoices
  WHERE payment_status != 'paid'
    AND total_amount - paid_amount > 0;

  -- AP payables from bills
  SELECT
    COALESCE(SUM(total_amount - paid_amount), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total_amount - paid_amount END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO payables_total, payables_overdue, payables_overdue_count
  FROM bills
  WHERE payment_status != 'paid'
    AND total_amount - paid_amount > 0;

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

  -- Invoiced this month from so_invoices (AR)
  SELECT COALESCE(SUM(total_amount), 0)
  INTO invoiced_this_month
  FROM so_invoices
  WHERE issued_date >= v_month_start
    AND issued_date <= CURRENT_DATE;

  -- Billed this month from bills (AP)
  SELECT COALESCE(SUM(total_amount), 0)
  INTO billed_this_month
  FROM bills
  WHERE issued_date >= v_month_start
    AND issued_date <= CURRENT_DATE;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.month), '[]'::jsonb)
  INTO monthly_trend
  FROM (
    SELECT
      TO_CHAR(m.month, 'YYYY-MM') AS month,
      TO_CHAR(m.month, 'Mon') AS label,
      COALESCE((
        SELECT SUM(total_amount) FROM so_invoices
        WHERE DATE_TRUNC('month', issued_date) = m.month
      ), 0) AS invoiced,
      COALESCE((
        SELECT SUM(total_amount) FROM bills
        WHERE DATE_TRUNC('month', issued_date) = m.month
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
    FROM so_invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.due_date < CURRENT_DATE
      AND i.payment_status != 'paid'
      AND i.total_amount - i.paid_amount > 0
    GROUP BY c.id, c.name
    ORDER BY amount DESC
    LIMIT 5
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO top_overdue_suppliers
  FROM (
    SELECT
      s.id,
      s.name,
      SUM(b.total_amount - b.paid_amount) AS amount,
      COUNT(*) AS bill_count,
      MIN(b.due_date) AS oldest_due,
      (CURRENT_DATE - MIN(b.due_date))::int AS days_overdue
    FROM bills b
    JOIN suppliers s ON s.id = b.supplier_id
    WHERE b.due_date < CURRENT_DATE
      AND b.payment_status != 'paid'
      AND b.total_amount - b.paid_amount > 0
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


--
-- Name: rpc_post_consumption(uuid, uuid, text, uuid, uuid, uuid, text, text[], jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_post_consumption(p_source_warehouse_id uuid, p_source_sub_container_id uuid, p_consumer_type text, p_consumer_team_sub_id uuid, p_consumer_place_sub_id uuid, p_consumer_customer_id uuid, p_notes text, p_attachments text[], p_lines jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_consumption_id       uuid;
  v_ce_number            text;
  v_sub                  RECORD;
  v_line                 jsonb;
  v_variant_id           uuid;
  v_qty                  int;
  v_label                RECORD;
  v_layer                RECORD;
  v_qty_taken_sum        int;
  v_total_cost_sum       numeric;
  v_weighted_unit_cost   numeric;
  v_uid                  uuid := public._current_user_data_id();
  v_touched_variants     uuid[] := '{}';
  v_variant              uuid;
BEGIN
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'rpc_post_consumption: at least one line is required';
  END IF;

  IF p_consumer_type NOT IN ('team','place','internal') THEN
    RAISE EXCEPTION 'rpc_post_consumption: invalid consumer_type % (expected team|place|internal)', p_consumer_type;
  END IF;

  IF p_consumer_type = 'team'  AND p_consumer_team_sub_id  IS NULL THEN
    RAISE EXCEPTION 'rpc_post_consumption: consumer_type=team requires consumer_team_sub_id';
  END IF;
  IF p_consumer_type = 'place' AND p_consumer_place_sub_id IS NULL THEN
    RAISE EXCEPTION 'rpc_post_consumption: consumer_type=place requires consumer_place_sub_id';
  END IF;

  IF p_consumer_type <> 'team'  THEN p_consumer_team_sub_id  := NULL; END IF;
  IF p_consumer_type <> 'place' THEN p_consumer_place_sub_id := NULL; END IF;
  -- Customer branch was dropped in the Task 9 revision — always NULL.
  p_consumer_customer_id := NULL;

  SELECT sc.id, sc.warehouse_id, sc.division_id, sc.is_active
    INTO v_sub
    FROM public.warehouse_sub_containers sc
    WHERE sc.id = p_source_sub_container_id;

  IF NOT FOUND OR v_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'rpc_post_consumption: source sub-container % not found or inactive', p_source_sub_container_id;
  END IF;
  IF v_sub.warehouse_id <> p_source_warehouse_id THEN
    RAISE EXCEPTION 'rpc_post_consumption: source sub-container % does not belong to warehouse %', p_source_sub_container_id, p_source_warehouse_id;
  END IF;

  v_ce_number := public.generate_consumption_number();

  INSERT INTO public.consumption_entries (
    ce_number, date,
    source_warehouse_id, source_sub_container_id,
    consumer_type, consumer_team_sub_id, consumer_place_sub_id, consumer_customer_id,
    notes, attachments,
    status, created_by, posted_by, posted_at,
    division_id
  ) VALUES (
    v_ce_number, current_date,
    p_source_warehouse_id, p_source_sub_container_id,
    p_consumer_type, p_consumer_team_sub_id, p_consumer_place_sub_id, p_consumer_customer_id,
    NULLIF(p_notes, ''), COALESCE(p_attachments, '{}'::text[]),
    'posted', v_uid, v_uid, now(),
    v_sub.division_id
  )
  RETURNING id INTO v_consumption_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_variant_id := (v_line->>'brand_variant_id')::uuid;
    v_qty        := (v_line->>'qty')::int;

    IF v_variant_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'rpc_post_consumption: invalid line %', v_line;
    END IF;

    SELECT COALESCE(ii.name_en, '')::text AS item_name,
           COALESCE(ii.sku, '')::text     AS sku
      INTO v_label
      FROM public.inventory_item_brand_variants bv
      LEFT JOIN public.inventory_items ii ON ii.id = bv.item_id
      WHERE bv.id = v_variant_id;

    v_qty_taken_sum := 0;
    v_total_cost_sum := 0;

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM   public.deduct_fifo_layers(
        v_variant_id,
        p_source_warehouse_id,
        v_qty,
        false,
        p_source_sub_container_id
      )
    LOOP
      v_qty_taken_sum  := v_qty_taken_sum  + v_layer.qty_taken;
      v_total_cost_sum := v_total_cost_sum + v_layer.total_cost;

      INSERT INTO public.cogs_entries (
        brand_variant_id, qty, unit_cost, total_cost, date,
        source_type, source_id,
        consumption_id, consumer_type,
        consumer_team_sub_id, consumer_place_sub_id, consumer_customer_id,
        division_id, consumer_division_id
      ) VALUES (
        v_variant_id, v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, current_date,
        'consumption', v_layer.layer_id,
        v_consumption_id, p_consumer_type,
        p_consumer_team_sub_id, p_consumer_place_sub_id, p_consumer_customer_id,
        v_sub.division_id, v_sub.division_id
      );

      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        p_source_warehouse_id, p_source_sub_container_id, v_variant_id,
        v_label.item_name, NULLIF(v_label.sku, ''),
        'consumption', -v_layer.qty_taken, v_layer.unit_cost,
        'consumption', v_consumption_id, NULLIF(p_notes, '')
      );
    END LOOP;

    IF v_qty_taken_sum < v_qty THEN
      RAISE EXCEPTION 'rpc_post_consumption: insufficient stock for variant % at sub % (requested %, drained %)',
        v_variant_id, p_source_sub_container_id, v_qty, v_qty_taken_sum;
    END IF;

    v_weighted_unit_cost := v_total_cost_sum / v_qty_taken_sum;

    INSERT INTO public.consumption_lines (
      consumption_id, brand_variant_id, item_name, sku, qty, unit_cost
    ) VALUES (
      v_consumption_id, v_variant_id, v_label.item_name, NULLIF(v_label.sku, ''), v_qty, v_weighted_unit_cost
    );

    v_touched_variants := v_touched_variants || v_variant_id;
  END LOOP;

  SELECT ARRAY(SELECT DISTINCT unnest(v_touched_variants)) INTO v_touched_variants;
  FOREACH v_variant IN ARRAY v_touched_variants LOOP
    PERFORM public.recalc_average_cost(v_variant);
  END LOOP;

  RETURN v_consumption_id;
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
  v_return              RECORD;
  v_line                RECORD;
  v_bv_id               UUID;
  v_line_sub_container  UUID;
  v_layer               RECORD;
BEGIN
  SELECT id, restock_warehouse_id, status, dispatched_at
  INTO   v_return
  FROM   so_po_returns
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

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty, receival_item_id
    FROM return_lines
    WHERE return_id = p_return_id
  LOOP
    v_bv_id := v_line.brand_variant_id;

    -- Fallback: look up brand variant by SKU code when brand_variant_id is missing.
    IF v_bv_id IS NULL AND v_line.sku IS NOT NULL AND TRIM(v_line.sku) != '' THEN
      SELECT id INTO v_bv_id
      FROM   inventory_item_brand_variants
      WHERE  code = TRIM(v_line.sku)
      LIMIT  1;
    END IF;

    IF v_bv_id IS NULL OR v_line.qty <= 0 THEN
      CONTINUE;
    END IF;

    -- Derive source sub-container from the linked receival_items row.
    -- Populated on new returns (D.4.a UI) + backfilled for legacy PR-00002/PR-00003.
    IF v_line.receival_item_id IS NULL THEN
      RAISE EXCEPTION 'PO return line % has no receival_item_id link; cannot derive source sub-container.',
        v_line.id
        USING HINT = 'Legacy return that predates Warehouse Model v2 D.4.a. Cancel and re-issue through the current PO-return dialog.';
    END IF;

    SELECT ri.sub_container_id
    INTO   v_line_sub_container
    FROM   public.receival_items ri
    WHERE  ri.id = v_line.receival_item_id;

    IF v_line_sub_container IS NULL THEN
      RAISE EXCEPTION 'Receival item % has no sub_container_id; cannot dispatch return line %.',
        v_line.receival_item_id, v_line.id
        USING HINT = 'Contact ops to reconcile the receival before re-dispatching this return.';
    END IF;

    -- One purchase_return movement per layer drained, scoped to the source sub-container.
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(
        v_bv_id,
        v_return.restock_warehouse_id,
        v_line.qty,
        false,
        v_line_sub_container
      )
    LOOP
      INSERT INTO inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        v_return.restock_warehouse_id,
        v_line_sub_container,
        v_bv_id,
        v_line.item_name,
        NULLIF(v_line.sku, ''),
        'purchase_return',
        -v_layer.qty_taken,
        v_layer.unit_cost,
        'po_return',
        p_return_id,
        'Returned to supplier'
      );
    END LOOP;
  END LOOP;

  UPDATE so_po_returns SET dispatched_at = now() WHERE id = p_return_id;
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
  v_return             RECORD;
  v_line               RECORD;
  v_cogs               RECORD;
  v_qty_remaining      int;
  v_qty_this_chunk     numeric;
  v_available_qty      numeric;
  v_pending_insp       int;
  v_line_warehouse     uuid;
  v_line_sub_container uuid;
  v_fallback_division  uuid;
BEGIN
  SELECT id, source_type, source_id, restock_warehouse_id,
         status, restocked_at, return_number, division_id
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.restocked_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status <> 'restocked' THEN
    RAISE EXCEPTION 'Return must have status=restocked before processing inventory (got %)', v_return.status;
  END IF;

  IF v_return.source_type <> 'sale_order' THEN
    RAISE EXCEPTION 'rpc_process_return_restock: expected source_type=sale_order, got %', v_return.source_type;
  END IF;

  SELECT count(*)
  INTO   v_pending_insp
  FROM   return_lines
  WHERE  return_id = p_return_id
    AND  condition = 'inspection';

  IF v_pending_insp > 0 THEN
    RAISE EXCEPTION 'Return % has % line(s) awaiting inspection — call rpc_complete_return_inspection before restocking',
      v_return.return_number, v_pending_insp;
  END IF;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty, condition, condition_notes,
           sale_delivery_line_id
    FROM   return_lines
    WHERE  return_id = p_return_id
      AND  brand_variant_id IS NOT NULL
      AND  qty > 0
      AND  condition = 'good'
  LOOP
    IF v_line.sale_delivery_line_id IS NULL THEN
      RAISE EXCEPTION 'Return line % has no sale_delivery_line_id link; cannot derive restock destination.',
        v_line.id
        USING HINT = 'Legacy return that predates Warehouse Model v2 D.4.b. Contact ops to reconcile.';
    END IF;

    SELECT sd.warehouse_id,
           fcl.sub_container_id
    INTO   v_line_warehouse, v_line_sub_container
    FROM   public.sale_delivery_lines sdl
    JOIN   public.sale_deliveries     sd  ON sd.id = sdl.sale_delivery_id
    JOIN   public.cogs_entries        ce  ON ce.sale_delivery_id = sd.id
                                         AND ce.brand_variant_id = sdl.brand_variant_id
    JOIN   public.fifo_cost_layers    fcl ON fcl.id = ce.source_id
    WHERE  sdl.id = v_line.sale_delivery_line_id
    ORDER  BY ce.created_at ASC
    LIMIT  1;

    -- Fallback for pre-D.3 deliveries. Phase E: division-derive cascade
    -- runs return → sale_order → cogs_entries. Warehouse-based fallback
    -- is gone (warehouses.division_id was dropped in Phase E).
    IF v_line_warehouse IS NULL OR v_line_sub_container IS NULL THEN
      SELECT sd.warehouse_id
      INTO   v_line_warehouse
      FROM   public.sale_delivery_lines sdl
      JOIN   public.sale_deliveries     sd  ON sd.id = sdl.sale_delivery_id
      WHERE  sdl.id = v_line.sale_delivery_line_id;

      IF v_line_warehouse IS NULL THEN
        RAISE EXCEPTION 'Return line %: cannot resolve warehouse from delivery_line %.',
          v_line.id, v_line.sale_delivery_line_id;
      END IF;

      v_fallback_division := v_return.division_id;

      IF v_fallback_division IS NULL THEN
        SELECT so.division_id
        INTO   v_fallback_division
        FROM   public.sale_orders so
        WHERE  so.id = v_return.source_id;
      END IF;

      -- Phase E follow-up: cogs_entries.division_id is preserved and
      -- reliably populated on every delivery COGS row, so it's the last
      -- and most permissive fallback before we give up.
      IF v_fallback_division IS NULL THEN
        SELECT ce.division_id
        INTO   v_fallback_division
        FROM   public.cogs_entries ce
        WHERE  ce.sale_order_id      = v_return.source_id
          AND  ce.brand_variant_id   = v_line.brand_variant_id
          AND  ce.division_id IS NOT NULL
        ORDER  BY ce.date ASC, ce.created_at ASC
        LIMIT  1;
      END IF;

      IF v_fallback_division IS NULL THEN
        RAISE EXCEPTION 'Return line %: pre-D.3 delivery has no source_id chain AND division cannot be resolved from return, sale_order, or cogs_entries.',
          v_line.id
          USING HINT = 'Set division_id on the return, sale_order, or the delivery COGS row before restocking.';
      END IF;

      v_line_sub_container := public._find_or_create_sub_container(v_line_warehouse, v_fallback_division);
    END IF;

    SELECT coalesce(sum(qty), 0)
    INTO   v_available_qty
    FROM   cogs_entries
    WHERE  sale_order_id = v_return.source_id
      AND  brand_variant_id = v_line.brand_variant_id
      AND  qty > 0;

    IF v_available_qty < v_line.qty THEN
      RAISE EXCEPTION 'Return line % (variant %) requests qty % but only % available in cogs_entries for sale_order %',
        v_line.id, v_line.brand_variant_id, v_line.qty, v_available_qty, v_return.source_id;
    END IF;

    v_qty_remaining := v_line.qty;

    FOR v_cogs IN
      SELECT id, sale_delivery_id, sale_order_id, qty, unit_cost, division_id, date
      FROM   cogs_entries
      WHERE  sale_order_id = v_return.source_id
        AND  brand_variant_id = v_line.brand_variant_id
        AND  qty > 0
      ORDER  BY date ASC, unit_cost ASC, id ASC
    LOOP
      EXIT WHEN v_qty_remaining <= 0;

      v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type, source_id,
        sub_container_id
      ) VALUES (
        v_line.brand_variant_id,
        v_line_warehouse,
        current_date,
        v_qty_this_chunk,
        v_cogs.unit_cost,
        0,
        v_cogs.unit_cost,
        v_qty_this_chunk,
        'sale_return',
        p_return_id,
        v_line_sub_container
      );

      INSERT INTO cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date,
        source_type, division_id, notes
      ) VALUES (
        v_line.brand_variant_id,
        v_cogs.sale_delivery_id,
        v_cogs.sale_order_id,
        -v_qty_this_chunk,
        v_cogs.unit_cost,
        -(v_qty_this_chunk * v_cogs.unit_cost),
        current_date,
        'sale_return',
        coalesce(v_return.division_id, v_cogs.division_id, v_fallback_division),
        'Reversed by return ' || v_return.return_number
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_line_warehouse,
        v_line.brand_variant_id,
        v_line.item_name,
        nullif(v_line.sku, ''),
        'sale_return',
        v_qty_this_chunk,
        v_cogs.unit_cost,
        'return',
        p_return_id,
        'Sale return restocked (good) — ' || v_return.return_number,
        v_line_sub_container
      );

      v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
    END LOOP;

    IF v_qty_remaining > 0 THEN
      RAISE EXCEPTION 'Return line % (variant %) could not be fully attributed: % units unmatched',
        v_line.id, v_line.brand_variant_id, v_qty_remaining;
    END IF;
  END LOOP;

  UPDATE so_po_returns
  SET    restocked_at = now()
  WHERE  id = p_return_id;
END;
$$;


--
-- Name: rpc_product_profitability(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_product_profitability(p_start_date date, p_end_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_days        integer;
  v_prev_start  date;
  v_prev_end    date;
  v_summary     jsonb;
  v_products    jsonb;
begin
  if p_start_date is null or p_end_date is null then
    raise exception 'p_start_date and p_end_date are required';
  end if;
  if p_end_date < p_start_date then
    raise exception 'p_end_date must be >= p_start_date';
  end if;

  v_days := (p_end_date - p_start_date) + 1;
  v_prev_end   := p_start_date - 1;
  v_prev_start := v_prev_end - (v_days - 1);

  with current_window as (
    select
      ce.brand_variant_id,
      sum(ce.qty)::numeric                            as qty,
      sum(ce.qty * sol.unit_price)                    as revenue,
      sum(ce.total_cost)                              as cogs,
      (array_agg(sol.item_name order by sol.created_at desc))[1] as item_name,
      (array_agg(sol.sku       order by sol.created_at desc))[1] as sku
    from cogs_entries ce
    join sale_order_lines sol
      on sol.sale_order_id  = ce.sale_order_id
     and sol.brand_variant_id = ce.brand_variant_id
    where ce.date >= p_start_date
      and ce.date <= p_end_date
    group by ce.brand_variant_id
  ),
  current_with_meta as (
    select
      cw.brand_variant_id,
      cw.sku,
      cw.item_name  as name,
      bv.brand      as brand_name,
      cw.qty,
      cw.revenue,
      cw.cogs,
      (cw.revenue - cw.cogs) as profit,
      case when cw.revenue = 0 then null
           else round(((cw.revenue - cw.cogs) / cw.revenue) * 100, 2)
      end as margin_pct
    from current_window cw
    left join inventory_item_brand_variants bv on bv.id = cw.brand_variant_id
  ),
  current_totals as (
    select
      coalesce(sum(revenue), 0) as revenue,
      coalesce(sum(cogs), 0)    as cogs
    from current_with_meta
  ),
  prev_totals as (
    select
      coalesce(sum(ce.qty * sol.unit_price), 0)  as revenue,
      coalesce(sum(ce.total_cost), 0)            as cogs
    from cogs_entries ce
    join sale_order_lines sol
      on sol.sale_order_id  = ce.sale_order_id
     and sol.brand_variant_id = ce.brand_variant_id
    where ce.date >= v_prev_start
      and ce.date <= v_prev_end
  ),
  products_agg as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'brand_variant_id', brand_variant_id,
          'sku',              sku,
          'name',             name,
          'brand_name',       brand_name,
          'qty',              qty,
          'revenue',          revenue,
          'cogs',             cogs,
          'profit',           profit,
          'margin_pct',       margin_pct
        )
        order by profit desc nulls last
      ),
      '[]'::jsonb
    ) as products
    from current_with_meta
  )
  select
    jsonb_build_object(
      'revenue',           ct.revenue,
      'cogs',              ct.cogs,
      'gross_profit',      (ct.revenue - ct.cogs),
      'margin_pct',        case when ct.revenue = 0 then null
                                else round(((ct.revenue - ct.cogs) / ct.revenue) * 100, 2)
                           end,
      'prev_revenue',      pt.revenue,
      'prev_cogs',         pt.cogs,
      'prev_gross_profit', (pt.revenue - pt.cogs),
      'prev_margin_pct',   case when pt.revenue = 0 then null
                                else round(((pt.revenue - pt.cogs) / pt.revenue) * 100, 2)
                           end
    ),
    pa.products
  into v_summary, v_products
  from current_totals ct, prev_totals pt, products_agg pa;

  return jsonb_build_object(
    'summary',  v_summary,
    'products', v_products
  );
end;
$$;


--
-- Name: rpc_profitability_drilldown(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_profitability_drilldown(p_start_date date, p_end_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Start and end dates are required';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'End date must be >= start date';
  END IF;

  RETURN COALESCE((
    WITH line_data AS (
      SELECT
        ce.sale_order_id,
        ce.brand_variant_id,
        SUM(ce.qty)::numeric                              AS qty,
        SUM(ce.qty * sol.unit_price)                      AS line_revenue,
        SUM(ce.total_cost)                                AS line_cogs,
        SUM(ce.qty * sol.unit_price) - SUM(ce.total_cost) AS line_profit,
        sol.unit_price,
        (array_agg(sol.item_name ORDER BY sol.created_at DESC))[1] AS item_name,
        (array_agg(sol.sku       ORDER BY sol.created_at DESC))[1] AS sku
      FROM cogs_entries ce
      JOIN sale_order_lines sol
        ON sol.sale_order_id  = ce.sale_order_id
       AND sol.brand_variant_id = ce.brand_variant_id
      WHERE ce.date >= p_start_date
        AND ce.date <= p_end_date
        AND ce.sale_order_id IS NOT NULL
      GROUP BY ce.sale_order_id, ce.brand_variant_id, sol.unit_price
    ),
    so_agg AS (
      SELECT
        ld.sale_order_id,
        so.so_number,
        so.created_at::date              AS order_date,
        COALESCE(c.name, 'Walk-in')      AS customer_name,
        COUNT(*)::int                    AS item_count,
        SUM(ld.line_revenue)             AS revenue,
        SUM(ld.line_cogs)                AS cogs,
        SUM(ld.line_profit)              AS profit,
        CASE WHEN SUM(ld.line_revenue) = 0 THEN NULL
             ELSE ROUND((SUM(ld.line_profit) / SUM(ld.line_revenue)) * 100, 2)
        END                              AS margin_pct,
        jsonb_agg(
          jsonb_build_object(
            'brand_variant_id', ld.brand_variant_id,
            'item_name',        ld.item_name,
            'sku',              ld.sku,
            'qty',              ld.qty,
            'unit_price',       ld.unit_price,
            'revenue',          ld.line_revenue,
            'cogs',             ld.line_cogs,
            'profit',           ld.line_profit
          ) ORDER BY ld.line_cogs DESC
        ) AS lines
      FROM line_data ld
      JOIN sale_orders so ON so.id = ld.sale_order_id
      LEFT JOIN customers c ON c.id = so.customer_id
      GROUP BY ld.sale_order_id, so.so_number, so.created_at, c.name
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'sale_order_id', sale_order_id,
        'so_number',     so_number,
        'order_date',    order_date,
        'customer_name', customer_name,
        'item_count',    item_count,
        'revenue',       revenue,
        'cogs',          cogs,
        'profit',        profit,
        'margin_pct',    margin_pct,
        'lines',         lines
      ) ORDER BY cogs DESC
    )
    FROM so_agg
  ), '[]'::jsonb);
END;
$$;


--
-- Name: rpc_purchase_aging_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_purchase_aging_report() RETURNS TABLE(supplier_id uuid, supplier_name text, current_amt numeric, days_1_30 numeric, days_31_60 numeric, days_61_90 numeric, days_over_90 numeric, total_outstanding numeric, bill_count bigint)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    b.supplier_id,
    s.name AS supplier_name,
    COALESCE(SUM(CASE WHEN b.due_date >= CURRENT_DATE THEN b.total_amount - b.paid_amount END), 0) AS current_amt,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN b.total_amount - b.paid_amount END), 0) AS days_1_30,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31 THEN b.total_amount - b.paid_amount END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61 THEN b.total_amount - b.paid_amount END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN b.due_date < CURRENT_DATE - 90 THEN b.total_amount - b.paid_amount END), 0) AS days_over_90,
    COALESCE(SUM(b.total_amount - b.paid_amount), 0) AS total_outstanding,
    COUNT(*) AS bill_count
  FROM bills b
  JOIN suppliers s ON s.id = b.supplier_id
  WHERE b.payment_status != 'paid'
    AND b.total_amount - b.paid_amount > 0
  GROUP BY b.supplier_id, s.name
  ORDER BY total_outstanding DESC;
$$;


--
-- Name: rpc_recompute_document_fx(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_recompute_document_fx(p_document_type text, p_document_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sum_gain numeric;
  v_sum_loss numeric;
BEGIN
  -- Suppress the AFTER trigger during the self-touch cascade so it does not
  -- recursively call this RPC once per row. set_config with is_local=true
  -- scopes the flag to the current transaction; a COMMIT or ROLLBACK also
  -- resets it, so we don't need a cleanup path on exceptions.
  PERFORM set_config('mms.fx_recompute_active', '1', true);

  -- Re-fire the BEFORE trigger by touching each payment (UPDATE of
  -- exchange_rate to itself). Idempotent.
  UPDATE public.payments
     SET exchange_rate = exchange_rate
   WHERE source_type::text = p_document_type
     AND source_id = p_document_id
     AND deleted_at IS NULL;

  -- Clear the guard immediately after the cascade completes so any later
  -- top-level writes in the same transaction still fire the AFTER trigger.
  PERFORM set_config('mms.fx_recompute_active', '', true);

  -- Sum the (now-current) gain/loss values.
  SELECT COALESCE(SUM(exchange_gain),0), COALESCE(SUM(exchange_loss),0)
    INTO v_sum_gain, v_sum_loss
    FROM public.payments
   WHERE source_type::text = p_document_type
     AND source_id = p_document_id
     AND deleted_at IS NULL;

  IF p_document_type = 'po' THEN
    UPDATE public.purchase_orders
       SET exchange_gain = v_sum_gain,
           exchange_loss = v_sum_loss
     WHERE id = p_document_id;
  ELSE
    UPDATE public.sale_orders
       SET exchange_gain = v_sum_gain,
           exchange_loss = v_sum_loss
     WHERE id = p_document_id;
  END IF;
END $$;


--
-- Name: rpc_record_inventory_disposition(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_inventory_disposition(p_return_id uuid, p_warehouse_id uuid, p_dispositions jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_disp         jsonb;
  v_disp_line_id uuid;
  v_disp_type    text;
  v_disp_qty     numeric;
  v_return_line  record;
  v_mov_id       uuid;
  v_unit_cost    numeric;
  v_count        int := 0;
begin
  if not exists (
    select 1 from public.so_po_returns
    where id = p_return_id and deleted_at is null
  ) then
    raise exception 'rpc_record_inventory_disposition: return % not found', p_return_id;
  end if;

  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'rpc_record_inventory_disposition: warehouse % not found', p_warehouse_id;
  end if;

  if jsonb_typeof(p_dispositions) <> 'array' or jsonb_array_length(p_dispositions) = 0 then
    raise exception 'rpc_record_inventory_disposition: p_dispositions must be a non-empty array';
  end if;

  for v_disp in select * from jsonb_array_elements(p_dispositions) loop
    v_disp_line_id := (v_disp->>'return_line_id')::uuid;
    v_disp_type    := v_disp->>'type';
    v_disp_qty     := (v_disp->>'qty')::numeric;

    if v_disp_type = 'write_off' then
      select rl.brand_variant_id, rl.item_name, rl.sku, rl.condition_notes, rl.return_id
        into v_return_line
        from public.return_lines rl
        where rl.id = v_disp_line_id;
      if v_return_line.item_name is null then
        raise exception 'rpc_record_inventory_disposition: return_line % not found', v_disp_line_id;
      end if;
      if v_return_line.return_id <> p_return_id then
        raise exception 'rpc_record_inventory_disposition: return_line % does not belong to return %', v_disp_line_id, p_return_id;
      end if;

      v_unit_cost := public._return_line_fifo_unit_cost(p_return_id, v_disp_line_id, v_disp_qty);

      insert into public.inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) values (
        p_warehouse_id, v_return_line.brand_variant_id, v_return_line.item_name, nullif(v_return_line.sku, ''),
        'sale_return_damaged'::public.stock_movement_type,
        v_disp_qty::integer,
        v_unit_cost,
        'return', p_return_id,
        coalesce(v_return_line.condition_notes, 'Damaged on customer return — written off')
      ) returning id into v_mov_id;

      perform public._record_inventory_disposition(
        p_return_line_id              => v_disp_line_id,
        p_disposition_type            => 'write_off',
        p_qty                         => v_disp_qty,
        p_inventory_stock_movement_id => v_mov_id
      );

    elsif v_disp_type = 'restock_as_damaged' then
      if not exists (
        select 1 from public.return_lines rl
        where rl.id = v_disp_line_id and rl.return_id = p_return_id
      ) then
        raise exception 'rpc_record_inventory_disposition: return_line % not found on return %', v_disp_line_id, p_return_id;
      end if;

      perform public._record_inventory_disposition(
        p_return_line_id   => v_disp_line_id,
        p_disposition_type => 'restock_as_damaged',
        p_qty              => v_disp_qty,
        p_notes            => v_disp->>'notes',
        p_warehouse_id     => p_warehouse_id
      );

    elsif v_disp_type = 'send_for_repair' then
      if not exists (
        select 1 from public.return_lines rl
        where rl.id = v_disp_line_id and rl.return_id = p_return_id
      ) then
        raise exception 'rpc_record_inventory_disposition: return_line % not found on return %', v_disp_line_id, p_return_id;
      end if;

      perform public._record_inventory_disposition(
        p_return_line_id   => v_disp_line_id,
        p_disposition_type => 'send_for_repair',
        p_qty              => v_disp_qty,
        p_notes            => v_disp->>'notes',
        p_warehouse_id     => p_warehouse_id
      );

    else
      raise exception 'rpc_record_inventory_disposition: unknown disposition type %', v_disp_type;
    end if;

    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    perform public._maybe_close_return(p_return_id);
  end if;
  return v_count;
end;
$$;


--
-- Name: rpc_record_return_refund(uuid, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_return_refund(p_return_id uuid, p_lines jsonb, p_refund_method text DEFAULT NULL::text, p_refund_reference text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cn_id uuid;
  v_line  jsonb;
  v_count int := 0;
begin
  select credit_note_id into v_cn_id
    from public.so_po_returns
    where id = p_return_id and deleted_at is null;
  if v_cn_id is null then
    raise exception 'rpc_record_return_refund: return % has no linked credit note', p_return_id;
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'rpc_record_return_refund: p_lines must be a non-empty array';
  end if;

  if p_refund_method is not null or p_refund_reference is not null then
    update public.credit_notes
      set refund_method = coalesce(p_refund_method, refund_method),
          refund_reference = coalesce(p_refund_reference, refund_reference)
      where id = v_cn_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    perform public._record_customer_resolution(
      p_return_line_id  => (v_line->>'return_line_id')::uuid,
      p_resolution_type => 'refund',
      p_qty             => (v_line->>'qty')::numeric,
      p_credit_note_id  => v_cn_id
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'rpc_record_return_refund: no lines processed';
  end if;

  perform public._maybe_close_return(p_return_id);
end;
$$;


--
-- Name: rpc_record_return_store_credit(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_record_return_store_credit(p_return_id uuid, p_lines jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cn_id uuid;
  v_line  jsonb;
  v_count int := 0;
begin
  select credit_note_id into v_cn_id
    from public.so_po_returns
    where id = p_return_id and deleted_at is null;
  if v_cn_id is null then
    raise exception 'rpc_record_return_store_credit: return % has no linked credit note', p_return_id;
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'rpc_record_return_store_credit: p_lines must be a non-empty array';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    perform public._record_customer_resolution(
      p_return_line_id  => (v_line->>'return_line_id')::uuid,
      p_resolution_type => 'store_credit',
      p_qty             => (v_line->>'qty')::numeric,
      p_credit_note_id  => v_cn_id
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'rpc_record_return_store_credit: no lines processed';
  end if;

  perform public._maybe_close_return(p_return_id);
end;
$$;


--
-- Name: rpc_request_consumption_edit(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_request_consumption_edit(p_consumption_id uuid, p_reason text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid       uuid := public._current_user_data_id();
  v_status    text;
  v_request_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: not authenticated';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: reason is required';
  END IF;

  SELECT status INTO v_status
    FROM public.consumption_entries
    WHERE id = p_consumption_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: consumption % not found', p_consumption_id;
  END IF;
  IF v_status <> 'posted' THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: consumption % is % (only posted entries can be requested)', p_consumption_id, v_status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.consumption_edit_requests
    WHERE consumption_id = p_consumption_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: a pending request already exists for this consumption';
  END IF;

  INSERT INTO public.consumption_edit_requests (
    consumption_id, requested_by, reason
  ) VALUES (
    p_consumption_id, v_uid, btrim(p_reason)
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;


--
-- Name: rpc_request_damaged_writeoff(uuid, uuid, integer, uuid, text, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_request_damaged_writeoff(p_warehouse_id uuid, p_brand_variant_id uuid, p_qty integer, p_sub_container_id uuid, p_reason text, p_notes text, p_requested_by uuid, p_requested_by_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_available   numeric;
  v_check_wh    uuid;
  v_check_active boolean;
  v_id          uuid;
  v_step        RECORD;
  v_ord         int := 0;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: qty must be > 0 (got %)', p_qty;
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: reason is required';
  END IF;

  IF p_sub_container_id IS NULL THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: sub_container_id is required — pick one on the dialog.';
  END IF;

  SELECT sc.warehouse_id, sc.is_active
    INTO v_check_wh, v_check_active
    FROM public.warehouse_sub_containers sc
    WHERE sc.id = p_sub_container_id;

  IF NOT FOUND OR v_check_active IS NOT TRUE THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: sub-container % not found or inactive', p_sub_container_id;
  END IF;
  IF v_check_wh <> p_warehouse_id THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: sub-container % does not belong to warehouse %',
      p_sub_container_id, p_warehouse_id;
  END IF;

  SELECT COALESCE(qty, 0)
    INTO v_available
    FROM public.inventory_damaged_stock
    WHERE warehouse_id     = p_warehouse_id
      AND brand_variant_id = p_brand_variant_id;

  IF COALESCE(v_available, 0) < p_qty THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: damaged pile at % / % is short (available %, requested %)',
      p_warehouse_id, p_brand_variant_id, COALESCE(v_available, 0), p_qty;
  END IF;

  INSERT INTO public.stock_adjustments (
    warehouse_id, sub_container_id, brand_variant_id,
    adjustment_type, qty,
    reason, notes, photo_urls, status,
    requested_by, requested_by_name,
    source_pile
  ) VALUES (
    p_warehouse_id, p_sub_container_id, p_brand_variant_id,
    'write_off'::public.stock_adjustment_type, p_qty,
    p_reason, NULLIF(p_notes, ''), '{}'::text[], 'pending_approval',
    p_requested_by, p_requested_by_name,
    'damaged'
  )
  RETURNING id INTO v_id;

  FOR v_step IN
    SELECT step_key, step_label, is_conditional, condition_types
    FROM   public.approval_workflow_steps
    WHERE  workflow = 'stock_adj'
      AND  is_active = true
      AND  archived_at IS NULL
    ORDER  BY step_order
  LOOP
    IF v_step.is_conditional AND NOT ('write_off' = ANY(v_step.condition_types)) THEN
      CONTINUE;
    END IF;

    v_ord := v_ord + 1;
    INSERT INTO public.stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
    VALUES (v_id, v_ord, v_step.step_key, v_step.step_label);
  END LOOP;

  IF v_ord = 0 THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: no approval steps configured for stock_adj workflow';
  END IF;

  RETURN v_id;
END;
$$;


--
-- Name: rpc_return_damaged_from_repair(uuid, text, numeric, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_return_damaged_from_repair(p_transfer_id uuid, p_outcome text, p_qty_good numeric, p_qty_writeoff numeric, p_repair_cost numeric DEFAULT 0, p_notes text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_transfer              record;
  v_disp_id               uuid;
  v_variant               uuid;
  v_qty_out               numeric;
  v_unit_cost_base        numeric;
  v_unit_cost_good        numeric;
  v_wh_source             uuid;
  v_wh_vendor             uuid;
  v_from_sub_container_id uuid;
  v_to_sub_container_id   uuid;
  v_item_name             text;
  v_item_sku              text;
  v_new_transfer          uuid;
  v_transfer_num          text;
  v_uid                   uuid := public._current_user_data_id();
begin
  if p_outcome not in ('good','writeoff','mixed') then
    raise exception 'rpc_return_damaged_from_repair: invalid outcome % (expected good | writeoff | mixed)', p_outcome;
  end if;
  if coalesce(p_qty_good, 0) < 0 or coalesce(p_qty_writeoff, 0) < 0 then
    raise exception 'rpc_return_damaged_from_repair: qty values must be >= 0';
  end if;
  if coalesce(p_repair_cost, 0) < 0 then
    raise exception 'rpc_return_damaged_from_repair: repair_cost must be >= 0';
  end if;
  if p_outcome = 'good'     and coalesce(p_qty_writeoff, 0) > 0 then
    raise exception 'rpc_return_damaged_from_repair: outcome=good but qty_writeoff=%', p_qty_writeoff;
  end if;
  if p_outcome = 'writeoff' and coalesce(p_qty_good, 0) > 0 then
    raise exception 'rpc_return_damaged_from_repair: outcome=writeoff but qty_good=%', p_qty_good;
  end if;
  if p_outcome = 'mixed'    and (coalesce(p_qty_good, 0) = 0 or coalesce(p_qty_writeoff, 0) = 0) then
    raise exception 'rpc_return_damaged_from_repair: outcome=mixed requires both qty_good and qty_writeoff > 0';
  end if;

  select id, transfer_kind, status, from_warehouse_id, to_warehouse_id,
         repair_vendor_id, source_return_line_disposition_id,
         from_sub_container_id, to_sub_container_id
    into v_transfer
    from public.warehouse_transfers
    where id = p_transfer_id
    for update;
  if not found then
    raise exception 'rpc_return_damaged_from_repair: transfer % not found', p_transfer_id;
  end if;
  if v_transfer.transfer_kind <> 'damaged_repair_out' then
    raise exception 'rpc_return_damaged_from_repair: transfer % kind is % (expected damaged_repair_out)',
      p_transfer_id, v_transfer.transfer_kind;
  end if;
  if v_transfer.status <> 'in_transit' then
    raise exception 'rpc_return_damaged_from_repair: transfer % status is % (expected in_transit)',
      p_transfer_id, v_transfer.status;
  end if;

  v_disp_id   := v_transfer.source_return_line_disposition_id;
  v_wh_source := v_transfer.from_warehouse_id;
  v_wh_vendor := v_transfer.to_warehouse_id;

  select brand_variant_id, item_name, sku, requested_qty::numeric, unit_cost
    into v_variant, v_item_name, v_item_sku, v_qty_out, v_unit_cost_base
    from public.warehouse_transfer_items
    where transfer_id = p_transfer_id
    order by created_at
    limit 1;

  if v_variant is null then
    raise exception 'rpc_return_damaged_from_repair: transfer % has no warehouse_transfer_items row', p_transfer_id;
  end if;

  -- The FROM sub-container of the outbound transfer IS the destination the
  -- stock returns to. Skip the derive cascade — the answer was stamped when
  -- we sent it out.
  v_from_sub_container_id := v_transfer.to_sub_container_id;
  v_to_sub_container_id   := v_transfer.from_sub_container_id;

  if v_from_sub_container_id is null then
    raise exception 'rpc_return_damaged_from_repair: transfer % has no to_sub_container_id (pre-D.4 legacy?)', p_transfer_id;
  end if;
  if v_to_sub_container_id is null then
    raise exception 'rpc_return_damaged_from_repair: transfer % has no from_sub_container_id — cannot determine where to return the repaired stock. (pre-D.4 legacy?)', p_transfer_id;
  end if;

  if coalesce(p_qty_good, 0) + coalesce(p_qty_writeoff, 0) <> v_qty_out then
    raise exception 'rpc_return_damaged_from_repair: qty_good (%) + qty_writeoff (%) must equal transfer qty (%)',
      p_qty_good, p_qty_writeoff, v_qty_out;
  end if;

  v_unit_cost_good := coalesce(v_unit_cost_base, 0)
                    + case when coalesce(p_qty_good, 0) > 0
                           then coalesce(p_repair_cost, 0) / p_qty_good
                           else 0 end;

  if p_qty_good > 0 then
    insert into public.fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type, source_id,
      sub_container_id
    ) values (
      v_variant, v_wh_source, current_date,
      p_qty_good::integer, v_unit_cost_good, 0, v_unit_cost_good, p_qty_good::integer,
      'damaged_repair_return', p_transfer_id,
      v_to_sub_container_id
    );

    update public.inventory_item_brand_variants
       set stock_level = stock_level + p_qty_good::integer,
           updated_at  = now()
     where id = v_variant;

    insert into public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes,
      sub_container_id
    ) values (
      v_wh_source, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      'damaged_return_from_repair_as_good'::public.stock_movement_type,
      p_qty_good::integer, v_unit_cost_good,
      'warehouse_transfer', p_transfer_id,
      coalesce(p_notes, format('Return from repair (transfer %s) — %s units good, repair cost %s',
                               v_transfer.repair_vendor_id, p_qty_good, coalesce(p_repair_cost, 0))),
      v_to_sub_container_id
    );

    perform public.recalc_average_cost(v_variant);

    v_transfer_num := public.generate_transfer_number();
    insert into public.warehouse_transfers (
      transfer_number, from_warehouse_id, to_warehouse_id,
      status, date, notes,
      transfer_kind, repair_vendor_id, source_return_line_disposition_id, repair_cost,
      from_sub_container_id, to_sub_container_id,
      created_by_profile_id, received_by_profile_id, received_at
    ) values (
      v_transfer_num, v_wh_vendor, v_wh_source,
      'received', current_date, p_notes,
      'damaged_repair_return_good', v_transfer.repair_vendor_id, v_disp_id, p_repair_cost,
      v_from_sub_container_id, v_to_sub_container_id,
      v_uid, v_uid, now()
    )
    returning id into v_new_transfer;

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, received_qty,
      sub_container_id
    ) values (
      v_new_transfer, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      p_qty_good::integer, v_unit_cost_good, p_qty_good::integer,
      v_to_sub_container_id
    );
  end if;

  if p_qty_writeoff > 0 then
    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, source_transfer_id, notes, created_by)
    values (
      'return_from_repair_as_writeoff', p_qty_writeoff, v_wh_source, v_variant, coalesce(v_unit_cost_base, 0),
      v_disp_id, p_transfer_id,
      coalesce(p_notes, format('Return from repair — %s units written off (unrecoverable)', p_qty_writeoff)),
      v_uid
    );

    v_transfer_num := public.generate_transfer_number();
    insert into public.warehouse_transfers (
      transfer_number, from_warehouse_id, to_warehouse_id,
      status, date, notes,
      transfer_kind, repair_vendor_id, source_return_line_disposition_id,
      from_sub_container_id, to_sub_container_id,
      created_by_profile_id, received_by_profile_id, received_at
    ) values (
      v_transfer_num, v_wh_vendor, v_wh_source,
      'received', current_date, p_notes,
      'damaged_repair_return_writeoff', v_transfer.repair_vendor_id, v_disp_id,
      v_from_sub_container_id, v_to_sub_container_id,
      v_uid, v_uid, now()
    )
    returning id into v_new_transfer;

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, received_qty,
      sub_container_id
    ) values (
      v_new_transfer, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      p_qty_writeoff::integer, coalesce(v_unit_cost_base, 0), 0,
      v_to_sub_container_id
    );
  end if;

  update public.warehouse_transfers
     set status                 = 'received',
         received_at            = now(),
         received_by_profile_id = v_uid,
         repair_cost            = coalesce(p_repair_cost, 0)
   where id = p_transfer_id;
end;
$$;


--
-- Name: rpc_sales_aging_report(); Type: FUNCTION; Schema: public; Owner: -
--

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
  FROM so_invoices i
  JOIN customers c ON c.id = i.customer_id
  WHERE i.payment_status != 'paid'
    AND i.total_amount - i.paid_amount > 0
  GROUP BY i.customer_id, c.name
  ORDER BY total_outstanding DESC;
$$;


--
-- Name: rpc_send_damaged_for_repair(uuid, uuid, uuid, date, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_send_damaged_for_repair(p_return_line_disposition_id uuid, p_repair_vendor_id uuid, p_warehouse_id uuid, p_expected_return_date date, p_notes text DEFAULT NULL::text, p_source_division_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_disp                  record;
  v_return_line           record;
  v_return                record;
  v_vendor                record;
  v_transfer_id           uuid;
  v_transfer_number       text;
  v_unit_cost             numeric;
  v_current_damaged       numeric;
  v_source_division       uuid;
  v_sub_ct                int;
  v_from_sub_container_id uuid;
  v_to_sub_container_id   uuid;
  v_uid                   uuid := public._current_user_data_id();
begin
  select id, return_line_id, disposition_type, qty, warehouse_transfer_id
    into v_disp
    from public.return_line_inventory_dispositions
    where id = p_return_line_disposition_id
    for update;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: disposition % not found', p_return_line_disposition_id;
  end if;
  if v_disp.disposition_type <> 'send_for_repair' then
    raise exception 'rpc_send_damaged_for_repair: disposition % is % (expected send_for_repair)',
      p_return_line_disposition_id, v_disp.disposition_type;
  end if;
  if v_disp.warehouse_transfer_id is not null then
    raise exception 'rpc_send_damaged_for_repair: disposition % already linked to transfer %',
      p_return_line_disposition_id, v_disp.warehouse_transfer_id;
  end if;

  select id, virtual_warehouse_id, sub_container_id, is_active, name
    into v_vendor
    from public.repair_vendors
    where id = p_repair_vendor_id;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % not found', p_repair_vendor_id;
  end if;
  if not v_vendor.is_active then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % is inactive', p_repair_vendor_id;
  end if;
  if v_vendor.virtual_warehouse_id is null then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % has no virtual warehouse (trigger misfire?)', p_repair_vendor_id;
  end if;
  if v_vendor.sub_container_id is null then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % has no sub_container_id (D.6.b backfill missed?)', p_repair_vendor_id;
  end if;

  select rl.brand_variant_id, rl.return_id, rl.item_name, rl.sku
    into v_return_line
    from public.return_lines rl
    where rl.id = v_disp.return_line_id;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: return_line % not found', v_disp.return_line_id;
  end if;

  select r.division_id, r.source_type, r.source_id
    into v_return
    from public.so_po_returns r
    where r.id = v_return_line.return_id;

  -- Cascade: explicit override → return → parent SO/PO → cogs_entries → single sub.
  v_source_division := p_source_division_id;

  if v_source_division is null then
    v_source_division := v_return.division_id;
  end if;

  if v_source_division is null and v_return.source_type = 'sale_order' then
    select so.division_id
      into v_source_division
      from public.sale_orders so
      where so.id = v_return.source_id;
  end if;

  if v_source_division is null and v_return.source_type = 'purchase_order' then
    select po.division_id
      into v_source_division
      from public.purchase_orders po
      where po.id = v_return.source_id;
  end if;

  if v_source_division is null and v_return.source_type = 'sale_order' then
    select ce.division_id
      into v_source_division
      from public.cogs_entries ce
      where ce.sale_order_id = v_return.source_id
        and ce.division_id is not null
      order by ce.date asc, ce.created_at asc
      limit 1;
  end if;

  if v_source_division is null then
    select count(*)
      into v_sub_ct
      from public.warehouse_sub_containers wsc
      where wsc.warehouse_id = p_warehouse_id;

    if v_sub_ct = 1 then
      select wsc.division_id
        into v_source_division
        from public.warehouse_sub_containers wsc
        where wsc.warehouse_id = p_warehouse_id
        limit 1;
    end if;
  end if;

  if v_source_division is null then
    raise exception 'rpc_send_damaged_for_repair: cannot derive source division. Return %/% has no division_id, parent %/% has no division_id, no cogs_entries division stamped, and warehouse % has % sub-containers. Pass p_source_division_id explicitly.',
      v_return.source_type, v_return_line.return_id,
      v_return.source_type, v_return.source_id,
      p_warehouse_id, v_sub_ct;
  end if;

  if p_warehouse_id = v_vendor.virtual_warehouse_id then
    raise exception 'rpc_send_damaged_for_repair: source warehouse cannot be the vendor virtual warehouse';
  end if;

  v_unit_cost := public._return_line_fifo_unit_cost(v_return_line.return_id, v_disp.return_line_id, v_disp.qty);

  select coalesce(qty, 0)
    into v_current_damaged
    from public.inventory_damaged_stock
    where warehouse_id = p_warehouse_id
      and brand_variant_id = v_return_line.brand_variant_id;

  if coalesce(v_current_damaged, 0) < v_disp.qty then
    insert into public.inventory_damaged_stock_layers
      (warehouse_id, brand_variant_id, qty_received, qty_remaining, unit_cost, source_return_line_id, created_by)
    values
      (p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty, v_disp.qty, v_unit_cost, v_disp.return_line_id, v_uid);

    insert into public.inventory_damaged_stock (warehouse_id, brand_variant_id, qty, weighted_unit_cost)
    values (p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty, v_unit_cost)
    on conflict (warehouse_id, brand_variant_id) do update
      set qty = inventory_damaged_stock.qty + excluded.qty,
          weighted_unit_cost = (
            (inventory_damaged_stock.qty * inventory_damaged_stock.weighted_unit_cost)
            + (excluded.qty * excluded.weighted_unit_cost)
          ) / (inventory_damaged_stock.qty + excluded.qty),
          updated_at = now();

    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, notes, created_by)
    values (
      'restock_as_damaged_in', v_disp.qty, p_warehouse_id, v_return_line.brand_variant_id, v_unit_cost,
      v_disp.id, coalesce(p_notes, 'Implicit restock-as-damaged before send-for-repair'), v_uid
    );
  end if;

  v_from_sub_container_id := public._find_or_create_sub_container(p_warehouse_id, v_source_division);
  v_to_sub_container_id   := v_vendor.sub_container_id;

  v_transfer_number := public.generate_transfer_number();

  insert into public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    transfer_kind, repair_vendor_id, source_return_line_disposition_id, expected_return_date,
    from_sub_container_id, to_sub_container_id,
    created_by_profile_id, dispatched_by_profile_id, dispatched_at
  ) values (
    v_transfer_number, p_warehouse_id, v_vendor.virtual_warehouse_id,
    'in_transit', current_date, p_notes,
    'damaged_repair_out', p_repair_vendor_id, p_return_line_disposition_id, p_expected_return_date,
    v_from_sub_container_id, v_to_sub_container_id,
    v_uid, v_uid, now()
  )
  returning id into v_transfer_id;

  insert into public.warehouse_transfer_items (
    transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, dispatched_qty,
    sub_container_id
  ) values (
    v_transfer_id, v_return_line.brand_variant_id,
    coalesce(v_return_line.item_name, ''), nullif(v_return_line.sku, ''),
    v_disp.qty::integer, v_unit_cost, v_disp.qty::integer,
    v_from_sub_container_id
  );

  perform public._consume_damaged_stock_fifo(p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty);

  insert into public.inventory_damaged_movements
    (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
     source_return_line_disposition_id, source_transfer_id, notes, created_by)
  values (
    'send_for_repair_out', v_disp.qty, p_warehouse_id, v_return_line.brand_variant_id, v_unit_cost,
    v_disp.id, v_transfer_id, p_notes, v_uid
  );

  update public.return_line_inventory_dispositions
     set warehouse_transfer_id = v_transfer_id
   where id = p_return_line_disposition_id;

  return v_transfer_id;
end;
$$;


--
-- Name: rpc_send_damaged_stock_for_repair(uuid, uuid, integer, uuid, date, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_send_damaged_stock_for_repair(p_warehouse_id uuid, p_brand_variant_id uuid, p_qty integer, p_repair_vendor_id uuid, p_expected_return_date date, p_source_division_id uuid, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_vendor                record;
  v_available             numeric;
  v_transfer_id           uuid;
  v_transfer_number       text;
  v_unit_cost             numeric;
  v_item_name             text;
  v_item_sku              text;
  v_from_sub_container_id uuid;
  v_to_sub_container_id   uuid;
  v_uid                   uuid := public._current_user_data_id();
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'rpc_send_damaged_stock_for_repair: qty must be > 0 (got %)', p_qty;
  end if;
  if p_source_division_id is null then
    raise exception 'rpc_send_damaged_stock_for_repair: source_division_id is required — pick one on the dialog';
  end if;

  select id, virtual_warehouse_id, sub_container_id, is_active, name
    into v_vendor
    from public.repair_vendors
    where id = p_repair_vendor_id;
  if not found then
    raise exception 'rpc_send_damaged_stock_for_repair: repair vendor % not found', p_repair_vendor_id;
  end if;
  if not v_vendor.is_active then
    raise exception 'rpc_send_damaged_stock_for_repair: repair vendor % is inactive', p_repair_vendor_id;
  end if;
  if v_vendor.virtual_warehouse_id is null then
    raise exception 'rpc_send_damaged_stock_for_repair: repair vendor % has no virtual warehouse', p_repair_vendor_id;
  end if;
  if v_vendor.sub_container_id is null then
    raise exception 'rpc_send_damaged_stock_for_repair: repair vendor % has no sub_container_id', p_repair_vendor_id;
  end if;
  if p_warehouse_id = v_vendor.virtual_warehouse_id then
    raise exception 'rpc_send_damaged_stock_for_repair: source warehouse cannot be the vendor virtual warehouse';
  end if;

  select coalesce(qty, 0), coalesce(weighted_unit_cost, 0)
    into v_available, v_unit_cost
    from public.inventory_damaged_stock
    where warehouse_id     = p_warehouse_id
      and brand_variant_id = p_brand_variant_id;

  if coalesce(v_available, 0) < p_qty then
    raise exception 'rpc_send_damaged_stock_for_repair: damaged pile at % / % is short (available %, requested %)',
      p_warehouse_id, p_brand_variant_id, coalesce(v_available, 0), p_qty;
  end if;

  -- Human-readable labels for the transfer_item row.
  select coalesce(ii.name_en, ''), coalesce(ii.sku, '')
    into v_item_name, v_item_sku
    from public.inventory_item_brand_variants bv
    left join public.inventory_items ii on ii.id = bv.item_id
    where bv.id = p_brand_variant_id;

  v_from_sub_container_id := public._find_or_create_sub_container(p_warehouse_id, p_source_division_id);
  v_to_sub_container_id   := v_vendor.sub_container_id;

  v_transfer_number := public.generate_transfer_number();

  insert into public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    transfer_kind, repair_vendor_id, source_return_line_disposition_id, expected_return_date,
    from_sub_container_id, to_sub_container_id,
    created_by_profile_id, dispatched_by_profile_id, dispatched_at
  ) values (
    v_transfer_number, p_warehouse_id, v_vendor.virtual_warehouse_id,
    'in_transit', current_date, p_notes,
    'damaged_repair_out', p_repair_vendor_id, NULL, p_expected_return_date,
    v_from_sub_container_id, v_to_sub_container_id,
    v_uid, v_uid, now()
  )
  returning id into v_transfer_id;

  insert into public.warehouse_transfer_items (
    transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, dispatched_qty,
    sub_container_id
  ) values (
    v_transfer_id, p_brand_variant_id,
    v_item_name, nullif(v_item_sku, ''),
    p_qty, v_unit_cost, p_qty,
    v_from_sub_container_id
  );

  perform public._consume_damaged_stock_fifo(p_warehouse_id, p_brand_variant_id, p_qty);

  insert into public.inventory_damaged_movements
    (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
     source_transfer_id, notes, created_by)
  values (
    'send_for_repair_out', p_qty, p_warehouse_id, p_brand_variant_id, v_unit_cost,
    v_transfer_id,
    coalesce(p_notes, 'Ad-hoc send-for-repair from Damaged Stock On-hand'),
    v_uid
  );

  return v_transfer_id;
end;
$$;


--
-- Name: rpc_update_document_initial_rate(text, uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_update_document_initial_rate(p_document_type text, p_document_id uuid, p_new_rate numeric, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old_rate    numeric;
  v_auth_uid    uuid := auth.uid();
  v_user_data_id uuid;
BEGIN
  IF p_new_rate IS NULL OR p_new_rate <= 0 THEN
    RAISE EXCEPTION 'new_rate must be positive';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason must be at least 5 characters';
  END IF;
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is null — must be called by an authenticated user';
  END IF;

  SELECT id INTO v_user_data_id
    FROM public.user_data
   WHERE auth_user_id = v_auth_uid
   LIMIT 1;

  IF v_user_data_id IS NULL THEN
    RAISE EXCEPTION 'no user_data row for auth user %', v_auth_uid;
  END IF;

  IF p_document_type = 'po' THEN
    SELECT initial_exchange_rate INTO v_old_rate
      FROM public.purchase_orders WHERE id = p_document_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PO % not found', p_document_id; END IF;

    UPDATE public.purchase_orders
       SET initial_exchange_rate    = p_new_rate,
           exchange_rate            = p_new_rate,
           initial_rate_captured_at = now(),
           initial_rate_captured_by = v_user_data_id
     WHERE id = p_document_id;
  ELSIF p_document_type = 'so' THEN
    SELECT initial_exchange_rate INTO v_old_rate
      FROM public.sale_orders WHERE id = p_document_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SO % not found', p_document_id; END IF;

    UPDATE public.sale_orders
       SET initial_exchange_rate    = p_new_rate,
           exchange_rate            = p_new_rate,
           initial_rate_captured_at = now(),
           initial_rate_captured_by = v_user_data_id
     WHERE id = p_document_id;
  ELSE
    RAISE EXCEPTION 'Unknown document_type %', p_document_type;
  END IF;

  INSERT INTO public.exchange_rate_change_log
    (document_type, document_id, old_rate, new_rate, reason, changed_by)
  VALUES (p_document_type, p_document_id, v_old_rate, p_new_rate, p_reason, v_user_data_id);

  PERFORM public.rpc_recompute_document_fx(p_document_type, p_document_id);
END $$;


--
-- Name: rpc_upsert_team_or_place(text, text, uuid, uuid, boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_upsert_team_or_place(p_kind text, p_name text, p_division_id uuid, p_id uuid DEFAULT NULL::uuid, p_is_active boolean DEFAULT NULL::boolean, p_responsible_person_profile_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_wh_id  uuid;
  v_new_id uuid;
BEGIN
  IF p_kind NOT IN ('teams', 'places') THEN
    RAISE EXCEPTION 'rpc_upsert_team_or_place: kind must be teams or places (got %)', p_kind;
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'rpc_upsert_team_or_place: name is required';
  END IF;
  IF p_division_id IS NULL THEN
    RAISE EXCEPTION 'rpc_upsert_team_or_place: division_id is required';
  END IF;

  SELECT id INTO v_wh_id
  FROM   public.warehouses
  WHERE  warehouse_kind = p_kind;

  IF v_wh_id IS NULL THEN
    RAISE EXCEPTION 'rpc_upsert_team_or_place: shared % warehouse not found (seed migration missing?)', p_kind;
  END IF;

  IF p_id IS NULL THEN
    -- Create — responsible person can be NULL (assign later).
    INSERT INTO public.warehouse_sub_containers (
      warehouse_id, division_id, name, is_active,
      responsible_person_profile_id
    )
    VALUES (
      v_wh_id, p_division_id, btrim(p_name), COALESCE(p_is_active, true),
      p_responsible_person_profile_id
    )
    RETURNING id INTO v_new_id;
    RETURN v_new_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouse_sub_containers
    WHERE id = p_id AND warehouse_id = v_wh_id
  ) THEN
    RAISE EXCEPTION 'rpc_upsert_team_or_place: sub-container % not found under % warehouse', p_id, p_kind;
  END IF;

  -- Update. Every param that came in as NULL means "leave alone" for the
  -- fields where NULL is a valid "unset" too we can't distinguish; we use
  -- a sentinel-free convention consistent with the prior implementation:
  --   - is_active: NULL = leave alone (COALESCE with old value).
  --   - responsible_person_profile_id: on update we want callers to be
  --     able to clear the assignment too, so we always overwrite with the
  --     passed value (NULL means "clear"). This mirrors the way
  --     name / division_id are always overwritten.
  UPDATE public.warehouse_sub_containers
     SET name                          = btrim(p_name),
         division_id                   = p_division_id,
         is_active                     = COALESCE(p_is_active, is_active),
         responsible_person_profile_id = p_responsible_person_profile_id,
         updated_at                    = now()
   WHERE id = p_id;

  RETURN p_id;
END;
$$;


--
-- Name: rpc_upsert_warehouse_sub_container(uuid, text, uuid, uuid, boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_upsert_warehouse_sub_container(p_warehouse_id uuid, p_name text, p_division_id uuid DEFAULT NULL::uuid, p_id uuid DEFAULT NULL::uuid, p_is_active boolean DEFAULT NULL::boolean, p_responsible_person_profile_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_wh_kind text;
  v_is_virtual boolean;
  v_new_id uuid;
BEGIN
  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'warehouse_id is required';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  SELECT warehouse_kind, is_virtual
    INTO v_wh_kind, v_is_virtual
    FROM public.warehouses
    WHERE id = p_warehouse_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Warehouse % not found', p_warehouse_id;
  END IF;

  -- Shape rules per warehouse kind:
  --   general / any real WH → division_id REQUIRED
  --   teams / places        → division_id REQUIRED (each team / place is scoped to one division)
  --   repair                → division_id OPTIONAL (nullable — vendors are cross-division)
  IF v_wh_kind IN ('teams', 'places') THEN
    IF p_division_id IS NULL THEN
      RAISE EXCEPTION 'Division is required for % sub-containers.', v_wh_kind;
    END IF;
  ELSIF NOT COALESCE(v_is_virtual, false) THEN
    IF p_division_id IS NULL THEN
      RAISE EXCEPTION 'Division is required for real-warehouse sub-containers.';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    -- Create
    INSERT INTO public.warehouse_sub_containers (
      warehouse_id, division_id, name, is_active,
      responsible_person_profile_id
    )
    VALUES (
      p_warehouse_id, p_division_id, btrim(p_name), COALESCE(p_is_active, true),
      p_responsible_person_profile_id
    )
    RETURNING id INTO v_new_id;
    RETURN v_new_id;
  END IF;

  -- Update. Verify the sub actually belongs to the requested warehouse so
  -- callers can't retarget a foreign sub.
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouse_sub_containers
    WHERE id = p_id AND warehouse_id = p_warehouse_id
  ) THEN
    RAISE EXCEPTION 'Sub-container % is not under warehouse %.', p_id, p_warehouse_id;
  END IF;

  UPDATE public.warehouse_sub_containers
     SET name                          = btrim(p_name),
         division_id                   = COALESCE(p_division_id, division_id),
         is_active                     = COALESCE(p_is_active, is_active),
         responsible_person_profile_id = p_responsible_person_profile_id,
         updated_at                    = now()
   WHERE id = p_id;

  RETURN p_id;
END;
$$;


--
-- Name: sale_order_lines_invalidate_parent_pdf_fn(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: sale_orders_invalidate_pdf_cache_fn(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: save_customer_phones(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_customer_phones(p_customer_id uuid, p_phones jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_phones        text[];
  v_primary_count int;
  v_conflict_row  record;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id is required';
  END IF;

  IF p_phones IS NULL OR jsonb_typeof(p_phones) <> 'array' OR jsonb_array_length(p_phones) = 0 THEN
    RAISE EXCEPTION 'At least one phone is required';
  END IF;

  SELECT count(*) INTO v_primary_count
  FROM jsonb_array_elements(p_phones) elem
  WHERE (elem->>'is_primary')::boolean IS TRUE;

  IF v_primary_count <> 1 THEN
    RAISE EXCEPTION 'Exactly one phone must be marked primary (got %)', v_primary_count;
  END IF;

  SELECT array_agg(elem->>'phone') INTO v_phones
  FROM jsonb_array_elements(p_phones) elem;

  -- Cross-customer collision check.
  SELECT cp.phone, cp.customer_id
    INTO v_conflict_row
    FROM public.customer_phones cp
   WHERE cp.phone = ANY(v_phones)
     AND cp.customer_id <> p_customer_id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Phone number % is already assigned to another customer', v_conflict_row.phone
      USING ERRCODE = '23505';
  END IF;

  -- Remove rows on this customer that aren't in the new list.
  DELETE FROM public.customer_phones
   WHERE customer_id = p_customer_id
     AND phone <> ALL(v_phones);

  -- Upsert. ON CONFLICT (phone) is safe here — the collision check above
  -- already established that every phone in the list either doesn't
  -- exist yet or already belongs to this customer.
  INSERT INTO public.customer_phones (customer_id, phone, is_primary)
  SELECT p_customer_id,
         elem->>'phone',
         (elem->>'is_primary')::boolean
    FROM jsonb_array_elements(p_phones) elem
   ON CONFLICT (phone) DO UPDATE
     SET is_primary = EXCLUDED.is_primary;
END;
$$;


--
-- Name: save_inventory_check_item_count(uuid, numeric, text, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_inventory_check_item_count(p_item_id uuid, p_counted_qty numeric, p_variance_type text, p_assignment_id uuid DEFAULT NULL::uuid, p_profile_id uuid DEFAULT NULL::uuid, p_profile_name text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_check_id uuid;
BEGIN
  UPDATE inventory_check_items
  SET
    counted_qty   = p_counted_qty,
    is_counted    = true,
    variance_type = p_variance_type,
    updated_at    = now()
  WHERE id = p_item_id;

  -- Idempotent assignment transition + log event on first count-save.
  IF p_assignment_id IS NOT NULL THEN
    UPDATE inventory_check_assignments
    SET status     = 'in_progress',
        started_at = now(),
        updated_at = now()
    WHERE id     = p_assignment_id
      AND status = 'pending'
    RETURNING check_id INTO v_check_id;

    -- Only insert the log row when the UPDATE actually fired
    -- (i.e. the assignment was still pending). v_check_id stays
    -- NULL for the second-and-later save on the same assignment.
    IF v_check_id IS NOT NULL THEN
      INSERT INTO inventory_check_log (
        check_id, event_type, profile_id, profile_name, meta
      ) VALUES (
        v_check_id,
        'user_started',
        p_profile_id,
        p_profile_name,
        jsonb_build_object('assignment_id', p_assignment_id)
      );
    END IF;
  END IF;
END;
$$;


--
-- Name: save_order_quotation(text, uuid, text, text, numeric, text, date, timestamp with time zone, jsonb, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_order_quotation(p_quotation_id text, p_service_customer_id uuid, p_division text, p_status text, p_total_amount numeric, p_notes text, p_expiry_date date, p_sent_date timestamp with time zone, p_line_items jsonb, p_discount_type text DEFAULT 'flat'::text, p_discount_value numeric DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_uuid uuid;
  v_item jsonb;
BEGIN
  INSERT INTO public.order_quotations (
    quotation_id, service_customer_id, division, status,
    total_amount, notes, created_date, expiry_date, sent_date,
    discount_type, discount_value
  ) VALUES (
    p_quotation_id,
    p_service_customer_id,
    p_division,
    p_status::order_quotation_status,
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
    expiry_date         = COALESCE(EXCLUDED.expiry_date, order_quotations.expiry_date),
    sent_date           = EXCLUDED.sent_date,
    discount_type       = EXCLUDED.discount_type,
    discount_value      = EXCLUDED.discount_value
  RETURNING id INTO v_uuid;

  DELETE FROM public.order_quotation_line_items WHERE quotation_id = v_uuid;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_line_items, '[]'::jsonb)) LOOP
    INSERT INTO public.order_quotation_line_items (
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
-- Name: search_customers(text, boolean, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_customers(p_query text DEFAULT NULL::text, p_only_active boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_norm    text := NULLIF(BTRIM(COALESCE(p_query, '')), '');
  v_pattern text := CASE WHEN v_norm IS NULL THEN NULL
                         ELSE '%' || REPLACE(REPLACE(v_norm, '\', '\\'), '%', '\%') || '%'
                    END;
  v_total   bigint;
  v_rows    jsonb;
BEGIN
  WITH matched AS (
    SELECT DISTINCT c.id
    FROM   public.customers c
    LEFT   JOIN public.customer_phones cp ON cp.customer_id = c.id
    WHERE  (NOT p_only_active OR c.is_active)
      AND  (v_pattern IS NULL
            OR c.name ILIKE v_pattern
            OR cp.phone ILIKE v_pattern)
  )
  SELECT COUNT(*) INTO v_total FROM matched;

  WITH matched AS (
    SELECT DISTINCT c.id, c.name
    FROM   public.customers c
    LEFT   JOIN public.customer_phones cp ON cp.customer_id = c.id
    WHERE  (NOT p_only_active OR c.is_active)
      AND  (v_pattern IS NULL
            OR c.name ILIKE v_pattern
            OR cp.phone ILIKE v_pattern)
    ORDER BY c.name
    LIMIT  GREATEST(p_limit, 0)
    OFFSET GREATEST(p_offset, 0)
  )
  SELECT jsonb_agg(row)
  INTO   v_rows
  FROM (
    SELECT
      c.id,
      c.name,
      c.email,
      CASE WHEN c.credit_group_id IS NULL THEN 'cash' ELSE 'credit' END AS customer_type,
      c.entity_type,
      (c.block_reason IS NOT NULL) AS is_blocked,
      c.is_active,
      c.credit_group_id,
      c.cr_url,
      c.establishment_id_url,
      c.signed_credit_form_url,
      (
        SELECT jsonb_build_object(
                 'name',                  cg.name,
                 'credit_limit',          cg.credit_limit,
                 'default_payment_terms', cg.default_payment_terms
               )
        FROM   public.credit_groups cg
        WHERE  cg.id = c.credit_group_id
      ) AS credit_groups,
      COALESCE(
        (SELECT jsonb_agg(
                  jsonb_build_object('phone', cp.phone, 'is_primary', cp.is_primary)
                  ORDER BY cp.is_primary DESC
                )
         FROM   public.customer_phones cp
         WHERE  cp.customer_id = c.id),
        '[]'::jsonb
      ) AS customer_phones
    FROM   matched m
    JOIN   public.customers c ON c.id = m.id
    ORDER  BY m.name
  ) AS row;

  RETURN jsonb_build_object(
    'rows',        COALESCE(v_rows, '[]'::jsonb),
    'total_count', v_total
  );
END;
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
-- Name: set_active_division(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_active_division(p_division_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_profile_id uuid;
  v_user_type  text;
  v_allowed    boolean;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  IF p_division_id IS NULL THEN
    UPDATE user_data SET active_division_id = NULL WHERE id = v_profile_id;
    RETURN;
  END IF;

  v_user_type := auth.jwt() ->> 'user_type';

  IF v_user_type IN ('owner', 'accountant') THEN
    v_allowed := EXISTS (
      SELECT 1 FROM company_divisions WHERE id = p_division_id AND is_active
    );
  ELSE
    v_allowed := EXISTS (
      SELECT 1 FROM user_company_divisions ucd
      JOIN company_divisions cd ON cd.id = ucd.division_id
      WHERE ucd.profile_id = v_profile_id
        AND ucd.division_id = p_division_id
        AND cd.is_active
    );
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Division % is not accessible to this user', p_division_id;
  END IF;

  UPDATE user_data SET active_division_id = p_division_id WHERE id = v_profile_id;
END;
$$;


--
-- Name: set_approval_request_decided_at(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: set_bill_pdf_url(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_bill_pdf_url(p_id uuid, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- is_local = true → resets at COMMIT.
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.bills
     SET pdf_url = p_url, needs_refresh = FALSE
   WHERE id = p_id;
END;
$$;


--
-- Name: set_consumer_division_from_sale_order(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_consumer_division_from_sale_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.consumer_division_id IS NULL AND NEW.sale_order_id IS NOT NULL THEN
    SELECT division_id
      INTO NEW.consumer_division_id
      FROM public.sale_orders
     WHERE id = NEW.sale_order_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_credit_note_pdf_url(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_credit_note_pdf_url(p_id uuid, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.credit_notes SET pdf_url = p_url WHERE id = p_id;
END;
$$;


--
-- Name: set_division_from_sale_order(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_division_from_sale_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.division_id IS NULL AND NEW.sale_order_id IS NOT NULL THEN
    SELECT division_id INTO NEW.division_id
    FROM public.sale_orders WHERE id = NEW.sale_order_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_invoice_pdf_url(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_invoice_pdf_url(p_id uuid, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.so_invoices SET pdf_url = p_url WHERE id = p_id;
END;
$$;


--
-- Name: set_po_pdf_url(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: set_receival_check_pdf_url(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_receival_check_pdf_url(p_id uuid, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.receivals SET check_sheet_pdf_url = p_url WHERE id = p_id;
END;
$$;


--
-- Name: set_sale_order_pdf_url(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sale_order_pdf_url(p_id uuid, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.sale_orders SET quotation_pdf_url = p_url WHERE id = p_id;
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
-- Name: sku_abbreviation(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sku_abbreviation(input text, len integer DEFAULT 3) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT upper(left(regexp_replace(input, '[^A-Za-z]', '', 'g'), len))
$$;


--
-- Name: snapshot_inventory_check_system_qty(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.snapshot_inventory_check_system_qty(p_check_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_warehouse_id     UUID;
  v_sub_container_id UUID;
BEGIN
  SELECT warehouse_id, sub_container_id
  INTO   v_warehouse_id, v_sub_container_id
  FROM   inventory_checks
  WHERE  id = p_check_id;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Inventory check % not found', p_check_id;
  END IF;

  IF v_sub_container_id IS NOT NULL THEN
    -- Sub-container-scoped snapshot: sum remaining_qty from fifo_cost_layers
    -- restricted to that sub-container. `warehouse_stock_view` doesn't yet
    -- expose sub_container_id (D.5), so we go straight to the layers.
    UPDATE inventory_check_items ici
    SET system_qty_at_close = COALESCE(sq.qty, 0)
    FROM (
      SELECT brand_variant_id, SUM(remaining_qty)::NUMERIC AS qty
      FROM   fifo_cost_layers
      WHERE  warehouse_id     = v_warehouse_id
        AND  sub_container_id = v_sub_container_id
        AND  remaining_qty    > 0
      GROUP BY brand_variant_id
    ) sq
    WHERE ici.check_id = p_check_id
      AND ici.is_counted = true
      AND ici.system_qty_at_close IS NULL
      AND sq.brand_variant_id = ici.brand_variant_id;
  ELSE
    -- Legacy path (pre-D.4.c checks): warehouse-wide snapshot.
    UPDATE inventory_check_items ici
    SET system_qty_at_close = COALESCE(wsv.qty, 0)
    FROM warehouse_stock_view wsv
    WHERE ici.check_id = p_check_id
      AND ici.is_counted = true
      AND ici.system_qty_at_close IS NULL
      AND wsv.warehouse_id = v_warehouse_id
      AND wsv.brand_variant_id = ici.brand_variant_id;
  END IF;

  -- Items absent from the stock source — pin at 0 so the recon row has a
  -- frozen value.
  UPDATE inventory_check_items
  SET system_qty_at_close = 0
  WHERE check_id = p_check_id
    AND is_counted = true
    AND system_qty_at_close IS NULL;
END;
$$;


--
-- Name: storage_customer_credit_docs_write_allowed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.storage_customer_credit_docs_write_allowed() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_data p
    JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
    JOIN   custom_roles cr      ON cr.id           = ucr.role_id
    WHERE  p.auth_user_id = auth.uid()
    AND    (
      cr.is_system_admin = true
      OR 'master_data.customers.manage' = ANY(cr.permissions)
      OR 'master_data.customers.change_credit_group' = ANY(cr.permissions)
    )
  )
$$;


--
-- Name: storage_delete_object(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.storage_delete_object(p_bucket text, p_path text, p_source_table text DEFAULT NULL::text, p_source_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'vault'
    AS $_$
DECLARE
  v_key      text;
  v_base_url text := 'https://mwvblpgbgxipvrevkeff.supabase.co';
  v_url      text;
BEGIN
  IF p_path IS NULL OR p_path = '' THEN RETURN; END IF;

  IF p_path LIKE 'http%' THEN
    p_path := regexp_replace(p_path, '^.*/storage/v1/object/(public/)?[^/]+/', '');
    p_path := regexp_replace(p_path, '\?.*$', '');
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'storage_cleanup_service_role_key';

  IF v_key IS NULL THEN
    INSERT INTO public.storage_cleanup_failures(bucket, path, source_table, source_id, error_text)
    VALUES (p_bucket, p_path, p_source_table, p_source_id,
            'Vault secret storage_cleanup_service_role_key missing');
    RETURN;
  END IF;

  v_url := v_base_url || '/storage/v1/object/' || p_bucket || '/' || p_path;

  BEGIN
    PERFORM net.http_delete(
      url     := v_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'apikey',        v_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.storage_cleanup_failures(bucket, path, source_table, source_id, error_text)
    VALUES (p_bucket, p_path, p_source_table, p_source_id, SQLERRM);
  END;
END $_$;


--
-- Name: storage_lc_bills_write_allowed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.storage_lc_bills_write_allowed() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_data p
    JOIN   user_custom_roles ucr ON ucr.profile_id = p.id
    JOIN   custom_roles cr      ON cr.id            = ucr.role_id
    WHERE  p.auth_user_id = auth.uid()
    AND    p.is_active = true
    AND    cr.deleted_at IS NULL
    AND    (
      cr.is_system_admin = true
      OR 'purchase.landed_costs.manage' = ANY(cr.permissions)
    )
  )
$$;


--
-- Name: submit_credit_group_change(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

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
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();
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

  IF COALESCE(v_customer.entity_type::text, 'individual') = 'business' THEN
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
           block_reason    = NULL
     WHERE id = p_customer_id;
    UPDATE customer_credit_group_requests
      SET status = 'approved', decided_by = v_profile_id, decided_at = now()
      WHERE id = v_request_id;
  ELSE
    -- Block new customers (no previous group) while approval is pending
    IF v_customer.credit_group_id IS NULL THEN
      UPDATE customers
         SET block_reason = 'Pending credit group approval'
       WHERE id = p_customer_id;
    END IF;
  END IF;

  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Credit Group Change Requested',
    'customers',
    'customer',
    p_customer_id,
    (SELECT full_name FROM user_data WHERE id = v_profile_id),
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


--
-- Name: sync_brand_variant_brand_text(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_brand_variant_brand_text() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.brand_id IS NOT NULL THEN
    SELECT name INTO NEW.brand FROM public.brands WHERE id = NEW.brand_id;
  END IF;
  RETURN NEW;
END;
$$;


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
    SELECT 1 FROM service_edit_requests
    WHERE service_id = target_service_id AND status = 'pending'
  )
  WHERE id = target_service_id;
  RETURN NULL;
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
  UPDATE approval_workflow_steps
  SET is_active = p_active
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;


--
-- Name: trg_alloc_refresh_stock_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_alloc_refresh_stock_summary() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id, OLD.sub_container_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_stock_summary_row(NEW.warehouse_id, NEW.brand_variant_id, NEW.sub_container_id);

  IF TG_OP = 'UPDATE'
     AND (OLD.warehouse_id     IS DISTINCT FROM NEW.warehouse_id
       OR OLD.sub_container_id IS DISTINCT FROM NEW.sub_container_id
       OR OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id)
  THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id, OLD.sub_container_id);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_cleanup_company_assets_after_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_company_assets_after_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM storage_delete_object('division-assets', OLD.logo_url,  'companies', OLD.id::text);
  PERFORM storage_delete_object('division-assets', OLD.stamp_url, 'companies', OLD.id::text);
  RETURN OLD;
END $$;


--
-- Name: trg_cleanup_company_assets_after_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_company_assets_after_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.logo_url  IS DISTINCT FROM NEW.logo_url  AND OLD.logo_url  IS NOT NULL THEN
    PERFORM storage_delete_object('division-assets', OLD.logo_url,  'companies', OLD.id::text);
  END IF;
  IF OLD.stamp_url IS DISTINCT FROM NEW.stamp_url AND OLD.stamp_url IS NOT NULL THEN
    PERFORM storage_delete_object('division-assets', OLD.stamp_url, 'companies', OLD.id::text);
  END IF;
  RETURN NEW;
END $$;


--
-- Name: trg_cleanup_consumption_attachments_after_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_consumption_attachments_after_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE p text;
BEGIN
  IF OLD.attachments IS NULL THEN RETURN OLD; END IF;
  FOREACH p IN ARRAY OLD.attachments LOOP
    PERFORM storage_delete_object('consumption-attachments', p, 'consumption_entries', OLD.id::text);
  END LOOP;
  RETURN OLD;
END $$;


--
-- Name: trg_cleanup_consumption_attachments_after_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_consumption_attachments_after_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  removed text[];
  p       text;
BEGIN
  IF OLD.attachments IS NULL THEN RETURN NEW; END IF;

  removed := ARRAY(
    SELECT unnest(OLD.attachments)
    EXCEPT
    SELECT unnest(COALESCE(NEW.attachments, ARRAY[]::text[]))
  );

  IF array_length(removed, 1) IS NULL THEN RETURN NEW; END IF;

  FOREACH p IN ARRAY removed LOOP
    PERFORM storage_delete_object('consumption-attachments', p, 'consumption_entries', OLD.id::text);
  END LOOP;
  RETURN NEW;
END $$;


--
-- Name: trg_cleanup_customer_docs_after_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_customer_docs_after_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM storage_delete_object('customer-credit-docs', OLD.cr_url,                 'customers', OLD.id::text);
  PERFORM storage_delete_object('customer-credit-docs', OLD.establishment_id_url,   'customers', OLD.id::text);
  PERFORM storage_delete_object('customer-credit-docs', OLD.signed_credit_form_url, 'customers', OLD.id::text);
  RETURN OLD;
END $$;


--
-- Name: trg_cleanup_customer_docs_after_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_customer_docs_after_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.cr_url IS DISTINCT FROM NEW.cr_url AND OLD.cr_url IS NOT NULL THEN
    PERFORM storage_delete_object('customer-credit-docs', OLD.cr_url, 'customers', OLD.id::text);
  END IF;
  IF OLD.establishment_id_url IS DISTINCT FROM NEW.establishment_id_url AND OLD.establishment_id_url IS NOT NULL THEN
    PERFORM storage_delete_object('customer-credit-docs', OLD.establishment_id_url, 'customers', OLD.id::text);
  END IF;
  IF OLD.signed_credit_form_url IS DISTINCT FROM NEW.signed_credit_form_url AND OLD.signed_credit_form_url IS NOT NULL THEN
    PERFORM storage_delete_object('customer-credit-docs', OLD.signed_credit_form_url, 'customers', OLD.id::text);
  END IF;
  RETURN NEW;
END $$;


--
-- Name: trg_cleanup_division_assets_after_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_division_assets_after_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM storage_delete_object('division-assets', OLD.logo_url,  'company_divisions', OLD.id::text);
  PERFORM storage_delete_object('division-assets', OLD.stamp_url, 'company_divisions', OLD.id::text);
  RETURN OLD;
END $$;


--
-- Name: trg_cleanup_division_assets_after_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_division_assets_after_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.logo_url  IS DISTINCT FROM NEW.logo_url  AND OLD.logo_url  IS NOT NULL THEN
    PERFORM storage_delete_object('division-assets', OLD.logo_url,  'company_divisions', OLD.id::text);
  END IF;
  IF OLD.stamp_url IS DISTINCT FROM NEW.stamp_url AND OLD.stamp_url IS NOT NULL THEN
    PERFORM storage_delete_object('division-assets', OLD.stamp_url, 'company_divisions', OLD.id::text);
  END IF;
  RETURN NEW;
END $$;


--
-- Name: trg_cleanup_inventory_item_image_after_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_inventory_item_image_after_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM storage_delete_object('inventory-item-photos', OLD.image_url, 'inventory_items', OLD.id::text);
  RETURN OLD;
END $$;


--
-- Name: trg_cleanup_inventory_item_image_after_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_inventory_item_image_after_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.image_url IS DISTINCT FROM NEW.image_url AND OLD.image_url IS NOT NULL THEN
    PERFORM storage_delete_object('inventory-item-photos', OLD.image_url, 'inventory_items', OLD.id::text);
  END IF;
  RETURN NEW;
END $$;


--
-- Name: trg_cleanup_landed_cost_bill_after_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_landed_cost_bill_after_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM storage_delete_object('lc-bills', OLD.bill_path, 'landed_cost_lines', OLD.id::text);
  RETURN OLD;
END $$;


--
-- Name: trg_cleanup_landed_cost_bill_after_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_landed_cost_bill_after_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.bill_path IS DISTINCT FROM NEW.bill_path AND OLD.bill_path IS NOT NULL THEN
    PERFORM storage_delete_object('lc-bills', OLD.bill_path, 'landed_cost_lines', OLD.id::text);
  END IF;
  RETURN NEW;
END $$;


--
-- Name: trg_cleanup_stock_adjustment_photos_after_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_stock_adjustment_photos_after_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE p text;
BEGIN
  IF OLD.photo_urls IS NULL THEN RETURN OLD; END IF;
  FOREACH p IN ARRAY OLD.photo_urls LOOP
    PERFORM storage_delete_object('adjustment-photos', p, 'stock_adjustments', OLD.id::text);
  END LOOP;
  RETURN OLD;
END $$;


--
-- Name: trg_cleanup_stock_adjustment_photos_after_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cleanup_stock_adjustment_photos_after_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  removed text[];
  p       text;
BEGIN
  IF OLD.photo_urls IS NULL THEN RETURN NEW; END IF;

  removed := ARRAY(
    SELECT unnest(OLD.photo_urls)
    EXCEPT
    SELECT unnest(COALESCE(NEW.photo_urls, ARRAY[]::text[]))
  );

  IF array_length(removed, 1) IS NULL THEN RETURN NEW; END IF;

  FOREACH p IN ARRAY removed LOOP
    PERFORM storage_delete_object('adjustment-photos', p, 'stock_adjustments', OLD.id::text);
  END LOOP;
  RETURN NEW;
END $$;


--
-- Name: trg_fifo_refresh_stock_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fifo_refresh_stock_summary() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id, OLD.sub_container_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_stock_summary_row(NEW.warehouse_id, NEW.brand_variant_id, NEW.sub_container_id);

  IF TG_OP = 'UPDATE'
     AND (OLD.warehouse_id     IS DISTINCT FROM NEW.warehouse_id
       OR OLD.sub_container_id IS DISTINCT FROM NEW.sub_container_id
       OR OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id)
  THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id, OLD.sub_container_id);
  END IF;

  RETURN NEW;
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
-- Name: update_reserved_qty(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_reserved_qty(p_bv_id uuid, p_delta integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE inventory_item_brand_variants
  SET reserved_qty = GREATEST(0, reserved_qty + p_delta),
      updated_at   = now()
  WHERE id = p_bv_id;
END;
$$;


--
-- Name: update_workflow_step_conditions(uuid, boolean, text[]); Type: FUNCTION; Schema: public; Owner: -
--

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
    (
      p_step_role = 'responsible_person'
      AND EXISTS (
        SELECT 1 FROM warehouse_responsible_persons
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
-- Name: warranty_policies_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.warranty_policies_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
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
    severity public.audit_severity DEFAULT 'info'::public.audit_severity NOT NULL,
    performer_name text,
    old_data jsonb,
    new_data jsonb
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
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
    CONSTRAINT approval_workflow_groups_workflow_check CHECK ((workflow = ANY (ARRAY['po'::text, 'inv_check'::text, 'stock_adj'::text, 'sales_margin'::text, 'sales_credit'::text, 'credit_group'::text, 'receival_edit'::text, 'consumption_edit'::text])))
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
    CONSTRAINT workflow_approval_steps_workflow_check CHECK ((workflow = ANY (ARRAY['po'::text, 'inv_check'::text, 'stock_adj'::text, 'sales_margin'::text, 'sales_credit'::text, 'credit_group'::text, 'receival_edit'::text, 'consumption_edit'::text])))
);


--
-- Name: bill_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bill_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bill_id uuid NOT NULL,
    description text NOT NULL,
    qty integer DEFAULT 1,
    unit_price numeric DEFAULT 0,
    total numeric DEFAULT 0,
    match_status text,
    match_note text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bill_line_items_match_status_check CHECK ((match_status = ANY (ARRAY['matched'::text, 'qty_discrepancy'::text, 'price_discrepancy'::text, 'unmatched'::text, 'accepted_with_note'::text])))
);


--
-- Name: bills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bill_number text NOT NULL,
    source_label text,
    payment_status public.invoice_payment_status DEFAULT 'unpaid'::public.invoice_payment_status NOT NULL,
    supplier_id uuid,
    purchase_order_id uuid,
    receival_id uuid,
    division_id uuid,
    issued_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date DEFAULT CURRENT_DATE NOT NULL,
    subtotal numeric,
    discount_amount numeric DEFAULT 0 NOT NULL,
    discount_label text,
    total_amount numeric,
    paid_amount numeric,
    needs_refresh boolean DEFAULT false NOT NULL,
    notes text,
    pdf_url text,
    created_at timestamp with time zone DEFAULT now()
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
    source_type text DEFAULT 'sale'::text NOT NULL,
    division_id uuid,
    source_id uuid,
    consumer_division_id uuid,
    consumption_id uuid,
    consumer_type text,
    consumer_team_sub_id uuid,
    consumer_place_sub_id uuid,
    consumer_customer_id uuid,
    CONSTRAINT cogs_entries_consumer_type_check CHECK (((consumer_type IS NULL) OR (consumer_type = ANY (ARRAY['team'::text, 'place'::text, 'internal'::text])))),
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
    created_by uuid,
    stamp_url text,
    footer_motto text,
    currency_id uuid
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
    currency_id uuid
);


--
-- Name: consumption_edit_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumption_edit_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consumption_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT consumption_edit_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: consumption_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumption_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ce_number text NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    source_warehouse_id uuid NOT NULL,
    source_sub_container_id uuid NOT NULL,
    consumer_type text NOT NULL,
    consumer_team_sub_id uuid,
    consumer_place_sub_id uuid,
    consumer_customer_id uuid,
    notes text,
    attachments text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    posted_by uuid,
    posted_at timestamp with time zone,
    cancelled_by uuid,
    cancelled_at timestamp with time zone,
    division_id uuid,
    CONSTRAINT consumption_entries_consumer_type_check CHECK ((consumer_type = ANY (ARRAY['team'::text, 'place'::text, 'internal'::text]))),
    CONSTRAINT consumption_entries_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'posted'::text, 'cancelled'::text])))
);


--
-- Name: consumption_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumption_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consumption_id uuid NOT NULL,
    brand_variant_id uuid NOT NULL,
    item_name text NOT NULL,
    sku text,
    qty integer NOT NULL,
    unit_cost numeric,
    total_cost numeric GENERATED ALWAYS AS (((qty)::numeric * unit_cost)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT consumption_lines_qty_check CHECK ((qty > 0))
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
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    name_ar text,
    email text,
    block_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    credit_group_id uuid,
    entity_type public.customer_entity_type DEFAULT 'individual'::public.customer_entity_type,
    cr_url text,
    cr_uploaded_at timestamp with time zone,
    establishment_id_url text,
    establishment_id_uploaded_at timestamp with time zone,
    signed_credit_form_url text,
    signed_credit_form_uploaded_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL
);


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
    description text,
    qty numeric(10,2) NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    total numeric(12,2) GENERATED ALWAYS AS ((qty * unit_price)) STORED,
    created_at timestamp with time zone DEFAULT now(),
    sku text,
    line_type public.credit_debit_line_type DEFAULT 'returned'::public.credit_debit_line_type NOT NULL,
    condition text,
    condition_notes text
);


--
-- Name: credit_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    credit_note_id text NOT NULL,
    invoice_id uuid,
    customer_name text,
    reason text NOT NULL,
    total_amount numeric DEFAULT 0 NOT NULL,
    status public.credit_note_status DEFAULT 'open'::public.credit_note_status,
    refund_method text,
    refund_reference text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_return_id uuid,
    original_total numeric,
    new_total numeric,
    pdf_url text,
    resolution_type public.credit_note_resolution_type,
    reason_id uuid,
    customer_id uuid,
    refund_method_id uuid
);


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text,
    symbol text,
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
    color text DEFAULT 'bg-primary/15 text-primary border-primary/30'::text,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    is_system_admin boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    deleted_at timestamp with time zone,
    is_approval_slot boolean DEFAULT false NOT NULL,
    is_inventory_receiver boolean DEFAULT false NOT NULL
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
    direction public.payment_direction DEFAULT 'incoming'::public.payment_direction NOT NULL,
    source_type public.payment_source_type,
    source_id uuid,
    supplier_id uuid,
    currency text DEFAULT 'QAR'::text NOT NULL,
    exchange_rate numeric DEFAULT 1 NOT NULL,
    amount_qar numeric,
    deleted_at timestamp with time zone,
    customer_id uuid,
    bill_id uuid,
    credit_note_id uuid,
    currency_id uuid,
    method_id uuid,
    exchange_gain numeric DEFAULT 0 NOT NULL,
    exchange_loss numeric DEFAULT 0 NOT NULL
);


--
-- Name: return_line_customer_resolutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_line_customer_resolutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_line_id uuid NOT NULL,
    resolution_type text NOT NULL,
    qty numeric NOT NULL,
    sale_delivery_id uuid,
    credit_note_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT return_line_customer_resolutions_link_matches_type CHECK (
CASE resolution_type
    WHEN 'replacement'::text THEN ((sale_delivery_id IS NOT NULL) AND (credit_note_id IS NULL))
    WHEN 'refund'::text THEN ((sale_delivery_id IS NULL) AND (credit_note_id IS NOT NULL))
    WHEN 'store_credit'::text THEN ((sale_delivery_id IS NULL) AND (credit_note_id IS NOT NULL))
    ELSE NULL::boolean
END),
    CONSTRAINT return_line_customer_resolutions_qty_check CHECK ((qty > (0)::numeric)),
    CONSTRAINT return_line_customer_resolutions_resolution_type_check CHECK ((resolution_type = ANY (ARRAY['refund'::text, 'replacement'::text, 'store_credit'::text])))
);


--
-- Name: return_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_id uuid NOT NULL,
    brand_variant_id uuid,
    item_name text DEFAULT 'Item'::text NOT NULL,
    sku text,
    qty integer DEFAULT 0 NOT NULL,
    condition text,
    condition_notes text,
    created_at timestamp with time zone DEFAULT now(),
    receival_item_id uuid,
    sale_delivery_line_id uuid,
    CONSTRAINT return_lines_provenance_required CHECK (((receival_item_id IS NOT NULL) OR (sale_delivery_line_id IS NOT NULL)))
);


--
-- Name: sale_order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_order_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_order_id uuid NOT NULL,
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
    quotation_pdf_url text,
    currency_id uuid,
    initial_exchange_rate numeric DEFAULT 1 NOT NULL,
    initial_rate_captured_at timestamp with time zone,
    initial_rate_captured_by uuid,
    total_qar numeric,
    exchange_gain numeric DEFAULT 0 NOT NULL,
    exchange_loss numeric DEFAULT 0 NOT NULL,
    exchange_net numeric GENERATED ALWAYS AS ((COALESCE(exchange_gain, (0)::numeric) - COALESCE(exchange_loss, (0)::numeric))) STORED
);


--
-- Name: so_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.so_invoices (
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
    total_amount numeric DEFAULT 0,
    paid_amount numeric DEFAULT 0,
    agent_name text,
    notes text,
    qb_synced boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    sale_order_id uuid,
    needs_refresh boolean DEFAULT false NOT NULL,
    payment_status public.invoice_payment_status DEFAULT 'unpaid'::public.invoice_payment_status NOT NULL,
    invoice_type public.invoice_type DEFAULT 'credit'::public.invoice_type NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    discount_label text,
    pdf_url text,
    division_id uuid
);


--
-- Name: so_po_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.so_po_returns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_number text NOT NULL,
    source_type public.return_source_type NOT NULL,
    source_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
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
    pdf_url text,
    source_delivery_id uuid
);


--
-- Name: customer_credit_balances; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.customer_credit_balances WITH (security_invoker='on') AS
 WITH issued AS (
         SELECT cn.customer_id,
            COALESCE(inv_so.currency, ret_so.currency, 'QAR'::text) AS currency,
            cn.id AS credit_note_id,
            sum((cr.qty * COALESCE(sol.unit_price, (0)::numeric))) AS credit_amount
           FROM (((((((public.return_line_customer_resolutions cr
             JOIN public.return_lines rl ON ((rl.id = cr.return_line_id)))
             JOIN public.so_po_returns r_1 ON (((r_1.id = rl.return_id) AND (r_1.source_type = 'sale_order'::public.return_source_type))))
             JOIN public.credit_notes cn ON ((cn.source_return_id = r_1.id)))
             LEFT JOIN public.sale_orders ret_so ON ((ret_so.id = r_1.source_id)))
             LEFT JOIN public.sale_order_lines sol ON (((sol.sale_order_id = r_1.source_id) AND (sol.brand_variant_id = rl.brand_variant_id))))
             LEFT JOIN public.so_invoices inv ON ((inv.id = cn.invoice_id)))
             LEFT JOIN public.sale_orders inv_so ON ((inv_so.id = inv.sale_order_id)))
          WHERE ((cr.resolution_type = 'store_credit'::text) AND (cn.status <> 'void'::public.credit_note_status) AND (cn.customer_id IS NOT NULL))
          GROUP BY cn.customer_id, cn.id, inv_so.currency, ret_so.currency
        ), redemptions AS (
         SELECT payments.credit_note_id,
            COALESCE(sum(payments.amount), (0)::numeric) AS applied
           FROM public.payments
          WHERE ((payments.credit_note_id IS NOT NULL) AND (payments.direction = 'incoming'::public.payment_direction) AND (payments.deleted_at IS NULL))
          GROUP BY payments.credit_note_id
        )
 SELECT i.customer_id,
    i.currency,
    count(*) AS open_count,
    sum((i.credit_amount - COALESCE(r.applied, (0)::numeric))) AS open_amount
   FROM (issued i
     LEFT JOIN redemptions r ON ((r.credit_note_id = i.credit_note_id)))
  WHERE ((i.credit_amount - COALESCE(r.applied, (0)::numeric)) > (0)::numeric)
  GROUP BY i.customer_id, i.currency;


--
-- Name: customer_credit_group_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_credit_group_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    step_role text NOT NULL,
    step_order integer NOT NULL,
    status public.approval_status DEFAULT 'pending'::public.approval_status NOT NULL,
    decided_by uuid,
    decided_by_name text,
    decided_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    iteration integer DEFAULT 1 NOT NULL,
    comment text,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    force_approved boolean DEFAULT false NOT NULL,
    force_comment text
);


--
-- Name: customer_credit_group_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_credit_group_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    requested_group_id uuid NOT NULL,
    previous_group_id uuid,
    status public.credit_group_request_status DEFAULT 'pending'::public.credit_group_request_status NOT NULL,
    requested_by uuid,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_credit_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.customer_credit_summary WITH (security_invoker='on') AS
 SELECT c.id AS customer_id,
    c.name AS customer_name,
    c.name_ar AS customer_name_ar,
        CASE
            WHEN (c.credit_group_id IS NULL) THEN 'cash'::text
            ELSE 'credit'::text
        END AS customer_type,
    (c.block_reason IS NOT NULL) AS is_blocked,
    c.credit_group_id,
    cg.name AS credit_group_name,
        CASE
            WHEN (c.credit_group_id IS NULL) THEN (0)::numeric
            ELSE COALESCE(cg.credit_limit, (0)::numeric)
        END AS credit_limit,
    public.customer_credit_used(c.id, NULL::uuid) AS credit_used,
    GREATEST((
        CASE
            WHEN (c.credit_group_id IS NULL) THEN (0)::numeric
            ELSE COALESCE(cg.credit_limit, (0)::numeric)
        END - public.customer_credit_used(c.id, NULL::uuid)), (0)::numeric) AS credit_available,
        CASE
            WHEN (COALESCE(
            CASE
                WHEN (c.credit_group_id IS NULL) THEN (0)::numeric
                ELSE COALESCE(cg.credit_limit, (0)::numeric)
            END, (0)::numeric) = (0)::numeric) THEN NULL::numeric
            ELSE LEAST(round(((public.customer_credit_used(c.id, NULL::uuid) / NULLIF(
            CASE
                WHEN (c.credit_group_id IS NULL) THEN (0)::numeric
                ELSE COALESCE(cg.credit_limit, (0)::numeric)
            END, (0)::numeric)) * (100)::numeric), 1), (100)::numeric)
        END AS credit_utilization_pct
   FROM (public.customers c
     LEFT JOIN public.credit_groups cg ON ((cg.id = c.credit_group_id)));


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
    total_amount,
    paid_amount,
    agent_name,
    notes,
    qb_synced,
    created_at,
    sale_order_id,
    needs_refresh,
    payment_status,
    invoice_type,
    discount_amount,
    discount_label,
    division_id
   FROM public.so_invoices;


--
-- Name: customer_open_credit_notes; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.customer_open_credit_notes WITH (security_invoker='on') AS
 WITH issued AS (
         SELECT cn.id AS credit_note_pk,
            cn.credit_note_id AS credit_note_number,
            cn.status,
            cn.created_at,
            COALESCE(inv_so.customer_id, ret_so.customer_id) AS customer_id,
            COALESCE(inv_so.currency, ret_so.currency, 'QAR'::text) AS currency,
            COALESCE(inv_so.so_number, ret_so.so_number) AS so_number,
            inv.invoice_id AS invoice_number,
            r_1.return_number,
            sum((cr.qty * COALESCE(sol.unit_price, (0)::numeric))) AS credit_amount
           FROM (((((((public.return_line_customer_resolutions cr
             JOIN public.return_lines rl ON ((rl.id = cr.return_line_id)))
             JOIN public.so_po_returns r_1 ON (((r_1.id = rl.return_id) AND (r_1.source_type = 'sale_order'::public.return_source_type))))
             JOIN public.credit_notes cn ON ((cn.source_return_id = r_1.id)))
             LEFT JOIN public.sale_orders ret_so ON ((ret_so.id = r_1.source_id)))
             LEFT JOIN public.sale_order_lines sol ON (((sol.sale_order_id = r_1.source_id) AND (sol.brand_variant_id = rl.brand_variant_id))))
             LEFT JOIN public.so_invoices inv ON ((inv.id = cn.invoice_id)))
             LEFT JOIN public.sale_orders inv_so ON ((inv_so.id = inv.sale_order_id)))
          WHERE ((cr.resolution_type = 'store_credit'::text) AND (cn.status <> 'void'::public.credit_note_status) AND (cn.customer_id IS NOT NULL))
          GROUP BY cn.id, cn.credit_note_id, cn.status, cn.created_at, inv_so.customer_id, ret_so.customer_id, inv_so.currency, ret_so.currency, inv_so.so_number, ret_so.so_number, inv.invoice_id, r_1.return_number
        ), redemptions AS (
         SELECT payments.credit_note_id,
            COALESCE(sum(payments.amount), (0)::numeric) AS applied
           FROM public.payments
          WHERE ((payments.credit_note_id IS NOT NULL) AND (payments.direction = 'incoming'::public.payment_direction) AND (payments.deleted_at IS NULL))
          GROUP BY payments.credit_note_id
        )
 SELECT i.credit_note_pk AS id,
    i.credit_note_number AS note_number,
    i.customer_id,
    i.currency,
    i.status,
    i.created_at,
    i.so_number,
    i.invoice_number,
    i.return_number,
    (i.credit_amount - COALESCE(r.applied, (0)::numeric)) AS amount_remaining
   FROM (issued i
     LEFT JOIN redemptions r ON ((r.credit_note_id = i.credit_note_pk)))
  WHERE ((i.credit_amount - COALESCE(r.applied, (0)::numeric)) > (0)::numeric);


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
-- Name: debit_note_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debit_note_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    debit_note_id uuid NOT NULL,
    description text,
    sku text,
    qty numeric NOT NULL,
    unit_price numeric NOT NULL,
    total numeric GENERATED ALWAYS AS ((qty * unit_price)) STORED,
    line_type public.credit_debit_line_type DEFAULT 'returned'::public.credit_debit_line_type NOT NULL,
    condition text,
    condition_notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: debit_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debit_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    debit_note_id text NOT NULL,
    bill_id uuid,
    purchase_order_id uuid,
    supplier_name text,
    reason text NOT NULL,
    status public.credit_note_status DEFAULT 'open'::public.credit_note_status,
    total_amount numeric DEFAULT 0 NOT NULL,
    original_total numeric,
    new_total numeric,
    source_return_id uuid,
    resolution_type text,
    pdf_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reason_id uuid,
    supplier_id uuid,
    CONSTRAINT debit_notes_resolution_type_check CHECK ((resolution_type = ANY (ARRAY['supplier_credit'::text, 'replacement'::text])))
);


--
-- Name: delivery_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.delivery_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exchange_rate_change_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rate_change_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_type text NOT NULL,
    document_id uuid NOT NULL,
    old_rate numeric NOT NULL,
    new_rate numeric NOT NULL,
    reason text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exchange_rate_change_log_document_type_check CHECK ((document_type = ANY (ARRAY['po'::text, 'so'::text]))),
    CONSTRAINT exchange_rate_change_log_new_rate_positive CHECK ((new_rate > (0)::numeric)),
    CONSTRAINT exchange_rate_change_log_reason_len CHECK ((char_length(TRIM(BOTH FROM reason)) >= 5))
);


--
-- Name: fifo_cost_layers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fifo_cost_layers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_variant_id uuid NOT NULL,
    receival_number text,
    date date NOT NULL,
    qty integer NOT NULL,
    unit_cost numeric NOT NULL,
    landed_cost_per_unit numeric DEFAULT 0,
    total_unit_cost numeric NOT NULL,
    remaining_qty integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    warehouse_id uuid,
    source_type text DEFAULT 'receival'::text,
    receival_id uuid,
    source_id uuid,
    source_currency text DEFAULT 'QAR'::text NOT NULL,
    source_exchange_rate numeric DEFAULT 1 NOT NULL,
    sub_container_id uuid NOT NULL
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
-- Name: inventory_attribute_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_attribute_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    attribute_key text NOT NULL,
    label_en text NOT NULL,
    label_ar text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: inventory_attribute_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_attribute_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    definition_id uuid NOT NULL,
    value_en text NOT NULL,
    value_ar text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
    default_sub_container_id uuid,
    default_warranty_policy_id uuid,
    CONSTRAINT inventory_categories_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
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
    CONSTRAINT inv_check_approvals_rejected_needs_notes_chk CHECK (((status <> 'rejected'::text) OR (COALESCE(TRIM(BOTH FROM notes), ''::text) <> ''::text))),
    CONSTRAINT inventory_check_approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_check_assignments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text])))
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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assignment_id uuid,
    category_name text,
    variance_type text,
    system_qty_at_close numeric
);


--
-- Name: inventory_check_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_check_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_id uuid NOT NULL,
    event_type public.inventory_check_event_type NOT NULL,
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
    reviewed_by_name text,
    reviewed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    initiated_by_profile_id uuid,
    initiated_by_name text,
    started_at timestamp with time zone,
    sub_container_id uuid,
    CONSTRAINT inventory_checks_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'submitted'::text, 'reviewed'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text, 'completed'::text])))
);


--
-- Name: inventory_damaged_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_damaged_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    movement_type text NOT NULL,
    qty numeric NOT NULL,
    warehouse_id uuid NOT NULL,
    brand_variant_id uuid NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    source_return_line_disposition_id uuid,
    source_transfer_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT inventory_damaged_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['restock_as_damaged_in'::text, 'send_for_repair_out'::text, 'return_from_repair_as_writeoff'::text, 'damaged_write_off'::text, 'damaged_adjust'::text]))),
    CONSTRAINT inventory_damaged_movements_qty_check CHECK ((qty > (0)::numeric))
);


--
-- Name: inventory_damaged_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_damaged_stock (
    warehouse_id uuid NOT NULL,
    brand_variant_id uuid NOT NULL,
    qty numeric DEFAULT 0 NOT NULL,
    weighted_unit_cost numeric DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_damaged_stock_qty_check CHECK ((qty >= (0)::numeric)),
    CONSTRAINT inventory_damaged_stock_weighted_unit_cost_check CHECK ((weighted_unit_cost >= (0)::numeric))
);


--
-- Name: inventory_damaged_stock_layers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_damaged_stock_layers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    brand_variant_id uuid NOT NULL,
    qty_received numeric NOT NULL,
    qty_remaining numeric NOT NULL,
    unit_cost numeric NOT NULL,
    source_return_line_id uuid,
    layered_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT inventory_damaged_stock_layers_qty_received_check CHECK ((qty_received > (0)::numeric)),
    CONSTRAINT inventory_damaged_stock_layers_qty_remaining_check CHECK ((qty_remaining >= (0)::numeric)),
    CONSTRAINT inventory_damaged_stock_layers_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: inventory_item_attributes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_item_attributes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    definition_id uuid NOT NULL,
    option_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: inventory_item_brand_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_item_brand_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    brand text NOT NULL,
    code text,
    cost_price numeric DEFAULT 0,
    selling_price numeric DEFAULT 0,
    stock_level integer DEFAULT 0,
    incoming integer DEFAULT 0,
    average_cost numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reserved_qty integer DEFAULT 0 NOT NULL,
    linked_services_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    reorder_point integer DEFAULT 0 NOT NULL,
    damaged_qty integer DEFAULT 0 NOT NULL,
    brand_id uuid,
    CONSTRAINT inventory_brand_variants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
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
    linked_services_count integer DEFAULT 0,
    total_stock integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'active'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    shared_with_division_ids uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    default_sub_container_id uuid,
    default_warehouse_id uuid,
    image_url text,
    warranty_policy_id uuid,
    CONSTRAINT inventory_items_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);


--
-- Name: inventory_receival_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_receival_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid,
    brand_variant_id uuid NOT NULL,
    item_name text NOT NULL,
    sku text,
    movement_type public.stock_movement_type NOT NULL,
    qty integer NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    reference_type text,
    reference_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sub_container_id uuid NOT NULL
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
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: landed_cost_item_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landed_cost_item_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    landed_cost_id uuid NOT NULL,
    brand_variant_id uuid,
    item_name text DEFAULT 'Item'::text NOT NULL,
    sku text,
    qty_received integer DEFAULT 0 NOT NULL,
    qty_remaining_at_lc integer DEFAULT 0 NOT NULL,
    sold_qty integer DEFAULT 0 NOT NULL,
    original_unit_cost numeric DEFAULT 0 NOT NULL,
    lc_per_unit numeric DEFAULT 0 NOT NULL,
    updated_unit_cost numeric DEFAULT 0 NOT NULL,
    allocated_lc_total numeric DEFAULT 0 NOT NULL,
    inventory_portion numeric DEFAULT 0 NOT NULL,
    cogs_portion numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: landed_cost_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landed_cost_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    landed_cost_id uuid NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'QAR'::text NOT NULL,
    exchange_rate numeric DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    bill_path text,
    currency_id uuid
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
    attached_receival_ids uuid[] DEFAULT '{}'::uuid[],
    attached_po_ids uuid[] DEFAULT '{}'::uuid[],
    all_items_sold boolean DEFAULT false,
    date date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    voided_at timestamp with time zone,
    voided_reason text,
    applied_at timestamp with time zone,
    revert_snapshot jsonb,
    currency_id uuid
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
    created_at timestamp with time zone DEFAULT now(),
    actioned_at timestamp with time zone
);


--
-- Name: order_quotation_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_quotation_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


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
    invoice_id uuid,
    plan_type text NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    bill_id uuid,
    CONSTRAINT payment_plans_plan_type_check CHECK ((plan_type = ANY (ARRAY['schedule'::text, 'adhoc'::text]))),
    CONSTRAINT payment_plans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])))
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
    status public.po_edit_request_status DEFAULT 'pending'::public.po_edit_request_status NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_comment text,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
    currency_id uuid,
    CONSTRAINT po_rfq_quotes_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'received'::text, 'awarded'::text, 'rejected'::text])))
);


--
-- Name: po_version_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.po_version_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    po_version_id uuid NOT NULL,
    item_name text NOT NULL,
    sku text,
    qty integer DEFAULT 0 NOT NULL,
    received_qty integer DEFAULT 0,
    unit text DEFAULT 'pcs'::text NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    total_price numeric DEFAULT 0 NOT NULL,
    brand_variant_id uuid,
    free_qty integer DEFAULT 0 NOT NULL,
    brand_id uuid,
    created_at timestamp with time zone DEFAULT now()
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
    snapshot_label text DEFAULT 'manual'::text NOT NULL,
    stage public.po_stage NOT NULL,
    supplier_id uuid,
    currency_id uuid
);


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    po_number text NOT NULL,
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
    rfq_supplier_ids uuid[] DEFAULT '{}'::uuid[],
    supplier_id uuid,
    quote_deadline date,
    currency_id uuid,
    initial_exchange_rate numeric DEFAULT 1 NOT NULL,
    initial_rate_captured_at timestamp with time zone,
    initial_rate_captured_by uuid,
    exchange_gain numeric DEFAULT 0 NOT NULL,
    exchange_loss numeric DEFAULT 0 NOT NULL,
    exchange_net numeric GENERATED ALWAYS AS ((COALESCE(exchange_gain, (0)::numeric) - COALESCE(exchange_loss, (0)::numeric))) STORED
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
    brand_variant_id uuid,
    sub_container_id uuid NOT NULL
);


--
-- Name: receival_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.receival_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: repair_vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repair_vendors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    address text,
    notes text,
    virtual_warehouse_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    sub_container_id uuid NOT NULL
);


--
-- Name: return_line_inventory_dispositions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_line_inventory_dispositions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_line_id uuid NOT NULL,
    disposition_type text NOT NULL,
    qty numeric NOT NULL,
    inventory_stock_movement_id uuid,
    warehouse_transfer_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT return_line_inventory_dispositions_disposition_type_check CHECK ((disposition_type = ANY (ARRAY['write_off'::text, 'restock_as_damaged'::text, 'send_for_repair'::text]))),
    CONSTRAINT return_line_inventory_dispositions_link_matches_type CHECK (
CASE disposition_type
    WHEN 'write_off'::text THEN ((inventory_stock_movement_id IS NOT NULL) AND (warehouse_transfer_id IS NULL))
    WHEN 'restock_as_damaged'::text THEN ((inventory_stock_movement_id IS NULL) AND (warehouse_transfer_id IS NULL))
    WHEN 'send_for_repair'::text THEN (inventory_stock_movement_id IS NULL)
    ELSE NULL::boolean
END),
    CONSTRAINT return_line_inventory_dispositions_qty_check CHECK ((qty > (0)::numeric))
);


--
-- Name: return_line_progress; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.return_line_progress WITH (security_invoker='true') AS
 WITH cust AS (
         SELECT return_line_customer_resolutions.return_line_id,
            sum(return_line_customer_resolutions.qty) AS sum_qty
           FROM public.return_line_customer_resolutions
          GROUP BY return_line_customer_resolutions.return_line_id
        ), inv AS (
         SELECT return_line_inventory_dispositions.return_line_id,
            sum(return_line_inventory_dispositions.qty) AS sum_qty
           FROM public.return_line_inventory_dispositions
          GROUP BY return_line_inventory_dispositions.return_line_id
        ), cust_mix AS (
         SELECT x.return_line_id,
            jsonb_object_agg(x.resolution_type, x.sum_qty) AS by_type
           FROM ( SELECT return_line_customer_resolutions.return_line_id,
                    return_line_customer_resolutions.resolution_type,
                    sum(return_line_customer_resolutions.qty) AS sum_qty
                   FROM public.return_line_customer_resolutions
                  GROUP BY return_line_customer_resolutions.return_line_id, return_line_customer_resolutions.resolution_type) x
          GROUP BY x.return_line_id
        ), inv_mix AS (
         SELECT x.return_line_id,
            jsonb_object_agg(x.disposition_type, x.sum_qty) AS by_type
           FROM ( SELECT return_line_inventory_dispositions.return_line_id,
                    return_line_inventory_dispositions.disposition_type,
                    sum(return_line_inventory_dispositions.qty) AS sum_qty
                   FROM public.return_line_inventory_dispositions
                  GROUP BY return_line_inventory_dispositions.return_line_id, return_line_inventory_dispositions.disposition_type) x
          GROUP BY x.return_line_id
        )
 SELECT rl.id AS return_line_id,
    rl.return_id,
    rl.brand_variant_id,
    rl.item_name,
    rl.sku,
    rl.qty AS returned_qty,
    rl.condition,
    COALESCE(cust.sum_qty, (0)::numeric) AS customer_resolved_qty,
    GREATEST((0)::numeric, ((rl.qty)::numeric - COALESCE(cust.sum_qty, (0)::numeric))) AS customer_remaining_qty,
        CASE
            WHEN (rl.condition = 'damaged'::text) THEN COALESCE(inv.sum_qty, (0)::numeric)
            ELSE NULL::numeric
        END AS inventory_resolved_qty,
        CASE
            WHEN (rl.condition = 'damaged'::text) THEN GREATEST((0)::numeric, ((rl.qty)::numeric - COALESCE(inv.sum_qty, (0)::numeric)))
            ELSE (0)::numeric
        END AS inventory_remaining_qty,
    cust_mix.by_type AS customer_resolutions_by_type,
    inv_mix.by_type AS inventory_dispositions_by_type
   FROM ((((public.return_lines rl
     LEFT JOIN cust ON ((cust.return_line_id = rl.id)))
     LEFT JOIN inv ON ((inv.return_line_id = rl.id)))
     LEFT JOIN cust_mix ON ((cust_mix.return_line_id = rl.id)))
     LEFT JOIN inv_mix ON ((inv_mix.return_line_id = rl.id)));


--
-- Name: return_progress; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.return_progress AS
SELECT
    NULL::uuid AS return_id,
    NULL::text AS return_number,
    NULL::public.return_status AS status,
    NULL::numeric AS total_returned,
    NULL::numeric AS customer_resolved,
    NULL::numeric AS customer_remaining,
    NULL::numeric AS total_damaged,
    NULL::numeric AS inventory_resolved,
    NULL::numeric AS inventory_remaining,
    NULL::jsonb AS customer_resolutions_by_type,
    NULL::jsonb AS inventory_dispositions_by_type,
    NULL::text AS customer_status,
    NULL::text AS inventory_status,
    NULL::text AS overall_coverage_status,
    NULL::boolean AS compensation_missing;


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
    status public.sale_delivery_status DEFAULT 'pending'::public.sale_delivery_status,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    created_by_name text,
    type public.sale_delivery_type DEFAULT 'standard'::public.sale_delivery_type NOT NULL,
    return_id uuid,
    pdf_url text,
    source_credit_note_id uuid
);


--
-- Name: sale_delivery_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_delivery_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_delivery_id uuid NOT NULL,
    brand_variant_id uuid,
    item_name text DEFAULT 'Item'::text NOT NULL,
    sku text,
    qty_delivered integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
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
-- Name: sale_order_lines_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.sale_order_lines_summary WITH (security_invoker='true') AS
 WITH shipped AS (
         SELECT sd.sale_order_id,
            sdl.brand_variant_id,
            sdl.sku,
            sdl.item_name,
            sum(sdl.qty_delivered) AS qty
           FROM (public.sale_deliveries sd
             JOIN public.sale_delivery_lines sdl ON ((sdl.sale_delivery_id = sd.id)))
          WHERE ((sd.type = 'standard'::public.sale_delivery_type) AND (sd.status = 'delivered'::public.sale_delivery_status))
          GROUP BY sd.sale_order_id, sdl.brand_variant_id, sdl.sku, sdl.item_name
        ), replaced AS (
         SELECT sd.sale_order_id,
            sdl.brand_variant_id,
            sdl.sku,
            sdl.item_name,
            sum(sdl.qty_delivered) AS qty
           FROM (public.sale_deliveries sd
             JOIN public.sale_delivery_lines sdl ON ((sdl.sale_delivery_id = sd.id)))
          WHERE ((sd.type = 'replacement'::public.sale_delivery_type) AND (sd.status = 'delivered'::public.sale_delivery_status))
          GROUP BY sd.sale_order_id, sdl.brand_variant_id, sdl.sku, sdl.item_name
        ), returned_good AS (
         SELECT r.source_id AS sale_order_id,
            rl.brand_variant_id,
            rl.sku,
            rl.item_name,
            sum(rl.qty) AS qty
           FROM (public.so_po_returns r
             JOIN public.return_lines rl ON ((rl.return_id = r.id)))
          WHERE ((r.source_type = 'sale_order'::public.return_source_type) AND (r.status = ANY (ARRAY['restocked'::public.return_status, 'resolved_credit'::public.return_status, 'resolved_replacement'::public.return_status, 'resolved_partial'::public.return_status])) AND (rl.condition = 'good'::text) AND (r.deleted_at IS NULL))
          GROUP BY r.source_id, rl.brand_variant_id, rl.sku, rl.item_name
        )
 SELECT sol.id AS sale_order_line_id,
    sol.sale_order_id,
    sol.brand_variant_id,
    sol.sku,
    sol.item_name,
    sol.qty,
    (COALESCE(s.qty, (0)::bigint))::numeric AS shipped_qty,
    (COALESCE(rg.qty, (0)::bigint))::numeric AS returned_good_qty,
    (COALESCE(rp.qty, (0)::bigint))::numeric AS replacement_qty,
    (GREATEST((0)::bigint, ((COALESCE(s.qty, (0)::bigint) - COALESCE(rg.qty, (0)::bigint)) + COALESCE(rp.qty, (0)::bigint))))::numeric AS net_delivered_qty
   FROM (((public.sale_order_lines sol
     LEFT JOIN shipped s ON (((s.sale_order_id = sol.sale_order_id) AND (NOT (s.brand_variant_id IS DISTINCT FROM sol.brand_variant_id)) AND ((sol.brand_variant_id IS NOT NULL) OR (NOT (s.sku IS DISTINCT FROM sol.sku))))))
     LEFT JOIN returned_good rg ON (((rg.sale_order_id = sol.sale_order_id) AND (NOT (rg.brand_variant_id IS DISTINCT FROM sol.brand_variant_id)) AND ((sol.brand_variant_id IS NOT NULL) OR (NOT (rg.sku IS DISTINCT FROM sol.sku))))))
     LEFT JOIN replaced rp ON (((rp.sale_order_id = sol.sale_order_id) AND (NOT (rp.brand_variant_id IS DISTINCT FROM sol.brand_variant_id)) AND ((sol.brand_variant_id IS NOT NULL) OR (NOT (rp.sku IS DISTINCT FROM sol.sku))))));


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
    force_approved boolean DEFAULT false NOT NULL,
    force_comment text,
    CONSTRAINT stock_adjustment_approvals_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: stock_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    brand_variant_id uuid NOT NULL,
    adjustment_type public.stock_adjustment_type NOT NULL,
    qty numeric NOT NULL,
    reason text NOT NULL,
    notes text,
    photo_urls text[],
    status text DEFAULT 'pending_approval'::text NOT NULL,
    requested_by uuid,
    requested_by_name text,
    approved_by_name text,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_check_id uuid,
    source_check_item_id uuid,
    sub_container_id uuid NOT NULL,
    source_pile text DEFAULT 'good'::text NOT NULL,
    CONSTRAINT stock_adjustments_source_pile_check CHECK ((source_pile = ANY (ARRAY['good'::text, 'damaged'::text]))),
    CONSTRAINT stock_adjustments_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: storage_cleanup_failures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_cleanup_failures (
    id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    bucket text NOT NULL,
    path text NOT NULL,
    source_table text,
    source_id text,
    error_text text
);


--
-- Name: storage_cleanup_failures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.storage_cleanup_failures_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: storage_cleanup_failures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.storage_cleanup_failures_id_seq OWNED BY public.storage_cleanup_failures.id;


--
-- Name: supplier_credit_balances; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.supplier_credit_balances WITH (security_invoker='on') AS
 SELECT po.supplier_id,
    COALESCE(po.currency, 'QAR'::text) AS currency,
    count(*) AS open_count,
    sum(dn.total_amount) AS open_amount
   FROM (public.debit_notes dn
     JOIN public.purchase_orders po ON ((po.id = dn.purchase_order_id)))
  WHERE ((dn.resolution_type = 'supplier_credit'::text) AND (dn.status <> 'void'::public.credit_note_status) AND (po.supplier_id IS NOT NULL))
  GROUP BY po.supplier_id, COALESCE(po.currency, 'QAR'::text);


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
    country_id integer,
    CONSTRAINT suppliers_supplier_type_check CHECK ((supplier_type = ANY (ARRAY['local'::text, 'international'::text])))
);


--
-- Name: tool_asset_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_asset_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid,
    serial_number text,
    brand text,
    condition public.tool_condition DEFAULT 'Good'::public.tool_condition,
    status public.tool_status DEFAULT 'available'::public.tool_status,
    expiry date,
    assigned_to uuid,
    created_at timestamp with time zone DEFAULT now(),
    receival_item_id uuid,
    is_placeholder boolean DEFAULT false NOT NULL
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
-- Name: user_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_data (
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
    must_change_password boolean DEFAULT false NOT NULL,
    is_division_manager boolean DEFAULT false NOT NULL,
    title text DEFAULT 'Mr.'::text NOT NULL,
    threecx_extension text,
    has_contact_centre_access boolean DEFAULT false NOT NULL,
    active_division_id uuid
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
-- Name: warehouse_responsible_persons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_responsible_persons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: warehouse_stock_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_stock_allocations (
    warehouse_id uuid NOT NULL,
    brand_variant_id uuid NOT NULL,
    allocated_qty integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sub_container_id uuid NOT NULL
);


--
-- Name: warehouse_stock_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_stock_summary (
    warehouse_id uuid NOT NULL,
    brand_variant_id uuid NOT NULL,
    item_name text,
    brand text,
    sku text,
    unit text,
    qty integer DEFAULT 0 NOT NULL,
    avg_cost numeric DEFAULT 0 NOT NULL,
    total_value numeric DEFAULT 0 NOT NULL,
    category_name text,
    subcategory_name text,
    item_type text,
    allocated_qty integer DEFAULT 0 NOT NULL,
    available_qty integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sub_container_id uuid NOT NULL
);


--
-- Name: warehouse_sub_containers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_sub_containers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    division_id uuid,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    team_id uuid,
    responsible_person_profile_id uuid
);


--
-- Name: warehouse_stock_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.warehouse_stock_view WITH (security_invoker='true') AS
 SELECT wss.warehouse_id,
    wss.sub_container_id,
    wss.brand_variant_id,
    wss.item_name,
    wss.brand,
    wss.sku,
    wss.unit,
    wss.qty,
    wss.avg_cost,
    wss.total_value,
    wss.category_name,
    wss.subcategory_name,
    wss.item_type,
    wss.allocated_qty,
    wss.available_qty,
    wsc.name AS sub_container_name,
    ii.image_url
   FROM (((public.warehouse_stock_summary wss
     LEFT JOIN public.warehouse_sub_containers wsc ON ((wsc.id = wss.sub_container_id)))
     LEFT JOIN public.inventory_item_brand_variants bv ON ((bv.id = wss.brand_variant_id)))
     LEFT JOIN public.inventory_items ii ON ((ii.id = bv.item_id)));


--
-- Name: warehouse_sub_container_totals; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.warehouse_sub_container_totals WITH (security_invoker='false') AS
 SELECT sc.warehouse_id,
    sc.id AS sub_container_id,
    sc.name AS sub_container_name,
    sc.is_active AS sub_container_is_active,
    count(DISTINCT fcl.brand_variant_id) FILTER (WHERE (fcl.remaining_qty > 0)) AS item_count,
    (COALESCE(sum(fcl.remaining_qty) FILTER (WHERE (fcl.remaining_qty > 0)), (0)::bigint))::numeric AS total_qty,
    COALESCE(sum(((fcl.remaining_qty)::numeric * fcl.total_unit_cost)) FILTER (WHERE (fcl.remaining_qty > 0)), (0)::numeric) AS total_value
   FROM (public.warehouse_sub_containers sc
     LEFT JOIN public.fifo_cost_layers fcl ON ((fcl.sub_container_id = sc.id)))
  WHERE (sc.is_active = true)
  GROUP BY sc.warehouse_id, sc.id, sc.name, sc.is_active;


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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sub_container_id uuid NOT NULL
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
    created_by_name text,
    approved_by_name text,
    date date NOT NULL,
    approved_date date,
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
    approved_by_profile_id uuid,
    transfer_kind text DEFAULT 'good_stock'::text NOT NULL,
    repair_vendor_id uuid,
    source_return_line_disposition_id uuid,
    expected_return_date date,
    repair_cost numeric,
    from_sub_container_id uuid NOT NULL,
    to_sub_container_id uuid NOT NULL,
    CONSTRAINT check_different_warehouses CHECK ((from_warehouse_id <> to_warehouse_id)),
    CONSTRAINT warehouse_transfers_kind_check CHECK ((transfer_kind = ANY (ARRAY['good_stock'::text, 'damaged_repair_out'::text, 'damaged_repair_return_good'::text, 'damaged_repair_return_writeoff'::text, 'custody_assign'::text, 'custody_return'::text]))),
    CONSTRAINT warehouse_transfers_repair_cost_check CHECK (((repair_cost IS NULL) OR (repair_cost >= (0)::numeric))),
    CONSTRAINT warehouse_transfers_repair_shape CHECK (
CASE transfer_kind
    WHEN 'good_stock'::text THEN ((repair_vendor_id IS NULL) AND (source_return_line_disposition_id IS NULL))
    WHEN 'damaged_repair_out'::text THEN (repair_vendor_id IS NOT NULL)
    WHEN 'damaged_repair_return_good'::text THEN (repair_vendor_id IS NOT NULL)
    WHEN 'damaged_repair_return_writeoff'::text THEN (repair_vendor_id IS NOT NULL)
    WHEN 'custody_assign'::text THEN ((repair_vendor_id IS NULL) AND (source_return_line_disposition_id IS NULL))
    WHEN 'custody_return'::text THEN ((repair_vendor_id IS NULL) AND (source_return_line_disposition_id IS NULL))
    ELSE NULL::boolean
END)
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
    updated_at timestamp with time zone DEFAULT now(),
    is_virtual boolean DEFAULT false NOT NULL,
    repair_vendor_id uuid,
    company_id uuid,
    warehouse_kind text DEFAULT 'general'::text NOT NULL,
    CONSTRAINT warehouses_kind_check CHECK ((warehouse_kind = ANY (ARRAY['general'::text, 'repair'::text, 'teams'::text, 'places'::text])))
);


--
-- Name: warranty_number_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_number_counters (
    source_type public.warranty_source_type NOT NULL,
    division_id uuid NOT NULL,
    next_value integer DEFAULT 1 NOT NULL,
    CONSTRAINT warranty_number_counters_next_value_check CHECK ((next_value > 0))
);


--
-- Name: warranty_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    duration_months integer NOT NULL,
    coverage_type text NOT NULL,
    starts_from text DEFAULT 'delivery_date'::text NOT NULL,
    terms_en text,
    terms_ar text,
    void_conditions text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT warranty_policies_coverage_type_check CHECK ((coverage_type = ANY (ARRAY['none'::text, 'parts_only'::text, 'parts_and_labor'::text, 'replacement_only'::text]))),
    CONSTRAINT warranty_policies_duration_months_check CHECK ((duration_months >= 0)),
    CONSTRAINT warranty_policies_starts_from_check CHECK ((starts_from = ANY (ARRAY['delivery_date'::text, 'invoice_date'::text])))
);


--
-- Name: warranty_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warranty_number text NOT NULL,
    sale_delivery_line_id uuid NOT NULL,
    sale_order_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    division_id uuid NOT NULL,
    brand_variant_id uuid,
    item_name text NOT NULL,
    sku text,
    qty integer NOT NULL,
    policy_id uuid NOT NULL,
    policy_name_snapshot text NOT NULL,
    coverage_type_snapshot text NOT NULL,
    duration_months_snapshot integer NOT NULL,
    terms_en_snapshot text,
    terms_ar_snapshot text,
    void_conditions_snapshot text[] DEFAULT '{}'::text[] NOT NULL,
    starts_from_snapshot text DEFAULT 'delivery_date'::text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_type public.warranty_source_type DEFAULT 'sale'::public.warranty_source_type NOT NULL,
    CONSTRAINT warranty_records_coverage_type_snapshot_check CHECK ((coverage_type_snapshot = ANY (ARRAY['none'::text, 'parts_only'::text, 'parts_and_labor'::text, 'replacement_only'::text]))),
    CONSTRAINT warranty_records_duration_months_snapshot_check CHECK ((duration_months_snapshot >= 0)),
    CONSTRAINT warranty_records_end_after_start CHECK ((end_date >= start_date)),
    CONSTRAINT warranty_records_qty_check CHECK ((qty > 0)),
    CONSTRAINT warranty_records_starts_from_snapshot_check CHECK ((starts_from_snapshot = ANY (ARRAY['delivery_date'::text, 'invoice_date'::text])))
);


--
-- Name: country_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_codes ALTER COLUMN id SET DEFAULT nextval('public.country_codes_id_seq'::regclass);


--
-- Name: storage_cleanup_failures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_cleanup_failures ALTER COLUMN id SET DEFAULT nextval('public.storage_cleanup_failures_id_seq'::regclass);


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
-- Name: bill_line_items bill_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_line_items
    ADD CONSTRAINT bill_line_items_pkey PRIMARY KEY (id);


--
-- Name: bills bills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_pkey PRIMARY KEY (id);


--
-- Name: bills bills_purchase_order_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_purchase_order_id_unique UNIQUE (purchase_order_id);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


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
-- Name: consumption_edit_requests consumption_edit_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_edit_requests
    ADD CONSTRAINT consumption_edit_requests_pkey PRIMARY KEY (id);


--
-- Name: consumption_entries consumption_entries_ce_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_entries
    ADD CONSTRAINT consumption_entries_ce_number_key UNIQUE (ce_number);


--
-- Name: consumption_entries consumption_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_entries
    ADD CONSTRAINT consumption_entries_pkey PRIMARY KEY (id);


--
-- Name: consumption_lines consumption_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_lines
    ADD CONSTRAINT consumption_lines_pkey PRIMARY KEY (id);


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
-- Name: debit_note_lines debit_note_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_note_lines
    ADD CONSTRAINT debit_note_lines_pkey PRIMARY KEY (id);


--
-- Name: debit_notes debit_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_notes
    ADD CONSTRAINT debit_notes_pkey PRIMARY KEY (id);


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
-- Name: exchange_rate_change_log exchange_rate_change_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rate_change_log
    ADD CONSTRAINT exchange_rate_change_log_pkey PRIMARY KEY (id);


--
-- Name: fifo_cost_layers fifo_cost_layers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fifo_cost_layers
    ADD CONSTRAINT fifo_cost_layers_pkey PRIMARY KEY (id);


--
-- Name: inventory_attribute_definitions inventory_attribute_definitions_category_id_attribute_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_attribute_definitions
    ADD CONSTRAINT inventory_attribute_definitions_category_id_attribute_key_key UNIQUE (category_id, attribute_key);


--
-- Name: inventory_attribute_definitions inventory_attribute_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_attribute_definitions
    ADD CONSTRAINT inventory_attribute_definitions_pkey PRIMARY KEY (id);


--
-- Name: inventory_attribute_options inventory_attribute_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_attribute_options
    ADD CONSTRAINT inventory_attribute_options_pkey PRIMARY KEY (id);


--
-- Name: inventory_item_brand_variants inventory_brand_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_brand_variants
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
-- Name: inventory_damaged_movements inventory_damaged_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_movements
    ADD CONSTRAINT inventory_damaged_movements_pkey PRIMARY KEY (id);


--
-- Name: inventory_damaged_stock_layers inventory_damaged_stock_layers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_stock_layers
    ADD CONSTRAINT inventory_damaged_stock_layers_pkey PRIMARY KEY (id);


--
-- Name: inventory_damaged_stock inventory_damaged_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_stock
    ADD CONSTRAINT inventory_damaged_stock_pkey PRIMARY KEY (warehouse_id, brand_variant_id);


--
-- Name: inventory_item_attributes inventory_item_attributes_item_id_definition_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_attributes
    ADD CONSTRAINT inventory_item_attributes_item_id_definition_id_key UNIQUE (item_id, definition_id);


--
-- Name: inventory_item_attributes inventory_item_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_attributes
    ADD CONSTRAINT inventory_item_attributes_pkey PRIMARY KEY (id);


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
-- Name: so_invoices invoices_invoice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.so_invoices
    ADD CONSTRAINT invoices_invoice_id_key UNIQUE (invoice_id);


--
-- Name: so_invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.so_invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: landed_cost_item_allocations landed_cost_item_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landed_cost_item_allocations
    ADD CONSTRAINT landed_cost_item_allocations_pkey PRIMARY KEY (id);


--
-- Name: landed_cost_lines landed_cost_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landed_cost_lines
    ADD CONSTRAINT landed_cost_lines_pkey PRIMARY KEY (id);


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
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


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
-- Name: po_version_lines po_version_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_version_lines
    ADD CONSTRAINT po_version_lines_pkey PRIMARY KEY (id);


--
-- Name: po_versions po_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_versions
    ADD CONSTRAINT po_versions_pkey PRIMARY KEY (id);


--
-- Name: user_data profiles_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_data
    ADD CONSTRAINT profiles_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: user_data profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_data
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
-- Name: repair_vendors repair_vendors_name_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_vendors
    ADD CONSTRAINT repair_vendors_name_uq UNIQUE (name);


--
-- Name: repair_vendors repair_vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_vendors
    ADD CONSTRAINT repair_vendors_pkey PRIMARY KEY (id);


--
-- Name: return_line_customer_resolutions return_line_customer_resolutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_line_customer_resolutions
    ADD CONSTRAINT return_line_customer_resolutions_pkey PRIMARY KEY (id);


--
-- Name: return_line_inventory_dispositions return_line_inventory_dispositions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_line_inventory_dispositions
    ADD CONSTRAINT return_line_inventory_dispositions_pkey PRIMARY KEY (id);


--
-- Name: return_lines return_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_lines
    ADD CONSTRAINT return_lines_pkey PRIMARY KEY (id);


--
-- Name: so_po_returns returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.so_po_returns
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
-- Name: sale_delivery_lines sale_delivery_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_delivery_lines
    ADD CONSTRAINT sale_delivery_lines_pkey PRIMARY KEY (id);


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
-- Name: so_invoices so_invoices_sale_order_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.so_invoices
    ADD CONSTRAINT so_invoices_sale_order_id_unique UNIQUE (sale_order_id);


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
-- Name: storage_cleanup_failures storage_cleanup_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_cleanup_failures
    ADD CONSTRAINT storage_cleanup_failures_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: tool_asset_units tool_asset_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_asset_units
    ADD CONSTRAINT tool_asset_units_pkey PRIMARY KEY (id);


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
-- Name: warehouse_responsible_persons warehouse_field_rps_warehouse_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_responsible_persons
    ADD CONSTRAINT warehouse_field_rps_warehouse_id_profile_id_key UNIQUE (warehouse_id, profile_id);


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
-- Name: warehouse_responsible_persons warehouse_responsible_persons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_responsible_persons
    ADD CONSTRAINT warehouse_responsible_persons_pkey PRIMARY KEY (id);


--
-- Name: warehouse_stock_allocations warehouse_stock_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_allocations
    ADD CONSTRAINT warehouse_stock_allocations_pkey PRIMARY KEY (warehouse_id, brand_variant_id, sub_container_id);


--
-- Name: warehouse_stock_summary warehouse_stock_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_summary
    ADD CONSTRAINT warehouse_stock_summary_pkey PRIMARY KEY (warehouse_id, sub_container_id, brand_variant_id);


--
-- Name: warehouse_sub_containers warehouse_sub_containers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_sub_containers
    ADD CONSTRAINT warehouse_sub_containers_pkey PRIMARY KEY (id);


--
-- Name: warehouse_sub_containers warehouse_sub_containers_warehouse_name_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_sub_containers
    ADD CONSTRAINT warehouse_sub_containers_warehouse_name_uniq UNIQUE (warehouse_id, name);


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
-- Name: warranty_number_counters warranty_number_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_number_counters
    ADD CONSTRAINT warranty_number_counters_pkey PRIMARY KEY (source_type, division_id);


--
-- Name: warranty_policies warranty_policies_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_policies
    ADD CONSTRAINT warranty_policies_name_key UNIQUE (name);


--
-- Name: warranty_policies warranty_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_policies
    ADD CONSTRAINT warranty_policies_pkey PRIMARY KEY (id);


--
-- Name: warranty_records warranty_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_records
    ADD CONSTRAINT warranty_records_pkey PRIMARY KEY (id);


--
-- Name: warranty_records warranty_records_sale_delivery_line_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_records
    ADD CONSTRAINT warranty_records_sale_delivery_line_id_key UNIQUE (sale_delivery_line_id);


--
-- Name: warranty_records warranty_records_warranty_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_records
    ADD CONSTRAINT warranty_records_warranty_number_key UNIQUE (warranty_number);


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

CREATE INDEX ccga_pending_idx ON public.customer_credit_group_approvals USING btree (request_id) WHERE ((status = 'pending'::public.approval_status) AND is_active);


--
-- Name: ccga_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ccga_request_idx ON public.customer_credit_group_approvals USING btree (request_id);


--
-- Name: ccgr_customer_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ccgr_customer_pending_idx ON public.customer_credit_group_requests USING btree (customer_id) WHERE (status = 'pending'::public.credit_group_request_status);


--
-- Name: ce_edit_requests_consumption_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ce_edit_requests_consumption_idx ON public.consumption_edit_requests USING btree (consumption_id);


--
-- Name: ce_edit_requests_one_pending_per_consumption; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ce_edit_requests_one_pending_per_consumption ON public.consumption_edit_requests USING btree (consumption_id) WHERE (status = 'pending'::text);


--
-- Name: ce_edit_requests_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ce_edit_requests_pending_idx ON public.consumption_edit_requests USING btree (consumption_id) WHERE (status = 'pending'::text);


--
-- Name: cogs_entries_source_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cogs_entries_source_id_idx ON public.cogs_entries USING btree (source_id);


--
-- Name: debit_notes_source_return_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX debit_notes_source_return_id_unique ON public.debit_notes USING btree (source_return_id) WHERE (source_return_id IS NOT NULL);


--
-- Name: exchange_rate_change_log_document_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_rate_change_log_document_idx ON public.exchange_rate_change_log USING btree (document_type, document_id, changed_at DESC);


--
-- Name: iad_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iad_category_idx ON public.inventory_attribute_definitions USING btree (category_id);


--
-- Name: iad_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iad_key_idx ON public.inventory_attribute_definitions USING btree (attribute_key);


--
-- Name: iao_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iao_active_idx ON public.inventory_attribute_options USING btree (definition_id) WHERE (NOT is_archived);


--
-- Name: iao_definition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iao_definition_idx ON public.inventory_attribute_options USING btree (definition_id);


--
-- Name: iao_value_en_ci_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX iao_value_en_ci_uidx ON public.inventory_attribute_options USING btree (definition_id, lower(value_en));


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
-- Name: idx_bill_line_items_bill_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bill_line_items_bill_id ON public.bill_line_items USING btree (bill_id);


--
-- Name: idx_bills_division_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bills_division_id ON public.bills USING btree (division_id);


--
-- Name: idx_bills_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bills_payment_status ON public.bills USING btree (payment_status) WHERE (payment_status <> 'paid'::public.invoice_payment_status);


--
-- Name: idx_bills_purchase_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bills_purchase_order_id ON public.bills USING btree (purchase_order_id);


--
-- Name: idx_bills_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bills_supplier_id ON public.bills USING btree (supplier_id);


--
-- Name: idx_brand_variants_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brand_variants_item ON public.inventory_item_brand_variants USING btree (item_id);


--
-- Name: idx_cogs_delivery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cogs_delivery ON public.cogs_entries USING btree (sale_delivery_id) WHERE (sale_delivery_id IS NOT NULL);


--
-- Name: idx_cogs_entries_consumer_division_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cogs_entries_consumer_division_id ON public.cogs_entries USING btree (consumer_division_id) WHERE (consumer_division_id IS NOT NULL);


--
-- Name: idx_cogs_entries_consumption; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cogs_entries_consumption ON public.cogs_entries USING btree (consumption_id) WHERE (consumption_id IS NOT NULL);


--
-- Name: idx_cogs_entries_division_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cogs_entries_division_id ON public.cogs_entries USING btree (division_id) WHERE (division_id IS NOT NULL);


--
-- Name: idx_cogs_entries_lc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cogs_entries_lc ON public.cogs_entries USING btree (landed_cost_id) WHERE (landed_cost_id IS NOT NULL);


--
-- Name: idx_cogs_entries_sale_delivery_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cogs_entries_sale_delivery_id ON public.cogs_entries USING btree (sale_delivery_id) WHERE (sale_delivery_id IS NOT NULL);


--
-- Name: idx_cogs_entries_sale_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cogs_entries_sale_order_id ON public.cogs_entries USING btree (sale_order_id) WHERE (sale_order_id IS NOT NULL);


--
-- Name: idx_cogs_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cogs_variant ON public.cogs_entries USING btree (brand_variant_id);


--
-- Name: idx_cogs_variant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cogs_variant_date ON public.cogs_entries USING btree (brand_variant_id, date);


--
-- Name: idx_consumption_entries_consumer_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_entries_consumer_customer ON public.consumption_entries USING btree (consumer_customer_id) WHERE (consumer_customer_id IS NOT NULL);


--
-- Name: idx_consumption_entries_consumer_place; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_entries_consumer_place ON public.consumption_entries USING btree (consumer_place_sub_id) WHERE (consumer_place_sub_id IS NOT NULL);


--
-- Name: idx_consumption_entries_consumer_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_entries_consumer_team ON public.consumption_entries USING btree (consumer_team_sub_id) WHERE (consumer_team_sub_id IS NOT NULL);


--
-- Name: idx_consumption_entries_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_entries_division ON public.consumption_entries USING btree (division_id) WHERE (division_id IS NOT NULL);


--
-- Name: idx_consumption_entries_source_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_entries_source_sub ON public.consumption_entries USING btree (source_sub_container_id);


--
-- Name: idx_consumption_entries_status_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_entries_status_date ON public.consumption_entries USING btree (status, date DESC);


--
-- Name: idx_consumption_lines_consumption; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_lines_consumption ON public.consumption_lines USING btree (consumption_id);


--
-- Name: idx_consumption_lines_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumption_lines_variant ON public.consumption_lines USING btree (brand_variant_id);


--
-- Name: idx_credit_note_lines_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_note_lines_type ON public.credit_note_lines USING btree (credit_note_id, line_type);


--
-- Name: idx_credit_notes_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_notes_customer_id ON public.credit_notes USING btree (customer_id);


--
-- Name: idx_credit_notes_reason_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_notes_reason_id ON public.credit_notes USING btree (reason_id);


--
-- Name: idx_credit_notes_refund_method_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_notes_refund_method_id ON public.credit_notes USING btree (refund_method_id);


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
-- Name: idx_debit_note_lines_note_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debit_note_lines_note_id ON public.debit_note_lines USING btree (debit_note_id);


--
-- Name: idx_debit_notes_bill_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debit_notes_bill_id ON public.debit_notes USING btree (bill_id);


--
-- Name: idx_debit_notes_po_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debit_notes_po_id ON public.debit_notes USING btree (purchase_order_id);


--
-- Name: idx_debit_notes_reason_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debit_notes_reason_id ON public.debit_notes USING btree (reason_id);


--
-- Name: idx_debit_notes_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debit_notes_supplier_id ON public.debit_notes USING btree (supplier_id);


--
-- Name: idx_fifo_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fifo_brand ON public.fifo_cost_layers USING btree (brand_variant_id);


--
-- Name: idx_fifo_cost_layers_receival; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fifo_cost_layers_receival ON public.fifo_cost_layers USING btree (receival_id);


--
-- Name: idx_fifo_cost_layers_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fifo_cost_layers_source ON public.fifo_cost_layers USING btree (source_type, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: idx_fifo_warehouse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fifo_warehouse ON public.fifo_cost_layers USING btree (brand_variant_id, warehouse_id);


--
-- Name: idx_idm_source_disp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idm_source_disp ON public.inventory_damaged_movements USING btree (source_return_line_disposition_id);


--
-- Name: idx_idm_source_transfer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idm_source_transfer ON public.inventory_damaged_movements USING btree (source_transfer_id);


--
-- Name: idx_idm_wh_variant_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idm_wh_variant_time ON public.inventory_damaged_movements USING btree (warehouse_id, brand_variant_id, created_at);


--
-- Name: idx_idsl_wh_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idsl_wh_variant ON public.inventory_damaged_stock_layers USING btree (warehouse_id, brand_variant_id, layered_at);


--
-- Name: idx_inventory_brand_variants_brand_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_brand_variants_brand_id ON public.inventory_item_brand_variants USING btree (brand_id);


--
-- Name: idx_inventory_categories_default_sub_container; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_categories_default_sub_container ON public.inventory_categories USING btree (default_sub_container_id) WHERE (default_sub_container_id IS NOT NULL);


--
-- Name: idx_inventory_categories_default_warranty_policy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_categories_default_warranty_policy ON public.inventory_categories USING btree (default_warranty_policy_id) WHERE (default_warranty_policy_id IS NOT NULL);


--
-- Name: idx_inventory_categories_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_categories_parent_id ON public.inventory_categories USING btree (parent_id);


--
-- Name: idx_inventory_check_assignments_check_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_check_assignments_check_id ON public.inventory_check_assignments USING btree (check_id, created_at);


--
-- Name: idx_inventory_checks_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_checks_created_at ON public.inventory_checks USING btree (created_at DESC);


--
-- Name: idx_inventory_checks_warehouse_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_checks_warehouse_id ON public.inventory_checks USING btree (warehouse_id);


--
-- Name: idx_inventory_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_category ON public.inventory_items USING btree (category_id);


--
-- Name: idx_inventory_items_default_sub_container_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_default_sub_container_id ON public.inventory_items USING btree (default_sub_container_id) WHERE (default_sub_container_id IS NOT NULL);


--
-- Name: idx_inventory_items_default_warehouse_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_default_warehouse_id ON public.inventory_items USING btree (default_warehouse_id) WHERE (default_warehouse_id IS NOT NULL);


--
-- Name: idx_inventory_items_shared_with_division_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_shared_with_division_ids ON public.inventory_items USING gin (shared_with_division_ids);


--
-- Name: idx_inventory_items_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_sku ON public.inventory_items USING btree (sku);


--
-- Name: idx_inventory_items_warranty_policy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_warranty_policy ON public.inventory_items USING btree (warranty_policy_id) WHERE (warranty_policy_id IS NOT NULL);


--
-- Name: idx_invoice_line_items_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_line_items_invoice ON public.invoice_line_items USING btree (invoice_id);


--
-- Name: idx_invoices_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_customer ON public.so_invoices USING btree (customer_id);


--
-- Name: idx_invoices_division_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_division_id ON public.so_invoices USING btree (division_id);


--
-- Name: idx_invoices_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_due_date ON public.so_invoices USING btree (due_date);


--
-- Name: idx_invoices_qb_synced; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_qb_synced ON public.so_invoices USING btree (qb_synced) WHERE (qb_synced = false);


--
-- Name: idx_invoices_sale_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_sale_order_id ON public.so_invoices USING btree (sale_order_id);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.so_invoices USING btree (status, payment_status);


--
-- Name: idx_landed_cost_item_alloc_brand_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landed_cost_item_alloc_brand_variant ON public.landed_cost_item_allocations USING btree (brand_variant_id);


--
-- Name: idx_landed_cost_item_alloc_lc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landed_cost_item_alloc_lc ON public.landed_cost_item_allocations USING btree (landed_cost_id);


--
-- Name: idx_landed_cost_lines_lc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landed_cost_lines_lc ON public.landed_cost_lines USING btree (landed_cost_id);


--
-- Name: idx_landed_costs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landed_costs_date ON public.landed_costs USING btree (date DESC);


--
-- Name: idx_notifications_profile_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_profile_pending ON public.notifications USING btree (profile_id, created_at DESC) WHERE (actioned_at IS NULL);


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
-- Name: idx_payments_bill_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_bill_id ON public.payments USING btree (bill_id) WHERE (bill_id IS NOT NULL);


--
-- Name: idx_payments_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_customer_id ON public.payments USING btree (customer_id);


--
-- Name: idx_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_date ON public.payments USING btree (date);


--
-- Name: idx_payments_incoming; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_incoming ON public.payments USING btree (direction, deleted_at) WHERE (direction = 'incoming'::public.payment_direction);


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
-- Name: idx_payments_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_supplier_id ON public.payments USING btree (supplier_id);


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
-- Name: idx_po_line_items_brand_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_line_items_brand_id ON public.po_line_items USING btree (brand_id) WHERE (brand_id IS NOT NULL);


--
-- Name: idx_po_line_items_brand_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_line_items_brand_variant ON public.po_line_items USING btree (brand_variant_id);


--
-- Name: idx_po_line_items_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_line_items_po ON public.po_line_items USING btree (po_id);


--
-- Name: idx_po_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_status ON public.purchase_orders USING btree (status);


--
-- Name: idx_po_version_lines_brand_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_version_lines_brand_variant ON public.po_version_lines USING btree (brand_variant_id);


--
-- Name: idx_po_version_lines_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_version_lines_version ON public.po_version_lines USING btree (po_version_id);


--
-- Name: idx_po_versions_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_versions_supplier ON public.po_versions USING btree (supplier_id);


--
-- Name: idx_purchase_orders_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_created_by ON public.purchase_orders USING btree (created_by);


--
-- Name: idx_purchase_orders_division_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_division_id ON public.purchase_orders USING btree (division_id);


--
-- Name: idx_purchase_orders_po_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_po_type ON public.purchase_orders USING btree (po_type);


--
-- Name: idx_purchase_orders_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_supplier ON public.purchase_orders USING btree (supplier_id);


--
-- Name: idx_purchase_orders_warehouse_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_warehouse_id ON public.purchase_orders USING btree (warehouse_id);


--
-- Name: idx_receival_items_brand_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receival_items_brand_variant ON public.receival_items USING btree (brand_variant_id);


--
-- Name: idx_receival_items_po_line_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receival_items_po_line_item ON public.receival_items USING btree (po_line_item_id);


--
-- Name: idx_receival_items_receival_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receival_items_receival_id ON public.receival_items USING btree (receival_id);


--
-- Name: idx_receivals_division_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receivals_division_id ON public.receivals USING btree (division_id) WHERE (division_id IS NOT NULL);


--
-- Name: idx_receivals_po_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receivals_po_id ON public.receivals USING btree (po_id);


--
-- Name: idx_receivals_warehouse_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receivals_warehouse_id ON public.receivals USING btree (warehouse_id);


--
-- Name: idx_rer_receival; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rer_receival ON public.receival_edit_requests USING btree (receival_id);


--
-- Name: idx_rer_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rer_status ON public.receival_edit_requests USING btree (status);


--
-- Name: idx_return_lines_brand_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_return_lines_brand_variant ON public.return_lines USING btree (brand_variant_id);


--
-- Name: idx_return_lines_return; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_return_lines_return ON public.return_lines USING btree (return_id);


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
-- Name: idx_sale_delivery_lines_brand_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_delivery_lines_brand_variant ON public.sale_delivery_lines USING btree (brand_variant_id);


--
-- Name: idx_sale_delivery_lines_delivery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_delivery_lines_delivery ON public.sale_delivery_lines USING btree (sale_delivery_id);


--
-- Name: idx_sale_order_lines_brand_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_order_lines_brand_variant ON public.sale_order_lines USING btree (brand_variant_id);


--
-- Name: idx_sale_order_lines_sale_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_order_lines_sale_order ON public.sale_order_lines USING btree (sale_order_id);


--
-- Name: idx_sale_orders_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_orders_created_by ON public.sale_orders USING btree (created_by);


--
-- Name: idx_sale_orders_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_orders_customer_id ON public.sale_orders USING btree (customer_id);


--
-- Name: idx_sale_orders_division_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_orders_division_id ON public.sale_orders USING btree (division_id);


--
-- Name: idx_shipments_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipments_po ON public.shipments USING btree (po_id);


--
-- Name: idx_shipments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipments_status ON public.shipments USING btree (status);


--
-- Name: idx_stock_adjustments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_adjustments_created_at ON public.stock_adjustments USING btree (created_at DESC);


--
-- Name: idx_stock_adjustments_source_pile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_adjustments_source_pile ON public.stock_adjustments USING btree (source_pile) WHERE (source_pile = 'damaged'::text);


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
-- Name: idx_tool_asset_units_item_placeholder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tool_asset_units_item_placeholder ON public.tool_asset_units USING btree (item_id, is_placeholder) WHERE (is_placeholder = true);


--
-- Name: idx_tool_asset_units_receival_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tool_asset_units_receival_item ON public.tool_asset_units USING btree (receival_item_id);


--
-- Name: idx_user_divisions_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_divisions_profile_id ON public.user_company_divisions USING btree (profile_id);


--
-- Name: idx_warehouse_transfer_items_brand_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouse_transfer_items_brand_variant ON public.warehouse_transfer_items USING btree (brand_variant_id);


--
-- Name: idx_warehouse_transfer_items_transfer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouse_transfer_items_transfer ON public.warehouse_transfer_items USING btree (transfer_id);


--
-- Name: idx_warehouse_transfers_approved_by_profile_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouse_transfers_approved_by_profile_id ON public.warehouse_transfers USING btree (approved_by_profile_id);


--
-- Name: idx_warehouse_transfers_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouse_transfers_created_at ON public.warehouse_transfers USING btree (created_at DESC);


--
-- Name: idx_warehouse_transfers_from_warehouse_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouse_transfers_from_warehouse_id ON public.warehouse_transfers USING btree (from_warehouse_id);


--
-- Name: idx_warehouse_transfers_to_warehouse_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouse_transfers_to_warehouse_id ON public.warehouse_transfers USING btree (to_warehouse_id);


--
-- Name: idx_warehouses_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouses_kind ON public.warehouses USING btree (warehouse_kind) WHERE (warehouse_kind <> 'general'::text);


--
-- Name: idx_warranty_records_customer_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warranty_records_customer_end ON public.warranty_records USING btree (customer_id, end_date DESC);


--
-- Name: idx_warranty_records_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warranty_records_division ON public.warranty_records USING btree (division_id);


--
-- Name: idx_warranty_records_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warranty_records_end_date ON public.warranty_records USING btree (end_date);


--
-- Name: idx_warranty_records_policy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warranty_records_policy ON public.warranty_records USING btree (policy_id);


--
-- Name: idx_warranty_records_sale_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warranty_records_sale_order ON public.warranty_records USING btree (sale_order_id);


--
-- Name: idx_wsc_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wsc_division ON public.warehouse_sub_containers USING btree (division_id);


--
-- Name: idx_wsc_responsible_person; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wsc_responsible_person ON public.warehouse_sub_containers USING btree (responsible_person_profile_id) WHERE (responsible_person_profile_id IS NOT NULL);


--
-- Name: idx_wsc_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wsc_team_id ON public.warehouse_sub_containers USING btree (team_id) WHERE (team_id IS NOT NULL);


--
-- Name: idx_wsc_warehouse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wsc_warehouse ON public.warehouse_sub_containers USING btree (warehouse_id);


--
-- Name: idx_wsc_wh_div; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wsc_wh_div ON public.warehouse_sub_containers USING btree (warehouse_id, division_id);


--
-- Name: idx_wss_brand_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wss_brand_variant ON public.warehouse_stock_summary USING btree (brand_variant_id);


--
-- Name: idx_wss_sub_container; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wss_sub_container ON public.warehouse_stock_summary USING btree (sub_container_id);


--
-- Name: idx_wt_repair_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wt_repair_vendor ON public.warehouse_transfers USING btree (repair_vendor_id);


--
-- Name: idx_wt_transfer_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wt_transfer_kind ON public.warehouse_transfers USING btree (transfer_kind);


--
-- Name: iia_definition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iia_definition_idx ON public.inventory_item_attributes USING btree (definition_id);


--
-- Name: iia_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iia_item_idx ON public.inventory_item_attributes USING btree (item_id);


--
-- Name: iia_option_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iia_option_idx ON public.inventory_item_attributes USING btree (option_id);


--
-- Name: ix_inventory_checks_sub_container; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_inventory_checks_sub_container ON public.inventory_checks USING btree (sub_container_id);


--
-- Name: payments_credit_note_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_credit_note_id_idx ON public.payments USING btree (credit_note_id) WHERE (credit_note_id IS NOT NULL);


--
-- Name: po_edit_requests_one_approved_per_po; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX po_edit_requests_one_approved_per_po ON public.po_edit_requests USING btree (po_id) WHERE (status = 'approved'::public.po_edit_request_status);


--
-- Name: po_edit_requests_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX po_edit_requests_pending_idx ON public.po_edit_requests USING btree (po_id) WHERE (status = 'pending'::public.po_edit_request_status);


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
-- Name: profiles_threecx_extension_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_threecx_extension_uq ON public.user_data USING btree (threecx_extension) WHERE (threecx_extension IS NOT NULL);


--
-- Name: return_line_customer_resolutions_credit_note_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_line_customer_resolutions_credit_note_id_idx ON public.return_line_customer_resolutions USING btree (credit_note_id) WHERE (credit_note_id IS NOT NULL);


--
-- Name: return_line_customer_resolutions_return_line_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_line_customer_resolutions_return_line_id_idx ON public.return_line_customer_resolutions USING btree (return_line_id);


--
-- Name: return_line_customer_resolutions_sale_delivery_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_line_customer_resolutions_sale_delivery_id_idx ON public.return_line_customer_resolutions USING btree (sale_delivery_id) WHERE (sale_delivery_id IS NOT NULL);


--
-- Name: return_line_inventory_dispositi_inventory_stock_movement_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_line_inventory_dispositi_inventory_stock_movement_id_idx ON public.return_line_inventory_dispositions USING btree (inventory_stock_movement_id) WHERE (inventory_stock_movement_id IS NOT NULL);


--
-- Name: return_line_inventory_dispositions_return_line_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_line_inventory_dispositions_return_line_id_idx ON public.return_line_inventory_dispositions USING btree (return_line_id);


--
-- Name: return_line_inventory_dispositions_warehouse_transfer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_line_inventory_dispositions_warehouse_transfer_id_idx ON public.return_line_inventory_dispositions USING btree (warehouse_transfer_id) WHERE (warehouse_transfer_id IS NOT NULL);


--
-- Name: return_lines_receival_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_lines_receival_item_id_idx ON public.return_lines USING btree (receival_item_id) WHERE (receival_item_id IS NOT NULL);


--
-- Name: return_lines_sale_delivery_line_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_lines_sale_delivery_line_id_idx ON public.return_lines USING btree (sale_delivery_line_id) WHERE (sale_delivery_line_id IS NOT NULL);


--
-- Name: returns_return_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX returns_return_number_unique ON public.so_po_returns USING btree (return_number) WHERE (deleted_at IS NULL);


--
-- Name: so_po_returns_source_delivery_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX so_po_returns_source_delivery_id_idx ON public.so_po_returns USING btree (source_delivery_id);


--
-- Name: stock_adjustments_source_check_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_adjustments_source_check_id_idx ON public.stock_adjustments USING btree (source_check_id) WHERE (source_check_id IS NOT NULL);


--
-- Name: uq_inventory_brand_variants_item_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_inventory_brand_variants_item_brand ON public.inventory_item_brand_variants USING btree (item_id, lower(TRIM(BOTH FROM brand)));


--
-- Name: uq_inventory_categories_name_parent_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_inventory_categories_name_parent_type ON public.inventory_categories USING btree (type, parent_id, lower(TRIM(BOTH FROM name_en))) WHERE (parent_id IS NOT NULL);


--
-- Name: uq_inventory_categories_name_root_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_inventory_categories_name_root_type ON public.inventory_categories USING btree (type, lower(TRIM(BOTH FROM name_en))) WHERE (parent_id IS NULL);


--
-- Name: uq_inventory_items_name_category; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_inventory_items_name_category ON public.inventory_items USING btree (category_id, lower(TRIM(BOTH FROM name_en)));


--
-- Name: uq_tool_asset_units_item_serial; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tool_asset_units_item_serial ON public.tool_asset_units USING btree (item_id, serial_number) WHERE (serial_number IS NOT NULL);


--
-- Name: return_progress _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.return_progress WITH (security_invoker='true') AS
 WITH per_return AS (
         SELECT r.id AS return_id,
            r.return_number,
            r.status,
            (sum(rl.qty))::numeric AS total_returned,
            sum(COALESCE(p.customer_resolved_qty, (0)::numeric)) AS customer_resolved,
            sum(COALESCE(p.customer_remaining_qty, (0)::numeric)) AS customer_remaining,
            (sum(
                CASE
                    WHEN (rl.condition = 'damaged'::text) THEN rl.qty
                    ELSE 0
                END))::numeric AS total_damaged,
            sum(
                CASE
                    WHEN (rl.condition = 'damaged'::text) THEN COALESCE(p.inventory_resolved_qty, (0)::numeric)
                    ELSE (0)::numeric
                END) AS inventory_resolved,
            sum(
                CASE
                    WHEN (rl.condition = 'damaged'::text) THEN COALESCE(p.inventory_remaining_qty, (0)::numeric)
                    ELSE (0)::numeric
                END) AS inventory_remaining
           FROM ((public.so_po_returns r
             JOIN public.return_lines rl ON ((rl.return_id = r.id)))
             JOIN public.return_line_progress p ON ((p.return_line_id = rl.id)))
          GROUP BY r.id
        ), cust_mix AS (
         SELECT rl2.return_id,
            jsonb_object_agg(x.resolution_type, x.sum_qty) AS by_type
           FROM (( SELECT rl2_1.return_id,
                    cr.resolution_type,
                    sum(cr.qty) AS sum_qty
                   FROM (public.return_lines rl2_1
                     JOIN public.return_line_customer_resolutions cr ON ((cr.return_line_id = rl2_1.id)))
                  GROUP BY rl2_1.return_id, cr.resolution_type) x
             JOIN public.return_lines rl2 ON ((rl2.return_id = x.return_id)))
          GROUP BY rl2.return_id
        ), inv_mix AS (
         SELECT rl2.return_id,
            jsonb_object_agg(x.disposition_type, x.sum_qty) AS by_type
           FROM (( SELECT rl2_1.return_id,
                    idp.disposition_type,
                    sum(idp.qty) AS sum_qty
                   FROM (public.return_lines rl2_1
                     JOIN public.return_line_inventory_dispositions idp ON ((idp.return_line_id = rl2_1.id)))
                  GROUP BY rl2_1.return_id, idp.disposition_type) x
             JOIN public.return_lines rl2 ON ((rl2.return_id = x.return_id)))
          GROUP BY rl2.return_id
        )
 SELECT pr.return_id,
    pr.return_number,
    pr.status,
    pr.total_returned,
    pr.customer_resolved,
    pr.customer_remaining,
    pr.total_damaged,
    pr.inventory_resolved,
    pr.inventory_remaining,
    cust_mix.by_type AS customer_resolutions_by_type,
    inv_mix.by_type AS inventory_dispositions_by_type,
        CASE
            WHEN (pr.customer_remaining > (0)::numeric) THEN 'in_progress'::text
            ELSE 'fully_resolved'::text
        END AS customer_status,
        CASE
            WHEN (pr.total_damaged = (0)::numeric) THEN 'not_applicable'::text
            WHEN (pr.inventory_remaining > (0)::numeric) THEN 'in_progress'::text
            ELSE 'fully_resolved'::text
        END AS inventory_status,
        CASE
            WHEN ((pr.customer_remaining > (0)::numeric) OR (pr.inventory_remaining > (0)::numeric)) THEN 'in_progress'::text
            ELSE 'fully_resolved'::text
        END AS overall_coverage_status,
    ((pr.total_damaged > (0)::numeric) AND (pr.inventory_remaining = (0)::numeric) AND (pr.customer_remaining > (0)::numeric)) AS compensation_missing
   FROM ((per_return pr
     LEFT JOIN cust_mix ON ((cust_mix.return_id = pr.return_id)))
     LEFT JOIN inv_mix ON ((inv_mix.return_id = pr.return_id)));


--
-- Name: bill_line_items bill_line_items_cascade_pdf_invalidation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bill_line_items_cascade_pdf_invalidation AFTER INSERT OR DELETE OR UPDATE ON public.bill_line_items FOR EACH ROW EXECUTE FUNCTION public.bill_line_items_invalidate_parent_pdf_fn();


--
-- Name: payments bill_recompute_paid_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bill_recompute_paid_trg AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payments_trigger_bill_recompute_fn();


--
-- Name: bills bills_invalidate_pdf_cache; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bills_invalidate_pdf_cache BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION public.bills_invalidate_pdf_cache_fn();


--
-- Name: companies cleanup_company_assets_after_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_company_assets_after_delete AFTER DELETE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_company_assets_after_delete();


--
-- Name: companies cleanup_company_assets_after_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_company_assets_after_update AFTER UPDATE OF logo_url, stamp_url ON public.companies FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_company_assets_after_update();


--
-- Name: consumption_entries cleanup_consumption_attachments_after_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_consumption_attachments_after_delete AFTER DELETE ON public.consumption_entries FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_consumption_attachments_after_delete();


--
-- Name: consumption_entries cleanup_consumption_attachments_after_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_consumption_attachments_after_update AFTER UPDATE OF attachments ON public.consumption_entries FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_consumption_attachments_after_update();


--
-- Name: customers cleanup_customer_docs_after_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_customer_docs_after_delete AFTER DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_customer_docs_after_delete();


--
-- Name: customers cleanup_customer_docs_after_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_customer_docs_after_update AFTER UPDATE OF cr_url, establishment_id_url, signed_credit_form_url ON public.customers FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_customer_docs_after_update();


--
-- Name: company_divisions cleanup_division_assets_after_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_division_assets_after_delete AFTER DELETE ON public.company_divisions FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_division_assets_after_delete();


--
-- Name: company_divisions cleanup_division_assets_after_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_division_assets_after_update AFTER UPDATE OF logo_url, stamp_url ON public.company_divisions FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_division_assets_after_update();


--
-- Name: inventory_items cleanup_inventory_item_image_after_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_inventory_item_image_after_delete AFTER DELETE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_inventory_item_image_after_delete();


--
-- Name: inventory_items cleanup_inventory_item_image_after_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_inventory_item_image_after_update AFTER UPDATE OF image_url ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_inventory_item_image_after_update();


--
-- Name: landed_cost_lines cleanup_landed_cost_bill_after_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_landed_cost_bill_after_delete AFTER DELETE ON public.landed_cost_lines FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_landed_cost_bill_after_delete();


--
-- Name: landed_cost_lines cleanup_landed_cost_bill_after_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_landed_cost_bill_after_update AFTER UPDATE OF bill_path ON public.landed_cost_lines FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_landed_cost_bill_after_update();


--
-- Name: stock_adjustments cleanup_stock_adjustment_photos_after_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_stock_adjustment_photos_after_delete AFTER DELETE ON public.stock_adjustments FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_stock_adjustment_photos_after_delete();


--
-- Name: stock_adjustments cleanup_stock_adjustment_photos_after_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_stock_adjustment_photos_after_update AFTER UPDATE OF photo_urls ON public.stock_adjustments FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_stock_adjustment_photos_after_update();


--
-- Name: credit_notes credit_notes_invalidate_pdf_cache; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER credit_notes_invalidate_pdf_cache BEFORE UPDATE ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.credit_notes_invalidate_pdf_cache_fn();


--
-- Name: debit_notes debit_notes_invalidate_pdf_cache; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER debit_notes_invalidate_pdf_cache BEFORE UPDATE ON public.debit_notes FOR EACH ROW EXECUTE FUNCTION public.debit_notes_invalidate_pdf_cache_fn();


--
-- Name: inventory_attribute_definitions iad_branch_unique_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER iad_branch_unique_trg BEFORE INSERT OR UPDATE OF category_id, attribute_key ON public.inventory_attribute_definitions FOR EACH ROW EXECUTE FUNCTION public._check_attribute_key_branch_unique();


--
-- Name: inventory_attribute_definitions iad_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER iad_set_updated_at BEFORE UPDATE ON public.inventory_attribute_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_item_attributes iia_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER iia_set_updated_at BEFORE UPDATE ON public.inventory_item_attributes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: invoice_line_items invoice_line_items_cascade_pdf_invalidation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER invoice_line_items_cascade_pdf_invalidation AFTER INSERT OR DELETE OR UPDATE ON public.invoice_line_items FOR EACH ROW EXECUTE FUNCTION public.invoice_line_items_invalidate_parent_pdf_fn();


--
-- Name: so_invoices invoices_invalidate_pdf_cache; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER invoices_invalidate_pdf_cache BEFORE UPDATE ON public.so_invoices FOR EACH ROW EXECUTE FUNCTION public.invoices_invalidate_pdf_cache_fn();


--
-- Name: payment_bill_allocations payment_bill_allocations_recompute_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payment_bill_allocations_recompute_trg AFTER INSERT OR DELETE OR UPDATE ON public.payment_bill_allocations FOR EACH ROW EXECUTE FUNCTION public.payment_bill_allocations_trigger_recompute_fn();


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
-- Name: brands set_brands_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: custom_roles set_custom_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_custom_roles_updated_at BEFORE UPDATE ON public.custom_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_check_assignments set_inventory_check_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_inventory_check_assignments_updated_at BEFORE UPDATE ON public.inventory_check_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_check_items set_inventory_check_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_inventory_check_items_updated_at BEFORE UPDATE ON public.inventory_check_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_checks set_inventory_checks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_inventory_checks_updated_at BEFORE UPDATE ON public.inventory_checks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: credit_notes sync_credit_note_reason_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_credit_note_reason_id BEFORE INSERT OR UPDATE ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public._sync_credit_note_reason_id_fn();


--
-- Name: credit_notes sync_credit_note_refund_method_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_credit_note_refund_method_id BEFORE INSERT OR UPDATE ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public._sync_credit_note_refund_method_id_fn();


--
-- Name: companies sync_currency_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_default_currency();


--
-- Name: company_divisions sync_currency_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.company_divisions FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_default_currency();


--
-- Name: landed_cost_lines sync_currency_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.landed_cost_lines FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();


--
-- Name: landed_costs sync_currency_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.landed_costs FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();


--
-- Name: payments sync_currency_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();


--
-- Name: po_rfq_quotes sync_currency_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.po_rfq_quotes FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();


--
-- Name: po_versions sync_currency_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.po_versions FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();


--
-- Name: purchase_orders sync_currency_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();


--
-- Name: sale_orders sync_currency_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.sale_orders FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();


--
-- Name: debit_notes sync_debit_note_reason_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_debit_note_reason_id BEFORE INSERT OR UPDATE ON public.debit_notes FOR EACH ROW EXECUTE FUNCTION public._sync_debit_note_reason_id_fn();


--
-- Name: payments sync_payment_method_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_payment_method_id BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public._sync_payment_method_id_fn();


--
-- Name: suppliers sync_supplier_country_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_supplier_country_id BEFORE INSERT OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public._sync_supplier_country_id_fn();


--
-- Name: warehouse_stock_allocations trg_alloc_stock_summary; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_alloc_stock_summary AFTER INSERT OR DELETE OR UPDATE ON public.warehouse_stock_allocations FOR EACH ROW EXECUTE FUNCTION public.trg_alloc_refresh_stock_summary();


--
-- Name: sale_order_approvals trg_approval_requests_decided_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_approval_requests_decided_at BEFORE UPDATE ON public.sale_order_approvals FOR EACH ROW EXECUTE FUNCTION public.set_approval_request_decided_at();


--
-- Name: sale_order_approvals trg_approval_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_approval_requests_updated_at BEFORE UPDATE ON public.sale_order_approvals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_item_brand_variants trg_auto_brand_variant_sku; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_brand_variant_sku BEFORE INSERT OR UPDATE ON public.inventory_item_brand_variants FOR EACH ROW EXECUTE FUNCTION public.generate_brand_variant_sku();


--
-- Name: customer_credit_group_requests trg_ccgr_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ccgr_updated_at BEFORE UPDATE ON public.customer_credit_group_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_company_divisions trg_clear_active_on_division_removal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_clear_active_on_division_removal AFTER DELETE ON public.user_company_divisions FOR EACH ROW EXECUTE FUNCTION public._trg_clear_active_on_division_removal();


--
-- Name: cogs_entries trg_cogs_entries_set_consumer_division; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cogs_entries_set_consumer_division BEFORE INSERT ON public.cogs_entries FOR EACH ROW EXECUTE FUNCTION public.set_consumer_division_from_sale_order();


--
-- Name: cogs_entries trg_cogs_entries_set_division; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cogs_entries_set_division BEFORE INSERT ON public.cogs_entries FOR EACH ROW EXECUTE FUNCTION public.set_division_from_sale_order();


--
-- Name: companies trg_companies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: fifo_cost_layers trg_create_tool_units_on_receival; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_create_tool_units_on_receival AFTER INSERT ON public.fifo_cost_layers FOR EACH ROW EXECUTE FUNCTION public.create_tool_units_on_receival_layer();


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
-- Name: warehouse_sub_containers trg_enforce_sub_container_division_rule; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_sub_container_division_rule BEFORE INSERT OR UPDATE OF division_id, warehouse_id ON public.warehouse_sub_containers FOR EACH ROW EXECUTE FUNCTION public._enforce_sub_container_division_rule();


--
-- Name: fifo_cost_layers trg_fifo_stock_summary; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fifo_stock_summary AFTER INSERT OR DELETE OR UPDATE ON public.fifo_cost_layers FOR EACH ROW EXECUTE FUNCTION public.trg_fifo_refresh_stock_summary();


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
-- Name: payments trg_payments_compute_fx; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payments_compute_fx BEFORE INSERT OR UPDATE OF amount, exchange_rate, currency, source_type, source_id ON public.payments FOR EACH ROW EXECUTE FUNCTION public._trg_payments_compute_fx();


--
-- Name: payments trg_payments_redirect_to_invoice; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payments_redirect_to_invoice BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payments_redirect_to_invoice_fn();


--
-- Name: payments trg_payments_refresh_document_fx; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payments_refresh_document_fx AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public._trg_payments_refresh_document_fx();


--
-- Name: payments trg_payments_sync_invoice_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payments_sync_invoice_id BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payments_sync_invoice_id_fn();


--
-- Name: po_line_items trg_po_line_items_incoming; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_po_line_items_incoming AFTER INSERT OR DELETE OR UPDATE ON public.po_line_items FOR EACH ROW EXECUTE FUNCTION public.trg_fn_po_line_items_incoming();


--
-- Name: user_data trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.user_data FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: fifo_cost_layers trg_remove_tool_placeholders_on_layer_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_remove_tool_placeholders_on_layer_delete AFTER DELETE ON public.fifo_cost_layers FOR EACH ROW EXECUTE FUNCTION public.remove_tool_placeholders_on_layer_delete();


--
-- Name: repair_vendors trg_repair_vendor_provision_warehouse; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_repair_vendor_provision_warehouse BEFORE INSERT ON public.repair_vendors FOR EACH ROW EXECUTE FUNCTION public._repair_vendor_provision_warehouse();


--
-- Name: return_lines trg_return_lines_provenance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_return_lines_provenance BEFORE INSERT OR UPDATE OF receival_item_id, sale_delivery_line_id, return_id ON public.return_lines FOR EACH ROW EXECUTE FUNCTION public._enforce_return_line_provenance();


--
-- Name: so_po_returns trg_returns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_returns_updated_at BEFORE UPDATE ON public.so_po_returns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


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
-- Name: inventory_damaged_stock trg_sync_brand_variant_damaged_qty; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_brand_variant_damaged_qty AFTER INSERT OR DELETE OR UPDATE OF qty ON public.inventory_damaged_stock FOR EACH ROW EXECUTE FUNCTION public._sync_brand_variant_damaged_qty();


--
-- Name: inventory_item_brand_variants trg_sync_brand_variants_brand_text; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_brand_variants_brand_text BEFORE INSERT OR UPDATE OF brand_id ON public.inventory_item_brand_variants FOR EACH ROW EXECUTE FUNCTION public.sync_brand_variant_brand_text();


--
-- Name: fifo_cost_layers trg_warehouse_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_warehouse_stats AFTER INSERT OR DELETE OR UPDATE ON public.fifo_cost_layers FOR EACH ROW EXECUTE FUNCTION public.fn_refresh_warehouse_stats();


--
-- Name: warranty_policies trg_warranty_policies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_warranty_policies_updated_at BEFORE UPDATE ON public.warranty_policies FOR EACH ROW EXECUTE FUNCTION public.warranty_policies_set_updated_at();


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
    ADD CONSTRAINT approval_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.user_data(id);


--
-- Name: sale_order_approvals approval_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_approvals
    ADD CONSTRAINT approval_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.user_data(id);


--
-- Name: approval_workflow_steps approval_workflow_steps_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflow_steps
    ADD CONSTRAINT approval_workflow_steps_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.approval_workflow_groups(id) ON DELETE SET NULL;


--
-- Name: bill_line_items bill_line_items_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_line_items
    ADD CONSTRAINT bill_line_items_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE CASCADE;


--
-- Name: bills bills_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id);


--
-- Name: bills bills_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);


--
-- Name: bills bills_receival_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES public.receivals(id);


--
-- Name: bills bills_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: cogs_entries cogs_entries_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id);


--
-- Name: cogs_entries cogs_entries_consumer_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_consumer_customer_id_fkey FOREIGN KEY (consumer_customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: cogs_entries cogs_entries_consumer_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_consumer_division_id_fkey FOREIGN KEY (consumer_division_id) REFERENCES public.company_divisions(id);


--
-- Name: cogs_entries cogs_entries_consumer_place_sub_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_consumer_place_sub_id_fkey FOREIGN KEY (consumer_place_sub_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE SET NULL;


--
-- Name: cogs_entries cogs_entries_consumer_team_sub_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_consumer_team_sub_id_fkey FOREIGN KEY (consumer_team_sub_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE SET NULL;


--
-- Name: cogs_entries cogs_entries_consumption_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_consumption_id_fkey FOREIGN KEY (consumption_id) REFERENCES public.consumption_entries(id) ON DELETE SET NULL;


--
-- Name: cogs_entries cogs_entries_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id);


--
-- Name: cogs_entries cogs_entries_landed_cost_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_landed_cost_id_fkey FOREIGN KEY (landed_cost_id) REFERENCES public.landed_costs(id);


--
-- Name: cogs_entries cogs_entries_sale_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_sale_delivery_id_fkey FOREIGN KEY (sale_delivery_id) REFERENCES public.sale_deliveries(id);


--
-- Name: cogs_entries cogs_entries_sale_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES public.sale_orders(id);


--
-- Name: cogs_entries cogs_entries_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cogs_entries
    ADD CONSTRAINT cogs_entries_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.fifo_cost_layers(id) ON DELETE SET NULL;


--
-- Name: companies companies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: companies companies_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: company_divisions company_divisions_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_divisions
    ADD CONSTRAINT company_divisions_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: consumption_edit_requests consumption_edit_requests_consumption_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_edit_requests
    ADD CONSTRAINT consumption_edit_requests_consumption_id_fkey FOREIGN KEY (consumption_id) REFERENCES public.consumption_entries(id) ON DELETE CASCADE;


--
-- Name: consumption_edit_requests consumption_edit_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_edit_requests
    ADD CONSTRAINT consumption_edit_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.user_data(id);


--
-- Name: consumption_edit_requests consumption_edit_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_edit_requests
    ADD CONSTRAINT consumption_edit_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.user_data(id);


--
-- Name: consumption_entries consumption_entries_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_entries
    ADD CONSTRAINT consumption_entries_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.user_data(id) ON DELETE SET NULL;


--
-- Name: consumption_entries consumption_entries_consumer_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_entries
    ADD CONSTRAINT consumption_entries_consumer_customer_id_fkey FOREIGN KEY (consumer_customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: consumption_entries consumption_entries_consumer_place_sub_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_entries
    ADD CONSTRAINT consumption_entries_consumer_place_sub_id_fkey FOREIGN KEY (consumer_place_sub_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE SET NULL;


--
-- Name: consumption_entries consumption_entries_consumer_team_sub_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_entries
    ADD CONSTRAINT consumption_entries_consumer_team_sub_id_fkey FOREIGN KEY (consumer_team_sub_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE SET NULL;


--
-- Name: consumption_entries consumption_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_entries
    ADD CONSTRAINT consumption_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id) ON DELETE SET NULL;


--
-- Name: consumption_entries consumption_entries_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_entries
    ADD CONSTRAINT consumption_entries_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id) ON DELETE SET NULL;


--
-- Name: consumption_entries consumption_entries_posted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_entries
    ADD CONSTRAINT consumption_entries_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES public.user_data(id) ON DELETE SET NULL;


--
-- Name: consumption_entries consumption_entries_source_sub_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_entries
    ADD CONSTRAINT consumption_entries_source_sub_container_id_fkey FOREIGN KEY (source_sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;


--
-- Name: consumption_entries consumption_entries_source_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_entries
    ADD CONSTRAINT consumption_entries_source_warehouse_id_fkey FOREIGN KEY (source_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: consumption_lines consumption_lines_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_lines
    ADD CONSTRAINT consumption_lines_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id) ON DELETE RESTRICT;


--
-- Name: consumption_lines consumption_lines_consumption_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumption_lines
    ADD CONSTRAINT consumption_lines_consumption_id_fkey FOREIGN KEY (consumption_id) REFERENCES public.consumption_entries(id) ON DELETE CASCADE;


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
-- Name: credit_notes credit_notes_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: credit_notes credit_notes_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.so_invoices(id);


--
-- Name: credit_notes credit_notes_reason_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_reason_id_fkey FOREIGN KEY (reason_id) REFERENCES public.reason_lists(id);


--
-- Name: credit_notes credit_notes_refund_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_refund_method_id_fkey FOREIGN KEY (refund_method_id) REFERENCES public.payment_methods(id);


--
-- Name: credit_notes credit_notes_source_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_notes
    ADD CONSTRAINT credit_notes_source_return_id_fkey FOREIGN KEY (source_return_id) REFERENCES public.so_po_returns(id) ON DELETE SET NULL;


--
-- Name: custom_roles custom_roles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_roles
    ADD CONSTRAINT custom_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id);


--
-- Name: customer_credit_group_approvals customer_credit_group_approvals_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_group_approvals
    ADD CONSTRAINT customer_credit_group_approvals_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.user_data(id);


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
    ADD CONSTRAINT customer_credit_group_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.user_data(id);


--
-- Name: customer_credit_group_requests customer_credit_group_requests_previous_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_group_requests
    ADD CONSTRAINT customer_credit_group_requests_previous_group_id_fkey FOREIGN KEY (previous_group_id) REFERENCES public.credit_groups(id);


--
-- Name: customer_credit_group_requests customer_credit_group_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credit_group_requests
    ADD CONSTRAINT customer_credit_group_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.user_data(id);


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
-- Name: debit_note_lines debit_note_lines_debit_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_note_lines
    ADD CONSTRAINT debit_note_lines_debit_note_id_fkey FOREIGN KEY (debit_note_id) REFERENCES public.debit_notes(id) ON DELETE CASCADE;


--
-- Name: debit_notes debit_notes_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_notes
    ADD CONSTRAINT debit_notes_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id);


--
-- Name: debit_notes debit_notes_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_notes
    ADD CONSTRAINT debit_notes_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);


--
-- Name: debit_notes debit_notes_reason_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_notes
    ADD CONSTRAINT debit_notes_reason_id_fkey FOREIGN KEY (reason_id) REFERENCES public.reason_lists(id);


--
-- Name: debit_notes debit_notes_source_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_notes
    ADD CONSTRAINT debit_notes_source_return_id_fkey FOREIGN KEY (source_return_id) REFERENCES public.so_po_returns(id);


--
-- Name: debit_notes debit_notes_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_notes
    ADD CONSTRAINT debit_notes_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: company_divisions divisions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_divisions
    ADD CONSTRAINT divisions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: company_divisions divisions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_divisions
    ADD CONSTRAINT divisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id);


--
-- Name: exchange_rate_change_log exchange_rate_change_log_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rate_change_log
    ADD CONSTRAINT exchange_rate_change_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.user_data(id);


--
-- Name: fifo_cost_layers fifo_cost_layers_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fifo_cost_layers
    ADD CONSTRAINT fifo_cost_layers_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id) ON DELETE CASCADE;


--
-- Name: fifo_cost_layers fifo_cost_layers_receival_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fifo_cost_layers
    ADD CONSTRAINT fifo_cost_layers_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES public.receivals(id);


--
-- Name: fifo_cost_layers fifo_cost_layers_sub_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fifo_cost_layers
    ADD CONSTRAINT fifo_cost_layers_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;


--
-- Name: fifo_cost_layers fifo_cost_layers_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fifo_cost_layers
    ADD CONSTRAINT fifo_cost_layers_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: inventory_attribute_definitions inventory_attribute_definitions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_attribute_definitions
    ADD CONSTRAINT inventory_attribute_definitions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.inventory_categories(id) ON DELETE CASCADE;


--
-- Name: inventory_attribute_definitions inventory_attribute_definitions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_attribute_definitions
    ADD CONSTRAINT inventory_attribute_definitions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id) ON DELETE SET NULL;


--
-- Name: inventory_attribute_options inventory_attribute_options_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_attribute_options
    ADD CONSTRAINT inventory_attribute_options_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.inventory_attribute_definitions(id) ON DELETE CASCADE;


--
-- Name: inventory_item_brand_variants inventory_brand_variants_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_brand_variants
    ADD CONSTRAINT inventory_brand_variants_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;


--
-- Name: inventory_item_brand_variants inventory_brand_variants_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_brand_variants
    ADD CONSTRAINT inventory_brand_variants_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: inventory_categories inventory_categories_default_sub_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_categories
    ADD CONSTRAINT inventory_categories_default_sub_container_id_fkey FOREIGN KEY (default_sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE SET NULL;


--
-- Name: inventory_categories inventory_categories_default_warranty_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_categories
    ADD CONSTRAINT inventory_categories_default_warranty_policy_id_fkey FOREIGN KEY (default_warranty_policy_id) REFERENCES public.warranty_policies(id) ON DELETE SET NULL;


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
    ADD CONSTRAINT inventory_check_approvals_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.user_data(id);


--
-- Name: inventory_check_assignments inventory_check_assignments_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_assignments
    ADD CONSTRAINT inventory_check_assignments_check_id_fkey FOREIGN KEY (check_id) REFERENCES public.inventory_checks(id) ON DELETE CASCADE;


--
-- Name: inventory_check_assignments inventory_check_assignments_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_assignments
    ADD CONSTRAINT inventory_check_assignments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.user_data(id);


--
-- Name: inventory_check_items inventory_check_items_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_items
    ADD CONSTRAINT inventory_check_items_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.inventory_check_assignments(id) ON DELETE SET NULL;


--
-- Name: inventory_check_items inventory_check_items_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_check_items
    ADD CONSTRAINT inventory_check_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id);


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
    ADD CONSTRAINT inventory_check_log_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.user_data(id);


--
-- Name: inventory_checks inventory_checks_initiated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_checks
    ADD CONSTRAINT inventory_checks_initiated_by_profile_id_fkey FOREIGN KEY (initiated_by_profile_id) REFERENCES public.user_data(id);


--
-- Name: inventory_checks inventory_checks_sub_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_checks
    ADD CONSTRAINT inventory_checks_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;


--
-- Name: inventory_checks inventory_checks_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_checks
    ADD CONSTRAINT inventory_checks_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: inventory_damaged_movements inventory_damaged_movements_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_movements
    ADD CONSTRAINT inventory_damaged_movements_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id) ON DELETE RESTRICT;


--
-- Name: inventory_damaged_movements inventory_damaged_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_movements
    ADD CONSTRAINT inventory_damaged_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id) ON DELETE SET NULL;


--
-- Name: inventory_damaged_movements inventory_damaged_movements_source_return_line_disposition_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_movements
    ADD CONSTRAINT inventory_damaged_movements_source_return_line_disposition_fkey FOREIGN KEY (source_return_line_disposition_id) REFERENCES public.return_line_inventory_dispositions(id) ON DELETE SET NULL;


--
-- Name: inventory_damaged_movements inventory_damaged_movements_source_transfer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_movements
    ADD CONSTRAINT inventory_damaged_movements_source_transfer_id_fkey FOREIGN KEY (source_transfer_id) REFERENCES public.warehouse_transfers(id) ON DELETE SET NULL;


--
-- Name: inventory_damaged_movements inventory_damaged_movements_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_movements
    ADD CONSTRAINT inventory_damaged_movements_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: inventory_damaged_stock inventory_damaged_stock_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_stock
    ADD CONSTRAINT inventory_damaged_stock_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id) ON DELETE RESTRICT;


--
-- Name: inventory_damaged_stock_layers inventory_damaged_stock_layers_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_stock_layers
    ADD CONSTRAINT inventory_damaged_stock_layers_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id) ON DELETE RESTRICT;


--
-- Name: inventory_damaged_stock_layers inventory_damaged_stock_layers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_stock_layers
    ADD CONSTRAINT inventory_damaged_stock_layers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id) ON DELETE SET NULL;


--
-- Name: inventory_damaged_stock_layers inventory_damaged_stock_layers_source_return_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_stock_layers
    ADD CONSTRAINT inventory_damaged_stock_layers_source_return_line_id_fkey FOREIGN KEY (source_return_line_id) REFERENCES public.return_lines(id) ON DELETE SET NULL;


--
-- Name: inventory_damaged_stock_layers inventory_damaged_stock_layers_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_stock_layers
    ADD CONSTRAINT inventory_damaged_stock_layers_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: inventory_damaged_stock inventory_damaged_stock_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_damaged_stock
    ADD CONSTRAINT inventory_damaged_stock_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: inventory_item_attributes inventory_item_attributes_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_attributes
    ADD CONSTRAINT inventory_item_attributes_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.inventory_attribute_definitions(id) ON DELETE CASCADE;


--
-- Name: inventory_item_attributes inventory_item_attributes_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_attributes
    ADD CONSTRAINT inventory_item_attributes_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: inventory_item_attributes inventory_item_attributes_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_attributes
    ADD CONSTRAINT inventory_item_attributes_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.inventory_attribute_options(id) ON DELETE RESTRICT;


--
-- Name: inventory_item_attributes inventory_item_attributes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_item_attributes
    ADD CONSTRAINT inventory_item_attributes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.user_data(id) ON DELETE SET NULL;


--
-- Name: inventory_items inventory_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.inventory_categories(id);


--
-- Name: inventory_items inventory_items_default_sub_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_default_sub_container_id_fkey FOREIGN KEY (default_sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE SET NULL;


--
-- Name: inventory_items inventory_items_default_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_default_warehouse_id_fkey FOREIGN KEY (default_warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;


--
-- Name: inventory_items inventory_items_warranty_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_warranty_policy_id_fkey FOREIGN KEY (warranty_policy_id) REFERENCES public.warranty_policies(id) ON DELETE SET NULL;


--
-- Name: inventory_stock_movements inventory_stock_movements_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock_movements
    ADD CONSTRAINT inventory_stock_movements_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id);


--
-- Name: inventory_stock_movements inventory_stock_movements_sub_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock_movements
    ADD CONSTRAINT inventory_stock_movements_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;


--
-- Name: inventory_stock_movements inventory_stock_movements_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock_movements
    ADD CONSTRAINT inventory_stock_movements_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: invoice_line_items invoice_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.so_invoices(id) ON DELETE CASCADE;


--
-- Name: so_invoices invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.so_invoices
    ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: so_invoices invoices_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.so_invoices
    ADD CONSTRAINT invoices_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id);


--
-- Name: so_invoices invoices_sale_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.so_invoices
    ADD CONSTRAINT invoices_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES public.sale_orders(id);


--
-- Name: landed_cost_item_allocations landed_cost_item_alloc_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landed_cost_item_allocations
    ADD CONSTRAINT landed_cost_item_alloc_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id);


--
-- Name: landed_cost_item_allocations landed_cost_item_allocations_landed_cost_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landed_cost_item_allocations
    ADD CONSTRAINT landed_cost_item_allocations_landed_cost_id_fkey FOREIGN KEY (landed_cost_id) REFERENCES public.landed_costs(id) ON DELETE CASCADE;


--
-- Name: landed_cost_lines landed_cost_lines_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landed_cost_lines
    ADD CONSTRAINT landed_cost_lines_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: landed_cost_lines landed_cost_lines_landed_cost_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landed_cost_lines
    ADD CONSTRAINT landed_cost_lines_landed_cost_id_fkey FOREIGN KEY (landed_cost_id) REFERENCES public.landed_costs(id) ON DELETE CASCADE;


--
-- Name: landed_costs landed_costs_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landed_costs
    ADD CONSTRAINT landed_costs_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: notifications notifications_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.user_data(id) ON DELETE CASCADE;


--
-- Name: payment_bill_allocations payment_bill_allocations_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_bill_allocations
    ADD CONSTRAINT payment_bill_allocations_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE CASCADE;


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
-- Name: payment_plans payment_plans_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_plans
    ADD CONSTRAINT payment_plans_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE CASCADE;


--
-- Name: payment_plans payment_plans_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_plans
    ADD CONSTRAINT payment_plans_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.so_invoices(id) ON DELETE CASCADE;


--
-- Name: payments payments_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id);


--
-- Name: payments payments_credit_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES public.credit_notes(id) ON DELETE SET NULL;


--
-- Name: payments payments_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: payments payments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: payments payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.so_invoices(id);


--
-- Name: payments payments_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_method_id_fkey FOREIGN KEY (method_id) REFERENCES public.payment_methods(id);


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
    ADD CONSTRAINT po_edit_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.user_data(id);


--
-- Name: po_edit_requests po_edit_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_edit_requests
    ADD CONSTRAINT po_edit_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.user_data(id);


--
-- Name: po_line_items po_line_items_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_line_items
    ADD CONSTRAINT po_line_items_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id);


--
-- Name: po_line_items po_line_items_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_line_items
    ADD CONSTRAINT po_line_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id) ON DELETE SET NULL;


--
-- Name: po_line_items po_line_items_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_line_items
    ADD CONSTRAINT po_line_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


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
-- Name: po_rfq_quotes po_rfq_quotes_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_rfq_quotes
    ADD CONSTRAINT po_rfq_quotes_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


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
-- Name: po_version_lines po_version_lines_po_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_version_lines
    ADD CONSTRAINT po_version_lines_po_version_id_fkey FOREIGN KEY (po_version_id) REFERENCES public.po_versions(id) ON DELETE CASCADE;


--
-- Name: po_versions po_versions_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_versions
    ADD CONSTRAINT po_versions_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


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
-- Name: po_versions po_versions_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_versions
    ADD CONSTRAINT po_versions_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: user_data profiles_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_data
    ADD CONSTRAINT profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_created_by_profiles_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_profiles_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id) ON DELETE SET NULL;


--
-- Name: purchase_orders purchase_orders_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: purchase_orders purchase_orders_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id) ON DELETE RESTRICT;


--
-- Name: purchase_orders purchase_orders_initial_rate_captured_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_initial_rate_captured_by_fkey FOREIGN KEY (initial_rate_captured_by) REFERENCES public.user_data(id);


--
-- Name: purchase_orders purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: purchase_orders purchase_orders_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: reason_lists reason_lists_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reason_lists
    ADD CONSTRAINT reason_lists_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id);


--
-- Name: receival_edit_requests receival_edit_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receival_edit_requests
    ADD CONSTRAINT receival_edit_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.user_data(id);


--
-- Name: receival_edit_requests receival_edit_requests_receival_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receival_edit_requests
    ADD CONSTRAINT receival_edit_requests_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES public.receivals(id);


--
-- Name: receival_edit_requests receival_edit_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receival_edit_requests
    ADD CONSTRAINT receival_edit_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.user_data(id);


--
-- Name: receival_items receival_items_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receival_items
    ADD CONSTRAINT receival_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id);


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
-- Name: receival_items receival_items_sub_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receival_items
    ADD CONSTRAINT receival_items_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;


--
-- Name: receivals receivals_carved_from_layer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivals
    ADD CONSTRAINT receivals_carved_from_layer_id_fkey FOREIGN KEY (carved_from_layer_id) REFERENCES public.fifo_cost_layers(id) ON DELETE SET NULL;


--
-- Name: receivals receivals_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivals
    ADD CONSTRAINT receivals_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id);


--
-- Name: receivals receivals_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivals
    ADD CONSTRAINT receivals_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id);


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
-- Name: repair_vendors repair_vendors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_vendors
    ADD CONSTRAINT repair_vendors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id) ON DELETE SET NULL;


--
-- Name: repair_vendors repair_vendors_sub_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_vendors
    ADD CONSTRAINT repair_vendors_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;


--
-- Name: repair_vendors repair_vendors_virtual_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repair_vendors
    ADD CONSTRAINT repair_vendors_virtual_warehouse_id_fkey FOREIGN KEY (virtual_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: return_line_customer_resolutions return_line_customer_resolutions_credit_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_line_customer_resolutions
    ADD CONSTRAINT return_line_customer_resolutions_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES public.credit_notes(id) ON DELETE SET NULL;


--
-- Name: return_line_customer_resolutions return_line_customer_resolutions_return_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_line_customer_resolutions
    ADD CONSTRAINT return_line_customer_resolutions_return_line_id_fkey FOREIGN KEY (return_line_id) REFERENCES public.return_lines(id) ON DELETE CASCADE;


--
-- Name: return_line_customer_resolutions return_line_customer_resolutions_sale_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_line_customer_resolutions
    ADD CONSTRAINT return_line_customer_resolutions_sale_delivery_id_fkey FOREIGN KEY (sale_delivery_id) REFERENCES public.sale_deliveries(id) ON DELETE SET NULL;


--
-- Name: return_line_inventory_dispositions return_line_inventory_disposit_inventory_stock_movement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_line_inventory_dispositions
    ADD CONSTRAINT return_line_inventory_disposit_inventory_stock_movement_id_fkey FOREIGN KEY (inventory_stock_movement_id) REFERENCES public.inventory_stock_movements(id) ON DELETE SET NULL;


--
-- Name: return_line_inventory_dispositions return_line_inventory_dispositions_return_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_line_inventory_dispositions
    ADD CONSTRAINT return_line_inventory_dispositions_return_line_id_fkey FOREIGN KEY (return_line_id) REFERENCES public.return_lines(id) ON DELETE CASCADE;


--
-- Name: return_line_inventory_dispositions return_line_inventory_dispositions_warehouse_transfer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_line_inventory_dispositions
    ADD CONSTRAINT return_line_inventory_dispositions_warehouse_transfer_id_fkey FOREIGN KEY (warehouse_transfer_id) REFERENCES public.warehouse_transfers(id) ON DELETE SET NULL;


--
-- Name: return_lines return_lines_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_lines
    ADD CONSTRAINT return_lines_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id);


--
-- Name: return_lines return_lines_receival_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_lines
    ADD CONSTRAINT return_lines_receival_item_id_fkey FOREIGN KEY (receival_item_id) REFERENCES public.receival_items(id);


--
-- Name: return_lines return_lines_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_lines
    ADD CONSTRAINT return_lines_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.so_po_returns(id) ON DELETE CASCADE;


--
-- Name: return_lines return_lines_sale_delivery_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_lines
    ADD CONSTRAINT return_lines_sale_delivery_line_id_fkey FOREIGN KEY (sale_delivery_line_id) REFERENCES public.sale_delivery_lines(id);


--
-- Name: so_po_returns returns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.so_po_returns
    ADD CONSTRAINT returns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id);


--
-- Name: so_po_returns returns_credit_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.so_po_returns
    ADD CONSTRAINT returns_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES public.credit_notes(id);


--
-- Name: so_po_returns returns_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.so_po_returns
    ADD CONSTRAINT returns_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id);


--
-- Name: so_po_returns returns_restock_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.so_po_returns
    ADD CONSTRAINT returns_restock_warehouse_id_fkey FOREIGN KEY (restock_warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: sale_deliveries sale_deliveries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_deliveries
    ADD CONSTRAINT sale_deliveries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id);


--
-- Name: sale_deliveries sale_deliveries_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_deliveries
    ADD CONSTRAINT sale_deliveries_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.so_po_returns(id) ON DELETE SET NULL;


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
-- Name: sale_delivery_lines sale_delivery_lines_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_delivery_lines
    ADD CONSTRAINT sale_delivery_lines_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id);


--
-- Name: sale_delivery_lines sale_delivery_lines_sale_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_delivery_lines
    ADD CONSTRAINT sale_delivery_lines_sale_delivery_id_fkey FOREIGN KEY (sale_delivery_id) REFERENCES public.sale_deliveries(id) ON DELETE CASCADE;


--
-- Name: sale_order_lines sale_order_lines_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_lines
    ADD CONSTRAINT sale_order_lines_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id);


--
-- Name: sale_order_lines sale_order_lines_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_lines
    ADD CONSTRAINT sale_order_lines_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id);


--
-- Name: sale_order_lines sale_order_lines_sale_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order_lines
    ADD CONSTRAINT sale_order_lines_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES public.sale_orders(id);


--
-- Name: sale_orders sale_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_orders
    ADD CONSTRAINT sale_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id);


--
-- Name: sale_orders sale_orders_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_orders
    ADD CONSTRAINT sale_orders_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


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
-- Name: sale_orders sale_orders_initial_rate_captured_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_orders
    ADD CONSTRAINT sale_orders_initial_rate_captured_by_fkey FOREIGN KEY (initial_rate_captured_by) REFERENCES public.user_data(id);


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
-- Name: so_po_returns so_po_returns_source_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.so_po_returns
    ADD CONSTRAINT so_po_returns_source_delivery_id_fkey FOREIGN KEY (source_delivery_id) REFERENCES public.sale_deliveries(id) ON DELETE SET NULL;


--
-- Name: stock_adjustment_approvals stock_adjustment_approvals_adjustment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustment_approvals
    ADD CONSTRAINT stock_adjustment_approvals_adjustment_id_fkey FOREIGN KEY (adjustment_id) REFERENCES public.stock_adjustments(id) ON DELETE CASCADE;


--
-- Name: stock_adjustment_approvals stock_adjustment_approvals_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustment_approvals
    ADD CONSTRAINT stock_adjustment_approvals_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.user_data(id);


--
-- Name: stock_adjustments stock_adjustments_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id);


--
-- Name: stock_adjustments stock_adjustments_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.user_data(id);


--
-- Name: stock_adjustments stock_adjustments_source_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_source_check_id_fkey FOREIGN KEY (source_check_id) REFERENCES public.inventory_checks(id) ON DELETE SET NULL;


--
-- Name: stock_adjustments stock_adjustments_source_check_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_source_check_item_id_fkey FOREIGN KEY (source_check_item_id) REFERENCES public.inventory_check_items(id) ON DELETE SET NULL;


--
-- Name: stock_adjustments stock_adjustments_sub_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;


--
-- Name: stock_adjustments stock_adjustments_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: suppliers suppliers_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.country_codes(id);


--
-- Name: suppliers suppliers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id);


--
-- Name: suppliers suppliers_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: tool_asset_units tool_asset_units_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_asset_units
    ADD CONSTRAINT tool_asset_units_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE SET NULL;


--
-- Name: tool_asset_units tool_asset_units_receival_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_asset_units
    ADD CONSTRAINT tool_asset_units_receival_item_id_fkey FOREIGN KEY (receival_item_id) REFERENCES public.receival_items(id) ON DELETE SET NULL;


--
-- Name: user_custom_roles user_custom_roles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_roles
    ADD CONSTRAINT user_custom_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id);


--
-- Name: user_custom_roles user_custom_roles_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_roles
    ADD CONSTRAINT user_custom_roles_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.user_data(id);


--
-- Name: user_custom_roles user_custom_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_roles
    ADD CONSTRAINT user_custom_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.custom_roles(id) ON DELETE CASCADE;


--
-- Name: user_data user_data_active_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_data
    ADD CONSTRAINT user_data_active_division_id_fkey FOREIGN KEY (active_division_id) REFERENCES public.company_divisions(id) ON DELETE SET NULL;


--
-- Name: user_company_divisions user_divisions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_company_divisions
    ADD CONSTRAINT user_divisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id);


--
-- Name: user_company_divisions user_divisions_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_company_divisions
    ADD CONSTRAINT user_divisions_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id);


--
-- Name: user_company_divisions user_divisions_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_company_divisions
    ADD CONSTRAINT user_divisions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.user_data(id);


--
-- Name: warehouse_reorder_points warehouse_reorder_points_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_reorder_points
    ADD CONSTRAINT warehouse_reorder_points_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id) ON DELETE CASCADE;


--
-- Name: warehouse_reorder_points warehouse_reorder_points_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_reorder_points
    ADD CONSTRAINT warehouse_reorder_points_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: warehouse_responsible_persons warehouse_responsible_persons_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_responsible_persons
    ADD CONSTRAINT warehouse_responsible_persons_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.user_data(id) ON DELETE CASCADE;


--
-- Name: warehouse_responsible_persons warehouse_responsible_persons_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_responsible_persons
    ADD CONSTRAINT warehouse_responsible_persons_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: warehouse_stock_allocations warehouse_stock_allocations_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_allocations
    ADD CONSTRAINT warehouse_stock_allocations_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id) ON DELETE CASCADE;


--
-- Name: warehouse_stock_allocations warehouse_stock_allocations_sub_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_allocations
    ADD CONSTRAINT warehouse_stock_allocations_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;


--
-- Name: warehouse_stock_allocations warehouse_stock_allocations_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_allocations
    ADD CONSTRAINT warehouse_stock_allocations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: warehouse_stock_summary warehouse_stock_summary_sub_container_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_summary
    ADD CONSTRAINT warehouse_stock_summary_sub_container_fk FOREIGN KEY (sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;


--
-- Name: warehouse_sub_containers warehouse_sub_containers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_sub_containers
    ADD CONSTRAINT warehouse_sub_containers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id) ON DELETE SET NULL;


--
-- Name: warehouse_sub_containers warehouse_sub_containers_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_sub_containers
    ADD CONSTRAINT warehouse_sub_containers_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id) ON DELETE RESTRICT;


--
-- Name: warehouse_sub_containers warehouse_sub_containers_responsible_person_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_sub_containers
    ADD CONSTRAINT warehouse_sub_containers_responsible_person_profile_id_fkey FOREIGN KEY (responsible_person_profile_id) REFERENCES public.user_data(id) ON DELETE SET NULL;


--
-- Name: warehouse_sub_containers warehouse_sub_containers_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_sub_containers
    ADD CONSTRAINT warehouse_sub_containers_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: warehouse_transfer_items warehouse_transfer_items_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfer_items
    ADD CONSTRAINT warehouse_transfer_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id);


--
-- Name: warehouse_transfer_items warehouse_transfer_items_sub_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfer_items
    ADD CONSTRAINT warehouse_transfer_items_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;


--
-- Name: warehouse_transfer_items warehouse_transfer_items_transfer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfer_items
    ADD CONSTRAINT warehouse_transfer_items_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES public.warehouse_transfers(id) ON DELETE CASCADE;


--
-- Name: warehouse_transfers warehouse_transfers_approved_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_approved_by_profile_id_fkey FOREIGN KEY (approved_by_profile_id) REFERENCES public.user_data(id);


--
-- Name: warehouse_transfers warehouse_transfers_cancelled_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_cancelled_by_profile_id_fkey FOREIGN KEY (cancelled_by_profile_id) REFERENCES public.user_data(id);


--
-- Name: warehouse_transfers warehouse_transfers_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.user_data(id);


--
-- Name: warehouse_transfers warehouse_transfers_dispatched_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_dispatched_by_profile_id_fkey FOREIGN KEY (dispatched_by_profile_id) REFERENCES public.user_data(id);


--
-- Name: warehouse_transfers warehouse_transfers_from_sub_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_from_sub_container_id_fkey FOREIGN KEY (from_sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;


--
-- Name: warehouse_transfers warehouse_transfers_from_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_from_warehouse_id_fkey FOREIGN KEY (from_warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: warehouse_transfers warehouse_transfers_received_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_received_by_profile_id_fkey FOREIGN KEY (received_by_profile_id) REFERENCES public.user_data(id);


--
-- Name: warehouse_transfers warehouse_transfers_repair_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_repair_vendor_id_fkey FOREIGN KEY (repair_vendor_id) REFERENCES public.repair_vendors(id) ON DELETE RESTRICT;


--
-- Name: warehouse_transfers warehouse_transfers_source_return_line_disposition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_source_return_line_disposition_id_fkey FOREIGN KEY (source_return_line_disposition_id) REFERENCES public.return_line_inventory_dispositions(id) ON DELETE SET NULL;


--
-- Name: warehouse_transfers warehouse_transfers_to_sub_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_to_sub_container_id_fkey FOREIGN KEY (to_sub_container_id) REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;


--
-- Name: warehouse_transfers warehouse_transfers_to_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_transfers
    ADD CONSTRAINT warehouse_transfers_to_warehouse_id_fkey FOREIGN KEY (to_warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: warehouses warehouses_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: warehouses warehouses_repair_vendor_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_repair_vendor_fk FOREIGN KEY (repair_vendor_id) REFERENCES public.repair_vendors(id) ON DELETE RESTRICT;


--
-- Name: warranty_number_counters warranty_number_counters_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_number_counters
    ADD CONSTRAINT warranty_number_counters_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id) ON DELETE RESTRICT;


--
-- Name: warranty_policies warranty_policies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_policies
    ADD CONSTRAINT warranty_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_data(id) ON DELETE SET NULL;


--
-- Name: warranty_records warranty_records_brand_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_records
    ADD CONSTRAINT warranty_records_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES public.inventory_item_brand_variants(id) ON DELETE SET NULL;


--
-- Name: warranty_records warranty_records_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_records
    ADD CONSTRAINT warranty_records_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- Name: warranty_records warranty_records_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_records
    ADD CONSTRAINT warranty_records_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.company_divisions(id) ON DELETE RESTRICT;


--
-- Name: warranty_records warranty_records_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_records
    ADD CONSTRAINT warranty_records_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.warranty_policies(id) ON DELETE RESTRICT;


--
-- Name: warranty_records warranty_records_sale_delivery_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_records
    ADD CONSTRAINT warranty_records_sale_delivery_line_id_fkey FOREIGN KEY (sale_delivery_line_id) REFERENCES public.sale_delivery_lines(id) ON DELETE CASCADE;


--
-- Name: warranty_records warranty_records_sale_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_records
    ADD CONSTRAINT warranty_records_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES public.sale_orders(id) ON DELETE RESTRICT;


--
-- Name: approval_workflow_steps workflow_approval_steps_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflow_steps
    ADD CONSTRAINT workflow_approval_steps_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.user_data(id);


--
-- Name: approval_workflow_steps workflow_approval_steps_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_workflow_steps
    ADD CONSTRAINT workflow_approval_steps_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.custom_roles(id);


--
-- Name: credit_notes Accounting/admin can insert credit_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Accounting/admin can insert credit_notes" ON public.credit_notes FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.user_data p
     JOIN public.user_custom_roles ucr ON ((ucr.profile_id = p.id)))
     JOIN public.custom_roles cr ON ((cr.id = ucr.role_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cr.deleted_at IS NULL) AND ((cr.is_system_admin = true) OR ('invoices.manage'::text = ANY (cr.permissions)))))));


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
-- Name: so_invoices Authenticated can delete invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can delete invoices" ON public.so_invoices FOR DELETE TO authenticated USING (true);


--
-- Name: sale_order_lines Authenticated can delete sale_order_lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can delete sale_order_lines" ON public.sale_order_lines FOR DELETE TO authenticated USING (true);


--
-- Name: approval_workflow_groups Authenticated can delete workflow groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can delete workflow groups" ON public.approval_workflow_groups FOR DELETE TO authenticated USING (true);


--
-- Name: so_invoices Authenticated can insert invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can insert invoices" ON public.so_invoices FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: approval_workflow_groups Authenticated can insert workflow groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can insert workflow groups" ON public.approval_workflow_groups FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: warranty_policies Authenticated can manage warranty_policies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can manage warranty_policies" ON public.warranty_policies TO authenticated USING (true) WITH CHECK (true);


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
-- Name: warranty_policies Authenticated can read warranty_policies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read warranty_policies" ON public.warranty_policies FOR SELECT TO authenticated USING (true);


--
-- Name: approval_workflow_groups Authenticated can read workflow groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read workflow groups" ON public.approval_workflow_groups FOR SELECT TO authenticated USING (true);


--
-- Name: so_invoices Authenticated can select invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can select invoices" ON public.so_invoices FOR SELECT TO authenticated USING (true);


--
-- Name: so_invoices Authenticated can update invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can update invoices" ON public.so_invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (((status IS DISTINCT FROM 'void'::public.invoice_status) OR ((status = 'void'::public.invoice_status) AND (EXISTS ( SELECT 1
   FROM ((public.user_data p
     JOIN public.user_custom_roles ucr ON ((ucr.profile_id = p.id)))
     JOIN public.custom_roles cr ON ((cr.id = ucr.role_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cr.deleted_at IS NULL) AND ((cr.is_system_admin = true) OR ('invoices.manage'::text = ANY (cr.permissions)))))))));


--
-- Name: approval_workflow_groups Authenticated can update workflow groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can update workflow groups" ON public.approval_workflow_groups FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: po_version_lines Authenticated users can delete po_version_lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete po_version_lines" ON public.po_version_lines FOR DELETE TO authenticated USING (true);


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
-- Name: po_version_lines Authenticated users can insert po_version_lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert po_version_lines" ON public.po_version_lines FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: warehouse_reorder_points Authenticated users can insert warehouse_reorder_points; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert warehouse_reorder_points" ON public.warehouse_reorder_points FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: credit_group_payment_methods Authenticated users can manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage" ON public.credit_group_payment_methods TO authenticated USING (true) WITH CHECK (true);


--
-- Name: bill_line_items Authenticated users can manage bill_line_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage bill_line_items" ON public.bill_line_items TO authenticated USING (true) WITH CHECK (true);


--
-- Name: bills Authenticated users can manage bills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage bills" ON public.bills TO authenticated USING (true) WITH CHECK (true);


--
-- Name: debit_note_lines Authenticated users can manage debit_note_lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage debit_note_lines" ON public.debit_note_lines TO authenticated USING (true) WITH CHECK (true);


--
-- Name: debit_notes Authenticated users can manage debit_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage debit_notes" ON public.debit_notes TO authenticated USING (true) WITH CHECK (true);


--
-- Name: tool_asset_units Authenticated users can manage tool_asset_units; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can manage tool_asset_units" ON public.tool_asset_units TO authenticated USING (true) WITH CHECK (true);


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
-- Name: po_version_lines Authenticated users can read po_version_lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read po_version_lines" ON public.po_version_lines FOR SELECT TO authenticated USING (true);


--
-- Name: warehouse_stock_summary Authenticated users can read stock summary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read stock summary" ON public.warehouse_stock_summary FOR SELECT TO authenticated USING (true);


--
-- Name: warehouse_responsible_persons Authenticated users can read warehouse_field_rps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read warehouse_field_rps" ON public.warehouse_responsible_persons FOR SELECT TO authenticated USING (true);


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
-- Name: so_po_returns Internal can insert returns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can insert returns" ON public.so_po_returns FOR INSERT TO authenticated WITH CHECK (true);


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
-- Name: so_po_returns Internal can select returns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can select returns" ON public.so_po_returns FOR SELECT TO authenticated USING (true);


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
-- Name: so_po_returns Internal can update returns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal can update returns" ON public.so_po_returns FOR UPDATE TO authenticated USING (true);


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
-- Name: brands Internal users can delete brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can delete brands" ON public.brands FOR DELETE TO authenticated USING (true);


--
-- Name: warehouses Internal users can delete warehouses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can delete warehouses" ON public.warehouses FOR DELETE TO authenticated USING (true);


--
-- Name: brands Internal users can insert brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can insert brands" ON public.brands FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: suppliers Internal users can insert suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can insert suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);


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
-- Name: inventory_item_brand_variants Internal users can manage inventory_brand_variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can manage inventory_brand_variants" ON public.inventory_item_brand_variants TO authenticated USING (true) WITH CHECK (true);


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
-- Name: brands Internal users can read brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can read brands" ON public.brands FOR SELECT TO authenticated USING (true);


--
-- Name: companies Internal users can read companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can read companies" ON public.companies FOR SELECT TO authenticated USING (true);


--
-- Name: company_divisions Internal users can read divisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can read divisions" ON public.company_divisions FOR SELECT TO authenticated USING (true);


--
-- Name: stock_adjustments Internal users can update adjustments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can update adjustments" ON public.stock_adjustments FOR UPDATE TO authenticated USING (true);


--
-- Name: brands Internal users can update brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can update brands" ON public.brands FOR UPDATE TO authenticated USING (true);


--
-- Name: suppliers Internal users can update suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Internal users can update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true);


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
-- Name: bill_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bill_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: bills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

--
-- Name: brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

--
-- Name: consumption_edit_requests ce_edit_requests_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ce_edit_requests_insert ON public.consumption_edit_requests FOR INSERT TO authenticated WITH CHECK ((requested_by = ( SELECT user_data.id
   FROM public.user_data
  WHERE (user_data.auth_user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: consumption_edit_requests ce_edit_requests_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ce_edit_requests_select ON public.consumption_edit_requests FOR SELECT TO authenticated USING (true);


--
-- Name: consumption_edit_requests ce_edit_requests_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ce_edit_requests_update ON public.consumption_edit_requests FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (((public.user_custom_roles ucr
     JOIN public.custom_roles cr ON ((cr.id = ucr.role_id)))
     JOIN public.user_data ud ON ((ud.id = ucr.profile_id)))
     JOIN public.approval_workflow_steps aws ON ((aws.role_id = cr.id)))
  WHERE ((ud.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cr.deleted_at IS NULL) AND (aws.workflow = 'consumption_edit'::text) AND (aws.archived_at IS NULL)))));


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
-- Name: consumption_edit_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consumption_edit_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: consumption_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consumption_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: consumption_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consumption_lines ENABLE ROW LEVEL SECURITY;

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
-- Name: debit_note_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.debit_note_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: debit_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.debit_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders division_scope_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete ON public.purchase_orders FOR DELETE USING (public.is_division_visible(division_id));


--
-- Name: sale_orders division_scope_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete ON public.sale_orders FOR DELETE USING (public.is_division_visible(division_id));


--
-- Name: bill_line_items division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.bill_line_items AS RESTRICTIVE FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = bill_line_items.bill_id) AND public.is_division_visible(b.division_id)))));


--
-- Name: bills division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.bills AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));


--
-- Name: cogs_entries division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.cogs_entries AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));


--
-- Name: consumption_entries division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.consumption_entries AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));


--
-- Name: credit_notes division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.credit_notes AS RESTRICTIVE FOR DELETE USING ((((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = credit_notes.invoice_id) AND public.is_division_visible(i.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = credit_notes.source_return_id) AND public.is_division_visible(r.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));


--
-- Name: debit_notes division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.debit_notes AS RESTRICTIVE FOR DELETE USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = debit_notes.bill_id) AND public.is_division_visible(b.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = debit_notes.source_return_id) AND public.is_division_visible(r.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));


--
-- Name: invoice_line_items division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.invoice_line_items AS RESTRICTIVE FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND public.is_division_visible(i.division_id)))));


--
-- Name: payment_bill_allocations division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.payment_bill_allocations AS RESTRICTIVE FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payment_bill_allocations.bill_id) AND public.is_division_visible(b.division_id)))));


--
-- Name: payment_plans division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.payment_plans AS RESTRICTIVE FOR DELETE USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payment_plans.bill_id) AND public.is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = payment_plans.invoice_id) AND public.is_division_visible(i.division_id)))))));


--
-- Name: payments division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.payments AS RESTRICTIVE FOR DELETE USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payments.bill_id) AND public.is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = payments.invoice_id) AND public.is_division_visible(i.division_id))))) OR ((source_type = 'purchase_order'::public.payment_source_type) AND (EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = payments.source_id) AND public.is_division_visible(po.division_id))))) OR ((source_type = 'sale_order'::public.payment_source_type) AND (EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = payments.source_id) AND public.is_division_visible(so.division_id)))))));


--
-- Name: po_approval_chains division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.po_approval_chains AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));


--
-- Name: po_line_items division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.po_line_items AS RESTRICTIVE FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = po_line_items.po_id) AND public.is_division_visible(po.division_id)))));


--
-- Name: receivals division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.receivals AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));


--
-- Name: return_lines division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.return_lines AS RESTRICTIVE FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = return_lines.return_id) AND public.is_division_visible(r.division_id)))));


--
-- Name: sale_deliveries division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.sale_deliveries AS RESTRICTIVE FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = sale_deliveries.sale_order_id) AND public.is_division_visible(so.division_id)))));


--
-- Name: sale_order_lines division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.sale_order_lines AS RESTRICTIVE FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = sale_order_lines.sale_order_id) AND public.is_division_visible(so.division_id)))));


--
-- Name: shipments division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.shipments AS RESTRICTIVE FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = shipments.po_id) AND public.is_division_visible(po.division_id)))));


--
-- Name: so_invoices division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.so_invoices AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));


--
-- Name: so_po_returns division_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_delete_r ON public.so_po_returns AS RESTRICTIVE FOR DELETE USING (public.is_division_visible(division_id));


--
-- Name: purchase_orders division_scope_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert ON public.purchase_orders FOR INSERT WITH CHECK (public.is_division_visible(division_id));


--
-- Name: sale_orders division_scope_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert ON public.sale_orders FOR INSERT WITH CHECK (public.is_division_visible(division_id));


--
-- Name: bill_line_items division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.bill_line_items AS RESTRICTIVE FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = bill_line_items.bill_id) AND public.is_division_visible(b.division_id)))));


--
-- Name: bills division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.bills AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));


--
-- Name: cogs_entries division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.cogs_entries AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));


--
-- Name: consumption_entries division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.consumption_entries AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));


--
-- Name: credit_notes division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.credit_notes AS RESTRICTIVE FOR INSERT WITH CHECK ((((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = credit_notes.invoice_id) AND public.is_division_visible(i.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = credit_notes.source_return_id) AND public.is_division_visible(r.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));


--
-- Name: debit_notes division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.debit_notes AS RESTRICTIVE FOR INSERT WITH CHECK ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = debit_notes.bill_id) AND public.is_division_visible(b.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = debit_notes.source_return_id) AND public.is_division_visible(r.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));


--
-- Name: invoice_line_items division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.invoice_line_items AS RESTRICTIVE FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND public.is_division_visible(i.division_id)))));


--
-- Name: payment_bill_allocations division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.payment_bill_allocations AS RESTRICTIVE FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payment_bill_allocations.bill_id) AND public.is_division_visible(b.division_id)))));


--
-- Name: payment_plans division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.payment_plans AS RESTRICTIVE FOR INSERT WITH CHECK ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payment_plans.bill_id) AND public.is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = payment_plans.invoice_id) AND public.is_division_visible(i.division_id)))))));


--
-- Name: payments division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.payments AS RESTRICTIVE FOR INSERT WITH CHECK ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payments.bill_id) AND public.is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = payments.invoice_id) AND public.is_division_visible(i.division_id))))) OR ((source_type = 'purchase_order'::public.payment_source_type) AND (EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = payments.source_id) AND public.is_division_visible(po.division_id))))) OR ((source_type = 'sale_order'::public.payment_source_type) AND (EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = payments.source_id) AND public.is_division_visible(so.division_id)))))));


--
-- Name: po_approval_chains division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.po_approval_chains AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));


--
-- Name: po_line_items division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.po_line_items AS RESTRICTIVE FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = po_line_items.po_id) AND public.is_division_visible(po.division_id)))));


--
-- Name: receivals division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.receivals AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));


--
-- Name: return_lines division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.return_lines AS RESTRICTIVE FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = return_lines.return_id) AND public.is_division_visible(r.division_id)))));


--
-- Name: sale_deliveries division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.sale_deliveries AS RESTRICTIVE FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = sale_deliveries.sale_order_id) AND public.is_division_visible(so.division_id)))));


--
-- Name: sale_order_lines division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.sale_order_lines AS RESTRICTIVE FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = sale_order_lines.sale_order_id) AND public.is_division_visible(so.division_id)))));


--
-- Name: shipments division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.shipments AS RESTRICTIVE FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = shipments.po_id) AND public.is_division_visible(po.division_id)))));


--
-- Name: so_invoices division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.so_invoices AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));


--
-- Name: so_po_returns division_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_insert_r ON public.so_po_returns AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_division_visible(division_id));


--
-- Name: purchase_orders division_scope_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select ON public.purchase_orders FOR SELECT USING (public.is_division_visible(division_id));


--
-- Name: sale_orders division_scope_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select ON public.sale_orders FOR SELECT USING (public.is_division_visible(division_id));


--
-- Name: bill_line_items division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.bill_line_items AS RESTRICTIVE FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = bill_line_items.bill_id) AND public.is_division_visible(b.division_id)))));


--
-- Name: bills division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.bills AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));


--
-- Name: cogs_entries division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.cogs_entries AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));


--
-- Name: consumption_entries division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.consumption_entries AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));


--
-- Name: credit_notes division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.credit_notes AS RESTRICTIVE FOR SELECT USING ((((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = credit_notes.invoice_id) AND public.is_division_visible(i.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = credit_notes.source_return_id) AND public.is_division_visible(r.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));


--
-- Name: debit_notes division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.debit_notes AS RESTRICTIVE FOR SELECT USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = debit_notes.bill_id) AND public.is_division_visible(b.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = debit_notes.source_return_id) AND public.is_division_visible(r.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));


--
-- Name: invoice_line_items division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.invoice_line_items AS RESTRICTIVE FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND public.is_division_visible(i.division_id)))));


--
-- Name: payment_bill_allocations division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.payment_bill_allocations AS RESTRICTIVE FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payment_bill_allocations.bill_id) AND public.is_division_visible(b.division_id)))));


--
-- Name: payment_plans division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.payment_plans AS RESTRICTIVE FOR SELECT USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payment_plans.bill_id) AND public.is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = payment_plans.invoice_id) AND public.is_division_visible(i.division_id)))))));


--
-- Name: payments division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.payments AS RESTRICTIVE FOR SELECT USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payments.bill_id) AND public.is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = payments.invoice_id) AND public.is_division_visible(i.division_id))))) OR ((source_type = 'purchase_order'::public.payment_source_type) AND (EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = payments.source_id) AND public.is_division_visible(po.division_id))))) OR ((source_type = 'sale_order'::public.payment_source_type) AND (EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = payments.source_id) AND public.is_division_visible(so.division_id)))))));


--
-- Name: po_approval_chains division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.po_approval_chains AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));


--
-- Name: po_line_items division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.po_line_items AS RESTRICTIVE FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = po_line_items.po_id) AND public.is_division_visible(po.division_id)))));


--
-- Name: receivals division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.receivals AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));


--
-- Name: return_lines division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.return_lines AS RESTRICTIVE FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = return_lines.return_id) AND public.is_division_visible(r.division_id)))));


--
-- Name: sale_deliveries division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.sale_deliveries AS RESTRICTIVE FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = sale_deliveries.sale_order_id) AND public.is_division_visible(so.division_id)))));


--
-- Name: sale_order_lines division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.sale_order_lines AS RESTRICTIVE FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = sale_order_lines.sale_order_id) AND public.is_division_visible(so.division_id)))));


--
-- Name: shipments division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.shipments AS RESTRICTIVE FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = shipments.po_id) AND public.is_division_visible(po.division_id)))));


--
-- Name: so_invoices division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.so_invoices AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));


--
-- Name: so_po_returns division_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_select_r ON public.so_po_returns AS RESTRICTIVE FOR SELECT USING (public.is_division_visible(division_id));


--
-- Name: purchase_orders division_scope_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update ON public.purchase_orders FOR UPDATE USING (public.is_division_visible(division_id));


--
-- Name: sale_orders division_scope_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update ON public.sale_orders FOR UPDATE USING (public.is_division_visible(division_id));


--
-- Name: bill_line_items division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.bill_line_items AS RESTRICTIVE FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = bill_line_items.bill_id) AND public.is_division_visible(b.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = bill_line_items.bill_id) AND public.is_division_visible(b.division_id)))));


--
-- Name: bills division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.bills AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));


--
-- Name: cogs_entries division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.cogs_entries AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));


--
-- Name: consumption_entries division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.consumption_entries AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id));


--
-- Name: credit_notes division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.credit_notes AS RESTRICTIVE FOR UPDATE USING ((((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = credit_notes.invoice_id) AND public.is_division_visible(i.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = credit_notes.source_return_id) AND public.is_division_visible(r.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text]))))) WITH CHECK ((((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = credit_notes.invoice_id) AND public.is_division_visible(i.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = credit_notes.source_return_id) AND public.is_division_visible(r.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));


--
-- Name: debit_notes division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.debit_notes AS RESTRICTIVE FOR UPDATE USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = debit_notes.bill_id) AND public.is_division_visible(b.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = debit_notes.source_return_id) AND public.is_division_visible(r.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text]))))) WITH CHECK ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = debit_notes.bill_id) AND public.is_division_visible(b.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = debit_notes.source_return_id) AND public.is_division_visible(r.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));


--
-- Name: invoice_line_items division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.invoice_line_items AS RESTRICTIVE FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND public.is_division_visible(i.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND public.is_division_visible(i.division_id)))));


--
-- Name: payment_bill_allocations division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.payment_bill_allocations AS RESTRICTIVE FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payment_bill_allocations.bill_id) AND public.is_division_visible(b.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payment_bill_allocations.bill_id) AND public.is_division_visible(b.division_id)))));


--
-- Name: payment_plans division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.payment_plans AS RESTRICTIVE FOR UPDATE USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payment_plans.bill_id) AND public.is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = payment_plans.invoice_id) AND public.is_division_visible(i.division_id))))))) WITH CHECK ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payment_plans.bill_id) AND public.is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = payment_plans.invoice_id) AND public.is_division_visible(i.division_id)))))));


--
-- Name: payments division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.payments AS RESTRICTIVE FOR UPDATE USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payments.bill_id) AND public.is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = payments.invoice_id) AND public.is_division_visible(i.division_id))))) OR ((source_type = 'purchase_order'::public.payment_source_type) AND (EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = payments.source_id) AND public.is_division_visible(po.division_id))))) OR ((source_type = 'sale_order'::public.payment_source_type) AND (EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = payments.source_id) AND public.is_division_visible(so.division_id))))))) WITH CHECK ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bills b
  WHERE ((b.id = payments.bill_id) AND public.is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.so_invoices i
  WHERE ((i.id = payments.invoice_id) AND public.is_division_visible(i.division_id))))) OR ((source_type = 'purchase_order'::public.payment_source_type) AND (EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = payments.source_id) AND public.is_division_visible(po.division_id))))) OR ((source_type = 'sale_order'::public.payment_source_type) AND (EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = payments.source_id) AND public.is_division_visible(so.division_id)))))));


--
-- Name: po_approval_chains division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.po_approval_chains AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));


--
-- Name: po_line_items division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.po_line_items AS RESTRICTIVE FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = po_line_items.po_id) AND public.is_division_visible(po.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = po_line_items.po_id) AND public.is_division_visible(po.division_id)))));


--
-- Name: receivals division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.receivals AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));


--
-- Name: return_lines division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.return_lines AS RESTRICTIVE FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = return_lines.return_id) AND public.is_division_visible(r.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.so_po_returns r
  WHERE ((r.id = return_lines.return_id) AND public.is_division_visible(r.division_id)))));


--
-- Name: sale_deliveries division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.sale_deliveries AS RESTRICTIVE FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = sale_deliveries.sale_order_id) AND public.is_division_visible(so.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = sale_deliveries.sale_order_id) AND public.is_division_visible(so.division_id)))));


--
-- Name: sale_order_lines division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.sale_order_lines AS RESTRICTIVE FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = sale_order_lines.sale_order_id) AND public.is_division_visible(so.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.sale_orders so
  WHERE ((so.id = sale_order_lines.sale_order_id) AND public.is_division_visible(so.division_id)))));


--
-- Name: shipments division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.shipments AS RESTRICTIVE FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = shipments.po_id) AND public.is_division_visible(po.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = shipments.po_id) AND public.is_division_visible(po.division_id)))));


--
-- Name: so_invoices division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.so_invoices AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));


--
-- Name: so_po_returns division_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY division_scope_update_r ON public.so_po_returns AS RESTRICTIVE FOR UPDATE USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));


--
-- Name: exchange_rate_change_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_rate_change_log ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_rate_change_log exchange_rate_change_log_no_client_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rate_change_log_no_client_write ON public.exchange_rate_change_log TO authenticated USING (false) WITH CHECK (false);


--
-- Name: exchange_rate_change_log exchange_rate_change_log_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exchange_rate_change_log_read ON public.exchange_rate_change_log FOR SELECT TO authenticated USING (true);


--
-- Name: fifo_cost_layers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fifo_cost_layers ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_attribute_definitions iad_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iad_read ON public.inventory_attribute_definitions FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: inventory_attribute_definitions iad_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iad_write ON public.inventory_attribute_definitions USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: inventory_attribute_options iao_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iao_read ON public.inventory_attribute_options FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: inventory_attribute_options iao_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iao_write ON public.inventory_attribute_options USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: inventory_item_attributes iia_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iia_read ON public.inventory_item_attributes FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: inventory_item_attributes iia_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iia_write ON public.inventory_item_attributes USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: inventory_attribute_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_attribute_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_attribute_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_attribute_options ENABLE ROW LEVEL SECURITY;

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
-- Name: inventory_damaged_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_damaged_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_damaged_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_damaged_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_damaged_stock_layers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_damaged_stock_layers ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_item_attributes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_item_attributes ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_item_brand_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_item_brand_variants ENABLE ROW LEVEL SECURITY;

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
-- Name: landed_cost_item_allocations landed_cost_item_alloc_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landed_cost_item_alloc_read ON public.landed_cost_item_allocations FOR SELECT USING (true);


--
-- Name: landed_cost_item_allocations landed_cost_item_alloc_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landed_cost_item_alloc_write ON public.landed_cost_item_allocations USING (true);


--
-- Name: landed_cost_item_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landed_cost_item_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: landed_cost_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landed_cost_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: landed_cost_lines landed_cost_lines_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landed_cost_lines_read ON public.landed_cost_lines FOR SELECT USING (true);


--
-- Name: landed_cost_lines landed_cost_lines_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landed_cost_lines_write ON public.landed_cost_lines USING (true);


--
-- Name: landed_costs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landed_costs ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: consumption_entries p_ce_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_ce_read ON public.consumption_entries FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: consumption_entries p_ce_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_ce_write ON public.consumption_entries USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: consumption_lines p_cl_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_cl_read ON public.consumption_lines FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: consumption_lines p_cl_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_cl_write ON public.consumption_lines USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: inventory_damaged_movements p_idm_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_idm_read ON public.inventory_damaged_movements FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: inventory_damaged_stock p_ids_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_ids_read ON public.inventory_damaged_stock FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: inventory_damaged_stock_layers p_idsl_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_idsl_read ON public.inventory_damaged_stock_layers FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: repair_vendors p_rv_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_rv_read ON public.repair_vendors FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: repair_vendors p_rv_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_rv_write ON public.repair_vendors USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


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

CREATE POLICY po_edit_requests_insert ON public.po_edit_requests FOR INSERT TO authenticated WITH CHECK ((requested_by = ( SELECT user_data.id
   FROM public.user_data
  WHERE (user_data.auth_user_id = ( SELECT auth.uid() AS uid)))));


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
     JOIN public.user_data p ON ((p.id = ucr.profile_id)))
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
-- Name: po_version_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_version_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: po_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.po_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_data profiles_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_delete_admin ON public.user_data FOR DELETE TO authenticated USING (public.has_admin_permission());


--
-- Name: user_data profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own ON public.user_data FOR INSERT TO authenticated WITH CHECK ((auth_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_data profiles_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_all ON public.user_data FOR SELECT TO authenticated USING (true);


--
-- Name: user_data profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update ON public.user_data FOR UPDATE TO authenticated USING (((auth_user_id = ( SELECT auth.uid() AS uid)) OR public.has_admin_permission())) WITH CHECK (((auth_user_id = ( SELECT auth.uid() AS uid)) OR public.has_admin_permission()));


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
-- Name: repair_vendors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repair_vendors ENABLE ROW LEVEL SECURITY;

--
-- Name: return_line_customer_resolutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.return_line_customer_resolutions ENABLE ROW LEVEL SECURITY;

--
-- Name: return_line_customer_resolutions return_line_customer_resolutions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY return_line_customer_resolutions_select ON public.return_line_customer_resolutions FOR SELECT TO authenticated USING (true);


--
-- Name: return_line_inventory_dispositions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.return_line_inventory_dispositions ENABLE ROW LEVEL SECURITY;

--
-- Name: return_line_inventory_dispositions return_line_inventory_dispositions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY return_line_inventory_dispositions_select ON public.return_line_inventory_dispositions FOR SELECT TO authenticated USING (true);


--
-- Name: return_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.return_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: return_lines return_lines_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY return_lines_read ON public.return_lines FOR SELECT USING (true);


--
-- Name: return_lines return_lines_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY return_lines_write ON public.return_lines USING (true);


--
-- Name: sale_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_delivery_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_delivery_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_delivery_lines sale_delivery_lines_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_delivery_lines_read ON public.sale_delivery_lines FOR SELECT USING (true);


--
-- Name: sale_delivery_lines sale_delivery_lines_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_delivery_lines_write ON public.sale_delivery_lines USING (true);


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
-- Name: so_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.so_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: so_po_returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.so_po_returns ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_adjustment_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_adjustment_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: storage_cleanup_failures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.storage_cleanup_failures ENABLE ROW LEVEL SECURITY;

--
-- Name: fifo_cost_layers sub_container_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_delete_r ON public.fifo_cost_layers AS RESTRICTIVE FOR DELETE USING (public.is_sub_container_visible(sub_container_id));


--
-- Name: inventory_stock_movements sub_container_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_delete_r ON public.inventory_stock_movements AS RESTRICTIVE FOR DELETE USING (public.is_sub_container_visible(sub_container_id));


--
-- Name: receival_items sub_container_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_delete_r ON public.receival_items AS RESTRICTIVE FOR DELETE USING (public.is_sub_container_visible(sub_container_id));


--
-- Name: stock_adjustments sub_container_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_delete_r ON public.stock_adjustments AS RESTRICTIVE FOR DELETE USING (public.is_sub_container_visible(sub_container_id));


--
-- Name: warehouse_stock_allocations sub_container_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_delete_r ON public.warehouse_stock_allocations AS RESTRICTIVE FOR DELETE USING (public.is_sub_container_visible(sub_container_id));


--
-- Name: warehouse_sub_containers sub_container_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_delete_r ON public.warehouse_sub_containers AS RESTRICTIVE FOR DELETE USING ((public.is_division_visible(division_id) OR (EXISTS ( SELECT 1
   FROM public.warehouse_responsible_persons rp
  WHERE ((rp.warehouse_id = warehouse_sub_containers.warehouse_id) AND (rp.profile_id = public._current_user_data_id()))))));


--
-- Name: warehouse_transfer_items sub_container_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_delete_r ON public.warehouse_transfer_items AS RESTRICTIVE FOR DELETE USING (public.is_sub_container_visible(sub_container_id));


--
-- Name: warehouse_transfers sub_container_scope_delete_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_delete_r ON public.warehouse_transfers AS RESTRICTIVE FOR DELETE USING ((public.is_sub_container_visible(from_sub_container_id) OR public.is_sub_container_visible(to_sub_container_id)));


--
-- Name: fifo_cost_layers sub_container_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_insert_r ON public.fifo_cost_layers AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_sub_container_visible(sub_container_id));


--
-- Name: inventory_stock_movements sub_container_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_insert_r ON public.inventory_stock_movements AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_sub_container_visible(sub_container_id));


--
-- Name: receival_items sub_container_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_insert_r ON public.receival_items AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_sub_container_visible(sub_container_id));


--
-- Name: stock_adjustments sub_container_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_insert_r ON public.stock_adjustments AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_sub_container_visible(sub_container_id));


--
-- Name: warehouse_stock_allocations sub_container_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_insert_r ON public.warehouse_stock_allocations AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_sub_container_visible(sub_container_id));


--
-- Name: warehouse_sub_containers sub_container_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_insert_r ON public.warehouse_sub_containers AS RESTRICTIVE FOR INSERT WITH CHECK ((public.is_division_visible(division_id) OR (EXISTS ( SELECT 1
   FROM public.warehouse_responsible_persons rp
  WHERE ((rp.warehouse_id = warehouse_sub_containers.warehouse_id) AND (rp.profile_id = public._current_user_data_id()))))));


--
-- Name: warehouse_transfer_items sub_container_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_insert_r ON public.warehouse_transfer_items AS RESTRICTIVE FOR INSERT WITH CHECK (public.is_sub_container_visible(sub_container_id));


--
-- Name: warehouse_transfers sub_container_scope_insert_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_insert_r ON public.warehouse_transfers AS RESTRICTIVE FOR INSERT WITH CHECK ((public.is_sub_container_visible(from_sub_container_id) OR public.is_sub_container_visible(to_sub_container_id)));


--
-- Name: fifo_cost_layers sub_container_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_select_r ON public.fifo_cost_layers AS RESTRICTIVE FOR SELECT USING (public.is_sub_container_visible(sub_container_id));


--
-- Name: inventory_stock_movements sub_container_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_select_r ON public.inventory_stock_movements AS RESTRICTIVE FOR SELECT USING (public.is_sub_container_visible(sub_container_id));


--
-- Name: receival_items sub_container_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_select_r ON public.receival_items AS RESTRICTIVE FOR SELECT USING (public.is_sub_container_visible(sub_container_id));


--
-- Name: stock_adjustments sub_container_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_select_r ON public.stock_adjustments AS RESTRICTIVE FOR SELECT USING (public.is_sub_container_visible(sub_container_id));


--
-- Name: warehouse_stock_allocations sub_container_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_select_r ON public.warehouse_stock_allocations AS RESTRICTIVE FOR SELECT USING (public.is_sub_container_visible(sub_container_id));


--
-- Name: warehouse_sub_containers sub_container_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_select_r ON public.warehouse_sub_containers AS RESTRICTIVE FOR SELECT USING ((public.is_division_visible(division_id) OR (EXISTS ( SELECT 1
   FROM public.warehouse_responsible_persons rp
  WHERE ((rp.warehouse_id = warehouse_sub_containers.warehouse_id) AND (rp.profile_id = public._current_user_data_id()))))));


--
-- Name: warehouse_transfer_items sub_container_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_select_r ON public.warehouse_transfer_items AS RESTRICTIVE FOR SELECT USING ((public.is_sub_container_visible(sub_container_id) OR (EXISTS ( SELECT 1
   FROM public.warehouse_transfers t
  WHERE ((t.id = warehouse_transfer_items.transfer_id) AND (public.is_sub_container_visible(t.from_sub_container_id) OR public.is_sub_container_visible(t.to_sub_container_id)))))));


--
-- Name: warehouse_transfers sub_container_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_select_r ON public.warehouse_transfers AS RESTRICTIVE FOR SELECT USING ((public.is_sub_container_visible(from_sub_container_id) OR public.is_sub_container_visible(to_sub_container_id)));


--
-- Name: warehouses sub_container_scope_select_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_select_r ON public.warehouses AS RESTRICTIVE FOR SELECT USING (((is_virtual = true) OR (NOT (EXISTS ( SELECT 1
   FROM public.warehouse_sub_containers sc
  WHERE (sc.warehouse_id = warehouses.id)))) OR (EXISTS ( SELECT 1
   FROM public.warehouse_sub_containers sc
  WHERE ((sc.warehouse_id = warehouses.id) AND public.is_sub_container_visible(sc.id))))));


--
-- Name: fifo_cost_layers sub_container_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_update_r ON public.fifo_cost_layers AS RESTRICTIVE FOR UPDATE USING (public.is_sub_container_visible(sub_container_id)) WITH CHECK (public.is_sub_container_visible(sub_container_id));


--
-- Name: inventory_stock_movements sub_container_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_update_r ON public.inventory_stock_movements AS RESTRICTIVE FOR UPDATE USING (public.is_sub_container_visible(sub_container_id)) WITH CHECK (public.is_sub_container_visible(sub_container_id));


--
-- Name: receival_items sub_container_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_update_r ON public.receival_items AS RESTRICTIVE FOR UPDATE USING (public.is_sub_container_visible(sub_container_id)) WITH CHECK (public.is_sub_container_visible(sub_container_id));


--
-- Name: stock_adjustments sub_container_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_update_r ON public.stock_adjustments AS RESTRICTIVE FOR UPDATE USING (public.is_sub_container_visible(sub_container_id)) WITH CHECK (public.is_sub_container_visible(sub_container_id));


--
-- Name: warehouse_stock_allocations sub_container_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_update_r ON public.warehouse_stock_allocations AS RESTRICTIVE FOR UPDATE USING (public.is_sub_container_visible(sub_container_id)) WITH CHECK (public.is_sub_container_visible(sub_container_id));


--
-- Name: warehouse_sub_containers sub_container_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_update_r ON public.warehouse_sub_containers AS RESTRICTIVE FOR UPDATE USING ((public.is_division_visible(division_id) OR (EXISTS ( SELECT 1
   FROM public.warehouse_responsible_persons rp
  WHERE ((rp.warehouse_id = warehouse_sub_containers.warehouse_id) AND (rp.profile_id = public._current_user_data_id())))))) WITH CHECK ((public.is_division_visible(division_id) OR (EXISTS ( SELECT 1
   FROM public.warehouse_responsible_persons rp
  WHERE ((rp.warehouse_id = warehouse_sub_containers.warehouse_id) AND (rp.profile_id = public._current_user_data_id()))))));


--
-- Name: warehouse_transfer_items sub_container_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_update_r ON public.warehouse_transfer_items AS RESTRICTIVE FOR UPDATE USING (public.is_sub_container_visible(sub_container_id)) WITH CHECK (public.is_sub_container_visible(sub_container_id));


--
-- Name: warehouse_transfers sub_container_scope_update_r; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sub_container_scope_update_r ON public.warehouse_transfers AS RESTRICTIVE FOR UPDATE USING ((public.is_sub_container_visible(from_sub_container_id) OR public.is_sub_container_visible(to_sub_container_id))) WITH CHECK ((public.is_sub_container_visible(from_sub_container_id) OR public.is_sub_container_visible(to_sub_container_id)));


--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: tool_asset_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tool_asset_units ENABLE ROW LEVEL SECURITY;

--
-- Name: user_company_divisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_company_divisions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_custom_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse_reorder_points; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_reorder_points ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse_responsible_persons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_responsible_persons ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse_stock_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_stock_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse_stock_summary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_stock_summary ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse_sub_containers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_sub_containers ENABLE ROW LEVEL SECURITY;

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
-- Name: warranty_number_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warranty_number_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: warranty_number_counters warranty_number_counters_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warranty_number_counters_select ON public.warranty_number_counters FOR SELECT TO authenticated USING (true);


--
-- Name: warranty_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warranty_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: warranty_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warranty_records ENABLE ROW LEVEL SECURITY;

--
-- Name: warranty_records warranty_records_division_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warranty_records_division_delete ON public.warranty_records FOR DELETE TO authenticated USING (public.is_division_visible(division_id));


--
-- Name: warranty_records warranty_records_division_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warranty_records_division_insert ON public.warranty_records FOR INSERT TO authenticated WITH CHECK (public.is_division_visible(division_id));


--
-- Name: warranty_records warranty_records_division_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warranty_records_division_select ON public.warranty_records FOR SELECT TO authenticated USING (public.is_division_visible(division_id));


--
-- Name: warranty_records warranty_records_division_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warranty_records_division_update ON public.warranty_records FOR UPDATE TO authenticated USING (public.is_division_visible(division_id)) WITH CHECK (public.is_division_visible(division_id));


--
-- Name: approval_workflow_steps workflow_steps_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_steps_select ON public.approval_workflow_steps FOR SELECT TO authenticated USING (true);


--
-- Name: warehouse_sub_containers wsc_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wsc_authenticated_all ON public.warehouse_sub_containers TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--



-- SECTION 2: storage policies
-- Storage policies extracted from live staging DB
-- Only policies are portable; buckets/types/triggers are Supabase-managed

DROP POLICY IF EXISTS "authenticated can read adjustment-photos" ON storage.objects;
CREATE POLICY "authenticated can read adjustment-photos" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'adjustment-photos'::text));



DROP POLICY IF EXISTS "authenticated can upload adjustment-photos" ON storage.objects;
CREATE POLICY "authenticated can upload adjustment-photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'adjustment-photos'::text));



DROP POLICY IF EXISTS "avatars_auth_delete" ON storage.objects;
CREATE POLICY avatars_auth_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'avatars'::text) AND (split_part(name, '.'::text, 1) = (auth.uid())::text)));



DROP POLICY IF EXISTS "avatars_auth_insert" ON storage.objects;
CREATE POLICY avatars_auth_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'avatars'::text) AND (split_part(name, '.'::text, 1) = (auth.uid())::text)));



DROP POLICY IF EXISTS "avatars_auth_update" ON storage.objects;
CREATE POLICY avatars_auth_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'avatars'::text) AND (split_part(name, '.'::text, 1) = (auth.uid())::text))) WITH CHECK (((bucket_id = 'avatars'::text) AND (split_part(name, '.'::text, 1) = (auth.uid())::text)));



DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY avatars_public_read ON storage.objects FOR SELECT USING ((bucket_id = 'avatars'::text));



DROP POLICY IF EXISTS "bill-pdfs_public_read" ON storage.objects;
CREATE POLICY "bill-pdfs_public_read" ON storage.objects FOR SELECT USING ((bucket_id = 'bill-pdfs'::text));



DROP POLICY IF EXISTS "bill-pdfs_service_update" ON storage.objects;
CREATE POLICY "bill-pdfs_service_update" ON storage.objects FOR UPDATE TO service_role USING ((bucket_id = 'bill-pdfs'::text)) WITH CHECK ((bucket_id = 'bill-pdfs'::text));



DROP POLICY IF EXISTS "bill-pdfs_service_write" ON storage.objects;
CREATE POLICY "bill-pdfs_service_write" ON storage.objects FOR INSERT TO service_role WITH CHECK ((bucket_id = 'bill-pdfs'::text));



DROP POLICY IF EXISTS "booking_confirmations_public_read" ON storage.objects;
CREATE POLICY booking_confirmations_public_read ON storage.objects FOR SELECT USING ((bucket_id = 'booking-confirmations'::text));



DROP POLICY IF EXISTS "booking_confirmations_service_update" ON storage.objects;
CREATE POLICY booking_confirmations_service_update ON storage.objects FOR UPDATE TO service_role USING ((bucket_id = 'booking-confirmations'::text)) WITH CHECK ((bucket_id = 'booking-confirmations'::text));



DROP POLICY IF EXISTS "booking_confirmations_service_write" ON storage.objects;
CREATE POLICY booking_confirmations_service_write ON storage.objects FOR INSERT TO service_role WITH CHECK ((bucket_id = 'booking-confirmations'::text));



DROP POLICY IF EXISTS "consumption_attachments_delete" ON storage.objects;
CREATE POLICY consumption_attachments_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'consumption-attachments'::text));



DROP POLICY IF EXISTS "consumption_attachments_insert" ON storage.objects;
CREATE POLICY consumption_attachments_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'consumption-attachments'::text));



DROP POLICY IF EXISTS "consumption_attachments_select" ON storage.objects;
CREATE POLICY consumption_attachments_select ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'consumption-attachments'::text));



DROP POLICY IF EXISTS "consumption_attachments_update" ON storage.objects;
CREATE POLICY consumption_attachments_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'consumption-attachments'::text)) WITH CHECK ((bucket_id = 'consumption-attachments'::text));



DROP POLICY IF EXISTS "credit-note-pdfs_public_read" ON storage.objects;
CREATE POLICY "credit-note-pdfs_public_read" ON storage.objects FOR SELECT USING ((bucket_id = 'credit-note-pdfs'::text));



DROP POLICY IF EXISTS "credit-note-pdfs_service_update" ON storage.objects;
CREATE POLICY "credit-note-pdfs_service_update" ON storage.objects FOR UPDATE TO service_role USING ((bucket_id = 'credit-note-pdfs'::text)) WITH CHECK ((bucket_id = 'credit-note-pdfs'::text));



DROP POLICY IF EXISTS "credit-note-pdfs_service_write" ON storage.objects;
CREATE POLICY "credit-note-pdfs_service_write" ON storage.objects FOR INSERT TO service_role WITH CHECK ((bucket_id = 'credit-note-pdfs'::text));



DROP POLICY IF EXISTS "customer_credit_docs_delete" ON storage.objects;
CREATE POLICY customer_credit_docs_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'customer-credit-docs'::text) AND public.storage_customer_credit_docs_write_allowed()));



DROP POLICY IF EXISTS "customer_credit_docs_insert" ON storage.objects;
CREATE POLICY customer_credit_docs_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'customer-credit-docs'::text) AND public.storage_customer_credit_docs_write_allowed()));



DROP POLICY IF EXISTS "customer_credit_docs_select" ON storage.objects;
CREATE POLICY customer_credit_docs_select ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'customer-credit-docs'::text));



DROP POLICY IF EXISTS "customer_credit_docs_update" ON storage.objects;
CREATE POLICY customer_credit_docs_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'customer-credit-docs'::text) AND public.storage_customer_credit_docs_write_allowed())) WITH CHECK (((bucket_id = 'customer-credit-docs'::text) AND public.storage_customer_credit_docs_write_allowed()));



DROP POLICY IF EXISTS "delivery_note_pdfs_auth_update" ON storage.objects;
CREATE POLICY delivery_note_pdfs_auth_update ON storage.objects FOR UPDATE USING ((bucket_id = 'delivery-note-pdfs'::text));



DROP POLICY IF EXISTS "delivery_note_pdfs_auth_write" ON storage.objects;
CREATE POLICY delivery_note_pdfs_auth_write ON storage.objects FOR INSERT WITH CHECK ((bucket_id = 'delivery-note-pdfs'::text));



DROP POLICY IF EXISTS "delivery_note_pdfs_public_read" ON storage.objects;
CREATE POLICY delivery_note_pdfs_public_read ON storage.objects FOR SELECT USING ((bucket_id = 'delivery-note-pdfs'::text));



DROP POLICY IF EXISTS "division_assets_auth_delete" ON storage.objects;
CREATE POLICY division_assets_auth_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'division-assets'::text));



DROP POLICY IF EXISTS "division_assets_auth_insert" ON storage.objects;
CREATE POLICY division_assets_auth_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'division-assets'::text));



DROP POLICY IF EXISTS "division_assets_auth_update" ON storage.objects;
CREATE POLICY division_assets_auth_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'division-assets'::text));



DROP POLICY IF EXISTS "division_assets_public_read" ON storage.objects;
CREATE POLICY division_assets_public_read ON storage.objects FOR SELECT USING ((bucket_id = 'division-assets'::text));



DROP POLICY IF EXISTS "inventory_item_photos_delete" ON storage.objects;
CREATE POLICY inventory_item_photos_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'inventory-item-photos'::text));



DROP POLICY IF EXISTS "inventory_item_photos_insert" ON storage.objects;
CREATE POLICY inventory_item_photos_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'inventory-item-photos'::text));



DROP POLICY IF EXISTS "inventory_item_photos_select" ON storage.objects;
CREATE POLICY inventory_item_photos_select ON storage.objects FOR SELECT USING ((bucket_id = 'inventory-item-photos'::text));



DROP POLICY IF EXISTS "inventory_item_photos_update" ON storage.objects;
CREATE POLICY inventory_item_photos_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'inventory-item-photos'::text)) WITH CHECK ((bucket_id = 'inventory-item-photos'::text));



DROP POLICY IF EXISTS "invoice-pdfs_public_read" ON storage.objects;
CREATE POLICY "invoice-pdfs_public_read" ON storage.objects FOR SELECT USING ((bucket_id = 'invoice-pdfs'::text));



DROP POLICY IF EXISTS "invoice-pdfs_service_update" ON storage.objects;
CREATE POLICY "invoice-pdfs_service_update" ON storage.objects FOR UPDATE TO service_role USING ((bucket_id = 'invoice-pdfs'::text)) WITH CHECK ((bucket_id = 'invoice-pdfs'::text));



DROP POLICY IF EXISTS "invoice-pdfs_service_write" ON storage.objects;
CREATE POLICY "invoice-pdfs_service_write" ON storage.objects FOR INSERT TO service_role WITH CHECK ((bucket_id = 'invoice-pdfs'::text));



DROP POLICY IF EXISTS "lc_bills_auth_delete" ON storage.objects;
CREATE POLICY lc_bills_auth_delete ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'lc-bills'::text));



DROP POLICY IF EXISTS "lc_bills_auth_insert" ON storage.objects;
CREATE POLICY lc_bills_auth_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'lc-bills'::text));



DROP POLICY IF EXISTS "lc_bills_auth_read" ON storage.objects;
CREATE POLICY lc_bills_auth_read ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'lc-bills'::text));



DROP POLICY IF EXISTS "lc_bills_auth_update" ON storage.objects;
CREATE POLICY lc_bills_auth_update ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'lc-bills'::text));



DROP POLICY IF EXISTS "po-pdfs_public_read" ON storage.objects;
CREATE POLICY "po-pdfs_public_read" ON storage.objects FOR SELECT USING ((bucket_id = 'po-pdfs'::text));



DROP POLICY IF EXISTS "po-pdfs_service_update" ON storage.objects;
CREATE POLICY "po-pdfs_service_update" ON storage.objects FOR UPDATE TO service_role USING ((bucket_id = 'po-pdfs'::text)) WITH CHECK ((bucket_id = 'po-pdfs'::text));



DROP POLICY IF EXISTS "po-pdfs_service_write" ON storage.objects;
CREATE POLICY "po-pdfs_service_write" ON storage.objects FOR INSERT TO service_role WITH CHECK ((bucket_id = 'po-pdfs'::text));



DROP POLICY IF EXISTS "quotation-pdfs_public_read" ON storage.objects;
CREATE POLICY "quotation-pdfs_public_read" ON storage.objects FOR SELECT USING ((bucket_id = 'quotation-pdfs'::text));



DROP POLICY IF EXISTS "quotation-pdfs_service_update" ON storage.objects;
CREATE POLICY "quotation-pdfs_service_update" ON storage.objects FOR UPDATE TO service_role USING ((bucket_id = 'quotation-pdfs'::text)) WITH CHECK ((bucket_id = 'quotation-pdfs'::text));



DROP POLICY IF EXISTS "quotation-pdfs_service_write" ON storage.objects;
CREATE POLICY "quotation-pdfs_service_write" ON storage.objects FOR INSERT TO service_role WITH CHECK ((bucket_id = 'quotation-pdfs'::text));



DROP POLICY IF EXISTS "receival-check-pdfs_public_read" ON storage.objects;
CREATE POLICY "receival-check-pdfs_public_read" ON storage.objects FOR SELECT USING ((bucket_id = 'receival-check-pdfs'::text));



DROP POLICY IF EXISTS "receival-check-pdfs_service_update" ON storage.objects;
CREATE POLICY "receival-check-pdfs_service_update" ON storage.objects FOR UPDATE TO service_role USING ((bucket_id = 'receival-check-pdfs'::text)) WITH CHECK ((bucket_id = 'receival-check-pdfs'::text));



DROP POLICY IF EXISTS "receival-check-pdfs_service_write" ON storage.objects;
CREATE POLICY "receival-check-pdfs_service_write" ON storage.objects FOR INSERT TO service_role WITH CHECK ((bucket_id = 'receival-check-pdfs'::text));



DROP POLICY IF EXISTS "receival_receipt_pdfs_auth_update" ON storage.objects;
CREATE POLICY receival_receipt_pdfs_auth_update ON storage.objects FOR UPDATE USING ((bucket_id = 'receival-receipt-pdfs'::text));



DROP POLICY IF EXISTS "receival_receipt_pdfs_auth_write" ON storage.objects;
CREATE POLICY receival_receipt_pdfs_auth_write ON storage.objects FOR INSERT WITH CHECK ((bucket_id = 'receival-receipt-pdfs'::text));



DROP POLICY IF EXISTS "receival_receipt_pdfs_public_read" ON storage.objects;
CREATE POLICY receival_receipt_pdfs_public_read ON storage.objects FOR SELECT USING ((bucket_id = 'receival-receipt-pdfs'::text));



DROP POLICY IF EXISTS "return_pdfs_auth_update" ON storage.objects;
CREATE POLICY return_pdfs_auth_update ON storage.objects FOR UPDATE USING ((bucket_id = 'return-pdfs'::text));



DROP POLICY IF EXISTS "return_pdfs_auth_write" ON storage.objects;
CREATE POLICY return_pdfs_auth_write ON storage.objects FOR INSERT WITH CHECK ((bucket_id = 'return-pdfs'::text));



DROP POLICY IF EXISTS "return_pdfs_public_read" ON storage.objects;
CREATE POLICY return_pdfs_public_read ON storage.objects FOR SELECT USING ((bucket_id = 'return-pdfs'::text));





-- SECTION 3: bootstrap_first_user_trg on auth.users
DROP TRIGGER IF EXISTS bootstrap_first_user_trg ON auth.users;
CREATE TRIGGER bootstrap_first_user_trg AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_first_user();

NOTIFY pgrst, 'reload schema';
