-- 20261043000000_stamp_delivery_creator_trigger.sql
--
-- Deliveries created OUTSIDE create_and_confirm_delivery — notably the pending
-- stub auto-created when a sale order is CONFIRMED (useConfirmSO inserts into
-- sale_deliveries directly, useSaleOrders.ts) — had NULL created_by /
-- created_by_name, so the delivery detail's "Created By" showed "—" and nothing
-- recorded who created them. Migration 20261042000000 stamped only the RPC path;
-- this covers every OTHER insert path with a BEFORE INSERT trigger that fills the
-- creator whenever the insert didn't set one. The RPC keeps setting it
-- explicitly, so the guard simply skips there. Null-safe: with no JWT (e.g. a
-- service-role backfill) the caller id resolves to NULL and the row is left
-- unstamped. Idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).

CREATE OR REPLACE FUNCTION public._stamp_sale_delivery_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := public._current_user_data_id();
  END IF;
  IF NEW.created_by_name IS NULL AND NEW.created_by IS NOT NULL THEN
    NEW.created_by_name := (SELECT full_name FROM public.user_data WHERE id = NEW.created_by);
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_stamp_sale_delivery_creator ON public.sale_deliveries;
CREATE TRIGGER trg_stamp_sale_delivery_creator
  BEFORE INSERT ON public.sale_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public._stamp_sale_delivery_creator();

NOTIFY pgrst, 'reload schema';
