-- Storage cascade — landed_cost_lines.bill_path.
-- Bucket: lc-bills (private). Column stores the raw path.
--
-- Belt-and-braces backup to the client-side atomic replace shipped in
-- storage-audit §2C — this trigger catches admin/API-level UPDATEs
-- and row deletes.

CREATE OR REPLACE FUNCTION public.trg_cleanup_landed_cost_bill_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM storage_delete_object('lc-bills', OLD.bill_path, 'landed_cost_lines', OLD.id::text);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS cleanup_landed_cost_bill_after_delete ON public.landed_cost_lines;
CREATE TRIGGER cleanup_landed_cost_bill_after_delete
  AFTER DELETE ON public.landed_cost_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_landed_cost_bill_after_delete();

CREATE OR REPLACE FUNCTION public.trg_cleanup_landed_cost_bill_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.bill_path IS DISTINCT FROM NEW.bill_path AND OLD.bill_path IS NOT NULL THEN
    PERFORM storage_delete_object('lc-bills', OLD.bill_path, 'landed_cost_lines', OLD.id::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cleanup_landed_cost_bill_after_update ON public.landed_cost_lines;
CREATE TRIGGER cleanup_landed_cost_bill_after_update
  AFTER UPDATE OF bill_path ON public.landed_cost_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_landed_cost_bill_after_update();
