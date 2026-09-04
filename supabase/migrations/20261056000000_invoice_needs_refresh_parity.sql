-- Invoice PDF staleness parity with bills. Today the invoice cache-invalidation
-- trigger only nulls pdf_url (so it silently self-heals on next view) but never
-- sets needs_refresh, so the amber "PDF outdated" ⚠ on the invoices list never
-- fires. Bills set BOTH. Mirror bills exactly:
--   • invoices_invalidate_pdf_cache_fn also flips needs_refresh = TRUE
--   • set_invoice_pdf_url clears needs_refresh = FALSE on (re)generation
BEGIN;

CREATE OR REPLACE FUNCTION public.invoices_invalidate_pdf_cache_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- set_invoice_pdf_url sets this GUC before writing the URL back, so the
  -- trigger lets that write through without re-invalidating.
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.pdf_url       := NULL;
  NEW.needs_refresh := TRUE;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_invoice_pdf_url(p_id uuid, p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.so_invoices SET pdf_url = p_url, needs_refresh = FALSE WHERE id = p_id;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
