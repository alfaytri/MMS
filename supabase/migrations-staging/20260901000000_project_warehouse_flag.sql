-- Project warehouse flag — designate ONE custody warehouse as the Projects home.
--
-- A "project" is a virtual/custody warehouse that carries a project number +
-- disciplines + milestones (consumed against). Instead of a hardcoded "Projects"
-- warehouse plus a separate, unstructured custody-Projects tab, the operator
-- toggles a custody warehouse as THE projects warehouse: the Warehouse -> Projects
-- feature (New Project + disciplines + milestones) targets it, and it drops out of
-- the Custody Locations page tabs.
--
-- STRICTLY ONE: a BEFORE trigger clears the flag on every other warehouse whenever
-- one is set (so toggling "moves" the designation), and a partial unique index is
-- a concurrency backstop. The existing "Projects" custody warehouse is flagged so
-- today's projects keep working.

ALTER TABLE public.warehouses
  ADD COLUMN is_project_warehouse boolean NOT NULL DEFAULT false;

-- Keep at most one flagged warehouse. BEFORE a row is written as the project
-- warehouse, clear the flag on every other warehouse. SECURITY DEFINER so the
-- internal "clear others" write is never blocked by the caller's RLS. Trigger
-- firing does not check EXECUTE, so revoking PUBLIC is safe (defense-in-depth).
CREATE OR REPLACE FUNCTION public._enforce_single_project_warehouse()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_project_warehouse THEN
    UPDATE public.warehouses
    SET    is_project_warehouse = false
    WHERE  is_project_warehouse AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._enforce_single_project_warehouse() FROM PUBLIC;

CREATE TRIGGER trg_single_project_warehouse
  BEFORE INSERT OR UPDATE OF is_project_warehouse ON public.warehouses
  FOR EACH ROW
  WHEN (NEW.is_project_warehouse)
  EXECUTE FUNCTION public._enforce_single_project_warehouse();

-- Flag the existing "Projects" custody warehouse (exactly one) so today's
-- projects keep targeting it. The trigger keeps it the only flagged one.
UPDATE public.warehouses
SET    is_project_warehouse = true
WHERE  id = (
  SELECT id FROM public.warehouses
  WHERE warehouse_kind = 'custody' AND name = 'Projects'
  ORDER BY created_at
  LIMIT 1
);

-- Concurrency backstop for the single-flag invariant (at most one true row).
CREATE UNIQUE INDEX warehouses_one_project_wh
  ON public.warehouses (is_project_warehouse)
  WHERE is_project_warehouse;

NOTIFY pgrst, 'reload schema';
