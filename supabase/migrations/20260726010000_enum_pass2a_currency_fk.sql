-- Enum Conversion Pass 2a: Currency FK (pilot)
--
-- Adds `currency_id uuid REFERENCES currencies(id)` alongside the existing
-- text `currency` / `default_currency` columns on 8 tables. Backfills from
-- the text value via join on `currencies.code`, then installs a BEFORE
-- INSERT/UPDATE trigger that keeps the FK in sync when app code writes only
-- the text column.
--
-- App code is intentionally not modified: this migration is additive and
-- non-breaking. A follow-up pass will migrate writers to the FK and drop the
-- text columns once all call sites are updated.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Pre-flight: verify every existing text value maps to a currencies row
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(DISTINCT src.code, ', ') INTO bad
  FROM (
    SELECT default_currency AS code FROM public.companies
    UNION SELECT default_currency FROM public.company_divisions
    UNION SELECT currency FROM public.landed_costs                WHERE currency IS NOT NULL
    UNION SELECT currency FROM public.landed_cost_lines
    UNION SELECT currency FROM public.payments                    WHERE currency IS NOT NULL
    UNION SELECT currency FROM public.purchase_orders             WHERE currency IS NOT NULL
    UNION SELECT currency FROM public.po_versions                 WHERE currency IS NOT NULL
    UNION SELECT currency FROM public.po_rfq_quotes               WHERE currency IS NOT NULL
    UNION SELECT currency FROM public.sale_orders                 WHERE currency IS NOT NULL
  ) src
  LEFT JOIN public.currencies c ON c.code = src.code
  WHERE c.id IS NULL;

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Currency values with no matching currencies.code row: %', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Add nullable currency_id FK columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.companies           ADD COLUMN IF NOT EXISTS currency_id uuid REFERENCES public.currencies(id);
ALTER TABLE public.company_divisions   ADD COLUMN IF NOT EXISTS currency_id uuid REFERENCES public.currencies(id);
ALTER TABLE public.landed_costs        ADD COLUMN IF NOT EXISTS currency_id uuid REFERENCES public.currencies(id);
ALTER TABLE public.landed_cost_lines   ADD COLUMN IF NOT EXISTS currency_id uuid REFERENCES public.currencies(id);
ALTER TABLE public.payments            ADD COLUMN IF NOT EXISTS currency_id uuid REFERENCES public.currencies(id);
ALTER TABLE public.purchase_orders     ADD COLUMN IF NOT EXISTS currency_id uuid REFERENCES public.currencies(id);
ALTER TABLE public.po_versions         ADD COLUMN IF NOT EXISTS currency_id uuid REFERENCES public.currencies(id);
ALTER TABLE public.po_rfq_quotes       ADD COLUMN IF NOT EXISTS currency_id uuid REFERENCES public.currencies(id);
ALTER TABLE public.sale_orders         ADD COLUMN IF NOT EXISTS currency_id uuid REFERENCES public.currencies(id);

-- ---------------------------------------------------------------------------
-- 3. Backfill via join on currencies.code
-- ---------------------------------------------------------------------------

UPDATE public.companies         t SET currency_id = c.id FROM public.currencies c WHERE c.code = t.default_currency AND t.currency_id IS NULL;
UPDATE public.company_divisions t SET currency_id = c.id FROM public.currencies c WHERE c.code = t.default_currency AND t.currency_id IS NULL;
UPDATE public.landed_costs      t SET currency_id = c.id FROM public.currencies c WHERE c.code = t.currency          AND t.currency_id IS NULL;
UPDATE public.landed_cost_lines t SET currency_id = c.id FROM public.currencies c WHERE c.code = t.currency          AND t.currency_id IS NULL;
UPDATE public.payments          t SET currency_id = c.id FROM public.currencies c WHERE c.code = t.currency          AND t.currency_id IS NULL;
UPDATE public.purchase_orders   t SET currency_id = c.id FROM public.currencies c WHERE c.code = t.currency          AND t.currency_id IS NULL;
UPDATE public.po_versions       t SET currency_id = c.id FROM public.currencies c WHERE c.code = t.currency          AND t.currency_id IS NULL;
UPDATE public.po_rfq_quotes     t SET currency_id = c.id FROM public.currencies c WHERE c.code = t.currency          AND t.currency_id IS NULL;
UPDATE public.sale_orders       t SET currency_id = c.id FROM public.currencies c WHERE c.code = t.currency          AND t.currency_id IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Verify backfill completeness on NOT NULL text columns
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT COUNT(*) INTO n FROM public.companies         WHERE currency_id IS NULL;                                   IF n > 0 THEN RAISE EXCEPTION 'companies.currency_id has % NULLs after backfill', n; END IF;
  SELECT COUNT(*) INTO n FROM public.company_divisions WHERE currency_id IS NULL;                                   IF n > 0 THEN RAISE EXCEPTION 'company_divisions.currency_id has % NULLs after backfill', n; END IF;
  SELECT COUNT(*) INTO n FROM public.landed_cost_lines WHERE currency_id IS NULL;                                   IF n > 0 THEN RAISE EXCEPTION 'landed_cost_lines.currency_id has % NULLs after backfill', n; END IF;
  SELECT COUNT(*) INTO n FROM public.payments          WHERE currency_id IS NULL AND currency IS NOT NULL;          IF n > 0 THEN RAISE EXCEPTION 'payments.currency_id has % NULLs after backfill', n; END IF;
  SELECT COUNT(*) INTO n FROM public.po_versions       WHERE currency_id IS NULL AND currency IS NOT NULL;          IF n > 0 THEN RAISE EXCEPTION 'po_versions.currency_id has % NULLs after backfill', n; END IF;
  SELECT COUNT(*) INTO n FROM public.po_rfq_quotes     WHERE currency_id IS NULL AND currency IS NOT NULL;          IF n > 0 THEN RAISE EXCEPTION 'po_rfq_quotes.currency_id has % NULLs after backfill', n; END IF;
  SELECT COUNT(*) INTO n FROM public.sale_orders       WHERE currency_id IS NULL AND currency IS NOT NULL;          IF n > 0 THEN RAISE EXCEPTION 'sale_orders.currency_id has % NULLs after backfill', n; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Sync triggers: keep currency_id aligned when app code writes only text
--    (or vice versa). Two trigger functions — one per text column name — so
--    the function body is simple, static SQL with no dynamic column access.
-- ---------------------------------------------------------------------------

-- 5a. For tables whose text column is `currency`
CREATE OR REPLACE FUNCTION public._sync_currency_id_from_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.currency_id IS NULL AND NEW.currency IS NOT NULL THEN
    SELECT id INTO NEW.currency_id FROM public.currencies WHERE code = NEW.currency;
    IF NEW.currency_id IS NULL THEN
      RAISE EXCEPTION 'currency code % has no matching currencies row', NEW.currency;
    END IF;
  ELSIF NEW.currency_id IS NOT NULL AND NEW.currency IS NULL THEN
    SELECT code INTO NEW.currency FROM public.currencies WHERE id = NEW.currency_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 5b. For tables whose text column is `default_currency`
CREATE OR REPLACE FUNCTION public._sync_currency_id_from_default_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.currency_id IS NULL AND NEW.default_currency IS NOT NULL THEN
    SELECT id INTO NEW.currency_id FROM public.currencies WHERE code = NEW.default_currency;
    IF NEW.currency_id IS NULL THEN
      RAISE EXCEPTION 'currency code % has no matching currencies row', NEW.default_currency;
    END IF;
  ELSIF NEW.currency_id IS NOT NULL AND NEW.default_currency IS NULL THEN
    SELECT code INTO NEW.default_currency FROM public.currencies WHERE id = NEW.currency_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger bindings
DROP TRIGGER IF EXISTS sync_currency_id ON public.companies;
CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_default_currency();

DROP TRIGGER IF EXISTS sync_currency_id ON public.company_divisions;
CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.company_divisions
  FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_default_currency();

DROP TRIGGER IF EXISTS sync_currency_id ON public.landed_costs;
CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.landed_costs
  FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();

DROP TRIGGER IF EXISTS sync_currency_id ON public.landed_cost_lines;
CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.landed_cost_lines
  FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();

DROP TRIGGER IF EXISTS sync_currency_id ON public.payments;
CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();

DROP TRIGGER IF EXISTS sync_currency_id ON public.purchase_orders;
CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();

DROP TRIGGER IF EXISTS sync_currency_id ON public.po_versions;
CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.po_versions
  FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();

DROP TRIGGER IF EXISTS sync_currency_id ON public.po_rfq_quotes;
CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.po_rfq_quotes
  FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();

DROP TRIGGER IF EXISTS sync_currency_id ON public.sale_orders;
CREATE TRIGGER sync_currency_id BEFORE INSERT OR UPDATE ON public.sale_orders
  FOR EACH ROW EXECUTE FUNCTION public._sync_currency_id_from_currency();

COMMIT;
