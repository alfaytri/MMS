-- Storage cascade — consumption_entries.attachments (text[]).
-- Bucket: consumption-attachments (private).
--
-- DELETE trigger nukes every element. UPDATE trigger EXCEPT-diffs and
-- deletes only the paths removed by the update.
-- Consumption is cancel-only in normal use; the DELETE trigger covers
-- admin cleanup / test data purge.

CREATE OR REPLACE FUNCTION public.trg_cleanup_consumption_attachments_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE p text;
BEGIN
  IF OLD.attachments IS NULL THEN RETURN OLD; END IF;
  FOREACH p IN ARRAY OLD.attachments LOOP
    PERFORM storage_delete_object('consumption-attachments', p, 'consumption_entries', OLD.id::text);
  END LOOP;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS cleanup_consumption_attachments_after_delete ON public.consumption_entries;
CREATE TRIGGER cleanup_consumption_attachments_after_delete
  AFTER DELETE ON public.consumption_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_consumption_attachments_after_delete();

CREATE OR REPLACE FUNCTION public.trg_cleanup_consumption_attachments_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed text[];
  p       text;
BEGIN
  IF OLD.attachments IS NULL THEN RETURN NEW; END IF;

  removed := ARRAY(
    SELECT unnest(OLD.attachments)
    EXCEPT
    SELECT unnest(COALESCE(NEW.attachments, ARRAY[]::text[]))
  );

  IF array_length(removed, 1) IS NULL THEN RETURN NEW; END IF;

  FOREACH p IN ARRAY removed LOOP
    PERFORM storage_delete_object('consumption-attachments', p, 'consumption_entries', OLD.id::text);
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cleanup_consumption_attachments_after_update ON public.consumption_entries;
CREATE TRIGGER cleanup_consumption_attachments_after_update
  AFTER UPDATE OF attachments ON public.consumption_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_consumption_attachments_after_update();
