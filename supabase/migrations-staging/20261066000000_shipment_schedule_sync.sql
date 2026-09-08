-- 20261066000000_shipment_schedule_sync.sql
-- Trigger: cache current-planned + actual ETD/ETA onto shipments from the
-- revision log. Current planned = newest (created_at) non-actual revision for a
-- leg; actual = the 'actual' revision. Plan Task 2.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_shipment_schedule_cache(p_shipment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.shipments s SET
    etd = (SELECT date_value FROM public.shipment_schedule_revisions r
            WHERE r.shipment_id = p_shipment_id AND r.leg = 'etd'
              AND r.revision_type IN ('original','updated')
            ORDER BY r.created_at DESC LIMIT 1),
    eta = (SELECT date_value FROM public.shipment_schedule_revisions r
            WHERE r.shipment_id = p_shipment_id AND r.leg = 'eta'
              AND r.revision_type IN ('original','updated')
            ORDER BY r.created_at DESC LIMIT 1),
    etd_actual = (SELECT date_value FROM public.shipment_schedule_revisions r
                   WHERE r.shipment_id = p_shipment_id AND r.leg = 'etd' AND r.revision_type = 'actual' LIMIT 1),
    eta_actual = (SELECT date_value FROM public.shipment_schedule_revisions r
                   WHERE r.shipment_id = p_shipment_id AND r.leg = 'eta' AND r.revision_type = 'actual' LIMIT 1),
    updated_at = now()
  WHERE s.id = p_shipment_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_shipment_schedule_sync_fn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.sync_shipment_schedule_cache(COALESCE(NEW.shipment_id, OLD.shipment_id));
  RETURN NULL;
END $$;

CREATE TRIGGER trg_shipment_schedule_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.shipment_schedule_revisions
  FOR EACH ROW EXECUTE FUNCTION public.trg_shipment_schedule_sync_fn();

NOTIFY pgrst, 'reload schema';
COMMIT;
