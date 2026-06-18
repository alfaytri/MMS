-- supabase/migrations/20260511100000_service_customers.sql
-- Creates three tables for field-service customer data, separate from SO customers table.

-- ── 1. service_customers ──────────────────────────────────────────────────────
CREATE TABLE public.service_customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  name_ar             TEXT,
  legacy_customer_id  UUID,   -- temp: old customers.id for backfill mapping (dropped in Migration B)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. service_customer_phones ────────────────────────────────────────────────
CREATE TABLE public.service_customer_phones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.service_customers(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  label       TEXT,         -- 'mobile' | 'work' | 'home'
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce max one primary phone per customer at the DB level
CREATE UNIQUE INDEX idx_one_primary_phone
  ON public.service_customer_phones (customer_id)
  WHERE (is_primary = true);

-- ── 3. service_customer_addresses ─────────────────────────────────────────────
CREATE TABLE public.service_customer_addresses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES public.service_customers(id) ON DELETE CASCADE,
  address_type TEXT NOT NULL CHECK (address_type IN ('blue-plate', 'google-coords')),
  label        TEXT,
  unit         TEXT,
  building     TEXT,
  street       TEXT,
  zone         TEXT,
  lat          NUMERIC,
  lng          NUMERIC,
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce max one primary address per customer at the DB level
CREATE UNIQUE INDEX idx_one_primary_address
  ON public.service_customer_addresses (customer_id)
  WHERE (is_primary = true);

-- ── 4. updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_service_customers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_service_customers_updated_at
  BEFORE UPDATE ON public.service_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_service_customers_updated_at();

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.service_customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_customer_phones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal_select_service_customers"
  ON public.service_customers FOR SELECT TO authenticated USING (true);

CREATE POLICY "internal_select_service_customer_phones"
  ON public.service_customer_phones FOR SELECT TO authenticated USING (true);

CREATE POLICY "internal_select_service_customer_addresses"
  ON public.service_customer_addresses FOR SELECT TO authenticated USING (true);

CREATE POLICY "internal_write_service_customers"
  ON public.service_customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "internal_write_service_customer_phones"
  ON public.service_customer_phones FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "internal_write_service_customer_addresses"
  ON public.service_customer_addresses FOR ALL TO authenticated USING (true) WITH CHECK (true);
