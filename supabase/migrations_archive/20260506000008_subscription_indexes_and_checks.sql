-- supabase/migrations/20260506000008_subscription_indexes_and_checks.sql
-- FK indexes and additional CHECK constraints missed in initial migration.

-- ── FK indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sps_service_id
  ON subscription_package_services(service_id);

CREATE INDEX IF NOT EXISTS idx_cs_package_id
  ON customer_subscriptions(package_id);

CREATE INDEX IF NOT EXISTS idx_cs_customer_id
  ON customer_subscriptions(customer_id);

CREATE INDEX IF NOT EXISTS idx_sul_subscription_id
  ON subscription_usage_log(subscription_id);

-- ── Additional CHECK constraints ──────────────────────────────────────────────
ALTER TABLE customer_subscriptions
  ADD CONSTRAINT chk_cs_date_range CHECK (end_date >= start_date);

ALTER TABLE subscription_packages
  ADD CONSTRAINT chk_sp_duration CHECK (duration_months >= 1);
