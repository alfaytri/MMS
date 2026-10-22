-- Customer consolidation — Stage 2: match service_customers -> customers by phone, then
-- bridge matched / create new for unmatched, copying phones + addresses into the customer
-- satellites. Idempotent (only touches service_customers with customer_id IS NULL). New
-- customers are created UNTAGGED (is_sales_customer = false). Ambiguous matches (a service
-- customer whose phone hits >1 distinct customer) are left unbridged for owner review.
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
-- Backward-compatible: service_customers + its satellites remain the source of truth; this
-- only fills the bridge + mirrors the data into customers.

-- A) Auto-bridge the unambiguous single-candidate phone matches (last-8-digits key).
WITH cand AS (
  SELECT DISTINCT sc.id AS sc_id, c.id AS cust_id
  FROM service_customers sc
  JOIN service_customer_phones scp ON scp.customer_id = sc.id
  JOIN customer_phones cp
    ON right(regexp_replace(cp.phone, '\D', '', 'g'), 8) = right(regexp_replace(scp.phone, '\D', '', 'g'), 8)
  JOIN customers c ON c.id = cp.customer_id
  WHERE sc.customer_id IS NULL
),
single AS (
  SELECT sc_id, min(cust_id::text)::uuid AS cust_id
  FROM cand GROUP BY sc_id HAVING count(*) = 1
)
UPDATE service_customers sc SET customer_id = s.cust_id
FROM single s WHERE sc.id = s.sc_id;

-- B) Create a new (untagged) customer for each still-unbridged, non-ambiguous service customer;
--    copy its phones + addresses into the customer satellites.
DO $mig$
DECLARE
  r RECORD;
  new_id uuid;
  n_candidates int;
BEGIN
  FOR r IN SELECT * FROM service_customers WHERE customer_id IS NULL LOOP
    SELECT count(DISTINCT cp.customer_id) INTO n_candidates
    FROM service_customer_phones scp
    JOIN customer_phones cp
      ON right(regexp_replace(cp.phone, '\D', '', 'g'), 8) = right(regexp_replace(scp.phone, '\D', '', 'g'), 8)
    WHERE scp.customer_id = r.id;

    IF n_candidates > 1 THEN
      CONTINUE;  -- ambiguous: leave unbridged, owner reviews
    END IF;

    INSERT INTO customers (name, name_ar, is_sales_customer, is_active, entity_type)
    VALUES (r.name, r.name_ar, false, true,
      CASE WHEN lower(COALESCE(r.customer_type, '')) IN ('business','company','corporate')
           THEN 'business'::customer_entity_type
           ELSE 'individual'::customer_entity_type END)
    RETURNING id INTO new_id;

    UPDATE service_customers SET customer_id = new_id WHERE id = r.id;

    INSERT INTO customer_phones (customer_id, phone, label, is_primary, created_at)
    SELECT new_id, phone, label, is_primary, created_at
    FROM service_customer_phones WHERE customer_id = r.id;

    INSERT INTO customer_addresses
      (customer_id, label, address_type, unit_no, building_no, street_no, zone_no,
       lat, lng, is_primary, created_at, waze_link, is_geocoded, tags)
    SELECT new_id, label,
       CASE WHEN address_type IN ('blue-plate','google-coords')
            THEN address_type::address_type ELSE 'blue-plate'::address_type END,
       unit, building, street, zone,
       lat, lng, is_primary, created_at, waze_link, is_geocoded, tags
    FROM service_customer_addresses WHERE customer_id = r.id;
  END LOOP;
END
$mig$;
