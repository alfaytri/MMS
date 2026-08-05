-- Storage cascade — stock_adjustments.photo_urls (text[]).
-- Bucket: adjustment-photos (private).
--
-- Modern rows store storage paths; very old rows store full 365-day
-- signed URLs. storage_delete_object handles both shapes.
--
-- DELETE trigger nukes every element. UPDATE trigger does an EXCEPT-diff
-- so only elements removed by the update are deleted.

CREATE OR REPLACE FUNCTION public.trg_cleanup_stock_adjustment_photos_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE p text;
BEGIN
  IF OLD.photo_urls IS NULL THEN RETURN OLD; END IF;
  FOREACH p IN ARRAY OLD.photo_urls LOOP
    PERFORM storage_delete_object('adjustment-photos', p, 'stock_adjustments', OLD.id::text);
  END LOOP;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS cleanup_stock_adjustment_photos_after_delete ON public.stock_adjustments;
CREATE TRIGGER cleanup_stock_adjustment_photos_after_delete
  AFTER DELETE ON public.stock_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_stock_adjustment_photos_after_delete();

CREATE OR REPLACE FUNCTION public.trg_cleanup_stock_adjustment_photos_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed text[];
  p       text;
BEGIN
  IF OLD.photo_urls IS NULL THEN RETURN NEW; END IF;

  removed := ARRAY(
    SELECT unnest(OLD.photo_urls)
    EXCEPT
    SELECT unnest(COALESCE(NEW.photo_urls, ARRAY[]::text[]))
  );

  IF array_length(removed, 1) IS NULL THEN RETURN NEW; END IF;

  FOREACH p IN ARRAY removed LOOP
    PERFORM storage_delete_object('adjustment-photos', p, 'stock_adjustments', OLD.id::text);
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cleanup_stock_adjustment_photos_after_update ON public.stock_adjustments;
CREATE TRIGGER cleanup_stock_adjustment_photos_after_update
  AFTER UPDATE OF photo_urls ON public.stock_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_stock_adjustment_photos_after_update();
