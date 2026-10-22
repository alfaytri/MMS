-- Customer consolidation — Stage 4, Step 1: dual-write the create paths via triggers (no RPC edits,
-- so EVERY create path is covered: RPCs, API routes, master-data direct inserts). Additive + reversible.
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
--
-- Trigger A (service_customer_phones AFTER INSERT): find-or-tag a customers row BY PHONE (last-8
--   digits). If an existing customer matches the phone -> bridge to it (dedup, no new row). Else create
--   an untagged customers row + bridge + copy the phone. Also mirrors extra phones onto an already-
--   bridged customer. This is the "find-or-tag by phone" dedup.
-- Trigger B (orders/site_visits/order_quotations/contracts BEFORE INSERT): set customer_id from the
--   bridged service customer when it's null -> the core tables now carry BOTH ids (service id untouched).

BEGIN;

-- ── Trigger A ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_bridge_customer()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $fn$
DECLARE
  v_bridge uuid;   -- current service_customers.customer_id
  v_match  uuid;   -- existing customers.id matching this phone
  v_new    uuid;
  v_key    text := right(regexp_replace(NEW.phone, '\D', '', 'g'), 8);
BEGIN
  SELECT sc.customer_id INTO v_bridge FROM public.service_customers sc WHERE sc.id = NEW.customer_id;

  -- Already bridged: just mirror this phone onto the customer if it's not there yet (non-primary to
  -- avoid the one-primary-per-customer partial unique index).
  IF v_bridge IS NOT NULL THEN
    INSERT INTO public.customer_phones (customer_id, phone, label, is_primary)
    SELECT v_bridge, NEW.phone, NEW.label, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.customer_phones cp
      WHERE cp.customer_id = v_bridge
        AND right(regexp_replace(cp.phone, '\D', '', 'g'), 8) = v_key
    );
    RETURN NEW;
  END IF;

  -- Not bridged yet: dedup — does an existing customer already own this phone?
  SELECT cp.customer_id INTO v_match
  FROM public.customer_phones cp
  WHERE right(regexp_replace(cp.phone, '\D', '', 'g'), 8) = v_key
  LIMIT 1;

  IF v_match IS NOT NULL THEN
    UPDATE public.service_customers SET customer_id = v_match WHERE id = NEW.customer_id;
    RETURN NEW;  -- phone already lives on that customer (that's how we matched)
  END IF;

  -- No match: create a new untagged customer, bridge it, copy this phone.
  INSERT INTO public.customers (name, is_sales_customer, is_active, entity_type)
  SELECT sc.name, false, true,
         CASE WHEN lower(COALESCE(sc.customer_type, '')) IN ('business','company','corporate')
              THEN 'business'::customer_entity_type ELSE 'individual'::customer_entity_type END
  FROM public.service_customers sc WHERE sc.id = NEW.customer_id
  RETURNING id INTO v_new;

  UPDATE public.service_customers SET customer_id = v_new WHERE id = NEW.customer_id;

  INSERT INTO public.customer_phones (customer_id, phone, label, is_primary)
  VALUES (v_new, NEW.phone, NEW.label, COALESCE(NEW.is_primary, true));

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_scp_bridge_customer ON public.service_customer_phones;
CREATE TRIGGER trg_scp_bridge_customer
  AFTER INSERT ON public.service_customer_phones
  FOR EACH ROW EXECUTE FUNCTION public.scp_bridge_customer();

-- ── Trigger B ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.core_set_customer_from_sc()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.customer_id IS NULL AND NEW.service_customer_id IS NOT NULL THEN
    SELECT sc.customer_id INTO NEW.customer_id
    FROM public.service_customers sc WHERE sc.id = NEW.service_customer_id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_core_set_customer ON public.orders;
CREATE TRIGGER trg_core_set_customer BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.core_set_customer_from_sc();

DROP TRIGGER IF EXISTS trg_core_set_customer ON public.site_visits;
CREATE TRIGGER trg_core_set_customer BEFORE INSERT ON public.site_visits
  FOR EACH ROW EXECUTE FUNCTION public.core_set_customer_from_sc();

DROP TRIGGER IF EXISTS trg_core_set_customer ON public.order_quotations;
CREATE TRIGGER trg_core_set_customer BEFORE INSERT ON public.order_quotations
  FOR EACH ROW EXECUTE FUNCTION public.core_set_customer_from_sc();

DROP TRIGGER IF EXISTS trg_core_set_customer ON public.contracts;
CREATE TRIGGER trg_core_set_customer BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.core_set_customer_from_sc();

COMMIT;
