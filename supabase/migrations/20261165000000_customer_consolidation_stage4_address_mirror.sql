-- Customer consolidation — Stage 4, Step 2 prep: mirror service_customer_addresses -> customer_addresses
-- for the bridged customer, so the customers side stays address-complete for NEW data. Additive +
-- reversible. The booking flow still reads/writes service_customer_addresses unchanged (the actual
-- address_id re-point + useCustomerAddresses flip is the later 4.5 step). INSERT-only for now.
-- Column map (service -> customer): unit->unit_no, building->building_no, street->street_no, zone->zone_no;
-- address_type text -> address_type enum (unknown -> 'blue-plate'). Mirror is non-primary unless the
-- customer has no primary yet (avoids the one-primary-per-customer index).
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
BEGIN;

CREATE OR REPLACE FUNCTION public.sca_mirror_customer_address()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $fn$
DECLARE
  v_bridge  uuid;
  v_primary boolean;
BEGIN
  SELECT sc.customer_id INTO v_bridge FROM public.service_customers sc WHERE sc.id = NEW.customer_id;
  IF v_bridge IS NULL THEN
    RETURN NEW;  -- service customer not bridged yet (no phone) -> nothing to mirror to
  END IF;

  -- Skip if an equivalent address already exists on the customer (idempotent).
  IF EXISTS (
    SELECT 1 FROM public.customer_addresses ca
    WHERE ca.customer_id = v_bridge
      AND COALESCE(ca.label,'')        = COALESCE(NEW.label,'')
      AND COALESCE(ca.building_no,'')  = COALESCE(NEW.building,'')
      AND COALESCE(ca.street_no,'')    = COALESCE(NEW.street,'')
      AND COALESCE(ca.zone_no,'')      = COALESCE(NEW.zone,'')
      AND ca.lat IS NOT DISTINCT FROM NEW.lat
      AND ca.lng IS NOT DISTINCT FROM NEW.lng
  ) THEN
    RETURN NEW;
  END IF;

  v_primary := COALESCE(NEW.is_primary, false)
               AND NOT EXISTS (SELECT 1 FROM public.customer_addresses ca
                               WHERE ca.customer_id = v_bridge AND ca.is_primary);

  INSERT INTO public.customer_addresses
    (customer_id, label, address_type, unit_no, building_no, street_no, zone_no,
     lat, lng, is_primary, created_at, waze_link, is_geocoded, tags)
  VALUES (v_bridge, NEW.label,
     CASE WHEN NEW.address_type IN ('blue-plate','google-coords')
          THEN NEW.address_type::address_type ELSE 'blue-plate'::address_type END,
     NEW.unit, NEW.building, NEW.street, NEW.zone,
     NEW.lat, NEW.lng, v_primary, COALESCE(NEW.created_at, now()),
     NEW.waze_link, NEW.is_geocoded, NEW.tags);

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sca_mirror_customer_address ON public.service_customer_addresses;
CREATE TRIGGER trg_sca_mirror_customer_address
  AFTER INSERT ON public.service_customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.sca_mirror_customer_address();

-- One-time backfill: mirror any existing service address (for a bridged customer) that isn't on the
-- customers side yet. Idempotent via the same NOT EXISTS match; non-primary to avoid bulk primary clashes.
INSERT INTO public.customer_addresses
  (customer_id, label, address_type, unit_no, building_no, street_no, zone_no,
   lat, lng, is_primary, created_at, waze_link, is_geocoded, tags)
SELECT sc.customer_id, sca.label,
   CASE WHEN sca.address_type IN ('blue-plate','google-coords')
        THEN sca.address_type::address_type ELSE 'blue-plate'::address_type END,
   sca.unit, sca.building, sca.street, sca.zone,
   sca.lat, sca.lng, false, COALESCE(sca.created_at, now()),
   sca.waze_link, sca.is_geocoded, sca.tags
FROM public.service_customer_addresses sca
JOIN public.service_customers sc ON sc.id = sca.customer_id
WHERE sc.customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.customer_addresses ca
    WHERE ca.customer_id = sc.customer_id
      AND COALESCE(ca.label,'')       = COALESCE(sca.label,'')
      AND COALESCE(ca.building_no,'') = COALESCE(sca.building,'')
      AND COALESCE(ca.street_no,'')   = COALESCE(sca.street,'')
      AND COALESCE(ca.zone_no,'')     = COALESCE(sca.zone,'')
      AND ca.lat IS NOT DISTINCT FROM sca.lat
      AND ca.lng IS NOT DISTINCT FROM sca.lng
  );

COMMIT;
