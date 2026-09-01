-- 20261045000000_tool_scrap_approval_trigger.sql  (Phase 2, Task 2)
--
-- Completes (or releases) a gated tool scrap when its write_off adjustment is
-- decided. The tool RPCs (Task 3) create a pending_approval write_off with
-- tool_unit_id set and the unit left pending_scrap=true (NOT retired). This
-- AFTER UPDATE OF status trigger reacts to the approval chain:
--   * approved (full-chain completion AND force-approve both flip status to
--     'approved' via approve_stock_adjustment_inventory) -> retire the unit for
--     real: close any open assignment, set status='retired', clear custody,
--     drop the pending_scrap lock.
--   * rejected (action_stock_adjustment_step sets 'rejected') -> just release
--     the lock; the unit returns to its prior (maintenance/etc.) state.
-- approve_stock_adjustment_inventory books the P&L write-off on the same update,
-- so cost and the unit stay consistent. Coexists with trg_audit_stock_adjustments
-- (alphabetical fire order; no conflict). Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public._apply_tool_scrap_on_adjustment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.tool_unit_id IS NULL THEN RETURN NEW; END IF;

  -- Approved: retire the unit now.
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.tool_unit_assignments
      SET released_at = COALESCE(released_at, now()), release_reason = COALESCE(release_reason, 'scrapped')
      WHERE unit_id = NEW.tool_unit_id AND released_at IS NULL;
    UPDATE public.tool_asset_units
      SET status = 'retired', current_custody_location_id = NULL, pending_scrap = false
      WHERE id = NEW.tool_unit_id;

  -- Rejected: release the lock; the unit returns to its prior state.
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    UPDATE public.tool_asset_units SET pending_scrap = false WHERE id = NEW.tool_unit_id;
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_tool_scrap_on_adjustment ON public.stock_adjustments;
CREATE TRIGGER trg_tool_scrap_on_adjustment
  AFTER UPDATE OF status ON public.stock_adjustments
  FOR EACH ROW EXECUTE FUNCTION public._apply_tool_scrap_on_adjustment();

NOTIFY pgrst, 'reload schema';
