-- Storage cascade — companies + company_divisions logo/stamp.
-- Bucket: division-assets (public). Columns store full public URLs;
-- storage_delete_object strips the URL to an object path.

-- ── companies ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_cleanup_company_assets_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM storage_delete_object('division-assets', OLD.logo_url,  'companies', OLD.id::text);
  PERFORM storage_delete_object('division-assets', OLD.stamp_url, 'companies', OLD.id::text);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS cleanup_company_assets_after_delete ON public.companies;
CREATE TRIGGER cleanup_company_assets_after_delete
  AFTER DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_company_assets_after_delete();

CREATE OR REPLACE FUNCTION public.trg_cleanup_company_assets_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.logo_url  IS DISTINCT FROM NEW.logo_url  AND OLD.logo_url  IS NOT NULL THEN
    PERFORM storage_delete_object('division-assets', OLD.logo_url,  'companies', OLD.id::text);
  END IF;
  IF OLD.stamp_url IS DISTINCT FROM NEW.stamp_url AND OLD.stamp_url IS NOT NULL THEN
    PERFORM storage_delete_object('division-assets', OLD.stamp_url, 'companies', OLD.id::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cleanup_company_assets_after_update ON public.companies;
CREATE TRIGGER cleanup_company_assets_after_update
  AFTER UPDATE OF logo_url, stamp_url ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_company_assets_after_update();

-- ── company_divisions ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_cleanup_division_assets_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM storage_delete_object('division-assets', OLD.logo_url,  'company_divisions', OLD.id::text);
  PERFORM storage_delete_object('division-assets', OLD.stamp_url, 'company_divisions', OLD.id::text);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS cleanup_division_assets_after_delete ON public.company_divisions;
CREATE TRIGGER cleanup_division_assets_after_delete
  AFTER DELETE ON public.company_divisions
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_division_assets_after_delete();

CREATE OR REPLACE FUNCTION public.trg_cleanup_division_assets_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.logo_url  IS DISTINCT FROM NEW.logo_url  AND OLD.logo_url  IS NOT NULL THEN
    PERFORM storage_delete_object('division-assets', OLD.logo_url,  'company_divisions', OLD.id::text);
  END IF;
  IF OLD.stamp_url IS DISTINCT FROM NEW.stamp_url AND OLD.stamp_url IS NOT NULL THEN
    PERFORM storage_delete_object('division-assets', OLD.stamp_url, 'company_divisions', OLD.id::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cleanup_division_assets_after_update ON public.company_divisions;
CREATE TRIGGER cleanup_division_assets_after_update
  AFTER UPDATE OF logo_url, stamp_url ON public.company_divisions
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_division_assets_after_update();
