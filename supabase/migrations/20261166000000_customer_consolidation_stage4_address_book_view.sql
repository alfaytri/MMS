-- Customer consolidation — Stage 4, Step 2: a unified read view over BOTH address tables, keyed by id,
-- so the app can resolve an orders.address_id whether it still points at service_customer_addresses
-- (today) or at customer_addresses (after the 4.5 remap). This decouples the address READS from the FK
-- so the later FK re-target is non-breaking. Columns normalized to the service_customer_addresses shape
-- the existing code expects (building/street/zone/unit). Additive + reversible.
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
CREATE OR REPLACE VIEW public.order_address_book
  WITH (security_invoker = true) AS
  SELECT id, customer_id, label,
         building_no AS building, street_no AS street, zone_no AS zone, unit_no AS unit,
         lat, lng, waze_link, is_primary, 'customer'::text AS source
  FROM public.customer_addresses
  UNION ALL
  SELECT id, customer_id, label,
         building, street, zone, unit,
         lat, lng, waze_link, is_primary, 'service'::text AS source
  FROM public.service_customer_addresses;
