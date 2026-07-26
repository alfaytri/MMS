-- Enum Conversion Pass 2b: suppliers.country FK
--
-- Adds `country_id integer REFERENCES country_codes(id)` alongside the
-- existing text `country` column. Backfills via join on
-- `country_codes.name`. Installs a BEFORE INSERT/UPDATE sync trigger so
-- new rows written via the text column auto-populate the FK.
--
-- App code is not modified in this migration. The supplier form already
-- writes country as a name string picked from useCountryCodes — the
-- follow-up will migrate it to write `country_id` directly and eventually
-- drop the text column.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Pre-flight: every non-null suppliers.country must match country_codes.name
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(DISTINCT s.country, ', ') INTO bad
  FROM public.suppliers s
  LEFT JOIN public.country_codes cc ON cc.name = s.country
  WHERE s.country IS NOT NULL
    AND cc.id    IS NULL;

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'suppliers.country values with no matching country_codes.name row: %', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Add country_id FK column
-- ---------------------------------------------------------------------------

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS country_id integer REFERENCES public.country_codes(id);

-- ---------------------------------------------------------------------------
-- 3. Backfill via join on country_codes.name
-- ---------------------------------------------------------------------------

UPDATE public.suppliers s
SET    country_id = cc.id
FROM   public.country_codes cc
WHERE  cc.name = s.country
  AND  s.country_id IS NULL;

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT COUNT(*) INTO n FROM public.suppliers WHERE country_id IS NULL AND country IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'suppliers.country_id has % NULLs after backfill', n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Sync trigger: keep country_id aligned when app code writes only text
--    (and vice versa).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._sync_supplier_country_id_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.country_id IS NULL AND NEW.country IS NOT NULL THEN
    SELECT id INTO NEW.country_id FROM public.country_codes WHERE name = NEW.country;
    IF NEW.country_id IS NULL THEN
      RAISE EXCEPTION 'country name % has no matching country_codes row', NEW.country;
    END IF;
  ELSIF NEW.country_id IS NOT NULL AND NEW.country IS NULL THEN
    SELECT name INTO NEW.country FROM public.country_codes WHERE id = NEW.country_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_supplier_country_id ON public.suppliers;
CREATE TRIGGER sync_supplier_country_id BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public._sync_supplier_country_id_fn();

COMMIT;
