-- supabase/migrations/20260506000005_subscription_packages_view.sql

-- Both counts live in Postgres — zero client-side aggregation.
CREATE OR REPLACE VIEW subscription_packages_with_counts AS
SELECT
  sp.*,
  COALESCE(sub_cnt.active_subscribers, 0)::int AS subscriber_count,
  COALESCE(svc_cnt.service_count,       0)::int AS service_count
FROM subscription_packages sp
LEFT JOIN (
  SELECT package_id, COUNT(*)::int AS active_subscribers
  FROM customer_subscriptions
  WHERE status = 'active'
  GROUP BY package_id
) sub_cnt ON sub_cnt.package_id = sp.id
LEFT JOIN (
  SELECT package_id, COUNT(*)::int AS service_count
  FROM subscription_package_services
  GROUP BY package_id
) svc_cnt ON svc_cnt.package_id = sp.id;

GRANT SELECT ON subscription_packages_with_counts TO authenticated;
GRANT SELECT ON subscription_packages_with_counts TO service_role;
