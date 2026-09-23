-- Same class of bug as 20261121: rpc_upsert_discipline branched on p_id IS NULL,
-- but useUpsertDiscipline passes a client-generated uuid (crypto.randomUUID())
-- as p_id on CREATE, so "Add discipline" would raise "P0001 ... not found".
-- Rewrite as a true upsert honoring the client id (INSERT ... ON CONFLICT (id)
-- DO UPDATE), matching the warehouse_sub_container pattern's intent.
CREATE OR REPLACE FUNCTION public.rpc_upsert_discipline(
  p_id          uuid,
  p_division_id uuid,
  p_name        text,
  p_prefix      text    DEFAULT NULL::text,
  p_sort_order  integer DEFAULT 0
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_uid uuid := public._current_user_data_id();
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.disciplines (id, division_id, name, prefix, sort_order, created_by)
  VALUES (COALESCE(p_id, gen_random_uuid()), p_division_id, btrim(p_name),
          nullif(btrim(p_prefix),''), coalesce(p_sort_order,0), v_uid)
  ON CONFLICT (id) DO UPDATE
    SET name       = btrim(p_name),
        prefix     = nullif(btrim(p_prefix),''),
        sort_order = coalesce(p_sort_order,0),
        updated_at = now()
  RETURNING id INTO v_id;   -- division_id is never reassigned on edit

  RETURN v_id;
END $function$;
