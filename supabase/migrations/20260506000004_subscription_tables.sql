-- supabase/migrations/20260506000004_subscription_tables.sql

-- Reusable updated_at trigger function (skip if already exists)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── subscription_packages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_packages (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text          NOT NULL,
  name_ar            text,
  description        text,
  discount_percent   numeric(5,2)  NOT NULL DEFAULT 0
                       CHECK (discount_percent >= 0 AND discount_percent <= 100),
  initial_fee        numeric(10,2) NOT NULL DEFAULT 0
                       CHECK (initial_fee >= 0),
  duration_months    int           NOT NULL DEFAULT 12,
  priority_response  text          NOT NULL DEFAULT 'none'
                       CHECK (priority_response IN ('none','24_48hr','under_24hr')),
  response_hours     int           CHECK (response_hours IS NULL OR (response_hours >= 1 AND response_hours <= 168)),
  auto_renew_default boolean       NOT NULL DEFAULT true,
  is_active          boolean       NOT NULL DEFAULT true,
  created_by_name    text,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_subscription_packages_updated_at ON subscription_packages;
CREATE TRIGGER trg_subscription_packages_updated_at
  BEFORE UPDATE ON subscription_packages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── subscription_package_services ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_package_services (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id        uuid          NOT NULL REFERENCES subscription_packages(id) ON DELETE CASCADE,
  service_id        uuid          NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  discount_override numeric(5,2)  CHECK (discount_override IS NULL OR (discount_override >= 0 AND discount_override <= 100)),
  UNIQUE (package_id, service_id)
);

-- ── customer_subscriptions ────────────────────────────────────────────────
-- customer_id intentionally has no FK constraint here — the customers table
-- FK will be wired when the customers module confirms its primary key column.
CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               uuid          NOT NULL,
  package_id                uuid          NOT NULL REFERENCES subscription_packages(id),
  price_paid                numeric(10,2) NOT NULL,
  discount_percent_snapshot numeric(5,2)  NOT NULL,
  start_date                date          NOT NULL,
  end_date                  date          NOT NULL,
  auto_renew                boolean       NOT NULL DEFAULT true,
  status                    text          NOT NULL DEFAULT 'active'
                              CHECK (status IN ('pending_payment','active','expired','cancelled')),
  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_customer_subscriptions_updated_at ON customer_subscriptions;
CREATE TRIGGER trg_customer_subscriptions_updated_at
  BEFORE UPDATE ON customer_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── subscription_usage_log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_usage_log (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid          NOT NULL REFERENCES customer_subscriptions(id),
  order_id         uuid          NOT NULL,
  service_id       uuid          NOT NULL,
  discount_applied numeric(5,2)  NOT NULL,
  created_at       timestamptz   NOT NULL DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE subscription_packages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_package_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_usage_log       ENABLE ROW LEVEL SECURITY;

-- service_role bypass
CREATE POLICY "service_role_all" ON subscription_packages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON subscription_package_services
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON customer_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON subscription_usage_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated read
CREATE POLICY "authenticated_read" ON subscription_packages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON subscription_package_services
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON customer_subscriptions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON subscription_usage_log
  FOR SELECT TO authenticated USING (true);
