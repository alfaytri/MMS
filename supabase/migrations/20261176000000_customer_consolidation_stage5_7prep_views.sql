-- Customer consolidation — Stage 5.7 prep (final, non-destructive): clear the last two views that
-- still reference the service tables (they would block the drop).
--   * customers_with_multi_phones: unused (only consumer was the deleted useServiceCustomers) -> drop
--   * order_address_book: drop the service_customer_addresses UNION branch -> customer_addresses only
--     (all order addresses are on customer_addresses now; address reads keep querying the view).
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='detail_table') THEN
    RAISE EXCEPTION 'WRONG DB';
  END IF;
END $guard$;

DROP VIEW IF EXISTS public.customers_with_multi_phones;

CREATE OR REPLACE VIEW public.order_address_book WITH (security_invoker=true) AS
  SELECT ca.id,
         ca.customer_id,
         ca.label,
         ca.building_no AS building,
         ca.street_no   AS street,
         ca.zone_no     AS zone,
         ca.unit_no     AS unit,
         ca.lat,
         ca.lng,
         ca.waze_link,
         ca.is_primary,
         'customer'::text AS source
  FROM public.customer_addresses ca;

COMMIT;
