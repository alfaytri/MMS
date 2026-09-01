-- Safe warehouse delete. The UI "Delete warehouse" ran a bare
-- DELETE on warehouses, which the warehouse_sub_containers → warehouses FK
-- (RESTRICT) blocks whenever any sub-container row still exists — even an
-- inactive one — producing a raw FK error with no way to remove an empty
-- duplicate warehouse from the UI. Deleting the sub-containers client-side
-- first doesn't help either: warehouse_sub_containers carries a RESTRICTIVE
-- division-scope DELETE policy, so an admin viewing a different division than
-- the sub-container's cannot delete it at all.
--
-- This SECURITY DEFINER RPC bypasses the division-scope policies (clearing an
-- empty warehouse must not depend on which division tab is active) but refuses
-- when the warehouse or any of its sub-containers still carries real stock or
-- history: it counts rows in every RESTRICT / NO ACTION child of warehouses /
-- warehouse_sub_containers and raises a friendly error naming what blocks it.
-- SET NULL / CASCADE children (item/category defaults, reorder points,
-- responsible persons, item-request dests) resolve themselves and never block.

CREATE OR REPLACE FUNCTION public.delete_warehouse(p_warehouse_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub_ids uuid[];
  r  record;
  n  bigint;
  blockers text[] := '{}';
BEGIN
  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'A warehouse id is required.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM warehouses WHERE id = p_warehouse_id) THEN
    RAISE EXCEPTION 'Warehouse not found (it may already have been deleted).';
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_sub_ids
    FROM warehouse_sub_containers WHERE warehouse_id = p_warehouse_id;

  -- Refuse if any RESTRICT / NO ACTION child (real stock or history) points at
  -- the warehouse or any of its sub-containers. The self-FK
  -- (warehouse_sub_containers.warehouse_id) is excluded — we delete those rows
  -- ourselves below.
  FOR r IN
    SELECT tc.table_name AS c_tab, kcu.column_name AS c_col, ccu.table_name AS p_tab
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name IN ('warehouses','warehouse_sub_containers')
      AND rc.delete_rule IN ('RESTRICT','NO ACTION')
      AND NOT (tc.table_name = 'warehouse_sub_containers' AND kcu.column_name = 'warehouse_id')
  LOOP
    IF r.p_tab = 'warehouses' THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.c_tab, r.c_col)
        INTO n USING p_warehouse_id;
    ELSIF cardinality(v_sub_ids) > 0 THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = ANY($1)', r.c_tab, r.c_col)
        INTO n USING v_sub_ids;
    ELSE
      n := 0;
    END IF;
    IF n > 0 THEN
      blockers := blockers || format('%s: %s', r.c_tab, n);
    END IF;
  END LOOP;

  IF cardinality(blockers) > 0 THEN
    RAISE EXCEPTION 'This warehouse still has stock or history and can''t be deleted (%). Move or clear those records first.',
      array_to_string(blockers, ', ');
  END IF;

  DELETE FROM warehouse_sub_containers WHERE warehouse_id = p_warehouse_id;
  DELETE FROM warehouses              WHERE id           = p_warehouse_id;
END;
$function$;

-- SECDEF functions default EXECUTE to PUBLIC; keep the authenticated-only
-- posture (matches the existing authenticated 'delete warehouses' RLS policy —
-- same audience, but now guarded against deleting a warehouse that holds stock).
REVOKE EXECUTE ON FUNCTION public.delete_warehouse(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_warehouse(uuid) TO authenticated, service_role;
