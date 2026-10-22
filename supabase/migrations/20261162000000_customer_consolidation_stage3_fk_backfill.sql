-- Customer consolidation — Stage 3 (data prerequisite): backfill the core tables' customer_id
-- from the service_customers bridge, so app reads can move from service_customer_id -> customer_id
-- WITHOUT changing which customer resolves for any row. Additive + idempotent (only writes where the
-- value differs from the bridge target); safe to re-run. service_customers + the service_customer_id
-- columns remain intact and authoritative until Stage 5 (backward-compatible).
-- Design: docs/superpowers/specs/2026-10-22-customer-consolidation-design.md
BEGIN;

UPDATE orders o SET customer_id = sc.customer_id
FROM service_customers sc
WHERE o.service_customer_id = sc.id
  AND sc.customer_id IS NOT NULL
  AND o.customer_id IS DISTINCT FROM sc.customer_id;

UPDATE site_visits v SET customer_id = sc.customer_id
FROM service_customers sc
WHERE v.service_customer_id = sc.id
  AND sc.customer_id IS NOT NULL
  AND v.customer_id IS DISTINCT FROM sc.customer_id;

UPDATE order_quotations q SET customer_id = sc.customer_id
FROM service_customers sc
WHERE q.service_customer_id = sc.id
  AND sc.customer_id IS NOT NULL
  AND q.customer_id IS DISTINCT FROM sc.customer_id;

UPDATE contracts c SET customer_id = sc.customer_id
FROM service_customers sc
WHERE c.service_customer_id = sc.id
  AND sc.customer_id IS NOT NULL
  AND c.customer_id IS DISTINCT FROM sc.customer_id;

COMMIT;
