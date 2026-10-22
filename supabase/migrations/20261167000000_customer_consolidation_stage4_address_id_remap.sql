-- Customer consolidation — Stage 4 cutover: remap orders.address_id from service_customer_addresses ids
-- to their mirrored customer_addresses ids, then re-target the FK to customer_addresses (preserving
-- ON DELETE SET NULL). Pre-verified: all orders-with-address map 1:1 to a customer_addresses row.
-- Reads were already decoupled via order_address_book; the create form writes customer_addresses; so
-- this is the DB half of the coordinated cutover. Run IMMEDIATELY after the create-side code deploy.
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
BEGIN;

-- Drop the old FK FIRST so the remap UPDATE can set customer_addresses ids; the whole thing is atomic.
ALTER TABLE public.orders DROP CONSTRAINT orders_address_id_fkey;

UPDATE public.orders o SET address_id = ca.id
FROM public.service_customer_addresses sca
JOIN public.service_customers sc ON sc.id = sca.customer_id
JOIN public.customer_addresses ca ON ca.customer_id = sc.customer_id
  AND coalesce(ca.label,'')      = coalesce(sca.label,'')
  AND coalesce(ca.building_no,'')= coalesce(sca.building,'')
  AND coalesce(ca.street_no,'')  = coalesce(sca.street,'')
  AND coalesce(ca.zone_no,'')    = coalesce(sca.zone,'')
  AND ca.lat IS NOT DISTINCT FROM sca.lat
  AND ca.lng IS NOT DISTINCT FROM sca.lng
WHERE o.address_id = sca.id;

ALTER TABLE public.orders ADD CONSTRAINT orders_address_id_fkey
  FOREIGN KEY (address_id) REFERENCES public.customer_addresses(id) ON DELETE SET NULL;

COMMIT;
