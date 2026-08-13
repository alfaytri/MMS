-- Security P1 — guard sale_deliveries workflow statuses against direct client
-- writes (mirror of guard_so_privileged_status, 20260819110000).
--
-- Finding: sale_deliveries is on the baseline "Internal ... sale_deliveries"
-- USING(true)/WITH CHECK(true) policy — anon AND authenticated both hold full
-- CRUD. The client legitimately (a) INSERTs a stub delivery at status='pending'
-- (useConfirmSO, useSaleOrders.ts) and (b) UPDATEs warehouse_id/warehouse_name/
-- date via useUpdateDelivery. But useUpdateDelivery's typed `updates` allows a
-- `status` passthrough and the grant permits it, so a raw-PostgREST
-- `update sale_deliveries set status='delivered'` would mark a delivery
-- delivered with NO stock movement / NO COGS (or 'cancelled' with NO inventory
-- reversal), bypassing the delivery workflow.
--
-- Verified live before writing (staging mwvblpgbgxipvrevkeff, 2026-08-10,
-- `npx supabase db query --linked`):
--  * sale_delivery_status enum = {pending, in_progress, delivered, cancelled} —
--    every status literal below is a real enum label.
--  * Every function that writes sale_deliveries is SECURITY DEFINER
--    (create_and_confirm_delivery, complete_delivery_inventory,
--    cancel_delivery_inventory, rpc_complete_delivery_with_followup,
--    rpc_create_partial_replacement) — prosecdef=true — so they run as the owner
--    role and pass the current_user gate; there is NO SECURITY INVOKER writer.
--  * anon + authenticated both hold full CRUD → the anon REVOKE below is meaningful.

CREATE OR REPLACE FUNCTION public.guard_sale_delivery_status()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default): current_user must reflect the real caller. A
-- SECURITY DEFINER trigger would always report the owner role and defeat the
-- direct-vs-RPC distinction below.
SET search_path TO 'public'
AS $$
BEGIN
  -- Only guard direct client writes. SECURITY DEFINER workflow RPCs (and the
  -- service role) run as a non-client role and are the only legitimate source of
  -- a workflow status.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'A sale delivery cannot be created with status "%" — the delivery workflow sets that.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('delivered', 'in_progress', 'cancelled') THEN
      RAISE EXCEPTION 'Sale delivery status "%" can only be set by the delivery workflow (complete/cancel RPCs), not a direct update.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sale_delivery_status ON public.sale_deliveries;
CREATE TRIGGER trg_guard_sale_delivery_status
BEFORE INSERT OR UPDATE ON public.sale_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.guard_sale_delivery_status();

-- Defense-in-depth: anon has no legitimate access (authenticated-only app).
REVOKE ALL ON public.sale_deliveries FROM anon;
